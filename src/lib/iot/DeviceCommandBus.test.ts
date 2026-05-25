/**
 * Tests: Patrón COMMAND — DeviceCommandBus
 */
import {
    TurnOnCommand,
    TurnOffCommand,
    UpdateReadingCommand,
    ResetCommand,
    BatchCommand,
    DeviceCommandBus,
    getDeviceCommandBus,
    type IDeviceCommand,
} from "@/lib/iot/DeviceCommandBus";
import type { IDeviceService, Device } from "@/lib/iot/DeviceServiceProxy";

// ── Mock del DeviceService (Receiver) ─────────────────────────

const MOCK_DEVICE: Device = {
    id: "DEV-001", name: "Panel A", type: "SOLAR",
    status: "ONLINE", user_id: "U1", last_reading: 0,
};

function makeMockService(overrides: Partial<IDeviceService> = {}): IDeviceService {
    return {
        getDevices:    async () => [{ ...MOCK_DEVICE, current_reading_kwh: 42 } as Device],
        addDevice:     async () => ({ ok: true, id: "NEW" }),
        updateReading: async () => ({ ok: true }),
        deleteDevice:  async () => ({ ok: true }),
        getStats:      () => ({}),
        ...overrides,
    };
}

// ── Tests de comandos individuales ────────────────────────────

describe("TurnOnCommand — Command Pattern", () => {
    const svc = makeMockService();

    test("execute() devuelve ok:true", async () => {
        const cmd = new TurnOnCommand("DEV-001", svc);
        const result = await cmd.execute();
        expect(result.ok).toBe(true);
        expect(result.commandType).toBe("TURN_ON");
        expect(result.deviceId).toBe("DEV-001");
    });

    test("canUndo() es true después de execute()", async () => {
        const cmd = new TurnOnCommand("DEV-001", svc);
        expect(cmd.canUndo()).toBe(false); // antes de ejecutar
        await cmd.execute();
        expect(cmd.canUndo()).toBe(true);  // después de ejecutar
    });

    test("undo() devuelve el status previo en data", async () => {
        const cmd = new TurnOnCommand("DEV-001", svc);
        await cmd.execute();
        const undone = await cmd.undo();
        expect(undone.commandType).toBe("UNDO_TURN_ON");
        expect(undone.data).toHaveProperty("restoredStatus");
    });
});

describe("TurnOffCommand — Command Pattern", () => {
    const svc = makeMockService();

    test("execute() captura estado previo del dispositivo", async () => {
        const cmd    = new TurnOffCommand("DEV-001", svc);
        const result = await cmd.execute();
        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty("wasOnline");
    });

    test("undo() reactiva el dispositivo si estaba online", async () => {
        const cmd = new TurnOffCommand("DEV-001", svc);
        await cmd.execute();
        const undone = await cmd.undo();
        expect(undone.ok).toBe(true);
        expect(undone.data).toHaveProperty("restoredStatus", "ONLINE");
    });
});

describe("UpdateReadingCommand — Command Pattern", () => {
    const svc = makeMockService();

    test("execute() actualiza la lectura", async () => {
        const cmd    = new UpdateReadingCommand("DEV-001", { value_kwh: 55.5, timestamp: new Date().toISOString() }, svc);
        const result = await cmd.execute();
        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty("newValue", 55.5);
    });

    test("undo() restaura el valor anterior", async () => {
        const cmd = new UpdateReadingCommand("DEV-001", { value_kwh: 99, timestamp: new Date().toISOString() }, svc);
        await cmd.execute();
        const undone = await cmd.undo();
        expect(undone.ok).toBe(true);
        expect(undone.data).toHaveProperty("restoredValue");
    });

    test("undo() sin execute previo devuelve error", async () => {
        const cmd    = new UpdateReadingCommand("DEV-001", { value_kwh: 10, timestamp: new Date().toISOString() }, svc);
        const undone = await cmd.undo();
        expect(undone.ok).toBe(false);
        expect(undone.error).toContain("No hay valor anterior");
    });

    test("canUndo() es false antes de execute()", () => {
        const cmd = new UpdateReadingCommand("DEV-001", { value_kwh: 10, timestamp: new Date().toISOString() }, svc);
        expect(cmd.canUndo()).toBe(false);
    });
});

describe("ResetCommand — Command Pattern", () => {
    const svc = makeMockService();

    test("execute() resetea lectura a 0 y guarda snapshot", async () => {
        const cmd    = new ResetCommand("DEV-001", svc);
        const result = await cmd.execute();
        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty("resetTo", 0);
        expect(result.data).toHaveProperty("snapshotBefore");
    });

    test("undo() restaura el snapshot previo al reset", async () => {
        const cmd = new ResetCommand("DEV-001", svc);
        await cmd.execute();
        const undone = await cmd.undo();
        expect(undone.ok).toBe(true);
        expect(undone.data).toHaveProperty("restoredTo");
    });
});

describe("BatchCommand — Macro-Command Pattern", () => {
    const svc = makeMockService();

    test("execute() ejecuta todos los comandos del lote", async () => {
        const batch = new BatchCommand([
            new TurnOnCommand("DEV-001", svc),
            new UpdateReadingCommand("DEV-001", { value_kwh: 10, timestamp: new Date().toISOString() }, svc),
        ]);
        const result = await batch.execute();
        expect(result.ok).toBe(true);
        expect((result.data as { executed: number }).executed).toBe(2);
    });

    test("undo() deshace todos los comandos en orden inverso (LIFO)", async () => {
        const batch = new BatchCommand([
            new TurnOnCommand("DEV-001", svc),
            new UpdateReadingCommand("DEV-001", { value_kwh: 20, timestamp: new Date().toISOString() }, svc),
        ]);
        await batch.execute();
        const undone = await batch.undo();
        expect(undone.ok).toBe(true);
    });

    test("se detiene en el primer comando fallido", async () => {
        const failingSvc = makeMockService({ updateReading: async () => ({ ok: false, error: "fallo simulado" }) });
        const batch = new BatchCommand([
            new TurnOnCommand("DEV-001", failingSvc),        // falla
            new ResetCommand("DEV-002", makeMockService()),  // no debe ejecutarse
        ]);
        const result = await batch.execute();
        expect(result.ok).toBe(false);
        expect((result.data as { executed: number }).executed).toBe(1); // solo ejecutó 1
    });
});

// ── Tests del DeviceCommandBus (Invoker) ─────────────────────

describe("DeviceCommandBus — Invoker del Command Pattern", () => {
    let bus: DeviceCommandBus;
    const svc = makeMockService();

    beforeEach(() => { bus = new DeviceCommandBus(); });

    test("execute() guarda el comando en el historial", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        expect(bus.getHistory()).toHaveLength(1);
    });

    test("execute() múltiples comandos → historial en orden", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        await bus.execute(new ResetCommand("DEV-001", svc));
        expect(bus.getHistory()).toHaveLength(2);
        expect(bus.getHistory()[0].command.commandType).toBe("TURN_ON");
        expect(bus.getHistory()[1].command.commandType).toBe("RESET");
    });

    test("canUndo() es true después de execute()", async () => {
        expect(bus.canUndo()).toBe(false);
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        expect(bus.canUndo()).toBe(true);
    });

    test("undo() deshace el último comando", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        const undone = await bus.undo();
        expect(undone).not.toBeNull();
        expect(undone!.commandType).toBe("UNDO_TURN_ON");
    });

    test("undo() devuelve null si no hay nada que deshacer", async () => {
        expect(await bus.undo()).toBeNull();
    });

    test("redo() rehace el último undo", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        await bus.undo();
        expect(bus.canRedo()).toBe(true);
        const redone = await bus.redo();
        expect(redone).not.toBeNull();
    });

    test("execute() nuevo invalida la pila de redo", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        await bus.undo();
        expect(bus.canRedo()).toBe(true);
        await bus.execute(new ResetCommand("DEV-001", svc)); // nuevo comando
        expect(bus.canRedo()).toBe(false); // redo queda vacío
    });

    test("executeAll() ejecuta varios comandos en orden", async () => {
        const results = await bus.executeAll([
            new TurnOnCommand("DEV-001", svc),
            new UpdateReadingCommand("DEV-001", { value_kwh: 15, timestamp: new Date().toISOString() }, svc),
        ]);
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.ok)).toBe(true);
    });

    test("getHistoryFor() filtra por deviceId", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        await bus.execute(new ResetCommand("DEV-002", svc));
        expect(bus.getHistoryFor("DEV-001")).toHaveLength(1);
        expect(bus.getHistoryFor("DEV-002")).toHaveLength(1);
    });

    test("getFailedCommands() devuelve solo los que fallaron", async () => {
        const failSvc = makeMockService({ updateReading: async () => ({ ok: false, error: "sin conexión" }) });
        await bus.execute(new TurnOnCommand("DEV-001", failSvc));
        await bus.execute(new TurnOnCommand("DEV-002", svc)); // este sí pasa
        expect(bus.getFailedCommands()).toHaveLength(1);
    });

    test("clearHistory() limpia todo el estado", async () => {
        await bus.execute(new TurnOnCommand("DEV-001", svc));
        bus.clearHistory();
        expect(bus.getHistory()).toHaveLength(0);
        expect(bus.canUndo()).toBe(false);
    });

    test("getDeviceCommandBus() retorna el singleton", () => {
        const a = getDeviceCommandBus();
        const b = getDeviceCommandBus();
        expect(a).toBe(b);
    });
});
