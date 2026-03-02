/**
 * ============================================================
 * PATRÓN: FACTORY METHOD — IoT Device Adapters
 * ============================================================
 * Define una interfaz IDeviceAdapter y delega la creación
 * del adaptador correcto (MQTT, REST, SIMULATED) a una
 * fábrica concreta según el tipo de dispositivo.
 *
 * Esto permite agregar nuevos protocolos sin modificar
 * el código existente (Open/Closed Principle).
 * ============================================================
 */

// ── Tipos base del dominio ───────────────────────────────────

export type DeviceType =
    | "SOLAR_PANEL"
    | "WIND_TURBINE"
    | "SMART_METER"
    | "BATTERY_STORAGE";

export type DeviceProtocol = "MQTT" | "REST" | "SIMULATED";

export interface DeviceReading {
    deviceId: string;
    timestamp: Date;
    powerKw: number;       // potencia instantánea (kW)
    energyKwh: number;     // energía acumulada (kWh)
    status: "ONLINE" | "OFFLINE" | "ERROR";
    metadata?: Record<string, unknown>;
}

// ── Interfaz del producto (Adapter) ─────────────────────────

export interface IDeviceAdapter {
    readonly deviceId: string;
    readonly deviceType: DeviceType;
    readonly protocol: DeviceProtocol;

    /** Conecta al dispositivo */
    connect(): Promise<void>;

    /** Lee los datos actuales del dispositivo */
    readData(): Promise<DeviceReading>;

    /** Desconecta limpiamente */
    disconnect(): Promise<void>;

    /** Estado de la conexión */
    isConnected(): boolean;
}

// ── Implementaciones concretas ───────────────────────────────

/**
 * Adaptador MQTT: para dispositivos físicos reales con broker MQTT.
 * En v1 simula el comportamiento; la integración real va en el microservicio IoT.
 */
class MQTTDeviceAdapter implements IDeviceAdapter {
    readonly protocol: DeviceProtocol = "MQTT";
    private connected = false;

    constructor(
        readonly deviceId: string,
        readonly deviceType: DeviceType,
        private readonly brokerUrl: string = "mqtt://localhost:1883"
    ) { }

    async connect(): Promise<void> {
        // TODO: integrar con mqtt.js cuando se levante el microservicio IoT
        console.info(`[MQTT] Conectando a ${this.brokerUrl} — device: ${this.deviceId}`);
        this.connected = true;
    }

    async readData(): Promise<DeviceReading> {
        if (!this.connected) throw new Error("MQTT: Dispositivo no conectado");
        return this.generateSimulatedReading();
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        console.info(`[MQTT] Desconectado — device: ${this.deviceId}`);
    }

    isConnected(): boolean {
        return this.connected;
    }

    private generateSimulatedReading(): DeviceReading {
        return {
            deviceId: this.deviceId,
            timestamp: new Date(),
            powerKw: parseFloat((Math.random() * 5).toFixed(2)),
            energyKwh: parseFloat((Math.random() * 100).toFixed(2)),
            status: "ONLINE",
            metadata: { protocol: "MQTT", broker: this.brokerUrl },
        };
    }
}

/**
 * Adaptador REST: para dispositivos con API HTTP.
 */
class RESTDeviceAdapter implements IDeviceAdapter {
    readonly protocol: DeviceProtocol = "REST";
    private connected = false;

    constructor(
        readonly deviceId: string,
        readonly deviceType: DeviceType,
        private readonly apiUrl: string = "http://localhost:3004"
    ) { }

    async connect(): Promise<void> {
        // TODO: verificar que el endpoint /devices/:id existe antes de proceder
        console.info(`[REST] Verificando endpoint: ${this.apiUrl}/devices/${this.deviceId}`);
        this.connected = true;
    }

    async readData(): Promise<DeviceReading> {
        if (!this.connected) throw new Error("REST: Dispositivo no conectado");
        // TODO: fetch(`${this.apiUrl}/devices/${this.deviceId}/reading`)
        return this.generateSimulatedReading();
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    private generateSimulatedReading(): DeviceReading {
        return {
            deviceId: this.deviceId,
            timestamp: new Date(),
            powerKw: parseFloat((Math.random() * 8).toFixed(2)),
            energyKwh: parseFloat((Math.random() * 200).toFixed(2)),
            status: "ONLINE",
            metadata: { protocol: "REST", api: this.apiUrl },
        };
    }
}

/**
 * Adaptador SIMULATED: datos sintéticos para desarrollo y demos.
 * Modela cada tipo de dispositivo con patrones realistas.
 */
class SimulatedDeviceAdapter implements IDeviceAdapter {
    readonly protocol: DeviceProtocol = "SIMULATED";
    private connected = false;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(
        readonly deviceId: string,
        readonly deviceType: DeviceType
    ) { }

    async connect(): Promise<void> {
        this.connected = true;
        console.info(`[SIM] Dispositivo simulado activo: ${this.deviceType} — ${this.deviceId}`);
    }

    async readData(): Promise<DeviceReading> {
        if (!this.connected) throw new Error("SIM: Dispositivo no conectado");
        return {
            deviceId: this.deviceId,
            timestamp: new Date(),
            powerKw: this.simulatePower(),
            energyKwh: this.simulateEnergy(),
            status: "ONLINE",
            metadata: { simulated: true, deviceType: this.deviceType },
        };
    }

    async disconnect(): Promise<void> {
        if (this.intervalId) clearInterval(this.intervalId);
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    /** Simula potencia según el tipo de dispositivo con variación realista */
    private simulatePower(): number {
        const hour = new Date().getHours();
        switch (this.deviceType) {
            case "SOLAR_PANEL": {
                // Producción solar: pico al mediodía
                const solarFactor = Math.sin(((hour - 6) / 12) * Math.PI);
                return parseFloat((Math.max(0, solarFactor * 4 + Math.random() * 0.5)).toFixed(2));
            }
            case "WIND_TURBINE":
                return parseFloat((Math.random() * 6 + 1).toFixed(2));
            case "SMART_METER":
                // Consumo del hogar: picos mañana y noche
                return parseFloat(((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 22)
                    ? Math.random() * 3 + 2
                    : Math.random() * 1.5 + 0.5
                ).toFixed(2));
            case "BATTERY_STORAGE":
                return parseFloat((Math.random() * 2 - 1).toFixed(2)); // puede cargar o descargar
            default:
                return parseFloat((Math.random() * 2).toFixed(2));
        }
    }

    private simulateEnergy(): number {
        return parseFloat((Math.random() * 150 + 50).toFixed(2));
    }
}

// ── Factory Method ───────────────────────────────────────────

/**
 * Clase creadora abstracta (Creator) con el Factory Method.
 */
abstract class DeviceAdapterCreator {
    /** Factory Method — subclases deciden qué adaptador crear */
    abstract createAdapter(deviceId: string, deviceType: DeviceType): IDeviceAdapter;

    /** Método de template que usa el factory method */
    async getAndConnect(deviceId: string, deviceType: DeviceType): Promise<IDeviceAdapter> {
        const adapter = this.createAdapter(deviceId, deviceType);
        await adapter.connect();
        return adapter;
    }
}

class MQTTAdapterCreator extends DeviceAdapterCreator {
    constructor(private readonly brokerUrl?: string) {
        super();
    }
    createAdapter(deviceId: string, deviceType: DeviceType): IDeviceAdapter {
        return new MQTTDeviceAdapter(deviceId, deviceType, this.brokerUrl);
    }
}

class RESTAdapterCreator extends DeviceAdapterCreator {
    constructor(private readonly apiUrl?: string) {
        super();
    }
    createAdapter(deviceId: string, deviceType: DeviceType): IDeviceAdapter {
        return new RESTDeviceAdapter(deviceId, deviceType, this.apiUrl);
    }
}

class SimulatedAdapterCreator extends DeviceAdapterCreator {
    createAdapter(deviceId: string, deviceType: DeviceType): IDeviceAdapter {
        return new SimulatedDeviceAdapter(deviceId, deviceType);
    }
}

// ── Punto de entrada público ─────────────────────────────────

/**
 * DeviceAdapterFactory: selecciona el CreadorConcreto correcto
 * según el protocolo y devuelve el adaptador listo para usar.
 *
 * @example
 *   const adapter = await DeviceAdapterFactory.create({
 *     deviceId: 'dev-001',
 *     deviceType: 'SOLAR_PANEL',
 *     protocol: 'SIMULATED',
 *   });
 *   const reading = await adapter.readData();
 */
export class DeviceAdapterFactory {
    static async create(params: {
        deviceId: string;
        deviceType: DeviceType;
        protocol: DeviceProtocol;
        brokerUrl?: string;
        apiUrl?: string;
    }): Promise<IDeviceAdapter> {
        let creator: DeviceAdapterCreator;

        switch (params.protocol) {
            case "MQTT":
                creator = new MQTTAdapterCreator(params.brokerUrl);
                break;
            case "REST":
                creator = new RESTAdapterCreator(params.apiUrl);
                break;
            case "SIMULATED":
            default:
                creator = new SimulatedAdapterCreator();
        }

        return creator.getAndConnect(params.deviceId, params.deviceType);
    }
}

// _Factory Method
