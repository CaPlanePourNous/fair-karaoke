import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { containsProfanity } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IP depuis Vercel/Proxy
function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  // @ts-ignore (utile en local)
  return (req as any).ip?.trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = await req.json().catch(() => ({} as any));

    const room_slug = (body.room_slug || "").trim();
    const display_name = (body.display_name || "").trim();
    const singer_id = (body.singer_id || "").trim(); // facultatif si tu passes le nom

    // En provenance du catalogue (ton front l’envoie déjà)
    const provider = (body.provider || "karafun").trim();
    const track_id = String(body.track_id || body.karafun_id || "").trim();
    const title = (body.title || "").trim();
    const artist = (body.artist || "").trim();

    if (!room_slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });
    if (!title)     return NextResponse.json({ ok: false, error: "MISSING_TITLE" }, { status: 400 });
    if (provider !== "karafun" || !/^\d{2,}$/.test(track_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_TRACK" }, { status: 400 });
    }

    // Room
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", room_slug)
      .maybeSingle();
    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    // Singer (via id ou via nom propre)
    let effectiveSingerId = singer_id || "";
    if (!effectiveSingerId) {
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
      // si singer_id fourni, vérifie/modère son nom
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

    // 🔒 Anti-spam IP: 30s entre 2 inscriptions par IP dans la même salle
    const client_ip = getClientIp(req);
    if (client_ip) {
      // on lit la dernière demande de cette IP dans cette room
      const { data: lastReq, error: eLast } = await db
        .from("requests")
        .select("id, created_at")
        .eq("room_id", room.id)
        .eq("client_ip", client_ip)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!eLast && lastReq?.created_at) {
        const lastTs = new Date(lastReq.created_at).getTime();
        const now = Date.now();
        const delta = (now - lastTs) / 1000; // sec
        if (delta < 30) {
          // même message que ton UI sait afficher
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT_30S" },
            { status: 429 }
          );
        }
      }
    }

    // Insert request (on garde compat si les colonnes provider_* n'existent pas)
    const payload: any = {
      room_id: room.id,
      singer_id: effectiveSingerId,
      title,
      artist: artist || null,
    };
    if (client_ip) payload.client_ip = client_ip;
    // métadonnées catalogue (si colonnes présentes)
    const withProvider = {
      ...payload,
      provider: "karafun",
      provider_track_id: track_id,
      provider_url: `https://www.karafun.fr/search/?q=${encodeURIComponent(title)}`,
    };

    let ins = await db.from("requests").insert(withProvider).select("id").single();
    if (ins.error && (ins.error as any).code === "42703") {
      // colonnes provider_* absentes → fallback
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
