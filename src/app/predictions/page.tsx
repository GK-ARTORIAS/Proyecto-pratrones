"use client";

import { useState } from "react";
import { TrendingUp, Sun, Zap, BarChart2 } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend,
} from "recharts";

// Genera predicciones de 24h basadas en patrones solares realistas
function generatePredictions(horizon: "24h" | "7d") {
    if (horizon === "24h") {
        return Array.from({ length: 24 }, (_, i) => {
            const solarFactor = Math.max(0, Math.sin(((i - 6) / 12) * Math.PI));
            return {
                label: `${String(i).padStart(2, "0")}:00`,
                prediccion: parseFloat((solarFactor * 5.5 + Math.random() * 0.3).toFixed(2)),
                consumo: parseFloat((((i >= 7 && i <= 9) || (i >= 18 && i <= 22) ? 3.5 : 1.2) + Math.random() * 0.5).toFixed(2)),
                excedente: parseFloat((Math.max(0, solarFactor * 5.5 - 1.5 + Math.random() * 0.2)).toFixed(2)),
            };
        });
    }
    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return days.map((d, i) => ({
        label: d,
        prediccion: parseFloat((18 + Math.random() * 10 + (i >= 5 ? 8 : 0)).toFixed(1)),
        consumo: parseFloat((12 + Math.random() * 6).toFixed(1)),
        excedente: parseFloat((8 + Math.random() * 8).toFixed(1)),
    }));
}

export default function PredictionsPage() {
    const [horizon, setHorizon] = useState<"24h" | "7d">("24h");
    const data = generatePredictions(horizon);

    const totalPred = data.reduce((s, d) => s + d.prediccion, 0).toFixed(1);
    const totalCons = data.reduce((s, d) => s + d.consumo, 0).toFixed(1);
    const totalExc = data.reduce((s, d) => s + d.excedente, 0).toFixed(1);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Predicción</h1>
                    <p className="section-subtitle">Modelos de producción y consumo energético</p>
                </div>
                <div className="flex gap-2">
                    {(["24h", "7d"] as const).map((h) => (
                        <button key={h} onClick={() => setHorizon(h)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${horizon === h
                                    ? "bg-brand-500/20 border border-brand-500/40 text-brand-400"
                                    : "btn-secondary"
                                }`}>
                            {h === "24h" ? "Próximas 24h" : "Próximos 7 días"}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Producción prevista", value: `${totalPred} kWh`, icon: Sun, color: "#f59e0b" },
                    { label: "Consumo previsto", value: `${totalCons} kWh`, icon: Zap, color: "#3b82f6" },
                    { label: "Excedente vendible", value: `${totalExc} kWh`, icon: TrendingUp, color: "#22c55e" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="card card-hover flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                            <Icon size={18} style={{ color }} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">{label}</p>
                            <p className="text-base font-bold text-white">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Gráfico principal */}
            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="section-title">Curva de predicción energética</h2>
                        <p className="section-subtitle">Producción solar · Consumo doméstico · Excedente</p>
                    </div>
                    <span className="badge badge-green">
                        <BarChart2 size={11} />
                        Modelo activo
                    </span>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gPred" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gCons" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gExc" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} interval={horizon === "24h" ? 3 : 0} />
                        <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: "#1e2028", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: "#94a3b8" }} />
                        <Area type="monotone" dataKey="prediccion" name="Producción solar (kW)" stroke="#f59e0b" strokeWidth={2} fill="url(#gPred)" dot={false} />
                        <Area type="monotone" dataKey="consumo" name="Consumo (kW)" stroke="#3b82f6" strokeWidth={2} fill="url(#gCons)" dot={false} />
                        <Area type="monotone" dataKey="excedente" name="Excedente (kW)" stroke="#22c55e" strokeWidth={2} fill="url(#gExc)" dot={false} strokeDasharray="5 3" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Insight cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="card border-yellow-500/20 bg-yellow-500/[0.03]">
                    <p className="text-sm font-semibold text-yellow-400 mb-1.5">☀️ Pico solar previsto</p>
                    <p className="text-xs text-slate-400">Se espera producción máxima entre las <strong className="text-white">12:00 y 14:00</strong>. Considera publicar tus excedentes en subasta antes de las 11:30.</p>
                </div>
                <div className="card border-blue-500/20 bg-blue-500/[0.03]">
                    <p className="text-sm font-semibold text-blue-400 mb-1.5">⚡ Pico de consumo</p>
                    <p className="text-xs text-slate-400">Tu consumo será más alto entre <strong className="text-white">18:00 y 21:00</strong>. Compra kWh adicionales antes del pico para obtener mejor precio.</p>
                </div>
            </div>
        </div>
    );
}
