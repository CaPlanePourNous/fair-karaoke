import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const entry_id = req.nextUrl.searchParams.get("entry_id")?.trim();
    if (!entry_id) return NextResponse.json({ ok: false, error: "MISSING_ENTRY_ID" }, { status: 400 });

    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("lottery_winners")
      .select("entry_id, created_at")
      .eq("entry_id", entry_id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: "DB_SELECT_FAILED" }, { status: 500 });
    if (!data)  return NextResponse.json({ ok: true, won: false });

    return NextResponse.json({ ok: true, won: true, drawn_at: data.created_at });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
