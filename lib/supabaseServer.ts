// lib/supabaseServer.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ⚙️ Variables d'environnement :
 * - NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY → OK côté serveur pour usage standard (RLS actif).
 * - SUPABASE_SERVICE_ROLE_KEY → réservé au serveur (non exposé au client) pour import/upsert massifs (bypass RLS).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Client serveur standard (lectures/écritures classiques sous RLS) */
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
}

/** Client admin (clé service) — utilisé pour import CSV / opérations sans RLS */
export function createAdminSupabaseClient(): SupabaseClient {
  if (!SUPABASE_SERVICE) {
    // Fallback si la clé service n’est pas définie
    return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });
}

/** 🔧 Compatibilité rétro : certaines routes appellent encore `sbServer.from(...)` */
export const sbServer: SupabaseClient = createServerSupabaseClient();
