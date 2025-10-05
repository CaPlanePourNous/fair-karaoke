import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeOrdering, type RequestRow } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST() {
  const db = getSupabase();
  try {
    // 1) État actuel
    const { data, error } = await db
      .from("requests")
      .select("id,singer,title,artist,ip,status,created_at")
      .in("status", ["waiting", "playing", "done"])
      .order("created_at", { ascending: true });
    if (error) throw error;

    const reqs = (data ?? []) as RequestRow[];
    const playing = reqs.find(r => r.status === "playing") || null;
    const done = reqs.filter(r => r.status === "done");

    // 2) Recalcul de la file + rejets auto
    const ord = computeOrdering({
      requests: reqs,
      alreadyPlayed: done.map(d => ({ title: d.title, artist: d.artist })),
      maxQueue: 15,
    });

    // Appliquer les rejets auto
    if (ord.rejectIds.length) {
      const { error: eRej } = await db.from("requests").update({ status: "rejected" }).in("id", ord.rejectIds);
      if (eRej) throw eRej;
    }

    // Forcer EXACTEMENT la liste "waiting" à ord.orderedWaiting
    const currentWaitingIds = reqs.filter(r => r.status === "waiting").map(r => r.id);
    const keep = new Set(ord.orderedWaiting);
    const toReject = currentWaitingIds.filter(id => !keep.has(id) && !ord.rejectIds.includes(id));
    if (toReject.length) {
      const { error: eRej2 } = await db.from("requests").update({ status: "rejected" }).in("id", toReject);
      if (eRej2) throw eRej2;
    }
    if (ord.orderedWaiting.length) {
      const { error: eWait } = await db.from("requests").update({ status: "waiting" }).in("id", ord.orderedWaiting);
      if (eWait) throw eWait;
    }

    // 3) Lire la suivante: playing → done, 1er waiting → playing
    if (playing?.id) {
      const { error: eDone } = await db.from("requests").update({ status: "done" }).eq("id", playing.id);
      if (eDone) throw eDone;
    }
    const nextId = ord.orderedWaiting[0];
    if (nextId) {
      const { error: ePlay } = await db.from("requests").update({ status: "playing" }).eq("id", nextId);
      if (ePlay) throw ePlay;
    }

    // 4) Retour état minimal utile
    return NextResponse.json({
      ok: true,
      promoted: nextId ?? null,
      justDone: playing?.id ?? null,
    });
  } catch (e: unknown) {
    console.error("Erreur /api/host/play :", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
