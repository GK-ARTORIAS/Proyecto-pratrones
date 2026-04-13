"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, Plug, Layers, RefreshCw, AlertTriangle,
  CheckCircle, Info, Zap, Cpu, TrendingUp, TrendingDown,
  Minus, Activity, ChevronRight,
} from "lucide-react";
import { InAppChannel, PriceAlertNotifier, OrderNotifier, DeviceNotifier,
  MultiChannelBroadcaster, EmailChannel, type Notification } from "@/lib/notifications/NotificationBridge";
import { createPriceAdapter } from "@/lib/market/ExternalPriceAdapter";
import { buildPricePipeline, type LoggingDecorator, type CachingDecorator } from "@/lib/market/PriceDecorator";
import type { PriceQuote } from "@/lib/market/ExternalPriceAdapter";

// ── Pipeline singleton de decoradores ─────────────────────────
const BASE_ADAPTER    = createPriceAdapter("OMIE");
const { estimator: DECORATED, logger: LOGGER, cache: CACHE } = buildPricePipeline(BASE_ADAPTER, {
  cacheTTLMinutes: 1,
  spikeThreshold:  0.09,  // bajo para demo — dispara alertas fácil
  dropThreshold:   0.06,
  maxRetries:      2,
  enableLogging:   true,
});

const LEVEL_STYLES: Record<string, string> = {
  INFO:     "border-blue-500/20  bg-blue-500/[0.05]  text-blue-300",
  WARNING:  "border-yellow-500/20 bg-yellow-500/[0.05] text-yellow-300",
  CRITICAL: "border-red-500/20   bg-red-500/[0.06]   text-red-300",
};
const LEVEL_ICON = {
  INFO:     <Info size={13} className="text-blue-400 shrink-0" />,
  WARNING:  <AlertTriangle size={13} className="text-yellow-400 shrink-0" />,
  CRITICAL: <AlertTriangle size={13} className="text-red-400 shrink-0" />,
};

export default function NotificationsPage() {
  const inApp = InAppChannel.getInstance();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentQuote,  setCurrentQuote]  = useState<PriceQuote | null>(null);
  const [logHistory,    setLogHistory]    = useState<ReturnType<typeof LOGGER.getHistory>>([]);
  const [cacheStats,    setCacheStats]    = useState(CACHE.getStats());
  const [filter,        setFilter]        = useState<"ALL" | "INFO" | "WARNING" | "CRITICAL">("ALL");
  const [loadingQuote,  setLoadingQuote]  = useState(false);
  const [activeDemo,    setActiveDemo]    = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setNotifications([...inApp.getAll()]);
    setLogHistory([...LOGGER.getHistory()]);
    setCacheStats(CACHE.getStats());
  }, [inApp]);

  const fetchQuote = useCallback(async () => {
    setLoadingQuote(true);
    try {
      const q = await DECORATED.getCurrentQuote();
      setCurrentQuote(q);
    } catch { /* ignore */ }
    setLoadingQuote(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    fetchQuote();
    const interval = setInterval(fetchQuote, 8000);
    return () => clearInterval(interval);
  }, [fetchQuote]);

  // ── Demos del Bridge ──────────────────────────────────────
  const demoMap: Record<string, () => Promise<void>> = {
    pricespike: async () => {
      const n = new PriceAlertNotifier(inApp);
      await n.alertPriceSpike("SOLAR", 0.21, 0.14);
    },
    pricedrop: async () => {
      const n = new PriceAlertNotifier(inApp);
      await n.alertPriceDrop("WIND", 0.07, 0.13);
    },
    orderfilled: async () => {
      const n = new OrderNotifier(inApp);
      await n.notifyOrderFilled("ORD-" + Date.now().toString().slice(-4), 10, 0.118);
    },
    orderexpired: async () => {
      const n = new OrderNotifier(inApp);
      await n.notifyOrderExpired("ORD-" + Date.now().toString().slice(-4), "sin contrapartes disponibles");
    },
    deviceoffline: async () => {
      const n = new DeviceNotifier(inApp);
      await n.notifyDeviceOffline("DEV-001", "Panel Solar Norte");
    },
    deviceonline: async () => {
      const n = new DeviceNotifier(inApp);
      await n.notifyDeviceOnline("DEV-001", "Panel Solar Norte");
    },
    multichannel: async () => {
      const multi = new MultiChannelBroadcaster([inApp, new EmailChannel()]);
      const n     = new OrderNotifier(multi);
      await n.notifyOrderFilled("ORD-MULTI", 25, 0.13);
    },
  };

  const fireDemo = async (key: string) => {
    setActiveDemo(key);
    await demoMap[key]?.();
    await refresh();
    setActiveDemo(null);
  };

  const filtered = filter === "ALL" ? notifications : notifications.filter((n) => n.level === filter);
  const countByLevel = (l: string) => notifications.filter((n) => n.level === l).length;

  const TrendIcon = ({ trend }: { trend?: string }) =>
    trend === "UP" ? <TrendingUp size={12} className="text-red-400" /> :
    trend === "DOWN" ? <TrendingDown size={12} className="text-green-400" /> :
    <Minus size={12} className="text-slate-500" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Notificaciones</h1>
          <p className="section-subtitle">
            <span className="font-semibold text-slate-300">Bridge</span> + <span className="font-semibold text-slate-300">Decorator</span> — alertas inteligentes con pipeline de precios
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { inApp.clear(); refresh(); }} className="btn-secondary text-xs">Limpiar</button>
          <button onClick={fetchQuote} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* ── SECCIÓN DECORATOR ─────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Layers size={15} className="text-brand-400" />
          <h2 className="section-title">Patrón Decorator — Pipeline de precio (OMIE)</h2>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {/* Precio actual */}
          <div className="card bg-white/[0.03] col-span-2">
            <p className="text-[10px] text-slate-500 mb-1">Precio actual (con cache + retry + alertas + log)</p>
            {loadingQuote ? (
              <div className="h-9 shimmer rounded-lg" />
            ) : currentQuote ? (
              <div className="flex items-end gap-2">
                <span className="text-3xl font-extrabold text-white">
                  ${currentQuote.pricePerKwh.toFixed(4)}
                </span>
                <span className="text-xs text-slate-400 mb-1">USD/kWh</span>
                <div className="ml-auto flex items-center gap-1 mb-1">
                  <TrendIcon trend={currentQuote.trend} />
                  <span className="text-xs text-slate-500">{currentQuote.trend}</span>
                </div>
              </div>
            ) : <p className="text-sm text-slate-500">–</p>}
          </div>

          {/* Cache stats */}
          <div className="card bg-white/[0.03]">
            <p className="text-[10px] text-slate-500 mb-2">CachingDecorator</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Hits</span>
                <span className="text-green-400 font-bold">{cacheStats.hits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Misses</span>
                <span className="text-yellow-400 font-bold">{cacheStats.misses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ratio</span>
                <span className="text-white font-bold">{(cacheStats.ratio * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Log */}
          <div className="card bg-white/[0.03]">
            <p className="text-[10px] text-slate-500 mb-2">LoggingDecorator</p>
            <div className="space-y-1">
              {logHistory.slice(0, 3).map((e, i) => (
                <div key={i} className="text-[10px] flex items-center gap-1">
                  <span className={e.fromCache ? "text-green-400" : "text-yellow-400"}>
                    {e.fromCache ? "●" : "○"}
                  </span>
                  <span className="text-slate-400">${e.price.toFixed(4)}</span>
                  <span className="text-slate-600">{e.durationMs}ms</span>
                </div>
              ))}
              {logHistory.length === 0 && <p className="text-[10px] text-slate-600">Sin registros aún</p>}
            </div>
          </div>
        </div>

        {/* Pipeline visual */}
        <div className="flex items-center gap-1 flex-wrap text-[10px] text-slate-500 bg-white/[0.02] rounded-lg px-3 py-2">
          <span className="text-slate-400 font-semibold">Pipeline:</span>
          {["OMIE API", "RetryDecorator", "CachingDecorator", "AlertingDecorator", "LoggingDecorator"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1">
              <code className="bg-white/[0.06] px-1 py-0.5 rounded text-brand-300">{s}</code>
              {i < arr.length - 1 && <ChevronRight size={10} />}
            </span>
          ))}
        </div>
      </div>

      {/* ── SECCIÓN BRIDGE — demos ────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Plug size={15} className="text-brand-400" />
          <h2 className="section-title">Patrón Bridge — Disparar notificaciones (Abstracción × Canal)</h2>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { key: "pricespike",    label: "⚡ Precio alto",         icon: <Zap size={12} />,      color: "badge-yellow" },
            { key: "pricedrop",     label: "📉 Precio bajo",         icon: <TrendingDown size={12} />, color: "badge-green" },
            { key: "orderfilled",   label: "✅ Orden ejecutada",     icon: <CheckCircle size={12} />,  color: "badge-blue" },
            { key: "orderexpired",  label: "⏰ Orden expirada",      icon: <AlertTriangle size={12} />,color: "badge-red" },
            { key: "deviceoffline", label: "📡 Dispositivo offline", icon: <Cpu size={12} />,      color: "badge-red" },
            { key: "deviceonline",  label: "🟢 Dispositivo online",  icon: <Cpu size={12} />,      color: "badge-green" },
            { key: "multichannel",  label: "📢 Multi-canal",         icon: <Activity size={12} />, color: "badge-purple" },
          ].map((d) => (
            <button key={d.key} onClick={() => fireDemo(d.key)} disabled={!!activeDemo}
              className="card card-hover text-left flex items-center gap-2 py-3 px-3 disabled:opacity-50 transition-all">
              <span className={`badge ${d.color} text-[10px]`}>{d.icon}</span>
              <span className="text-xs text-white">{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── FEED DE NOTIFICACIONES ────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-brand-400" />
            <h2 className="section-title">Feed de notificaciones — InApp Channel</h2>
            <span className="badge badge-purple text-[10px]">{notifications.length}</span>
          </div>
          <div className="flex gap-1">
            {(["ALL", "INFO", "WARNING", "CRITICAL"] as const).map((l) => (
              <button key={l} onClick={() => setFilter(l)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  filter === l
                    ? "bg-brand-500/20 border border-brand-500/40 text-brand-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}>
                {l === "ALL" ? `Todas (${notifications.length})` : `${l} (${countByLevel(l)})`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-8">
              Sin notificaciones — usa los botones de arriba para disparar demos.
            </p>
          )}
          {filtered.map((n) => (
            <div key={n.id} className={`flex gap-3 px-3 py-2.5 rounded-xl border text-xs ${LEVEL_STYLES[n.level]}`}>
              {LEVEL_ICON[n.level as keyof typeof LEVEL_ICON]}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-xs">{n.title}</p>
                <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">{n.body}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-600">
                  {n.timestamp.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
                <p className="text-[10px] text-slate-700">{n.source}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// _Bridge _Decorator
