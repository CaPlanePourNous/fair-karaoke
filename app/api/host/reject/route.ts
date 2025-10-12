import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const runtime = 'nodejs'


const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
};

export async function POST(req: NextRequest) {
  try {
    const { request_id } = (await req.json().catch(() => ({}))) as {
      request_id?: string;
    };
    const id = (request_id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "request_id requis" },
        { status: 400, headers: noStore }
      );
    }

    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("requests")
      .update({ status: "rejected" })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: noStore });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Demande introuvable" }, { status: 404, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: data.id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
