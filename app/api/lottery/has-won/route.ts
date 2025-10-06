// app/api/lottery/has-won/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vérifie si une entry de loterie a gagné.
 * GET ?entry_id=<uuid>
 * Réponse: { ok: true, won: boolean, created_at?: string } | { ok: false, error }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entry_id = (searchParams.get("entry_id") || "").trim();

    if (!entry_id) {
      return NextResponse.json(
        { ok: false, error: "entry_id requis" },
        { status: 400 }
      );
    }

    const db = createAdminSupabaseClient();

    const { data: win, error } = await db
      .from("lottery_winners")
      .select("id, created_at")
      .eq("entry_id", entry_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!win) return NextResponse.json({ ok: true, won: false });

    return NextResponse.json({ ok: true, won: true, created_at: win.created_at });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
