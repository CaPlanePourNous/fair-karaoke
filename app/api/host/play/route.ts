import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

type Body = {
  id?: string;
  room_id?: string;
  room_slug?: string;
};

type Row = {
  id: string;
  room_id: string;
  singer_id: string | null;
  title: string;
  artist: string;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  updated_at: string | null;
  played_at: string | null;
  ip: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = (await req.json().catch(() => ({}))) as Body;

    let { id, room_id, room_slug } = body;

    if (!id && !room_id && !room_slug) {
      const ref = req.headers.get("referer") || "";
      try {
        const u = new URL(ref);
        const m = u.pathname.match(/\/host\/([^\/\?\#]+)/i);
        if (m) room_slug = decodeURIComponent(m[1]);
      } catch {}
    }

    if (room_slug && !room_id) {
      const { data: r, error: eRoom } = await db.from("rooms").select("id").eq("slug", room_slug).maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!r)   return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      room_id = r.id as string;
    }

    if (id && !room_id) {
      const { data: reqRow, error: eReq } = await db.from("requests").select("room_id").eq("id", id).maybeSingle();
      if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500, headers: noStore });
      if (!reqRow) return NextResponse.json({ ok: false, error: "Demande introuvable" }, { status: 404, headers: noStore });
      room_id = reqRow.room_id as string;
    }

    // Choisir via computeOrdering si pas d'id fourni
    if (!id) {
      if (!room_id) {
        return NextResponse.json(
          { ok: false, error: "room_id ou room_slug requis pour choisir la suivante" },
          { status: 400, headers: noStore }
        );
      }
      const { data: rows, error: eRows } = await db
        .from("requests")
        .select("id, room_id, singer_id, title, artist, status, created_at, updated_at, played_at, ip")
        .eq("room_id", room_id)
        .order("created_at", { ascending: true });

      if (eRows) return NextResponse.json({ ok: false, error: eRows.message }, { status: 500, headers: noStore });

      const all = (rows || []) as Row[];
      const { orderedWaiting } = computeOrdering(all as any);

      const first = orderedWaiting?.[0] as unknown;
      const nextId =
        typeof first === "string"
          ? first
          : (first as { id?: string } | null | undefined)?.id;

      if (!nextId) {
        return NextResponse.json(
          { ok: false, error: "Aucun titre en attente" },
          { status: 409, headers: noStore }
        );
      }
      id = nextId;
    }

    // Nettoyer tout "playing" pour la room avant de promouvoir
    if (!room_id) {
      const { data: reqRow2 } = await db.from("requests").select("room_id").eq("id", id!).maybeSingle();
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
      if (eClean) return NextResponse.json({ ok: false, error: eClean.message }, { status: 500, headers: noStore });
    }

    // Promouvoir la cible en "playing"
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

    if (ePlay) return NextResponse.json({ ok: false, error: ePlay.message }, { status: 409, headers: noStore });
    if (!nowPlaying) {
      return NextResponse.json({ ok: false, error: "Impossible de passer en lecture (id introuvable)" }, { status: 404, headers: noStore });
    }

    return NextResponse.json({ ok: true, now_playing: nowPlaying }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
