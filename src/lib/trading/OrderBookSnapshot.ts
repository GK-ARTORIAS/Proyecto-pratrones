/**
 * ============================================================
 * PATRÓN: MEMENTO — OrderBookSnapshot
 * ============================================================
 * Problema: el libro de órdenes activas (OrderBook) es mutable.
 * El operador puede:
 *   - Añadir órdenes manualmente
 *   - Cambiar el precio de referencia del mercado
 *   - Eliminar órdenes en lote
 *
 * Sin Memento: si el operador comete un error (elimina las
 * órdenes equivocadas, establece un precio incorrecto) no hay
 * forma de volver atrás. La información se pierde.
 *
 * ALCANCE REDUCIDO (demo): el Memento guarda/restaura el estado
 * completo del libro de órdenes y el precio de mercado.
 * No cubre undo/redo infinito: el Caretaker mantiene un máximo
 * de 5 snapshots por limitación intencional del demo.
 *
 * Solución: antes de cada operación destructiva, el Originator
 * (OrderBook) crea un Memento con una copia de su estado interno.
 * El Caretaker (OrderBookHistory) almacena los Mementos y puede
 * solicitar al Originator que se restaure a uno anterior.
 * El Originator nunca expone su estado interno directamente.
 *
 * Participantes GoF:
 *   Originator → OrderBook
 *   Memento    → OrderBookMemento  (estado opaco para el Caretaker)
 *   Caretaker  → OrderBookHistory
 * ============================================================
 */

import { type TradeOrder } from "@/lib/trading/TradeOrderBuilder";

// ── MEMENTO ───────────────────────────────────────────────────

/**
 * OrderBookMemento: snapshot inmutable del estado del OrderBook.
 *
 * El estado es OPACO para el Caretaker: solo el Originator
 * (OrderBook) conoce su estructura interna y puede leerla.
 * El Caretaker solo puede obtener metadatos (timestamp, label).
 */
export class OrderBookMemento {
    // Estado interno — solo accesible desde OrderBook (convención de módulo)
    /** @internal */ readonly _orders:       readonly TradeOrder[];
    /** @internal */ readonly _marketPrice:  number;
    /** @internal */ readonly _isLocked:     boolean;

    readonly createdAt: Date;
    readonly label:     string;

    /** @internal Solo el Originator debe construir Mementos */
    constructor(
        orders:      readonly TradeOrder[],
        marketPrice: number,
        isLocked:    boolean,
        label:       string,
    ) {
        // Copia profunda de las órdenes para evitar mutación compartida
        this._orders      = Object.freeze([...orders]);
        this._marketPrice = marketPrice;
        this._isLocked    = isLocked;
        this.createdAt    = new Date();
        this.label        = label;
    }

    /** Información visible para el Caretaker (solo metadatos) */
    getMetadata(): { label: string; createdAt: Date; orderCount: number; marketPrice: number } {
        return {
            label:       this.label,
            createdAt:   this.createdAt,
            orderCount:  this._orders.length,
            marketPrice: this._marketPrice,
        };
    }
}

// ── ORIGINATOR — OrderBook ────────────────────────────────────

/**
 * OrderBook: el Originator del patrón Memento.
 *
 * Mantiene el estado interno del libro de órdenes activo.
 * Es el único que sabe cómo crear y restaurar Mementos.
 * Nunca expone sus campos internos directamente al Caretaker.
 */
export class OrderBook {
    private _orders:      TradeOrder[] = [];
    private _marketPrice: number       = 0;
    private _isLocked:    boolean      = false;

    constructor(initialPrice = 0) {
        this._marketPrice = initialPrice;
    }

    // ── Operaciones del libro ─────────────────────────────────

    addOrder(order: TradeOrder): void {
        if (this._isLocked) throw new Error("[OrderBook] El libro está bloqueado.");
        this._orders.push(order);
    }

    removeOrder(orderId: string): boolean {
        const idx = this._orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return false;
        this._orders.splice(idx, 1);
        return true;
    }

    clearAllOrders(): void {
        this._orders = [];
    }

    setMarketPrice(price: number): void {
        if (price < 0) throw new Error("[OrderBook] El precio no puede ser negativo.");
        this._marketPrice = price;
    }

    lock():   void { this._isLocked = true;  }
    unlock(): void { this._isLocked = false; }

    // ── Consultas ─────────────────────────────────────────────

    getOrders():       readonly TradeOrder[] { return [...this._orders]; }
    getOrderCount():   number                { return this._orders.length; }
    getMarketPrice():  number                { return this._marketPrice; }
    isLocked():        boolean               { return this._isLocked; }

    getBuyOrders():    TradeOrder[] { return this._orders.filter((o) => o.type === "BUY"); }
    getSellOrders():   TradeOrder[] { return this._orders.filter((o) => o.type === "SELL"); }

    // ── MEMENTO — crear y restaurar ───────────────────────────

    /**
     * Crea un snapshot del estado actual.
     * El label ayuda al Caretaker a identificar cuándo se tomó.
     */
    save(label = "snapshot"): OrderBookMemento {
        return new OrderBookMemento(
            this._orders,
            this._marketPrice,
            this._isLocked,
            label,
        );
    }

    /**
     * Restaura el estado desde un Memento.
     * Solo el Originator puede leer el estado interno del Memento.
     */
    restore(memento: OrderBookMemento): void {
        this._orders      = [...memento._orders];
        this._marketPrice = memento._marketPrice;
        this._isLocked    = memento._isLocked;
    }

    describe(): string {
        const status = this._isLocked ? "🔒 BLOQUEADO" : "🔓 Abierto";
        return (
            `OrderBook [${status}] — Precio: $${this._marketPrice}/kWh\n` +
            `  📋 Órdenes activas: ${this._orders.length} ` +
            `(${this.getBuyOrders().length} compra / ${this.getSellOrders().length} venta)`
        );
    }
}

// ── CARETAKER — OrderBookHistory ─────────────────────────────

/**
 * OrderBookHistory: el Caretaker del patrón Memento.
 *
 * Almacena los Mementos y sabe CUÁNDO tomar snapshots, pero
 * NUNCA inspecciona ni modifica el estado interno de los Mementos.
 * Solo manipula los Mementos como cajas opacas.
 *
 * Límite de demo: máximo 5 snapshots retenidos (FIFO cuando
 * se supera el límite).
 */
export class OrderBookHistory {
    private readonly _snapshots: OrderBookMemento[] = [];
    private readonly _maxSnapshots: number;

    constructor(
        private readonly _book: OrderBook,
        maxSnapshots = 5,
    ) {
        this._maxSnapshots = maxSnapshots;
    }

    /**
     * Toma un snapshot del estado actual del libro.
     * El Caretaker simplemente pide al Originator que cree el Memento.
     */
    takeSnapshot(label?: string): OrderBookMemento {
        const autoLabel = label ?? `snapshot-${this._snapshots.length + 1}`;
        const memento   = this._book.save(autoLabel);

        this._snapshots.push(memento);

        // FIFO: elimina el snapshot más antiguo si se supera el límite
        if (this._snapshots.length > this._maxSnapshots) {
            this._snapshots.shift();
        }

        return memento;
    }

    /**
     * Deshace el último cambio: restaura el snapshot más reciente
     * y lo elimina de la pila (undo).
     */
    undo(): boolean {
        if (this._snapshots.length === 0) return false;
        const last = this._snapshots.pop()!;
        this._book.restore(last);
        return true;
    }

    /**
     * Restaura un snapshot específico por su índice (0 = más antiguo).
     * No elimina el resto de la historia.
     */
    restoreAt(index: number): boolean {
        const memento = this._snapshots[index];
        if (!memento) return false;
        this._book.restore(memento);
        return true;
    }

    /**
     * Restaura el primer snapshot guardado (estado base).
     */
    restoreInitial(): boolean {
        return this.restoreAt(0);
    }

    // ── Consultas (solo metadatos, nunca estado interno) ──────

    getSnapshotCount(): number { return this._snapshots.length; }
    canUndo():          boolean { return this._snapshots.length > 0; }

    /** Lista de metadatos de los snapshots — estado opaco */
    listSnapshots(): ReturnType<OrderBookMemento["getMetadata"]>[] {
        return this._snapshots.map((s) => s.getMetadata());
    }

    /** Metadatos del snapshot más reciente */
    getLatestMetadata() {
        return this._snapshots.at(-1)?.getMetadata() ?? null;
    }
}

// _Memento
