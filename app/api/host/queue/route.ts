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
  singer: string | null; // legacy éventuel
  title: string;
  artist: string;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string;
  updated_at: string | null;
  played_at: string | null;
  ip: string | null;
};

type UiRow = Row & { display_name?: string | null; isNew?: boolean };

export async function GET(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const { searchParams } = new URL(req.url);

    const roomSlug = searchParams.get("room_slug") || "lantignie";
    let room_id = searchParams.get("room_id") || "";

    // Résoudre room_id si fourni par slug
    if (!room_id) {
      const { data: r, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", roomSlug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!r)   return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      room_id = r.id as string;
    }

    // Charger toutes les demandes
    const { data: rows, error: eReq } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at, ip")
      .eq("room_id", room_id)
      .order("created_at", { ascending: true });

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500, headers: noStore });

    const all = (rows || []) as Row[];

    // ---- Joindre les noms de chanteurs (requête séparée, robuste) ----
    const singerIds = Array.from(
      new Set(all.map(r => r.singer_id).filter((x): x is string => !!x))
    );
    let nameById = new Map<string, string>();
    if (singerIds.length > 0) {
      const { data: singers, error: eS } = await db
        .from("singers")
        .select("id, display_name")
        .in("id", singerIds);
      if (eS) {
        // on loggue mais on continue sans casser l’UI
        console.warn("queue: singers join error:", eS.message);
      } else if (singers) {
        nameById = new Map(singers.map(s => [s.id as string, (s.display_name as string) ?? ""]));
      }
    }
    const attachName = (r: Row): UiRow => ({
      ...r,
      display_name: r.singer_id ? (nameById.get(r.singer_id) ?? r.singer ?? null) : (r.singer ?? null),
    });

    const playingRaw = all.find(r => r.status === "playing") || null;
    const waitingRaw = all.filter(r => r.status === "waiting");
    const doneRaw    = all.filter(r => r.status === "done");

    // ---- computeOrdering : 2 signatures supportées + FIFO fallback ----
    let orderedWaiting: any[] = [];
    let rejectIds: string[] = [];
    try {
      ({ orderedWaiting, rejectIds } = computeOrdering(all as any));
    } catch {
      try {
        const res2 = computeOrdering(
          { waiting: waitingRaw, playing: playingRaw, done: doneRaw } as any
        ) as any;
        orderedWaiting = res2?.orderedWaiting ?? [];
        rejectIds = res2?.rejectIds ?? [];
      } catch {
        // Fallback : FIFO
        orderedWaiting = waitingRaw.map(w => w.id);
        rejectIds = [];
      }
    }

    // Normaliser orderedWaiting en lignes complètes
    const byId = new Map(all.map(r => [r.id, r]));
    const waiting = (orderedWaiting || [])
      .map((w: any) => (typeof w === "string" ? byId.get(w) : w))
      .filter(Boolean) as Row[];

    // Drapeau "nouveau"
    const playedSingerIds = new Set(
      all
        .filter(r => r.status === "done" || r.status === "playing")
        .map(r => r.singer_id)
        .filter(Boolean)
    );
    const waitingWithFlag: UiRow[] = waiting.map(r => {
      const base = attachName(r);
      return {
        ...base,
        isNew: base.singer_id ? !playedSingerIds.has(base.singer_id) : true,
      };
    });

    // Trier les "done" (plus récent d’abord) et attacher les noms
    const done: UiRow[] = doneRaw
      .sort((a, b) => {
        const ta = a.played_at || a.updated_at || a.created_at;
        const tb = b.played_at || b.updated_at || b.created_at;
        return (tb || "").localeCompare(ta || "");
      })
      .map(attachName);

    const playing: UiRow | null = playingRaw ? attachName(playingRaw) : null;

    // Renvoyer played + alias done pour rétro-compat
    return NextResponse.json(
      {
        ok: true,
        room_id,
        playing,
        waiting: waitingWithFlag,
        played: done,
        done,
        rejectIds,
      },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/queue :", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
