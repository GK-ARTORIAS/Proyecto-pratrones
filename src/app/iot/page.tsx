"use client";

import { useState, useEffect, useCallback } from "react";
import { Cpu, Wifi, WifiOff, RefreshCw, Plus, Sun, Wind, Battery, Gauge } from "lucide-react";
import {
    DeviceAdapterFactory,
    type IDeviceAdapter,
    type DeviceReading,
    type DeviceType,
} from "@/lib/iot/DeviceAdapterFactory";

// ── Configuración de dispositivos demo ─────────────────────
interface DeviceConfig {
    id: string;
    name: string;
    type: DeviceType;
    protocol: "MQTT" | "REST" | "SIMULATED";
    location: string;
}

const DEMO_DEVICES: DeviceConfig[] = [
    { id: "dev-001", name: "Panel Solar Principal", type: "SOLAR_PANEL", protocol: "SIMULATED", location: "Techo Norte" },
    { id: "dev-002", name: "Aerogenerador", type: "WIND_TURBINE", protocol: "SIMULATED", location: "Jardín" },
    { id: "dev-003", name: "Medidor Inteligente", type: "SMART_METER", protocol: "SIMULATED", location: "Tablero Eléctrico" },
    { id: "dev-004", name: "Batería de Reserva", type: "BATTERY_STORAGE", protocol: "SIMULATED", location: "Garaje" },
];

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

export default function IoTPage() {
    const [devices, setDevices] = useState<DeviceCard[]>(
        DEMO_DEVICES.map((d) => ({ config: d, adapter: null, reading: null, loading: true, error: null }))
    );

    // Inicializa los adaptadores usando el Factory Method
    const initAdapters = useCallback(async () => {
        const updated = await Promise.all(
            DEMO_DEVICES.map(async (config, idx) => {
                try {
                    // ── Factory Method: crea el adaptador correcto según el protocolo ──
                    const adapter = await DeviceAdapterFactory.create({
                        deviceId: config.id,
                        deviceType: config.type,
                        protocol: config.protocol,
                    });
                    const reading = await adapter.readData();
                    return { config, adapter, reading, loading: false, error: null };
                } catch (e) {
                    return {
                        config,
                        adapter: null,
                        reading: null,
                        loading: false,
                        error: String(e),
                    };
                }
            })
        );
        setDevices(updated);
    }, []);

    // Refresca todas las lecturas
    const refreshAll = useCallback(async () => {
        setDevices((prev) => prev.map((d) => ({ ...d, loading: true })));
        await initAdapters();
    }, [initAdapters]);

    useEffect(() => {
        initAdapters();
        // Auto-refresh cada 5 segundos (simula streaming IoT)
        const interval = setInterval(() => refreshAll(), 5000);
        return () => clearInterval(interval);
    }, [initAdapters, refreshAll]);

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
                        <span className="font-semibold text-slate-300">Factory Method</span>{" "}
                        — protocolo SIMULATED activo
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={refreshAll} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                    <button className="btn-primary flex items-center gap-2">
                        <Plus size={14} />
                        Agregar dispositivo
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card card-hover flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                        <Cpu size={18} className="text-green-400" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Dispositivos online</p>
                        <p className="text-base font-bold text-white">{devices.filter((d) => d.reading?.status === "ONLINE").length} / {devices.length}</p>
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

            {/* Dispositivos grid */}
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
                                        <p className="text-xs text-slate-500">{d.config.location}</p>
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
                                <span className="text-xs text-slate-600 font-mono">{d.config.id}</span>
                                <span className="text-xs text-slate-600">
                                    {d.reading
                                        ? new Date(d.reading.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Nota del patrón */}
            <div className="card border-brand-500/20 bg-brand-500/[0.04]">
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                        <Cpu size={14} className="text-brand-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-brand-300 mb-1">Factory Method — DeviceAdapterFactory</p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Cada dispositivo es creado usando{" "}
                            <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-brand-300">DeviceAdapterFactory.create()</code>,
                            que elige el adaptador correcto según el protocolo (MQTT, REST, SIMULATED).
                            En producción, los dispositivos físicos usarán los adaptadores MQTT o REST
                            sin cambiar ninguna lógica de la UI.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// _Factory Method
