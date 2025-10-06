// app/api/ping/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

export async function GET() {
  const supabaseUrlOk = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonOk = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceOk = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // OK fonctionnel côté pages Host si au moins les clés publiques sont là.
  const ok = supabaseUrlOk && supabaseAnonOk;

  return NextResponse.json(
    {
      ok,
      env: {
        supabaseUrl: supabaseUrlOk,
        supabaseAnon: supabaseAnonOk,
        supabaseService: supabaseServiceOk, // utile côté API server-only
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      node: process.version,
      now: new Date().toISOString(),
    },
    { headers: noStore }
  );
}

// Petit bonus: permet un HEAD /api/ping sans payload (monitoring)
export async function HEAD() {
  return new Response(null, { headers: noStore });
}
