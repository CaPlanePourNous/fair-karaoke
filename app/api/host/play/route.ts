// app/api/host/play/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue } from "@/lib/ordering";

export async function POST() {
  try {
    // 1️⃣ Récupère la chanson actuellement en cours
    const { data: playingData } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "playing")
      .order("played_at", { ascending: false })
      .limit(1);

    const playing = playingData?.[0] || null;

    // 2️⃣ Si une chanson est en cours → la marquer comme terminée
    if (playing) {
      await sbServer
        .from("requests")
        .update({ status: "done" })
        .eq("id", playing.id);
    }

    // 3️⃣ Récupère la liste des chansons “en attente”
    const { data: waitingData } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "pending");

    // 4️⃣ Récupère la liste des chansons “terminées”
    const { data: playedData } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "done");

    // 5️⃣ Calcule la file d’attente
    const queue = prepareQueue(waitingData || [], playedData || [], null);

    // 6️⃣ Si une chanson est dispo → la passer en lecture
    if (queue.length > 0) {
      const nextSong = queue[0];
      await sbServer
        .from("requests")
        .update({
          status: "playing",
          played_at: new Date().toISOString(),
        })
        .eq("id", nextSong.id);
    }

    return NextResponse.json({ ok: true });
  // Remplace ton catch par ceci :
} catch (e: unknown) {
  console.error("Erreur /api/host/play :", e);
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

}
