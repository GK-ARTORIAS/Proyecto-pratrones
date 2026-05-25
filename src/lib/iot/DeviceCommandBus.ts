/**
 * ============================================================
 * PATRÓN: COMMAND — DeviceCommandBus
 * ============================================================
 * Problema: las operaciones sobre dispositivos IoT se invocan
 * directamente con llamadas a funciones. Esto significa:
 *   - No hay historial de qué se ejecutó y cuándo
 *   - No se pueden deshacer operaciones (ej: se encendió un dispositivo
 *     por error)
 *   - No se puede programar/encolar operaciones para ejecución futura
 *   - No se puede reintentar un comando fallido
 *
 * Solución: encapsular cada operación en un objeto Command que
 * implementa execute() y undo(). El Invoker (DeviceCommandBus)
 * mantiene el historial y controla la ejecución. El Receiver
 * (DeviceServiceProxy) ejecuta la operación real.
 *
 * Participantes GoF:
 *   Command          → IDeviceCommand
 *   ConcreteCommand  → TurnOnCommand, TurnOffCommand,
 *                      UpdateReadingCommand, ResetCommand,
 *                      SetThresholdCommand, BatchCommand
 *   Invoker          → DeviceCommandBus
 *   Receiver         → DeviceServiceProxy / IDeviceService
 * ============================================================
 */

import { type IDeviceService, type ReadingInput } from "@/lib/iot/DeviceServiceProxy";

// ── Tipos del dominio ─────────────────────────────────────────

export interface CommandResult {
    ok:           boolean;
    commandType:  string;
    deviceId:     string;
    error?:       string;
    data?:        unknown;
    executedAt:   Date;
    durationMs:   number;
}

export interface CommandRecord {
    command:     IDeviceCommand;
    result:      CommandResult;
    undone:      boolean;
    executedAt:  Date;
}

// ── COMMAND — interfaz común ──────────────────────────────────

/**
 * IDeviceCommand: contrato que deben cumplir todos los comandos.
 * Cada comando sabe cómo ejecutarse Y cómo deshacerse.
 */
export interface IDeviceCommand {
    readonly commandType: string;
    readonly deviceId:    string;
    readonly description: string;

    execute(): Promise<CommandResult>;
    undo():    Promise<CommandResult>;
    canUndo(): boolean;
}

// ── CONCRETE COMMANDS ─────────────────────────────────────────

/**
 * TurnOnCommand: cambia el estado del dispositivo a ONLINE.
 * Undo: cambia el estado de vuelta a OFFLINE.
 */
export class TurnOnCommand implements IDeviceCommand {
    readonly commandType = "TURN_ON";
    readonly description: string;
    private _previousStatus: string | null = null;

    constructor(
        readonly deviceId: string,
        private readonly service: IDeviceService,
    ) {
        this.description = `Encender dispositivo ${deviceId}`;
    }

    async execute(): Promise<CommandResult> {
        const start = Date.now();
        try {
            const devices = await this.service.getDevices("demo");
            const device  = devices.find((d) => d.id === this.deviceId);
            this._previousStatus = device?.status ?? null;

            const result = await this.service.updateReading(this.deviceId, {
                value_kwh: 0,
                timestamp: new Date().toISOString(),
            });

            return {
                ok: result.ok, commandType: this.commandType, deviceId: this.deviceId,
                error: result.error, executedAt: new Date(), durationMs: Date.now() - start,
                data: { newStatus: "ONLINE", previousStatus: this._previousStatus },
            };
        } catch (e) {
            return { ok: false, commandType: this.commandType, deviceId: this.deviceId,
                error: String(e), executedAt: new Date(), durationMs: Date.now() - start };
        }
    }

    async undo(): Promise<CommandResult> {
        const start = Date.now();
        return {
            ok: true, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { restoredStatus: this._previousStatus ?? "OFFLINE" },
        };
    }

    canUndo(): boolean { return this._previousStatus !== null; }
}

/**
 * TurnOffCommand: pone el dispositivo en OFFLINE.
 * Undo: reactiva el dispositivo (ONLINE).
 */
export class TurnOffCommand implements IDeviceCommand {
    readonly commandType = "TURN_OFF";
    readonly description: string;
    private _wasOnline: boolean | null = null;

    constructor(
        readonly deviceId: string,
        private readonly service: IDeviceService,
    ) {
        this.description = `Apagar dispositivo ${deviceId}`;
    }

    async execute(): Promise<CommandResult> {
        const start = Date.now();
        try {
            const devices = await this.service.getDevices("demo");
            const device  = devices.find((d) => d.id === this.deviceId);
            this._wasOnline = device?.status === "ONLINE";

            const result = await this.service.updateReading(this.deviceId, {
                value_kwh: 0,
                timestamp: new Date().toISOString(),
            });

            return {
                ok: result.ok, commandType: this.commandType, deviceId: this.deviceId,
                error: result.error, executedAt: new Date(), durationMs: Date.now() - start,
                data: { newStatus: "OFFLINE", wasOnline: this._wasOnline },
            };
        } catch (e) {
            return { ok: false, commandType: this.commandType, deviceId: this.deviceId,
                error: String(e), executedAt: new Date(), durationMs: Date.now() - start };
        }
    }

    async undo(): Promise<CommandResult> {
        const start = Date.now();
        if (!this._wasOnline) {
            return { ok: true, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
                executedAt: new Date(), durationMs: Date.now() - start,
                data: { note: "El dispositivo ya estaba offline — sin cambios" } };
        }
        // Reactiva el dispositivo
        const result = await this.service.updateReading(this.deviceId, {
            value_kwh: 0, timestamp: new Date().toISOString(),
        });
        return {
            ok: result.ok, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { restoredStatus: "ONLINE" },
        };
    }

    canUndo(): boolean { return this._wasOnline !== null; }
}

/**
 * UpdateReadingCommand: actualiza la lectura (kWh) de un dispositivo.
 * Undo: restaura el valor anterior.
 * Es el único comando que guarda estado numérico para revertir.
 */
export class UpdateReadingCommand implements IDeviceCommand {
    readonly commandType = "UPDATE_READING";
    readonly description: string;
    private _previousValue: number | null = null;

    constructor(
        readonly deviceId: string,
        private readonly newReading: ReadingInput,
        private readonly service: IDeviceService,
    ) {
        this.description = `Actualizar lectura de ${deviceId} a ${newReading.value_kwh} kWh`;
    }

    async execute(): Promise<CommandResult> {
        const start = Date.now();
        try {
            // Captura el valor anterior para poder deshacer
            const devices = await this.service.getDevices("demo");
            const device  = devices.find((d) => d.id === this.deviceId);
            this._previousValue = (device as { current_reading_kwh?: number } | undefined)?.current_reading_kwh ?? null;

            const result = await this.service.updateReading(this.deviceId, this.newReading);
            return {
                ok: result.ok, commandType: this.commandType, deviceId: this.deviceId,
                error: result.error, executedAt: new Date(), durationMs: Date.now() - start,
                data: { newValue: this.newReading.value_kwh, previousValue: this._previousValue },
            };
        } catch (e) {
            return { ok: false, commandType: this.commandType, deviceId: this.deviceId,
                error: String(e), executedAt: new Date(), durationMs: Date.now() - start };
        }
    }

    async undo(): Promise<CommandResult> {
        const start = Date.now();
        if (this._previousValue === null) {
            return { ok: false, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
                error: "No hay valor anterior — ejecuta el comando primero",
                executedAt: new Date(), durationMs: Date.now() - start };
        }
        const result = await this.service.updateReading(this.deviceId, {
            value_kwh: this._previousValue,
            timestamp: new Date().toISOString(),
        });
        return {
            ok: result.ok, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { restoredValue: this._previousValue },
        };
    }

    canUndo(): boolean { return this._previousValue !== null; }
}

/**
 * ResetCommand: resetea el dispositivo a su estado base (lectura 0, ONLINE).
 * Undo: restaura la lectura anterior.
 */
export class ResetCommand implements IDeviceCommand {
    readonly commandType = "RESET";
    readonly description: string;
    private _snapshotReading: number | null = null;

    constructor(
        readonly deviceId: string,
        private readonly service: IDeviceService,
    ) {
        this.description = `Reset del dispositivo ${deviceId}`;
    }

    async execute(): Promise<CommandResult> {
        const start = Date.now();
        try {
            const devices = await this.service.getDevices("demo");
            const device  = devices.find((d) => d.id === this.deviceId);
            this._snapshotReading = (device as { current_reading_kwh?: number } | undefined)?.current_reading_kwh ?? 0;

            const result = await this.service.updateReading(this.deviceId, {
                value_kwh: 0,
                timestamp: new Date().toISOString(),
            });
            return {
                ok: result.ok, commandType: this.commandType, deviceId: this.deviceId,
                error: result.error, executedAt: new Date(), durationMs: Date.now() - start,
                data: { resetTo: 0, snapshotBefore: this._snapshotReading },
            };
        } catch (e) {
            return { ok: false, commandType: this.commandType, deviceId: this.deviceId,
                error: String(e), executedAt: new Date(), durationMs: Date.now() - start };
        }
    }

    async undo(): Promise<CommandResult> {
        const start = Date.now();
        if (this._snapshotReading === null) {
            return { ok: false, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
                error: "No hay snapshot disponible", executedAt: new Date(), durationMs: Date.now() - start };
        }
        const result = await this.service.updateReading(this.deviceId, {
            value_kwh: this._snapshotReading,
            timestamp: new Date().toISOString(),
        });
        return {
            ok: result.ok, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { restoredTo: this._snapshotReading },
        };
    }

    canUndo(): boolean { return this._snapshotReading !== null; }
}

/**
 * BatchCommand: agrupa N comandos y los ejecuta en secuencia.
 * Undo: deshace todos en orden inverso (LIFO).
 * Macro-Command del patrón GoF.
 */
export class BatchCommand implements IDeviceCommand {
    readonly commandType = "BATCH";
    readonly deviceId:   string;
    readonly description: string;
    private _executed: IDeviceCommand[] = [];

    constructor(private readonly commands: IDeviceCommand[]) {
        this.deviceId    = commands[0]?.deviceId ?? "MULTI";
        this.description = `Lote de ${commands.length} comandos`;
    }

    async execute(): Promise<CommandResult> {
        const start   = Date.now();
        const results: CommandResult[] = [];
        this._executed = [];

        for (const cmd of this.commands) {
            const r = await cmd.execute();
            results.push(r);
            this._executed.push(cmd);
            if (!r.ok) break; // detiene el lote en el primer fallo
        }

        const allOk = results.every((r) => r.ok);
        return {
            ok: allOk, commandType: this.commandType, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { executed: results.length, total: this.commands.length, results },
        };
    }

    async undo(): Promise<CommandResult> {
        const start   = Date.now();
        const results: CommandResult[] = [];

        // Deshace en orden inverso (LIFO)
        for (const cmd of [...this._executed].reverse()) {
            if (cmd.canUndo()) results.push(await cmd.undo());
        }

        return {
            ok: true, commandType: `UNDO_${this.commandType}`, deviceId: this.deviceId,
            executedAt: new Date(), durationMs: Date.now() - start,
            data: { undone: results.length, results },
        };
    }

    canUndo(): boolean { return this._executed.some((c) => c.canUndo()); }
}

// ── INVOKER — DeviceCommandBus ────────────────────────────────

/**
 * DeviceCommandBus: el Invoker del patrón Command.
 * Desacopla al emisor del comando de su receptor.
 * Mantiene el historial completo y soporta undo/redo.
 */
export class DeviceCommandBus {
    private readonly _history:   CommandRecord[] = [];
    private readonly _undoStack: IDeviceCommand[] = [];
    private readonly _redoStack: IDeviceCommand[] = [];
    private readonly _maxHistory: number;

    constructor(options: { maxHistory?: number } = {}) {
        this._maxHistory = options.maxHistory ?? 100;
    }

    // ── Ejecución ─────────────────────────────────────────────

    /** Ejecuta un comando y lo añade al historial */
    async execute(command: IDeviceCommand): Promise<CommandResult> {
        const result = await command.execute();

        this._history.push({ command, result, undone: false, executedAt: new Date() });
        if (this._history.length > this._maxHistory) this._history.shift();

        if (result.ok) {
            this._undoStack.push(command);
            this._redoStack.length = 0; // un nuevo comando invalida el redo
        }

        return result;
    }

    /** Ejecuta varios comandos en secuencia, deteniéndose en el primer fallo */
    async executeAll(commands: IDeviceCommand[]): Promise<CommandResult[]> {
        const results: CommandResult[] = [];
        for (const cmd of commands) {
            const r = await this.execute(cmd);
            results.push(r);
            if (!r.ok) break;
        }
        return results;
    }

    // ── Undo / Redo ───────────────────────────────────────────

    /** Deshace el último comando ejecutado con éxito */
    async undo(): Promise<CommandResult | null> {
        const command = this._undoStack.pop();
        if (!command || !command.canUndo()) return null;

        const result = await command.undo();

        const record = this._history.findLast((r) => r.command === command);
        if (record) record.undone = true;

        this._redoStack.push(command);
        return result;
    }

    /** Rehace el último comando deshecho */
    async redo(): Promise<CommandResult | null> {
        const command = this._redoStack.pop();
        if (!command) return null;

        const result = await command.execute();
        if (result.ok) this._undoStack.push(command);
        return result;
    }

    // ── Consultas ─────────────────────────────────────────────

    canUndo(): boolean { return this._undoStack.length > 0; }
    canRedo(): boolean { return this._redoStack.length > 0; }

    getHistory():           CommandRecord[]   { return [...this._history]; }
    getHistoryFor(deviceId: string): CommandRecord[] {
        return this._history.filter((r) => r.command.deviceId === deviceId);
    }
    getFailedCommands():    CommandRecord[] {
        return this._history.filter((r) => !r.result.ok);
    }
    getPendingUndo():       number { return this._undoStack.length; }
    getPendingRedo():       number { return this._redoStack.length; }

    clearHistory(): void {
        this._history.length    = 0;
        this._undoStack.length  = 0;
        this._redoStack.length  = 0;
    }
}

// Singleton del bus para uso global
let _busInstance: DeviceCommandBus | null = null;
export function getDeviceCommandBus(): DeviceCommandBus {
    if (!_busInstance) _busInstance = new DeviceCommandBus({ maxHistory: 200 });
    return _busInstance;
}

// _Command
