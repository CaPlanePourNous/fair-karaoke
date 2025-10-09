import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { containsProfanity } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = await req.json().catch(() => ({} as any));

    const room_slug = (body.room_slug || "").trim();
    const display_name = (body.display_name || "").trim();
    const singer_id = (body.singer_id || "").trim(); // OK si tu envoies directement singer_id

    // Demande via catalogue obligatoire
    const provider = (body.provider || "").trim();       // "karafun"
    const track_id = String(body.track_id || body.karafun_id || "").trim(); // id numérique attendu
    const title = (body.title || "").trim();
    const artist = (body.artist || "").trim();

    if (!room_slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });
    if (!title)     return NextResponse.json({ ok: false, error: "MISSING_TITLE" }, { status: 400 });
    if (provider !== "karafun" || !/^\d{2,}$/.test(track_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_TRACK" }, { status: 400 });
    }

    // 1) Room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", room_slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // 2) Singer
    let effectiveSingerId = singer_id;
    if (!effectiveSingerId) {
      // Si front n’envoie pas singer_id, on le retrouve/crée via display_name (back compat)
      if (!display_name) {
        return NextResponse.json({ ok: false, error: "MISSING_SINGER" }, { status: 400 });
      }
      const bad = containsProfanity(display_name);
      if (bad) {
        return NextResponse.json(
          { ok: false, error: "DISPLAY_NAME_PROFANE", term: bad },
          { status: 400 }
        );
      }
      // chercher chanteur
      const { data: existing, error: eSel } = await db
        .from("singers")
        .select("id")
        .eq("room_id", room.id)
        .eq("display_name", display_name)
        .maybeSingle();
      if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });

      if (existing?.id) {
        effectiveSingerId = existing.id as string;
      } else {
        const { data: created, error: eInsSinger } = await db
          .from("singers")
          .insert({ room_id: room.id, display_name })
          .select("id")
          .single();
        if (eInsSinger || !created?.id) {
          return NextResponse.json(
            { ok: false, error: eInsSinger?.message || "DB_INSERT_SINGER_FAILED" },
            { status: 500 }
          );
        }
        effectiveSingerId = created.id as string;
      }
    } else {
      // si singer_id fourni, on vérifie et filtre son nom (au cas où)
      const { data: s, error: eS } = await db
        .from("singers")
        .select("display_name")
        .eq("id", effectiveSingerId)
        .maybeSingle();
      if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 500 });
      if (!s) return NextResponse.json({ ok: false, error: "SINGER_NOT_FOUND" }, { status: 404 });
      const bad = containsProfanity(s.display_name || "");
      if (bad) {
        return NextResponse.json(
          { ok: false, error: "DISPLAY_NAME_PROFANE", term: bad },
          { status: 400 }
        );
      }
    }

    // 3) Insert request (on tente avec colonnes provider_*, fallback sans si la DB ne les a pas)
    const withProvider: any = {
      room_id: room.id,
      singer_id: effectiveSingerId,
      title,
      artist: artist || null,
      provider: "karafun",
      provider_track_id: track_id,
      provider_url: `https://www.karafun.fr/search/?q=${encodeURIComponent(title)}`,
    };

    let ins = await db.from("requests").insert(withProvider).select("id").single();

    // colonne inconnue → fallback sans les provider_*
    if (ins.error && (ins.error as any).code === "42703") {
      const { provider, provider_track_id, provider_url, ...fallback } = withProvider;
      ins = await db.from("requests").insert(fallback).select("id").single();
    }

    if (ins.error || !ins.data?.id) {
      return NextResponse.json(
        { ok: false, error: ins.error?.message || "DB_INSERT_REQUEST_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: ins.data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
