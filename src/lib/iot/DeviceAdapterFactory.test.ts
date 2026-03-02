/**
 * ============================================================
 * Tests: Patrón FACTORY METHOD — DeviceAdapterFactory
 * Cobertura objetivo: ≥ 80%
 * ============================================================
 */

import {
    DeviceAdapterFactory,
    type IDeviceAdapter,
    type DeviceType,
    type DeviceProtocol,
} from "@/lib/iot/DeviceAdapterFactory";

describe("DeviceAdapterFactory — Patrón Factory Method", () => {

    // ── Adaptador SIMULATED ──────────────────────────────────

    describe("Protocolo SIMULATED", () => {
        let adapter: IDeviceAdapter;

        beforeEach(async () => {
            adapter = await DeviceAdapterFactory.create({
                deviceId: "test-001",
                deviceType: "SOLAR_PANEL",
                protocol: "SIMULATED",
            });
        });

        afterEach(async () => {
            await adapter.disconnect();
        });

        test("crea un adaptador con los metadatos correctos", () => {
            expect(adapter.deviceId).toBe("test-001");
            expect(adapter.deviceType).toBe("SOLAR_PANEL");
            expect(adapter.protocol).toBe("SIMULATED");
        });

        test("el adaptador se conecta automáticamente tras la creación", () => {
            expect(adapter.isConnected()).toBe(true);
        });

        test("readData() retorna una lectura válida", async () => {
            const reading = await adapter.readData();
            expect(reading).toMatchObject({
                deviceId: "test-001",
                status: "ONLINE",
            });
            expect(reading.powerKw).toBeGreaterThanOrEqual(0);
            expect(reading.energyKwh).toBeGreaterThan(0);
            expect(reading.timestamp).toBeInstanceOf(Date);
        });

        test("readData() incluye metadata de simulación", async () => {
            const reading = await adapter.readData();
            expect(reading.metadata?.simulated).toBe(true);
        });

        test("disconnect() desconecta el adaptador", async () => {
            await adapter.disconnect();
            expect(adapter.isConnected()).toBe(false);
        });

        test("readData() lanza error si no está conectado", async () => {
            await adapter.disconnect();
            await expect(adapter.readData()).rejects.toThrow();
        });
    });

    // ── Tipos de dispositivo ─────────────────────────────────

    describe("Diferentes tipos de dispositivo", () => {
        const deviceTypes: DeviceType[] = [
            "SOLAR_PANEL", "WIND_TURBINE", "SMART_METER", "BATTERY_STORAGE",
        ];

        test.each(deviceTypes)(
            "crea adaptador correctamente para tipo %s",
            async (deviceType) => {
                const adapter = await DeviceAdapterFactory.create({
                    deviceId: `test-${deviceType}`,
                    deviceType,
                    protocol: "SIMULATED",
                });
                expect(adapter.deviceType).toBe(deviceType);
                expect(adapter.isConnected()).toBe(true);

                const reading = await adapter.readData();
                expect(reading.powerKw).toBeGreaterThanOrEqual(0);

                // BATTERY_STORAGE puede tener potencia negativa (descarga)
                if (deviceType !== "BATTERY_STORAGE") {
                    // Para los demás tipos, al menos en algunos casos produce positivo
                    expect(typeof reading.powerKw).toBe("number");
                }

                await adapter.disconnect();
            }
        );
    });

    // ── Protocolo MQTT ───────────────────────────────────────

    describe("Protocolo MQTT", () => {
        test("crea adaptador MQTT con protocolo correcto", async () => {
            const adapter = await DeviceAdapterFactory.create({
                deviceId: "mqtt-001",
                deviceType: "WIND_TURBINE",
                protocol: "MQTT",
            });
            expect(adapter.protocol).toBe("MQTT");
            expect(adapter.isConnected()).toBe(true);
            await adapter.disconnect();
        });

        test("MQTT readData() retorna lectura válida (simulada en v1)", async () => {
            const adapter = await DeviceAdapterFactory.create({
                deviceId: "mqtt-001",
                deviceType: "WIND_TURBINE",
                protocol: "MQTT",
            });
            const reading = await adapter.readData();
            expect(reading.status).toBe("ONLINE");
            expect(reading.metadata?.protocol).toBe("MQTT");
            await adapter.disconnect();
        });
    });

    // ── Protocolo REST ───────────────────────────────────────

    describe("Protocolo REST", () => {
        test("crea adaptador REST con protocolo correcto", async () => {
            const adapter = await DeviceAdapterFactory.create({
                deviceId: "rest-001",
                deviceType: "SMART_METER",
                protocol: "REST",
            });
            expect(adapter.protocol).toBe("REST");
            expect(adapter.isConnected()).toBe(true);
            await adapter.disconnect();
        });

        test("REST readData() retorna lectura válida (simulada en v1)", async () => {
            const adapter = await DeviceAdapterFactory.create({
                deviceId: "rest-001",
                deviceType: "SMART_METER",
                protocol: "REST",
            });
            const reading = await adapter.readData();
            expect(reading.metadata?.protocol).toBe("REST");
            await adapter.disconnect();
        });
    });

    // ── Aislamiento (cada fábrica crea instancias independientes) ───────

    describe("Aislamiento de instancias", () => {
        test("dos llamadas a create() producen adaptadores distintos", async () => {
            const a1 = await DeviceAdapterFactory.create({
                deviceId: "dev-A", deviceType: "SOLAR_PANEL", protocol: "SIMULATED",
            });
            const a2 = await DeviceAdapterFactory.create({
                deviceId: "dev-B", deviceType: "SOLAR_PANEL", protocol: "SIMULATED",
            });
            expect(a1).not.toBe(a2);
            expect(a1.deviceId).not.toBe(a2.deviceId);
            await a1.disconnect();
            await a2.disconnect();
        });
    });
});
