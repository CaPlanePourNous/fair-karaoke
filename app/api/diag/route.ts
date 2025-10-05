// app/api/diag/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabaseServer';
import { sb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envs = {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    node: process.version,
  };

  const anon = await sb.from('settings').select('*').limit(1);
  const srv  = await sbServer.from('settings').select('*').limit(1);

  return NextResponse.json({
    envs,
    anonOk: !anon.error,
    serviceOk: !srv.error,
    anonErr: anon.error?.message || null,
    srvErr: srv.error?.message || null,
    sample: srv.data?.[0] || null,
  });
}
