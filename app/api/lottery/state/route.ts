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
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Count des inscrits éligibles (non gagnants)
    // On calcule via left join NOT EXISTS pour éviter les sous-requêtes multiples côté client.
    const { data: eligibles, error: eElig } = await db
      .from("lottery_entries")
      .select("entry_id")
      .eq("room_id", room.id);
    if (eElig) return NextResponse.json({ ok: false, error: eElig.message }, { status: 500 });

    const { data: alreadyWon, error: eWon } = await db
      .from("lottery_winners")
      .select("entry_id")
      .eq("room_id", room.id);
    if (eWon) return NextResponse.json({ ok: false, error: eWon.message }, { status: 500 });

    const wonSet = new Set((alreadyWon ?? []).map(w => w.entry_id as string));
    const entriesCount = (eligibles ?? []).filter(e => !wonSet.has(e.entry_id as string)).length;

    // Dernier gagnant (avec display_name)
    // On joint winners -> entries (l’entrée n’étant plus supprimée)
    const { data: last, error: eLast } = await db
      .from("lottery_winners")
      .select("created_at, entry_id, lottery_entries!inner(display_name, singer_id)")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (eLast) return NextResponse.json({ ok: false, error: eLast.message }, { status: 500 });

    let lastWinner: { singer_id: string; created_at: string; display_name?: string | null } | undefined = undefined;
    if (Array.isArray(last) && last.length > 0) {
      const w = last[0] as any;
      lastWinner = {
        singer_id: w?.lottery_entries?.singer_id ?? "",
        display_name: w?.lottery_entries?.display_name ?? null,
        created_at: w?.created_at,
      };
    }

    return NextResponse.json({ ok: true, entriesCount, lastWinner });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
