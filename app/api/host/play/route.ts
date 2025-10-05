// app/api/host/play/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { room_id } = await req.json().catch(() => ({}));

    if (!room_id) {
      return NextResponse.json({ error: "room_id manquant" }, { status: 400 });
    }

    // 1️⃣ Récupérer le titre actuellement "playing"
    const { data: current } = await sbServer
      .from("requests")
      .select("id")
      .eq("room_id", room_id)
      .eq("status", "playing")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    // 2️⃣ Passer ce titre en "done"
    if (current?.id) {
      await sbServer
        .from("requests")
        .update({ status: "done" })
        .eq("id", current.id);
    }

    // 3️⃣ Récupérer le prochain en attente (le plus ancien waiting)
    const { data: next } = await sbServer
      .from("requests")
      .select("id")
      .eq("room_id", room_id)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    // 4️⃣ Passer ce prochain en "playing"
    if (next?.id) {
      await sbServer
        .from("requests")
        .update({ status: "playing" })
        .eq("id", next.id);
    }

    return NextResponse.json({
      ok: true,
      just_done: current?.id ?? null,
      now_playing: next?.id ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/play:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
