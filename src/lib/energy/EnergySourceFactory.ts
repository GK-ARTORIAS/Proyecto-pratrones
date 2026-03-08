/**
 * ============================================================
 * PATRÓN: ABSTRACT FACTORY — EnergySourceFactory
 * ============================================================
 * Crea FAMILIAS de objetos relacionados por fuente de energía.
 * Cada familia (Solar, Eólica, Batería, Red) produce tres
 * productos coherentes entre sí:
 *
 *   IEnergyProducer  → lee producción/consumo actual
 *   IPriceEstimator  → calcula el precio de mercado
 *   IForecastModel   → predice la producción futura
 *
 * El cliente (UI / servicio) solo trabaja con las interfaces,
 * nunca con las clases concretas. Cambiar de familia es
 * cuestión de cambiar solo la fábrica.
 *
 * Participantes GoF:
 *   AbstractFactory  → IEnergySourceFactory
 *   ConcreteFactory  → SolarEnergyFactory | WindEnergyFactory
 *                      BatteryEnergyFactory | GridEnergyFactory
 *   AbstractProduct  → IEnergyProducer | IPriceEstimator | IForecastModel
 *   ConcreteProduct  → Solar*, Wind*, Battery*, Grid* (por interfaz)
 * ============================================================
 */

// ── Tipos compartidos ────────────────────────────────────────

export type EnergySource = "SOLAR" | "WIND" | "BATTERY" | "GRID";

export interface EnergyReading {
    source: EnergySource;
    powerKw: number;       // producción positiva / consumo negativo
    timestamp: Date;
    efficiency: number;    // 0–1
}

export interface PriceQuote {
    source: EnergySource;
    pricePerKwh: number;   // USD
    currency: "USD";
    validUntilMinutes: number;
    trend: "UP" | "DOWN" | "STABLE";
}

export interface ForecastPoint {
    hour: number;          // 0–23
    predictedKw: number;
    confidence: number;    // 0–1
}

export interface DailyForecast {
    source: EnergySource;
    date: string;          // ISO date
    points: ForecastPoint[];
    totalKwh: number;
}

// ── Interfaces de los productos (Abstract Products) ──────────

/**
 * Producto A: Lee la producción o consumo actual de la fuente.
 */
export interface IEnergyProducer {
    readonly source: EnergySource;
    getCurrentReading(): Promise<EnergyReading>;
    getCapacityKw(): number;
}

/**
 * Producto B: Estima el precio de mercado de la fuente.
 */
export interface IPriceEstimator {
    readonly source: EnergySource;
    getCurrentQuote(): Promise<PriceQuote>;
    getHistoricalAverage(days: number): number;
}

/**
 * Producto C: Predice la producción futura de la fuente.
 */
export interface IForecastModel {
    readonly source: EnergySource;
    getDailyForecast(daysAhead?: number): Promise<DailyForecast>;
    getConfidenceScore(): number;
}

// ── Abstract Factory ─────────────────────────────────────────

/**
 * La Abstract Factory: declara los tres métodos de creación.
 * Cada fábrica concreta los implementará para su fuente.
 */
export interface IEnergySourceFactory {
    readonly source: EnergySource;
    createProducer(): IEnergyProducer;
    createPriceEstimator(): IPriceEstimator;
    createForecastModel(): IForecastModel;
}

// ============================================================
// FAMILIA 1: SOLAR
// ============================================================

class SolarProducer implements IEnergyProducer {
    readonly source: EnergySource = "SOLAR";
    private readonly capacityKw: number;

    constructor(capacityKw = 5.0) {
        this.capacityKw = capacityKw;
    }

    async getCurrentReading(): Promise<EnergyReading> {
        const hour = new Date().getHours();
        // Curva solar: seno entre las 6h y las 18h
        const solarFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
        const powerKw = parseFloat((solarFactor * this.capacityKw * (0.8 + Math.random() * 0.2)).toFixed(2));
        return {
            source: "SOLAR",
            powerKw,
            timestamp: new Date(),
            efficiency: solarFactor > 0 ? parseFloat((0.75 + Math.random() * 0.2).toFixed(2)) : 0,
        };
    }

    getCapacityKw(): number {
        return this.capacityKw;
    }
}

class SolarPriceEstimator implements IPriceEstimator {
    readonly source: EnergySource = "SOLAR";

    async getCurrentQuote(): Promise<PriceQuote> {
        const hour = new Date().getHours();
        // Solar es más barato al mediodía (mayor oferta)
        const basePrice = hour >= 10 && hour <= 15 ? 0.105 : 0.128;
        return {
            source: "SOLAR",
            pricePerKwh: parseFloat((basePrice + (Math.random() * 0.01 - 0.005)).toFixed(4)),
            currency: "USD",
            validUntilMinutes: 15,
            trend: hour >= 10 && hour <= 14 ? "DOWN" : "UP",
        };
    }

    getHistoricalAverage(days: number): number {
        // Promedio histórico simulado: varía ±5% con los días
        return parseFloat((0.118 + Math.sin(days) * 0.005).toFixed(4));
    }
}

class SolarForecastModel implements IForecastModel {
    readonly source: EnergySource = "SOLAR";

    async getDailyForecast(daysAhead = 0): Promise<DailyForecast> {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const points: ForecastPoint[] = Array.from({ length: 24 }, (_, hour) => {
            const solarFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
            return {
                hour,
                predictedKw: parseFloat((solarFactor * 4.5 + Math.random() * 0.3).toFixed(2)),
                confidence: solarFactor > 0
                    ? parseFloat((0.85 - daysAhead * 0.04 + Math.random() * 0.05).toFixed(2))
                    : 1.0,
            };
        });
        return {
            source: "SOLAR",
            date: date.toISOString().split("T")[0],
            points,
            totalKwh: parseFloat(points.reduce((s, p) => s + p.predictedKw, 0).toFixed(2)),
        };
    }

    getConfidenceScore(): number {
        return 0.88; // Solar es bastante predecible con datos históricos
    }
}

export class SolarEnergyFactory implements IEnergySourceFactory {
    readonly source: EnergySource = "SOLAR";
    createProducer(): IEnergyProducer { return new SolarProducer(); }
    createPriceEstimator(): IPriceEstimator { return new SolarPriceEstimator(); }
    createForecastModel(): IForecastModel { return new SolarForecastModel(); }
}

// ============================================================
// FAMILIA 2: EÓLICA (WIND)
// ============================================================

class WindProducer implements IEnergyProducer {
    readonly source: EnergySource = "WIND";

    async getCurrentReading(): Promise<EnergyReading> {
        // Viento: aleatoria con ráfagas
        const windSpeed = Math.random() * 12 + 2; // m/s entre 2 y 14
        const powerKw = parseFloat((Math.pow(windSpeed / 14, 3) * 6).toFixed(2));
        return {
            source: "WIND",
            powerKw,
            timestamp: new Date(),
            efficiency: parseFloat((0.35 + Math.random() * 0.15).toFixed(2)),
        };
    }

    getCapacityKw(): number { return 6.0; }
}

class WindPriceEstimator implements IPriceEstimator {
    readonly source: EnergySource = "WIND";

    async getCurrentQuote(): Promise<PriceQuote> {
        const pricePerKwh = parseFloat((0.092 + Math.random() * 0.015).toFixed(4));
        return {
            source: "WIND",
            pricePerKwh,
            currency: "USD",
            validUntilMinutes: 10,
            trend: pricePerKwh < 0.098 ? "DOWN" : "UP",
        };
    }

    getHistoricalAverage(_days: number): number {
        return 0.097;
    }
}

class WindForecastModel implements IForecastModel {
    readonly source: EnergySource = "WIND";

    async getDailyForecast(daysAhead = 0): Promise<DailyForecast> {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const points: ForecastPoint[] = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            predictedKw: parseFloat((Math.random() * 5 + 1).toFixed(2)),
            confidence: parseFloat((0.70 - daysAhead * 0.06).toFixed(2)), // viento, menos predecible
        }));
        return {
            source: "WIND",
            date: date.toISOString().split("T")[0],
            points,
            totalKwh: parseFloat(points.reduce((s, p) => s + p.predictedKw, 0).toFixed(2)),
        };
    }

    getConfidenceScore(): number { return 0.72; } // Viento es más volátil
}

export class WindEnergyFactory implements IEnergySourceFactory {
    readonly source: EnergySource = "WIND";
    createProducer(): IEnergyProducer { return new WindProducer(); }
    createPriceEstimator(): IPriceEstimator { return new WindPriceEstimator(); }
    createForecastModel(): IForecastModel { return new WindForecastModel(); }
}

// ============================================================
// FAMILIA 3: BATERÍA (BATTERY)
// ============================================================

class BatteryProducer implements IEnergyProducer {
    readonly source: EnergySource = "BATTERY";
    private chargeLevel = 0.75; // 75% cargada

    async getCurrentReading(): Promise<EnergyReading> {
        // Batería: puede cargar (negativo) o descargar (positivo)
        const powerKw = parseFloat(((Math.random() * 4 - 2)).toFixed(2));
        return {
            source: "BATTERY",
            powerKw,
            timestamp: new Date(),
            efficiency: 0.92, // baterías tienen eficiencia alta y estable
        };
    }

    getCapacityKw(): number { return 4.0; }
    getChargeLevel(): number { return this.chargeLevel; }
}

class BatteryPriceEstimator implements IPriceEstimator {
    readonly source: EnergySource = "BATTERY";

    async getCurrentQuote(): Promise<PriceQuote> {
        const hour = new Date().getHours();
        // Batería cobra más en horas pico (mayor demanda)
        const isPeak = (hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 22);
        return {
            source: "BATTERY",
            pricePerKwh: parseFloat((isPeak ? 0.155 : 0.132).toFixed(4)),
            currency: "USD",
            validUntilMinutes: 5,
            trend: isPeak ? "UP" : "STABLE",
        };
    }

    getHistoricalAverage(_days: number): number { return 0.141; }
}

class BatteryForecastModel implements IForecastModel {
    readonly source: EnergySource = "BATTERY";

    async getDailyForecast(daysAhead = 0): Promise<DailyForecast> {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const points: ForecastPoint[] = Array.from({ length: 24 }, (_, hour) => {
            const isPeak = (hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 22);
            return {
                hour,
                predictedKw: isPeak ? parseFloat((Math.random() * 3 + 1.5).toFixed(2)) : 0,
                confidence: 0.95, // batería es totalmente controlable = alta confianza
            };
        });
        return {
            source: "BATTERY",
            date: date.toISOString().split("T")[0],
            points,
            totalKwh: parseFloat(points.reduce((s, p) => s + p.predictedKw, 0).toFixed(2)),
        };
    }

    getConfidenceScore(): number { return 0.95; }
}

export class BatteryEnergyFactory implements IEnergySourceFactory {
    readonly source: EnergySource = "BATTERY";
    createProducer(): IEnergyProducer { return new BatteryProducer(); }
    createPriceEstimator(): IPriceEstimator { return new BatteryPriceEstimator(); }
    createForecastModel(): IForecastModel { return new BatteryForecastModel(); }
}

// ============================================================
// FAMILIA 4: RED ELÉCTRICA (GRID)
// ============================================================

class GridProducer implements IEnergyProducer {
    readonly source: EnergySource = "GRID";

    async getCurrentReading(): Promise<EnergyReading> {
        return {
            source: "GRID",
            powerKw: parseFloat((Math.random() * 2 + 0.5).toFixed(2)), // consumo de red
            timestamp: new Date(),
            efficiency: 0.98, // red siempre disponible
        };
    }

    getCapacityKw(): number { return Infinity; } // red tiene capacidad ilimitada
}

class GridPriceEstimator implements IPriceEstimator {
    readonly source: EnergySource = "GRID";

    async getCurrentQuote(): Promise<PriceQuote> {
        const hour = new Date().getHours();
        const isPeak = (hour >= 17 && hour <= 21);
        return {
            source: "GRID",
            pricePerKwh: parseFloat((isPeak ? 0.195 : 0.168).toFixed(4)),
            currency: "USD",
            validUntilMinutes: 60, // tarifas de red cambian lento
            trend: isPeak ? "UP" : "STABLE",
        };
    }

    getHistoricalAverage(_days: number): number { return 0.178; }
}

class GridForecastModel implements IForecastModel {
    readonly source: EnergySource = "GRID";

    async getDailyForecast(daysAhead = 0): Promise<DailyForecast> {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const points: ForecastPoint[] = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            predictedKw: parseFloat((Math.random() * 1.5 + 0.3).toFixed(2)),
            confidence: 0.99, // red eléctrica = casi perfectamente predecible
        }));
        return {
            source: "GRID",
            date: date.toISOString().split("T")[0],
            points,
            totalKwh: parseFloat(points.reduce((s, p) => s + p.predictedKw, 0).toFixed(2)),
        };
    }

    getConfidenceScore(): number { return 0.99; }
}

export class GridEnergyFactory implements IEnergySourceFactory {
    readonly source: EnergySource = "GRID";
    createProducer(): IEnergyProducer { return new GridProducer(); }
    createPriceEstimator(): IPriceEstimator { return new GridPriceEstimator(); }
    createForecastModel(): IForecastModel { return new GridForecastModel(); }
}

// ============================================================
// SELECTOR DE FÁBRICA — punto de entrada público
// ============================================================

/**
 * Retorna la fábrica concreta correcta según la fuente de energía.
 * El cliente solo necesita llamar a este método y luego usar
 * los productos a través de sus interfaces.
 *
 * @example
 *   const factory = getEnergyFactory("SOLAR");
 *   const producer  = factory.createProducer();
 *   const estimator = factory.createPriceEstimator();
 *   const forecast  = factory.createForecastModel();
 *
 *   const reading = await producer.getCurrentReading();
 *   const quote   = await estimator.getCurrentQuote();
 *   const pred    = await forecast.getDailyForecast();
 */
export function getEnergyFactory(source: EnergySource): IEnergySourceFactory {
    switch (source) {
        case "SOLAR": return new SolarEnergyFactory();
        case "WIND": return new WindEnergyFactory();
        case "BATTERY": return new BatteryEnergyFactory();
        case "GRID": return new GridEnergyFactory();
    }
}

// _Abstract Factory
