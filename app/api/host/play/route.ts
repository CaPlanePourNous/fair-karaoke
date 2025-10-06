// app/api/host/play/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering, type Req } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: string;         // si fourni: on force ce titre en "playing"
  room_slug?: string;  // sinon: on choisit le prochain via computeOrdering
  room_id?: string;
};

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

export async function POST(req: NextRequest) {
  const db = createAdminSupabaseClient();

  try {
    const { id, room_slug, room_id } = (await req.json().catch(() => ({}))) as Body;

    // --- 1) Si un id est fourni: on met ce request en "playing" (chemin rapide, aligné avec HostClient.handleNext)
    if (id) {
      // sécurité douce: on vérifie qu’il existe (et on récupère la room)
      const { data: row, error: eRow } = await db
        .from("requests")
        .select("id, room_id, status")
        .eq("id", id)
        .maybeSingle();
      if (eRow) return NextResponse.json({ ok: false, error: eRow.message }, { status: 500, headers: noStore });
      if (!row) return NextResponse.json({ ok: false, error: "Demande introuvable" }, { status: 404, headers: noStore });

      // On bascule en "playing"
      const { error: eUp } = await db
        .from("requests")
        .update({ status: "playing", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (eUp) return NextResponse.json({ ok: false, error: eUp.message }, { status: 500, headers: noStore });

      return NextResponse.json({ ok: true, now_playing: id, room_id: row.room_id }, { headers: noStore });
    }

    // --- 2) Sinon: on choisit le prochain via computeOrdering (nécessite la salle)
    // Résoudre room_id
    let rid = (room_id || "").trim();
    if (!rid) {
      const slug = (room_slug || "").trim();
      if (!slug) {
        return NextResponse.json({ ok: false, error: "room_slug ou room_id requis" }, { status: 400, headers: noStore });
      }
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      rid = room.id as string;
    }

    // Récupère l'état courant de la file pour cette salle
    // playing (le plus récent)
    const { data: playingRow } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("room_id", rid)
      .eq("status", "playing")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // waiting (ordre ancienneté croissante)
    const { data: waitingRows, error: eWait } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("room_id", rid)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(200);
    if (eWait) return NextResponse.json({ ok: false, error: eWait.message }, { status: 500, headers: noStore });

    // done (on prend un historique suffisant pour R2/R5)
    const { data: doneRows, error: eDone } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at")
      .eq("room_id", rid)
      .eq("status", "done")
      .order("played_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (eDone) return NextResponse.json({ ok: false, error: eDone.message }, { status: 500, headers: noStore });

    // Calcul de l’ordre (R1–R5)
    const ordering = computeOrdering({
      waiting: (waitingRows ?? []) as Req[],
      playing: (playingRow ?? null) as Req | null,
      done: (doneRows ?? []) as Req[],
    });

    const next = ordering.orderedWaiting[0];
    if (!next) {
      return NextResponse.json({ ok: true, now_playing: null, note: "Aucun titre en attente." }, { headers: noStore });
    }

    // Bascule le premier en "playing"
    const { error: ePlay } = await db
      .from("requests")
      .update({ status: "playing", updated_at: new Date().toISOString() })
      .eq("id", next.id);
    if (ePlay) return NextResponse.json({ ok: false, error: ePlay.message }, { status: 500, headers: noStore });

    return NextResponse.json({ ok: true, now_playing: next.id, reasons: ordering.reasons }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
