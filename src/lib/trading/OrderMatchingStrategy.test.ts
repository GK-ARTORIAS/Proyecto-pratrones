/**
 * Tests: Patrón STRATEGY — OrderMatchingStrategy
 */
import {
    PriceFirstStrategy,
    GreenFirstStrategy,
    TimeFirstStrategy,
    BestValueStrategy,
    OrderMatcher,
    MATCHING_STRATEGIES,
} from "@/lib/trading/OrderMatchingStrategy";
import { TradeOrderBuilder } from "@/lib/trading/TradeOrderBuilder";

// ── Fixtures ──────────────────────────────────────────────────

function makeBuy(kwh: number, price: number, source: "SOLAR"|"WIND"|"GRID" = "GRID", minsAgo = 0) {
    const b = new TradeOrderBuilder()
        .ofType("BUY").withAmount(kwh).atPrice(price).fromSource(source).build();
    // Ajusta createdAt para tests de TimeFirst
    (b as { createdAt: Date }).createdAt = new Date(Date.now() - minsAgo * 60_000);
    return b;
}

function makeSell(kwh: number, price: number, source: "SOLAR"|"WIND"|"GRID" = "SOLAR", minsAgo = 0) {
    const s = new TradeOrderBuilder()
        .ofType("SELL").withAmount(kwh).atPrice(price).fromSource(source).build();
    (s as { createdAt: Date }).createdAt = new Date(Date.now() - minsAgo * 60_000);
    return s;
}

// ── Tests de PriceFirstStrategy ───────────────────────────────

describe("PriceFirstStrategy — Strategy Pattern", () => {

    test("rank(BUY) ordena mayor precio primero", () => {
        const s    = new PriceFirstStrategy();
        const buys = [makeBuy(10, 0.10), makeBuy(10, 0.15), makeBuy(10, 0.12)];
        const ranked = s.rank(buys, "BUY");
        expect(ranked[0].pricePerKwh).toBe(0.15);
        expect(ranked[2].pricePerKwh).toBe(0.10);
    });

    test("rank(SELL) ordena menor precio primero", () => {
        const s     = new PriceFirstStrategy();
        const sells = [makeSell(10, 0.12), makeSell(10, 0.08), makeSell(10, 0.14)];
        const ranked = s.rank(sells, "SELL");
        expect(ranked[0].pricePerKwh).toBe(0.08);
        expect(ranked[2].pricePerKwh).toBe(0.14);
    });

    test("match() empareja cuando buy.price >= sell.price", () => {
        const s     = new PriceFirstStrategy();
        const buys  = [makeBuy(10, 0.15)];
        const sells = [makeSell(10, 0.10)];
        const results = s.match(buys, sells);
        expect(results).toHaveLength(1);
        expect(results[0].matchedKwh).toBe(10);
    });

    test("match() NO empareja cuando buy.price < sell.price", () => {
        const s     = new PriceFirstStrategy();
        const buys  = [makeBuy(10, 0.08)];
        const sells = [makeSell(10, 0.12)];
        expect(s.match(buys, sells)).toHaveLength(0);
    });

    test("match() permite llenado parcial de órdenes", () => {
        const s     = new PriceFirstStrategy();
        const buys  = [makeBuy(5, 0.15)];
        const sells = [makeSell(10, 0.10)];
        const results = s.match(buys, sells);
        expect(results[0].matchedKwh).toBe(5); // solo compra 5 de los 10 disponibles
    });

    test("el precio acordado es la media entre buy y sell", () => {
        const s     = new PriceFirstStrategy();
        const buys  = [makeBuy(10, 0.16)];
        const sells = [makeSell(10, 0.10)];
        const results = s.match(buys, sells);
        expect(results[0].pricePerKwh).toBeCloseTo(0.13, 4);
    });
});

// ── Tests de GreenFirstStrategy ───────────────────────────────

describe("GreenFirstStrategy — Strategy Pattern", () => {

    test("rank() prioriza SOLAR antes que GRID", () => {
        const s = new GreenFirstStrategy();
        const sells = [makeSell(10, 0.10, "GRID"), makeSell(10, 0.10, "SOLAR")];
        const ranked = s.rank(sells, "SELL");
        expect(ranked[0].energySource).toBe("SOLAR");
        expect(ranked[1].energySource).toBe("GRID");
    });

    test("rank() prioriza WIND antes que GRID", () => {
        const s = new GreenFirstStrategy();
        const sells = [makeSell(10, 0.10, "GRID"), makeSell(10, 0.10, "WIND")];
        const ranked = s.rank(sells, "SELL");
        expect(ranked[0].energySource).toBe("WIND");
    });

    test("match() empareja primero con fuentes verdes", () => {
        const s = new GreenFirstStrategy();
        const buys  = [makeBuy(10, 0.15)];
        const sells = [makeSell(10, 0.10, "GRID"), makeSell(10, 0.10, "SOLAR")];
        const results = s.match(buys, sells);
        expect(results[0].energySource).toBe("SOLAR"); // solar primero
    });

    test("isGreenMatch() identifica matches con fuentes renovables", () => {
        const solarResult = { energySource: "SOLAR" as const, buyOrderId:"b", sellOrderId:"s", matchedKwh:1, pricePerKwh:0.1, totalValueUsd:0.1, matchedAt: new Date() };
        const gridResult  = { ...solarResult, energySource: "GRID"  as const };
        expect(GreenFirstStrategy.isGreenMatch(solarResult)).toBe(true);
        expect(GreenFirstStrategy.isGreenMatch(gridResult)).toBe(false);
    });
});

// ── Tests de TimeFirstStrategy ────────────────────────────────

describe("TimeFirstStrategy — Strategy Pattern", () => {

    test("rank() ordena por createdAt ascendente (FIFO)", () => {
        const s = new TimeFirstStrategy();
        const orders = [
            makeBuy(10, 0.12, "GRID", 1),  // 1 min ago
            makeBuy(10, 0.12, "GRID", 5),  // 5 mins ago (más antigua)
            makeBuy(10, 0.12, "GRID", 0),  // ahora
        ];
        const ranked = s.rank(orders, "BUY");
        expect(ranked[0].createdAt.getTime()).toBeLessThan(ranked[2].createdAt.getTime());
    });

    test("match() con mismas órdenes que PriceFirst → orden distinto", () => {
        const price = new PriceFirstStrategy();
        const time  = new TimeFirstStrategy();
        const buys  = [makeBuy(10, 0.15, "GRID", 0), makeBuy(10, 0.12, "GRID", 5)];
        const sells = [makeSell(5, 0.10)];

        const priceResults = price.match(buys, sells);
        const timeResults  = time.match(buys, sells);

        // PriceFirst toma el buy de mayor precio (0.15)
        expect(priceResults[0].pricePerKwh).toBeGreaterThan(0.12);
        // TimeFirst toma el buy más antiguo (5 mins ago = precio 0.12)
        expect(timeResults[0].pricePerKwh).toBeLessThan(0.15);
    });
});

// ── Tests de BestValueStrategy ────────────────────────────────

describe("BestValueStrategy — Strategy Pattern", () => {

    test("rank() prioriza mayor volumen en kWh", () => {
        const s     = new BestValueStrategy();
        const buys  = [makeBuy(5, 0.15), makeBuy(100, 0.10), makeBuy(20, 0.12)];
        const ranked = s.rank(buys, "BUY");
        expect(ranked[0].amountKwh).toBe(100);
        expect(ranked[2].amountKwh).toBe(5);
    });

    test("match() maximiza kWh transaccionados", () => {
        const s     = new BestValueStrategy();
        const buys  = [makeBuy(100, 0.12), makeBuy(10, 0.20)];
        const sells = [makeSell(50, 0.10)];
        const results = s.match(buys, sells);
        // La orden de 100kWh tiene prioridad, pero solo hay 50 disponibles
        expect(results[0].matchedKwh).toBe(50);
    });
});

// ── Tests de OrderMatcher (Context) ──────────────────────────

describe("OrderMatcher — Context del Strategy", () => {
    let matcher: OrderMatcher;
    const orders = [
        makeBuy(10, 0.15), makeBuy(5, 0.12),
        makeSell(8, 0.10, "SOLAR"), makeSell(10, 0.09, "GRID"),
    ];

    beforeEach(() => { matcher = new OrderMatcher(); });

    test("usa PriceFirstStrategy por defecto", () => {
        expect(matcher.getStrategyName()).toBe("PriceFirst");
    });

    test("setStrategy() cambia la estrategia en runtime", () => {
        matcher.setStrategy(new GreenFirstStrategy());
        expect(matcher.getStrategyName()).toBe("GreenFirst");
    });

    test("run() ejecuta la estrategia y devuelve MatchSummary", () => {
        const summary = matcher.run(orders);
        expect(summary.strategy).toBe("PriceFirst");
        expect(summary.totalMatches).toBeGreaterThan(0);
        expect(summary.totalKwhMatched).toBeGreaterThan(0);
    });

    test("run() registra en el historial", () => {
        matcher.run(orders);
        matcher.run(orders);
        expect(matcher.getHistory()).toHaveLength(2);
        expect(matcher.getRoundCount()).toBe(2);
    });

    test("estrategias distintas producen resultados distintos", () => {
        const price = matcher.setStrategy(new PriceFirstStrategy()).run(orders);
        const green = matcher.setStrategy(new GreenFirstStrategy()).run(orders);
        // Al menos el nombre de estrategia difiere
        expect(price.strategy).not.toBe(green.strategy);
    });

    test("compareStrategies() ejecuta las 4 estrategias en paralelo", () => {
        const comparison = matcher.compareStrategies(orders);
        expect(Object.keys(comparison)).toEqual(
            expect.arrayContaining(["PriceFirst", "GreenFirst", "TimeFirst", "BestValue"])
        );
    });

    test("MATCHING_STRATEGIES tiene las 4 estrategias disponibles", () => {
        expect(Object.keys(MATCHING_STRATEGIES)).toHaveLength(4);
    });
});
