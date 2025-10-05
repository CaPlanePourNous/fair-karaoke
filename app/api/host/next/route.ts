// app/api/host/next/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' };

export async function POST() {
  // terminer actuel
  const cur = await sbServer.from('requests').select('id').eq('status','playing').maybeSingle();
  if (cur.data) {
    await sbServer.from('requests').update({ status:'done', played_at: new Date().toISOString() }).eq('id', cur.data.id);
  }
  // prendre position 1
  const q1 = await sbServer
    .from('queue')
    .select('id, request_id')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!q1.data) {
    return NextResponse.json({ ok:true, message:'Queue vide' }, { headers: noStore });
  }

  // retirer de la queue (et resequencer)
  const del = await sbServer.from('queue').delete().eq('id', q1.data.id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500, headers: noStore });
  // resequencer (simple : décrémente tout > 1)
  const rest = await sbServer.from('queue').select('id, position').gt('position', 1).order('position',{ascending:true});
  for (const row of (rest.data||[])) {
    await sbServer.from('queue').update({ position: row.position - 1 }).eq('id', row.id);
  }

  // set playing
  const upd = await sbServer.from('requests').update({ status:'playing', played_at: new Date().toISOString() }).eq('id', q1.data.request_id);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500, headers: noStore });

  return NextResponse.json({ ok:true, request_id: q1.data.request_id }, { headers: noStore });
}
