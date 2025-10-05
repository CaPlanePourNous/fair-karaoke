// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, sbServer } from "@/lib/supabaseServer";

/** Récupère un client supabase, quel que soit ton helper actuel */
function getClient() {
  try {
    if (typeof createServerSupabaseClient === "function") return createServerSupabaseClient();
  } catch {}
  // compat: certains anciens fichiers importent/exportent `sbServer` (client déjà instancié)
  if (sbServer) return sbServer as any;
  throw new Error("No Supabase client available from lib/supabaseServer");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

  // Ancien comportement : rien si moins de 2 lettres
  if (q.length < 2) return NextResponse.json([]);

  const supabase = getClient();

  // IMPORTANT: colonnes de ta table = karafun_id, title, artist
  const { data, error } = await supabase
    .from("songs")
    .select("karafun_id,title,artist")
    .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
    .order("title", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[/api/search] Supabase error:", error);
    // On renvoie un tableau vide pour ne pas casser le client
    return NextResponse.json([]);
  }

  // Le client Room attend un **tableau** direct
  return NextResponse.json(Array.isArray(data) ? data : []);
}
