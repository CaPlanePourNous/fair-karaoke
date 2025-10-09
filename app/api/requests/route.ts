import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { containsProfanity } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = await req.json().catch(() => ({}));

    const slug = (body.room_slug || "").trim();
    const display_name = (body.display_name || "").trim();
    const title = (body.title || "").trim();
    const artist = (body.artist || "").trim(); // peut valoir "Inconnu"
    const karafun_id = String(body.karafun_id || "").trim();

    if (!slug || !display_name) {
      return NextResponse.json({ ok: false, error: "MISSING_ROOM_OR_NAME" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ ok: false, error: "MISSING_TITLE" }, { status: 400 });
    }

    // Room
    const { data: room, error: eRoom } = await db
      .from("rooms").select("id").eq("slug", slug).maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Profanity (au cas où)
    const bad = containsProfanity(display_name);
    if (bad) return NextResponse.json({ ok: false, error: "DISPLAY_NAME_PROFANE" }, { status: 400 });

    // Trouver/créer singer à partir du display_name (flux historique)
    const { data: singer, error: eSel } = await db
      .from("singers").select("id").eq("room_id", room.id).eq("display_name", display_name).maybeSingle();
    if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });

    let singer_id = singer?.id as string | undefined;
    if (!singer_id) {
      const { data: created, error: eInsSinger } = await db
        .from("singers").insert({ room_id: room.id, display_name }).select("id").single();
      if (eInsSinger || !created?.id) {
        return NextResponse.json({ ok: false, error: eInsSinger?.message || "DB_INSERT_SINGER_FAILED" }, { status: 500 });
      }
      singer_id = created.id as string;
    }

    // Insert request
    const payload: any = {
      room_id: room.id,
      singer_id,
      title,
      artist: artist || "Inconnu",
      provider: karafun_id ? "karafun" : null,
      provider_track_id: karafun_id || null,
      status: "waiting",
      created_at: new Date().toISOString(),
    };

    const { data: ins, error: eIns } = await db
      .from("requests")
      .insert(payload)
      .select("id")
      .single();

    if (eIns || !ins?.id) {
      return NextResponse.json({ ok: false, error: eIns?.message || "DB_INSERT_REQUEST_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: ins.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
