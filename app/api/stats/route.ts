import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function GET() {
  const { count, error } = await sbServer
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending','approved']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total_waiting = count ?? 0;
  const est_minutes = total_waiting * 3;
  return NextResponse.json({ total_waiting, est_minutes });
}
