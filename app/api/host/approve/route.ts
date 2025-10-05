// app/api/host/approve/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const request_id = String(body.request_id || '');
  if (!request_id) return NextResponse.json({ error: 'request_id manquant' }, { status: 400 });

  // 0) Récupérer la demande
  const { data: reqRow, error: eReq } = await sbServer
    .from('requests')
    .select('*')
    .eq('id', request_id)
    .single();
  if (eReq || !reqRow) return NextResponse.json({ error: eReq?.message || 'Demande introuvable' }, { status: 404 });

  const ip = reqRow.ip_address;

  // 1) Queue actuelle (positions croissantes)
  const { data: queue, error: eQ } = await sbServer
    .from('queue')
    .select('request_id, position, requests(ip_address, display_name)')
    .order('position', { ascending: true });
  if (eQ) return NextResponse.json({ error: eQ.message }, { status: 500 });

  // 2) Identifier si "nouveau" aujourd’hui (n’a PAS de titre "done" today)
  const { count: playedToday, error: ePlayed } = await sbServer
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('status', 'done')
    .gte('played_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
  if (ePlayed) return NextResponse.json({ error: ePlayed.message }, { status: 500 });
  const isNewcomer = (playedToday ?? 0) === 0;

  // 3) Refroidissement 3 titres : trouver la dernière position de la même IP (queue + playing)
  let minPos = 1;

  // a) si quelque chose joue actuellement (status = playing), on considère sa "position virtuelle" = 0
  //    et si c'est la même IP, il faut laisser au moins 3 titres après
  const { data: playingReq } = await sbServer
    .from('requests')
    .select('ip_address')
    .eq('status', 'playing')
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (playingReq && playingReq.ip_address === ip) {
    minPos = Math.max(minPos, 4); // positions 1..3 doivent être d’autres IP
  }

  // b) regarder la dernière apparition de cette IP dans la queue
  let lastIpPos: number | null = null;
  for (const q of queue ?? []) {
    // @ts-ignore (joined)
    const qip = q.requests?.ip_address;
    if (qip === ip) lastIpPos = q.position;
  }
  if (lastIpPos != null) {
    minPos = Math.max(minPos, lastIpPos + 3);
  }

  // 4) Choisir la position cible
  //    - si "nouveau", on essaie la position la plus haute possible (>= minPos).
  //    - sinon, à la fin (>= minPos).
  const queueLen = (queue?.length || 0);
  let targetPos = queueLen + 1; // par défaut, fin de queue
  if (isNewcomer) {
    // on tente de se placer au plus haut compatible
    targetPos = Math.max(minPos, 1);
    // Et on évite d'invalider des newcomers déjà placés ; on peut rester simple ici,
    // les prochains newcomers remonteront aussi.
  } else {
    targetPos = Math.max(minPos, queueLen + 1);
  }

  // 5) Shift: position >= targetPos -> +1
  const { error: eShift } = await sbServer
    .from('queue')
    .update({ position: sbServer.rpc('noop') as any }) // hack pour forcer UPDATE; on refait avec SQL brut ci-dessous
    .gte('position', targetPos);
  // ↑ Supabase ne permet pas un "position = position + 1" simple via client.
  // On fait une requête SQL RPC simple à la place :

  // Solution fiable: run a single SQL to shift (via rpc)
  const { error: eShiftSql } = await sbServer.rpc('shift_queue_from_position', { p_position: targetPos });
  if (eShiftSql) {
    // si la fonction n’existe pas ou a échoué, on tente un fallback manuel
    // NOTE: si tu n’as pas la RPC, garde seulement ce bloc "fallback" et supprime le rpc ci-dessus
    const { data: toShift, error: eLoad } = await sbServer
      .from('queue')
      .select('id, position')
      .gte('position', targetPos)
      .order('position', { ascending: false });
    if (eLoad) return NextResponse.json({ error: eLoad.message }, { status: 500 });

    for (const row of toShift || []) {
      await sbServer.from('queue').update({ position: row.position + 1 }).eq('id', row.id);
    }
  }

  // 6) Insérer en queue à targetPos + mettre la demande "approved"
  const { error: eInsQ } = await sbServer.from('queue').insert({ request_id, position: targetPos });
  if (eInsQ) return NextResponse.json({ error: eInsQ.message }, { status: 500 });

  const { error: eUpdReq } = await sbServer.from('requests').update({ status: 'approved' }).eq('id', request_id);
  if (eUpdReq) return NextResponse.json({ error: eUpdReq.message }, { status: 500 });

  return NextResponse.json({ ok: true, position: targetPos, newcomer: isNewcomer });
}
