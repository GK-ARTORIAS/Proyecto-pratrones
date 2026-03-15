/**
 * ============================================================
 * PATRÓN: BUILDER — TradeOrderBuilder
 * ============================================================
 * Construye objetos TradeOrder complejos paso a paso.
 * Separa la construcción de la representación, permitiendo
 * crear diferentes configuraciones de orden con la misma
 * secuencia de pasos.
 *
 * Sin Builder, el constructor tendría 10+ parámetros opcionales
 * y sería imposible de leer o mantener.
 *
 * Interfaz fluida (method chaining):
 *   const order = new TradeOrderBuilder()
 *     .ofType("SELL")
 *     .withAmount(12.5)
 *     .atPrice(0.124)
 *     .fromSource("SOLAR")
 *     .expiresInMinutes(60)
 *     .withNote("Excedente de mediodía")
 *     .build();
 *
 * Participantes GoF:
 *   Builder  → TradeOrderBuilder
 *   Product  → TradeOrder
 *   Director → TradeOrderDirector (recetas predefinidas)
 * ============================================================
 */

// ── Tipos del dominio ─────────────────────────────────────────

export type OrderType    = "BUY" | "SELL";
export type OrderStatus  = "DRAFT" | "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
export type EnergySource = "SOLAR" | "WIND" | "BATTERY" | "GRID" | "UNKNOWN";
export type PricingMode  = "FIXED" | "DYNAMIC" | "BEST_AVAILABLE";
export type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TradeOrderConditions {
  minCounterpartRating?: number; // 1-5
  maxDistanceKm?: number;
  requireGreenCertified?: boolean;
  allowPartialFill?: boolean;
}

/**
 * Product: el objeto complejo que el Builder construye.
 * Todos los campos opcionales tienen valores por defecto seguros.
 */
export interface TradeOrder {
  // Identidad
  id: string;
  createdAt: Date;

  // Requeridos
  type: OrderType;
  amountKwh: number;
  pricePerKwh: number;

  // Opcionales
  energySource: EnergySource;
  pricingMode: PricingMode;
  priority: OrderPriority;
  expiresAt: Date | null;
  note: string | null;
  conditions: TradeOrderConditions;
  maxSlippagePercent: number;    // cuánto puede variar el precio (0 = ninguno)

  // Calculados
  totalValueUsd: number;
  status: OrderStatus;
}

// ── Errores del Builder ───────────────────────────────────────

export class TradeOrderBuildError extends Error {
  constructor(message: string) {
    super(`[TradeOrderBuilder] ${message}`);
    this.name = "TradeOrderBuildError";
  }
}

// ── Builder ───────────────────────────────────────────────────

export class TradeOrderBuilder {
  // Estado interno — valores por defecto
  private _type: OrderType | null          = null;
  private _amountKwh: number | null        = null;
  private _pricePerKwh: number | null      = null;
  private _energySource: EnergySource      = "UNKNOWN";
  private _pricingMode: PricingMode        = "FIXED";
  private _priority: OrderPriority         = "NORMAL";
  private _expiresAt: Date | null          = null;
  private _note: string | null             = null;
  private _maxSlippagePercent: number      = 0;
  private _conditions: TradeOrderConditions = {};

  // ── Métodos de configuración (fluent interface) ──────────────

  /** Tipo de orden: BUY (comprar energía) o SELL (vender excedente) */
  ofType(type: OrderType): this {
    this._type = type;
    return this;
  }

  /** Cantidad de energía en kWh */
  withAmount(kwh: number): this {
    if (kwh <= 0) throw new TradeOrderBuildError("La cantidad debe ser mayor que 0");
    this._amountKwh = kwh;
    return this;
  }

  /** Precio que se ofrece/acepta en USD por kWh */
  atPrice(usdPerKwh: number): this {
    if (usdPerKwh <= 0) throw new TradeOrderBuildError("El precio debe ser mayor que 0");
    this._pricePerKwh = usdPerKwh;
    return this;
  }

  /** Fuente de energía preferida */
  fromSource(source: EnergySource): this {
    this._energySource = source;
    return this;
  }

  /** Modo de precio: FIXED (precio fijo), DYNAMIC (sigue mercado), BEST_AVAILABLE */
  withPricingMode(mode: PricingMode): this {
    this._pricingMode = mode;
    return this;
  }

  /** Prioridad de la orden en el libro */
  withPriority(priority: OrderPriority): this {
    this._priority = priority;
    return this;
  }

  /** La orden expira en N minutos desde ahora */
  expiresInMinutes(minutes: number): this {
    if (minutes <= 0) throw new TradeOrderBuildError("Los minutos deben ser positivos");
    const exp = new Date();
    exp.setMinutes(exp.getMinutes() + minutes);
    this._expiresAt = exp;
    return this;
  }

  /** Fecha de expiración explícita */
  expiresAt(date: Date): this {
    if (date <= new Date()) throw new TradeOrderBuildError("La fecha de expiración debe ser futura");
    this._expiresAt = date;
    return this;
  }

  /** Nota o descripción libre de la orden */
  withNote(note: string): this {
    this._note = note.trim();
    return this;
  }

  /** % máximo de variación de precio aceptado (para modo DYNAMIC) */
  withMaxSlippage(percent: number): this {
    if (percent < 0 || percent > 100) throw new TradeOrderBuildError("Slippage debe estar entre 0 y 100");
    this._maxSlippagePercent = percent;
    return this;
  }

  /** Condiciones adicionales de la contra-parte */
  withConditions(conditions: TradeOrderConditions): this {
    this._conditions = { ...this._conditions, ...conditions };
    return this;
  }

  /** Requiere que el vendedor tenga certificación verde */
  requireGreenCertified(): this {
    this._conditions.requireGreenCertified = true;
    return this;
  }

  /** Permite que la orden se llene parcialmente */
  allowPartialFill(): this {
    this._conditions.allowPartialFill = true;
    return this;
  }

  // ── build() — construye y valida el producto final ───────────

  build(): TradeOrder {
    // Validaciones de campos requeridos
    if (!this._type)        throw new TradeOrderBuildError("El tipo es requerido (.ofType())");
    if (!this._amountKwh)   throw new TradeOrderBuildError("La cantidad es requerida (.withAmount())");
    if (!this._pricePerKwh) throw new TradeOrderBuildError("El precio es requerido (.atPrice())");

    // Validación de negocio
    if (this._pricingMode === "DYNAMIC" && this._maxSlippagePercent === 0) {
      console.warn("[TradeOrderBuilder] ⚠️ Modo DYNAMIC sin slippage: la orden podría no ejecutarse");
    }

    const totalValueUsd = parseFloat((this._amountKwh * this._pricePerKwh).toFixed(4));

    return {
      id:         `ORD-${Date.now().toString(36).toUpperCase()}`,
      createdAt:  new Date(),
      type:       this._type,
      amountKwh:  this._amountKwh,
      pricePerKwh: this._pricePerKwh,
      energySource: this._energySource,
      pricingMode:  this._pricingMode,
      priority:     this._priority,
      expiresAt:    this._expiresAt,
      note:         this._note,
      conditions:   { ...this._conditions },
      maxSlippagePercent: this._maxSlippagePercent,
      totalValueUsd,
      status: "DRAFT",
    };
  }

  /** Reinicia el builder para reutilizarlo */
  reset(): this {
    this._type             = null;
    this._amountKwh        = null;
    this._pricePerKwh      = null;
    this._energySource     = "UNKNOWN";
    this._pricingMode      = "FIXED";
    this._priority         = "NORMAL";
    this._expiresAt        = null;
    this._note             = null;
    this._maxSlippagePercent = 0;
    this._conditions       = {};
    return this;
  }
}

// ── Director ─────────────────────────────────────────────────
/**
 * Director: encapsula recetas de construcción comunes.
 * Abstrae el conocimiento de qué pasos llamar y en qué orden.
 * El Director no sabe nada del producto final, solo del Builder.
 */
export class TradeOrderDirector {
  constructor(private readonly builder: TradeOrderBuilder) {}

  /**
   * Receta: orden de venta de excedente solar urgente.
   * Expira en 30 min, precio dinámico, alta prioridad.
   */
  buildUrgentSolarSell(amountKwh: number, pricePerKwh: number): TradeOrder {
    return this.builder
      .reset()
      .ofType("SELL")
      .withAmount(amountKwh)
      .atPrice(pricePerKwh)
      .fromSource("SOLAR")
      .withPricingMode("DYNAMIC")
      .withPriority("URGENT")
      .expiresInMinutes(30)
      .withMaxSlippage(5)
      .withNote("Excedente solar — venta urgente antes de pérdida")
      .allowPartialFill()
      .build();
  }

  /**
   * Receta: compra programada de energía verde.
   * Sin urgencia, certificación verde requerida, 24h de vigencia.
   */
  buildScheduledGreenBuy(amountKwh: number, maxPricePerKwh: number): TradeOrder {
    return this.builder
      .reset()
      .ofType("BUY")
      .withAmount(amountKwh)
      .atPrice(maxPricePerKwh)
      .withPricingMode("BEST_AVAILABLE")
      .withPriority("LOW")
      .expiresInMinutes(60 * 24)
      .requireGreenCertified()
      .allowPartialFill()
      .withNote("Compra programada — solo energía renovable certificada")
      .build();
  }

  /**
   * Receta: orden de batería en hora pico.
   * Precio fijo, alta prioridad, expira en 15 min.
   */
  buildPeakBatteryDischarge(amountKwh: number, pricePerKwh: number): TradeOrder {
    return this.builder
      .reset()
      .ofType("SELL")
      .withAmount(amountKwh)
      .atPrice(pricePerKwh)
      .fromSource("BATTERY")
      .withPricingMode("FIXED")
      .withPriority("HIGH")
      .expiresInMinutes(15)
      .withNote("Descarga de batería en hora pico")
      .build();
  }
}

// _Builder
