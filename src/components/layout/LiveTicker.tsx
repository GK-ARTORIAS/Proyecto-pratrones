"use client";

// Ticker de precios en tiempo real (simulado en v1)
const tickers = [
    { label: "Solar kWh", price: "0.124 USD", change: "+2.1%", up: true },
    { label: "Eólico kWh", price: "0.098 USD", change: "-0.5%", up: false },
    { label: "Red kWh", price: "0.182 USD", change: "+0.8%", up: true },
    { label: "Batería kWh", price: "0.141 USD", change: "+1.3%", up: true },
    { label: "Subasta #47", price: "0.155 USD", change: "+4.2%", up: true },
    { label: "Solar kWh", price: "0.124 USD", change: "+2.1%", up: true },
    { label: "Eólico kWh", price: "0.098 USD", change: "-0.5%", up: false },
    { label: "Red kWh", price: "0.182 USD", change: "+0.8%", up: true },
    { label: "Batería kWh", price: "0.141 USD", change: "+1.3%", up: true },
    { label: "Subasta #47", price: "0.155 USD", change: "+4.2%", up: true },
];

export default function LiveTicker() {
    return (
        <div className="h-9 bg-[#16181f] border-b border-white/[0.07] overflow-hidden flex items-center">
            <div className="px-4 h-full flex items-center shrink-0 border-r border-white/[0.07] bg-brand-500/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
                    EN VIVO
                </span>
            </div>
            <div className="flex-1 overflow-hidden">
                <div className="ticker-track">
                    {tickers.concat(tickers).map((t, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 px-6 shrink-0 border-r border-white/[0.04]"
                        >
                            <span className="text-xs text-slate-500">{t.label}</span>
                            <span className="text-xs font-mono font-semibold text-white">
                                {t.price}
                            </span>
                            <span
                                className={`text-[11px] font-semibold ${t.up ? "text-green-400" : "text-red-400"
                                    }`}
                            >
                                {t.change}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
