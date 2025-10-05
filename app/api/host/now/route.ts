import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function GET() {
  const r = await sbServer
    .from('requests')
    .select('id,title,artist,display_name,status')
    .eq('status','playing')
    .order('played_at',{ ascending:false })
    .limit(1)
    .maybeSingle();

  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  return NextResponse.json({ now: r.data || null });
}
