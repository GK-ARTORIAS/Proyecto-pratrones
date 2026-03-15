/**
 * ============================================================
 * Tests: Patrón BUILDER — TradeOrderBuilder
 * ============================================================
 */

import {
  TradeOrderBuilder,
  TradeOrderDirector,
  TradeOrderBuildError,
  type TradeOrder,
} from "@/lib/trading/TradeOrderBuilder";

// ── Tests del Builder directo ─────────────────────────────────

describe("TradeOrderBuilder — Builder directo", () => {

  test("construye una orden mínima con los 3 campos requeridos", () => {
    const order = new TradeOrderBuilder()
      .ofType("SELL")
      .withAmount(10)
      .atPrice(0.12)
      .build();

    expect(order.type).toBe("SELL");
    expect(order.amountKwh).toBe(10);
    expect(order.pricePerKwh).toBe(0.12);
    expect(order.status).toBe("DRAFT");
    expect(order.id).toMatch(/^ORD-/);
    expect(order.createdAt).toBeInstanceOf(Date);
  });

  test("calcula correctamente el totalValueUsd", () => {
    const order = new TradeOrderBuilder()
      .ofType("BUY")
      .withAmount(20)
      .atPrice(0.15)
      .build();
    expect(order.totalValueUsd).toBeCloseTo(3.0, 3);
  });

  test("aplica valores por defecto correctamente", () => {
    const order = new TradeOrderBuilder()
      .ofType("BUY")
      .withAmount(5)
      .atPrice(0.1)
      .build();

    expect(order.energySource).toBe("UNKNOWN");
    expect(order.pricingMode).toBe("FIXED");
    expect(order.priority).toBe("NORMAL");
    expect(order.expiresAt).toBeNull();
    expect(order.note).toBeNull();
    expect(order.maxSlippagePercent).toBe(0);
    expect(order.conditions.allowPartialFill).toBeUndefined();
  });

  test("configura fuente de energía", () => {
    const order = new TradeOrderBuilder()
      .ofType("SELL").withAmount(5).atPrice(0.1)
      .fromSource("SOLAR")
      .build();
    expect(order.energySource).toBe("SOLAR");
  });

  test("configura modo de precio DYNAMIC", () => {
    const order = new TradeOrderBuilder()
      .ofType("BUY").withAmount(5).atPrice(0.1)
      .withPricingMode("DYNAMIC")
      .withMaxSlippage(3)
      .build();
    expect(order.pricingMode).toBe("DYNAMIC");
    expect(order.maxSlippagePercent).toBe(3);
  });

  test("configura expiresInMinutes correctamente", () => {
    const before = new Date();
    const order = new TradeOrderBuilder()
      .ofType("SELL").withAmount(5).atPrice(0.1)
      .expiresInMinutes(60)
      .build();
    
    expect(order.expiresAt).not.toBeNull();
    expect(order.expiresAt!.getTime()).toBeGreaterThan(before.getTime() + 59 * 60 * 1000);
  });

  test("configura nota y prioridad", () => {
    const order = new TradeOrderBuilder()
      .ofType("SELL").withAmount(5).atPrice(0.1)
      .withNote("  Excedente solar  ")
      .withPriority("HIGH")
      .build();
    expect(order.note).toBe("Excedente solar"); // trim aplicado
    expect(order.priority).toBe("HIGH");
  });

  test("configura condiciones correctamente", () => {
    const order = new TradeOrderBuilder()
      .ofType("BUY").withAmount(5).atPrice(0.1)
      .requireGreenCertified()
      .allowPartialFill()
      .build();
    expect(order.conditions.requireGreenCertified).toBe(true);
    expect(order.conditions.allowPartialFill).toBe(true);
  });

  test("reset() limpia el estado y permite reutilizar el builder", () => {
    const builder = new TradeOrderBuilder();
    
    const order1 = builder.ofType("SELL").withAmount(10).atPrice(0.12).build();
    builder.reset();
    const order2 = builder.ofType("BUY").withAmount(5).atPrice(0.09).build();

    expect(order1.type).toBe("SELL");
    expect(order2.type).toBe("BUY");
    expect(order1.amountKwh).not.toBe(order2.amountKwh);
  });

  test("method chaining retorna la misma instancia del builder", () => {
    const builder = new TradeOrderBuilder();
    const result = builder.ofType("SELL");
    expect(result).toBe(builder); // fluent interface: this
  });
});

// ── Validaciones del Builder ──────────────────────────────────

describe("TradeOrderBuilder — Validaciones en build()", () => {

  test("lanza error si falta el tipo", () => {
    expect(() =>
      new TradeOrderBuilder().withAmount(5).atPrice(0.1).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si falta la cantidad", () => {
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").atPrice(0.1).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si falta el precio", () => {
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").withAmount(5).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si cantidad <= 0", () => {
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").withAmount(-1).atPrice(0.1).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si precio <= 0", () => {
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").withAmount(5).atPrice(0).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si slippage fuera de rango", () => {
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").withAmount(5).atPrice(0.1).withMaxSlippage(101).build()
    ).toThrow(TradeOrderBuildError);
  });

  test("lanza error si fecha de expiración es pasada", () => {
    const past = new Date(Date.now() - 10000);
    expect(() =>
      new TradeOrderBuilder().ofType("SELL").withAmount(5).atPrice(0.1).expiresAt(past).build()
    ).toThrow(TradeOrderBuildError);
  });
});

// ── Tests del Director ────────────────────────────────────────

describe("TradeOrderDirector — Recetas predefinidas", () => {
  let director: TradeOrderDirector;

  beforeEach(() => {
    director = new TradeOrderDirector(new TradeOrderBuilder());
  });

  test("buildUrgentSolarSell crea orden SELL solar urgente", () => {
    const order = director.buildUrgentSolarSell(12.5, 0.124);
    expect(order.type).toBe("SELL");
    expect(order.energySource).toBe("SOLAR");
    expect(order.priority).toBe("URGENT");
    expect(order.pricingMode).toBe("DYNAMIC");
    expect(order.conditions.allowPartialFill).toBe(true);
    expect(order.expiresAt).not.toBeNull();
    expect(order.amountKwh).toBe(12.5);
  });

  test("buildScheduledGreenBuy crea orden BUY con certificación verde", () => {
    const order = director.buildScheduledGreenBuy(20, 0.115);
    expect(order.type).toBe("BUY");
    expect(order.conditions.requireGreenCertified).toBe(true);
    expect(order.priority).toBe("LOW");
    expect(order.pricingMode).toBe("BEST_AVAILABLE");
  });

  test("buildPeakBatteryDischarge crea orden SELL de batería pico", () => {
    const order = director.buildPeakBatteryDischarge(8, 0.155);
    expect(order.type).toBe("SELL");
    expect(order.energySource).toBe("BATTERY");
    expect(order.priority).toBe("HIGH");
    expect(order.pricingMode).toBe("FIXED");
  });

  test("Director produce órdenes independientes en cada llamada", () => {
    const o1 = director.buildUrgentSolarSell(10, 0.12);
    const o2 = director.buildScheduledGreenBuy(5, 0.10);
    expect(o1.id).not.toBe(o2.id);
    expect(o1.type).not.toBe(o2.type);
  });
});
