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

    // Room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Candidat aléatoire : entries sans winner
    const { data: candidates, error: ePick } = await db
      .from("lottery_entries")
      .select("entry_id, display_name")
      .eq("room_id", room.id)
      .not("entry_id", "in", (
        await db.from("lottery_winners").select("entry_id").eq("room_id", room.id)
      ).data?.map(w => w.entry_id as string) ?? [])
      ;

    if (ePick) return NextResponse.json({ ok: false, error: ePick.message }, { status: 500 });

    const pool = Array.isArray(candidates) ? candidates : [];
    if (pool.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_AVAILABLE_ENTRIES" }, { status: 200 });
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];

    // Insérer le gagnant (déclenche Realtime)
    const { data: win, error: eIns } = await db
      .from("lottery_winners")
      .insert({ room_id: room.id, entry_id: chosen.entry_id })
      .select("entry_id, created_at")
      .single();
    if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      winner: {
        entry_id: win.entry_id,
        display_name: chosen.display_name ?? null,
        created_at: win.created_at,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
