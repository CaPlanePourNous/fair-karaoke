// app/api/lottery/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liste les inscrits à la loterie d'une salle.
 * GET ?room_slug=<slug> | ?room_id=<uuid> [&limit=200]
 * Réponse: { ok: true, entries: Array<{id,display_name,created_at}> } | { ok:false, error }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "200", 10) || 200, 1), 1000);

    const db = createAdminSupabaseClient();

    // Résoudre la salle (slug prioritaire, room_id accepté)
    let roomId = roomIdParam;
    if (!roomId) {
      if (!roomSlug) {
        return NextResponse.json(
          { ok: false, error: "room_slug ou room_id requis" },
          { status: 400 }
        );
      }
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", roomSlug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
      if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404 });
      roomId = room.id as string;
    }

    // Liste des inscrits de la room (du plus récent au plus ancien)
    const { data, error } = await db
      .from("lottery_entries")
      .select("id, display_name, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entries: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
