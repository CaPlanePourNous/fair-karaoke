// app/api/host/play/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";
import { prepareQueue, Req } from "@/lib/ordering";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { id, next } = body as { id?: string; next?: boolean };

  try {
    // 1) chercher l'actuel "playing"
    const { data: playingData, error: errPlaying } = await sbServer
      .from("requests")
      .select("*")
      .eq("status", "playing")
      .order("played_at", { ascending: false })
      .limit(1);

    if (errPlaying) {
      console.error("[/api/host/play] errPlaying:", errPlaying);
      return NextResponse.json(
        { error: "DB: playing select failed", details: errPlaying.message },
        { status: 500 }
      );
    }

    const playing: Req | null = playingData?.[0] || null;
    console.log("[/api/host/play] current playing:", playing?.id || null);

    // 2) cas "play by id" (forcer une entrée précise)
    if (id) {
      if (playing) {
        return NextResponse.json(
          { error: "Une chanson est déjà en cours." },
          { status: 400 }
        );
      }

      const { error: errPlayById } = await sbServer
        .from("requests")
        .update({ status: "playing", played_at: new Date().toISOString() })
        .eq("id", id);

      if (errPlayById) {
        console.error("[/api/host/play] errPlayById:", errPlayById);
        return NextResponse.json(
          { error: "DB: update playing by id failed", details: errPlayById.message },
          { status: 500 }
        );
      }

      console.log("[/api/host/play] started by id:", id);
      return NextResponse.json({ ok: true, mode: "by_id", playing_id: id });
    }

    // 3) cas "next: true" (enchaîner la suivante)
    if (next) {
      // 3a) si quelque chose joue, le passer en 'done'
      if (playing?.id) {
        const { error: errDone } = await sbServer
          .from("requests")
          .update({ status: "done" })
          .eq("id", playing.id);

        if (errDone) {
          console.error("[/api/host/play] errDone:", errDone);
          return NextResponse.json(
            { error: "DB: update done failed", details: errDone.message },
            { status: 500 }
          );
        }
        console.log("[/api/host/play] marked done:", playing.id);
      }

      // 3b) récupérer les en-attente (pending/approved)
      const { data: waitingData, error: errWaiting } = await sbServer
        .from("requests")
        .select("*")
        .in("status", ["pending", "approved"]);

      if (errWaiting) {
        console.error("[/api/host/play] errWaiting:", errWaiting);
        return NextResponse.json(
          { error: "DB: waiting select failed", details: errWaiting.message },
          { status: 500 }
        );
      }

      // 3c) récupérer les 'done' (pour prepareQueue)
      const { data: playedData, error: errPlayed } = await sbServer
        .from("requests")
        .select("*")
        .in("status", ["done"]);

      if (errPlayed) {
        console.error("[/api/host/play] errPlayed:", errPlayed);
        return NextResponse.json(
          { error: "DB: played select failed", details: errPlayed.message },
          { status: 500 }
        );
      }

      // 3d) calculer la prochaine via ta logique existante
      const waiting = prepareQueue(waitingData || [], playedData || [], null);
      const nextSong = waiting?.[0];

      console.log("[/api/host/play] waiting count:", waiting?.length || 0);
      console.log("[/api/host/play] nextSong id:", nextSong?.id || null);

      if (!nextSong?.id) {
        // rien à jouer → OK mais rien en "playing"
        return NextResponse.json({ ok: true, mode: "next", next: null });
      }

      // 3e) passer la suivante en "playing"
      const { error: errPlayNext } = await sbServer
        .from("requests")
        .update({ status: "playing", played_at: new Date().toISOString() })
        .eq("id", nextSong.id);

      if (errPlayNext) {
        console.error("[/api/host/play] errPlayNext:", errPlayNext);
        return NextResponse.json(
          { error: "DB: update next->playing failed", details: errPlayNext.message },
          { status: 500 }
        );
      }

      console.log("[/api/host/play] started next:", nextSong.id);
      return NextResponse.json({ ok: true, mode: "next", next: nextSong.id });
    }

    // 4) mode inconnu
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  } catch (e: any) {
    console.error("[/api/host/play] fatal:", e);
    return NextResponse.json(
      { error: "Unexpected server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
