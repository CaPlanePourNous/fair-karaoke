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

    let roomId = roomIdParam;
    if (!roomId) {
      if (!roomSlug) {
        return NextResponse.json(
          { ok: false, error: "room_slug ou room_id requis" },
          { status: 400, headers: noStore }
        );
      }
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", roomSlug)
        .maybeSingle();

      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      roomId = room.id as string;
    }

    const { data: now, error: eNow } = await db
      .from("requests")
      .select("id,title,artist,status,singer_id,singer,played_at")
      .eq("room_id", roomId)
      .eq("status", "playing")
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eNow) return NextResponse.json({ ok: false, error: eNow.message }, { status: 500, headers: noStore });
    if (!now) return NextResponse.json({ ok: true, now: null }, { headers: noStore });

    let display_name: string | null = null;
    if (now.singer_id) {
      const { data: s } = await db
        .from("singers")
        .select("display_name")
        .eq("id", now.singer_id)
        .maybeSingle();
      display_name = s?.display_name ?? null;
    } else if ((now as any).singer) {
      display_name = (now as any).singer;
    }

    return NextResponse.json(
      {
        ok: true,
        now: {
          id: now.id,
          title: now.title,
          artist: now.artist,
          display_name,
          played_at: now.played_at,
        },
      },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
