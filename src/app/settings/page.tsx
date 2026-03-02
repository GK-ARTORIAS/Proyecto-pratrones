"use client";

import { Settings, Database, Server, Bell } from "lucide-react";

export default function SettingsPage() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Configuración</h1>
                <p className="section-subtitle">Ajustes de la plataforma y conexiones</p>
            </div>

            {/* Supabase connection status */}
            <div className="card border-brand-500/20 bg-brand-500/[0.03]">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                        <Database size={18} className="text-brand-400" />
                    </div>
                    <div className="flex-1">
                        <p className="font-semibold text-white mb-0.5">Supabase — Base de datos</p>
                        <p className="text-xs text-slate-400">Configura tu URL y anon key en el archivo <code className="bg-white/[0.06] px-1 py-0.5 rounded text-brand-300">.env.local</code> para activar la conexión real.</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block">SUPABASE_URL</label>
                                <input className="input text-xs" placeholder="https://xxxx.supabase.co" disabled />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1.5 block">ANON_KEY</label>
                                <input className="input text-xs" placeholder="eyJ..." type="password" disabled />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Servicios */}
            <div className="card">
                <h2 className="section-title mb-4">Microservicios (próximamente)</h2>
                <div className="space-y-3">
                    {[
                        { name: "Trading Service", url: "localhost:3002", status: "pendiente" },
                        { name: "Auction Service", url: "localhost:3003", status: "pendiente" },
                        { name: "IoT Service", url: "localhost:3004", status: "pendiente" },
                        { name: "Prediction Service", url: "localhost:3005", status: "pendiente" },
                    ].map((s) => (
                        <div key={s.name} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                            <Server size={16} className="text-slate-500 shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-white">{s.name}</p>
                                <p className="text-xs text-slate-500 font-mono">{s.url}</p>
                            </div>
                            <span className="badge badge-yellow">{s.status}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Notificaciones */}
            <div className="card">
                <div className="flex items-center gap-2 mb-4">
                    <Bell size={16} className="text-slate-400" />
                    <h2 className="section-title">Notificaciones</h2>
                </div>
                <div className="space-y-3">
                    {[
                        "Alertas de puja superada en subastas",
                        "Órdenes matcheadas",
                        "Dispositivos IoT desconectados",
                        "Predicción de excedente disponible",
                    ].map((item) => (
                        <label key={item} className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative w-9 h-5 rounded-full bg-brand-500/30 border border-brand-500/20 flex items-center group-hover:bg-brand-500/40 transition-colors">
                                <div className="absolute left-1 w-3 h-3 rounded-full bg-brand-400 shadow" />
                            </div>
                            <span className="text-sm text-slate-300">{item}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
