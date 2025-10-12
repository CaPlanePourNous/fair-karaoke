// app/api/host/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const runtime = 'nodejs'


const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

type ReqRow = {
  id: string;
  room_id: string;
  status: "waiting" | "playing" | "done" | "rejected";
  title: string;
  artist: string;
  singer_id: string | null;
  played_at?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      request_id?: string;
      room_slug?: string; // optionnel
      room_id?: string;   // optionnel
    };

    const requestId = (body.request_id || "").trim();
    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "request_id manquant" },
        { status: 400, headers: noStore }
      );
    }

    const db = createAdminSupabaseClient();

    // 1) Charger la requête cible (donne room_id)
    const { data: reqRow, error: eReq } = await db
      .from("requests")
      .select("id, room_id, status, title, artist, singer_id, played_at")
      .eq("id", requestId)
      .maybeSingle();

    if (eReq) {
      return NextResponse.json(
        { ok: false, error: eReq.message },
        { status: 500, headers: noStore }
      );
    }
    if (!reqRow) {
      return NextResponse.json(
        { ok: false, error: "Demande introuvable" },
        { status: 404, headers: noStore }
      );
    }

    // 2) (optionnel) Vérifier la cohérence avec room_slug/room_id fournis
    let resolvedRoomId = (body.room_id || "").trim();
    if (resolvedRoomId && resolvedRoomId !== reqRow.room_id) {
      return NextResponse.json(
        { ok: false, error: "request_id n'appartient pas à room_id" },
        { status: 400, headers: noStore }
      );
    }
    if (!resolvedRoomId && body.room_slug) {
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", body.room_slug.trim())
        .maybeSingle();
      if (eRoom) {
        return NextResponse.json(
          { ok: false, error: eRoom.message },
          { status: 500, headers: noStore }
        );
      }
      if (!room) {
        return NextResponse.json(
          { ok: false, error: "Room inconnue (room_slug)" },
          { status: 404, headers: noStore }
        );
      }
      if (room.id !== reqRow.room_id) {
        return NextResponse.json(
          { ok: false, error: "request_id n'appartient pas à cette room" },
          { status: 400, headers: noStore }
        );
      }
      resolvedRoomId = room.id as string;
    } else {
      resolvedRoomId = reqRow.room_id;
    }

    // 3) Si la requête est déjà "playing", on considère l'action idempotente
    if (reqRow.status === "playing") {
      const display_name = await displayNameForSinger(db, reqRow.singer_id);
      return NextResponse.json(
        {
          ok: true,
          now_playing: {
            id: reqRow.id,
            title: reqRow.title,
            artist: reqRow.artist,
            display_name,
            played_at: reqRow.played_at ?? new Date().toISOString(),
          },
          message: "Déjà en cours",
        },
        { headers: noStore }
      );
    }

    // 4) Clôturer l'actuel "playing" de cette salle (s'il existe)
    const { data: cur, error: eCur } = await db
      .from("requests")
      .select("id")
      .eq("room_id", resolvedRoomId)
      .eq("status", "playing")
      .maybeSingle();

    if (eCur) {
      return NextResponse.json(
        { ok: false, error: eCur.message },
        { status: 500, headers: noStore }
      );
    }

    if (cur?.id) {
      const { error: eDone } = await db
        .from("requests")
        .update({ status: "done", played_at: new Date().toISOString() })
        .eq("id", cur.id);
      if (eDone) {
        return NextResponse.json(
          { ok: false, error: eDone.message },
          { status: 500, headers: noStore }
        );
      }
    }

    // 5) Promouvoir la demande ciblée en "playing"
    const { error: ePlay } = await db
      .from("requests")
      .update({ status: "playing", played_at: new Date().toISOString() })
      .eq("id", reqRow.id);

    if (ePlay) {
      return NextResponse.json(
        { ok: false, error: ePlay.message },
        { status: 500, headers: noStore }
      );
    }

    const display_name = await displayNameForSinger(db, reqRow.singer_id);

    return NextResponse.json(
      {
        ok: true,
        now_playing: {
          id: reqRow.id,
          title: reqRow.title,
          artist: reqRow.artist,
          display_name,
        },
      },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: noStore }
    );
  }
}

async function displayNameForSinger(
  db: ReturnType<typeof createAdminSupabaseClient>,
  singer_id: string | null
): Promise<string | null> {
  if (!singer_id) return null;
  const { data } = await db
    .from("singers")
    .select("display_name")
    .eq("id", singer_id)
    .maybeSingle();
  return data?.display_name ?? null;
}
