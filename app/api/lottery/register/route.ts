// app/api/lottery/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";
import { detectProfanity } from "@/lib/profanity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  // @ts-ignore
  const direct = (req as any).ip as string | undefined;
  return direct?.trim() || null;
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

    // 🔒 Filtrage insultes
    {
      const hit = detectProfanity(display_name);
      if (hit) {
        return NextResponse.json(
          { ok: false, error: `Nom refusé : langage inapproprié (${hit.term}).` },
          { status: 400, headers: noStore }
        );
      }
    }

    const slug = (body.room_slug || "").trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400, headers: noStore });
    }

    const { data: room, error: roomErr } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (roomErr) {
      return NextResponse.json({ ok: false, error: roomErr.message }, { status: 500, headers: noStore });
    }
    if (!room) {
      return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404, headers: noStore });
    }

    const client_ip = getClientIp(req);

    // 🔒 Anti multi-inscription par IP
    if (client_ip) {
      const { data: ipExisting } = await db
        .from("lottery_entries")
        .select("entry_id")
        .eq("room_id", room.id)
        .eq("client_ip", client_ip)
        .maybeSingle();
      if (ipExisting?.entry_id) {
        return NextResponse.json(
          { ok: true, id: ipExisting.entry_id, note: "already_registered_ip" },
          { headers: noStore }
        );
      }
    }

    // Créer singer si besoin
    const { data: singer } = await db
      .from("singers")
      .select("id")
      .eq("room_id", room.id)
      .eq("display_name", display_name)
      .maybeSingle();

    let singer_id = singer?.id;
    if (!singer_id) {
      const { data: created } = await db
        .from("singers")
        .insert({ room_id: room.id, display_name })
        .select("id")
        .single();
      singer_id = created?.id;
    }

    const payload: any = { room_id: room.id, singer_id, display_name };
    if (client_ip) payload.client_ip = client_ip;

    const { data: entry, error: entryErr } = await db
      .from("lottery_entries")
      .insert(payload)
      .select("entry_id")
      .single();

    if (entryErr) {
      return NextResponse.json({ ok: false, error: entryErr.message }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: entry.entry_id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
