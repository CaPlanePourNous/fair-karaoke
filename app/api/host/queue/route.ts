// app/api/host/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("room_slug")?.trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "MISSING_ROOM_SLUG" }, { status: 400 });
    }

    const db = admin();

    const { data: room, error: eRoom } = await db
      .from("rooms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (eRoom)  return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
    if (!room)  return NextResponse.json({ ok: false, error: "ROOM_NOT_FOUND" }, { status: 404 });

    const { data: rows, error: eQueue } = await db
      .from("requests")
      .select(`
        id, room_id, singer_id, title, artist, status, created_at, played_at,
        singers:singer_id ( id, name )
      `)
      .eq("room_id", room.id)
      .is("played_at", null)
      .order("created_at", { ascending: true });

    if (eQueue) return NextResponse.json({ ok: false, error: eQueue.message }, { status: 500 });

    return NextResponse.json({ ok: true, room_id: room.id, items: rows ?? [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
