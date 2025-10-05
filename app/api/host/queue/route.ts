// app/api/host/queue/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { computeOrdering } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Récupère toutes les demandes de la room
    const { data, error } = await sbServer
      .from("requests")
      .select(
        "id, room_id, singer_id, title, artist, ip, status, created_at"
      )
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!data) return NextResponse.json({ ok: true, playing: null, waiting: [], done: [] });

    // 2. Sépare les statuts
    const playing = data.find((r) => r.status === "playing") ?? null;
    const done = data.filter((r) => r.status === "done");
    const waitingRaw = data.filter((r) => r.status === "waiting");

    // 3. Applique la logique d’ordre sur les waiting
    const ordering = computeOrdering([...data]);

    const waiting = waitingRaw
      .filter((r) => ordering.orderedWaiting.includes(r.id))
      .sort(
        (a, b) =>
          ordering.orderedWaiting.indexOf(a.id) -
          ordering.orderedWaiting.indexOf(b.id)
      );

    return NextResponse.json({
      ok: true,
      playing,
      waiting,
      done,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/queue:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
