import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("room_slug")?.trim();
    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();

    // 1) Room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // 2) Entries & Winners → compute entriesCount (éligibles)
    const [{ data: entries, error: eEnt }, { data: wins, error: eWins }] = await Promise.all([
      db.from("lottery_entries").select("entry_id").eq("room_id", room.id),
      db.from("lottery_winners").select("entry_id, created_at").eq("room_id", room.id),
    ]);
    if (eEnt)  return NextResponse.json({ ok: false, error: eEnt.message }, { status: 500 });
    if (eWins) return NextResponse.json({ ok: false, error: eWins.message }, { status: 500 });

    const wonSet = new Set((wins ?? []).map(w => w.entry_id as string));
    const entriesCount = (entries ?? []).filter(e => !wonSet.has(e.entry_id as string)).length;

    // 3) Last winner (2 requêtes, pas d’embed ambigu)
    let lastWinner: { singer_id: string; display_name?: string | null; created_at: string } | undefined = undefined;

    // trouver le dernier winner (par date)
    const last = (wins ?? []).toSorted((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (last) {
      const { data: le, error: eLE } = await db
        .from("lottery_entries")
        .select("singer_id, display_name")
        .eq("entry_id", last.entry_id)
        .maybeSingle();
      if (eLE) return NextResponse.json({ ok: false, error: eLE.message }, { status: 500 });

      lastWinner = {
        singer_id: (le?.singer_id as string) || "",
        display_name: le?.display_name ?? null,
        created_at: last.created_at as string,
      };
    }

    return NextResponse.json({ ok: true, entriesCount, lastWinner });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
