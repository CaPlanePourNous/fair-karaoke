import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

export async function POST(req: NextRequest) {
  try {
    const { id, request_id } = (await req.json().catch(() => ({}))) as { id?: string; request_id?: string };
    const target = (id || request_id || "").trim();
    if (!target) return NextResponse.json({ ok: false, error: "id (ou request_id) requis" }, { status: 400, headers: noStore });

    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("requests")
      .update({ status: "done", played_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", target)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: noStore });
    if (!data) return NextResponse.json({ ok: false, error: "Demande introuvable" }, { status: 404, headers: noStore });

    return NextResponse.json({ ok: true, id: data.id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
