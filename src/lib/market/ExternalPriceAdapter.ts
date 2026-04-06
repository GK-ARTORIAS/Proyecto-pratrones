/**
 * ============================================================
 * PATRÓN: ADAPTER — ExternalPriceAdapter
 * ============================================================
 * Problema: los proveedores externos de precios de energía
 * (OMIE, ENTSO-E, APIs legacy) devuelven datos en formatos
 * incompatibles con la interfaz IPriceEstimator usada por
 * el Abstract Factory de este sistema.
 *
 * Solución: el Adapter traduce la interfaz incompatible de
 * cada proveedor externo a la interfaz estándar IPriceEstimator.
 * El resto del sistema (páginas, servicios) solo conoce
 * IPriceEstimator y no sabe nada del proveedor real.
 *
 * Participantes GoF:
 *   Target   → IPriceEstimator   (interfaz que usa el sistema)
 *   Adaptee  → IExternalXxxApi   (interfaz incompatible externa)
 *   Adapter  → OmieAdapter, EntsoAdapter, OctopusAdapter
 *   Client   → Cualquier código que use IPriceEstimator
 *
 * Flujo:
 *   Cliente llama → Adapter.getCurrentQuote()
 *   Adapter llama → AdapteeAPI.fetchPrice() (formato incompatible)
 *   Adapter traduce la respuesta al formato PriceQuote estándar
 * ============================================================
 */

// ── Target Interface (sistema interno) ───────────────────────
export type PriceTrend = "UP" | "DOWN" | "STABLE";
export type EnergySourceType = "SOLAR" | "WIND" | "BATTERY" | "GRID" | "UNKNOWN";

export interface PriceQuote {
  source:          EnergySourceType;
  pricePerKwh:     number;
  validForMinutes: number;
  trend:           PriceTrend;
  historicalAvg:   number;
  currency:        string;
  fetchedAt:       Date;
}

/** Target: interfaz que usa el sistema internamente */
export interface IPriceEstimator {
  getCurrentQuote(): Promise<PriceQuote>;
}

// ── Adaptee Interfaces (APIs externas incompatibles) ─────────

/**
 * Formato de respuesta del mercado OMIE (España/Portugal).
 * Usa precios en €/MWh, nomenclatura diferente.
 */
export interface IOmieMarketApi {
  fetchDayAheadPrice(fecha: string): Promise<{
    precio_mwh:     number;   // €/MWh (no USD/kWh)
    variacion_pct:  number;   // variación porcentual vs ayer
    tecnologia:     "SOLAR" | "EOLICA" | "HIDRO" | "TERMICO";
    promedio_7dias: number;
  }>;
}

/**
 * Formato de respuesta de ENTSO-E (red europea).
 * Devuelve arrays de intervalos de tiempo.
 */
export interface IEntsoEApi {
  getTransparencyData(params: { area: string; periodStart: string; periodEnd: string }): Promise<{
    TimeSeries: Array<{
      Period: {
        Point: Array<{ position: number; price_Amount: number }>;
      };
    }>;
    unit: "MWH";
    currency: "EUR";
  }>;
}

/**
 * Formato de Octopus Energy API (UK).
 * Precios en p/kWh (peniques), intervalos de 30min.
 */
export interface IOctopusEnergyApi {
  getAgileRates(productCode: string): Promise<{
    results: Array<{
      value_exc_vat: number;   // peniques/kWh
      value_inc_vat: number;
      valid_from:    string;
      valid_to:      string;
    }>;
    count: number;
  }>;
}

// ── Adaptadores concretos ─────────────────────────────────────

/**
 * Adapter 1: OMIE → IPriceEstimator
 * Traduce €/MWh a USD/kWh, tecnología española a EnergySource
 */
export class OmieAdapter implements IPriceEstimator {
  private readonly EUR_TO_USD = 1.08;
  private readonly MWH_TO_KWH = 0.001;

  constructor(private readonly omieApi: IOmieMarketApi) {}

  async getCurrentQuote(): Promise<PriceQuote> {
    const today = new Date().toISOString().split("T")[0];
    const raw = await this.omieApi.fetchDayAheadPrice(today);

    // Traducción de tecnología española → EnergySource interna
    const sourceMap: Record<string, EnergySourceType> = {
      SOLAR: "SOLAR",
      EOLICA: "WIND",
      HIDRO: "GRID",
      TERMICO: "GRID",
    };

    // Conversión €/MWh → USD/kWh
    const priceUsdKwh = raw.precio_mwh * this.EUR_TO_USD * this.MWH_TO_KWH;
    const avgUsdKwh   = raw.promedio_7dias * this.EUR_TO_USD * this.MWH_TO_KWH;

    // Traducción de variación % a tendencia
    let trend: PriceTrend = "STABLE";
    if (raw.variacion_pct >  1) trend = "UP";
    if (raw.variacion_pct < -1) trend = "DOWN";

    return {
      source:          sourceMap[raw.tecnologia] ?? "UNKNOWN",
      pricePerKwh:     parseFloat(priceUsdKwh.toFixed(6)),
      validForMinutes: 60,
      trend,
      historicalAvg:   parseFloat(avgUsdKwh.toFixed(6)),
      currency:        "USD",
      fetchedAt:       new Date(),
    };
  }
}

/**
 * Adapter 2: ENTSO-E → IPriceEstimator
 * Extrae el precio promedio de un array de intervalos europeos
 */
export class EntsoEAdapter implements IPriceEstimator {
  private readonly EUR_TO_USD = 1.08;
  private readonly MWH_TO_KWH = 0.001;

  constructor(
    private readonly entsoApi: IEntsoEApi,
    private readonly area:     string = "10YES-REE------0", // España
    private readonly source:   EnergySourceType = "GRID",
  ) {}

  async getCurrentQuote(): Promise<PriceQuote> {
    const now   = new Date();
    const start = now.toISOString().slice(0, 13).replace("T", "") + "00";
    const end   = new Date(now.getTime() + 3600000).toISOString().slice(0, 13).replace("T", "") + "00";

    const raw = await this.entsoApi.getTransparencyData({
      area: this.area,
      periodStart: start,
      periodEnd:   end,
    });

    // Extraer todos los precios y calcular promedio
    const allPrices: number[] = raw.TimeSeries.flatMap((ts) =>
      ts.Period.Point.map((p) => p.price_Amount)
    );

    const avgEurMwh   = allPrices.reduce((a, b) => a + b, 0) / (allPrices.length || 1);
    const priceUsdKwh = avgEurMwh * this.EUR_TO_USD * this.MWH_TO_KWH;

    // Tendencia: primer vs último precio del período
    const first = allPrices[0] ?? avgEurMwh;
    const last  = allPrices[allPrices.length - 1] ?? avgEurMwh;
    const trend: PriceTrend = last > first * 1.01 ? "UP" : last < first * 0.99 ? "DOWN" : "STABLE";

    return {
      source:          this.source,
      pricePerKwh:     parseFloat(priceUsdKwh.toFixed(6)),
      validForMinutes: 60,
      trend,
      historicalAvg:   parseFloat(priceUsdKwh.toFixed(6)),
      currency:        "USD",
      fetchedAt:       new Date(),
    };
  }
}

/**
 * Adapter 3: Octopus Energy (UK) → IPriceEstimator
 * Convierte peniques/kWh a USD/kWh, toma el intervalo más reciente
 */
export class OctopusAdapter implements IPriceEstimator {
  private readonly PENCE_TO_USD = 0.0126; // 1 penique ≈ 0.0126 USD

  constructor(
    private readonly octopusApi:  IOctopusEnergyApi,
    private readonly productCode: string = "AGILE-24-10-01",
    private readonly source:      EnergySourceType = "GRID",
  ) {}

  async getCurrentQuote(): Promise<PriceQuote> {
    const raw = await this.octopusApi.getAgileRates(this.productCode);

    // Ordenar por validez y tomar el más reciente
    const sorted = [...raw.results].sort(
      (a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime()
    );
    const current = sorted[0];
    const avg = raw.results.reduce((s, r) => s + r.value_inc_vat, 0) / (raw.results.length || 1);

    const priceUsd = current.value_inc_vat * this.PENCE_TO_USD;
    const avgUsd   = avg * this.PENCE_TO_USD;

    // Tendencia: actual vs promedio
    const trend: PriceTrend =
      priceUsd > avgUsd * 1.05 ? "UP" :
      priceUsd < avgUsd * 0.95 ? "DOWN" : "STABLE";

    return {
      source:          this.source,
      pricePerKwh:     parseFloat(priceUsd.toFixed(6)),
      validForMinutes: 30, // Octopus usa intervalos de 30min
      trend,
      historicalAvg:   parseFloat(avgUsd.toFixed(6)),
      currency:        "USD",
      fetchedAt:       new Date(),
    };
  }
}

// ── Simulaciones de APIs externas (para demo/tests) ──────────

/** Simulación de OMIE — datos realistas de mercado ibérico */
export class MockOmieApi implements IOmieMarketApi {
  async fetchDayAheadPrice(_fecha: string) {
    const hour        = new Date().getHours();
    const isPeak      = hour >= 9 && hour <= 21;
    const basePrice   = isPeak ? 72.4 : 38.2; // €/MWh
    const variation   = (Math.random() - 0.45) * 8;
    return {
      precio_mwh:     parseFloat((basePrice + variation).toFixed(2)),
      variacion_pct:  parseFloat(variation.toFixed(2)),
      tecnologia:     "SOLAR" as const,
      promedio_7dias: 65.3,
    };
  }
}

/** Simulación de ENTSO-E — array de 4 intervalos horarios */
export class MockEntsoEApi implements IEntsoEApi {
  async getTransparencyData(_params: { area: string; periodStart: string; periodEnd: string }) {
    const base = 68 + Math.random() * 20;
    return {
      TimeSeries: [{
        Period: {
          Point: [
            { position: 1, price_Amount: base },
            { position: 2, price_Amount: base * (1 + (Math.random() - 0.5) * 0.1) },
            { position: 3, price_Amount: base * (1 + (Math.random() - 0.5) * 0.1) },
            { position: 4, price_Amount: base * (1 + (Math.random() - 0.5) * 0.1) },
          ],
        },
      }],
      unit:     "MWH" as const,
      currency: "EUR" as const,
    };
  }
}

/** Simulación de Octopus Energy — tarifas ágiles UK */
export class MockOctopusApi implements IOctopusEnergyApi {
  async getAgileRates(_productCode: string) {
    const base = 18 + Math.random() * 12; // peniques/kWh
    const now  = new Date();
    return {
      results: Array.from({ length: 6 }, (_, i) => ({
        value_exc_vat: base + (Math.random() - 0.5) * 4,
        value_inc_vat: (base + (Math.random() - 0.5) * 4) * 1.05,
        valid_from:    new Date(now.getTime() - i * 1800000).toISOString(),
        valid_to:      new Date(now.getTime() - (i - 1) * 1800000).toISOString(),
      })),
      count: 6,
    };
  }
}

// ── Factory de Adapters ───────────────────────────────────────
export type AdapterType = "OMIE" | "ENTSO_E" | "OCTOPUS";

export function createPriceAdapter(type: AdapterType, source?: EnergySourceType): IPriceEstimator {
  switch (type) {
    case "OMIE":    return new OmieAdapter(new MockOmieApi());
    case "ENTSO_E": return new EntsoEAdapter(new MockEntsoEApi(), "10YES-REE------0", source ?? "GRID");
    case "OCTOPUS": return new OctopusAdapter(new MockOctopusApi(), "AGILE-24-10-01", source ?? "GRID");
  }
}

// _Adapter
