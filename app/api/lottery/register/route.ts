import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

// Essaie de déduire room_slug depuis le Referer (/room/<slug>)
function inferRoomSlug(req: NextRequest): string | null {
  const ref = req.headers.get("referer") || "";
  try {
    const u = new URL(ref);
    const m = u.pathname.match(/\/room\/([^\/\?\#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = (await req.json().catch(() => ({}))) as {
      display_name?: string;
      room_id?: string;
      room_slug?: string;
    };

    const display_name = (body.display_name || "").trim();
    if (!display_name) {
      return NextResponse.json({ ok: false, error: "display_name requis" }, { status: 400, headers: noStore });
    }

    // Résoudre room_id (ordre de priorité: body.room_id > body.room_slug > Referer)
    let room_id = (body.room_id || "").trim();
    if (!room_id) {
      const slug = (body.room_slug || inferRoomSlug(req) || "").trim();
      if (!slug) return NextResponse.json({ ok: false, error: "room_id ou room_slug requis" }, { status: 400, headers: noStore });
      const { data: room, error: eRoom } = await db.from("rooms").select("id").eq("slug", slug).maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!room) return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      room_id = room.id as string;
    }

    // Upsert chanteur (unicité (room_id, lower(trim(display_name))) assurée par l’index SQL)
    // On tente un select d’abord pour récupérer l'id
    const { data: existingSinger } = await db
      .from("singers")
      .select("id")
      .eq("room_id", room_id)
      .ilike("display_name", display_name) // tolérant à la casse
      .maybeSingle();

    let singer_id = existingSinger?.id as string | undefined;

    if (!singer_id) {
      const { data: created, error: eIns } = await db
        .from("singers")
        .insert({ room_id, display_name })
        .select("id")
        .maybeSingle();
      if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500, headers: noStore });
      singer_id = created?.id as string;
    }

    // Inscription lottery (unique par (room_id, singer_id))
    const { data: entry, error: eEntry } = await db
      .from("lottery_entries")
      .insert({ room_id, singer_id })
      .select("id")
      .maybeSingle();

    if (eEntry) {
      // Conflit d’unicité = déjà inscrit → on retourne OK + l’entry existante (on la cherche)
      if (eEntry.code === "23505") {
        const { data: existing } = await db
          .from("lottery_entries")
          .select("id")
          .eq("room_id", room_id)
          .eq("singer_id", singer_id!)
          .maybeSingle();
        if (existing) return NextResponse.json({ ok: true, id: existing.id, note: "déjà inscrit" }, { headers: noStore });
      }
      return NextResponse.json({ ok: false, error: eEntry.message }, { status: 500, headers: noStore });
    }

    // OK → renvoie l'id (pour l'abonnement Realtime)
    return NextResponse.json({ ok: true, id: entry?.id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
