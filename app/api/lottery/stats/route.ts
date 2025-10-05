// app/api/lottery/stats/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function GET() {
  // Bornes [today 00:00, tomorrow 00:00)
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const { count, error } = await sbServer
    .from('lottery_entries')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString());

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: noStore() }
    );
  }
  return NextResponse.json({ count: count ?? 0 }, { headers: noStore() });
}

function noStore() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  };
}
