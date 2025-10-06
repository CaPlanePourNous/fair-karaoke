// app/api/lottery/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();

    // Bornes [aujourd’hui 00:00 → demain 00:00) en local (simple et suffisant ici)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

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
        return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      }
      if (!room) {
        return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      }
      roomId = room.id as string;
    }

    // Compter les inscriptions du jour (optionnellement filtrées par room)
    let q = db
      .from("lottery_entries")
      .select("*", { head: true, count: "exact" })
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    if (roomId) q = q.eq("room_id", roomId);

    const { count, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: noStore });
    }

    return NextResponse.json(
      { ok: true, count: count ?? 0, room_id: roomId || null },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
