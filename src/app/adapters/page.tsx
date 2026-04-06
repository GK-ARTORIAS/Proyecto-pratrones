"use client";

import { useState, useEffect } from "react";
import {
  Globe, Zap, RefreshCw, TrendingUp, TrendingDown,
  Minus, Plug, Activity, Copy,
} from "lucide-react";
import {
  createPriceAdapter,
  type PriceQuote,
  type AdapterType,
} from "@/lib/market/ExternalPriceAdapter";
import {
  OrderTemplateRegistry,
  type OrderTemplate,
} from "@/lib/trading/OrderTemplate";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseClient";
import { DEMO_USER_ID, ensureDemoProfile } from "@/lib/supabase/demoUser";

// ── Configuración de adapters ─────────────────────────────────
const ADAPTER_CONFIGS: {
  key: AdapterType;
  label: string;
  origin: string;
  flag: string;
  color: string;
}[] = [
  { key: "OMIE",    label: "OMIE",     origin: "Mercado Ibérico (ES/PT)",  flag: "🇪🇸", color: "#f59e0b" },
  { key: "ENTSO_E", label: "ENTSO-E",  origin: "Red Europea",              flag: "🇪🇺", color: "#3b82f6" },
  { key: "OCTOPUS", label: "Octopus",  origin: "Reino Unido",              flag: "🇬🇧", color: "#8b5cf6" },
];

interface AdapterResult {
  config: typeof ADAPTER_CONFIGS[0];
  quote:  PriceQuote | null;
  loading: boolean;
  error:   string | null;
}

// ── Página ────────────────────────────────────────────────────
export default function AdaptersPage() {
  const [results, setResults]         = useState<AdapterResult[]>(
    ADAPTER_CONFIGS.map((c) => ({ config: c, quote: null, loading: true, error: null }))
  );
  const [templates, setTemplates]     = useState<OrderTemplate[]>([]);
  const [cloneMsg, setCloneMsg]       = useState<string | null>(null);
  const [savingId, setSavingId]       = useState<string | null>(null);

  // ── Cargar cotizaciones de todos los adapters ───────────────
  const loadQuotes = async () => {
    setResults(ADAPTER_CONFIGS.map((c) => ({ config: c, quote: null, loading: true, error: null })));
    const updated = await Promise.all(
      ADAPTER_CONFIGS.map(async (cfg) => {
        try {
          const adapter = createPriceAdapter(cfg.key);
          const quote   = await adapter.getCurrentQuote();
          return { config: cfg, quote, loading: false, error: null };
        } catch (e) {
          return { config: cfg, quote: null, loading: false, error: String(e) };
        }
      })
    );
    setResults(updated);
  };

  // ── Cargar templates del Registry (Prototype) ───────────────
  const loadTemplates = () => {
    const registry = OrderTemplateRegistry.getInstance();
    setTemplates(registry.list());
  };

  useEffect(() => {
    ensureDemoProfile();
    loadQuotes();
    loadTemplates();
    const interval = setInterval(loadQuotes, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Clonar un template y guardar en Supabase ────────────────
  const handleClone = async (template: OrderTemplate) => {
    setSavingId(template.name);
    const registry = OrderTemplateRegistry.getInstance();
    const order    = registry.cloneFrom(template.name);
    if (!order) { setSavingId(null); return; }

    const { error } = await getSupabaseAdmin().from("energy_orders").insert({
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

    setSavingId(null);
    if (error) {
      setCloneMsg(`❌ Error: ${error.message}`);
    } else {
      setCloneMsg(`✅ Orden clonada desde "${template.name}" y guardada`);
      loadTemplates(); // actualiza usageCount en UI
    }
    setTimeout(() => setCloneMsg(null), 4000);
  };

  // ── UI helpers ────────────────────────────────────────────────
  const TrendIcon = ({ trend }: { trend: PriceQuote["trend"] | undefined }) => {
    if (trend === "UP")   return <TrendingUp   size={14} className="text-red-400" />;
    if (trend === "DOWN") return <TrendingDown size={14} className="text-green-400" />;
    return <Minus size={14} className="text-slate-500" />;
  };

  const cheapest = results
    .filter((r) => r.quote)
    .sort((a, b) => (a.quote!.pricePerKwh - b.quote!.pricePerKwh))[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Adaptadores de Precio</h1>
          <p className="section-subtitle">
            <span className="font-semibold text-slate-300">Adapter</span> + <span className="font-semibold text-slate-300">Prototype</span> — integración con mercados externos
          </p>
        </div>
        <button onClick={loadQuotes} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Alerta precio más barato */}
      {cheapest?.quote && (
        <div className="card border-green-500/20 bg-green-500/[0.04] flex items-center gap-3">
          <Zap size={16} className="text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-300">Mejor precio disponible ahora</p>
            <p className="text-xs text-slate-400">
              {cheapest.config.flag} {cheapest.config.label} — <strong className="text-white">${cheapest.quote.pricePerKwh.toFixed(4)} USD/kWh</strong>
            </p>
          </div>
        </div>
      )}

      {/* ── SECCIÓN ADAPTER ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Plug size={15} className="text-brand-400" />
          <h2 className="section-title">Patrón Adapter — APIs externas → IPriceEstimator</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {results.map((r) => (
            <div key={r.config.key} className="card card-hover animate-slide-up">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{r.config.flag}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{r.config.label}</p>
                    <p className="text-[10px] text-slate-500">{r.config.origin}</p>
                  </div>
                </div>
                <span className="badge badge-purple text-[10px]">Adapter</span>
              </div>

              {r.loading ? (
                <div className="space-y-2">
                  <div className="h-8 shimmer rounded-lg" />
                  <div className="h-4 shimmer rounded-lg w-2/3" />
                </div>
              ) : r.error ? (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{r.error}</p>
              ) : r.quote ? (
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Precio traducido (USD/kWh)</p>
                      <p className="text-2xl font-extrabold text-white">
                        ${r.quote.pricePerKwh.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendIcon trend={r.quote.trend} />
                      <span className={`text-xs font-semibold ${
                        r.quote.trend === "UP" ? "text-red-400" :
                        r.quote.trend === "DOWN" ? "text-green-400" : "text-slate-500"
                      }`}>{r.quote.trend}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                      <p className="text-slate-500">Promedio hist.</p>
                      <p className="text-white font-bold">${r.quote.historicalAvg.toFixed(4)}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                      <p className="text-slate-500">Válido por</p>
                      <p className="text-white font-bold">{r.quote.validForMinutes} min</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/[0.05]">
                    <p className="text-[10px] text-slate-600">
                      Fuente original: {r.config.key === "OMIE" ? "€/MWh" : r.config.key === "OCTOPUS" ? "p/kWh" : "€/MWh array"}
                      {" → "}traducido a USD/kWh por el Adapter
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Nota del patrón */}
        <div className="mt-3 card border-brand-500/20 bg-brand-500/[0.03]">
          <div className="flex gap-3">
            <Plug size={14} className="text-brand-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-brand-300 font-semibold">Adapter</span>: cada API externa (OMIE, ENTSO-E, Octopus) tiene un formato irreconciliable —{" "}
              <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">€/MWh</code>,{" "}
              <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">arrays de intervalos</code>,{" "}
              <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">p/kWh</code>.
              El Adapter traduce cada uno a <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">IPriceEstimator</code>{" "}
              sin que el sistema conozca los detalles de ningún proveedor.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN PROTOTYPE ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Copy size={15} className="text-brand-400" />
          <h2 className="section-title">Patrón Prototype — Plantillas de órdenes clonables</h2>
        </div>

        {cloneMsg && (
          <div className={`mb-3 px-4 py-2.5 rounded-xl text-xs font-medium border ${
            cloneMsg.startsWith("✅")
              ? "bg-green-500/10 border-green-500/20 text-green-300"
              : "bg-red-500/10 border-red-500/20 text-red-300"
          }`}>
            {cloneMsg}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {templates.map((t) => {
            const order = t.getOrder();
            return (
              <div key={t.name} className="card card-hover">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.description}</p>
                  </div>
                  <span className="badge badge-green text-[10px]">Prototype</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-[10px]">
                  <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <p className="text-slate-500">Tipo</p>
                    <p className={`font-bold ${order.type === "SELL" ? "text-green-400" : "text-blue-400"}`}>
                      {order.type === "SELL" ? "Venta" : "Compra"}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <p className="text-slate-500">Cantidad</p>
                    <p className="text-white font-bold">{order.amountKwh} kWh</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <p className="text-slate-500">Precio</p>
                    <p className="text-white font-bold">${order.pricePerKwh} USD</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <p className="text-slate-500">Usos</p>
                    <p className="text-brand-300 font-bold">{t.usageCount}×</p>
                  </div>
                </div>

                <div className="flex gap-1.5 mb-3 flex-wrap">
                  <span className="badge badge-yellow text-[10px]">{order.energySource}</span>
                  <span className="badge badge-purple text-[10px]">{order.pricingMode}</span>
                  {order.conditions.requireGreenCertified && <span className="badge badge-green text-[10px]">🌿 Verde</span>}
                  {order.conditions.allowPartialFill && <span className="badge badge-blue text-[10px]">Parcial</span>}
                </div>

                <button
                  onClick={() => handleClone(t)}
                  disabled={savingId === t.name}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-xs py-2"
                >
                  <Copy size={12} />
                  {savingId === t.name ? "Clonando…" : "Clonar y publicar orden"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Nota del patrón */}
        <div className="mt-3 card border-brand-500/20 bg-brand-500/[0.03]">
          <div className="flex gap-3">
            <Activity size={14} className="text-brand-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-brand-300 font-semibold">Prototype</span>: cada plantilla es un prototipo que puede clonarse con{" "}
              <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">template.clone(overrides?)</code>.
              El clon obtiene un nuevo ID, hereda todas las condiciones del original y se guarda en Supabase como una orden independiente.
              El contador "Usos" refleja cuántas veces se ha clonado el prototipo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// _Adapter _Prototype
