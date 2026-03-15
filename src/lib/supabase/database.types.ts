/**
 * ============================================================
 * Supabase Database Types — Manual (sync con schema SQL v2)
 * Auto-generable con: npx supabase gen types typescript --project-id <id>
 * ============================================================
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type UserRole      = "PRODUCER" | "CONSUMER" | "ADMIN";
export type EnergySource  = "SOLAR" | "WIND" | "BATTERY" | "GRID" | "UNKNOWN";
export type OrderType     = "BUY" | "SELL";
export type OrderStatus   = "DRAFT" | "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
export type PricingMode   = "FIXED" | "DYNAMIC" | "BEST_AVAILABLE";
export type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type AuctionStatus = "ACTIVE" | "CLOSED" | "CANCELLED";
export type DeviceType    = "SOLAR_PANEL" | "WIND_TURBINE" | "SMART_METER" | "BATTERY_STORAGE";
export type DeviceProtocol = "MQTT" | "REST" | "SIMULATED";
export type DeviceStatus  = "ONLINE" | "OFFLINE" | "ERROR";
export type PriceTrend    = "UP" | "DOWN" | "STABLE";

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string;
                    full_name: string | null;
                    role: UserRole;
                    balance_kwh: number;
                    balance_usd: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    email: string;
                    full_name?: string | null;
                    role?: UserRole;
                    balance_kwh?: number;
                    balance_usd?: number;
                };
                Update: {
                    full_name?: string | null;
                    role?: UserRole;
                    balance_kwh?: number;
                    balance_usd?: number;
                    updated_at?: string;
                };
            };

            energy_orders: {
                Row: {
                    id: string;
                    user_id: string;
                    type: OrderType;
                    amount_kwh: number;
                    price_per_kwh: number;
                    energy_source: EnergySource;
                    pricing_mode: PricingMode;
                    priority: OrderPriority;
                    max_slippage_percent: number;
                    total_value_usd: number;
                    status: OrderStatus;
                    note: string | null;
                    expires_at: string | null;
                    conditions: Json;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    type: OrderType;
                    amount_kwh: number;
                    price_per_kwh: number;
                    energy_source?: EnergySource;
                    pricing_mode?: PricingMode;
                    priority?: OrderPriority;
                    max_slippage_percent?: number;
                    total_value_usd: number;
                    status?: OrderStatus;
                    note?: string | null;
                    expires_at?: string | null;
                    conditions?: Json;
                };
                Update: {
                    status?: OrderStatus;
                    price_per_kwh?: number;
                    note?: string | null;
                    updated_at?: string;
                };
            };

            auctions: {
                Row: {
                    id: string;
                    seller_id: string;
                    amount_kwh: number;
                    energy_source: EnergySource;
                    start_price: number;
                    current_bid: number;
                    current_bidder_id: string | null;
                    bid_count: number;
                    status: AuctionStatus;
                    ends_at: string;
                    created_at: string;
                };
                Insert: {
                    seller_id: string;
                    amount_kwh: number;
                    energy_source?: EnergySource;
                    start_price: number;
                    current_bid?: number;
                    ends_at: string;
                };
                Update: {
                    current_bid?: number;
                    current_bidder_id?: string | null;
                    bid_count?: number;
                    status?: AuctionStatus;
                };
            };

            auction_bids: {
                Row: {
                    id: string;
                    auction_id: string;
                    bidder_id: string;
                    amount: number;
                    created_at: string;
                };
                Insert: {
                    auction_id: string;
                    bidder_id: string;
                    amount: number;
                };
                Update: Record<string, never>;
            };

            iot_devices: {
                Row: {
                    id: string;
                    user_id: string;
                    name: string;
                    type: DeviceType;
                    protocol: DeviceProtocol;
                    status: DeviceStatus;
                    capacity_kw: number | null;
                    last_reading_kwh: number | null;
                    last_power_kw: number | null;
                    last_efficiency: number | null;
                    last_seen_at: string | null;
                    location: string | null;
                    created_at: string;
                };
                Insert: {
                    user_id: string;
                    name: string;
                    type: DeviceType;
                    protocol?: DeviceProtocol;
                    status?: DeviceStatus;
                    capacity_kw?: number | null;
                    location?: string | null;
                };
                Update: {
                    status?: DeviceStatus;
                    last_reading_kwh?: number | null;
                    last_power_kw?: number | null;
                    last_efficiency?: number | null;
                    last_seen_at?: string | null;
                };
            };

            iot_readings: {
                Row: {
                    id: number;
                    device_id: string;
                    power_kw: number;
                    energy_kwh: number;
                    efficiency: number | null;
                    status: DeviceStatus;
                    metadata: Json | null;
                    recorded_at: string;
                };
                Insert: {
                    device_id: string;
                    power_kw: number;
                    energy_kwh: number;
                    efficiency?: number | null;
                    status?: DeviceStatus;
                    metadata?: Json | null;
                };
                Update: Record<string, never>;
            };

            market_price_quotes: {
                Row: {
                    id: number;
                    source: EnergySource;
                    price_per_kwh: number;
                    valid_until_minutes: number;
                    trend: PriceTrend;
                    historical_avg: number | null;
                    recorded_at: string;
                };
                Insert: {
                    source: EnergySource;
                    price_per_kwh: number;
                    valid_until_minutes?: number;
                    trend?: PriceTrend;
                    historical_avg?: number | null;
                };
                Update: Record<string, never>;
            };

            energy_forecasts: {
                Row: {
                    id: string;
                    source: EnergySource;
                    forecast_date: string;
                    total_kwh: number;
                    confidence_score: number;
                    points: Json;
                    days_ahead: number;
                    created_at: string;
                };
                Insert: {
                    source: EnergySource;
                    forecast_date: string;
                    total_kwh: number;
                    confidence_score: number;
                    points: Json;
                    days_ahead?: number;
                };
                Update: Record<string, never>;
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: {
            user_role: UserRole;
            order_type: OrderType;
            order_status: OrderStatus;
            energy_source: EnergySource;
            pricing_mode: PricingMode;
            order_priority: OrderPriority;
            auction_status: AuctionStatus;
            device_type: DeviceType;
            device_protocol: DeviceProtocol;
            device_status: DeviceStatus;
            price_trend: PriceTrend;
        };
    };
}
