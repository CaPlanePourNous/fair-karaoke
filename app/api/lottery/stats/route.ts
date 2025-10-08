import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("room_slug")?.trim();
    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();
    const { data: room, error: eRoom } = await db.from("rooms").select("id").eq("slug", slug).maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    const [{ count: cEntries }, { count: cWinners }] = await Promise.all([
      db.from("lottery_entries").select("*", { count: "exact", head: true }).eq("room_id", room.id),
      db.from("lottery_winners").select("*", { count: "exact", head: true }).eq("room_id", room.id),
    ]);

    return NextResponse.json({ ok: true, stats: { entries: cEntries ?? 0, winners: cWinners ?? 0 } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
