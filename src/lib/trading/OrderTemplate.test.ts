/**
 * ============================================================
 * Tests: Patrón PROTOTYPE — OrderTemplate
 * ============================================================
 */

import {
  OrderTemplate,
  OrderTemplateRegistry,
} from "@/lib/trading/OrderTemplate";
import { TradeOrderBuilder } from "@/lib/trading/TradeOrderBuilder";

// Helper: crea una orden de prueba
function makeOrder(amount = 10, price = 0.12) {
  return new TradeOrderBuilder()
    .ofType("SELL")
    .withAmount(amount)
    .atPrice(price)
    .fromSource("SOLAR")
    .expiresInMinutes(60)
    .withNote("Orden de prueba")
    .allowPartialFill()
    .build();
}

// ── Tests de OrderTemplate (ConcretePrototype) ────────────────

describe("OrderTemplate — Prototype Pattern", () => {

  test("clone() produce un objeto completamente independiente", () => {
    const original = new OrderTemplate(makeOrder(), "Template A");
    const clonado  = original.clone();

    expect(clonado.getOrder().id).not.toBe(original.getOrder().id); // nuevo ID
    expect(clonado.getOrder().amountKwh).toBe(original.getOrder().amountKwh);
  });

  test("clone() con overrides pisa solo los campos especificados", () => {
    const original = new OrderTemplate(makeOrder(10, 0.12), "Template B");
    const clonado  = original.clone({ amountKwh: 25, pricePerKwh: 0.15 });

    expect(clonado.getOrder().amountKwh).toBe(25);
    expect(clonado.getOrder().pricePerKwh).toBe(0.15);
    expect(clonado.getOrder().energySource).toBe("SOLAR"); // sin cambio
  });

  test("clone() incrementa el usageCount del prototipo", () => {
    const template = new OrderTemplate(makeOrder(), "Template C");
    expect(template.usageCount).toBe(0);
    template.clone();
    template.clone();
    expect(template.usageCount).toBe(2);
  });

  test("clone() copia las condiciones del original", () => {
    const order = new TradeOrderBuilder()
      .ofType("BUY").withAmount(5).atPrice(0.1)
      .requireGreenCertified().allowPartialFill()
      .build();
    const template = new OrderTemplate(order, "Template Verde");
    const clonado  = template.clone();

    expect(clonado.getOrder().conditions.requireGreenCertified).toBe(true);
    expect(clonado.getOrder().conditions.allowPartialFill).toBe(true);
  });

  test("modificar el clon no afecta al original (inmutabilidad)", () => {
    const original = new OrderTemplate(makeOrder(10, 0.12), "Template D");
    const clonado  = original.clone({ amountKwh: 99 });

    expect(original.getOrder().amountKwh).toBe(10); // original sin cambio
    expect(clonado.getOrder().amountKwh).toBe(99);
  });

  test("getOrder() retorna una copia, no la referencia interna", () => {
    const template = new OrderTemplate(makeOrder(), "Template E");
    const order1   = template.getOrder();
    const order2   = template.getOrder();
    expect(order1).not.toBe(order2); // objetos distintos
    expect(order1.id).toBe(order2.id); // mismo contenido
  });

  test("el nombre del clon incluye '(copia)'", () => {
    const template = new OrderTemplate(makeOrder(), "Mi Template");
    const clonado  = template.clone();
    expect(clonado.name).toContain("copia");
  });

  test("la nota del clon incluye el nombre del prototipo original", () => {
    const template = new OrderTemplate(makeOrder(), "Panel Solar Norte");
    const clonado  = template.clone();
    expect(clonado.getOrder().note).toContain("Panel Solar Norte");
  });

  test("el clon tiene nuevo ID generado (no reutiliza el del original)", () => {
    const template = new OrderTemplate(makeOrder(), "Template F");
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add(template.clone().getOrder().id);
    }
    expect(ids.size).toBe(5); // 5 IDs únicos
  });
});

// ── Tests del Registry ────────────────────────────────────────

describe("OrderTemplateRegistry — Singleton + Prototype Registry", () => {

  let registry: OrderTemplateRegistry;

  beforeEach(() => {
    // Resetear para cada test (accedemos a la misma instancia Singleton)
    registry = OrderTemplateRegistry.getInstance();
  });

  test("es un Singleton (misma instancia)", () => {
    const r2 = OrderTemplateRegistry.getInstance();
    expect(registry).toBe(r2);
  });

  test("viene pre-cargado con 3 templates por defecto", () => {
    expect(registry.list().length).toBeGreaterThanOrEqual(3);
  });

  test("register() agrega un template y get() lo recupera", () => {
    const template = new OrderTemplate(makeOrder(), "Test Template XYZ");
    registry.register(template);
    expect(registry.get("Test Template XYZ")).toBe(template);
  });

  test("cloneFrom() devuelve una nueva TradeOrder lista para usar", () => {
    const order = registry.cloneFrom("Venta Solar Mañana");
    expect(order).not.toBeNull();
    expect(order!.type).toBe("SELL");
    expect(order!.energySource).toBe("SOLAR");
  });

  test("cloneFrom() con overrides aplica los nuevos valores", () => {
    const order = registry.cloneFrom("Venta Solar Mañana", { amountKwh: 50, pricePerKwh: 0.2 });
    expect(order!.amountKwh).toBe(50);
    expect(order!.pricePerKwh).toBe(0.2);
  });

  test("cloneFrom() devuelve null si el template no existe", () => {
    const order = registry.cloneFrom("Template Inexistente");
    expect(order).toBeNull();
  });

  test("remove() elimina el template del registry", () => {
    const template = new OrderTemplate(makeOrder(), "Template Para Borrar");
    registry.register(template);
    registry.remove("Template Para Borrar");
    expect(registry.get("Template Para Borrar")).toBeUndefined();
  });
});
