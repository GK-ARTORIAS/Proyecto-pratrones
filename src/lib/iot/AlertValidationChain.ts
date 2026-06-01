/**
 * ============================================================
 * PATRÓN: CHAIN OF RESPONSIBILITY — AlertValidationChain
 * ============================================================
 * Problema: cuando un dispositivo IoT genera una lectura,
 * hay múltiples reglas que deben validarse antes de decidir
 * si se emite una alerta crítica al operador:
 *   1. ¿La lectura supera el umbral de consumo máximo?
 *   2. ¿El dispositivo lleva demasiado tiempo sin reportar?
 *   3. ¿Está el dispositivo en modo mantenimiento (ignorar alertas)?
 *   4. ¿Ya existe una alerta activa del mismo tipo para ese dispositivo?
 *
 * Sin Chain of Responsibility: una única función con 4 if/else
 * anidados que crece con cada nueva regla, viola SRP y OCP,
 * y es imposible reordenar los checks sin riesgos.
 *
 * ALCANCE REDUCIDO: este patrón cubre SOLO la validación/filtrado
 * de alertas (decidir si proceder o detener el flujo). El
 * enriquecimiento y transformación de las alertas ya lo hace el
 * patrón Decorator (PriceDecorator), por lo que no hay solapamiento.
 *
 * Solución: cada regla de validación es un eslabón (Handler) que
 * procesa su responsabilidad y decide si pasa la solicitud al
 * siguiente eslabón. El resultado al final es una decisión binaria:
 * PASS (debe emitirse la alerta) o STOP (la alerta no procede).
 *
 * Participantes GoF:
 *   Handler         → IAlertHandler
 *   ConcreteHandler → ThresholdHandler, StaleDeviceHandler,
 *                     MaintenanceModeHandler, DuplicateAlertHandler
 *   Client          → AlertValidationChain
 * ============================================================
 */

// ── Tipos del dominio ─────────────────────────────────────────

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface DeviceAlert {
    readonly deviceId:    string;
    readonly deviceName:  string;
    readonly currentKwh:  number;       // lectura actual
    readonly lastSeenAt:  Date;         // última vez que reportó
    readonly inMaintenance: boolean;    // bandera de mantenimiento
    readonly source:      string;       // "SOLAR" | "WIND" | etc.
}

export interface AlertRequest {
    readonly alert:       DeviceAlert;
    readonly thresholdKwh: number;     // máximo permitido de consumo
    readonly maxStaleMs:   number;     // ms máximo sin reportar
}

export type HandlerVerdict = "PASS" | "STOP";

export interface AlertHandlerResult {
    verdict:      HandlerVerdict;
    handlerName:  string;
    reason:       string;
    severity?:    AlertSeverity;
    stoppedChain: boolean;
}

// ── HANDLER — interfaz común ──────────────────────────────────

/**
 * IAlertHandler: contrato de cada eslabón de la cadena.
 * Cada handler puede:
 *   - Detener la cadena (STOP → alerta no procede)
 *   - Pasar la solicitud al siguiente (PASS → siguiente handler)
 *
 * La cadena corre siempre hacia adelante; nunca retrocede.
 */
export interface IAlertHandler {
    readonly handlerName: string;

    setNext(handler: IAlertHandler): IAlertHandler;
    handle(request: AlertRequest, log: AlertHandlerResult[]): boolean;
}

// ── Abstract base handler ─────────────────────────────────────

abstract class BaseAlertHandler implements IAlertHandler {
    private _next: IAlertHandler | null = null;

    abstract readonly handlerName: string;

    setNext(handler: IAlertHandler): IAlertHandler {
        this._next = handler;
        return handler; // permite encadenamiento fluido
    }

    /**
     * Plantilla para subclases:
     * devuelve true si el handler permite continuar la cadena,
     * false si la detiene.
     */
    abstract check(request: AlertRequest, log: AlertHandlerResult[]): boolean;

    handle(request: AlertRequest, log: AlertHandlerResult[]): boolean {
        const canContinue = this.check(request, log);
        if (!canContinue) return false;         // cadena detenida aquí
        return this._next?.handle(request, log) ?? true; // pasa al siguiente
    }

    protected stop(log: AlertHandlerResult[], reason: string): false {
        log.push({
            verdict:      "STOP",
            handlerName:  this.handlerName,
            reason,
            stoppedChain: true,
        });
        return false;
    }

    protected pass(log: AlertHandlerResult[], reason: string, severity?: AlertSeverity): true {
        log.push({
            verdict:      "PASS",
            handlerName:  this.handlerName,
            reason,
            severity,
            stoppedChain: false,
        });
        return true;
    }
}

// ── CONCRETE HANDLERS ─────────────────────────────────────────

/**
 * Handler 1 — MaintenanceModeHandler (primer filtro)
 * Si el dispositivo está en mantenimiento, ignora toda alerta.
 * Regla de negocio: no molestar al operador con alertas programadas.
 */
export class MaintenanceModeHandler extends BaseAlertHandler {
    readonly handlerName = "MaintenanceMode";

    check(request: AlertRequest, log: AlertHandlerResult[]): boolean {
        if (request.alert.inMaintenance) {
            return this.stop(
                log,
                `Dispositivo ${request.alert.deviceId} está en mantenimiento — alerta suprimida.`
            );
        }
        return this.pass(log, "Dispositivo operativo — no está en mantenimiento.");
    }
}

/**
 * Handler 2 — DuplicateAlertHandler
 * Evita spam de alertas: si el dispositivo ya tiene una alerta activa
 * del mismo tipo (consumo alto o inactividad), no emite otra.
 * El estado de alertas activas se inyecta desde afuera para testabilidad.
 */
export class DuplicateAlertHandler extends BaseAlertHandler {
    readonly handlerName = "DuplicateAlert";

    constructor(
        private readonly activeAlerts: ReadonlySet<string>  // Set de deviceId con alertas activas
    ) { super(); }

    check(request: AlertRequest, log: AlertHandlerResult[]): boolean {
        if (this.activeAlerts.has(request.alert.deviceId)) {
            return this.stop(
                log,
                `Ya existe una alerta activa para ${request.alert.deviceId} — alerta duplicada suprimida.`
            );
        }
        return this.pass(log, "Sin alerta activa previa — puede emitirse.");
    }
}

/**
 * Handler 3 — ThresholdHandler
 * Verifica si el consumo actual supera el umbral configurado.
 * Si no lo supera, la alerta tampoco procede (no hay anomalía de consumo).
 */
export class ThresholdHandler extends BaseAlertHandler {
    readonly handlerName = "ThresholdCheck";

    check(request: AlertRequest, log: AlertHandlerResult[]): boolean {
        const { currentKwh, deviceId } = request.alert;
        const { thresholdKwh }         = request;

        if (currentKwh <= thresholdKwh) {
            return this.stop(
                log,
                `Consumo ${currentKwh} kWh no supera el umbral ${thresholdKwh} kWh en ${deviceId}.`
            );
        }

        const exceedPct = (((currentKwh - thresholdKwh) / thresholdKwh) * 100).toFixed(1);
        const severity: AlertSeverity = currentKwh > thresholdKwh * 1.5 ? "CRITICAL" : "WARNING";

        return this.pass(
            log,
            `Consumo ${currentKwh} kWh supera umbral ${thresholdKwh} kWh en un ${exceedPct}%.`,
            severity
        );
    }
}

/**
 * Handler 4 — StaleDeviceHandler (último eslabón)
 * Verifica si el dispositivo ha estado inactivo demasiado tiempo.
 * Un dispositivo que no reporta puede estar caído o desconectado.
 */
export class StaleDeviceHandler extends BaseAlertHandler {
    readonly handlerName = "StaleDevice";

    check(request: AlertRequest, log: AlertHandlerResult[]): boolean {
        const staleness = Date.now() - request.alert.lastSeenAt.getTime();

        if (staleness < request.maxStaleMs) {
            return this.pass(
                log,
                `Dispositivo activo hace ${Math.round(staleness / 1000)}s — dentro del límite.`,
                "INFO"
            );
        }

        return this.stop(
            log,
            `Dispositivo ${request.alert.deviceId} inactivo hace ${Math.round(staleness / 1000)}s — ` +
            `supera el límite de ${Math.round(request.maxStaleMs / 1000)}s. Alerta de inactividad bloqueada ` +
            `(se procesará como alerta de desconexión por separado).`
        );
    }
}

// ── CLIENT — AlertValidationChain ────────────────────────────

/**
 * AlertValidationChain: construye y ejecuta la cadena de handlers.
 * El cliente solo necesita llamar a validate() con la solicitud.
 * El orden de los handlers importa: los filtros más baratos primero.
 */
export class AlertValidationChain {
    private readonly _chain: IAlertHandler;
    private readonly _activeAlerts: Set<string>;

    constructor(initialActiveAlerts: Iterable<string> = []) {
        this._activeAlerts = new Set(initialActiveAlerts);

        // Orden: mantenimiento → duplicado → consumo → inactividad
        // (filtros más baratos primero para corto-circuitar antes)
        const maintenance = new MaintenanceModeHandler();
        const duplicate   = new DuplicateAlertHandler(this._activeAlerts);
        const threshold   = new ThresholdHandler();
        const stale       = new StaleDeviceHandler();

        // Encadenamiento fluido
        maintenance.setNext(duplicate).setNext(threshold).setNext(stale);
        this._chain = maintenance;
    }

    /**
     * Ejecuta la cadena y devuelve si la alerta debe emitirse
     * junto con el log completo de decisiones de cada handler.
     */
    validate(request: AlertRequest): { shouldAlert: boolean; log: AlertHandlerResult[] } {
        const log: AlertHandlerResult[] = [];
        const shouldAlert = this._chain.handle(request, log);
        return { shouldAlert, log };
    }

    /** Registra una alerta activa para evitar duplicados */
    markAlertActive(deviceId: string): void {
        this._activeAlerts.add(deviceId);
    }

    /** Limpia una alerta activa cuando el operador la resuelve */
    clearAlert(deviceId: string): void {
        this._activeAlerts.delete(deviceId);
    }

    /** Consulta el estado actual de alertas activas */
    getActiveAlerts(): string[] {
        return Array.from(this._activeAlerts);
    }
}

// _ChainOfResponsibility
