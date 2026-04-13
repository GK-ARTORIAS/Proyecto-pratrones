/**
 * ============================================================
 * Tests: Patrón DECORATOR — PriceDecorator
 * ============================================================
 */

import {
  CachingDecorator,
  LoggingDecorator,
  AlertingDecorator,
  RetryDecorator,
  buildPricePipeline,
} from "@/lib/market/PriceDecorator";
import { InAppChannel } from "@/lib/notifications/NotificationBridge";
import { createPriceAdapter, type IPriceEstimator, type PriceQuote } from "@/lib/market/ExternalPriceAdapter";

// ── Mock de IPriceEstimator para tests aislados ───────────────

function makeMockEstimator(pricePerKwh = 0.12, failCount = 0): IPriceEstimator & { calls: number } {
  let callCount = 0;
  let failures  = failCount;
  return {
    calls: 0,
    async getCurrentQuote(): Promise<PriceQuote> {
      callCount++;
      (this as { calls: number }).calls = callCount;
      if (failures > 0) { failures--; throw new Error("Network error"); }
      return {
        source: "SOLAR", pricePerKwh, validForMinutes: 60,
        trend: "STABLE", historicalAvg: 0.11, currency: "USD", fetchedAt: new Date(),
      };
    },
  };
}

// ── Tests de CachingDecorator ─────────────────────────────────

describe("CachingDecorator — Decorator", () => {
  test("implementa IPriceEstimator (Component interface)", async () => {
    const dec = new CachingDecorator(makeMockEstimator());
    expect(typeof dec.getCurrentQuote).toBe("function");
  });

  test("llama al wrapped solo una vez en el TTL", async () => {
    const mock = makeMockEstimator();
    const dec  = new CachingDecorator(mock, 5);
    await dec.getCurrentQuote();
    await dec.getCurrentQuote();
    await dec.getCurrentQuote();
    expect(mock.calls).toBe(1); // solo 1 llamada real
  });

  test("stats reporta hits y misses correctamente", async () => {
    const dec = new CachingDecorator(makeMockEstimator(), 5);
    await dec.getCurrentQuote(); // miss
    await dec.getCurrentQuote(); // hit
    await dec.getCurrentQuote(); // hit
    expect(dec.getStats().hits).toBe(2);
    expect(dec.getStats().misses).toBe(1);
  });

  test("invalidate() fuerza nueva llamada al wrapped", async () => {
    const mock = makeMockEstimator();
    const dec  = new CachingDecorator(mock, 5);
    await dec.getCurrentQuote(); // miss
    dec.invalidate();
    await dec.getCurrentQuote(); // miss de nuevo
    expect(mock.calls).toBe(2);
  });

  test("retorna los mismos datos en cache hit", async () => {
    const dec = new CachingDecorator(makeMockEstimator(0.15), 5);
    const q1  = await dec.getCurrentQuote();
    const q2  = await dec.getCurrentQuote();
    expect(q1.pricePerKwh).toBe(q2.pricePerKwh);
  });
});

// ── Tests de LoggingDecorator ─────────────────────────────────

describe("LoggingDecorator — Decorator", () => {
  test("registra cada consulta en el historial", async () => {
    const dec = new LoggingDecorator(makeMockEstimator());
    await dec.getCurrentQuote();
    await dec.getCurrentQuote();
    expect(dec.getHistory()).toHaveLength(2);
  });

  test("getLatest() retorna la entrada más reciente", async () => {
    const dec = new LoggingDecorator(makeMockEstimator(0.17));
    await dec.getCurrentQuote();
    expect(dec.getLatest()?.price).toBe(0.17);
  });

  test("getHistory()[0] es siempre el más reciente", async () => {
    const dec = new LoggingDecorator(makeMockEstimator());
    const t1  = Date.now();
    await dec.getCurrentQuote();
    await new Promise((r) => setTimeout(r, 10));
    await dec.getCurrentQuote();
    const h = dec.getHistory();
    expect(h[0].timestamp.getTime()).toBeGreaterThanOrEqual(h[1].timestamp.getTime());
  });

  test("respeta maxHistory y no excede el límite", async () => {
    const dec = new LoggingDecorator(makeMockEstimator(), 3);
    for (let i = 0; i < 6; i++) await dec.getCurrentQuote();
    expect(dec.getHistory().length).toBe(3);
  });

  test("clearHistory() vacía el historial", async () => {
    const dec = new LoggingDecorator(makeMockEstimator());
    await dec.getCurrentQuote();
    dec.clearHistory();
    expect(dec.getHistory()).toHaveLength(0);
  });
});

// ── Tests de AlertingDecorator ────────────────────────────────

describe("AlertingDecorator — Decorator (integra con Bridge)", () => {
  beforeEach(() => InAppChannel.getInstance().clear());

  test("dispara alerta si el precio supera el umbral", async () => {
    const dec = new AlertingDecorator(makeMockEstimator(0.20), 0.15);
    await dec.getCurrentQuote();
    expect(InAppChannel.getInstance().getAll().length).toBeGreaterThan(0);
  });

  test("NO dispara alerta si el precio está bajo el umbral", async () => {
    const dec = new AlertingDecorator(makeMockEstimator(0.10), 0.15);
    await dec.getCurrentQuote();
    expect(InAppChannel.getInstance().getAll()).toHaveLength(0);
  });

  test("incrementa getAlertCount() con cada alerta", async () => {
    const dec = new AlertingDecorator(makeMockEstimator(0.20), 0.15, 0, 0); // cooldown=0
    await dec.getCurrentQuote();
    await dec.getCurrentQuote();
    expect(dec.getAlertCount()).toBeGreaterThanOrEqual(1);
  });

  test("aun devuelve la cotización aunque dispare alerta", async () => {
    const dec   = new AlertingDecorator(makeMockEstimator(0.20), 0.15);
    const quote = await dec.getCurrentQuote();
    expect(quote.pricePerKwh).toBe(0.20);
  });
});

// ── Tests de RetryDecorator ───────────────────────────────────

describe("RetryDecorator — Decorator", () => {
  test("devuelve éxito si el wrapped falla 1 vez y luego ok (3 intentos)", async () => {
    const mock = makeMockEstimator(0.12, 1); // falla 1 vez
    const dec  = new RetryDecorator(mock, 3, 0); // 0ms delay para test rápido
    const q    = await dec.getCurrentQuote();
    expect(q.pricePerKwh).toBe(0.12);
    expect(dec.getStats().failures).toBe(1);
  });

  test("lanza error tras agotar todos los intentos", async () => {
    const mock = makeMockEstimator(0.12, 999); // siempre falla
    const dec  = new RetryDecorator(mock, 2, 0);
    await expect(dec.getCurrentQuote()).rejects.toThrow("Falló tras 2 intentos");
  });

  test("no reintenta si el primer intento tiene éxito", async () => {
    const mock = makeMockEstimator(0.12, 0);
    const dec  = new RetryDecorator(mock, 3, 0);
    await dec.getCurrentQuote();
    expect(dec.getStats().totalRetries).toBe(0);
  });
});

// ── Tests de composición (pipeline completo) ──────────────────

describe("buildPricePipeline — Composición de decoradores", () => {
  beforeEach(() => InAppChannel.getInstance().clear());

  test("el pipeline devuelve cotizaciones válidas", async () => {
    const base = createPriceAdapter("OMIE");
    const { estimator } = buildPricePipeline(base, {
      cacheTTLMinutes: 1, spikeThreshold: 0.99, enableLogging: true,
    });
    const quote = await estimator.getCurrentQuote();
    expect(quote).toHaveProperty("pricePerKwh");
    expect(quote.currency).toBe("USD");
  });

  test("el cache del pipeline evita llamadas duplicadas", async () => {
    const base  = createPriceAdapter("ENTSO_E");
    const { estimator, cache } = buildPricePipeline(base, { cacheTTLMinutes: 5 });
    await estimator.getCurrentQuote();
    await estimator.getCurrentQuote();
    await estimator.getCurrentQuote();
    expect(cache.getStats().hits).toBeGreaterThan(0);
  });

  test("el logger del pipeline acumula historial", async () => {
    const base = createPriceAdapter("OCTOPUS");
    const { estimator, logger } = buildPricePipeline(base, { cacheTTLMinutes: 0 });
    // TTL=0 fuerza miss → llama wrapped cada vez
    await estimator.getCurrentQuote();
    expect(logger.getHistory().length).toBeGreaterThanOrEqual(1);
  });
});
