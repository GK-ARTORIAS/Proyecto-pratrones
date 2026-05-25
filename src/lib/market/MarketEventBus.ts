/**
 * ============================================================
 * PATRÓN: OBSERVER — MarketEventBus
 * ============================================================
 * Problema: cuando el precio de mercado cambia, múltiples
 * subsistemas necesitan reaccionar:
 *   - El logger debe registrar el cambio
 *   - El bridge debe enviar una alerta si es un spike
 *   - El matcher debe re-evaluar órdenes pendientes
 *   - La UI debe mostrar una notificación
 *
 * Sin Observer: el código que detecta el precio llama
 * directamente a cada subsistema → alto acoplamiento.
 * Agregar un nuevo "reaccionador" → modificar el detector.
 *
 * Solución: el Subject (MarketEventBus) emite eventos sin
 * conocer a sus suscriptores. Cada Observer decide si le
 * interesa el evento y cómo reaccionar. Completamente desacoplado.
 *
 * Participantes GoF:
 *   Subject          → MarketEventBus
 *   Observer         → IMarketObserver
 *   ConcreteObserver → PriceLogObserver, AlertObserver,
 *                      OrderMatchingObserver, UIFeedObserver
 * ============================================================
 */

import { PriceAlertNotifier, DeviceNotifier, InAppChannel }
    from "@/lib/notifications/NotificationBridge";

// ── Tipos de eventos del mercado ──────────────────────────────

export type MarketEventType =
    | "PRICE_UPDATED"          // cotización normal periódica
    | "PRICE_SPIKE"            // precio supera umbral crítico
    | "PRICE_DROP"             // precio cae bruscamente
    | "ORDER_MATCHED"          // par compra/venta ejecutado
    | "ORDER_EXPIRED"          // orden expiró sin ejecutarse
    | "ORDER_CANCELLED"        // orden cancelada manualmente
    | "ORDER_PUBLISHED"        // orden pasó de DRAFT a OPEN
    | "DEVICE_OFFLINE"         // dispositivo IoT se desconectó
    | "DEVICE_ONLINE"          // dispositivo IoT volvió a conectar
    | "MARKET_SUMMARY_READY";  // resumen de mercado disponible

export interface MarketEvent<T = unknown> {
    readonly id:        string;
    readonly type:      MarketEventType;
    readonly payload:   T;
    readonly timestamp: Date;
    readonly source:    string;   // quién emitió el evento
}

// Payloads tipados por evento
export interface PricePayload {
    source:       string;
    pricePerKwh:  number;
    previousPrice?: number;
    trend:        "UP" | "DOWN" | "STABLE";
    threshold?:   number;
}

export interface OrderPayload {
    orderId:      string;
    type:         "BUY" | "SELL";
    amountKwh:    number;
    pricePerKwh:  number;
    reason?:      string;
}

export interface DevicePayload {
    deviceId:     string;
    deviceName:   string;
    previousStatus: string;
    newStatus:    string;
}

// ── OBSERVER — interfaz común ─────────────────────────────────

/**
 * IMarketObserver: contrato que deben cumplir todos los suscriptores.
 * Cada Observer declara qué tipos de eventos le interesan.
 */
export interface IMarketObserver {
    readonly observerId:    string;
    readonly observerName:  string;
    readonly interestedIn:  MarketEventType[];  // filtro declarativo

    onEvent(event: MarketEvent): void | Promise<void>;
}

// ── CONCRETE OBSERVERS ────────────────────────────────────────

/**
 * Observer 1 — PriceLogObserver
 * Registra en memoria un historial de todos los precios recibidos.
 * Interesado en: PRICE_UPDATED, PRICE_SPIKE, PRICE_DROP
 */
export class PriceLogObserver implements IMarketObserver {
    readonly observerId   = "price-log";
    readonly observerName = "Registro de precios";
    readonly interestedIn: MarketEventType[] = ["PRICE_UPDATED", "PRICE_SPIKE", "PRICE_DROP"];

    private readonly _log: Array<{ event: MarketEvent<PricePayload>; receivedAt: Date }> = [];
    private readonly _maxEntries: number;

    constructor(maxEntries = 500) { this._maxEntries = maxEntries; }

    onEvent(event: MarketEvent): void {
        const priceEvent = event as MarketEvent<PricePayload>;
        this._log.unshift({ event: priceEvent, receivedAt: new Date() });
        if (this._log.length > this._maxEntries) this._log.pop();
    }

    getLog() { return [...this._log]; }
    getLatest() { return this._log[0] ?? null; }
    getSpikes() { return this._log.filter((e) => e.event.type === "PRICE_SPIKE"); }
    getAvgPrice(): number {
        if (this._log.length === 0) return 0;
        const sum = this._log.reduce((s, e) => s + e.event.payload.pricePerKwh, 0);
        return parseFloat((sum / this._log.length).toFixed(5));
    }
}

/**
 * Observer 2 — AlertObserver
 * Usa el Bridge de notificaciones para enviar alertas en tiempo real.
 * Interesado en: PRICE_SPIKE, DEVICE_OFFLINE
 */
export class AlertObserver implements IMarketObserver {
    readonly observerId   = "alert-observer";
    readonly observerName = "Sistema de alertas";
    readonly interestedIn: MarketEventType[] = ["PRICE_SPIKE", "DEVICE_OFFLINE", "PRICE_DROP"];

    private _alertCount = 0;

    async onEvent(event: MarketEvent): Promise<void> {
        const channel = InAppChannel.getInstance();

        if (event.type === "PRICE_SPIKE") {
            const p = event.payload as PricePayload;
            await new PriceAlertNotifier(channel)
                .alertPriceSpike(p.source, p.pricePerKwh, p.threshold ?? 0.15);
            this._alertCount++;
        }

        if (event.type === "PRICE_DROP") {
            const p = event.payload as PricePayload;
            await new PriceAlertNotifier(channel)
                .alertPriceDrop(p.source, p.pricePerKwh, p.previousPrice ?? 0);
            this._alertCount++;
        }

        if (event.type === "DEVICE_OFFLINE") {
            const p = event.payload as DevicePayload;
            await new DeviceNotifier(channel)
                .notifyDeviceOffline(p.deviceId, p.deviceName);
            this._alertCount++;
        }
    }

    getAlertCount() { return this._alertCount; }
}

/**
 * Observer 3 — OrderMatchingObserver
 * Reacciona a actualizaciones de precio para re-evaluar el libro de órdenes.
 * Interesado en: PRICE_UPDATED, PRICE_SPIKE
 */
export class OrderMatchingObserver implements IMarketObserver {
    readonly observerId   = "order-matching";
    readonly observerName = "Motor de matching";
    readonly interestedIn: MarketEventType[] = ["PRICE_UPDATED", "PRICE_SPIKE"];

    private _triggeredCount  = 0;
    private _lastTriggerPrice: number | null = null;
    private readonly _priceChangeThreshold: number; // % mínimo para re-evaluar

    constructor(priceChangeThresholdPercent = 2) {
        this._priceChangeThreshold = priceChangeThresholdPercent / 100;
    }

    onEvent(event: MarketEvent): void {
        const p = event.payload as PricePayload;

        // Re-evalúa solo si el precio cambió más del umbral
        if (this._lastTriggerPrice !== null) {
            const delta = Math.abs(p.pricePerKwh - this._lastTriggerPrice) / this._lastTriggerPrice;
            if (delta < this._priceChangeThreshold) return;
        }

        this._triggeredCount++;
        this._lastTriggerPrice = p.pricePerKwh;
        // En producción: llamaría a OrderMatcher.run(openOrders)
        // console.debug(`[OrderMatchingObserver] Re-evaluando libro a $${p.pricePerKwh}`);
    }

    getTriggeredCount()   { return this._triggeredCount; }
    getLastTriggerPrice() { return this._lastTriggerPrice; }
}

/**
 * Observer 4 — UIFeedObserver
 * Mantiene un feed de eventos recientes para mostrar en la UI.
 * Interesado en: todos los eventos.
 */
export class UIFeedObserver implements IMarketObserver {
    readonly observerId   = "ui-feed";
    readonly observerName = "Feed de la interfaz";
    readonly interestedIn: MarketEventType[] = [
        "PRICE_UPDATED", "PRICE_SPIKE", "PRICE_DROP",
        "ORDER_MATCHED", "ORDER_EXPIRED", "ORDER_CANCELLED", "ORDER_PUBLISHED",
        "DEVICE_OFFLINE", "DEVICE_ONLINE", "MARKET_SUMMARY_READY",
    ];

    private readonly _feed: MarketEvent[] = [];
    private readonly _maxSize: number;

    constructor(maxSize = 50) { this._maxSize = maxSize; }

    onEvent(event: MarketEvent): void {
        this._feed.unshift(event);
        if (this._feed.length > this._maxSize) this._feed.pop();
    }

    getFeed()                          { return [...this._feed]; }
    getFeedByType(type: MarketEventType) { return this._feed.filter((e) => e.type === type); }
    clear()                            { this._feed.length = 0; }
}

// ── SUBJECT — MarketEventBus ──────────────────────────────────

let _eventSeq = 0;

/**
 * MarketEventBus: el Subject (Observable) del patrón Observer.
 * Mantiene la lista de suscriptores y les notifica cuando ocurre
 * un evento. No sabe nada de lo que cada Observer hace con el evento.
 */
export class MarketEventBus {
    private static _instance: MarketEventBus | null = null;

    private readonly _observers    = new Map<string, IMarketObserver>();
    private readonly _eventLog:    MarketEvent[] = [];
    private readonly _maxLogSize:  number;
    private _emitCount             = 0;

    constructor(maxLogSize = 1000) { this._maxLogSize = maxLogSize; }

    /** Singleton para uso global */
    static getInstance(): MarketEventBus {
        if (!MarketEventBus._instance)
            MarketEventBus._instance = new MarketEventBus();
        return MarketEventBus._instance;
    }

    // ── Gestión de suscriptores ───────────────────────────────

    subscribe(observer: IMarketObserver): void {
        this._observers.set(observer.observerId, observer);
    }

    unsubscribe(observerId: string): void {
        this._observers.delete(observerId);
    }

    isSubscribed(observerId: string): boolean {
        return this._observers.has(observerId);
    }

    getObserverCount(): number { return this._observers.size; }

    // ── Emisión de eventos ────────────────────────────────────

    /**
     * Emite un evento a todos los suscriptores interesados.
     * Cada observer filtra por su lista interestedIn.
     */
    async emit<T>(
        type:    MarketEventType,
        payload: T,
        source:  string = "system",
    ): Promise<void> {
        const event: MarketEvent<T> = {
            id:        `EVT-${(++_eventSeq).toString(36).toUpperCase()}`,
            type,
            payload,
            timestamp: new Date(),
            source,
        };

        // Guarda en log interno
        this._eventLog.unshift(event as MarketEvent);
        if (this._eventLog.length > this._maxLogSize) this._eventLog.pop();
        this._emitCount++;

        // Notifica a todos los observers interesados (en paralelo)
        const interestedObservers = Array.from(this._observers.values())
            .filter((o) => o.interestedIn.includes(type));

        await Promise.allSettled(
            interestedObservers.map((o) => Promise.resolve(o.onEvent(event as MarketEvent)))
        );
    }

    // ── Helpers para emitir eventos tipados ──────────────────

    async emitPriceUpdate(payload: PricePayload, source = "MarketAdapter"): Promise<void> {
        const type: MarketEventType = payload.pricePerKwh > (payload.threshold ?? 0.15)
            ? "PRICE_SPIKE" : "PRICE_UPDATED";
        await this.emit(type, payload, source);
    }

    async emitOrderEvent(type: MarketEventType, payload: OrderPayload, source = "OrderMatcher"): Promise<void> {
        await this.emit(type, payload, source);
    }

    async emitDeviceEvent(type: MarketEventType, payload: DevicePayload, source = "DeviceService"): Promise<void> {
        await this.emit(type, payload, source);
    }

    // ── Consultas ─────────────────────────────────────────────

    getLog():                   MarketEvent[] { return [...this._eventLog]; }
    getLogByType(t: MarketEventType) { return this._eventLog.filter((e) => e.type === t); }
    getEmitCount():             number        { return this._emitCount; }

    /** Reinicia el singleton (útil en tests) */
    static reset(): void { MarketEventBus._instance = null; }
}

// _Observer
