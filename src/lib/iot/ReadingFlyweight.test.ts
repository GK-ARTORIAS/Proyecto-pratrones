/**
 * Tests: Patrón FLYWEIGHT — ReadingFlyweight
 */
import {
    ReadingFlyweightFactory,
    IoTReading,
    generateReadings,
    type SensorType,
} from "@/lib/iot/ReadingFlyweight";

beforeEach(() => ReadingFlyweightFactory.resetStats());

// ── Tests de ReadingFlyweightFactory (pool) ───────────────────

describe("ReadingFlyweightFactory — Flyweight Pool", () => {

    test("el pool tiene 8 tipos de sensor pre-cargados", () => {
        expect(ReadingFlyweightFactory.listPool()).toHaveLength(8);
    });

    test("get() devuelve EXACTAMENTE la misma instancia para el mismo tipo", () => {
        const fw1 = ReadingFlyweightFactory.get("POWER");
        const fw2 = ReadingFlyweightFactory.get("POWER");
        expect(fw1).toBe(fw2); // referencia idéntica — es el mismo objeto
    });

    test("get() devuelve instancias DISTINTAS para tipos distintos", () => {
        const power   = ReadingFlyweightFactory.get("POWER");
        const voltage = ReadingFlyweightFactory.get("VOLTAGE");
        expect(power).not.toBe(voltage);
    });

    test("N llamadas al mismo tipo = N-1 cache hits", () => {
        ReadingFlyweightFactory.get("WIND_SPEED"); // miss (ya estaba, hit)
        ReadingFlyweightFactory.get("WIND_SPEED");
        ReadingFlyweightFactory.get("WIND_SPEED");
        const stats = ReadingFlyweightFactory.getStats();
        expect(stats.totalRequests).toBe(3);
        expect(stats.cacheHits).toBe(3);       // todos preloaded → todos hits
    });

    test("hitRatio se acerca a 1 con uso repetido del mismo tipo", () => {
        for (let i = 0; i < 100; i++) ReadingFlyweightFactory.get("TEMPERATURE");
        expect(ReadingFlyweightFactory.getStats().hitRatio).toBeCloseTo(1, 1);
    });

    test("el pool nunca crece más allá de los tipos registrados", () => {
        ReadingFlyweightFactory.get("POWER");
        ReadingFlyweightFactory.get("VOLTAGE");
        ReadingFlyweightFactory.get("POWER");
        expect(ReadingFlyweightFactory.listPool().length).toBe(8); // no cambia
    });
});

// ── Tests de SensorTypeFlyweight ──────────────────────────────

describe("SensorTypeFlyweight — estado intrínseco", () => {

    test("POWER flyweight tiene unidad kW", () => {
        expect(ReadingFlyweightFactory.get("POWER").unit).toBe("kW");
    });

    test("TEMPERATURE flyweight tiene unidad °C", () => {
        expect(ReadingFlyweightFactory.get("TEMPERATURE").unit).toBe("°C");
    });

    test("format() devuelve valor con unidad correcta", () => {
        const fw = ReadingFlyweightFactory.get("POWER");
        expect(fw.format(12.345)).toBe("12.35 kW");
    });

    test("classify() devuelve NORMAL dentro del rango", () => {
        const fw = ReadingFlyweightFactory.get("VOLTAGE"); // range 210-250
        expect(fw.classify(230)).toBe("NORMAL");
    });

    test("classify() devuelve HIGH al superar el máximo", () => {
        const fw = ReadingFlyweightFactory.get("VOLTAGE");
        expect(fw.classify(260)).toBe("HIGH");
    });

    test("classify() devuelve CRITICAL al superar 1.5× el máximo", () => {
        const fw = ReadingFlyweightFactory.get("POWER"); // max=50 → critical >75
        expect(fw.classify(80)).toBe("CRITICAL");
    });
});

// ── Tests de IoTReading (cliente del flyweight) ───────────────

describe("IoTReading — cliente del Flyweight", () => {

    test("dos IoTReading del mismo tipo comparten el MISMO flyweight", () => {
        const r1 = new IoTReading("D1", new Date(), 10, "POWER");
        const r2 = new IoTReading("D2", new Date(), 20, "POWER");
        expect(r1.getFlyweight()).toBe(r2.getFlyweight()); // misma referencia
    });

    test("dos IoTReading de distinto tipo tienen flyweights DISTINTOS", () => {
        const r1 = new IoTReading("D1", new Date(), 10, "POWER");
        const r2 = new IoTReading("D1", new Date(), 220, "VOLTAGE");
        expect(r1.getFlyweight()).not.toBe(r2.getFlyweight());
    });

    test("el estado extrínseco es independiente entre lecturas", () => {
        const r1 = new IoTReading("D1", new Date(), 10, "POWER");
        const r2 = new IoTReading("D2", new Date(), 25, "POWER");
        expect(r1.rawValue).toBe(10);
        expect(r2.rawValue).toBe(25);
        expect(r1.deviceId).toBe("D1");
        expect(r2.deviceId).toBe("D2");
    });

    test("format() delega al flyweight compartido", () => {
        const reading = new IoTReading("D1", new Date(), 15.5, "POWER");
        expect(reading.format()).toBe("15.50 kW");
    });

    test("classify() delega al flyweight compartido", () => {
        const reading = new IoTReading("D1", new Date(), 230, "VOLTAGE");
        expect(reading.classify()).toBe("NORMAL");
    });

    test("getter unit delega al flyweight", () => {
        const r = new IoTReading("D1", new Date(), 1, "ENERGY_KWH");
        expect(r.unit).toBe("kWh");
    });
});

// ── Demostración de ahorro de memoria ─────────────────────────

describe("Ahorro de memoria — demostración", () => {

    test("1000 lecturas de 5 tipos → solo 5 instancias de flyweight", () => {
        ReadingFlyweightFactory.resetStats();
        const readings = generateReadings(1000);

        // Coleccionamos las referencias únicas a flyweights
        const uniqueFlyweights = new Set(readings.map((r) => r.getFlyweight()));

        expect(readings).toHaveLength(1000);
        expect(uniqueFlyweights.size).toBe(5); // solo 5 tipos distintos
    });

    test("con 500 lecturas, el hitRatio del pool es > 95%", () => {
        ReadingFlyweightFactory.resetStats();
        generateReadings(500);
        const { hitRatio } = ReadingFlyweightFactory.getStats();
        expect(hitRatio).toBeGreaterThan(0.95);
    });

    test("el pool permanece con 8 entradas tras generar 10,000 lecturas", () => {
        generateReadings(10_000);
        expect(ReadingFlyweightFactory.listPool()).toHaveLength(8);
    });
});
