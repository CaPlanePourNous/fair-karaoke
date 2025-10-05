// app/api/host/queue/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue, Req } from "@/lib/ordering";

export async function GET() {
  // Récupère la chanson en cours
  const { data: playingData } = await sbServer
    .from("requests")
    .select("*")
    .eq("status", "playing")
    .order("played_at", { ascending: false })
    .limit(1);

  const playing: Req | null = playingData?.[0] || null;

  // Récupère les chansons déjà passées aujourd’hui
  const { data: playedData } = await sbServer
    .from("requests")
    .select("*")
    .in("status", ["done"])
    .gte("created_at", new Date().toISOString().split("T")[0]); // depuis minuit

  const played: Req[] = playedData || [];

  // Récupère les chansons en attente
  const { data: waitingData } = await sbServer
    .from("requests")
    .select("*")
    .in("status", ["pending", "approved"]);

  const waitingRaw: Req[] = waitingData || [];

  const waiting = prepareQueue(waitingRaw, played, playing);

  return NextResponse.json({ playing, waiting, played });
}
