import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

// Déduit /room/<slug> depuis le Referer si besoin
function inferRoomSlug(req: NextRequest): string | null {
  const ref = req.headers.get("referer") || "";
  try {
    const u = new URL(ref);
    const m = u.pathname.match(/\/room\/([^\/\?\#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
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
      return NextResponse.json(
        { ok: false, error: "MISSING_DISPLAY_NAME" },
        { status: 400, headers: noStore }
      );
    }

    // Résoudre room_id: room_id > room_slug > Referer
    let room_id = (body.room_id || "").trim();
    if (!room_id) {
      const slug = (body.room_slug || inferRoomSlug(req) || "").trim();
      if (!slug) {
        return NextResponse.json(
          { ok: false, error: "MISSING_ROOM" },
          { status: 400, headers: noStore }
        );
      }
      const { data: room, error: roomErr } = await db
        .from("rooms")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (roomErr) {
        return NextResponse.json(
          { ok: false, error: roomErr.message || "DB_SELECT_ROOM_FAILED" },
          { status: 500, headers: noStore }
        );
      }
      if (!room) {
        return NextResponse.json(
          { ok: false, error: "ROOM_NOT_FOUND" },
          { status: 404, headers: noStore }
        );
      }
      room_id = room.id as string;
    }

    // 1) Trouver ou créer le singer (unicité simple par room_id + display_name)
    const { data: existingSinger, error: selSingerErr } = await db
      .from("singers")
      .select("id")
      .eq("room_id", room_id)
      .eq("display_name", display_name)
      .maybeSingle();

    if (selSingerErr) {
      return NextResponse.json(
        { ok: false, error: "DB_SELECT_SINGER_FAILED" },
        { status: 500, headers: noStore }
      );
    }

    let singer_id = existingSinger?.id as string | undefined;

    if (!singer_id) {
      const { data: createdSinger, error: insSingerErr } = await db
        .from("singers")
        .insert({ room_id, display_name })
        .select("id")
        .single(); // on exige une ligne

      if (insSingerErr || !createdSinger?.id) {
        return NextResponse.json(
          { ok: false, error: insSingerErr?.message || "DB_INSERT_SINGER_FAILED" },
          { status: 500, headers: noStore }
        );
      }
      singer_id = createdSinger.id as string;
    }

    // 2) Inscrire dans la loterie
    //    ⚠️ ICI on sélectionne 'entry_id' (et pas 'id')
    const { data: entry, error: entryErr } = await db
      .from("lottery_entries")
      .insert({ room_id, singer_id, display_name })
      .select("entry_id")
      .single();

    if (entryErr) {
      // Conflit d’unicité → déjà inscrit : on relit l'entry_id
      if ((entryErr as any)?.code === "23505") {
        const { data: existingEntry, error: findErr } = await db
          .from("lottery_entries")
          .select("entry_id")
          .eq("room_id", room_id)
          .eq("singer_id", singer_id!)
          .single();

        if (findErr || !existingEntry?.entry_id) {
          return NextResponse.json(
            { ok: false, error: findErr?.message || "DB_SELECT_ENTRY_FAILED" },
            { status: 500, headers: noStore }
          );
        }
        return NextResponse.json(
          { ok: true, id: existingEntry.entry_id, note: "already_registered" },
          { headers: noStore }
        );
      }

      return NextResponse.json(
        { ok: false, error: entryErr.message || "DB_INSERT_ENTRY_FAILED" },
        { status: 500, headers: noStore }
      );
    }

    if (!entry?.entry_id) {
      return NextResponse.json(
        { ok: false, error: "DB_INSERT_ENTRY_NO_ID" },
        { status: 500, headers: noStore }
      );
    }

    // Réponse stable: on renvoie 'id' = entry_id (pour le client)
    return NextResponse.json({ ok: true, id: entry.entry_id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
