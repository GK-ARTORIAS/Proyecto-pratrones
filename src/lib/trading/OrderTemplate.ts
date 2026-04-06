/**
 * ============================================================
 * PATRÓN: PROTOTYPE — OrderTemplate
 * ============================================================
 * Problema: los traders repiten órdenes similares a diario
 * (ej. "vender 10 kWh solar cada mañana"). Reconstruir cada
 * orden desde cero con el Builder es tedioso e ineficiente.
 *
 * Solución: el Prototype permite clonar una orden existente
 * (prototipo) para crear nuevas con mínimas modificaciones.
 * El objeto clonado es completamente independiente del original.
 *
 * Participantes GoF:
 *   Prototype        → IOrderPrototype (interfaz con clone())
 *   ConcretePrototype→ OrderTemplate (implementa clone() + override())
 *   Client           → OrderTemplateRegistry y la página Trading
 *
 * Flujo:
 *   1. Trader guarda una orden exitosa como Template (prototipo)
 *   2. Al día siguiente, clona el template → nueva orden independiente
 *   3. Opcionalmente pisa campos (override) antes de publicar
 * ============================================================
 */

import { TradeOrderBuilder, type TradeOrder } from "@/lib/trading/TradeOrderBuilder";

// ── Interfaz Prototype ────────────────────────────────────────

/** Target del patrón: cualquier objeto que puede clonarse */
export interface IOrderPrototype {
  clone(): OrderTemplate;
  getOrder(): TradeOrder;
}

// ── Overrides opcionales al clonar ───────────────────────────

export interface OrderOverrides {
  amountKwh?:    number;
  pricePerKwh?:  number;
  expiresInMin?: number;
  note?:         string;
}

// ── ConcretePrototype ─────────────────────────────────────────

/**
 * OrderTemplate: el prototipo concreto.
 * Encapsula una TradeOrder y permite clonarla con o sin overrides.
 */
export class OrderTemplate implements IOrderPrototype {
  private readonly _order: TradeOrder;
  readonly name:       string;
  readonly description: string;
  readonly createdAt:  Date;
  usageCount:          number;

  constructor(order: TradeOrder, name: string, description = "") {
    // Copia defensiva — el template nunca muta la orden original
    this._order      = Object.freeze({ ...order, conditions: { ...order.conditions } });
    this.name        = name;
    this.description = description;
    this.createdAt   = new Date();
    this.usageCount  = 0;
  }

  /** Retorna la orden original almacenada en el template */
  getOrder(): TradeOrder {
    return { ...this._order, conditions: { ...this._order.conditions } };
  }

  /**
   * CLONE: crea una nueva TradeOrder independiente basada en este prototipo.
   * El objeto resultante es completamente desacoplado del original.
   *
   * @param overrides - Campos opcionales para pisar en la copia
   */
  clone(overrides: OrderOverrides = {}): OrderTemplate {
    this.usageCount++;

    // Reconstruir con el Builder para garantizar validación y nuevo ID
    const builder = new TradeOrderBuilder()
      .ofType(this._order.type)
      .withAmount(overrides.amountKwh ?? this._order.amountKwh)
      .atPrice(overrides.pricePerKwh ?? this._order.pricePerKwh)
      .fromSource(this._order.energySource)
      .withPricingMode(this._order.pricingMode)
      .withPriority(this._order.priority)
      .withMaxSlippage(this._order.maxSlippagePercent);

    // Replicar condiciones del original
    if (this._order.conditions.requireGreenCertified) builder.requireGreenCertified();
    if (this._order.conditions.allowPartialFill)       builder.allowPartialFill();

    const expiry = overrides.expiresInMin ??
      (this._order.expiresAt
        ? Math.ceil((this._order.expiresAt.getTime() - Date.now()) / 60000)
        : null);
    if (expiry && expiry > 0) builder.expiresInMinutes(expiry);

    const note = overrides.note ?? this._order.note;
    if (note) builder.withNote(`[Clon de: ${this.name}] ${note}`);

    const clonedOrder = builder.build();
    return new OrderTemplate(
      clonedOrder,
      `${this.name} (copia)`,
      `Clonado desde "${this.name}" el ${new Date().toLocaleDateString("es-ES")}`,
    );
  }
}

// ── Registry de Templates ─────────────────────────────────────

/**
 * OrderTemplateRegistry: almacena y gestiona los prototipos.
 * Implementado como Singleton para compartir templates entre páginas.
 */
export class OrderTemplateRegistry {
  private static instance: OrderTemplateRegistry | null = null;
  private templates: Map<string, OrderTemplate> = new Map();

  private constructor() {}

  static getInstance(): OrderTemplateRegistry {
    if (!OrderTemplateRegistry.instance) {
      OrderTemplateRegistry.instance = new OrderTemplateRegistry();
      OrderTemplateRegistry.instance._seedDefaults();
    }
    return OrderTemplateRegistry.instance;
  }

  /** Registra un prototipo en el registry */
  register(template: OrderTemplate): void {
    this.templates.set(template.name, template);
  }

  /** Obtiene un template por nombre */
  get(name: string): OrderTemplate | undefined {
    return this.templates.get(name);
  }

  /** Lista todos los templates disponibles */
  list(): OrderTemplate[] {
    return Array.from(this.templates.values());
  }

  /** Elimina un template */
  remove(name: string): boolean {
    return this.templates.delete(name);
  }

  /** Clona un template registrado con overrides opcionales */
  cloneFrom(name: string, overrides: OrderOverrides = {}): TradeOrder | null {
    const template = this.templates.get(name);
    if (!template) return null;
    return template.clone(overrides).getOrder();
  }

  /** Precarga templates de ejemplo */
  private _seedDefaults(): void {
    // Template 1: Venta solar matutina
    const solarOrder = new TradeOrderBuilder()
      .ofType("SELL").withAmount(10).atPrice(0.118)
      .fromSource("SOLAR").withPricingMode("DYNAMIC")
      .withPriority("NORMAL").expiresInMinutes(120)
      .withNote("Excedente solar matutino").allowPartialFill()
      .build();
    this.register(new OrderTemplate(solarOrder, "Venta Solar Mañana",
      "Venta diaria de excedente solar, 10 kWh a precio dinámico"));

    // Template 2: Compra nocturna de batería
    const batteryOrder = new TradeOrderBuilder()
      .ofType("BUY").withAmount(5).atPrice(0.095)
      .fromSource("BATTERY").withPricingMode("FIXED")
      .withPriority("LOW").expiresInMinutes(480)
      .withNote("Carga nocturna de batería")
      .build();
    this.register(new OrderTemplate(batteryOrder, "Carga Batería Noche",
      "Recarga nocturna cuando el precio es bajo"));

    // Template 3: Compra verde garantizada
    const greenOrder = new TradeOrderBuilder()
      .ofType("BUY").withAmount(20).atPrice(0.13)
      .withPricingMode("BEST_AVAILABLE").withPriority("NORMAL")
      .expiresInMinutes(1440).requireGreenCertified().allowPartialFill()
      .withNote("Solo energía 100% renovable certificada")
      .build();
    this.register(new OrderTemplate(greenOrder, "Compra Verde Premium",
      "Compra de energía verde certificada, válida 24h"));
  }
}

// _Prototype
