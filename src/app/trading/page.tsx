"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, ArrowUpCircle, ArrowDownCircle, Clock, Filter, Layers, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import {
  TradeOrderBuilder,
  TradeOrderDirector,
  type TradeOrder,
  type OrderType,
  type EnergySource as OrderEnergySource,
} from "@/lib/trading/TradeOrderBuilder";
import { getSupabaseClient, getSupabaseAdmin } from "@/lib/supabase/supabaseClient";
import { DEMO_USER_ID, ensureDemoProfile } from "@/lib/supabase/demoUser";

// Tipo para órdenes cargadas desde Supabase
interface DbOrder {
    id: string;
    type: "BUY" | "SELL";
    amount_kwh: number;
    price_per_kwh: number;
    energy_source: string;
    status: string;
    created_at: string;
    note: string | null;
}

const sourceColors: Record<string, string> = {
    SOLAR: "badge-yellow", WIND: "badge-blue", GRID: "badge-purple", BATTERY: "badge-green",
};

// Instancias del Builder y Director (fuera del componente para no recrear)
const sharedBuilder  = new TradeOrderBuilder();
const director       = new TradeOrderDirector(sharedBuilder);

export default function TradingPage() {
    const [typeFilter, setTypeFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
    const [showForm, setShowForm]     = useState(false);
    const [form, setForm]             = useState({
        type: "SELL" as OrderType,
        amount: "",
        price: "",
        source: "SOLAR" as OrderEnergySource,
        expiry: "60",
        note: "",
        allowPartial: false,
        greenOnly: false,
    });
    const [dbOrders, setDbOrders]       = useState<DbOrder[]>([]);
    const [builtOrders, setBuiltOrders] = useState<TradeOrder[]>([]);
    const [buildError, setBuildError]   = useState<string | null>(null);
    const [saving, setSaving]           = useState(false);
    const [loadingOrders, setLoadingOrders] = useState(true);

    // ── Cargar órdenes desde Supabase ─────────────────────────
    const loadOrders = useCallback(async () => {
        setLoadingOrders(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("energy_orders")
            .select("id, type, amount_kwh, price_per_kwh, energy_source, status, created_at, note")
            .order("created_at", { ascending: false })
            .limit(20);
        if (!error && data) setDbOrders(data as DbOrder[]);
        setLoadingOrders(false);
    }, []);

    useEffect(() => {
        ensureDemoProfile().then(() => loadOrders());
    }, [loadOrders]);

    // ── Persistir orden en Supabase ────────────────────────────
    const persistOrder = async (order: TradeOrder): Promise<string | null> => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from("energy_orders").insert({
            id:              order.id,
            user_id:         DEMO_USER_ID,
            type:            order.type,
            amount_kwh:      order.amountKwh,
            price_per_kwh:   order.pricePerKwh,
            energy_source:   order.energySource === "UNKNOWN" ? "GRID" : order.energySource,
            status:          "OPEN",
            note:            order.note ?? null,
            expires_at:      order.expiresAt?.toISOString() ?? null,
            conditions:      order.conditions,
            pricing_mode:    order.pricingMode,
            priority:        order.priority,
            max_slippage_percent: order.maxSlippagePercent,
            total_value_usd: order.totalValueUsd,
        });
        return error ? error.message : null;
    };

    // Construir orden con el Builder + persistir en Supabase
    const handleBuildOrder = async () => {
        setBuildError(null);
        setSaving(true);
        try {
            const builder = new TradeOrderBuilder()
                .ofType(form.type)
                .withAmount(parseFloat(form.amount))
                .atPrice(parseFloat(form.price))
                .fromSource(form.source);

            if (form.expiry) builder.expiresInMinutes(parseInt(form.expiry));
            if (form.note)   builder.withNote(form.note);
            if (form.allowPartial) builder.allowPartialFill();
            if (form.greenOnly)    builder.requireGreenCertified();

            const order = builder.build();
            const err = await persistOrder(order);
            if (err) { setBuildError(`Supabase: ${err}`); setSaving(false); return; }

            setBuiltOrders((prev) => [order, ...prev]);
            await loadOrders();   // recarga el libro real desde DB
            setShowForm(false);
        } catch (e: unknown) {
            setBuildError(e instanceof Error ? e.message : String(e));
        }
        setSaving(false);
    };

    // Aplicar receta del Director + persistir en Supabase
    const applyRecipe = async (recipe: "urgentSolar" | "greenBuy" | "batteryPeak") => {
        setSaving(true);
        setBuildError(null);
        try {
            let order: TradeOrder;
            if (recipe === "urgentSolar")   order = director.buildUrgentSolarSell(12.5, 0.124);
            else if (recipe === "greenBuy") order = director.buildScheduledGreenBuy(20, 0.115);
            else                            order = director.buildPeakBatteryDischarge(8, 0.155);
            const err = await persistOrder(order);
            if (err) { setBuildError(`Supabase: ${err}`); setSaving(false); return; }
            setBuiltOrders((prev) => [order, ...prev]);
            await loadOrders();
        } catch (e: unknown) {
            setBuildError(e instanceof Error ? e.message : String(e));
        }
        setSaving(false);
    };

    const filtered = dbOrders.filter((o) => typeFilter === "ALL" || o.type === typeFilter);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Trading de Energía</h1>
                    <p className="section-subtitle">Crea y gestiona órdenes de compra/venta de excedentes</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadOrders} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                    <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
                        <Zap size={15} />
                        Nueva Orden
                    </button>
                </div>
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

            {/* Recetas del Director */}
            <div className="card border-brand-500/20 bg-brand-500/[0.03]">
                <div className="flex items-center gap-2 mb-4">
                    <FlaskConical size={15} className="text-brand-400" />
                    <p className="text-sm font-semibold text-brand-300">Recetas rápidas — Director</p>
                    <span className="ml-auto text-[10px] text-slate-500 font-mono">TradeOrderDirector</span>
                </div>
                <div className="flex gap-3">
                    {[
                        { key: "urgentSolar" as const,  label: "⚡ Venta solar urgente",  sub: "12.5 kWh · 0.124 USD · 30min" },
                        { key: "greenBuy"    as const,  label: "🌿 Compra verde programada", sub: "20 kWh · 0.115 USD · 24h" },
                        { key: "batteryPeak" as const,  label: "🔋 Descarga batería pico",  sub: "8 kWh · 0.155 USD · 15min" },
                    ].map(({ key, label, sub }) => (
                        <button key={key} onClick={() => applyRecipe(key)}
                            className="flex-1 text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02]
                                       hover:border-brand-500/30 hover:bg-brand-500/[0.05] transition-all">
                            <p className="text-xs font-semibold text-white">{label}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Formulario nueva orden — usa TradeOrderBuilder directamente */}
            {showForm && (
                <div className="card card-glow border-brand-500/20 animate-slide-up">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers size={15} className="text-brand-400" />
                        <h2 className="section-title">Crear orden — TradeOrderBuilder</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Tipo</label>
                            <div className="flex gap-2">
                                {(["SELL", "BUY"] as const).map((t) => (
                                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                                            form.type === t
                                                ? t === "SELL" ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-blue-500/20 border-blue-500/40 text-blue-400"
                                                : "border-white/10 text-slate-500 hover:border-white/20"
                                        }`}>
                                        {t === "SELL" ? "Vender" : "Comprar"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Fuente</label>
                            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as OrderEnergySource })} className="input">
                                {(["SOLAR","WIND","BATTERY","GRID"] as const).map((s) => <option key={s}>{s}</option>)}
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
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Expira en (min)</label>
                            <input type="number" placeholder="ej. 60" value={form.expiry}
                                onChange={(e) => setForm({ ...form, expiry: e.target.value })} className="input" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Nota (opcional)</label>
                            <input type="text" placeholder="Descripción..." value={form.note}
                                onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" />
                        </div>
                    </div>
                    <div className="flex gap-4 mt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.allowPartial}
                                onChange={(e) => setForm({ ...form, allowPartial: e.target.checked })}
                                className="w-4 h-4 rounded accent-green-500" />
                            <span className="text-xs text-slate-400">Permitir llenado parcial</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.greenOnly}
                                onChange={(e) => setForm({ ...form, greenOnly: e.target.checked })}
                                className="w-4 h-4 rounded accent-green-500" />
                            <span className="text-xs text-slate-400">Solo energía verde certificada</span>
                        </label>
                    </div>
                    {buildError && (
                        <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {buildError}
                        </p>
                    )}
                    <div className="flex gap-3 mt-5">
                        <button className="btn-primary" onClick={handleBuildOrder}>Construir y publicar</button>
                        <button className="btn-secondary" onClick={() => { setShowForm(false); setBuildError(null); }}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* Órdenes creadas con el Builder en esta sesión */}
            {builtOrders.length > 0 && (
                <div className="card border-brand-500/20">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers size={14} className="text-brand-400" />
                        <h2 className="section-title text-brand-300">Órdenes creadas esta sesión</h2>
                        <span className="ml-auto badge badge-green">{builtOrders.length} via Builder</span>
                    </div>
                    <div className="space-y-2">
                        {builtOrders.map((o) => (
                            <div key={o.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-brand-500/10">
                                <div className={`badge ${o.type === "SELL" ? "badge-green" : "badge-blue"}`}>
                                    {o.type === "SELL" ? "Venta" : "Compra"}
                                </div>
                                <span className="text-xs font-mono text-slate-500">{o.id}</span>
                                <span className="text-sm font-bold text-white">{o.amountKwh} kWh</span>
                                <span className="text-xs text-slate-400">@ {o.pricePerKwh} USD</span>
                                <span className="badge badge-yellow text-[10px]">{o.energySource}</span>
                                {o.conditions.requireGreenCertified && <span className="badge badge-green text-[10px]">🌿 Verde</span>}
                                {o.conditions.allowPartialFill && <span className="badge badge-blue text-[10px]">Parcial</span>}
                                <span className="ml-auto text-xs text-slate-500">
                                    Total: <strong className="text-white">${o.totalValueUsd.toFixed(3)}</strong>
                                </span>
                                <span className="badge badge-yellow">{o.status}</span>
                            </div>
                        ))}
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
                    {loadingOrders && (
                        <div className="space-y-2">
                            {[1,2,3].map((i) => <div key={i} className="h-14 shimmer rounded-xl" />)}
                        </div>
                    )}
                    {!loadingOrders && filtered.length === 0 && (
                        <p className="text-center text-sm text-slate-500 py-8">No hay órdenes — crea una nueva arriba.</p>
                    )}
                    {!loadingOrders && filtered.map((o: DbOrder) => (
                        <div key={o.id} className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all group">
                            <div className={`badge ${o.type === "SELL" ? "badge-green" : "badge-blue"}`}>
                                {o.type === "SELL" ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                                {o.type === "SELL" ? "Venta" : "Compra"}
                            </div>
                            <span className="text-xs font-mono text-slate-500">{o.id.slice(0, 14)}</span>
                            <div>
                                <span className="text-sm font-bold text-white">{o.amount_kwh} kWh</span>
                                <span className="text-xs text-slate-500 ml-2">@ {o.price_per_kwh} USD</span>
                            </div>
                            <span className={`badge ${sourceColors[o.energy_source] ?? "badge-purple"}`}>{o.energy_source}</span>
                            {o.note && <span className="text-xs text-slate-500 italic truncate max-w-[140px]">{o.note}</span>}
                            <span className="text-xs text-slate-600 ml-auto">
                                {new Date(o.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className={`badge ${o.status === "OPEN" ? "badge-green" : o.status === "MATCHED" ? "badge-blue" : "badge-red"}`}>
                                {o.status}
                            </span>
                            {o.status === "OPEN" && (
                                <button
                                    onClick={async () => {
                                        const supabase = getSupabaseAdmin();
                                        await supabase.from("energy_orders").update({ status: "CANCELLED" }).eq("id", o.id);
                                        await loadOrders();
                                    }}
                                    className="btn-danger text-xs py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity">
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

// _Builder
