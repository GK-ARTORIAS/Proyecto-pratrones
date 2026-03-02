"use client";

import { useState, useEffect } from "react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
    Zap, TrendingUp, ArrowDownCircle, ArrowUpCircle,
    Cpu, Gavel, Activity, ChevronRight,
} from "lucide-react";

// ── Datos simulados ────────────────────────────────────────
const generateChartData = () =>
    Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, "0")}:00`,
        produccion: parseFloat((Math.random() * 5 + (i >= 6 && i <= 18 ? 3 : 0.2)).toFixed(2)),
        consumo: parseFloat((Math.random() * 3 + ((i >= 7 && i <= 9) || (i >= 18 && i <= 22) ? 2.5 : 0.8)).toFixed(2)),
    }));

const recentOrders = [
    { id: "ORD-0041", type: "VENTA", amount: "12.5 kWh", price: "0.124 USD/kWh", status: "OPEN", source: "Solar" },
    { id: "ORD-0040", type: "COMPRA", amount: "8.0 kWh", price: "0.118 USD/kWh", status: "MATCHED", source: "Eólico" },
    { id: "ORD-0039", type: "VENTA", amount: "5.2 kWh", price: "0.131 USD/kWh", status: "OPEN", source: "Solar" },
    { id: "ORD-0038", type: "COMPRA", amount: "20.0 kWh", price: "0.110 USD/kWh", status: "EXPIRED", source: "Red" },
];

interface StatCardProps {
    label: string;
    value: string;
    sub: string;
    icon: React.ElementType;
    color: string;
    trend?: string;
    trendUp?: boolean;
}

function StatCard({ label, value, sub, icon: Icon, color, trend, trendUp }: StatCardProps) {
    return (
        <div className="card card-hover card-glow flex flex-col gap-4 animate-slide-up">
            <div className="flex items-center justify-between">
                <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}
                >
                    <Icon className="w-5 h-5" style={{ color }} />
                </div>
                {trend && (
                    <span
                        className={`text-xs font-semibold px-2 py-1 rounded-lg ${trendUp
                                ? "bg-green-500/10 text-green-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                    >
                        {trend}
                    </span>
                )}
            </div>
            <div>
                <p className="stat-value">{value}</p>
                <p className="stat-label">{label}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [chartData, setChartData] = useState(generateChartData());
    const [liveKwh, setLiveKwh] = useState(3.42);

    // Simulación de datos en tiempo real
    useEffect(() => {
        const interval = setInterval(() => {
            setLiveKwh((prev) => parseFloat((prev + (Math.random() * 0.4 - 0.2)).toFixed(2)));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ── Header ───────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                        Bienvenido — aquí tienes tu resumen energético en tiempo real.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="status-dot status-dot-online" />
                    <span className="text-xs font-semibold text-green-400">
                        Produciendo {liveKwh} kW
                    </span>
                </div>
            </div>

            {/* ── Stats ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Producción hoy"
                    value="47.3 kWh"
                    sub="Paneles solares activos"
                    icon={Zap}
                    color="#f59e0b"
                    trend="+12.4%"
                    trendUp
                />
                <StatCard
                    label="Consumo hoy"
                    value="31.8 kWh"
                    sub="Promedio normal del hogar"
                    icon={Activity}
                    color="#3b82f6"
                    trend="-3.1%"
                    trendUp
                />
                <StatCard
                    label="Excedente disponible"
                    value="15.5 kWh"
                    sub="Listo para vender"
                    icon={ArrowUpCircle}
                    color="#22c55e"
                    trend="+8.2%"
                    trendUp
                />
                <StatCard
                    label="Ingresos este mes"
                    value="$ 28.40"
                    sub="De ventas de excedente"
                    icon={TrendingUp}
                    color="#8b5cf6"
                    trend="+19%"
                    trendUp
                />
            </div>

            {/* ── Chart + Quick stats ───────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
                {/* Gráfico de producción vs consumo */}
                <div className="col-span-2 card">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="section-title">Producción vs Consumo</h2>
                            <p className="section-subtitle">Último ciclo de 24 horas</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="w-3 h-0.5 rounded-full bg-[#22c55e] inline-block" />
                                <span className="text-slate-400">Producción</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-3 h-0.5 rounded-full bg-[#3b82f6] inline-block" />
                                <span className="text-slate-400">Consumo</span>
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradProd" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradCons" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: "#1e2028", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                                labelStyle={{ color: "#94a3b8" }}
                            />
                            <Area type="monotone" dataKey="produccion" stroke="#22c55e" strokeWidth={2} fill="url(#gradProd)" name="Producción (kW)" dot={false} />
                            <Area type="monotone" dataKey="consumo" stroke="#3b82f6" strokeWidth={2} fill="url(#gradCons)" name="Consumo (kW)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Balance energético */}
                <div className="card flex flex-col gap-5">
                    <div>
                        <h2 className="section-title">Balance energético</h2>
                        <p className="section-subtitle">Estado actual</p>
                    </div>

                    {[
                        { label: "Dispositivos online", value: "4", icon: Cpu, color: "#10b981" },
                        { label: "Órdenes activas", value: "3", icon: Zap, color: "#f59e0b" },
                        { label: "Subastas activas", value: "2", icon: Gavel, color: "#8b5cf6" },
                        { label: "kWh en excedente", value: "15.5", icon: ArrowUpCircle, color: "#22c55e" },
                        { label: "kWh importados", value: "4.2", icon: ArrowDownCircle, color: "#3b82f6" },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${color}15`, border: `1px solid ${color}20` }}
                            >
                                <Icon size={16} style={{ color }} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-500">{label}</p>
                                <p className="text-sm font-bold text-white">{value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Recent orders ────────────────────────────────── */}
            <div className="card">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="section-title">Órdenes recientes</h2>
                        <p className="section-subtitle">Últimas transacciones</p>
                    </div>
                    <button className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors">
                        Ver todo <ChevronRight size={14} />
                    </button>
                </div>
                <div className="space-y-2">
                    {recentOrders.map((order) => (
                        <div
                            key={order.id}
                            className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all"
                        >
                            <div
                                className={`badge ${order.type === "VENTA" ? "badge-green" : "badge-blue"
                                    }`}
                            >
                                {order.type}
                            </div>
                            <span className="text-xs font-mono text-slate-500">{order.id}</span>
                            <span className="text-sm font-semibold text-white">{order.amount}</span>
                            <span className="text-sm text-slate-400">{order.price}</span>
                            <span className="text-xs text-slate-500">{order.source}</span>
                            <div className="ml-auto">
                                <span
                                    className={`badge ${order.status === "OPEN"
                                            ? "badge-green"
                                            : order.status === "MATCHED"
                                                ? "badge-blue"
                                                : "badge-red"
                                        }`}
                                >
                                    {order.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
