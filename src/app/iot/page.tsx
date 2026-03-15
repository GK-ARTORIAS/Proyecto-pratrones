"use client";

import { useState, useEffect, useCallback } from "react";
import { Cpu, Wifi, WifiOff, RefreshCw, Plus, Sun, Wind, Battery, Gauge, X, Loader2 } from "lucide-react";
import {
    DeviceAdapterFactory,
    type IDeviceAdapter,
    type DeviceReading,
    type DeviceType,
} from "@/lib/iot/DeviceAdapterFactory";
import { getSupabaseClient, getSupabaseAdmin } from "@/lib/supabase/supabaseClient";
import { DEMO_USER_ID, ensureDemoProfile } from "@/lib/supabase/demoUser";

// ── Tipos ────────────────────────────────────────────────────
interface DeviceConfig {
    id: string;
    name: string;
    type: DeviceType;
    protocol: "MQTT" | "REST" | "SIMULATED";
    location: string;
}

const deviceIcons: Record<DeviceType, React.ElementType> = {
    SOLAR_PANEL: Sun,
    WIND_TURBINE: Wind,
    SMART_METER: Gauge,
    BATTERY_STORAGE: Battery,
};

const deviceColors: Record<DeviceType, string> = {
    SOLAR_PANEL: "#f59e0b",
    WIND_TURBINE: "#3b82f6",
    SMART_METER: "#8b5cf6",
    BATTERY_STORAGE: "#10b981",
};

interface DeviceCard {
    config: DeviceConfig;
    adapter: IDeviceAdapter | null;
    reading: DeviceReading | null;
    loading: boolean;
    error: string | null;
}

// Formulario del modal
interface DeviceForm {
    name: string;
    type: DeviceType;
    protocol: "MQTT" | "REST" | "SIMULATED";
    location: string;
}

const DEFAULT_FORM: DeviceForm = {
    name: "",
    type: "SOLAR_PANEL",
    protocol: "SIMULATED",
    location: "",
};

// ── Componente principal ─────────────────────────────────────
export default function IoTPage() {
    const [dbDevices, setDbDevices]     = useState<DeviceConfig[]>([]);
    const [devices, setDevices]         = useState<DeviceCard[]>([]);
    const [showModal, setShowModal]     = useState(false);
    const [form, setForm]               = useState<DeviceForm>(DEFAULT_FORM);
    const [saving, setSaving]           = useState(false);
    const [saveError, setSaveError]     = useState<string | null>(null);
    const [dbError, setDbError]         = useState<string | null>(null);

    // ── Cargar dispositivos desde Supabase ───────────────────
    const loadDevicesFromDB = useCallback(async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from("iot_devices")
            .select("id, name, type, protocol, location")
            .order("created_at", { ascending: false });

        if (error) {
            setDbError(`Supabase: ${error.message}`);
            return [];
        }

        const configs: DeviceConfig[] = (data as any[] ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type as DeviceType,
            protocol: (d.protocol ?? "SIMULATED") as "MQTT" | "REST" | "SIMULATED",
            location: (d.location ?? "") as string,
        }));
        setDbDevices(configs);
        return configs;
    }, []);

    // ── Inicializar adaptadores IoT para la lista de configs ─
    const initAdapters = useCallback(async (configs: DeviceConfig[]) => {
        if (configs.length === 0) { setDevices([]); return; }

        setDevices(configs.map((c) => ({ config: c, adapter: null, reading: null, loading: true, error: null })));

        const updated = await Promise.all(
            configs.map(async (config) => {
                try {
                    const adapter = await DeviceAdapterFactory.create({
                        deviceId: config.id,
                        deviceType: config.type,
                        protocol: config.protocol,
                    });
                    const reading = await adapter.readData();
                    // Actualizar last_reading en Supabase
                    const supabase = getSupabaseAdmin();
                    await supabase
                        .from("iot_devices")
                        .update({ last_reading_kwh: reading.energyKwh, last_seen_at: new Date().toISOString(), status: "ONLINE" })
                        .eq("id", config.id);
                    return { config, adapter, reading, loading: false, error: null };
                } catch (e) {
                    return { config, adapter: null, reading: null, loading: false, error: String(e) };
                }
            })
        );
        setDevices(updated);
    }, []);

    // ── Refrescar lecturas ────────────────────────────────────
    const refreshAll = useCallback(async () => {
        const configs = await loadDevicesFromDB();
        await initAdapters(configs);
    }, [loadDevicesFromDB, initAdapters]);

    // ── Carga inicial ─────────────────────────────────────────
    useEffect(() => {
        ensureDemoProfile().then(() => loadDevicesFromDB().then(initAdapters));
        const interval = setInterval(() => {
            loadDevicesFromDB().then(initAdapters);
        }, 8000);
        return () => clearInterval(interval);
    }, [loadDevicesFromDB, initAdapters]);

    // ── Guardar nuevo dispositivo en Supabase ─────────────────
    const handleAddDevice = async () => {
        if (!form.name.trim()) { setSaveError("El nombre es requerido"); return; }
        setSaving(true);
        setSaveError(null);

        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from("iot_devices").insert({
            user_id: DEMO_USER_ID,
            name: form.name.trim(),
            type: form.type,
            protocol: form.protocol,
        });

        if (error) {
            setSaveError(`Error al guardar: ${error.message}`);
            setSaving(false);
            return;
        }

        setSaving(false);
        setShowModal(false);
        setForm(DEFAULT_FORM);
        // Recargar lista
        const configs = await loadDevicesFromDB();
        await initAdapters(configs);
    };

    // ── Stats ─────────────────────────────────────────────────
    const totalProduccion = devices
        .filter((d) => d.config.type !== "SMART_METER")
        .reduce((sum, d) => sum + (d.reading?.powerKw ?? 0), 0);
    const consumo = devices.find((d) => d.config.type === "SMART_METER")?.reading?.powerKw ?? 0;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Dispositivos IoT</h1>
                    <p className="section-subtitle">
                        Integración via{" "}
                        <span className="font-semibold text-slate-300">Factory Method</span>
                        {" "}— {devices.length} dispositivos
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={refreshAll} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                    <button onClick={() => { setShowModal(true); setSaveError(null); }} className="btn-primary flex items-center gap-2">
                        <Plus size={14} />
                        Agregar dispositivo
                    </button>
                </div>
            </div>

            {/* Error DB */}
            {dbError && (
                <div className="card border-red-500/20 bg-red-500/[0.04]">
                    <p className="text-xs text-red-400">{dbError}</p>
                </div>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card card-hover flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                        <Cpu size={18} className="text-green-400" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Dispositivos online</p>
                        <p className="text-base font-bold text-white">
                            {devices.filter((d) => d.reading?.status === "ONLINE").length} / {devices.length}
                        </p>
                    </div>
                </div>
                <div className="card card-hover flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                        <Sun size={18} className="text-yellow-400" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Producción total</p>
                        <p className="text-base font-bold text-white">{totalProduccion.toFixed(2)} kW</p>
                    </div>
                </div>
                <div className="card card-hover flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Gauge size={18} className="text-blue-400" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Consumo actual</p>
                        <p className="text-base font-bold text-white">{consumo.toFixed(2)} kW</p>
                    </div>
                </div>
            </div>

            {/* Estado vacío */}
            {devices.length === 0 && !dbError && (
                <div className="card flex flex-col items-center justify-center py-16 gap-4">
                    <Cpu size={40} className="text-slate-600" />
                    <p className="text-slate-400 text-sm font-medium">No hay dispositivos registrados</p>
                    <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
                        <Plus size={14} /> Agregar primer dispositivo
                    </button>
                </div>
            )}

            {/* Grid de dispositivos */}
            {devices.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                    {devices.map((d) => {
                        const Icon = deviceIcons[d.config.type];
                        const color = deviceColors[d.config.type];
                        const isOnline = d.reading?.status === "ONLINE";
                        return (
                            <div key={d.config.id} className="card card-hover animate-slide-up">
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                                            style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                                            <Icon size={20} style={{ color }} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-white">{d.config.name}</p>
                                            <p className="text-xs text-slate-500">{d.config.location || d.config.type}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <div className="flex items-center gap-1.5">
                                            {isOnline
                                                ? <Wifi size={13} className="text-green-400" />
                                                : <WifiOff size={13} className="text-slate-500" />}
                                            <span className={`text-xs font-semibold ${isOnline ? "text-green-400" : "text-slate-500"}`}>
                                                {d.reading?.status ?? "—"}
                                            </span>
                                        </div>
                                        <span className="badge badge-purple text-[10px]">{d.config.protocol}</span>
                                    </div>
                                </div>

                                {d.loading ? (
                                    <div className="h-20 shimmer rounded-xl" />
                                ) : d.error ? (
                                    <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{d.error}</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white/[0.03] rounded-xl p-3">
                                            <p className="text-xs text-slate-500 mb-0.5">Potencia</p>
                                            <p className="text-lg font-extrabold text-white">
                                                {d.reading?.powerKw.toFixed(2)}
                                                <span className="text-xs font-normal text-slate-500 ml-1">kW</span>
                                            </p>
                                        </div>
                                        <div className="bg-white/[0.03] rounded-xl p-3">
                                            <p className="text-xs text-slate-500 mb-0.5">Energía acum.</p>
                                            <p className="text-lg font-extrabold text-white">
                                                {d.reading?.energyKwh.toFixed(1)}
                                                <span className="text-xs font-normal text-slate-500 ml-1">kWh</span>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between">
                                    <span className="text-xs text-slate-600 font-mono">{d.config.id.slice(0, 18)}…</span>
                                    <span className="text-xs text-slate-600">
                                        {d.reading ? new Date(d.reading.timestamp).toLocaleTimeString("es-ES") : "—"}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal: Agregar dispositivo ────────────────── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[#16181f] border border-white/[0.08] rounded-2xl p-6 shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <Cpu size={16} className="text-brand-400" />
                                <h2 className="text-base font-bold text-white">Nuevo dispositivo IoT</h2>
                            </div>
                            <button onClick={() => setShowModal(false)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Nombre *</label>
                                <input
                                    type="text"
                                    placeholder="ej. Panel Solar Terraza"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="input"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Tipo</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value as DeviceType })}
                                    className="input"
                                >
                                    <option value="SOLAR_PANEL">☀️ Panel Solar</option>
                                    <option value="WIND_TURBINE">💨 Aerogenerador</option>
                                    <option value="SMART_METER">⚡ Medidor Inteligente</option>
                                    <option value="BATTERY_STORAGE">🔋 Batería</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Protocolo</label>
                                <select
                                    value={form.protocol}
                                    onChange={(e) => setForm({ ...form, protocol: e.target.value as DeviceForm["protocol"] })}
                                    className="input"
                                >
                                    <option value="SIMULATED">🧪 Simulado (desarrollo)</option>
                                    <option value="MQTT">📡 MQTT (dispositivo físico)</option>
                                    <option value="REST">🌐 REST (API HTTP)</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Ubicación (opcional)</label>
                                <input
                                    type="text"
                                    placeholder="ej. Techo Norte"
                                    value={form.location}
                                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                                    className="input"
                                />
                            </div>
                        </div>

                        {saveError && (
                            <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {saveError}
                            </p>
                        )}

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleAddDevice}
                                disabled={saving}
                                className="btn-primary flex items-center gap-2 flex-1 justify-center"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                {saving ? "Guardando…" : "Guardar en Supabase"}
                            </button>
                            <button onClick={() => { setShowModal(false); setSaveError(null); }} className="btn-secondary">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Nota del patrón */}
            <div className="card border-brand-500/20 bg-brand-500/[0.04]">
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                        <Cpu size={14} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-brand-300 mb-1">Factory Method — DeviceAdapterFactory</p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Cada dispositivo usa{" "}
                            <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-brand-300">DeviceAdapterFactory.create()</code>
                            {" "}para elegir el adaptador según el protocolo. Los dispositivos se persisten en Supabase
                            y sus lecturas se actualizan en tiempo real.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// _Factory Method
