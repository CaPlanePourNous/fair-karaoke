// app/api/host/queue/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue, Req } from "@/lib/ordering";

export const dynamic = "force-dynamic";

function noStore() {
  return {
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  };
}

export async function GET() {
  try {
    // En cours
    const { data: playingData, error: ePlaying } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "playing")
      .order("played_at", { ascending: false })
      .limit(1);
    if (ePlaying) throw ePlaying;
    const playing: Req | null = playingData?.[0] ?? null;

    // En attente (pending/approved)
    const { data: waitingData, error: eWaiting } = await sbServer
      .from("requests")
      .select("*")
      .in("status", ["pending", "approved"]);
    if (eWaiting) throw eWaiting;
    const waitingRaw: Req[] = waitingData ?? [];

    // Déjà chantées (done)
    const { data: playedData, error: eDone } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "done")
      .order("played_at", { ascending: false })
      .limit(30);
    if (eDone) throw eDone;
    const played: Req[] = playedData ?? [];

    // Ordonner la file
    const waiting = prepareQueue(waitingRaw, played, playing);

    return NextResponse.json(
      {
        playing,
        waiting,
        played,
      },
      { headers: noStore() }
    );
  } catch (err: any) {
    console.error("[host/queue] error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Erreur host/queue" },
      { status: 500, headers: noStore() }
    );
  }
}
