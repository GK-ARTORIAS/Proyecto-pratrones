/**
 * ============================================================
 * Supabase Database Types — Auto-generables con CLI:
 *   npx supabase gen types typescript --project-id <id> > database.types.ts
 *
 * Por ahora se definen manualmente las tablas del dominio.
 * ============================================================
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string;
                    full_name: string | null;
                    role: "PRODUCER" | "CONSUMER" | "ADMIN";
                    balance_kwh: number;
                    balance_usd: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    email: string;
                    full_name?: string | null;
                    role?: "PRODUCER" | "CONSUMER" | "ADMIN";
                    balance_kwh?: number;
                    balance_usd?: number;
                };
                Update: {
                    full_name?: string | null;
                    role?: "PRODUCER" | "CONSUMER" | "ADMIN";
                    balance_kwh?: number;
                    balance_usd?: number;
                    updated_at?: string;
                };
            };
            energy_orders: {
                Row: {
                    id: string;
                    user_id: string;
                    type: "BUY" | "SELL";
                    amount_kwh: number;
                    price_per_kwh: number;
                    status: "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
                    energy_source: "SOLAR" | "WIND" | "GRID" | "BATTERY" | "UNKNOWN";
                    created_at: string;
                    expires_at: string | null;
                };
                Insert: {
                    user_id: string;
                    type: "BUY" | "SELL";
                    amount_kwh: number;
                    price_per_kwh: number;
                    energy_source?: "SOLAR" | "WIND" | "GRID" | "BATTERY" | "UNKNOWN";
                    expires_at?: string | null;
                };
                Update: {
                    status?: "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
                    price_per_kwh?: number;
                };
            };
            auctions: {
                Row: {
                    id: string;
                    seller_id: string;
                    amount_kwh: number;
                    start_price: number;
                    current_bid: number;
                    current_bidder_id: string | null;
                    status: "ACTIVE" | "CLOSED" | "CANCELLED";
                    ends_at: string;
                    created_at: string;
                };
                Insert: {
                    seller_id: string;
                    amount_kwh: number;
                    start_price: number;
                    ends_at: string;
                };
                Update: {
                    current_bid?: number;
                    current_bidder_id?: string | null;
                    status?: "ACTIVE" | "CLOSED" | "CANCELLED";
                };
            };
            iot_devices: {
                Row: {
                    id: string;
                    user_id: string;
                    name: string;
                    type: "SOLAR_PANEL" | "WIND_TURBINE" | "SMART_METER" | "BATTERY_STORAGE";
                    protocol: "MQTT" | "REST" | "SIMULATED";
                    status: "ONLINE" | "OFFLINE" | "ERROR";
                    last_reading_kwh: number | null;
                    last_seen_at: string | null;
                    created_at: string;
                };
                Insert: {
                    user_id: string;
                    name: string;
                    type: "SOLAR_PANEL" | "WIND_TURBINE" | "SMART_METER" | "BATTERY_STORAGE";
                    protocol?: "MQTT" | "REST" | "SIMULATED";
                };
                Update: {
                    status?: "ONLINE" | "OFFLINE" | "ERROR";
                    last_reading_kwh?: number | null;
                    last_seen_at?: string | null;
                };
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: {
            user_role: "PRODUCER" | "CONSUMER" | "ADMIN";
            order_type: "BUY" | "SELL";
            order_status: "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
            energy_source: "SOLAR" | "WIND" | "GRID" | "BATTERY" | "UNKNOWN";
            auction_status: "ACTIVE" | "CLOSED" | "CANCELLED";
            device_type: "SOLAR_PANEL" | "WIND_TURBINE" | "SMART_METER" | "BATTERY_STORAGE";
            device_protocol: "MQTT" | "REST" | "SIMULATED";
            device_status: "ONLINE" | "OFFLINE" | "ERROR";
        };
    };
}
