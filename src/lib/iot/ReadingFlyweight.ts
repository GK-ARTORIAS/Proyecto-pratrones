/**
 * ============================================================
 * PATRÓN: FLYWEIGHT — ReadingFlyweight
 * ============================================================
 * Problema: una red IoT con 50 dispositivos genera ~3000 lecturas
 * por minuto. Sin Flyweight, cada objeto IoTReading almacena
 * en memoria datos IDÉNTICOS para el mismo tipo de sensor:
 *   { sensorType:"POWER", unit:"kW", displayLabel:"Potencia",
 *     colorClass:"text-yellow-400", normalRange:{min:0,max:50} }
 * → esos 5 campos se repiten en TODAS las lecturas de POWER.
 *
 * Solución: separar el estado en dos partes:
 *   Intrínseco (compartido, inmutable) → SensorTypeFlyweight
 *   Extrínseco (único por instancia)   → campos de IoTReading
 *
 * La fábrica (ReadingFlyweightFactory) mantiene un pool de
 * flyweights: si ya existe uno para "POWER", lo reutiliza.
 * 10,000 lecturas de POWER → 1 sola instancia SensorTypeFlyweight.
 *
 * Participantes GoF:
 *   Flyweight        → SensorTypeFlyweight (estado intrínseco)
 *   FlyweightFactory → ReadingFlyweightFactory (pool de flyweights)
 *   Client           → IoTReading (mantiene estado extrínseco +
 *                      referencia al flyweight)
 * ============================================================
 */

// ── Tipos de sensor soportados ────────────────────────────────

export type SensorType =
    | "POWER"       // kW    — potencia activa
    | "VOLTAGE"     // V     — tensión
    | "CURRENT"     // A     — corriente
    | "TEMPERATURE" // °C    — temperatura del panel
    | "IRRADIANCE"  // W/m²  — radiación solar
    | "WIND_SPEED"  // m/s   — velocidad del viento
    | "ENERGY_KWH"  // kWh   — energía acumulada
    | "HUMIDITY";   // %     — humedad ambiental

// ── FLYWEIGHT — estado intrínseco (compartido, inmutable) ─────

/**
 * SensorTypeFlyweight: objeto compartido con los metadatos
 * del tipo de sensor. Se instancia UNA SOLA VEZ por sensorType
 * sin importar cuántas lecturas se creen.
 */
export interface SensorTypeFlyweight {
    readonly sensorType:   SensorType;
    readonly unit:         string;
    readonly displayLabel: string;
    readonly colorHex:     string;
    readonly icon:         string;
    readonly normalRange:  { min: number; max: number };
    readonly decimals:     number;

    /** Formatea un valor usando los metadatos compartidos */
    format(value: number): string;
    /** Clasifica el valor como normal, alto o crítico */
    classify(value: number): "NORMAL" | "HIGH" | "CRITICAL";
}

// Implementación concreta del flyweight
class SensorFlyweight implements SensorTypeFlyweight {
    constructor(
        readonly sensorType:   SensorType,
        readonly unit:         string,
        readonly displayLabel: string,
        readonly colorHex:     string,
        readonly icon:         string,
        readonly normalRange:  { min: number; max: number },
        readonly decimals:     number,
    ) {}

    format(value: number): string {
        return `${value.toFixed(this.decimals)} ${this.unit}`;
    }

    classify(value: number): "NORMAL" | "HIGH" | "CRITICAL" {
        const { min, max } = this.normalRange;
        if (value < min || value > max * 1.5) return "CRITICAL";
        if (value > max)                      return "HIGH";
        return "NORMAL";
    }
}

// ── FLYWEIGHT FACTORY — pool de flyweights ────────────────────

const SENSOR_DEFINITIONS: Array<{
    sensorType: SensorType; unit: string; displayLabel: string;
    colorHex: string; icon: string; normalRange: { min: number; max: number }; decimals: number;
}> = [
    { sensorType: "POWER",       unit: "kW",   displayLabel: "Potencia",       colorHex: "#f59e0b", icon: "⚡", normalRange: { min: 0,   max: 50  }, decimals: 2 },
    { sensorType: "VOLTAGE",     unit: "V",    displayLabel: "Voltaje",         colorHex: "#3b82f6", icon: "🔌", normalRange: { min: 210, max: 250 }, decimals: 1 },
    { sensorType: "CURRENT",     unit: "A",    displayLabel: "Corriente",       colorHex: "#8b5cf6", icon: "〰️", normalRange: { min: 0,   max: 30  }, decimals: 2 },
    { sensorType: "TEMPERATURE", unit: "°C",   displayLabel: "Temperatura",     colorHex: "#ef4444", icon: "🌡️", normalRange: { min: -10, max: 55  }, decimals: 1 },
    { sensorType: "IRRADIANCE",  unit: "W/m²", displayLabel: "Irradiancia",     colorHex: "#f97316", icon: "☀️", normalRange: { min: 0,   max: 1000 }, decimals: 0 },
    { sensorType: "WIND_SPEED",  unit: "m/s",  displayLabel: "Viento",          colorHex: "#06b6d4", icon: "💨", normalRange: { min: 0,   max: 25  }, decimals: 1 },
    { sensorType: "ENERGY_KWH",  unit: "kWh",  displayLabel: "Energía",         colorHex: "#10b981", icon: "🔋", normalRange: { min: 0,   max: 1e6 }, decimals: 2 },
    { sensorType: "HUMIDITY",    unit: "%",    displayLabel: "Humedad",          colorHex: "#6366f1", icon: "💧", normalRange: { min: 0,   max: 90  }, decimals: 0 },
];

/**
 * ReadingFlyweightFactory: gestiona el pool de flyweights.
 * Garantiza que solo existe UNA instancia por tipo de sensor.
 */
export class ReadingFlyweightFactory {
    // Pool estático: todos los clientes comparten el mismo pool
    private static readonly _pool = new Map<SensorType, SensorTypeFlyweight>();
    private static _requestCount = 0;
    private static _cacheHits    = 0;

    static {
        // Pre-cargar todos los flyweights al inicializar el módulo
        for (const def of SENSOR_DEFINITIONS) {
            ReadingFlyweightFactory._pool.set(
                def.sensorType,
                new SensorFlyweight(
                    def.sensorType, def.unit, def.displayLabel,
                    def.colorHex, def.icon, def.normalRange, def.decimals
                )
            );
        }
    }

    /**
     * Devuelve el flyweight para el tipo de sensor dado.
     * Si ya existe en el pool, lo reutiliza (no crea nuevo objeto).
     */
    static get(sensorType: SensorType): SensorTypeFlyweight {
        ReadingFlyweightFactory._requestCount++;

        const existing = ReadingFlyweightFactory._pool.get(sensorType);
        if (existing) {
            ReadingFlyweightFactory._cacheHits++;
            return existing;
        }

        // Caso defensivo: si alguien pasa un tipo desconocido, crea uno genérico
        const generic = new SensorFlyweight(
            sensorType, "?", sensorType, "#94a3b8", "📊",
            { min: 0, max: 1000 }, 2
        );
        ReadingFlyweightFactory._pool.set(sensorType, generic);
        return generic;
    }

    /** Lista todos los flyweights en el pool */
    static listPool(): SensorTypeFlyweight[] {
        return Array.from(ReadingFlyweightFactory._pool.values());
    }

    /** Estadísticas de uso del pool */
    static getStats() {
        return {
            poolSize:     ReadingFlyweightFactory._pool.size,
            totalRequests: ReadingFlyweightFactory._requestCount,
            cacheHits:    ReadingFlyweightFactory._cacheHits,
            hitRatio:     ReadingFlyweightFactory._requestCount > 0
                ? ReadingFlyweightFactory._cacheHits / ReadingFlyweightFactory._requestCount
                : 0,
        };
    }

    static resetStats() {
        ReadingFlyweightFactory._requestCount = 0;
        ReadingFlyweightFactory._cacheHits    = 0;
    }
}

// ── Client — IoTReading (estado extrínseco + ref al flyweight) ─

/**
 * IoTReading: objeto que representa una lectura individual.
 * Solo almacena el estado EXTRÍNSECO (único por lectura).
 * El estado intrínseco viene del flyweight compartido.
 */
export class IoTReading {
    // Estado extrínseco — único por instancia
    readonly deviceId:  string;
    readonly timestamp: Date;
    readonly rawValue:  number;

    // Referencia al flyweight — compartida con todas las lecturas del mismo tipo
    private readonly _flyweight: SensorTypeFlyweight;

    constructor(deviceId: string, timestamp: Date, rawValue: number, sensorType: SensorType) {
        this.deviceId  = deviceId;
        this.timestamp = timestamp;
        this.rawValue  = rawValue;
        // Obtiene el flyweight del pool — no crea nuevo objeto si ya existe
        this._flyweight = ReadingFlyweightFactory.get(sensorType);
    }

    // Delegación al flyweight para operaciones sobre metadatos
    get sensorType():   SensorType { return this._flyweight.sensorType; }
    get unit():         string     { return this._flyweight.unit; }
    get displayLabel(): string     { return this._flyweight.displayLabel; }
    get colorHex():     string     { return this._flyweight.colorHex; }
    get icon():         string     { return this._flyweight.icon; }
    get normalRange()              { return this._flyweight.normalRange; }

    format():   string                         { return this._flyweight.format(this.rawValue); }
    classify(): "NORMAL" | "HIGH" | "CRITICAL" { return this._flyweight.classify(this.rawValue); }

    /** Retorna el flyweight compartido (para inspección/tests) */
    getFlyweight(): SensorTypeFlyweight { return this._flyweight; }
}

// ── Generador de lecturas de demo ─────────────────────────────

/**
 * Genera N lecturas aleatorias para demostrar el ahorro de memoria.
 * Todas las lecturas del mismo tipo comparten 1 solo flyweight.
 */
export function generateReadings(count: number): IoTReading[] {
    const sensors: SensorType[] = ["POWER", "VOLTAGE", "CURRENT", "TEMPERATURE", "IRRADIANCE"];
    const devices = ["DEV-001", "DEV-002", "DEV-003"];
    const readings: IoTReading[] = [];

    for (let i = 0; i < count; i++) {
        const sensor    = sensors[i % sensors.length];
        const device    = devices[i % devices.length];
        const fw        = ReadingFlyweightFactory.get(sensor);
        const { min, max } = fw.normalRange;
        const value     = min + Math.random() * (max - min) * 1.2; // a veces pasa el máximo

        readings.push(new IoTReading(device, new Date(), value, sensor));
    }
    return readings;
}

// _Flyweight
