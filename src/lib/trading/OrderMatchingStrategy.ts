/**
 * ============================================================
 * PATRÓN: STRATEGY — OrderMatchingStrategy
 * ============================================================
 * Problema: el sistema de matching de órdenes de energía necesita
 * algoritmos distintos según el contexto:
 *   - Mercado abierto → mejor precio primero
 *   - Política verde  → priorizar fuentes renovables
 *   - Fairness        → primero en llegar, primero en ser atendido
 *   - Máximo volumen  → maximizar kWh transaccionados
 *
 * Sin Strategy: un único método con múltiples if/else que crece
 * con cada nueva política de matching. Difícil de testear,
 * imposible de extender sin modificar código existente.
 *
 * Solución: encapsular cada algoritmo en una clase separada que
 * implementa IMatchingStrategy. El contexto (OrderMatcher) recibe
 * la estrategia en runtime y la delega sin conocer su lógica interna.
 *
 * Participantes GoF:
 *   Strategy         → IMatchingStrategy
 *   ConcreteStrategy → PriceFirstStrategy, GreenFirstStrategy,
 *                      TimeFirstStrategy, BestValueStrategy
 *   Context          → OrderMatcher
 * ============================================================
 */

import { type TradeOrder, type EnergySource } from "@/lib/trading/TradeOrderBuilder";

// ── Tipos del dominio ─────────────────────────────────────────

export interface MatchResult {
    buyOrderId:   string;
    sellOrderId:  string;
    matchedKwh:   number;
    pricePerKwh:  number;       // precio acordado (media de buy+sell)
    totalValueUsd: number;
    energySource: EnergySource;
    matchedAt:    Date;
}

export interface MatchSummary {
    strategy:         string;
    totalMatches:     number;
    totalKwhMatched:  number;
    totalValueUsd:    number;
    unmatchedBuys:    number;
    unmatchedSells:   number;
    avgPricePerKwh:   number;
    results:          MatchResult[];
}

// ── STRATEGY — interfaz común ─────────────────────────────────

/**
 * IMatchingStrategy: algoritmo de matching encapsulado.
 * El contexto (OrderMatcher) solo conoce esta interfaz.
 */
export interface IMatchingStrategy {
    readonly name:        string;
    readonly description: string;

    /**
     * Empareja órdenes de compra con órdenes de venta.
     * Devuelve los pares válidos encontrados.
     */
    match(buyOrders: TradeOrder[], sellOrders: TradeOrder[]): MatchResult[];

    /**
     * Ordena las órdenes según la prioridad de esta estrategia.
     * Se usa antes del matching para establecer el orden de procesamiento.
     */
    rank(orders: TradeOrder[], side: "BUY" | "SELL"): TradeOrder[];
}

// ── Helpers compartidos ───────────────────────────────────────

function calcMatchPrice(buy: TradeOrder, sell: TradeOrder): number {
    return parseFloat(((buy.pricePerKwh + sell.pricePerKwh) / 2).toFixed(5));
}

function canMatch(buy: TradeOrder, sell: TradeOrder): boolean {
    return buy.pricePerKwh >= sell.pricePerKwh; // el comprador paga lo que el vendedor pide
}

function buildResult(buy: TradeOrder, sell: TradeOrder, kwh: number): MatchResult {
    const price = calcMatchPrice(buy, sell);
    return {
        buyOrderId:    buy.id,
        sellOrderId:   sell.id,
        matchedKwh:    parseFloat(kwh.toFixed(4)),
        pricePerKwh:   price,
        totalValueUsd: parseFloat((kwh * price).toFixed(4)),
        energySource:  sell.energySource,
        matchedAt:     new Date(),
    };
}

/** Motor de matching genérico: itera buys/sells en el orden dado por rank() */
function runMatching(
    buys:  TradeOrder[],
    sells: TradeOrder[],
): MatchResult[] {
    const results: MatchResult[] = [];
    const remaining = sells.map((s) => ({ order: s, leftKwh: s.amountKwh }));

    for (const buy of buys) {
        let needKwh = buy.amountKwh;

        for (const entry of remaining) {
            if (needKwh <= 0) break;
            if (!canMatch(buy, entry.order)) continue;
            if (entry.leftKwh <= 0) continue;

            const matched = Math.min(needKwh, entry.leftKwh);
            results.push(buildResult(buy, entry.order, matched));
            entry.leftKwh -= matched;
            needKwh       -= matched;
        }
    }

    return results;
}

// ── CONCRETE STRATEGIES ───────────────────────────────────────

/**
 * Estrategia 1 — PRICE FIRST
 * Compras: mayor precio primero (los que más pagan tienen preferencia).
 * Ventas:  menor precio primero (los más baratos se venden antes).
 * Resultado: maximiza el precio de clearance del mercado.
 */
export class PriceFirstStrategy implements IMatchingStrategy {
    readonly name        = "PriceFirst";
    readonly description = "Ordena por mejor precio: compradores con mayor oferta y vendedores con menor precio tienen prioridad.";

    rank(orders: TradeOrder[], side: "BUY" | "SELL"): TradeOrder[] {
        return [...orders].sort((a, b) =>
            side === "BUY"
                ? b.pricePerKwh - a.pricePerKwh   // BUY: mayor precio primero
                : a.pricePerKwh - b.pricePerKwh   // SELL: menor precio primero
        );
    }

    match(buyOrders: TradeOrder[], sellOrders: TradeOrder[]): MatchResult[] {
        return runMatching(this.rank(buyOrders, "BUY"), this.rank(sellOrders, "SELL"));
    }
}

/**
 * Estrategia 2 — GREEN FIRST
 * Prioriza fuentes renovables (SOLAR, WIND, BATTERY) sobre GRID.
 * Dentro de la misma categoría, desempata por precio.
 * Útil para políticas de sostenibilidad o mercados con incentivos verdes.
 */
const GREEN_SOURCES = new Set<EnergySource>(["SOLAR", "WIND", "BATTERY"]);
const GREEN_PRIORITY: Record<EnergySource, number> = {
    SOLAR:   0, WIND: 1, BATTERY: 2, GRID: 3, UNKNOWN: 4,
};

export class GreenFirstStrategy implements IMatchingStrategy {
    readonly name        = "GreenFirst";
    readonly description = "Prioriza fuentes renovables (Solar → Eólica → Batería) antes que la red convencional.";

    rank(orders: TradeOrder[], side: "BUY" | "SELL"): TradeOrder[] {
        return [...orders].sort((a, b) => {
            const greenA = GREEN_PRIORITY[a.energySource] ?? 4;
            const greenB = GREEN_PRIORITY[b.energySource] ?? 4;
            if (greenA !== greenB) return greenA - greenB;  // verde primero
            // Desempate por precio
            return side === "BUY"
                ? b.pricePerKwh - a.pricePerKwh
                : a.pricePerKwh - b.pricePerKwh;
        });
    }

    match(buyOrders: TradeOrder[], sellOrders: TradeOrder[]): MatchResult[] {
        return runMatching(this.rank(buyOrders, "BUY"), this.rank(sellOrders, "SELL"));
    }

    /** Indica si el resultado tiene mayoría de energía verde */
    static isGreenMatch(result: MatchResult): boolean {
        return GREEN_SOURCES.has(result.energySource);
    }
}

/**
 * Estrategia 3 — TIME FIRST (FIFO)
 * Primera orden en llegar = primera en ser atendida.
 * Garantiza fairness: nadie es saltado por pagar más o ser verde.
 * Ideal para mercados regulados con igualdad de acceso.
 */
export class TimeFirstStrategy implements IMatchingStrategy {
    readonly name        = "TimeFirst";
    readonly description = "FIFO: la primera orden en crearse es la primera en ser emparejada (fairness).";

    rank(orders: TradeOrder[], _side: "BUY" | "SELL"): TradeOrder[] {
        return [...orders].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
    }

    match(buyOrders: TradeOrder[], sellOrders: TradeOrder[]): MatchResult[] {
        return runMatching(this.rank(buyOrders, "BUY"), this.rank(sellOrders, "SELL"));
    }
}

/**
 * Estrategia 4 — BEST VALUE
 * Maximiza el total de kWh transaccionados en cada ronda de matching.
 * Prioriza las órdenes de mayor volumen para maximizar el mercado.
 * Útil cuando el objetivo es liquidez, no precio óptimo.
 */
export class BestValueStrategy implements IMatchingStrategy {
    readonly name        = "BestValue";
    readonly description = "Maximiza el volumen de energía transaccionada priorizando las órdenes de mayor kWh.";

    rank(orders: TradeOrder[], _side: "BUY" | "SELL"): TradeOrder[] {
        return [...orders].sort((a, b) => b.amountKwh - a.amountKwh); // mayor volumen primero
    }

    match(buyOrders: TradeOrder[], sellOrders: TradeOrder[]): MatchResult[] {
        return runMatching(this.rank(buyOrders, "BUY"), this.rank(sellOrders, "SELL"));
    }
}

// ── CONTEXT — OrderMatcher ────────────────────────────────────

/**
 * OrderMatcher: el Context del patrón Strategy.
 * Mantiene una referencia a la estrategia activa y delega el trabajo.
 * El cliente puede cambiar la estrategia en cualquier momento sin
 * modificar el Context ni las estrategias existentes.
 */
export class OrderMatcher {
    private _strategy:     IMatchingStrategy;
    private _history:      MatchSummary[] = [];
    private _roundCounter: number = 0;

    constructor(strategy: IMatchingStrategy = new PriceFirstStrategy()) {
        this._strategy = strategy;
    }

    /** Cambia la estrategia en runtime (sin recrear el Context) */
    setStrategy(strategy: IMatchingStrategy): this {
        this._strategy = strategy;
        return this;
    }

    getStrategyName(): string { return this._strategy.name; }
    getStrategy(): IMatchingStrategy { return this._strategy; }

    /**
     * Ejecuta el matching con la estrategia activa.
     * Separa internamente las órdenes en BUY y SELL.
     */
    run(orders: TradeOrder[]): MatchSummary {
        this._roundCounter++;
        const buys  = orders.filter((o) => o.type === "BUY"  && o.status === "DRAFT");
        const sells = orders.filter((o) => o.type === "SELL" && o.status === "DRAFT");

        const results = this._strategy.match(buys, sells);

        const matchedBuyIds  = new Set(results.map((r) => r.buyOrderId));
        const matchedSellIds = new Set(results.map((r) => r.sellOrderId));

        const totalKwh   = results.reduce((s, r) => s + r.matchedKwh, 0);
        const totalValue = results.reduce((s, r) => s + r.totalValueUsd, 0);

        const summary: MatchSummary = {
            strategy:        this._strategy.name,
            totalMatches:    results.length,
            totalKwhMatched: parseFloat(totalKwh.toFixed(4)),
            totalValueUsd:   parseFloat(totalValue.toFixed(4)),
            unmatchedBuys:   buys.filter((o)  => !matchedBuyIds.has(o.id)).length,
            unmatchedSells:  sells.filter((o) => !matchedSellIds.has(o.id)).length,
            avgPricePerKwh:  results.length > 0
                ? parseFloat((totalValue / totalKwh).toFixed(5))
                : 0,
            results,
        };

        this._history.push(summary);
        return summary;
    }

    /** Ejecuta el mismo conjunto de órdenes con TODAS las estrategias y compara */
    compareStrategies(orders: TradeOrder[]): Record<string, MatchSummary> {
        const strategies: IMatchingStrategy[] = [
            new PriceFirstStrategy(),
            new GreenFirstStrategy(),
            new TimeFirstStrategy(),
            new BestValueStrategy(),
        ];

        return Object.fromEntries(
            strategies.map((s) => {
                const originalStrategy = this._strategy;
                this.setStrategy(s);
                const result = this.run(orders);
                this.setStrategy(originalStrategy);
                return [s.name, result];
            })
        );
    }

    getHistory(): MatchSummary[] { return [...this._history]; }
    getRoundCount(): number      { return this._roundCounter; }
}

// ── Estrategias disponibles (registro) ───────────────────────
export const MATCHING_STRATEGIES: Record<string, IMatchingStrategy> = {
    PriceFirst: new PriceFirstStrategy(),
    GreenFirst: new GreenFirstStrategy(),
    TimeFirst:  new TimeFirstStrategy(),
    BestValue:  new BestValueStrategy(),
};

// _Strategy
