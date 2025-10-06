// app/api/played/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

type Row = {
  title: string;
  artist: string;
  played_at: string | null;
  updated_at: string | null;
  created_at: string;
  status: "done" | "playing" | "waiting" | "rejected";
  room_id?: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();
    const limitParam = parseInt(searchParams.get("limit") || "15", 10);
    const limit = Math.min(Math.max(limitParam || 15, 1), 100);

    // bornes locales: aujourd'hui [00:00 → 24:00)
    const start = new Date();
    start.setHours(1, 2, 0, 0);
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
      if (eRoom) return NextResponse.json({ error: eRoom.message }, { status: 500, headers: noStore });
      if (!room) return NextResponse.json({ error: "Room inconnue" }, { status: 404, headers: noStore });
      roomId = room.id as string;
    }

    // On prend un peu plus large puis on filtre en JS sur "aujourd'hui"
    const fetchLimit = Math.min(limit * 5, 500);

    let q = db
      .from("requests")
      .select("title,artist,played_at,updated_at,created_at,status,room_id")
      .in("status", ["done", "playing"])
      // approximation du tri par coalesce(played_at, created_at) DESC
      .order("played_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    if (roomId) q = q.eq("room_id", roomId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    }

    const today = (data || []).filter((r: Row) => {
      const d = new Date(r.played_at ?? r.created_at);
      return d >= start && d < end;
    });

    // on renvoie EXACTEMENT un tableau (compat arrière)
    return NextResponse.json(today.slice(0, limit), { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
