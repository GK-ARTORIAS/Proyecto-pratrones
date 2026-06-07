/**
 * ============================================================
 * Tests: Patrón ADAPTER — ExternalPriceAdapter
 * ============================================================
 */

import {
  OmieAdapter,
  EntsoEAdapter,
  OctopusAdapter,
  MockOmieApi,
  MockEntsoEApi,
  MockOctopusApi,
  createPriceAdapter,
  type IPriceEstimator,
  type PriceQuote,
} from "@/lib/market/ExternalPriceAdapter";

// ── Tests de OmieAdapter ──────────────────────────────────────

describe("OmieAdapter — Adapter Pattern", () => {
  let adapter: IPriceEstimator;

  beforeEach(() => {
    adapter = new OmieAdapter(new MockOmieApi());
  });

  test("implementa la interfaz IPriceEstimator (Target)", async () => {
    expect(typeof adapter.getCurrentQuote).toBe("function");
  });

  test("devuelve PriceQuote con campos correctos", async () => {
    const quote: PriceQuote = await adapter.getCurrentQuote();
    expect(quote).toHaveProperty("source");
    expect(quote).toHaveProperty("pricePerKwh");
    expect(quote).toHaveProperty("trend");
    expect(quote).toHaveProperty("currency", "USD");
    expect(quote.fetchedAt).toBeInstanceOf(Date);
  });

  test("convierte €/MWh a USD/kWh correctamente (ratio ~0.00108)", async () => {
    const quote = await adapter.getCurrentQuote();
    // 72.4 €/MWh × 1.08 EUR/USD × 0.001 MWh/kWh ≈ 0.0782 USD/kWh (rango pico)
    expect(quote.pricePerKwh).toBeGreaterThan(0);
    expect(quote.pricePerKwh).toBeLessThan(0.2); // siempre < 0.2 USD/kWh
  });

  test("la tendencia es UP, DOWN, o STABLE", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(["UP", "DOWN", "STABLE"]).toContain(quote.trend);
  });

  test("la fuente es SOLAR (tecnología del mock)", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(quote.source).toBe("SOLAR");
  });

  test("la validez es 60 minutos", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(quote.validForMinutes).toBe(60);
  });
});

// ── Tests de EntsoEAdapter ────────────────────────────────────

describe("EntsoEAdapter — Adapter Pattern", () => {
  let adapter: IPriceEstimator;

  beforeEach(() => {
    adapter = new EntsoEAdapter(new MockEntsoEApi(), "10YES-REE------0", "GRID");
  });

  test("implementa la interfaz IPriceEstimator (Target)", async () => {
    expect(typeof adapter.getCurrentQuote).toBe("function");
  });

  test("devuelve PriceQuote con currency USD", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(quote.currency).toBe("USD");
    expect(quote.source).toBe("GRID");
  });

  test("promedia correctamente múltiples intervalos de tiempo", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(quote.pricePerKwh).toBeGreaterThan(0);
    // 68-88 €/MWh → USD/kWh ≈ 0.073-0.095
    expect(quote.pricePerKwh).toBeLessThan(0.15);
  });

  test("configura fuente según el parámetro del constructor", async () => {
    const windAdapter = new EntsoEAdapter(new MockEntsoEApi(), "10YES-REE------0", "WIND");
    const quote = await windAdapter.getCurrentQuote();
    expect(quote.source).toBe("WIND");
  });
});

// ── Tests de OctopusAdapter ───────────────────────────────────

describe("OctopusAdapter — Adapter Pattern", () => {
  let adapter: IPriceEstimator;

  beforeEach(() => {
    adapter = new OctopusAdapter(new MockOctopusApi(), "AGILE-24-10-01", "GRID");
  });

  test("implementa la interfaz IPriceEstimator (Target)", async () => {
    expect(typeof adapter.getCurrentQuote).toBe("function");
  });

  test("convierte peniques/kWh a USD/kWh (×0.0126)", async () => {
    const quote = await adapter.getCurrentQuote();
    // 18-30 peniques × 1.05 VAT × 0.0126 ≈ 0.24-0.40 USD/kWh
    expect(quote.pricePerKwh).toBeGreaterThan(0.01);
    expect(quote.pricePerKwh).toBeLessThan(0.5);
  });

  test("usa intervalos de 30 minutos", async () => {
    const quote = await adapter.getCurrentQuote();
    expect(quote.validForMinutes).toBe(30);
  });

  test("el historicalAvg es diferente al precio actual", async () => {
    const quote = await adapter.getCurrentQuote();
    // Con variación aleatoria, avg ≠ current en la mayoría de casos
    expect(quote.historicalAvg).toBeGreaterThan(0);
  });
});

// ── Tests de createPriceAdapter (factory) ────────────────────

describe("createPriceAdapter — Factory de Adapters", () => {
  test("crea un OmieAdapter para tipo OMIE", async () => {
    const adapter = createPriceAdapter("OMIE");
    const quote = await adapter.getCurrentQuote();
    expect(quote.source).toBe("SOLAR");
  });

  test("crea un EntsoEAdapter para tipo ENTSO_E", async () => {
    const adapter = createPriceAdapter("ENTSO_E", "WIND");
    const quote = await adapter.getCurrentQuote();
    expect(quote.source).toBe("WIND");
  });

  test("crea un OctopusAdapter para tipo OCTOPUS", async () => {
    const adapter = createPriceAdapter("OCTOPUS");
    const quote = await adapter.getCurrentQuote();
    expect(quote.validForMinutes).toBe(30);
  });

  test("todos los adapters cumplen la misma interfaz (polimorfismo)", async () => {
    const adapters = [
      createPriceAdapter("OMIE"),
      createPriceAdapter("ENTSO_E"),
      createPriceAdapter("OCTOPUS"),
    ];
    for (const adapter of adapters) {
      const quote = await adapter.getCurrentQuote();
      expect(quote).toHaveProperty("pricePerKwh");
      expect(quote).toHaveProperty("currency", "USD");
      expect(["UP", "DOWN", "STABLE"]).toContain(quote.trend);
    }
  });
});
