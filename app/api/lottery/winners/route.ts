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

    // On ramène entry_id + display_name (via un join léger)
    const { data, error } = await db
      .from("lottery_winners")
      .select("entry_id, created_at, lottery_entries!inner(display_name)")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Normaliser la forme
    const winners = (data ?? []).map((w: any) => ({
      entry_id: w.entry_id,
      display_name: w.lottery_entries?.display_name ?? null,
      created_at: w.created_at,
    }));

    return NextResponse.json({ ok: true, winners });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
