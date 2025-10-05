// lib/supabaseServer.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ⚠️ Ne jamais exposer la clé service côté client.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

// --- Client classique (utilisé côté serveur pour requêtes sécurisées) ---
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "fair-karaoke/server" } },
  });
}

// --- Client administrateur (pour import catalogue, maintenance, etc.) ---
export function createAdminSupabaseClient(): SupabaseClient {
  if (!SUPABASE_SERVICE) {
    console.warn("[supabaseServer] Clé service manquante, utilisation du client anonyme");
    return createServerSupabaseClient();
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "fair-karaoke/admin" } },
  });
}
