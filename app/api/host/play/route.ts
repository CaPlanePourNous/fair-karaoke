// app/api/host/play/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqRow = {
  id: string;
  title: string;
  artist: string;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  singer_id: string | null;
  singer?: string | null; // rétro-compat si le champ texte existe encore
  ip?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      room_slug?: string;
      room_id?: string;
    };

    const db = createAdminSupabaseClient();

    // 1) Résoudre la room (slug prioritaire, room_id fallback)
    let roomId = (body.room_id || "").trim();
    if (!roomId) {
      const slug = (body.room_slug || "").trim();
      if (!slug) {
        return NextResponse.json(
          { ok: false, error: "room_slug ou room_id requis" },
          { status: 400 }
        );
      }
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
      if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404 });
      roomId = room.id as string;
    }

    // 2) Charger l’état de la salle
    const { data: rows, error: eReq } = await db
      .from("requests")
      .select("id,title,artist,status,created_at,singer_id,singer,ip")
      .eq("room_id", roomId)
      .in("status", ["waiting", "playing", "done"])
      .order("created_at", { ascending: true });

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500 });

    const requests = (rows ?? []) as ReqRow[];
    const current = requests.find((r) => r.status === "playing") || null;

    // 3) Calcul R1–R5 (+ anti-spam IP) sur la file
    const ordering = computeOrdering({ requests, maxQueue: 15 });
    const nextId = ordering.orderedWaiting[0];

    // 4) Si quelque chose joue → le marquer "done"
    if (current?.id) {
      const { error: eDone } = await db
        .from("requests")
        .update({ status: "done", played_at: new Date().toISOString() })
        .eq("id", current.id);
      if (eDone) {
        return NextResponse.json({ ok: false, error: eDone.message }, { status: 500 });
      }
    }

    // 5) Promouvoir le premier waiting ordonné → "playing"
    if (!nextId) {
      // Rien en attente : on a seulement clôturé l’actuel
      return NextResponse.json({
        ok: true,
        just_done: current ? { id: current.id } : null,
        now_playing: null,
        message: "File vide",
      });
    }

    const { data: nextRow, error: eSel } = await db
      .from("requests")
      .select("id,title,artist,singer_id")
      .eq("id", nextId)
      .maybeSingle();

    if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });
    if (!nextRow) return NextResponse.json({ ok: false, error: "Prochain titre introuvable" }, { status: 404 });

    const { error: ePlay } = await db
      .from("requests")
      .update({ status: "playing", played_at: new Date().toISOString() })
      .eq("id", nextRow.id);

    if (ePlay) return NextResponse.json({ ok: false, error: ePlay.message }, { status: 500 });

    // 6) (Optionnel) Afficher le nom du chanteur côté Host
    let display_name: string | null = null;
    if (nextRow.singer_id) {
      const { data: singer } = await db
        .from("singers")
        .select("display_name")
        .eq("id", nextRow.singer_id)
        .maybeSingle();
      display_name = singer?.display_name ?? null;
    }

    return NextResponse.json({
      ok: true,
      just_done: current ? { id: current.id } : null,
      now_playing: {
        id: nextRow.id,
        title: nextRow.title,
        artist: nextRow.artist,
        display_name,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
