/**
 * ============================================================
 * PATRÓN: STATE — OrderStateMachine
 * ============================================================
 * Problema: una orden de trading pasa por varios estados:
 *   DRAFT → OPEN → MATCHED | EXPIRED | CANCELLED
 *
 * Sin State: el código usa strings ("OPEN", "MATCHED") y
 * cualquier parte puede asignar cualquier estado sin validación:
 *   order.status = "MATCHED"; // ¿pero estaba OPEN? ¿o DRAFT?
 *   order.status = "CANCELLED"; // ¿puede cancelarse una MATCHED?
 *
 * Resultado: bugs silenciosos, transiciones imposibles en el
 * dominio, código de validación disperso por toda la app.
 *
 * Solución: cada estado es un objeto que encapsula el
 * comportamiento válido en ese estado. Las transiciones
 * inválidas lanzan un error descriptivo. El contexto
 * (OrderContext) delega todas las operaciones al estado actual.
 *
 * Participantes GoF:
 *   State          → IOrderState
 *   ConcreteState  → DraftState, OpenState, MatchedState,
 *                    CancelledState, ExpiredState
 *   Context        → OrderContext
 * ============================================================
 */

import { type TradeOrder, type OrderStatus } from "@/lib/trading/TradeOrderBuilder";
import { MarketEventBus, type OrderPayload } from "@/lib/market/MarketEventBus";

// ── Tipos de la máquina de estados ───────────────────────────

export interface StateTransition {
    from:      OrderStatus;
    to:        OrderStatus;
    action:    string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface MatchMetadata {
    matchedKwh:    number;
    executedPrice: number;
    counterpartyId?: string;
}

// ── STATE — interfaz común ────────────────────────────────────

/**
 * IOrderState: define las operaciones válidas para un estado de orden.
 * Cada estado implementa solo las transiciones que le corresponden.
 * Las transiciones inválidas lanzan OrderStateError.
 */
export interface IOrderState {
    readonly statusName: OrderStatus;

    /** DRAFT → OPEN: publica la orden en el mercado */
    publish(ctx: OrderContext): void;

    /** OPEN → MATCHED: empareja la orden con una contraparte */
    match(ctx: OrderContext, meta: MatchMetadata): void;

    /** DRAFT | OPEN → CANCELLED: cancela la orden */
    cancel(ctx: OrderContext, reason: string): void;

    /** OPEN → EXPIRED: la orden venció sin ejecutarse */
    expire(ctx: OrderContext): void;

    /** Descripción del estado para UI */
    describe(): string;
}

// ── Error de transición inválida ──────────────────────────────

export class OrderStateError extends Error {
    constructor(
        public readonly from:    OrderStatus,
        public readonly action:  string,
        public readonly reason:  string,
    ) {
        super(`[OrderState] No se puede ${action} una orden en estado ${from}: ${reason}`);
        this.name = "OrderStateError";
    }
}

// ── CONCRETE STATES ───────────────────────────────────────────

/**
 * DraftState: orden recién creada, no visible en el mercado.
 * Puede → publicarse (→ OPEN) o cancelarse (→ CANCELLED).
 * No puede → matchearse ni vencerse.
 */
export class DraftState implements IOrderState {
    readonly statusName: OrderStatus = "DRAFT";

    publish(ctx: OrderContext): void {
        ctx._transition(new OpenState(), "publish", {});
        MarketEventBus.getInstance().emitOrderEvent(
            "ORDER_PUBLISHED",
            ctx.toOrderPayload(),
            "OrderStateMachine"
        );
    }

    match(): void {
        throw new OrderStateError("DRAFT", "matchear", "la orden debe estar OPEN para ejecutarse");
    }

    cancel(ctx: OrderContext, reason: string): void {
        ctx._transition(new CancelledState(reason), "cancel", { reason });
        MarketEventBus.getInstance().emitOrderEvent(
            "ORDER_CANCELLED",
            { ...ctx.toOrderPayload(), reason },
            "OrderStateMachine"
        );
    }

    expire(): void {
        throw new OrderStateError("DRAFT", "vencer", "solo las órdenes OPEN pueden vencer");
    }

    describe(): string { return "Borrador — aún no publicada en el mercado"; }
}

/**
 * OpenState: orden publicada, visible en el libro de órdenes.
 * Puede → matchearse (→ MATCHED), cancelarse (→ CANCELLED),
 *         vencerse (→ EXPIRED).
 * No puede → publicarse de nuevo.
 */
export class OpenState implements IOrderState {
    readonly statusName: OrderStatus = "OPEN";

    publish(): void {
        throw new OrderStateError("OPEN", "publicar", "la orden ya está publicada");
    }

    match(ctx: OrderContext, meta: MatchMetadata): void {
        ctx._transition(new MatchedState(meta), "match", meta as unknown as Record<string, unknown>);
        MarketEventBus.getInstance().emitOrderEvent(
            "ORDER_MATCHED",
            ctx.toOrderPayload(),
            "OrderStateMachine"
        );
    }

    cancel(ctx: OrderContext, reason: string): void {
        ctx._transition(new CancelledState(reason), "cancel", { reason });
        MarketEventBus.getInstance().emitOrderEvent(
            "ORDER_CANCELLED",
            { ...ctx.toOrderPayload(), reason },
            "OrderStateMachine"
        );
    }

    expire(ctx: OrderContext): void {
        ctx._transition(new ExpiredState(), "expire", {});
        MarketEventBus.getInstance().emitOrderEvent(
            "ORDER_EXPIRED",
            ctx.toOrderPayload(),
            "OrderStateMachine"
        );
    }

    describe(): string { return "Abierta — visible en el mercado, esperando contraparte"; }
}

/**
 * MatchedState: orden completamente ejecutada.
 * Estado FINAL — no admite ninguna transición posterior.
 */
export class MatchedState implements IOrderState {
    readonly statusName: OrderStatus = "MATCHED";

    constructor(readonly matchMeta: MatchMetadata) {}

    publish(): void { throw new OrderStateError("MATCHED", "publicar", "la orden ya fue ejecutada"); }
    match():   void { throw new OrderStateError("MATCHED", "matchear", "la orden ya fue ejecutada"); }
    cancel():  void { throw new OrderStateError("MATCHED", "cancelar", "no se puede cancelar una orden ya ejecutada"); }
    expire():  void { throw new OrderStateError("MATCHED", "vencer",   "una orden ejecutada no puede vencer"); }

    describe(): string {
        return `Ejecutada — ${this.matchMeta.matchedKwh} kWh a $${this.matchMeta.executedPrice}/kWh`;
    }
}

/**
 * CancelledState: orden cancelada manualmente.
 * Estado FINAL — no admite ninguna transición posterior.
 */
export class CancelledState implements IOrderState {
    readonly statusName: OrderStatus = "CANCELLED";

    constructor(readonly reason: string = "Cancelación manual") {}

    publish(): void { throw new OrderStateError("CANCELLED", "publicar", "la orden fue cancelada"); }
    match():   void { throw new OrderStateError("CANCELLED", "matchear", "la orden fue cancelada"); }
    cancel():  void { throw new OrderStateError("CANCELLED", "cancelar", "la orden ya está cancelada"); }
    expire():  void { throw new OrderStateError("CANCELLED", "vencer",   "la orden fue cancelada"); }

    describe(): string { return `Cancelada — motivo: ${this.reason}`; }
}

/**
 * ExpiredState: orden que venció sin encontrar contraparte.
 * Estado FINAL — no admite ninguna transición posterior.
 */
export class ExpiredState implements IOrderState {
    readonly statusName: OrderStatus = "EXPIRED";

    publish(): void { throw new OrderStateError("EXPIRED", "publicar", "la orden venció"); }
    match():   void { throw new OrderStateError("EXPIRED", "matchear", "la orden venció"); }
    cancel():  void { throw new OrderStateError("EXPIRED", "cancelar", "la orden venció"); }
    expire():  void { throw new OrderStateError("EXPIRED", "vencer",   "la orden ya está vencida"); }

    describe(): string { return "Expirada — no se encontró contraparte a tiempo"; }
}

// ── CONTEXT — OrderContext ────────────────────────────────────

/**
 * OrderContext: el Context del patrón State.
 * Mantiene una referencia al estado actual y delega todas
 * las operaciones a él. Gestiona el historial de transiciones.
 */
export class OrderContext {
    private _state:   IOrderState;
    private readonly _history: StateTransition[] = [];

    constructor(private readonly _order: TradeOrder) {
        // La orden comienza siempre en DraftState
        this._state = new DraftState();
    }

    // ── Operaciones delegadas al estado actual ────────────────

    /** Publica la orden (DRAFT → OPEN) */
    publish(): void { this._state.publish(this); }

    /** Empareja la orden (OPEN → MATCHED) */
    match(meta: MatchMetadata): void { this._state.match(this, meta); }

    /** Cancela la orden (DRAFT|OPEN → CANCELLED) */
    cancel(reason = "Cancelación manual"): void { this._state.cancel(this, reason); }

    /** Vence la orden (OPEN → EXPIRED) */
    expire(): void { this._state.expire(this); }

    // ── Consultas ─────────────────────────────────────────────

    getStatus():   OrderStatus  { return this._state.statusName; }
    getState():    IOrderState  { return this._state; }
    describe():    string       { return this._state.describe(); }
    getHistory():  StateTransition[] { return [...this._history]; }
    getOrder():    TradeOrder   { return this._order; }
    isTerminal():  boolean {
        return ["MATCHED", "CANCELLED", "EXPIRED"].includes(this._state.statusName);
    }

    // ── Método interno para transiciones ──────────────────────
    /** Solo los estados pueden llamar este método */
    _transition(
        newState: IOrderState,
        action:   string,
        metadata: Record<string, unknown>,
    ): void {
        const transition: StateTransition = {
            from:      this._state.statusName,
            to:        newState.statusName,
            action,
            timestamp: new Date(),
            metadata,
        };
        this._history.push(transition);
        this._state = newState;
    }

    toOrderPayload(): OrderPayload {
        return {
            orderId:     this._order.id,
            type:        this._order.type,
            amountKwh:   this._order.amountKwh,
            pricePerKwh: this._order.pricePerKwh,
        };
    }
}

// ── Factory de contexto ───────────────────────────────────────

export function createOrderContext(order: TradeOrder): OrderContext {
    return new OrderContext(order);
}

// _State
