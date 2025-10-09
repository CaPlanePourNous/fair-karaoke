// app/api/requests/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/requests/:id  --> soft delete: status = 'removed'
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const db = createAdminSupabaseClient();

  // Vérifie que la requête existe
  const { data: reqRow, error: eSel } = await db
    .from("requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ ok: false, error: "REQUEST_NOT_FOUND" }, { status: 404 });

  // Soft delete
  const { error: eUpd } = await db
    .from("requests")
    .update({ status: "removed", deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (eUpd) return NextResponse.json({ ok: false, error: eUpd.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
