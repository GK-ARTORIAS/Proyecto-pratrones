import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import LiveTicker from "@/components/layout/LiveTicker";

export const metadata: Metadata = {
    title: "EnergyTrade — Plataforma de Comercio de Energía",
    description:
        "Compra y vende excedentes de energía renovable. Subastas en tiempo real, integración IoT y predicción inteligente.",
    keywords: ["energía", "comercio", "solar", "eólica", "subastas", "IoT"],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" className="dark">
            <body className="bg-[#0f1117] text-white antialiased min-h-screen">
                <div className="flex h-screen overflow-hidden">
                    {/* Sidebar — navegación principal */}
                    <Sidebar />

                    {/* Área de contenido principal */}
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Topbar con usuario y notificaciones */}
                        <Topbar />

                        {/* Ticker de precios en tiempo real */}
                        <LiveTicker />

                        {/* Contenido de la página */}
                        <main className="flex-1 overflow-y-auto p-6 space-y-6">
                            {children}
                        </main>
                    </div>
                </div>
            </body>
        </html>
    );
}
