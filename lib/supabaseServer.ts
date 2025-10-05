// lib/supabaseServer.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ATTENTION ENV:
 * - NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont OK côté serveur pour des opérations classiques sous RLS.
 * - SUPABASE_SERVICE_ROLE_KEY (sans NEXT_PUBLIC_) est requis pour les opérations admin (import CSV / upsert massif, bypass RLS).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

/** Client "serveur" standard (lectures/écritures si la politique RLS le permet) */
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
}

/** Client "admin" (clé service) — pour import/upsert catalogue, maintenance, etc. */
export function createAdminSupabaseClient(): SupabaseClient {
  if (!SUPABASE_SERVICE) {
    // fallback pour ne pas casser le build si la clé n'est pas encore en place
    return createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });
}

/**
 * Compatibilité ANCIEN CODE:
 * Plusieurs routes importent encore { sbServer } from "@/lib/supabaseServer".
 * On expose donc une fonction équivalente.
 */
export function sbServer(): SupabaseClient {
  return createServerSupabaseClient();
}
