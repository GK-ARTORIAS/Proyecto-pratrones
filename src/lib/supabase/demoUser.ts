/**
 * Helper para operaciones Supabase mientras no hay Auth implementado.
 * En producción, reemplazar por: supabase.auth.getUser()
 *
 * Para que funcione sin auth, temporalmente se usa un UUID fijo de demo.
 * El RLS de Supabase debe desactivarse para esta tabla o añadir una policy
 * que permita inserts sin auth (solo para desarrollo).
 */

import { getSupabaseClient, getSupabaseAdmin } from "@/lib/supabase/supabaseClient";

// UUID fijo de demo — reemplaza con auth.getUser() cuando implementes login
export const DEMO_USER_ID    = "00000000-0000-0000-0000-000000000001";
export const DEMO_USER_EMAIL = "demo@energytrade.dev";

/**
 * Asegura que exista el perfil de demo en la tabla `profiles`.
 * Llama esto una vez al iniciar la app o en cada página principal.
 *
 * SELECT  → cliente tipado (getSupabaseClient)
 * INSERT  → cliente sin tipo (getSupabaseAdmin) — evita error 'never'
 */
export async function ensureDemoProfile(): Promise<void> {
  // SELECT: usamos el cliente tipado
  const { data } = await getSupabaseClient()
    .from("profiles")
    .select("id")
    .eq("id", DEMO_USER_ID)
    .maybeSingle();

  if (!data) {
    // INSERT: usamos el cliente sin tipo para evitar el error 'never'
    await getSupabaseAdmin().from("profiles").insert({
      id:        DEMO_USER_ID,
      email:     DEMO_USER_EMAIL,
      full_name: "Usuario Demo",
      role:      "PRODUCER",
    });
  }
}
