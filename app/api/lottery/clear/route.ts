import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { room_slug } = (await req.json().catch(() => ({}))) as { room_slug?: string };
    const slug = (room_slug || "").trim();
    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();
    const { data: room, error: eRoom } = await db.from("rooms").select("id").eq("slug", slug).maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Supprimer d'abord winners (FK), puis entries
    const [{ error: eW }, { error: eE }] = await Promise.all([
      db.from("lottery_winners").delete().eq("room_id", room.id),
      db.from("lottery_entries").delete().eq("room_id", room.id),
    ]);
    if (eW) return NextResponse.json({ ok: false, error: eW.message }, { status: 500 });
    if (eE) return NextResponse.json({ ok: false, error: eE.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
