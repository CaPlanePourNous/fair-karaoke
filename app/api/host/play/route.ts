// app/api/host/play/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue, Req } from "@/lib/ordering";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { id, next } = body;

  // Récupère la chanson en cours
  const { data: playingData } = await sbServer
    .from("requests")
    .select("*")
    .eq("status", "playing")
    .order("played_at", { ascending: false })
    .limit(1);

  const playing: Req | null = playingData?.[0] || null;

  if (id) {
    if (playing) {
      return NextResponse.json(
        { error: "Une chanson est déjà en cours." },
        { status: 400 }
      );
    }
    await sbServer
      .from("requests")
      .update({ status: "playing", played_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (next) {
    if (playing) {
      await sbServer.from("requests").update({ status: "done" }).eq("id", playing.id);
    }
    // Cherche le prochain
    const { data: waitingData } = await sbServer
      .from("requests")
      .select("*")
      .in("status", ["pending", "approved"]);

    const { data: playedData } = await sbServer
      .from("requests")
      .select("*")
      .in("status", ["done"]);

    const waiting = prepareQueue(waitingData || [], playedData || [], null);
    if (waiting.length > 0) {
      const nextSong = waiting[0];
      await sbServer
        .from("requests")
        .update({ status: "playing", played_at: new Date().toISOString() })
        .eq("id", nextSong.id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
}
