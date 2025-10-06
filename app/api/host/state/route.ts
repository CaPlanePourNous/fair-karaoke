// app/api/host/state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqRow = {
  id: string;
  room_id: string;
  singer_id: string | null;
  // rétro-compat éventuelle si tu avais un champ texte 'singer'
  singer?: string | null;
  title: string;
  artist: string;
  ip?: string | null;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  played_at?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();

    const db = createAdminSupabaseClient();

    // 1) Résoudre la salle (slug prioritaire, room_id accepté)
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

    // 2) Charger les demandes de la salle (waiting/playing/done)
    const { data: rows, error: eReq } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, ip, status, created_at, played_at")
      .eq("room_id", roomId)
      .in("status", ["waiting", "playing", "done"])
      .order("created_at", { ascending: true });

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500 });

    const requests = (rows ?? []) as ReqRow[];

    // 3) Ordonnancement R1–R5 (+ anti-spam IP) sur la file
    const ordering = computeOrdering({ requests, maxQueue: 15 });

    // 4) Séparation des listes
    const current = requests.find((r) => r.status === "playing") || null;
    const waitingRaw = requests.filter((r) => r.status === "waiting");
    const doneRaw = requests
      .filter((r) => r.status === "done")
      .sort((a, b) => (b.played_at ? Date.parse(b.played_at) : 0) - (a.played_at ? Date.parse(a.played_at) : 0));

    // waiting ordonné selon computeOrdering
    const waiting = waitingRaw
      .filter((r) => ordering.orderedWaiting.includes(r.id))
      .sort(
        (a, b) =>
          ordering.orderedWaiting.indexOf(a.id) -
          ordering.orderedWaiting.indexOf(b.id)
      );

    // 5) Résoudre les noms affichés (display_name) en 1 requête
    const singerIds = Array.from(
      new Set(
        requests
          .map((r) => r.singer_id)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      )
    );

    let singerMap: Record<string, string | null> = {};
    if (singerIds.length > 0) {
      const { data: singers } = await db
        .from("singers")
        .select("id, display_name")
        .in("id", singerIds);
      if (singers) {
        singerMap = Object.fromEntries(
          singers.map((s: { id: string; display_name: string | null }) => [s.id, s.display_name])
        );
      }
    }

    const toItem = (r: ReqRow) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      display_name: r.singer_id ? (singerMap[r.singer_id] ?? null) : r.singer ?? null, // fallback legacy
    });

    const playing = current ? toItem(current) : null;
    const waitingItems = waiting.map(toItem);
    const doneItems = doneRaw.map(toItem);

    return NextResponse.json({
      ok: true,
      room_id: roomId,
      playing,
      waiting: waitingItems,
      done: doneItems,
      counts: {
        playing: playing ? 1 : 0,
        waiting: waitingItems.length,
        done: doneItems.length,
      },
      // si tu veux débug côté UI :
      // reasons: ordering.reasons,
      // rejects: ordering.rejectIds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/state:", msg);
    return NextResponse.json(
      { ok: false, error: msg, playing: null, waiting: [], done: [] },
      { status: 500 }
    );
  }
}
