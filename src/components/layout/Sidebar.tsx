"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Zap,
    Gavel,
    Cpu,
    TrendingUp,
    Settings,
    LogOut,
    Activity,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Trading", href: "/trading", icon: Zap },
    { label: "Subastas", href: "/auctions", icon: Gavel },
    { label: "Dispositivos", href: "/iot", icon: Cpu },
    { label: "Predicción", href: "/predictions", icon: TrendingUp },
];

const bottomItems = [
    { label: "Configuración", href: "/settings", icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 shrink-0 flex flex-col h-full bg-[#16181f] border-r border-white/[0.07]">
            {/* Logo */}
            <div className="px-6 py-5 border-b border-white/[0.07]">
                <div className="flex items-center gap-3">
                    <div className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-brand-500/10 border border-brand-500/20">
                        <Activity className="w-5 h-5 text-brand-400" />
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-[#16181f]" />
                    </div>
                    <div>
                        <p className="font-bold text-sm text-white leading-tight">EnergyTrade</p>
                        <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                            Plataforma v1.0
                        </p>
                    </div>
                </div>
            </div>

            {/* Nav principal */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                    Menú
                </p>
                {navItems.map(({ label, href, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={clsx(
                                "nav-link",
                                isActive && "nav-link-active"
                            )}
                        >
                            <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
                            <span>{label}</span>
                            {isActive && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Usuario + bottom items */}
            <div className="px-3 py-4 border-t border-white/[0.07] space-y-1">
                {bottomItems.map(({ label, href, icon: Icon }) => (
                    <Link key={href} href={href} className="nav-link">
                        <Icon size={18} className="shrink-0" />
                        <span>{label}</span>
                    </Link>
                ))}

                {/* User card */}
                <div className="mt-3 flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white">
                        U
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">Usuario</p>
                        <p className="text-[10px] text-slate-500 truncate">Productor</p>
                    </div>
                    <button className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
