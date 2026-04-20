"use client";

import { useState, useEffect, useCallback } from "react";
import {
    LayoutDashboard, Zap, Cpu, TrendingDown, TrendingUp,
    Minus, RefreshCw, Copy, Activity, Layers, ChevronRight,
    Circle, CheckCircle, AlertTriangle, XCircle,
} from "lucide-react";
import { getEnergyFacade, type MarketSummary, type PortfolioStatus }
    from "@/lib/facade/EnergyTradingFacade";
import { createDemoPortfolio, EnergyGroup, EnergyDevice, type IEnergyNode }
    from "@/lib/iot/EnergyComposite";
import { ensureDemoProfile } from "@/lib/supabase/demoUser";

// ── Tipos locales ─────────────────────────────────────────────
type Template = ReturnType<ReturnType<typeof getEnergyFacade>["getAvailableTemplates"]>[0];

const STATUS_ICON = {
    ONLINE:  <CheckCircle  size={12} className="text-green-400" />,
    PARTIAL: <AlertTriangle size={12} className="text-yellow-400" />,
    OFFLINE: <XCircle      size={12} className="text-red-400" />,
};

const TREND_ICON = {
    UP:     <TrendingUp   size={12} className="text-red-400" />,
    DOWN:   <TrendingDown size={12} className="text-green-400" />,
    STABLE: <Minus        size={12} className="text-slate-500" />,
};

// ── DeviceTree: renderiza el Composite ───────────────────────
function DeviceTree({ node, depth = 0 }: { node: IEnergyNode; depth?: number }) {
    const [open, setOpen] = useState(depth < 2);
    const isGroup = node instanceof EnergyGroup;

    return (
        <div className={depth > 0 ? "ml-4 border-l border-white/[0.06] pl-3" : ""}>
            <button
                onClick={() => isGroup && setOpen((o) => !o)}
                className={`w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg
                    hover:bg-white/[0.04] transition-colors group ${isGroup ? "cursor-pointer" : "cursor-default"}`}
            >
                {isGroup && (
                    <ChevronRight size={12} className={`text-slate-600 transition-transform ${open ? "rotate-90" : ""}`} />
                )}
                {!isGroup && <Circle size={8} className="text-slate-700 ml-1 shrink-0" />}
                {STATUS_ICON[node.getStatus()]}
                <span className="text-xs text-white font-medium flex-1">{node.getName()}</span>
                <span className="text-[10px] text-slate-500">{node.getTotalKwh().toFixed(1)} kWh</span>
                {node.getPeakPowerKw() > 0 && (
                    <span className="text-[10px] text-slate-600">{node.getPeakPowerKw()} kW</span>
                )}
                {isGroup && <span className="text-[10px] text-slate-700">({node.getChildCount()} nodos)</span>}
            </button>
            {isGroup && open && (
                <div className="mt-0.5">
                    {(node as EnergyGroup).getChildren().map((child) => (
                        <DeviceTree key={child.getName()} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Página ────────────────────────────────────────────────────
export default function DashboardPage() {
    const facade    = getEnergyFacade();
    const portfolio = createDemoPortfolio();

    const [market,     setMarket]     = useState<MarketSummary | null>(null);
    const [portStatus, setPortStatus] = useState<PortfolioStatus | null>(null);
    const [templates,  setTemplates]  = useState<Template[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [cloneMsg,   setCloneMsg]   = useState<string | null>(null);
    const [cloningId,  setCloningId]  = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [mktRes, portRes] = await Promise.all([
            facade.getMarketSummary(),
            facade.getPortfolioStatus(),
        ]);
        if (mktRes.ok  && mktRes.data)  setMarket(mktRes.data);
        if (portRes.ok && portRes.data) setPortStatus(portRes.data);
        setTemplates(facade.getAvailableTemplates());
        setLoading(false);
    }, []);

    useEffect(() => {
        ensureDemoProfile();
        loadAll();
        const interval = setInterval(loadAll, 15000);
        return () => clearInterval(interval);
    }, [loadAll]);

    const handleClone = async (templateName: string) => {
        setCloningId(templateName);
        const result = await facade.cloneTemplateAndPublish(templateName);
        setCloningId(null);
        setCloneMsg(result.ok
            ? `✅ Orden publicada desde "${templateName}" (ID: ${result.data})`
            : `❌ Error: ${result.error}`
        );
        setTimeout(() => setCloneMsg(null), 5000);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Dashboard</h1>
                    <p className="section-subtitle">
                        <span className="font-semibold text-slate-300">Facade</span> + <span className="font-semibold text-slate-300">Composite</span> — vista unificada del sistema
                    </p>
                </div>
                <button onClick={loadAll} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualizar
                </button>
            </div>

            {/* ── KPIs del Portafolio (Facade) ──────────────────── */}
            <div className="grid grid-cols-5 gap-3">
                {[
                    { label: "Órdenes abiertas",  value: portStatus?.openOrders   ?? "–", icon: <Zap size={14} />,           color: "text-blue-400"   },
                    { label: "Órdenes ejecutadas", value: portStatus?.filledOrders ?? "–", icon: <CheckCircle size={14} />,   color: "text-green-400"  },
                    { label: "Dispositivos",        value: portStatus?.totalDevices ?? "–", icon: <Cpu size={14} />,           color: "text-brand-400"  },
                    { label: "Online",              value: portStatus?.onlineDevices ?? "–", icon: <Activity size={14} />,     color: "text-green-400"  },
                    { label: "Valor total USD",     value: portStatus ? `$${portStatus.totalValueUsd.toFixed(2)}` : "–",
                        icon: <LayoutDashboard size={14} />, color: "text-yellow-400" },
                ].map((kpi) => (
                    <div key={kpi.label} className="card text-center">
                        <div className={`flex justify-center mb-2 ${kpi.color}`}>{kpi.icon}</div>
                        <p className="text-xl font-extrabold text-white">{kpi.value}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{kpi.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
                <div className="space-y-4">
                    {/* ── Mercado via Facade ──────────────────────── */}
                    <div className="card">
                        <div className="flex items-center gap-2 mb-3">
                            <Layers size={14} className="text-brand-400" />
                            <h2 className="section-title">Resumen de mercado — Facade</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-3">
                            <code className="bg-white/[0.05] px-1 py-0.5 rounded">facade.getMarketSummary()</code> orquesta 3 Adapters + Decorator + Notificación en una llamada
                        </p>
                        {loading ? (
                            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 shimmer rounded-lg" />)}</div>
                        ) : market ? (
                            <div className="space-y-2">
                                {market.quotes.map((q) => (
                                    <div key={q.provider} className={`flex items-center gap-3 px-3 py-2 rounded-lg border
                                        ${q.provider === market.cheapest
                                            ? "border-green-500/20 bg-green-500/[0.04]"
                                            : "border-white/[0.05] bg-white/[0.02]"}`}>
                                        <div className="flex-1">
                                            <span className="text-xs font-bold text-white">{q.provider}</span>
                                            {q.provider === market.cheapest && (
                                                <span className="ml-2 badge badge-green text-[9px]">Más barato</span>
                                            )}
                                            <p className="text-[10px] text-slate-500">{q.source} · {q.validForMins}min</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {TREND_ICON[q.trend as keyof typeof TREND_ICON]}
                                            <span className="text-sm font-extrabold text-white">${q.pricePerKwh.toFixed(4)}</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex justify-between text-[10px] pt-2 border-t border-white/[0.05]">
                                    <span className="text-slate-500">Precio promedio</span>
                                    <span className="text-white font-bold">${market.avgPrice.toFixed(4)} USD/kWh</span>
                                </div>
                            </div>
                        ) : <p className="text-sm text-slate-500">Sin datos</p>}
                    </div>

                    {/* ── Templates via Facade + Prototype ─────────── */}
                    {cloneMsg && (
                        <div className={`px-3 py-2 rounded-xl text-xs border font-medium ${
                            cloneMsg.startsWith("✅") ? "bg-green-500/10 border-green-500/20 text-green-300"
                                                      : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
                            {cloneMsg}
                        </div>
                    )}
                    <div className="card">
                        <div className="flex items-center gap-2 mb-3">
                            <Copy size={14} className="text-brand-400" />
                            <h2 className="section-title">Plantillas — Facade + Prototype</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-3">
                            <code className="bg-white/[0.05] px-1 py-0.5 rounded">facade.cloneTemplateAndPublish()</code> clona, valida y persiste en Supabase
                        </p>
                        <div className="space-y-2">
                            {templates.map((t) => (
                                <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{t.name}</p>
                                        <p className="text-[10px] text-slate-500">{t.order.amountKwh} kWh · ${t.order.pricePerKwh} · usado {t.usageCount}×</p>
                                    </div>
                                    <button
                                        onClick={() => handleClone(t.name)}
                                        disabled={!!cloningId}
                                        className="btn-primary text-[11px] px-3 py-1.5 flex items-center gap-1 shrink-0"
                                    >
                                        <Copy size={10} />
                                        {cloningId === t.name ? "…" : "Clonar"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Portfolio Composite ─────────────────────────── */}
                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Cpu size={14} className="text-brand-400" />
                            <h2 className="section-title">Árbol de dispositivos — Composite</h2>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            {STATUS_ICON.ONLINE}  <span>Online</span>
                            {STATUS_ICON.PARTIAL} <span>Parcial</span>
                            {STATUS_ICON.OFFLINE} <span>Offline</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mb-3">
                        <code className="bg-white/[0.05] px-1 py-0.5 rounded">portfolio.getTotalKwh()</code> agrega recursivamente sin importar cuántos niveles hay
                    </p>

                    {/* Stats del Composite */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                            { label: "Total kWh",     value: portfolio.getTotalKwh().toFixed(1) },
                            { label: "Pico kW",       value: portfolio.getPeakPowerKw().toString() },
                            { label: "Nodos totales", value: portfolio.getChildCount().toString() },
                        ].map((s) => (
                            <div key={s.label} className="bg-white/[0.03] rounded-lg px-2 py-2 text-center">
                                <p className="text-sm font-bold text-white">{s.value}</p>
                                <p className="text-[10px] text-slate-500">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Árbol interactivo */}
                    <div className="bg-white/[0.02] rounded-xl p-3 max-h-80 overflow-y-auto">
                        <DeviceTree node={portfolio} depth={0} />
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.05] text-[10px] text-slate-600 leading-relaxed">
                        <span className="text-brand-300 font-semibold">Composite</span>: el cliente llama
                        <code className="bg-white/[0.05] mx-1 px-1 py-0.5 rounded">portfolio.getTotalKwh()</code>
                        y obtiene la suma de 7 dispositivos en 3 niveles — sin conocer la estructura interna.
                    </div>
                </div>
            </div>
        </div>
    );
}

// _Facade _Composite
