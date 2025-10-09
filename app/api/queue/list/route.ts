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

    // 1er essai : avec is_playing
    let reqs: any[] | null = null;
    let eReq: any = null;
    {
      const { data, error } = await db
        .from("requests")
        .select("id, title, artist, singer_id, created_at, is_playing")
        .eq("room_id", room.id)
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: true });
      reqs = data ?? null;
      eReq = error ?? null;
    }

    // Si la colonne is_playing n'existe pas, on retente sans elle
    if (eReq && typeof eReq.message === "string" && /column .*is_playing.* does not exist/i.test(eReq.message)) {
      const { data, error } = await db
        .from("requests")
        .select("id, title, artist, singer_id, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      reqs = (data ?? []).map((r: any) => ({ ...r, is_playing: false }));
      eReq = null;
    }

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500 });

    // Map singer_id → display_name
    const singerIds = Array.from(new Set((reqs ?? []).map((r: any) => r.singer_id).filter(Boolean)));
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
      .filter((r: any) => r && r.title) // ne montrer que les vraies demandes
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        artist: r.artist ?? null,
        singer_id: r.singer_id ?? null,
        display_name: r.singer_id ? names.get(r.singer_id as string) ?? null : null,
        created_at: r.created_at,
        is_playing: !!r.is_playing,
      }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
