/**
 * Tests: Patrón FACADE — EnergyTradingFacade
 */
import { EnergyTradingFacade } from "@/lib/facade/EnergyTradingFacade";
import { OrderTemplateRegistry } from "@/lib/trading/OrderTemplate";

// Mock de supabase para aislar tests
jest.mock("@/lib/supabase/supabaseClient", () => ({
    getSupabaseAdmin: () => ({
        from: () => ({
            insert: async () => ({ error: null }),
        }),
    }),
    getSupabaseClient: () => ({
        from: () => ({
            select: () => ({
                eq: async () => ({
                    data: [
                        { status: "OPEN",    total_value_usd: 12.5 },
                        { status: "MATCHED", total_value_usd: 7.2  },
                    ],
                }),
            }),
        }),
    }),
}));

jest.mock("@/lib/supabase/demoUser", () => ({
    DEMO_USER_ID: "00000000-0000-0000-0000-000000000001",
    ensureDemoProfile: jest.fn(),
}));

describe("EnergyTradingFacade — Facade Pattern", () => {
    let facade: EnergyTradingFacade;

    beforeEach(() => {
        facade = new EnergyTradingFacade();
    });

    // ── createAndPublishOrder ──────────────────────────────────

    test("createAndPublishOrder() devuelve ok:true con ID de orden", async () => {
        const result = await facade.createAndPublishOrder({
            type:        "SELL",
            amountKwh:   10,
            pricePerKwh: 0.12,
            energySource: "SOLAR",
            note:         "test",
        });
        expect(result.ok).toBe(true);
        expect(result.data).toMatch(/^ORD-/);
    });

    test("createAndPublishOrder() aplica parámetros opcionales correctamente", async () => {
        const result = await facade.createAndPublishOrder({
            type:         "BUY",
            amountKwh:    5,
            pricePerKwh:  0.10,
            allowPartial: true,
            greenOnly:    true,
            expiresInMin: 60,
        });
        expect(result.ok).toBe(true);
    });

    test("createAndPublishOrder() falla con cantidad <= 0", async () => {
        const result = await facade.createAndPublishOrder({
            type:        "SELL",
            amountKwh:   0,     // ← inválido
            pricePerKwh: 0.12,
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
    });

    // ── cloneTemplateAndPublish ────────────────────────────────

    test("cloneTemplateAndPublish() crea orden desde template existente", async () => {
        const result = await facade.cloneTemplateAndPublish("Venta Solar Mañana");
        expect(result.ok).toBe(true);
        expect(result.data).toMatch(/^ORD-/);
    });

    test("cloneTemplateAndPublish() falla si el template no existe", async () => {
        const result = await facade.cloneTemplateAndPublish("Template Inexistente XYZ");
        expect(result.ok).toBe(false);
        expect(result.error).toContain("no existe");
    });

    test("cloneTemplateAndPublish() aplica overrides al clon", async () => {
        const result = await facade.cloneTemplateAndPublish("Venta Solar Mañana", { amountKwh: 50 });
        expect(result.ok).toBe(true);
    });

    // ── getMarketSummary ───────────────────────────────────────

    test("getMarketSummary() devuelve cotizaciones de múltiples proveedores", async () => {
        const result = await facade.getMarketSummary();
        expect(result.ok).toBe(true);
        expect(result.data!.quotes.length).toBeGreaterThanOrEqual(1);
    });

    test("getMarketSummary() identifica el proveedor más barato", async () => {
        const result = await facade.getMarketSummary();
        expect(result.ok).toBe(true);
        expect(result.data!.cheapest).not.toBeNull();
        expect(["OMIE", "ENTSO_E", "OCTOPUS"]).toContain(result.data!.cheapest);
    });

    test("getMarketSummary() devuelve precio promedio válido", async () => {
        const result = await facade.getMarketSummary();
        expect(result.data!.avgPrice).toBeGreaterThan(0);
        expect(result.data!.avgPrice).toBeLessThan(1);
    });

    test("getMarketSummary() incluye timestamp y cacheStats", async () => {
        const result = await facade.getMarketSummary();
        expect(result.data!.timestamp).toBeInstanceOf(Date);
        expect(result.data!.cacheStats).toHaveProperty("hits");
    });

    // ── getPortfolioStatus ─────────────────────────────────────

    test("getPortfolioStatus() devuelve recuento de órdenes y dispositivos", async () => {
        const result = await facade.getPortfolioStatus();
        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty("openOrders");
        expect(result.data).toHaveProperty("totalDevices");
    });

    // ── getAvailableTemplates ──────────────────────────────────

    test("getAvailableTemplates() devuelve al menos los 3 templates por defecto", () => {
        const templates = facade.getAvailableTemplates();
        expect(templates.length).toBeGreaterThanOrEqual(3);
        expect(templates[0]).toHaveProperty("name");
        expect(templates[0]).toHaveProperty("order");
    });

    // ── Verificación de que la Facade oculta los subsistemas ───

    test("el cliente no necesita importar Builder ni Supabase ni Bridge", () => {
        // Si este test compila y corre, la Facade está funcionando
        // como punto único de entrada
        expect(facade.createAndPublishOrder).toBeDefined();
        expect(facade.cloneTemplateAndPublish).toBeDefined();
        expect(facade.getMarketSummary).toBeDefined();
        expect(facade.getPortfolioStatus).toBeDefined();
        expect(facade.getAvailableTemplates).toBeDefined();
    });
});
