/**
 * ============================================================
 * Tests: Patrón ABSTRACT FACTORY — EnergySourceFactory
 * ============================================================
 */

import {
    getEnergyFactory,
    SolarEnergyFactory,
    WindEnergyFactory,
    BatteryEnergyFactory,
    GridEnergyFactory,
    type IEnergySourceFactory,
    type EnergySource,
} from "@/lib/energy/EnergySourceFactory";

// ── Helper ────────────────────────────────────────────────────
function expectValidFactory(factory: IEnergySourceFactory, source: EnergySource) {
    expect(factory.source).toBe(source);
    expect(typeof factory.createProducer).toBe("function");
    expect(typeof factory.createPriceEstimator).toBe("function");
    expect(typeof factory.createForecastModel).toBe("function");
}

// ── getEnergyFactory selector ────────────────────────────────

describe("getEnergyFactory — selector de fábrica", () => {
    const cases: EnergySource[] = ["SOLAR", "WIND", "BATTERY", "GRID"];

    test.each(cases)("retorna la fábrica correcta para %s", (source) => {
        const factory = getEnergyFactory(source);
        expect(factory.source).toBe(source);
    });

    test("instancias distintas para cada llamada (no Singleton)", () => {
        const f1 = getEnergyFactory("SOLAR");
        const f2 = getEnergyFactory("SOLAR");
        expect(f1).not.toBe(f2); // Abstract Factory ≠ Singleton
    });
});

// ── Familia SOLAR ────────────────────────────────────────────

describe("SolarEnergyFactory", () => {
    const factory = new SolarEnergyFactory();

    test("tiene source SOLAR", () => expectValidFactory(factory, "SOLAR"));

    test("Producer retorna lectura válida", async () => {
        const producer = factory.createProducer();
        expect(producer.source).toBe("SOLAR");
        expect(producer.getCapacityKw()).toBeGreaterThan(0);

        const reading = await producer.getCurrentReading();
        expect(reading.source).toBe("SOLAR");
        expect(reading.powerKw).toBeGreaterThanOrEqual(0);
        expect(reading.efficiency).toBeGreaterThanOrEqual(0);
        expect(reading.timestamp).toBeInstanceOf(Date);
    });

    test("PriceEstimator retorna cotización válida", async () => {
        const estimator = factory.createPriceEstimator();
        expect(estimator.source).toBe("SOLAR");

        const quote = await estimator.getCurrentQuote();
        expect(quote.source).toBe("SOLAR");
        expect(quote.pricePerKwh).toBeGreaterThan(0);
        expect(quote.currency).toBe("USD");
        expect(["UP", "DOWN", "STABLE"]).toContain(quote.trend);
        expect(estimator.getHistoricalAverage(30)).toBeGreaterThan(0);
    });

    test("ForecastModel retorna predicción de 24 puntos", async () => {
        const model = factory.createForecastModel();
        expect(model.source).toBe("SOLAR");
        expect(model.getConfidenceScore()).toBeGreaterThan(0.8); // solar muy predecible

        const forecast = await model.getDailyForecast();
        expect(forecast.source).toBe("SOLAR");
        expect(forecast.points).toHaveLength(24);
        expect(forecast.totalKwh).toBeGreaterThanOrEqual(0);
        forecast.points.forEach((p) => {
            expect(p.hour).toBeGreaterThanOrEqual(0);
            expect(p.hour).toBeLessThan(24);
            expect(p.predictedKw).toBeGreaterThanOrEqual(0);
        });
    });
});

// ── Familia WIND ─────────────────────────────────────────────

describe("WindEnergyFactory", () => {
    const factory = new WindEnergyFactory();

    test("tiene source WIND", () => expectValidFactory(factory, "WIND"));

    test("Producer retorna lectura válida", async () => {
        const producer = factory.createProducer();
        const reading = await producer.getCurrentReading();
        expect(reading.source).toBe("WIND");
        expect(reading.powerKw).toBeGreaterThanOrEqual(0);
    });

    test("PriceEstimator precio eólico menor que red", async () => {
        const windEstimator = new WindEnergyFactory().createPriceEstimator();
        const gridEstimator = new GridEnergyFactory().createPriceEstimator();
        const wind = await windEstimator.getCurrentQuote();
        const grid = await gridEstimator.getCurrentQuote();
        // Eólico tiene precio menor o igual que red (generalmente más barato)
        expect(wind.pricePerKwh).toBeLessThan(grid.pricePerKwh);
    });

    test("ForecastModel tiene menor confianza que solar (más volátil)", () => {
        const windModel = factory.createForecastModel();
        const solarModel = new SolarEnergyFactory().createForecastModel();
        expect(windModel.getConfidenceScore()).toBeLessThan(solarModel.getConfidenceScore());
    });
});

// ── Familia BATTERY ───────────────────────────────────────────

describe("BatteryEnergyFactory", () => {
    const factory = new BatteryEnergyFactory();

    test("tiene source BATTERY", () => expectValidFactory(factory, "BATTERY"));

    test("ForecastModel tiene altísima confianza (controlable)", () => {
        const model = factory.createForecastModel();
        expect(model.getConfidenceScore()).toBeGreaterThanOrEqual(0.9);
    });

    test("Producer puede tener powerKw negativo (cargando)", async () => {
        const producer = factory.createProducer();
        // Ejecutamos varias veces para encontrar la variedad de valores
        const readings = await Promise.all(
            Array.from({ length: 10 }, () => producer.getCurrentReading())
        );
        const powers = readings.map((r) => r.powerKw);
        // La batería puede cargar (neg) o descargar (pos) — verificamos que hay variedad
        expect(powers.some((p) => p !== 0)).toBe(true);
    });
});

// ── Familia GRID ─────────────────────────────────────────────

describe("GridEnergyFactory", () => {
    const factory = new GridEnergyFactory();

    test("tiene source GRID", () => expectValidFactory(factory, "GRID"));

    test("ForecastModel casi perfecto (red siempre disponible)", () => {
        const model = factory.createForecastModel();
        expect(model.getConfidenceScore()).toBeGreaterThanOrEqual(0.95);
    });

    test("PriceEstimator es el más caro de todas las fuentes", async () => {
        const sources: EnergySource[] = ["SOLAR", "WIND", "BATTERY", "GRID"];
        const quotes = await Promise.all(
            sources.map(async (s) => {
                const f = getEnergyFactory(s);
                return f.createPriceEstimator().getCurrentQuote();
            })
        );
        const gridPrice = quotes.find((q) => q.source === "GRID")!.pricePerKwh;
        const othersMax = Math.max(
            ...quotes.filter((q) => q.source !== "GRID").map((q) => q.pricePerKwh)
        );
        expect(gridPrice).toBeGreaterThan(othersMax);
    });
});

// ── Aislamiento entre familias ────────────────────────────────

describe("Aislamiento entre familias", () => {
    test("cada fábrica produce productos independientes entre sí", async () => {
        const solarFactory = getEnergyFactory("SOLAR");
        const windFactory = getEnergyFactory("WIND");

        const solarReading = await solarFactory.createProducer().getCurrentReading();
        const windReading = await windFactory.createProducer().getCurrentReading();

        expect(solarReading.source).toBe("SOLAR");
        expect(windReading.source).toBe("WIND");
        expect(solarReading.source).not.toBe(windReading.source);
    });
});
