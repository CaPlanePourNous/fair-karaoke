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

    // 1) Room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // 2) Récupérer entries & winners (on filtre côté serveur)
    const [{ data: entries, error: eEnt }, { data: wins, error: eWins }] = await Promise.all([
      // ⚠️ on prend aussi singer_id ici
      db.from("lottery_entries").select("entry_id, display_name, singer_id").eq("room_id", room.id),
      db.from("lottery_winners").select("entry_id").eq("room_id", room.id),
    ]);
    if (eEnt)  return NextResponse.json({ ok: false, error: eEnt.message }, { status: 500 });
    if (eWins) return NextResponse.json({ ok: false, error: eWins.message }, { status: 500 });

    const wonSet = new Set((wins ?? []).map(w => w.entry_id as string));
    const pool = (entries ?? []).filter(e => !wonSet.has(e.entry_id as string));

    if (pool.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_AVAILABLE_ENTRIES" }, { status: 200 });
    }

    // 3) Tirage aléatoire
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    // filet de sécu si jamais singer_id manquait côté entries
    if (!chosen?.singer_id) {
      // relit l'entrée pour assurer singer_id
      const { data: le, error: eLE } = await db
        .from("lottery_entries")
        .select("singer_id, display_name")
        .eq("entry_id", chosen.entry_id)
        .maybeSingle();
      if (eLE) return NextResponse.json({ ok: false, error: eLE.message }, { status: 500 });
      chosen.singer_id = le?.singer_id;
      chosen.display_name = chosen.display_name ?? le?.display_name ?? null;
      if (!chosen.singer_id) {
        return NextResponse.json({ ok: false, error: "MISSING_SINGER_ID_FOR_WINNER" }, { status: 500 });
      }
    }

    // 4) INSERT winner (→ NOT NULL singer_id respecté)
    const { data: win, error: eIns } = await db
      .from("lottery_winners")
      .insert({
        room_id: room.id,
        entry_id: chosen.entry_id,
        singer_id: chosen.singer_id,   // ✅ important
      })
      .select("entry_id, drawn_at")
      .single();
    if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500 });

    // 5) Réponse attendue par le Host (created_at = drawn_at)
    return NextResponse.json({
      ok: true,
      winner: {
        entry_id: win.entry_id,
        display_name: chosen.display_name ?? null,
        created_at: win.drawn_at,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
