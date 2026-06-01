/**
 * ============================================================
 * PATRÓN: MEDIATOR — TradingMediator
 * ============================================================
 * Problema: al procesar un match de órdenes de energía, múltiples
 * subsistemas necesitan coordinarse:
 *
 *   OrderMatcher  ──────────────────────────────────────► MarketEventBus
 *        │                                                      │
 *        └────────────────────────────────────────────► InvoiceProcessor
 *        │                                                      │
 *        └────────────────────────────────────────────► AlertValidationChain
 *
 * Sin Mediator: cada subsistema conoce referencias directas
 * a los demás. Cambiar uno implica actualizar todos. Es una red
 * de dependencias cruzadas (n * (n-1) / 2 conexiones), imposible
 * de mantener a medida que el sistema crece.
 *
 * Solución: un objeto Mediator centraliza toda la comunicación.
 * Cada componente solo conoce al Mediator; el Mediator conoce a
 * todos. Las dependencias quedan reducidas a n (en lugar de n²).
 *
 * Participantes GoF:
 *   Mediator         → ITradingMediator
 *   ConcreteMediator → TradingMediator
 *   Colleague        → OrderMatcher, MarketEventBus, DeviceCommandBus,
 *                      BaseInvoiceProcessor, AlertValidationChain
 * ============================================================
 */

import { OrderMatcher, type MatchSummary, type MatchResult }
    from "@/lib/trading/OrderMatchingStrategy";

import { MarketEventBus, type OrderPayload }
    from "@/lib/market/MarketEventBus";

import { DeviceCommandBus }
    from "@/lib/iot/DeviceCommandBus";

import { AlertValidationChain, type AlertRequest }
    from "@/lib/iot/AlertValidationChain";

import {
    ConsumerInvoiceProcessor,
    ProducerInvoiceProcessor,
    StorageOperatorInvoiceProcessor,
    type Invoice,
    type BaseInvoiceProcessor,
} from "@/lib/trading/BaseInvoiceProcessor";

import { type TradeOrder } from "@/lib/trading/TradeOrderBuilder";

// ── Tipos del dominio del Mediator ────────────────────────────

export type ParticipantRole = "CONSUMER" | "PRODUCER" | "STORAGE_OPERATOR";

export interface MediatorMatchRequest {
    orders:       TradeOrder[];
    requesterRole: ParticipantRole;
    strategyName?: string;   // nombre de la estrategia de matching a usar
}

export interface MediatorMatchResult {
    summary:    MatchSummary;
    invoices:   Invoice[];
    eventsEmitted: number;
    durationMs: number;
}

export interface MediatorAlertRequest {
    deviceAlert: AlertRequest;
    deviceRole:  ParticipantRole;
}

export interface MediatorAlertResult {
    shouldAlert:  boolean;
    log:          Array<{ handlerName: string; verdict: string; reason: string }>;
    autoCommandSent: boolean;
}

// ── MEDIATOR — interfaz ───────────────────────────────────────

/**
 * ITradingMediator: contrato del Mediator.
 * Los Colleagues solo hablan con el Mediator, nunca entre sí.
 */
export interface ITradingMediator {
    /** Procesa un ciclo completo de matching + facturación + eventos */
    processMatch(request: MediatorMatchRequest): Promise<MediatorMatchResult>;

    /** Valida y procesa una alerta de dispositivo IoT */
    processAlert(request: MediatorAlertRequest): Promise<MediatorAlertResult>;

    /** Notifica un evento de orden directamente al bus */
    notifyOrderEvent(type: "ORDER_PUBLISHED" | "ORDER_CANCELLED", payload: OrderPayload): Promise<void>;
}

// ── CONCRETE MEDIATOR ─────────────────────────────────────────

/**
 * TradingMediator: coordina los subsistemas del mercado de energía.
 *
 * Colleagues gestionados:
 *   - OrderMatcher:           ejecuta el matching según la estrategia activa
 *   - MarketEventBus:         emite eventos del ciclo de vida de las órdenes
 *   - DeviceCommandBus:       encola comandos automáticos de dispositivos IoT
 *   - AlertValidationChain:   decide si una alerta de dispositivo procede
 *   - BaseInvoiceProcessor:   genera facturas según el rol del participante
 *
 * El Mediator:
 *   1. Recibe la solicitud de matching del cliente
 *   2. Delega al OrderMatcher para obtener los MatchResult
 *   3. Para cada match, delega al InvoiceProcessor según el rol
 *   4. Emite los eventos ORDER_MATCHED al MarketEventBus
 *   5. Devuelve el resumen completo al cliente
 */
export class TradingMediator implements ITradingMediator {

    private readonly _matcher:       OrderMatcher;
    private readonly _eventBus:      MarketEventBus;
    private readonly _commandBus:    DeviceCommandBus;
    private readonly _alertChain:    AlertValidationChain;
    private readonly _processors: Record<ParticipantRole, BaseInvoiceProcessor>;

    private _processedCount = 0;

    constructor(options: {
        matcher?:    OrderMatcher;
        eventBus?:   MarketEventBus;
        commandBus?: DeviceCommandBus;
        alertChain?: AlertValidationChain;
    } = {}) {
        // Inyección de dependencias con defaults razonables (DI friendly)
        this._matcher    = options.matcher    ?? new OrderMatcher();
        this._eventBus   = options.eventBus   ?? MarketEventBus.getInstance();
        this._commandBus = options.commandBus ?? new DeviceCommandBus();
        this._alertChain = options.alertChain ?? new AlertValidationChain();

        // Cada rol del mercado tiene su propio procesador de facturas
        this._processors = {
            CONSUMER:         new ConsumerInvoiceProcessor(),
            PRODUCER:         new ProducerInvoiceProcessor(),
            STORAGE_OPERATOR: new StorageOperatorInvoiceProcessor(),
        };
    }

    // ── Operación 1: Ciclo completo de matching ───────────────

    /**
     * Coordina el ciclo completo de matching de órdenes:
     *   matching → facturación → emisión de eventos.
     *
     * Ningún Colleague invoca a otro directamente. Todo pasa por aquí.
     */
    async processMatch(request: MediatorMatchRequest): Promise<MediatorMatchResult> {
        const start = Date.now();
        this._processedCount++;

        // Paso 1: cambiar estrategia si el cliente lo solicita
        if (request.strategyName) {
            this._applyStrategy(request.strategyName);
        }

        // Paso 2: delegar el matching al OrderMatcher (Colleague 1)
        const summary = this._matcher.run(request.orders);

        // Paso 3: para cada match, generar factura con el procesador del rol (Colleague 2)
        const processor = this._processors[request.requesterRole];
        const invoices:  Invoice[] = summary.results.map((result) =>
            processor.processInvoice(result)
        );

        // Paso 4: emitir eventos ORDER_MATCHED al MarketEventBus (Colleague 3)
        let eventsEmitted = 0;
        for (const result of summary.results) {
            await this._emitMatchEvent(result);
            eventsEmitted++;
        }

        return {
            summary,
            invoices,
            eventsEmitted,
            durationMs: Date.now() - start,
        };
    }

    // ── Operación 2: Validación y procesamiento de alertas ────

    /**
     * Coordina la validación de una alerta de dispositivo IoT:
     *   validación → decisión → (si procede) notificación vía EventBus.
     *
     * Si la alerta no procede (falso positivo, mantenimiento, etc.),
     * el EventBus no es contactado. Solo el Mediator lo sabe.
     */
    async processAlert(request: MediatorAlertRequest): Promise<MediatorAlertResult> {
        // Paso 1: consultar la cadena de validación (Colleague 4)
        const { shouldAlert, log } = this._alertChain.validate(request.deviceAlert);

        let autoCommandSent = false;

        if (shouldAlert) {
            // Paso 2: si la alerta procede, notificar al EventBus (Colleague 3)
            await this._eventBus.emitDeviceEvent(
                "DEVICE_OFFLINE",
                {
                    deviceId:       request.deviceAlert.alert.deviceId,
                    deviceName:     request.deviceAlert.alert.deviceName,
                    previousStatus: "ONLINE",
                    newStatus:      "OFFLINE",
                },
                "TradingMediator"
            );

            // Paso 3: marcar alerta como activa para evitar duplicados futuros
            this._alertChain.markAlertActive(request.deviceAlert.alert.deviceId);
            autoCommandSent = true;
        }

        return {
            shouldAlert,
            log: log.map((l) => ({
                handlerName: l.handlerName,
                verdict:     l.verdict,
                reason:      l.reason,
            })),
            autoCommandSent,
        };
    }

    // ── Operación 3: Notificación directa de eventos de orden ─

    async notifyOrderEvent(
        type:    "ORDER_PUBLISHED" | "ORDER_CANCELLED",
        payload: OrderPayload
    ): Promise<void> {
        await this._eventBus.emitOrderEvent(type, payload, "TradingMediator");
    }

    // ── Consultas ─────────────────────────────────────────────

    getProcessedCount(): number              { return this._processedCount; }
    getCommandBus():     DeviceCommandBus    { return this._commandBus; }
    getEventBus():       MarketEventBus      { return this._eventBus; }
    getAlertChain():     AlertValidationChain { return this._alertChain; }

    // ── Helpers privados ──────────────────────────────────────

    private _applyStrategy(strategyName: string): void {
        const strategies: Record<string, () => void> = {
            PriceFirst: () => this._matcher.setStrategy(
                new (require("@/lib/trading/OrderMatchingStrategy").PriceFirstStrategy)()
            ),
            GreenFirst: () => this._matcher.setStrategy(
                new (require("@/lib/trading/OrderMatchingStrategy").GreenFirstStrategy)()
            ),
            TimeFirst: () => this._matcher.setStrategy(
                new (require("@/lib/trading/OrderMatchingStrategy").TimeFirstStrategy)()
            ),
            BestValue: () => this._matcher.setStrategy(
                new (require("@/lib/trading/OrderMatchingStrategy").BestValueStrategy)()
            ),
        };
        strategies[strategyName]?.();
    }

    private async _emitMatchEvent(result: MatchResult): Promise<void> {
        const payload: OrderPayload = {
            orderId:     result.buyOrderId,
            type:        "BUY",
            amountKwh:   result.matchedKwh,
            pricePerKwh: result.pricePerKwh,
        };
        await this._eventBus.emitOrderEvent("ORDER_MATCHED", payload, "TradingMediator");
    }
}

// ── Singleton del Mediator para uso global ────────────────────

let _mediatorInstance: TradingMediator | null = null;

/**
 * Retorna la instancia global del Mediator.
 * Permite inyectar dependencias distintas en tests pasando `options`.
 */
export function getTradingMediator(options?: ConstructorParameters<typeof TradingMediator>[0]): TradingMediator {
    if (!_mediatorInstance || options) {
        _mediatorInstance = new TradingMediator(options);
    }
    return _mediatorInstance;
}

export function resetTradingMediator(): void {
    _mediatorInstance = null;
}

// _Mediator
