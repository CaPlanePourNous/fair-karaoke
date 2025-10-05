// app/api/host/start/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' };

export async function POST(req: Request) {
  const body = await req.json().catch(()=> ({}));
  const request_id = String(body.request_id || '');
  if (!request_id) return NextResponse.json({ error: 'request_id manquant' }, { status: 400, headers: noStore });

  // Terminer l’actuel "playing" s’il existe
  const cur = await sbServer.from('requests').select('id').eq('status','playing').maybeSingle();
  if (cur.data) {
    await sbServer.from('requests').update({ status:'done', played_at: new Date().toISOString() }).eq('id', cur.data.id);
  }

  // Retirer de la queue
  const q = await sbServer.from('queue').select('id, position').eq('request_id', request_id).single();
  if (q.data) {
    const pos = q.data.position;
    await sbServer.from('queue').delete().eq('id', q.data.id);
    // shift back
    const list = await sbServer.from('queue').select('id, position').gt('position', pos).order('position', { ascending: true });
    for (const row of (list.data||[])) {
      await sbServer.from('queue').update({ position: row.position - 1 }).eq('id', row.id);
    }
  }

  // Marquer en playing
  const upd = await sbServer.from('requests').update({ status:'playing', played_at: new Date().toISOString() }).eq('id', request_id);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500, headers: noStore });

  // (Option KaraFun plus tard) : si reqRow.karafun_id → fetch(`${process.env.BACKEND_SERVICE_URL}/play?kid=${...}`)

  return NextResponse.json({ ok:true }, { headers: noStore });
}
