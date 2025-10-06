// app/api/lottery/draw/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { room_slug } = (await req.json().catch(() => ({}))) as { room_slug?: string };
    const slug = (room_slug || "").trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "room_slug requis" }, { status: 400 });
    }

    const db = createAdminSupabaseClient();

    // 1) Résoudre la room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404 });

    // 2) Pool d'inscrits (de la room)
    const { data: entries, error: eEnt } = await db
      .from("lottery_entries")
      .select("id, display_name")
      .eq("room_id", room.id);
    if (eEnt) return NextResponse.json({ ok: false, error: eEnt.message }, { status: 500 });

    if (!entries || entries.length === 0) {
      return NextResponse.json({ ok: false, error: "Aucun inscrit pour cette salle." }, { status: 400 });
    }

    // 3) Tirage aléatoire
    const pick = entries[Math.floor(Math.random() * entries.length)];
    const display_name = (pick.display_name || "").trim() || null;

    // 4) INSERT winner (déclenche Realtime côté Room)
    const { data: win, error: eIns } = await db
      .from("lottery_winners")
      .insert({ entry_id: pick.id, room_id: room.id })
      .select("entry_id, created_at")
      .single();
    if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500 });

    // 5) On retire l'inscription pour éviter un re-tirage immédiat
    const { error: eDel } = await db
      .from("lottery_entries")
      .delete()
      .eq("id", pick.id);
    if (eDel) {
      // Non bloquant : on loggue mais on renvoie tout de même le gagnant
      console.warn("delete lottery_entry failed:", eDel.message);
    }

    return NextResponse.json({
      ok: true,
      winner: { entry_id: win.entry_id, display_name, created_at: win.created_at },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
