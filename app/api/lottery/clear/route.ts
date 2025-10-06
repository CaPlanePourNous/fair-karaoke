// app/api/lottery/clear/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supprime le gagnant lié à une entry (et optionnellement restreint à une room).
 * Body: { entry_id: string, room_slug?: string }
 * Réponse: { ok: true, deleted: number } | { ok: false, error }
 */
export async function POST(req: NextRequest) {
  try {
    const { entry_id, room_slug } = (await req.json().catch(() => ({}))) as {
      entry_id?: string;
      room_slug?: string;
    };

    const id = (entry_id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "entry_id manquant" },
        { status: 400 }
      );
    }

    const db = createAdminSupabaseClient();

    // Si on fournit room_slug, on restreint la suppression à cette room
    let query = db.from("lottery_winners").delete().eq("entry_id", id);

    if (room_slug && room_slug.trim()) {
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", room_slug.trim())
        .maybeSingle();
      if (eRoom)
        return NextResponse.json(
          { ok: false, error: eRoom.message },
          { status: 500 }
        );
      if (!room)
        return NextResponse.json(
          { ok: false, error: "Room inconnue" },
          { status: 404 }
        );

      query = db
        .from("lottery_winners")
        .delete()
        .eq("entry_id", id)
        .eq("room_id", room.id);
    }

    // Récupérer combien de lignes supprimées
    const { data, error } = await query.select("id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const deleted = Array.isArray(data) ? data.length : 0;
    return NextResponse.json({ ok: true, deleted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
