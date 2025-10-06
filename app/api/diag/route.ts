// app/api/diag/route.ts
import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const envs = {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      node: process.version,
    };

    // Clients Supabase (anon pour vérifier RLS basique, admin pour vérifier clé service)
    const sbAnon = createServerSupabaseClient();
    const sbAdmin = createAdminSupabaseClient();

    const anon = await sbAnon.from("settings").select("*").limit(1);
    const srv = await sbAdmin.from("settings").select("*").limit(1);

    return NextResponse.json({
      ok: true,
      envs,
      anonOk: !anon.error,
      serviceOk: !srv.error,
      anonErr: anon.error?.message ?? null,
      srvErr: srv.error?.message ?? null,
      sample: srv.data?.[0] ?? null,
    });
  } catch (e: unknown) {
    console.error("Erreur /api/diag :", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
