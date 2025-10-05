// app/api/host/state/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function GET() {
  const [p1, p2] = await Promise.all([
    sbServer.from('requests')
      .select('id, display_name, title, artist, status, created_at')
      .eq('status','pending')
      .order('created_at', { ascending: true }),
    sbServer.from('queue')
      .select(`
        id, position, display_name,
        requests!inner(id, title, artist)
      `)
      .order('position', { ascending: true })
  ]);

  if (p1.error) return NextResponse.json({ error: p1.error.message }, { status: 500 });
  if (p2.error) return NextResponse.json({ error: p2.error.message }, { status: 500 });

  const queue = (p2.data || []).map((q:any) => ({
    qid: q.id,
    request_id: q.requests.id,
    display_name: q.display_name,
    title: q.requests.title,
    artist: q.requests.artist,
    position: q.position
  }));

  return NextResponse.json({
    pending: p1.data || [],
    queue
  });
}
