// app/api/lottery/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

type Body = {
  room_slug?: string;
  display_name?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { room_slug, display_name } = (await req.json().catch(() => ({}))) as Body;
    const slug = (room_slug || "").trim();
    const name = (display_name || "").trim();

    if (!slug || !name) {
      return NextResponse.json(
        { ok: false, error: "room_slug et display_name requis" },
        { status: 400, headers: noStore }
      );
    }

    const db = createAdminSupabaseClient();

    // 1) Résoudre la salle
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (eRoom) {
      return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
    }
    if (!room) {
      return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
    }

    // 2) Upsert inscription (évite les doublons par salle)
    //    ⚠️ Assure-toi d’avoir une contrainte unique: UNIQUE(room_id, lower(trim(display_name)))
    const { data, error } = await db
      .from("lottery_entries")
      .upsert(
        { room_id: room.id, display_name: name },
        { onConflict: "room_id,display_name" }
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: data.id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
