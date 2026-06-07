"use client";

import { useState, useCallback } from "react";
import {
    Shuffle, Terminal, Radio, GitBranch, FileText,
    Link2, Network, Eye, Archive, ChevronRight, Play,
    RotateCcw, RotateCw, CheckCircle, XCircle, AlertTriangle,
    Plus, Trash2, Camera,
} from "lucide-react";

// ── Lib imports ───────────────────────────────────────────────
import {
    OrderMatcher,
    PriceFirstStrategy, GreenFirstStrategy,
    TimeFirstStrategy, BestValueStrategy,
    type MatchSummary,
} from "@/lib/trading/OrderMatchingStrategy";

import { TradeOrderBuilder } from "@/lib/trading/TradeOrderBuilder";

import {
    DeviceCommandBus,
    TurnOnCommand, TurnOffCommand,
    UpdateReadingCommand, ResetCommand,
} from "@/lib/iot/DeviceCommandBus";
import type { IDeviceService, ReadingInput } from "@/lib/iot/DeviceServiceProxy";

import { MarketEventBus, type MarketEvent } from "@/lib/market/MarketEventBus";

import { OrderContext } from "@/lib/trading/OrderStateMachine";

import {
    ConsumerInvoiceProcessor,
    ProducerInvoiceProcessor,
    StorageOperatorInvoiceProcessor,
    type Invoice,
} from "@/lib/trading/BaseInvoiceProcessor";

import {
    AlertValidationChain,
    type AlertRequest,
    type AlertHandlerResult,
} from "@/lib/iot/AlertValidationChain";

import {
    acceptVisitor,
    AuditReportVisitor,
    TaxCalculationVisitor,
    EfficiencyReportVisitor,
} from "@/lib/iot/EnergyNodeVisitor";
import { createDemoPortfolio } from "@/lib/iot/EnergyComposite";

import { OrderBook, OrderBookHistory } from "@/lib/trading/OrderBookSnapshot";

// ── Types ─────────────────────────────────────────────────────
type TabId =
    | "strategy" | "command" | "observer" | "state"
    | "template" | "chain" | "mediator" | "visitor" | "memento";

interface Tab {
    id: TabId;
    label: string;
    icon: React.ElementType;
    pattern: string;
    color: string;
}

const TABS: Tab[] = [
    { id: "strategy",  label: "Strategy",        icon: Shuffle,   pattern: "Comportamental", color: "#6366f1" },
    { id: "command",   label: "Command",          icon: Terminal,  pattern: "Comportamental", color: "#8b5cf6" },
    { id: "observer",  label: "Observer",         icon: Radio,     pattern: "Comportamental", color: "#3b82f6" },
    { id: "state",     label: "State",            icon: GitBranch, pattern: "Comportamental", color: "#10b981" },
    { id: "template",  label: "Template Method",  icon: FileText,  pattern: "Comportamental", color: "#f59e0b" },
    { id: "chain",     label: "Chain of Resp.",   icon: Link2,     pattern: "Comportamental", color: "#ef4444" },
    { id: "mediator",  label: "Mediator",         icon: Network,   pattern: "Comportamental", color: "#ec4899" },
    { id: "visitor",   label: "Visitor",          icon: Eye,       pattern: "Comportamental", color: "#14b8a6" },
    { id: "memento",   label: "Memento",          icon: Archive,   pattern: "Comportamental", color: "#f97316" },
];

// ── Demo orders factory ───────────────────────────────────────
function makeDemoOrders() {
    const b = (type: "BUY" | "SELL", kwh: number, price: number, src: "SOLAR"|"WIND"|"BATTERY"|"GRID") =>
        new TradeOrderBuilder().ofType(type).withAmount(kwh).atPrice(price).fromSource(src).build();

    return {
        buys: [
            b("BUY",  15, 0.130, "SOLAR"),
            b("BUY",  10, 0.125, "WIND"),
            b("BUY",   8, 0.120, "GRID"),
        ],
        sells: [
            b("SELL", 12, 0.115, "SOLAR"),
            b("SELL", 20, 0.118, "WIND"),
            b("SELL",  5, 0.110, "BATTERY"),
        ],
    };
}

// ── Mock IDeviceService for Command demo ──────────────────────
const mockService: IDeviceService = {
    getDevices: async () => [{ id: "DEV-001", name: "Panel Solar Demo", status: "ONLINE", current_reading_kwh: 42.5 } as never],
    updateReading: async (_id: string, _r: ReadingInput) => ({ ok: true }),
    addDevice: async () => ({ ok: true, id: "DEV-001" }),
    deleteDevice: async () => ({ ok: true }),
    getStats: () => ({ type: "MockService" }),
};

// ── Output box ────────────────────────────────────────────────
function OutputBox({ children, title }: { children: React.ReactNode; title?: string }) {
    return (
        <div className="bg-[#0d0f14] border border-white/[0.07] rounded-xl p-4 font-mono text-xs space-y-1 max-h-72 overflow-y-auto">
            {title && <p className="text-slate-500 mb-2 font-sans text-[10px] uppercase tracking-widest">{title}</p>}
            {children}
        </div>
    );
}

function Line({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
    return (
        <div className="flex gap-2">
            <span className="text-slate-600 shrink-0">{label}:</span>
            <span className={`${color} break-all`}>{String(value)}</span>
        </div>
    );
}

function Tag({ text, color }: { text: string; color?: string }) {
    return (
        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${color ?? "bg-white/[0.07] text-slate-300"}`}>
            {text}
        </span>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB DEMOS
// ══════════════════════════════════════════════════════════════

// ── Strategy ─────────────────────────────────────────────────
function StrategyTab() {
    const STRATEGIES = [
        { key: "PriceFirst", label: "💰 Precio primero",   desc: "Mejor precio gana" },
        { key: "GreenFirst", label: "🌿 Verde primero",    desc: "Prioriza renovables" },
        { key: "TimeFirst",  label: "⏱️ FIFO",             desc: "Primero en llegar" },
        { key: "BestValue",  label: "📊 Mejor valor",      desc: "Maximiza kWh × precio" },
    ];
    const [selected, setSelected] = useState("PriceFirst");
    const [result, setResult] = useState<MatchSummary | null>(null);

    const run = useCallback(() => {
        const matcher = new OrderMatcher();
        const strats: Record<string, () => void> = {
            PriceFirst: () => matcher.setStrategy(new PriceFirstStrategy()),
            GreenFirst: () => matcher.setStrategy(new GreenFirstStrategy()),
            TimeFirst:  () => matcher.setStrategy(new TimeFirstStrategy()),
            BestValue:  () => matcher.setStrategy(new BestValueStrategy()),
        };
        strats[selected]?.();
        const { buys, sells } = makeDemoOrders();
        setResult(matcher.run([...buys, ...sells]));
    }, [selected]);

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">OrderMatcher</span> delega a la estrategia activa.
                Cambia la estrategia en runtime sin modificar el contexto.
            </p>
            <div className="grid grid-cols-4 gap-2">
                {STRATEGIES.map(s => (
                    <button key={s.key} onClick={() => setSelected(s.key)}
                        className={`flex flex-col gap-1 p-3 rounded-xl border text-left transition-all ${
                            selected === s.key
                                ? "border-indigo-500/50 bg-indigo-500/10 text-white"
                                : "border-white/[0.07] text-slate-400 hover:border-white/20"
                        }`}>
                        <span className="text-sm">{s.label}</span>
                        <span className="text-[10px] text-slate-500">{s.desc}</span>
                    </button>
                ))}
            </div>
            <button onClick={run} className="btn-primary flex items-center gap-2">
                <Play size={13} /> Ejecutar matching
            </button>
            {result && (
                <OutputBox title="MatchSummary">
                    <Line label="estrategia"    value={result.strategy} color="text-indigo-400" />
                    <Line label="matches"       value={result.totalMatches} />
                    <Line label="kWh matchados" value={`${result.totalKwhMatched.toFixed(2)} kWh`} color="text-green-400" />
                    <Line label="valor total"   value={`$${result.totalValueUsd.toFixed(4)} USD`} color="text-yellow-400" />
                    <Line label="precio medio"  value={`$${result.avgPricePerKwh.toFixed(5)}/kWh`} />
                    <Line label="compras sin match" value={result.unmatchedBuys} color="text-red-400" />
                    <Line label="ventas sin match"  value={result.unmatchedSells} color="text-red-400" />
                    <div className="border-t border-white/[0.05] mt-2 pt-2 space-y-2">
                        {result.results.map((r, i) => (
                            <div key={i} className="text-[10px] text-slate-400">
                                <span className="text-green-400">Match {i + 1}:</span>{" "}
                                {r.matchedKwh} kWh de {r.energySource} @ ${r.pricePerKwh.toFixed(4)}
                            </div>
                        ))}
                    </div>
                </OutputBox>
            )}
        </div>
    );
}

// ── Command ──────────────────────────────────────────────────
function CommandTab() {
    const [bus] = useState(() => new DeviceCommandBus({ maxHistory: 20 }));
    const [log, setLog] = useState<string[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const refresh = () => {
        setCanUndo(bus.canUndo());
        setCanRedo(bus.canRedo());
    };

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));

    const run = async (cmdName: string) => {
        let cmd;
        const deviceId = "DEV-001";
        if (cmdName === "TurnOn")         cmd = new TurnOnCommand(deviceId, mockService);
        else if (cmdName === "TurnOff")   cmd = new TurnOffCommand(deviceId, mockService);
        else if (cmdName === "Update")    cmd = new UpdateReadingCommand(deviceId, { value_kwh: Math.round(Math.random() * 100), timestamp: new Date().toISOString() }, mockService);
        else                              cmd = new ResetCommand(deviceId, mockService);

        const result = await bus.execute(cmd!);
        addLog(`EXEC ${cmdName} → ${result.ok ? "✅ OK" : "❌ " + result.error} (${result.durationMs}ms)`);
        refresh();
    };

    const undo = async () => {
        const r = await bus.undo();
        addLog(r ? `UNDO → ${r.commandType} ✅` : "UNDO → nada que deshacer");
        refresh();
    };

    const redo = async () => {
        const r = await bus.redo();
        addLog(r ? `REDO → ${r.commandType} ✅` : "REDO → nada que rehacer");
        refresh();
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">DeviceCommandBus</span> encola comandos como objetos.
                Cada uno tiene <code className="bg-white/[0.06] px-1 rounded">execute()</code> y <code className="bg-white/[0.06] px-1 rounded">undo()</code>.
            </p>
            <div className="flex flex-wrap gap-2">
                {["TurnOn", "TurnOff", "Update", "Reset"].map(cmd => (
                    <button key={cmd} onClick={() => run(cmd)} className="btn-secondary flex items-center gap-1.5 text-xs">
                        <Play size={11} /> {cmd}
                    </button>
                ))}
                <div className="ml-auto flex gap-2">
                    <button onClick={undo} disabled={!canUndo} className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-40">
                        <RotateCcw size={11} /> Undo
                    </button>
                    <button onClick={redo} disabled={!canRedo} className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-40">
                        <RotateCw size={11} /> Redo
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500">Historial</p>
                    <p className="text-xl font-bold text-white">{bus.getHistory().length}</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500">Undo pendientes</p>
                    <p className="text-xl font-bold text-purple-400">{bus.getPendingUndo()}</p>
                </div>
            </div>
            <OutputBox title="Command Log">
                {log.length === 0 && <span className="text-slate-600">Ejecuta un comando para ver el log…</span>}
                {log.map((l, i) => (
                    <div key={i} className={l.includes("✅") ? "text-green-400" : l.includes("UNDO") ? "text-yellow-400" : l.includes("REDO") ? "text-blue-400" : "text-slate-300"}>
                        {l}
                    </div>
                ))}
            </OutputBox>
        </div>
    );
}

// ── Observer ─────────────────────────────────────────────────
function ObserverTab() {
    const [events, setEvents] = useState<{ type: string; payload: string; ts: string }[]>([]);
    const [bus] = useState(() => MarketEventBus.getInstance());

    const emit = async (type: "PRICE_SPIKE" | "ORDER_MATCHED" | "DEVICE_OFFLINE" | "PRICE_DROP") => {
        if (type === "PRICE_SPIKE" || type === "PRICE_DROP") {
            await bus.emitPriceUpdate({ source: "SOLAR", pricePerKwh: 0.21, previousPrice: 0.14, trend: "UP" }, "PatternDemo");
        } else if (type === "ORDER_MATCHED") {
            await bus.emitOrderEvent("ORDER_MATCHED", { orderId: "ORD-DEMO", type: "BUY", amountKwh: 10, pricePerKwh: 0.118 }, "PatternDemo");
        } else {
            await bus.emitDeviceEvent("DEVICE_OFFLINE", { deviceId: "DEV-001", deviceName: "Panel Solar", previousStatus: "ONLINE", newStatus: "OFFLINE" }, "PatternDemo");
        }
        const history = bus.getLog();
        setEvents(history.slice(-10).reverse().map((e: MarketEvent) => ({
            type: e.type,
            payload: JSON.stringify(e.payload).slice(0, 80) + "…",
            ts: (e.timestamp as Date).toLocaleTimeString("es-ES"),
        })));
    };

    const BUTTONS = [
        { type: "PRICE_SPIKE" as const,    label: "⚡ Spike de precio",   color: "text-red-400" },
        { type: "PRICE_DROP" as const,     label: "📉 Caída de precio",   color: "text-green-400" },
        { type: "ORDER_MATCHED" as const,  label: "✅ Orden ejecutada",    color: "text-blue-400" },
        { type: "DEVICE_OFFLINE" as const, label: "📡 Dispositivo offline", color: "text-yellow-400" },
    ];

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">MarketEventBus</span> emite eventos que todos los observers reciben.
                El emisor no conoce a sus suscriptores.
            </p>
            <div className="flex flex-wrap gap-2">
                {BUTTONS.map(b => (
                    <button key={b.type} onClick={() => emit(b.type)} className="btn-secondary text-xs flex items-center gap-1.5">
                        <Radio size={11} className={b.color} /> {b.label}
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500">Eventos emitidos</p>
                    <p className="text-xl font-bold text-blue-400">{bus.getLog().length}</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500">Observers suscritos</p>
                    <p className="text-xl font-bold text-white">{bus.getObserverCount()}</p>
                </div>
            </div>
            <OutputBox title="Event History (últimos 10)">
                {events.length === 0 && <span className="text-slate-600">Emite un evento para ver el historial…</span>}
                {events.map((e, i) => (
                    <div key={i} className="flex gap-2 text-[11px]">
                        <span className="text-slate-600 shrink-0">{e.ts}</span>
                        <span className="text-blue-400 shrink-0 font-bold">{e.type}</span>
                        <span className="text-slate-400 truncate">{e.payload}</span>
                    </div>
                ))}
            </OutputBox>
        </div>
    );
}

// ── State ─────────────────────────────────────────────────────
function StateTab() {
    const [ctx, setCtx] = useState<OrderContext | null>(null);
    const [log, setLog] = useState<{ from: string; action: string; to: string; ok: boolean; msg?: string }[]>([]);

    const initOrder = () => {
        const order = new TradeOrderBuilder().ofType("SELL").withAmount(10).atPrice(0.12).fromSource("SOLAR").build();
        setCtx(new OrderContext(order));
        setLog([]);
    };

    const doAction = (action: string) => {
        if (!ctx) return;
        const from = ctx.getStatus();
        try {
            if      (action === "publish") ctx.publish();
            else if (action === "match")   ctx.match({ matchedKwh: 10, executedPrice: 0.12 });
            else if (action === "cancel")  ctx.cancel("Demo: cancelado por el usuario");
            else if (action === "expire")  ctx.expire();
            setLog(prev => [{ from, action, to: ctx.getStatus(), ok: true }, ...prev]);
        } catch (e) {
            setLog(prev => [{ from, action, to: from, ok: false, msg: String(e) }, ...prev]);
        }
        setCtx(old => old); // force re-render
    };

    const STATUS_COLOR: Record<string, string> = {
        DRAFT: "text-slate-400", OPEN: "text-blue-400",
        MATCHED: "text-green-400", CANCELLED: "text-red-400", EXPIRED: "text-yellow-400",
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">OrderContext</span> delega a su estado actual.
                Las transiciones inválidas lanzan <code className="bg-white/[0.06] px-1 rounded">OrderStateError</code>.
            </p>

            {/* Diagrama de estados */}
            <div className="bg-white/[0.02] rounded-xl p-3 flex items-center justify-center gap-2 text-[11px] flex-wrap">
                {["DRAFT", "OPEN", "MATCHED", "CANCELLED", "EXPIRED"].map((s, i, arr) => (
                    <span key={s} className="flex items-center gap-1.5">
                        <span className={`font-bold px-2 py-0.5 rounded-lg border ${
                            ctx?.getStatus() === s
                                ? "border-current bg-current/10 " + STATUS_COLOR[s]
                                : "border-white/[0.06] text-slate-600"
                        }`}>{s}</span>
                        {i < 2 && <ChevronRight size={12} className="text-slate-700" />}
                    </span>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={initOrder} className="btn-primary text-xs flex items-center gap-1.5"><Plus size={11} /> Nueva orden (DRAFT)</button>
                {ctx && (
                    <>
                        <button onClick={() => doAction("publish")} className="btn-secondary text-xs">📢 Publicar</button>
                        <button onClick={() => doAction("match")}   className="btn-secondary text-xs">✅ Matchear</button>
                        <button onClick={() => doAction("cancel")}  className="btn-secondary text-xs">❌ Cancelar</button>
                        <button onClick={() => doAction("expire")}  className="btn-secondary text-xs">⏰ Vencer</button>
                    </>
                )}
            </div>

            {ctx && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-xs text-slate-500">Estado actual:</span>
                    <span className={`text-sm font-bold ${STATUS_COLOR[ctx.getStatus()]}`}>{ctx.getStatus()}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">{ctx.describe()}</span>
                </div>
            )}

            <OutputBox title="Transition Log">
                {log.length === 0 && <span className="text-slate-600">Crea una orden y ejecuta transiciones…</span>}
                {log.map((l, i) => (
                    <div key={i} className={`flex gap-2 ${l.ok ? "text-slate-300" : "text-red-400"}`}>
                        <span className={STATUS_COLOR[l.from]}>{l.from}</span>
                        <span className="text-slate-600">→ {l.action} →</span>
                        <span className={STATUS_COLOR[l.to]}>{l.to}</span>
                        {!l.ok && <span className="text-red-400 text-[10px]">({l.msg?.split(":").slice(-1)[0]?.trim()})</span>}
                    </div>
                ))}
            </OutputBox>
        </div>
    );
}

// ── Template Method ───────────────────────────────────────────
function TemplateTab() {
    const [role, setRole] = useState<"CONSUMER" | "PRODUCER" | "STORAGE_OPERATOR">("CONSUMER");
    const [invoice, setInvoice] = useState<Invoice | null>(null);

    const generate = () => {
        const match = {
            buyOrderId: "BUY-DEMO-001", sellOrderId: "SELL-DEMO-002",
            matchedKwh: 15, pricePerKwh: 0.120, totalValueUsd: 1.8,
            energySource: "SOLAR" as const, matchedAt: new Date(),
        };
        const processors = {
            CONSUMER:         new ConsumerInvoiceProcessor(),
            PRODUCER:         new ProducerInvoiceProcessor(),
            STORAGE_OPERATOR: new StorageOperatorInvoiceProcessor(),
        };
        setInvoice(processors[role].processInvoice(match));
    };

    const ROLES = [
        { key: "CONSUMER",         label: "👤 Consumidor",  desc: "21% impuesto + 1.5% fee" },
        { key: "PRODUCER",         label: "🌱 Productor",   desc: "2.5% impuesto + incentivo verde" },
        { key: "STORAGE_OPERATOR", label: "🔋 Operador",    desc: "0% impuesto + fee fijo" },
    ] as const;

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">BaseInvoiceProcessor.processInvoice()</span> es el Template Method.
                Cada subclase implementa solo los pasos variables (impuestos, descuentos, comisión).
            </p>
            <div className="grid grid-cols-3 gap-2">
                {ROLES.map(r => (
                    <button key={r.key} onClick={() => setRole(r.key)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                            role === r.key
                                ? "border-yellow-500/50 bg-yellow-500/10"
                                : "border-white/[0.07] hover:border-white/20"
                        }`}>
                        <p className="text-sm text-white">{r.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                    </button>
                ))}
            </div>
            <button onClick={generate} className="btn-primary flex items-center gap-2">
                <FileText size={13} /> Generar factura
            </button>
            {invoice && (
                <OutputBox title="Invoice generada">
                    <Line label="número"     value={invoice.invoiceNumber} color="text-yellow-400" />
                    <Line label="procesador" value={invoice.processorType} color="text-yellow-300" />
                    <Line label="kWh"        value={`${invoice.matchedKwh} kWh @ $${invoice.pricePerKwh}/kWh`} />
                    <Line label="base"       value={`$${invoice.baseAmount.toFixed(4)}`} />
                    <Line label="impuestos"  value={`$${invoice.taxAmount.toFixed(4)}`} color="text-red-400" />
                    <Line label="descuento"  value={`-$${invoice.discountAmount.toFixed(4)}`} color="text-green-400" />
                    <Line label="fee"        value={`$${invoice.platformFee.toFixed(4)}`} color="text-slate-400" />
                    <div className="border-t border-white/[0.08] mt-1 pt-1">
                        <Line label="TOTAL" value={`$${invoice.totalDueUsd.toFixed(4)} USD`} color="text-white" />
                    </div>
                    <div className="text-slate-500 text-[10px] mt-1 leading-relaxed">{invoice.notes}</div>
                </OutputBox>
            )}
        </div>
    );
}

// ── Chain of Responsibility ───────────────────────────────────
function ChainTab() {
    const [threshold, setThreshold]     = useState(50);
    const [currentKwh, setCurrentKwh]   = useState(75);
    const [inMaintenance, setInMaintenance] = useState(false);
    const [hasActiveAlert, setHasActiveAlert] = useState(false);
    const [lastSeenMinsAgo, setLastSeenMinsAgo] = useState(2);
    const [result, setResult] = useState<{ shouldAlert: boolean; log: AlertHandlerResult[] } | null>(null);

    const run = () => {
        const chain = new AlertValidationChain(hasActiveAlert ? ["DEV-DEMO"] : []);
        const req: AlertRequest = {
            alert: {
                deviceId: "DEV-DEMO", deviceName: "Panel Demo",
                currentKwh, lastSeenAt: new Date(Date.now() - lastSeenMinsAgo * 60_000),
                inMaintenance, source: "SOLAR",
            },
            thresholdKwh: threshold,
            maxStaleMs: 5 * 60_000, // 5 min
        };
        setResult(chain.validate(req));
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">AlertValidationChain</span> aplica 4 handlers en orden.
                Cada uno puede detener la cadena (STOP) o pasar al siguiente (PASS).
            </p>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Consumo actual: <strong className="text-white">{currentKwh} kWh</strong></label>
                        <input type="range" min={0} max={150} value={currentKwh} onChange={e => setCurrentKwh(+e.target.value)} className="w-full accent-red-500" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Umbral: <strong className="text-white">{threshold} kWh</strong></label>
                        <input type="range" min={10} max={120} value={threshold} onChange={e => setThreshold(+e.target.value)} className="w-full accent-yellow-500" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Última lectura hace: <strong className="text-white">{lastSeenMinsAgo} min</strong></label>
                        <input type="range" min={0} max={15} value={lastSeenMinsAgo} onChange={e => setLastSeenMinsAgo(+e.target.value)} className="w-full accent-blue-500" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={inMaintenance} onChange={e => setInMaintenance(e.target.checked)} className="accent-green-500 w-4 h-4 rounded" />
                        <span className="text-xs text-slate-400">En mantenimiento</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={hasActiveAlert} onChange={e => setHasActiveAlert(e.target.checked)} className="accent-purple-500 w-4 h-4 rounded" />
                        <span className="text-xs text-slate-400">Ya tiene alerta activa</span>
                    </label>
                </div>

                <div className="space-y-2">
                    {["MaintenanceMode", "DuplicateAlert", "ThresholdCheck", "StaleDevice"].map((h, i) => (
                        <div key={h} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                            <span className="text-[10px] font-bold text-slate-600 w-4">{i + 1}</span>
                            <span className="text-xs text-slate-400 flex-1">{h}</span>
                            {result && (() => {
                                const entry = result.log.find(l => l.handlerName === h);
                                if (!entry) return <span className="text-slate-700 text-[10px]">—</span>;
                                return entry.verdict === "PASS"
                                    ? <CheckCircle size={12} className="text-green-400" />
                                    : <XCircle size={12} className="text-red-400" />;
                            })()}
                        </div>
                    ))}
                </div>
            </div>

            <button onClick={run} className="btn-primary flex items-center gap-2">
                <Link2 size={13} /> Ejecutar cadena
            </button>

            {result && (
                <div className={`px-4 py-3 rounded-xl border text-sm font-bold ${
                    result.shouldAlert
                        ? "border-red-500/40 bg-red-500/10 text-red-400"
                        : "border-green-500/40 bg-green-500/10 text-green-400"
                }`}>
                    {result.shouldAlert ? "⚠️ Alerta debe emitirse" : "✅ Alerta suprimida — no procede"}
                    <div className="mt-2 space-y-1">
                        {result.log.map((l, i) => (
                            <div key={i} className={`flex gap-2 text-[10px] font-normal ${l.verdict === "STOP" ? "text-red-300" : "text-green-300"}`}>
                                <span className="font-bold">[{l.verdict}]</span>
                                <span className="text-slate-400">{l.handlerName}:</span>
                                <span className="text-slate-500 truncate">{l.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Mediator ──────────────────────────────────────────────────
function MediatorTab() {
    const [log, setLog] = useState<string[]>([]);
    const [running, setRunning] = useState(false);

    const runMediator = async () => {
        setRunning(true);
        setLog([]);
        const lines: string[] = [];

        // Use internal classes directly (Mediator coordinates them)
        lines.push("🎛️  TradingMediator iniciado");
        lines.push("─────────────────────────────────");

        // Step 1: strategy
        const matcher = new OrderMatcher();
        matcher.setStrategy(new GreenFirstStrategy());
        lines.push("1. ✅ Strategy → GreenFirstStrategy configurada");

        // Step 2: matching
        const { buys, sells } = makeDemoOrders();
        const summary = matcher.run([...buys, ...sells]);
        lines.push(`2. ✅ OrderMatcher → ${summary.totalMatches} matches (${summary.totalKwhMatched.toFixed(1)} kWh)`);

        // Step 3: invoicing
        const processor = new ProducerInvoiceProcessor();
        const invoices = summary.results.map(r => processor.processInvoice(r));
        lines.push(`3. ✅ InvoiceProcessor → ${invoices.length} facturas generadas`);
        invoices.forEach(inv => lines.push(`     📄 ${inv.invoiceNumber} — $${inv.totalDueUsd.toFixed(4)}`));

        // Step 4: events
        const bus = MarketEventBus.getInstance();
        let evtCount = 0;
        for (const result of summary.results) {
            await bus.emitOrderEvent("ORDER_MATCHED", {
                orderId: result.buyOrderId, type: "BUY",
                amountKwh: result.matchedKwh, pricePerKwh: result.pricePerKwh,
            }, "TradingMediator");
            evtCount++;
        }
        lines.push(`4. ✅ MarketEventBus → ${evtCount} eventos ORDER_MATCHED emitidos`);
        lines.push("─────────────────────────────────");
        lines.push(`✅ Ciclo completo — ${summary.totalMatches} matches, $${summary.totalValueUsd.toFixed(4)} USD`);

        setLog(lines);
        setRunning(false);
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">TradingMediator</span> coordina OrderMatcher + InvoiceProcessor + MarketEventBus.
                Ningún subsistema conoce a los demás — todo pasa por el Mediator.
            </p>

            <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
                {["OrderMatcher", "EventBus", "TradingMediator", "InvoiceProcessor", "AlertChain"].map((c, i) => (
                    <div key={c} className={`p-2 rounded-lg border ${i === 2
                        ? "border-pink-500/40 bg-pink-500/10 text-pink-400 font-bold"
                        : "border-white/[0.07] bg-white/[0.03] text-slate-500"}`}>
                        {c}
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-slate-600 text-center">↑ Solo el Mediator (centro) conoce a todos los Colleagues</p>

            <button onClick={runMediator} disabled={running} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Network size={13} /> {running ? "Coordinando…" : "Ejecutar ciclo completo"}
            </button>

            <OutputBox title="Mediator Execution Log">
                {log.length === 0 && <span className="text-slate-600">Ejecuta el mediator para ver la coordinación…</span>}
                {log.map((l, i) => (
                    <div key={i} className={`${
                        l.startsWith("✅") ? "text-green-400"
                        : l.startsWith("1.") || l.startsWith("2.") || l.startsWith("3.") || l.startsWith("4.") ? "text-slate-300"
                        : l.startsWith("     ") ? "text-slate-500"
                        : l.startsWith("─") ? "text-slate-700"
                        : "text-pink-400"
                    }`}>{l}</div>
                ))}
            </OutputBox>
        </div>
    );
}

// ── Visitor ───────────────────────────────────────────────────
function VisitorTab() {
    const [visitor, setVisitor] = useState<"audit" | "tax" | "efficiency">("audit");
    const [report, setReport] = useState<string | null>(null);
    const [portfolio] = useState(createDemoPortfolio);

    const run = () => {
        if (visitor === "audit") {
            const v = new AuditReportVisitor();
            acceptVisitor(portfolio, v);
            setReport(v.generateReport());
        } else if (visitor === "tax") {
            const v = new TaxCalculationVisitor();
            acceptVisitor(portfolio, v);
            setReport(v.generateReport());
        } else {
            const v = new EfficiencyReportVisitor();
            acceptVisitor(portfolio, v);
            setReport(v.generateReport());
        }
    };

    const VISITORS = [
        { key: "audit",      label: "📋 Auditoría",   desc: "Cumplimiento por nodo" },
        { key: "tax",        label: "💸 Fiscal",       desc: "Carga tributaria por tipo" },
        { key: "efficiency", label: "📊 Eficiencia",   desc: "Pérdidas y rendimiento" },
    ] as const;

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">acceptVisitor(portfolio, visitor)</span> recorre el árbol
                Composite sin modificar <code className="bg-white/[0.06] px-1 rounded">EnergyDevice</code> ni <code className="bg-white/[0.06] px-1 rounded">EnergyGroup</code>.
            </p>
            <div className="grid grid-cols-3 gap-2">
                {VISITORS.map(v => (
                    <button key={v.key} onClick={() => setVisitor(v.key)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                            visitor === v.key
                                ? "border-teal-500/50 bg-teal-500/10"
                                : "border-white/[0.07] hover:border-white/20"
                        }`}>
                        <p className="text-sm text-white">{v.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{v.desc}</p>
                    </button>
                ))}
            </div>
            <button onClick={run} className="btn-primary flex items-center gap-2">
                <Eye size={13} /> Visitar árbol Composite
            </button>
            {report && (
                <OutputBox title="Reporte generado">
                    {report.split("\n").map((line, i) => (
                        <div key={i} className={
                            line.includes("✅") ? "text-green-400"
                            : line.includes("❌") ? "text-red-400"
                            : line.includes("🟢") ? "text-green-400"
                            : line.includes("🟡") ? "text-yellow-400"
                            : line.includes("🔴") ? "text-red-400"
                            : line.includes("⚫") ? "text-slate-500"
                            : line.includes("═") || line.includes("─") ? "text-slate-700"
                            : line.includes("TOTAL") || line.includes("FISCAL") ? "text-white font-bold"
                            : "text-slate-300"
                        }>{line || " "}</div>
                    ))}
                </OutputBox>
            )}
        </div>
    );
}

// ── Memento ───────────────────────────────────────────────────
function MementoTab() {
    const [book] = useState(() => new OrderBook(0.118));
    const [history] = useState(() => new OrderBookHistory(book, 5));
    const [snapshots, setSnapshots] = useState<{ label: string; orderCount: number; price: number }[]>([]);
    const [status, setStatus] = useState<string>("");
    const [log, setLog] = useState<string[]>([]);
    const [price, setPrice] = useState(0.118);

    const refresh = () => {
        setSnapshots(history.listSnapshots().map(s => ({
            label: s.label, orderCount: s.orderCount, price: s.marketPrice,
        })));
        setStatus(book.describe());
    };

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));

    const addOrder = () => {
        const o = new TradeOrderBuilder().ofType(Math.random() > 0.5 ? "BUY" : "SELL")
            .withAmount(Math.round(Math.random() * 20 + 5))
            .atPrice(parseFloat((Math.random() * 0.05 + 0.10).toFixed(4)))
            .fromSource(["SOLAR","WIND","BATTERY","GRID"][Math.floor(Math.random() * 4)] as never)
            .build();
        book.addOrder(o);
        addLog(`➕ Orden añadida: ${o.type} ${o.amountKwh} kWh @ $${o.pricePerKwh}`);
        refresh();
    };

    const takeSnap = () => {
        history.takeSnapshot(`snap-${history.getSnapshotCount() + 1}`);
        addLog(`📸 Snapshot guardado (${book.getOrderCount()} órdenes)`);
        refresh();
    };

    const clearAll = () => {
        book.clearAllOrders();
        addLog("🗑️  clearAllOrders() — libro vaciado");
        refresh();
    };

    const undo = () => {
        const ok = history.undo();
        addLog(ok ? `↩️  Undo — restaurado snapshot anterior` : "↩️  Sin snapshots para restaurar");
        refresh();
    };

    const setMktPrice = () => {
        book.setMarketPrice(price);
        addLog(`💱 Precio de mercado → $${price}/kWh`);
        refresh();
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">OrderBook</span> es el Originator.
                <span className="text-white font-semibold"> OrderBookHistory</span> es el Caretaker (máx. 5 snapshots).
                El Caretaker nunca inspecciona el estado interno del Memento.
            </p>

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
                <button onClick={addOrder} className="btn-secondary text-xs flex items-center gap-1.5"><Plus size={11} /> Añadir orden</button>
                <button onClick={clearAll} className="btn-secondary text-xs flex items-center gap-1.5"><Trash2 size={11} /> Vaciar libro</button>
                <button onClick={takeSnap} className="btn-primary text-xs flex items-center gap-1.5"><Camera size={11} /> Snapshot</button>
                <button onClick={undo} disabled={!history.canUndo()} className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-40">
                    <RotateCcw size={11} /> Undo
                </button>
                <div className="flex items-center gap-2 ml-auto">
                    <input type="number" step="0.001" value={price}
                        onChange={e => setPrice(parseFloat(e.target.value))}
                        className="input text-xs w-28 py-1.5" />
                    <button onClick={setMktPrice} className="btn-secondary text-xs">💱 Set precio</button>
                </div>
            </div>

            {/* Estado del libro */}
            {status && (
                <div className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300 whitespace-pre-line">
                    {status}
                </div>
            )}

            {/* Snapshots guardados */}
            {snapshots.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Snapshots ({snapshots.length}/5)</p>
                    <div className="flex gap-2 flex-wrap">
                        {snapshots.map((s, i) => (
                            <div key={i} className="px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[10px]">
                                <span className="text-orange-400 font-bold">{s.label}</span>
                                <span className="text-slate-500 ml-2">{s.orderCount} órdenes · ${s.price}/kWh</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <OutputBox title="Action Log">
                {log.length === 0 && <span className="text-slate-600">Interactúa con el libro para ver el log…</span>}
                {log.map((l, i) => (
                    <div key={i} className={
                        l.includes("Snapshot") || l.includes("📸") ? "text-orange-400"
                        : l.includes("Undo") || l.includes("↩️") ? "text-yellow-400"
                        : l.includes("Vaciad") || l.includes("🗑️") ? "text-red-400"
                        : "text-slate-300"
                    }>{l}</div>
                ))}
            </OutputBox>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
    strategy: StrategyTab,
    command:  CommandTab,
    observer: ObserverTab,
    state:    StateTab,
    template: TemplateTab,
    chain:    ChainTab,
    mediator: MediatorTab,
    visitor:  VisitorTab,
    memento:  MementoTab,
};

export default function PatternsPage() {
    const [activeTab, setActiveTab] = useState<TabId>("strategy");
    const ActiveComponent = TAB_COMPONENTS[activeTab];
    const activeTabInfo = TABS.find(t => t.id === activeTab)!;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Patrones de Comportamiento</h1>
                <p className="section-subtitle">
                    9 patrones GoF implementados — demos interactivos usando las clases reales de{" "}
                    <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-brand-300">src/lib/</code>
                </p>
            </div>

            {/* Tab bar */}
            <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                                isActive
                                    ? "bg-white/[0.08] text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
                            }`}
                            style={isActive ? { color: tab.color } : {}}
                        >
                            <Icon size={13} style={isActive ? { color: tab.color } : {}} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Active tab panel */}
            <div className="card animate-fade-in">
                {/* Panel header */}
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/[0.06]">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
                        style={{ background: `${activeTabInfo.color}18`, borderColor: `${activeTabInfo.color}30` }}>
                        <activeTabInfo.icon size={16} style={{ color: activeTabInfo.color }} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white">{activeTabInfo.label}</h2>
                        <p className="text-[10px] text-slate-600 uppercase tracking-widest">{activeTabInfo.pattern}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        <Tag text="Demo en vivo" color="bg-green-500/15 text-green-400" />
                        <Tag text="src/lib/" color="bg-white/[0.06] text-slate-400" />
                    </div>
                </div>

                {/* Demo content */}
                <ActiveComponent />
            </div>

            {/* Pattern overview grid */}
            <div className="grid grid-cols-3 gap-3">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:bg-white/[0.04] ${
                                activeTab === tab.id
                                    ? "border-white/20 bg-white/[0.04]"
                                    : "border-white/[0.05]"
                            }`}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${tab.color}18` }}>
                                <Icon size={13} style={{ color: tab.color }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{tab.label}</p>
                                <p className="text-[10px] text-slate-600 truncate">{tab.pattern}</p>
                            </div>
                            {activeTab === tab.id && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tab.color }} />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// _Strategy _Command _Observer _State _TemplateMethod _Chain _Mediator _Visitor _Memento
