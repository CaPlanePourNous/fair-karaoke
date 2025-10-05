// app/api/host/queue/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue } from "@/lib/ordering";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Récupère les chansons en cours
    const { data: playingData, error: errPlaying } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "playing")
      .order("played_at", { ascending: false })
      .limit(1);

    if (errPlaying) throw errPlaying;
    const playing = playingData?.[0] || null;

    // Récupère les chansons terminées
    const { data: playedData, error: errPlayed } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "done")
      .order("played_at", { ascending: false })
      .limit(30);

    if (errPlayed) throw errPlayed;

    // Récupère les chansons en attente
    const { data: waitingData, error: errWaiting } = await sbServer
      .from("requests")
      .select("*")
      .in("status", ["pending"]);

    if (errWaiting) throw errWaiting;

    // Ordonne la file d’attente selon les règles
    const waiting = prepareQueue(waitingData || [], playedData || [], playing);

    return NextResponse.json({
      playing,
      waiting,
      played: playedData || [],
    });
  } catch (e) {
    console.error("Erreur /api/host/queue :", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
