// app/api/done/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      room_slug?: string;
    };

    const db = createAdminSupabaseClient();

    let targetId = body.id as string | undefined;

    // Si pas d'id fourni, on essaie via room_slug → on prend la chanson "playing" de cette salle
    if (!targetId) {
      if (!body.room_slug) {
        return NextResponse.json(
          { ok: false, error: "Missing 'id' or 'room_slug'." },
          { status: 400 }
        );
      }

      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", body.room_slug)
        .maybeSingle();

      if (eRoom) {
        return NextResponse.json(
          { ok: false, error: eRoom.message },
          { status: 500 }
        );
      }
      if (!room) {
        return NextResponse.json(
          { ok: false, error: "Room not found." },
          { status: 404 }
        );
      }

      const { data: cur, error: eCur } = await db
        .from("requests")
        .select("id")
        .eq("room_id", room.id)
        .eq("status", "playing")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eCur) {
        return NextResponse.json(
          { ok: false, error: eCur.message },
          { status: 500 }
        );
      }
      if (!cur) {
        return NextResponse.json(
          { ok: false, error: "Aucun titre en cours." },
          { status: 400 }
        );
      }

      targetId = cur.id as string;
    }

    // Marquer en "done"
    const { error: eUp } = await db
      .from("requests")
      .update({
        status: "done",
        played_at: new Date().toISOString(),
      })
      .eq("id", targetId);

    if (eUp) {
      return NextResponse.json(
        { ok: false, error: eUp.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, idDone: targetId });
  } catch (e: unknown) {
    console.error("Erreur /api/done :", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
