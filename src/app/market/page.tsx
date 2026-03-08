"use client";

import { useState, useEffect, useCallback } from "react";
import { Sun, Wind, Battery, Zap, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import {
    getEnergyFactory,
    type EnergySource,
    type EnergyReading,
    type PriceQuote,
    type DailyForecast,
} from "@/lib/energy/EnergySourceFactory";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Cell,
} from "recharts";

// ── Config visual por fuente ──────────────────────────────────
const SOURCE_CONFIG: Record<EnergySource, {
    label: string;
    icon: React.ElementType;
    color: string;
    bgClass: string;
}> = {
    SOLAR: { label: "Solar", icon: Sun, color: "#f59e0b", bgClass: "bg-yellow-500/10 border-yellow-500/20" },
    WIND: { label: "Eólica", icon: Wind, color: "#3b82f6", bgClass: "bg-blue-500/10   border-blue-500/20" },
    BATTERY: { label: "Batería", icon: Battery, color: "#10b981", bgClass: "bg-green-500/10  border-green-500/20" },
    GRID: { label: "Red Eléctrica", icon: Zap, color: "#8b5cf6", bgClass: "bg-purple-500/10 border-purple-500/20" },
};

const SOURCES: EnergySource[] = ["SOLAR", "WIND", "BATTERY", "GRID"];

// ── Estado por fuente ─────────────────────────────────────────
interface SourceState {
    source: EnergySource;
    reading: EnergyReading | null;
    quote: PriceQuote | null;
    forecast: DailyForecast | null;
    loading: boolean;
}

// ── Componente de tarjeta individual ─────────────────────────
function SourceCard({ state }: { state: SourceState }) {
    const cfg = SOURCE_CONFIG[state.source];
    const Icon = cfg.icon;

    const TrendIcon = state.quote?.trend === "UP"
        ? TrendingUp
        : state.quote?.trend === "DOWN"
            ? TrendingDown
            : Minus;

    const trendColor = state.quote?.trend === "UP"
        ? "text-red-400"
        : state.quote?.trend === "DOWN"
            ? "text-green-400"
            : "text-slate-400";

    // Preparar datos del forecast para mini-gráfico (solo horas 6-22)
    const chartData = state.forecast?.points
        .filter((p) => p.hour >= 6 && p.hour <= 22)
        .map((p) => ({ hour: `${p.hour}h`, kw: p.predictedKw })) ?? [];

    return (
        <div className="card card-hover animate-slide-up flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.bgClass}`}>
                        <Icon size={18} style={{ color: cfg.color }} />
                    </div>
                    <div>
                        <p className="font-bold text-sm text-white">{cfg.label}</p>
                        <p className="text-xs text-slate-500">{state.source}</p>
                    </div>
                </div>
                {state.loading && (
                    <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: cfg.color, borderTopColor: "transparent" }} />
                )}
            </div>

            {/* Lectura actual */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Potencia actual</p>
                    <p className="text-xl font-extrabold text-white">
                        {state.reading?.powerKw.toFixed(2) ?? "—"}
                        <span className="text-xs font-normal text-slate-500 ml-1">kW</span>
                    </p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Eficiencia</p>
                    <p className="text-xl font-extrabold" style={{ color: cfg.color }}>
                        {state.reading ? `${Math.round(state.reading.efficiency * 100)}%` : "—"}
                    </p>
                </div>
            </div>

            {/* Cotización */}
            {state.quote && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${cfg.bgClass}`}>
                    <div>
                        <p className="text-xs text-slate-500">Precio actual</p>
                        <p className="text-base font-bold text-white font-mono">
                            {state.quote.pricePerKwh.toFixed(4)}
                            <span className="text-xs font-normal text-slate-500 ml-1">USD/kWh</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <TrendIcon size={16} className={trendColor} />
                        <span className={`text-xs font-semibold ${trendColor}`}>
                            {state.quote.trend}
                        </span>
                    </div>
                </div>
            )}

            {/* Mini forecast chart */}
            {chartData.length > 0 && (
                <div>
                    <p className="text-xs text-slate-500 mb-2">Predicción 24h (kW)</p>
                    <ResponsiveContainer width="100%" height={70}>
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "#475569" }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis hide />
                            <Tooltip
                                contentStyle={{ background: "#1e2028", border: "none", borderRadius: 8, fontSize: 11 }}
                                labelStyle={{ color: "#94a3b8" }}
                            />
                            <Bar dataKey="kw" radius={[3, 3, 0, 0]}>
                                {chartData.map((_, i) => (
                                    <Cell key={i} fill={cfg.color} fillOpacity={0.6 + (i / chartData.length) * 0.4} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Confianza predicción */}
            {state.forecast && (
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
                    <span className="text-xs text-slate-500">Total predicho</span>
                    <span className="text-xs font-bold text-white font-mono">
                        {state.forecast.totalKwh.toFixed(1)} kWh
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Página principal ──────────────────────────────────────────
export default function EnergyMarketPage() {
    const [states, setStates] = useState<SourceState[]>(
        SOURCES.map((s) => ({ source: s, reading: null, quote: null, forecast: null, loading: true }))
    );

    /**
     * Usa la Abstract Factory para cargar datos de las 4 fuentes en paralelo.
     * Cada llamada a getEnergyFactory(source) crea la familia completa
     * de objetos para esa fuente.
     */
    const loadAll = useCallback(async () => {
        setStates((prev) => prev.map((s) => ({ ...s, loading: true })));

        const updated = await Promise.all(
            SOURCES.map(async (source) => {
                // ── Abstract Factory: una llamada crea los 3 productos de la familia ──
                const factory = getEnergyFactory(source);
                const producer = factory.createProducer();
                const estimator = factory.createPriceEstimator();
                const forecaster = factory.createForecastModel();

                const [reading, quote, forecast] = await Promise.all([
                    producer.getCurrentReading(),
                    estimator.getCurrentQuote(),
                    forecaster.getDailyForecast(),
                ]);

                return { source, reading, quote, forecast, loading: false };
            })
        );

        setStates(updated);
    }, []);

    useEffect(() => {
        loadAll();
        // Refresca precios y lecturas cada 8 segundos
        const interval = setInterval(loadAll, 8000);
        return () => clearInterval(interval);
    }, [loadAll]);

    // Encontrar fuente más barata
    const cheapest = states
        .filter((s) => s.quote)
        .sort((a, b) => (a.quote!.pricePerKwh) - (b.quote!.pricePerKwh))[0];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">
                        Mercado Energético
                    </h1>
                    <p className="section-subtitle">
                        Precios y predicciones por fuente —{" "}
                        <span className="font-semibold text-slate-300">Abstract Factory</span> activo
                    </p>
                </div>
                <button onClick={loadAll} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={14} />
                    Actualizar
                </button>
            </div>

            {/* Alerta fuente más barata */}
            {cheapest?.quote && (
                <div className="card border-brand-500/20 bg-brand-500/[0.04] flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/25
                          flex items-center justify-center shrink-0">
                        <TrendingDown size={16} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-brand-300">
                            Fuente más económica ahora mismo
                        </p>
                        <p className="text-xs text-slate-400">
                            <strong className="text-white">{SOURCE_CONFIG[cheapest.source].label}</strong>{" "}
                            a <strong className="text-white">{cheapest.quote.pricePerKwh.toFixed(4)} USD/kWh</strong>
                            {" "}— considera comprar energía de esta fuente.
                        </p>
                    </div>
                </div>
            )}

            {/* Grid de 4 tarjetas — una por familia de Abstract Factory */}
            <div className="grid grid-cols-2 gap-5">
                {states.map((s) => <SourceCard key={s.source} state={s} />)}
            </div>

            {/* Nota del patrón */}
            <div className="card border-brand-500/20 bg-brand-500/[0.04]">
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                        <Zap size={14} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-brand-300 mb-1">
                            Abstract Factory — EnergySourceFactory
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Cada tarjeta usa{" "}
                            <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-brand-300">
                                getEnergyFactory(source)
                            </code>{" "}
                            para obtener la fábrica correcta, que crea los tres productos de esa familia:
                            <strong className="text-slate-300"> IEnergyProducer</strong>,{" "}
                            <strong className="text-slate-300">IPriceEstimator</strong> y{" "}
                            <strong className="text-slate-300">IForecastModel</strong>.
                            Cambiar de fuente solo cambia la fábrica — la UI no sabe nada de las clases concretas.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// _Abstract Factory
