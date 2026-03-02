/**
 * ============================================================
 * PATRÓN: SINGLETON — SupabaseClient
 * ============================================================
 * Crea y reutiliza una única instancia del cliente de Supabase.
 * Evita múltiples conexiones innecesarias en SSR y CSR de Next.js.
 *
 * Uso:
 *   import { getSupabaseClient } from '@/lib/supabase/supabaseClient';
 *   const supabase = getSupabaseClient();
 *   const { data } = await supabase.from('energy_orders').select('*');
 * ============================================================
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigManager } from "@/lib/config/ConfigManager";
import { Database } from "@/lib/supabase/database.types";

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Retorna la única instancia del cliente Supabase (Singleton funcional).
 * Compatible tanto con SSR (servidor) como CSR (cliente).
 */
export function getSupabaseClient(): SupabaseClient<Database> {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    const config = ConfigManager.getInstance();

    supabaseInstance = createClient<Database>(
        config.get("supabaseUrl"),
        config.get("supabaseAnonKey"),
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        }
    );

    console.info("[SupabaseClient] ✅ Singleton instance created");
    return supabaseInstance;
}

/**
 * Destruye la instancia (útil para tests y logout).
 */
export function resetSupabaseClient(): void {
    supabaseInstance = null;
}

// _Singleton
