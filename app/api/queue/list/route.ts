import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("room_slug")?.trim();
    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();

    // Room
    const { data: room, error: eRoom } = await db
      .from("rooms").select("id").eq("slug", slug).maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // On reste GENERIQUE: on suppose dans requests:
    // id, title, artist, singer_id, created_at, played (bool), is_playing (bool)
    // Si tes noms diffèrent, dis-le moi et je patcherai.
    const { data: reqs, error: eReq } = await db
      .from("requests")
      .select("id, title, artist, singer_id, created_at, played, is_playing")
      .eq("room_id", room.id)
      // On montre la file: non lus d'abord (is_playing true en tête), puis ancien → récent
      .order("is_playing", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: true, nullsFirst: false })
      .limit(50);
    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500 });

    // Map singer_id → display_name
    const singerIds = Array.from(new Set((reqs ?? []).map(r => r.singer_id).filter(Boolean)));
    let names = new Map<string,string>();
    if (singerIds.length) {
      const { data: singers, error: eS } = await db
        .from("singers")
        .select("id, display_name")
        .in("id", singerIds as string[]);
      if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 500 });
      for (const s of singers ?? []) names.set(s.id as string, s.display_name as string);
    }

    const items = (reqs ?? [])
      .filter(r => r && r.title) // on ne montre que les vraies demandes
      .map(r => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        singer_id: r.singer_id,
        display_name: names.get(r.singer_id as string) ?? null,
        created_at: r.created_at,
        is_playing: !!r.is_playing,
        played: !!r.played,
      }))
      // on ne veut pas afficher les déjà jouées dans la file
      .filter(r => !r.played);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
