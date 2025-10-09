import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/requests/:id  → suppression définitive
export async function DELETE(req: NextRequest) {
  // Récupérer l'id depuis l'URL (sans utiliser le paramètre context)
  const url = new URL(req.url);
  // .../api/requests/<id> → on prend le dernier segment non vide
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[segments.length - 1];

  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const db = createAdminSupabaseClient();

  // Vérifier l’existence (404 propre)
  const { data: row, error: eSel } = await db
    .from("requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (eSel) {
    return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "REQUEST_NOT_FOUND" }, { status: 404 });
  }

  // Suppression
  const { error: eDel } = await db
    .from("requests")
    .delete()
    .eq("id", id);

  if (eDel) {
    return NextResponse.json({ ok: false, error: eDel.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
