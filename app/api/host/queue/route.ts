// app/api/host/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { computeOrdering } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

type Row = {
  id: string;
  room_id: string;
  singer_id: string | null;
  singer: string | null; // legacy
  title: string;
  artist: string;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  updated_at: string | null;
  played_at: string | null;
  ip: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const { searchParams } = new URL(req.url);
    const roomSlug = searchParams.get("room_slug") || "lantignie";
    let room_id = searchParams.get("room_id") || "";

    // Résoudre room_id si besoin
    if (!room_id) {
      const { data: r, error: eRoom } = await db.from("rooms").select("id").eq("slug", roomSlug).maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!r)   return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      room_id = r.id as string;
    }

    // Charger toutes les requêtes (ordre brut, on retriera après)
    const { data: rows, error: eReq } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at, ip")
      .eq("room_id", room_id)
      .order("created_at", { ascending: true });

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500, headers: noStore });

    const all = (rows || []) as Row[];

    // Appliquer R1–R5 (+ anti-spam IP) — ta version de computeOrdering prend un seul argument
    const { orderedWaiting, rejectIds } = computeOrdering(all as any);

    // Reconstruire les listes pour l’UI (supporte orderedWaiting = ids OU objets)
    const byId = new Map(all.map(r => [r.id, r]));
    const waiting = (orderedWaiting || [])
      .map((w: any) => (typeof w === "string" ? byId.get(w) : w))
      .filter(Boolean) as Row[];

    const playing = all.find(r => r.status === "playing") || null;
    const done = all
      .filter(r => r.status === "done")
      .sort((a, b) => {
        const ta = a.played_at || a.updated_at || a.created_at;
        const tb = b.played_at || b.updated_at || b.created_at;
        return (tb || "").localeCompare(ta || "");
      });

    // Flag visuel “nouveau”
    const playedSingerIds = new Set(
      all.filter(r => r.status === "done" || r.status === "playing")
         .map(r => r.singer_id)
         .filter(Boolean)
    );
    const waitingWithFlag = waiting.map(r => ({
      ...r,
      isNew: r.singer_id ? !playedSingerIds.has(r.singer_id) : true,
    }));

    return NextResponse.json(
      { ok: true, room_id, playing, waiting: waitingWithFlag, played: done, rejectIds },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/queue :", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
