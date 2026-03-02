"use client";

import { Bell, Search, RefreshCw } from "lucide-react";

export default function Topbar() {
    return (
        <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-[#16181f] border-b border-white/[0.07]">
            {/* Búsqueda */}
            <div className="relative flex items-center w-72">
                <Search className="absolute left-3 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Buscar orden, subasta, dispositivo…"
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white/[0.04] border border-white/[0.07] rounded-xl text-slate-300 placeholder:text-slate-600 outline-none focus:border-brand-500/40 focus:bg-white/[0.07] transition-all"
                />
            </div>

            {/* Acciones derechas */}
            <div className="flex items-center gap-3">
                {/* Estado de la red */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <span className="status-dot status-dot-online" />
                    <span className="text-xs font-semibold text-green-400">Red activa</span>
                </div>

                {/* Refresh */}
                <button
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                    title="Actualizar datos"
                >
                    <RefreshCw size={16} />
                </button>

                {/* Notificaciones */}
                <button className="relative p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors">
                    <Bell size={16} />
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-500 border border-[#16181f]" />
                </button>

                {/* Fecha */}
                <div className="text-xs text-slate-500 font-medium">
                    {new Date().toLocaleDateString("es-ES", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                    })}
                </div>
            </div>
        </header>
    );
}
