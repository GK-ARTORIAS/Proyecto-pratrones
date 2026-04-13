/**
 * ============================================================
 * PATRÓN: DECORATOR — PriceDecorator
 * ============================================================
 * Problema: el IPriceEstimator (definido en el Adapter) funciona,
 * pero falta añadirle comportamientos transversales:
 *   - Caché para no llamar la API cada segundo
 *   - Logging de cada consulta
 *   - Alertas cuando el precio supera un umbral
 *   - Reintentos automáticos ante fallos de red
 *
 * Solución: Decorator envuelve el objeto original añadiendo
 * comportamiento ANTES o DESPUÉS sin modificar la clase base,
 * y los decoradores son apilables en cualquier orden.
 *
 * Participantes GoF:
 *   Component            → IPriceEstimator (interfaz)
 *   ConcreteComponent    → OmieAdapter, EntsoEAdapter, OctopusAdapter (del Adapter)
 *   Decorator base       → PriceEstimatorDecorator (envuelve otro IPriceEstimator)
 *   ConcreteDecorators   → CachingDecorator, LoggingDecorator,
 *                          AlertingDecorator, RetryDecorator
 *
 * Composición (ejemplo):
 *   new LoggingDecorator(
 *     new AlertingDecorator(
 *       new CachingDecorator(
 *         new RetryDecorator(new OmieAdapter(api), 3),
 *         5 // minutos de cache
 *       ),
 *       0.15 // umbral USD/kWh
 *     )
 *   )
 * ============================================================
 */

import {
  type IPriceEstimator,
  type PriceQuote,
} from "@/lib/market/ExternalPriceAdapter";
import {
  PriceAlertNotifier,
  InAppChannel,
} from "@/lib/notifications/NotificationBridge";

// ── Decorator base ────────────────────────────────────────────

/**
 * Clase abstracta base de todos los decoradores.
 * Implementa IPriceEstimator delegando al wrapped component.
 */
export abstract class PriceEstimatorDecorator implements IPriceEstimator {
  constructor(protected readonly wrapped: IPriceEstimator) {}

  // Por defecto delega al decorado — las subclases añaden comportamiento
  getCurrentQuote(): Promise<PriceQuote> {
    return this.wrapped.getCurrentQuote();
  }
}

// ── ConcreteDecorators ────────────────────────────────────────

/**
 * Decorator 1: CACHÉ
 * Evita llamadas repetidas a la API externa durante el período de vigencia
 * del precio. Si la cotización sigue vigente, devuelve la cacheada.
 */
export class CachingDecorator extends PriceEstimatorDecorator {
  private _cached: PriceQuote | null = null;
  private _expiresAt: Date | null    = null;
  private _hits   = 0;
  private _misses = 0;

  constructor(wrapped: IPriceEstimator, private readonly cacheTTLMinutes = 5) {
    super(wrapped);
  }

  async getCurrentQuote(): Promise<PriceQuote> {
    const now = new Date();
    if (this._cached && this._expiresAt && now < this._expiresAt) {
      this._hits++;
      // Retorna la cotización con nota de que viene de caché
      return { ...this._cached, fetchedAt: this._cached.fetchedAt };
    }

    // Cache miss → llama al siguiente en la cadena
    this._misses++;
    const quote = await this.wrapped.getCurrentQuote();
    this._cached    = quote;
    this._expiresAt = new Date(now.getTime() + this.cacheTTLMinutes * 60_000);
    return quote;
  }

  /** Invalida el caché manualmente */
  invalidate(): void { this._cached = null; this._expiresAt = null; }

  getStats() { return { hits: this._hits, misses: this._misses, ratio: this._hits / (this._hits + this._misses || 1) }; }
}

/**
 * Decorator 2: LOGGING
 * Registra cada consulta: fuente, precio, duración y tendencia.
 * Mantiene historial de las últimas N consultas.
 */
export interface QuoteLogEntry {
  timestamp:  Date;
  source:     string;
  price:      number;
  trend:      string;
  durationMs: number;
  fromCache:  boolean;
}

export class LoggingDecorator extends PriceEstimatorDecorator {
  private readonly _history: QuoteLogEntry[] = [];

  constructor(wrapped: IPriceEstimator, private readonly maxHistory = 20) {
    super(wrapped);
  }

  async getCurrentQuote(): Promise<PriceQuote> {
    const start = Date.now();
    const quote = await this.wrapped.getCurrentQuote();
    const durationMs = Date.now() - start;

    const entry: QuoteLogEntry = {
      timestamp:  new Date(),
      source:     quote.source,
      price:      quote.pricePerKwh,
      trend:      quote.trend,
      durationMs,
      fromCache:  durationMs < 2, // heurística: si tardó < 2ms es cache
    };

    this._history.unshift(entry);
    if (this._history.length > this.maxHistory) this._history.pop();

    console.debug(
      `[PriceLog] ${quote.source} $${quote.pricePerKwh.toFixed(5)} ${quote.trend} ` +
      `(${durationMs}ms${entry.fromCache ? " · CACHED" : ""})`
    );
    return quote;
  }

  getHistory(): QuoteLogEntry[] { return [...this._history]; }
  getLatest(): QuoteLogEntry | null { return this._history[0] ?? null; }
  clearHistory(): void { this._history.length = 0; }
}

/**
 * Decorator 3: ALERTAS
 * Dispara notificaciones vía Bridge cuando el precio supera
 * o cae bajo umbrales configurados.
 */
export class AlertingDecorator extends PriceEstimatorDecorator {
  private _alertsFired = 0;

  constructor(
    wrapped: IPriceEstimator,
    private readonly spikeThreshold:   number,           // USD/kWh máximo
    private readonly dropThreshold:    number = 0,       // USD/kWh mínimo (0 = inactivo)
    private readonly cooldownMinutes:  number = 5,        // evita spam de alertas
  ) {
    super(wrapped);
  }

  private _lastAlertAt: Date | null = null;

  private get _inCooldown(): boolean {
    if (!this._lastAlertAt) return false;
    return (Date.now() - this._lastAlertAt.getTime()) < this.cooldownMinutes * 60_000;
  }

  async getCurrentQuote(): Promise<PriceQuote> {
    const quote = await this.wrapped.getCurrentQuote();

    if (!this._inCooldown) {
      // Usa el Bridge de notificaciones para entregar la alerta
      const notifier = new PriceAlertNotifier(InAppChannel.getInstance());

      if (quote.pricePerKwh > this.spikeThreshold) {
        await notifier.alertPriceSpike(quote.source, quote.pricePerKwh, this.spikeThreshold);
        this._lastAlertAt = new Date();
        this._alertsFired++;
      } else if (this.dropThreshold > 0 && quote.pricePerKwh < this.dropThreshold) {
        await notifier.alertPriceDrop(quote.source, quote.pricePerKwh, quote.historicalAvg);
        this._lastAlertAt = new Date();
        this._alertsFired++;
      }
    }

    return quote;
  }

  getAlertCount(): number { return this._alertsFired; }
}

/**
 * Decorator 4: REINTENTOS
 * Reintenta automáticamente la consulta si el proveedor falla,
 * con espera exponencial entre intentos.
 */
export class RetryDecorator extends PriceEstimatorDecorator {
  private _totalRetries = 0;
  private _failures     = 0;

  constructor(
    wrapped: IPriceEstimator,
    private readonly maxAttempts:  number = 3,
    private readonly baseDelayMs:  number = 300,
  ) {
    super(wrapped);
  }

  async getCurrentQuote(): Promise<PriceQuote> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.wrapped.getCurrentQuote();
      } catch (err) {
        lastError = err;
        this._failures++;
        if (attempt < this.maxAttempts) {
          this._totalRetries++;
          const delay = this.baseDelayMs * 2 ** (attempt - 1); // 300ms, 600ms, 1200ms…
          console.warn(`[RetryDecorator] intento ${attempt} fallido — reintentando en ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw new Error(`[RetryDecorator] Falló tras ${this.maxAttempts} intentos: ${lastError}`);
  }

  getStats() { return { totalRetries: this._totalRetries, failures: this._failures }; }
}

// ── Factory de pipelines de decoradores ──────────────────────

export interface PipelineOptions {
  cacheTTLMinutes?: number;
  spikeThreshold?:  number;
  dropThreshold?:   number;
  maxRetries?:      number;
  enableLogging?:   boolean;
}

/**
 * Construye el pipeline de decoradores estándar para producción.
 * Orden: Retry → Cache → Alerting → Logging (de más interno a más externo)
 */
export function buildPricePipeline(
  base: IPriceEstimator,
  opts: PipelineOptions = {},
): { estimator: IPriceEstimator; cache: CachingDecorator; logger: LoggingDecorator; alerter: AlertingDecorator; retrier: RetryDecorator } {
  const retrier  = new RetryDecorator(base, opts.maxRetries ?? 3);
  const cache    = new CachingDecorator(retrier, opts.cacheTTLMinutes ?? 5);
  const alerter  = new AlertingDecorator(cache, opts.spikeThreshold ?? 0.18, opts.dropThreshold ?? 0);
  const logger   = opts.enableLogging !== false ? new LoggingDecorator(alerter) : new LoggingDecorator(alerter, 0);

  return { estimator: logger, cache, logger, alerter, retrier };
}

// _Decorator
