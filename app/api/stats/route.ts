// app/api/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();

    const db = createAdminSupabaseClient();

    // Résoudre la room si fournie
    let roomId = roomIdParam;
    if (!roomId && roomSlug) {
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", roomSlug)
        .maybeSingle();
      if (eRoom) {
        return NextResponse.json({ error: eRoom.message }, { status: 500, headers: noStore });
      }
      if (!room) {
        return NextResponse.json({ error: "Room inconnue" }, { status: 404, headers: noStore });
      }
      roomId = room.id as string;
    }

    // Compter uniquement la file d'attente (statut waiting)
    let q = db
      .from("requests")
      .select("*", { head: true, count: "exact" })
      .eq("status", "waiting");

    if (roomId) q = q.eq("room_id", roomId);

    const { count, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    }

    const total_waiting = count ?? 0;
    const est_minutes = total_waiting * 3; // ~3 min par titre

    return NextResponse.json(
      {
        ok: true,
        total_waiting,
        est_minutes,
        room_id: roomId || null,
      },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
