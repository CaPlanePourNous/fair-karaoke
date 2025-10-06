import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

type Body = {
  id?: string;          // id de la request à jouer (recommandé)
  room_id?: string;     // optionnel si id fourni
  room_slug?: string;   // optionnel: on peut déduire room_id depuis le slug
};

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = (await req.json().catch(() => ({}))) as Body;

    // 1) Résoudre la cible (id) et la salle (room_id)
    let { id, room_id, room_slug } = body;

    if (!id && !room_id && !room_slug) {
      // fallback: si aucun id, on prendra le 1er en attente.
      // Mais il faut une room (par room_id ou slug) pour le chercher.
      // On essaie d’inférer depuis le Referer /host/<slug>
      const ref = req.headers.get("referer") || "";
      try {
        const u = new URL(ref);
        const m = u.pathname.match(/\/host\/([^\/\?\#]+)/i);
        if (m) room_slug = decodeURIComponent(m[1]);
      } catch {}
    }

    if (room_slug && !room_id) {
      const { data: r, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", room_slug)
        .maybeSingle();
      if (eRoom) {
        return NextResponse.json(
          { ok: false, error: eRoom.message },
          { status: 500, headers: noStore }
        );
      }
      if (!r) {
        return NextResponse.json(
          { ok: false, error: "Room inconnue" },
          { status: 404, headers: noStore }
        );
      }
      room_id = r.id as string;
    }

    // Si on a un id mais pas de room, on la déduit depuis la request
    if (id && !room_id) {
      const { data: reqRow, error: eReq } = await db
        .from("requests")
        .select("room_id, status")
        .eq("id", id)
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
      room_id = reqRow.room_id as string;
    }

    // Si aucun id : on choisit la prochaine en attente (ordre simple: plus ancienne)
    if (!id) {
      if (!room_id) {
        return NextResponse.json(
          { ok: false, error: "room_id ou room_slug requis pour choisir la suivante" },
          { status: 400, headers: noStore }
        );
      }
      const { data: nextRow, error: eNext } = await db
        .from("requests")
        .select("id")
        .eq("room_id", room_id)
        .eq("status", "waiting")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (eNext) {
        return NextResponse.json(
          { ok: false, error: eNext.message },
          { status: 500, headers: noStore }
        );
      }
      if (!nextRow) {
        return NextResponse.json(
          { ok: false, error: "Aucun titre en attente" },
          { status: 409, headers: noStore }
        );
      }
      id = nextRow.id as string;
    }

    // 2) Garde-fou : nettoyer toute entrée encore "playing" pour cette room
    //    (important pour éviter le conflit sur l'index unique one_playing_per_room)
    if (!room_id) {
      // Par sécurité, on redéduit room_id depuis l'id (si l’appel venait sans contexte)
      const { data: reqRow2 } = await db
        .from("requests")
        .select("room_id")
        .eq("id", id!)
        .maybeSingle();
      room_id = reqRow2?.room_id as string | undefined;
    }

    if (room_id) {
      const { error: eClean } = await db
        .from("requests")
        .update({
          status: "done",
          played_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("room_id", room_id)
        .eq("status", "playing");
      if (eClean) {
        return NextResponse.json(
          { ok: false, error: eClean.message },
          { status: 500, headers: noStore }
        );
      }
    }

    // 3) Promouvoir la cible en "playing"
    const { data: nowPlaying, error: ePlay } = await db
      .from("requests")
      .update({
        status: "playing",
        played_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id!)
      .select("id, title, artist, singer, singer_id, room_id, status")
      .maybeSingle();

    if (ePlay) {
      // S’il reste un playing résiduel à cause d’une course, l’index unique  "one_playing_per_room"
      // renverra 23505 ici. On remonte un message clair.
      return NextResponse.json(
        { ok: false, error: ePlay.message },
        { status: 409, headers: noStore }
      );
    }
    if (!nowPlaying) {
      return NextResponse.json(
        { ok: false, error: "Impossible de passer en lecture (id introuvable)" },
        { status: 404, headers: noStore }
      );
    }

    return NextResponse.json(
      { ok: true, now_playing: nowPlaying },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
