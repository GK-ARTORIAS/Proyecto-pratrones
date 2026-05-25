/**
 * Tests: Patrón STATE — OrderStateMachine
 */
import {
    OrderContext,
    DraftState,
    OpenState,
    MatchedState,
    CancelledState,
    ExpiredState,
    OrderStateError,
    createOrderContext,
} from "@/lib/trading/OrderStateMachine";
import { TradeOrderBuilder } from "@/lib/trading/TradeOrderBuilder";

// Mock del MarketEventBus para no disparar eventos en tests
jest.mock("@/lib/market/MarketEventBus", () => ({
    MarketEventBus: {
        getInstance: () => ({
            emitOrderEvent: jest.fn(),
        }),
        reset: jest.fn(),
    },
}));

// ── Fixture ───────────────────────────────────────────────────

function makeOrder() {
    return new TradeOrderBuilder()
        .ofType("SELL").withAmount(10).atPrice(0.12).fromSource("SOLAR").build();
}

const MATCH_META = { matchedKwh: 10, executedPrice: 0.115 };

// ── Tests de DraftState ───────────────────────────────────────

describe("DraftState — Estado inicial", () => {
    let ctx: OrderContext;
    beforeEach(() => { ctx = createOrderContext(makeOrder()); });

    test("el contexto inicia en DRAFT", () => {
        expect(ctx.getStatus()).toBe("DRAFT");
        expect(ctx.getState()).toBeInstanceOf(DraftState);
    });

    test("publish() transiciona de DRAFT a OPEN", () => {
        ctx.publish();
        expect(ctx.getStatus()).toBe("OPEN");
        expect(ctx.getState()).toBeInstanceOf(OpenState);
    });

    test("cancel() transiciona de DRAFT a CANCELLED", () => {
        ctx.cancel("Prueba de cancelación");
        expect(ctx.getStatus()).toBe("CANCELLED");
        expect(ctx.getState()).toBeInstanceOf(CancelledState);
    });

    test("match() en DRAFT lanza OrderStateError", () => {
        expect(() => ctx.match(MATCH_META)).toThrow(OrderStateError);
        expect(() => ctx.match(MATCH_META)).toThrow("DRAFT");
    });

    test("expire() en DRAFT lanza OrderStateError", () => {
        expect(() => ctx.expire()).toThrow(OrderStateError);
        expect(() => ctx.expire()).toThrow("DRAFT");
    });

    test("describe() devuelve descripción del estado DRAFT", () => {
        expect(ctx.describe()).toContain("Borrador");
    });
});

// ── Tests de OpenState ────────────────────────────────────────

describe("OpenState — Orden publicada en mercado", () => {
    let ctx: OrderContext;
    beforeEach(() => {
        ctx = createOrderContext(makeOrder());
        ctx.publish(); // DRAFT → OPEN
    });

    test("el contexto está en OPEN después de publish()", () => {
        expect(ctx.getStatus()).toBe("OPEN");
    });

    test("match() transiciona de OPEN a MATCHED", () => {
        ctx.match(MATCH_META);
        expect(ctx.getStatus()).toBe("MATCHED");
        expect(ctx.getState()).toBeInstanceOf(MatchedState);
    });

    test("cancel() transiciona de OPEN a CANCELLED", () => {
        ctx.cancel("Precio ya no conveniente");
        expect(ctx.getStatus()).toBe("CANCELLED");
    });

    test("expire() transiciona de OPEN a EXPIRED", () => {
        ctx.expire();
        expect(ctx.getStatus()).toBe("EXPIRED");
        expect(ctx.getState()).toBeInstanceOf(ExpiredState);
    });

    test("publish() en OPEN lanza OrderStateError", () => {
        expect(() => ctx.publish()).toThrow(OrderStateError);
        expect(() => ctx.publish()).toThrow("OPEN");
    });

    test("describe() devuelve descripción del estado OPEN", () => {
        expect(ctx.describe()).toContain("Abierta");
    });
});

// ── Tests de MatchedState (terminal) ─────────────────────────

describe("MatchedState — Estado final (ejecutada)", () => {
    let ctx: OrderContext;
    beforeEach(() => {
        ctx = createOrderContext(makeOrder());
        ctx.publish(); // DRAFT → OPEN
        ctx.match(MATCH_META); // OPEN → MATCHED
    });

    test("el contexto está en MATCHED", () => {
        expect(ctx.getStatus()).toBe("MATCHED");
        expect(ctx.isTerminal()).toBe(true);
    });

    test("publish() lanza OrderStateError", () => {
        expect(() => ctx.publish()).toThrow(OrderStateError);
    });

    test("match() lanza OrderStateError", () => {
        expect(() => ctx.match(MATCH_META)).toThrow(OrderStateError);
    });

    test("cancel() lanza OrderStateError", () => {
        expect(() => ctx.cancel("intento")).toThrow(OrderStateError);
    });

    test("expire() lanza OrderStateError", () => {
        expect(() => ctx.expire()).toThrow(OrderStateError);
    });

    test("describe() incluye los kWh y precio ejecutados", () => {
        const desc = ctx.describe();
        expect(desc).toContain("10");
        expect(desc).toContain("0.115");
    });
});

// ── Tests de CancelledState (terminal) ───────────────────────

describe("CancelledState — Estado final (cancelada)", () => {
    let ctx: OrderContext;
    beforeEach(() => {
        ctx = createOrderContext(makeOrder());
        ctx.cancel("Test de cancelación");
    });

    test("el contexto está en CANCELLED", () => {
        expect(ctx.getStatus()).toBe("CANCELLED");
        expect(ctx.isTerminal()).toBe(true);
    });

    test("ninguna operación está permitida desde CANCELLED", () => {
        expect(() => ctx.publish()).toThrow(OrderStateError);
        expect(() => ctx.match(MATCH_META)).toThrow(OrderStateError);
        expect(() => ctx.cancel("de nuevo")).toThrow(OrderStateError);
        expect(() => ctx.expire()).toThrow(OrderStateError);
    });

    test("describe() incluye el motivo de cancelación", () => {
        expect(ctx.describe()).toContain("Test de cancelación");
    });
});

// ── Tests de ExpiredState (terminal) ─────────────────────────

describe("ExpiredState — Estado final (vencida)", () => {
    let ctx: OrderContext;
    beforeEach(() => {
        ctx = createOrderContext(makeOrder());
        ctx.publish(); // DRAFT → OPEN
        ctx.expire();  // OPEN  → EXPIRED
    });

    test("el contexto está en EXPIRED", () => {
        expect(ctx.getStatus()).toBe("EXPIRED");
        expect(ctx.isTerminal()).toBe(true);
    });

    test("ninguna operación está permitida desde EXPIRED", () => {
        expect(() => ctx.publish()).toThrow(OrderStateError);
        expect(() => ctx.match(MATCH_META)).toThrow(OrderStateError);
        expect(() => ctx.cancel("intento")).toThrow(OrderStateError);
        expect(() => ctx.expire()).toThrow(OrderStateError);
    });

    test("describe() menciona que venció", () => {
        expect(ctx.describe()).toContain("Expirada");
    });
});

// ── Tests del historial de transiciones ──────────────────────

describe("OrderContext — Historial de transiciones", () => {

    test("cada transición queda registrada en el historial", () => {
        const ctx = createOrderContext(makeOrder());
        ctx.publish();
        ctx.match(MATCH_META);
        const history = ctx.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0]).toMatchObject({ from: "DRAFT",  to: "OPEN",    action: "publish" });
        expect(history[1]).toMatchObject({ from: "OPEN",   to: "MATCHED", action: "match"   });
    });

    test("la cancelación registra el motivo en metadata", () => {
        const ctx = createOrderContext(makeOrder());
        ctx.publish();
        ctx.cancel("Precio fuera de rango");
        const last = ctx.getHistory().at(-1)!;
        expect(last.metadata?.reason).toBe("Precio fuera de rango");
    });

    test("una orden que no transiciona tiene historial vacío", () => {
        const ctx = createOrderContext(makeOrder());
        expect(ctx.getHistory()).toHaveLength(0);
    });
});

// ── Tests de flujos completos ─────────────────────────────────

describe("Flujos completos del ciclo de vida", () => {

    test("flujo feliz: DRAFT → OPEN → MATCHED", () => {
        const ctx = createOrderContext(makeOrder());
        expect(ctx.getStatus()).toBe("DRAFT");
        ctx.publish();
        expect(ctx.getStatus()).toBe("OPEN");
        ctx.match({ matchedKwh: 10, executedPrice: 0.115 });
        expect(ctx.getStatus()).toBe("MATCHED");
        expect(ctx.isTerminal()).toBe(true);
    });

    test("flujo de expiración: DRAFT → OPEN → EXPIRED", () => {
        const ctx = createOrderContext(makeOrder());
        ctx.publish();
        ctx.expire();
        expect(ctx.getStatus()).toBe("EXPIRED");
    });

    test("flujo de cancelación temprana: DRAFT → CANCELLED", () => {
        const ctx = createOrderContext(makeOrder());
        ctx.cancel("Cambio de estrategia");
        expect(ctx.getStatus()).toBe("CANCELLED");
        expect(ctx.getHistory()).toHaveLength(1);
    });

    test("OrderStateError contiene información del estado y acción", () => {
        const ctx = createOrderContext(makeOrder());
        ctx.publish();
        ctx.match(MATCH_META);
        try {
            ctx.cancel("tarde");
        } catch (e) {
            expect(e).toBeInstanceOf(OrderStateError);
            expect((e as OrderStateError).from).toBe("MATCHED");
            expect((e as OrderStateError).action).toBe("cancelar");
        }
    });
});
