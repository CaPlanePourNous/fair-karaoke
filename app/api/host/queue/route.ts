// app/api/host/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering, type Req } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

type Row = {
  id: string;
  room_id: string;
  singer_id: string | null;
  singer?: string | null; // legacy texte
  title: string;
  artist: string;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  updated_at?: string | null;
  played_at?: string | null;
};

function mapRow(r: Row) {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    display_name: r.singer ?? null, // compat HostClient
  };
}

export async function GET(req: NextRequest) {
  const db = createAdminSupabaseClient();

  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();

    // Résoudre room_id
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

    // --- playing (le plus récent)
    let qPlaying = db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("status", "playing")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (roomId) qPlaying = qPlaying.eq("room_id", roomId);
    const { data: playingRow } = await qPlaying.maybeSingle();

    // --- waiting (ancienneté croissante)
    let qWaiting = db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(200);
    if (roomId) qWaiting = qWaiting.eq("room_id", roomId);
    const { data: waitingRows, error: eWait } = await qWaiting;
    if (eWait) {
      return NextResponse.json({ ok: false, error: eWait.message }, { status: 500, headers: noStore });
    }

    // --- done (historique pour R2/R5)
    let qDone = db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("status", "done")
      .order("played_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (roomId) qDone = qDone.eq("room_id", roomId);
    const { data: doneRows, error: eDone } = await qDone;
    if (eDone) {
      return NextResponse.json({ ok: false, error: eDone.message }, { status: 500, headers: noStore });
    }

    // Ordonnancement R1–R5
    const ordering = computeOrdering({
      waiting: (waitingRows ?? []) as Req[],
      playing: (playingRow ?? null) as Req | null,
      done: (doneRows ?? []) as Req[],
    });

    const playing = playingRow ? mapRow(playingRow as Row) : null;
    const waiting = ordering.orderedWaiting.map((r) => mapRow(r as Row));
    const played = (doneRows ?? []).map((r) => mapRow(r as Row));

    // Compat HostClient: renvoie played[] (et done[] en bonus)
    return NextResponse.json(
      { ok: true, playing, waiting, played, done: played, reasons: ordering.reasons },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
