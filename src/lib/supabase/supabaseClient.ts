/**
 * ============================================================
 * PATRÓN: SINGLETON — SupabaseClient
 * ============================================================
 * Crea y reutiliza una única instancia del cliente de Supabase.
 * Lee las variables de entorno directamente desde process.env
 * para garantizar compatibilidad con Next.js.
 *
 * Uso:
 *   import { getSupabaseClient } from '@/lib/supabase/supabaseClient';
 *   const supabase = getSupabaseClient();
 *   const { data } = await supabase.from('energy_orders').select('*');
 * ============================================================
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/database.types";

// ── Leer credenciales directamente de process.env ────────────
// Se leen en el momento de usar la función, NO al importar el módulo,
// para que Next.js tenga tiempo de inyectar las variables.
function getCredentials() {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || url.startsWith("MISSING") || url.trim() === "") {
        throw new Error(
            "[SupabaseClient] NEXT_PUBLIC_SUPABASE_URL no está definida.\n" +
            "Verifica tu archivo .env.local en la raíz del proyecto."
        );
    }
    if (!key || key.startsWith("MISSING") || key.trim() === "") {
        throw new Error(
            "[SupabaseClient] NEXT_PUBLIC_SUPABASE_ANON_KEY no está definida.\n" +
            "Verifica tu archivo .env.local en la raíz del proyecto."
        );
    }
    return { url, key };
}

// ── Singleton — cliente tipado (para SELECT) ─────────────────
let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Retorna la única instancia del cliente Supabase (Singleton funcional).
 * Usar para operaciones SELECT.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
    if (supabaseInstance) return supabaseInstance;

    const { url, key } = getCredentials();

    supabaseInstance = createClient<Database>(url, key, {
        auth: {
            persistSession:    true,
            autoRefreshToken:  true,
            detectSessionInUrl: true,
        },
        realtime: {
            params: { eventsPerSecond: 10 },
        },
    });

    console.info("[SupabaseClient] ✅ Singleton creado —", url.slice(0, 30) + "…");
    return supabaseInstance;
}

/**
 * Cliente sin tipado fuerte — usar para INSERT / UPDATE / DELETE.
 * Evita errores de tipo 'never' que genera el cliente tipado en operaciones DML.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseAdmin(): ReturnType<typeof createClient<any>> {
    const { url, key } = getCredentials();
    return createClient(url, key);
}

/**
 * Destruye la instancia tipada (útil para tests y logout).
 */
export function resetSupabaseClient(): void {
    supabaseInstance = null;
}

// _Singleton
