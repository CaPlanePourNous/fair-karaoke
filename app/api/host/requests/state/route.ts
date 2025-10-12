import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const runtime = 'nodejs'


function isAfterCutoffParis(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return h > 23 || (h === 23 && m >= 45);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("room_slug") || "").trim();
    if (!slug) return NextResponse.json({ ok: false, error: "MISSING_SLUG" }, { status: 400 });

    const db = createAdminSupabaseClient();
    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id, requests_paused")
      .eq("slug", slug)
      .maybeSingle();

    if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room?.id) return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    const afterCutoff = isAfterCutoffParis();
    return NextResponse.json({
      ok: true,
      room_id: room.id,
      paused: !!room.requests_paused,
      afterCutoff,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
