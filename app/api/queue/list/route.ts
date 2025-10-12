// app/api/queue/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("room_slug")?.trim();
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "MISSING_ROOM_SLUG" },
        { status: 400 }
      );
    }

    const db = createAdminSupabaseClient();

    // 1) Résoudre la salle
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (eRoom) {
      return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    }
    if (!room) {
      return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    // 2) Uniquement la file d'attente (status = 'waiting')
    const { data: reqs, error: eReq } = await db
      .from("requests")
      .select("id, title, artist, singer_id, created_at, status")
      .eq("room_id", room.id)
      .eq("status", "waiting")
      .order("created_at", { ascending: true });

    if (eReq) {
      return NextResponse.json({ ok: false, error: eReq.message }, { status: 500 });
    }

    // 3) Récupérer les noms affichés des chanteurs
    const singerIds = Array.from(
      new Set((reqs ?? []).map((r: any) => r.singer_id).filter(Boolean))
    ) as string[];

    let names = new Map<string, string>();
    if (singerIds.length) {
      const { data: singers, error: eS } = await db
        .from("singers")
        .select("id, display_name")
        .in("id", singerIds);

      if (eS) {
        return NextResponse.json({ ok: false, error: eS.message }, { status: 500 });
      }

      for (const s of singers ?? []) {
        names.set(String(s.id), String(s.display_name ?? ""));
      }
    }

    // 4) Normalisation de la réponse
    const items = (reqs ?? [])
      .filter((r: any) => r && r.title)
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        artist: r.artist ?? null,
        singer_id: r.singer_id ?? null,
        display_name: r.singer_id ? (names.get(String(r.singer_id)) ?? null) : null,
        created_at: r.created_at,
      }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "UNKNOWN" },
      { status: 500 }
    );
  }
}
