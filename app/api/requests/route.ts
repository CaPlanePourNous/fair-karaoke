import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { containsProfanity } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

function cleanText(s: unknown) {
  return String(s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = await req.json().catch(() => ({} as any));

    // Inputs
    const slug = cleanText(body.room_slug);
    const singer_id = cleanText(body.singer_id);
    const provider = cleanText(body.provider);
    const track_id = cleanText(body.track_id);
    const title = cleanText(body.title);
    const artist = cleanText(body.artist);

    // Sanity checks
    if (!slug || !singer_id) {
      return NextResponse.json({ ok: false, error: "MISSING_ROOM_OR_SINGER" }, { status: 400, headers: noStore });
    }
    if (provider !== "karafun" || !/^\d{2,}$/.test(track_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_TRACK" }, { status: 400, headers: noStore });
    }
    if (!title) {
      return NextResponse.json({ ok: false, error: "MISSING_TITLE" }, { status: 400, headers: noStore });
    }

    // Room existante ?
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message || "DB_SELECT_ROOM_FAILED" }, { status: 500, headers: noStore });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404, headers: noStore });

    // Singer existant ?
    const { data: singer, error: eS } = await db
      .from("singers")
      .select("display_name")
      .eq("id", singer_id)
      .maybeSingle();
    if (eS)        return NextResponse.json({ ok: false, error: eS.message || "DB_SELECT_SINGER_FAILED" }, { status: 500, headers: noStore });
    if (!singer)   return NextResponse.json({ ok: false, error: "SINGER_NOT_FOUND" }, { status: 404, headers: noStore });

    // 🔒 Garde-fou insultes (au cas où le pseudo a changé)
    const bad = containsProfanity(singer.display_name || "");
    if (bad) {
      return NextResponse.json(
        { ok: false, error: "DISPLAY_NAME_PROFANE", term: bad },
        { status: 400, headers: noStore }
      );
    }

    // Payload d'insert : on reste minimal
    const payload: any = {
      room_id: room.id,
      singer_id,
      title,
      artist: artist || null,
      provider: "karafun",
      provider_track_id: track_id,
      status: "waiting",
      created_at: new Date().toISOString(),
    };

    const { data: ins, error: eIns } = await db
      .from("requests")
      .insert(payload)
      .select("id")
      .single();

    if (eIns || !ins?.id) {
      return NextResponse.json({ ok: false, error: eIns?.message || "DB_INSERT_REQUEST_FAILED" }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: ins.id }, { status: 201, headers: noStore });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UNKNOWN" }, { status: 500, headers: { ...noStore } });
  }
}
