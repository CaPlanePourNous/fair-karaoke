// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("songs")
    .select("karafun_id, title, artist")
    .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
    .limit(20);

  if (error) {
    console.error("[/api/search] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
