import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { room_slug?: string; paused?: boolean };
    const slug = (body.room_slug || "").trim();
    const paused = !!body.paused;

    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();

    // Vérifie la salle
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room?.id) return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Met à jour le flag
    const { error: eUpd } = await db
      .from("rooms")
      .update({ requests_paused: paused })
      .eq("id", room.id);

    if (eUpd) return NextResponse.json({ ok: false, error: eUpd.message }, { status: 500 });

    return NextResponse.json({ ok: true, paused });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
