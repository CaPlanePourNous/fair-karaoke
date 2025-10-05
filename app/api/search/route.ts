// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    if (q.length < 2) {
      // Ancien comportement : rien si moins de 2 lettres
      return NextResponse.json([]);
    }

    const supabase = createServerSupabaseClient();

    // title ILIKE %q% OR artist ILIKE %q%
    const { data, error } = await supabase
      .from("songs")
      .select("karafun_id,title,artist,duration_seconds")
      .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
      .order("title", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[/api/search] supabase error:", error);
      return NextResponse.json([], { status: 200 });
    }

    const items = (data || []).map((r) => ({
      karafun_id: r.karafun_id,
      title: (r.title || "").trim(),
      artist: (r.artist || "").trim(),
      duration: r.duration_seconds ?? null,
      // Optionnel : lien KaraFun si tu le construis
      // url: r.karafun_id ? `https://www.karafun.fr/karaoke/${r.karafun_id}/` : undefined,
    }));

    return NextResponse.json(items, { status: 200 });
  } catch (e) {
    console.error("[/api/search] fatal:", e);
    return NextResponse.json([], { status: 200 });
  }
}
