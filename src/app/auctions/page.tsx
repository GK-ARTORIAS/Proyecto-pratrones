"use client";

import { useState, useEffect } from "react";
import { Gavel, Clock, Zap, TrendingUp, ChevronRight } from "lucide-react";

interface Auction {
    id: string;
    seller: string;
    amountKwh: number;
    startPrice: number;
    currentBid: number;
    endsAt: Date;
    bids: number;
    source: string;
}

const initialAuctions: Auction[] = [
    { id: "AUC-047", seller: "SolarFarm_01", amountKwh: 25.0, startPrice: 0.100, currentBid: 0.138, endsAt: new Date(Date.now() + 8 * 60000), bids: 7, source: "Solar" },
    { id: "AUC-046", seller: "WindUser_22", amountKwh: 12.5, startPrice: 0.090, currentBid: 0.112, endsAt: new Date(Date.now() + 22 * 60000), bids: 3, source: "Eólico" },
    { id: "AUC-045", seller: "BattUser_05", amountKwh: 8.0, startPrice: 0.110, currentBid: 0.125, endsAt: new Date(Date.now() + 45 * 60000), bids: 5, source: "Batería" },
];

function useCountdown(target: Date) {
    const [remaining, setRemaining] = useState("");
    useEffect(() => {
        const tick = () => {
            const diff = target.getTime() - Date.now();
            if (diff <= 0) { setRemaining("Finalizada"); return; }
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setRemaining(`${m}m ${String(s).padStart(2, "0")}s`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [target]);
    return remaining;
}

function AuctionCard({ auction }: { auction: Auction }) {
    const countdown = useCountdown(auction.endsAt);
    const urgency = auction.endsAt.getTime() - Date.now() < 10 * 60000;
    const [bid, setBid] = useState("");

    return (
        <div className={`card card-hover flex flex-col gap-5 animate-slide-up transition-all ${urgency ? "border-red-500/30 shadow-red-500/5 shadow-lg" : "border-white/[0.07]"}`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="badge badge-yellow">{auction.source}</span>
                        <span className="text-xs font-mono text-slate-500">{auction.id}</span>
                    </div>
                    <p className="text-sm text-slate-400">Vendedor: <span className="text-white font-medium">{auction.seller}</span></p>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${urgency ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-white/[0.04] text-slate-400 border border-white/[0.07]"}`}>
                    <Clock size={11} />
                    {countdown}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-0.5">Cantidad</p>
                    <p className="text-base font-bold text-white">{auction.amountKwh} kWh</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-0.5">Oferta actual</p>
                    <p className="text-base font-bold text-brand-400">{auction.currentBid.toFixed(3)} USD</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-0.5">Pujas</p>
                    <p className="text-base font-bold text-white">{auction.bids}</p>
                </div>
            </div>

            <div className="flex gap-3">
                <input
                    type="number"
                    placeholder={`Mín. ${(auction.currentBid + 0.001).toFixed(3)}`}
                    step="0.001"
                    className="input text-sm"
                    value={bid}
                    onChange={(e) => setBid(e.target.value)}
                />
                <button className="btn-primary shrink-0 flex items-center gap-1.5">
                    <Gavel size={14} />
                    Pujar
                </button>
            </div>
        </div>
    );
}

export default function AuctionsPage() {
    const [auctions] = useState(initialAuctions);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Subastas</h1>
                    <p className="section-subtitle">Sistema de subastas de energía en tiempo real</p>
                </div>
                <button className="btn-primary flex items-center gap-2">
                    <Gavel size={15} />
                    Crear subasta
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Subastas activas", value: "3", icon: Gavel, color: "#8b5cf6" },
                    { label: "Volumen en subasta", value: "45.5 kWh", icon: Zap, color: "#f59e0b" },
                    { label: "Precio promedio", value: "0.125 USD", icon: TrendingUp, color: "#22c55e" },
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

            {/* Header activas */}
            <div className="flex items-center justify-between">
                <h2 className="section-title">Subastas activas</h2>
                <button className="flex items-center gap-1 text-xs text-brand-400 font-semibold">
                    Ver historial <ChevronRight size={14} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {auctions.map((a) => <AuctionCard key={a.id} auction={a} />)}
            </div>
        </div>
    );
}
