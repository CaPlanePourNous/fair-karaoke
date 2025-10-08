import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

// Récupère au mieux l'IP réelle (Vercel / proxies)
function getClientIp(req: NextRequest): string | null {
  // x-forwarded-for: "client, proxy1, proxy2"
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  // NextRequest.ip est parfois undefined en runtime node
  // @ts-ignore
  const direct = (req as any).ip as string | undefined;
  return direct?.trim() || null;
}

// Déduit /room/<slug> depuis le Referer si besoin (fallback)
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
      return NextResponse.json({ ok: false, error: "MISSING_DISPLAY_NAME" }, { status: 400, headers: noStore });
    }

    // Résoudre room_id (priorité: body.room_id > body.room_slug > referer)
    let room_id = (body.room_id || "").trim();
    if (!room_id) {
      const slug = (body.room_slug || inferRoomSlug(req) || "").trim();
      if (!slug) return NextResponse.json({ ok: false, error: "MISSING_ROOM" }, { status: 400, headers: noStore });
      const { data: room, error: eRoom } = await db.from("rooms").select("id").eq("slug", slug).maybeSingle();
      if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message || "DB_SELECT_ROOM_FAILED" }, { status: 500, headers: noStore });
      if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404, headers: noStore });
      room_id = room.id as string;
    }

    // IP du client (peut être null si introuvable)
    const client_ip = getClientIp(req);

    // 🔒 Anti multi-inscription par IP (même room)
    if (client_ip) {
      const { data: ipExisting, error: ipSelErr } = await db
        .from("lottery_entries")
        .select("entry_id")
        .eq("room_id", room_id)
        .eq("client_ip", client_ip)
        .maybeSingle();

      if (ipSelErr) {
        return NextResponse.json({ ok: false, error: "DB_SELECT_IP_FAILED" }, { status: 500, headers: noStore });
      }
      if (ipExisting?.entry_id) {
        return NextResponse.json(
          { ok: true, id: ipExisting.entry_id, note: "already_registered_ip" },
          { headers: noStore }
        );
      }
    }

    // Trouver/créer le singer (unicité simple room_id + display_name existante)
    const { data: existingSinger, error: selSingerErr } = await db
      .from("singers")
      .select("id")
      .eq("room_id", room_id)
      .eq("display_name", display_name)
      .maybeSingle();
    if (selSingerErr) return NextResponse.json({ ok: false, error: "DB_SELECT_SINGER_FAILED" }, { status: 500, headers: noStore });

    let singer_id = existingSinger?.id as string | undefined;
    if (!singer_id) {
      const { data: createdSinger, error: insSingerErr } = await db
        .from("singers")
        .insert({ room_id, display_name })
        .select("id")
        .single();
      if (insSingerErr || !createdSinger?.id) {
        return NextResponse.json({ ok: false, error: insSingerErr?.message || "DB_INSERT_SINGER_FAILED" }, { status: 500, headers: noStore });
      }
      singer_id = createdSinger.id as string;
    }

    // Inscription loterie (enregistrant l'IP si on l'a)
    const payload: any = { room_id, singer_id, display_name };
    if (client_ip) payload.client_ip = client_ip;

    const { data: entry, error: entryErr } = await db
      .from("lottery_entries")
      .insert(payload)
      .select("entry_id")
      .single();

    if (entryErr) {
      // Conflit d’unicité : IP déjà inscrite OU singer déjà inscrit
      if ((entryErr as any)?.code === "23505") {
        // On tente d’abord par IP si on l’a :
        if (client_ip) {
          const { data: ipAgain } = await db
            .from("lottery_entries")
            .select("entry_id")
            .eq("room_id", room_id)
            .eq("client_ip", client_ip)
            .maybeSingle();
          if (ipAgain?.entry_id) {
            return NextResponse.json(
              { ok: true, id: ipAgain.entry_id, note: "already_registered_ip" },
              { headers: noStore }
            );
          }
        }
        // Sinon par singer (comportement précédent)
        const { data: existingEntry } = await db
          .from("lottery_entries")
          .select("entry_id")
          .eq("room_id", room_id)
          .eq("singer_id", singer_id!)
          .maybeSingle();

        if (existingEntry?.entry_id) {
          return NextResponse.json(
            { ok: true, id: existingEntry.entry_id, note: "already_registered" },
            { headers: noStore }
          );
        }
      }
      return NextResponse.json({ ok: false, error: entryErr.message || "DB_INSERT_ENTRY_FAILED" }, { status: 500, headers: noStore });
    }

    if (!entry?.entry_id) {
      return NextResponse.json({ ok: false, error: "DB_INSERT_ENTRY_NO_ID" }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: entry.entry_id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
