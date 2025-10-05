// app/api/host/reject/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function POST(req: Request) {
  const { request_id } = await req.json().catch(()=> ({}));
  if (!request_id) return NextResponse.json({ error: 'request_id manquant' }, { status: 400 });

  const { error } = await sbServer
    .from('requests')
    .update({ status: 'rejected' })
    .eq('id', request_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
