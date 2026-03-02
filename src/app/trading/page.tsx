"use client";

import { useState } from "react";
import { Zap, ArrowUpCircle, ArrowDownCircle, Clock, Filter } from "lucide-react";

const orders = [
    { id: "ORD-0041", type: "SELL" as const, amount: 12.5, price: 0.124, source: "SOLAR", status: "OPEN", created: "Hace 5 min" },
    { id: "ORD-0040", type: "BUY" as const, amount: 8.0, price: 0.118, source: "WIND", status: "MATCHED", created: "Hace 22 min" },
    { id: "ORD-0039", type: "SELL" as const, amount: 5.2, price: 0.131, source: "SOLAR", status: "OPEN", created: "Hace 1h" },
    { id: "ORD-0038", type: "BUY" as const, amount: 20.0, price: 0.110, source: "GRID", status: "EXPIRED", created: "Hace 3h" },
    { id: "ORD-0037", type: "SELL" as const, amount: 3.8, price: 0.142, source: "BATTERY", status: "MATCHED", created: "Hace 4h" },
];

const sourceColors: Record<string, string> = {
    SOLAR: "badge-yellow", WIND: "badge-blue", GRID: "badge-purple", BATTERY: "badge-green",
};

export default function TradingPage() {
    const [typeFilter, setTypeFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "SELL", amount: "", price: "", source: "SOLAR" });

    const filtered = orders.filter((o) => typeFilter === "ALL" || o.type === typeFilter);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Trading de Energía</h1>
                    <p className="section-subtitle">Crea y gestiona órdenes de compra/venta de excedentes</p>
                </div>
                <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
                    <Zap size={15} />
                    Nueva Orden
                </button>
            </div>

            {/* Stats rápidos */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Precio solar actual", value: "0.124 USD/kWh", icon: Zap, color: "#f59e0b" },
                    { label: "Órdenes abiertas", value: "2", icon: ArrowUpCircle, color: "#22c55e" },
                    { label: "Volumen hoy", value: "45.7 kWh", icon: Clock, color: "#3b82f6" },
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

            {/* Formulario nueva orden */}
            {showForm && (
                <div className="card card-glow border-brand-500/20 animate-slide-up">
                    <h2 className="section-title mb-4">Crear nueva orden</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Tipo</label>
                            <div className="flex gap-2">
                                {(["SELL", "BUY"] as const).map((t) => (
                                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${form.type === t
                                                ? t === "SELL" ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-blue-500/20 border-blue-500/40 text-blue-400"
                                                : "border-white/10 text-slate-500 hover:border-white/20"
                                            }`}
                                    >
                                        {t === "SELL" ? "Vender" : "Comprar"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Fuente</label>
                            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                                className="input">
                                {["SOLAR", "WIND", "BATTERY", "GRID"].map((s) => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Cantidad (kWh)</label>
                            <input type="number" placeholder="ej. 10.5" value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Precio (USD/kWh)</label>
                            <input type="number" placeholder="ej. 0.120" step="0.001" value={form.price}
                                onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-5">
                        <button className="btn-primary">Publicar orden</button>
                        <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* Libro de órdenes */}
            <div className="card">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="section-title">Libro de órdenes</h2>
                        <p className="section-subtitle">{filtered.length} órdenes</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-500" />
                        {(["ALL", "SELL", "BUY"] as const).map((f) => (
                            <button key={f} onClick={() => setTypeFilter(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${typeFilter === f
                                        ? "bg-brand-500/20 border border-brand-500/40 text-brand-400"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}>
                                {f === "ALL" ? "Todas" : f === "SELL" ? "Ventas" : "Compras"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    {filtered.map((o) => (
                        <div key={o.id} className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all group">
                            <div className={`badge ${o.type === "SELL" ? "badge-green" : "badge-blue"}`}>
                                {o.type === "SELL" ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                                {o.type === "SELL" ? "Venta" : "Compra"}
                            </div>
                            <span className="text-xs font-mono text-slate-500">{o.id}</span>
                            <div>
                                <span className="text-sm font-bold text-white">{o.amount} kWh</span>
                                <span className="text-xs text-slate-500 ml-2">@ {o.price} USD</span>
                            </div>
                            <span className={`badge ${sourceColors[o.source]}`}>{o.source}</span>
                            <span className="text-xs text-slate-600 ml-auto">{o.created}</span>
                            <span className={`badge ${o.status === "OPEN" ? "badge-green" : o.status === "MATCHED" ? "badge-blue" : "badge-red"}`}>
                                {o.status}
                            </span>
                            {o.status === "OPEN" && (
                                <button className="btn-danger text-xs py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Cancelar
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
