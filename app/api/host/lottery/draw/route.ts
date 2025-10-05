// app/api/host/lottery/draw/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function POST() {
  const today = new Date().toISOString().slice(0,10);

  // 1) Inscriptions du jour
  const { data: entries, error: e1 } = await sbServer
    .from('lottery_entries')
    .select('id, display_name')
    .eq('created_date', today);

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: 'Aucun inscrit aujourd’hui.' }, { status: 400 });
  }

  // 2) Winners du jour (on filtre par date côté DB pour éviter les histoires de fuseau)
  const { data: winners, error: e2 } = await sbServer
    .from('lottery_winners')
    .select('entry_id')
    .gte('created_at', `${today}T00:00:00Z`); // robuste et simple

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const wonSet = new Set((winners || []).map(w => w.entry_id));
  const pool = entries.filter(e => !wonSet.has(e.id));

  if (pool.length === 0) {
    return NextResponse.json({ error: 'Tous les inscrits du jour ont déjà gagné.' }, { status: 400 });
  }

  // 3) Tirage
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const winner_name = (pick.display_name || '').trim() || 'Gagnant·e';

  // 4) On crée le "winner" → déclenche Realtime côté joueurs
  const { data: win, error: e3 } = await sbServer
    .from('lottery_winners')
    .insert({ entry_id: pick.id })
    .select()
    .single();

  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
 
 // 5) IMPORTANT : on supprime l’inscription → impossible d’être re-tiré
  const { error: e4 } = await sbServer
    .from('lottery_entries')
    .delete()
    .eq('id', pick.id);

  if (e4) {
    // Non bloquant, mais on le signale
    console.error('delete lottery_entry failed:', e4.message);
  }

  // 6) Réponse claire (pas d’undefined côté UI)
  return NextResponse.json(
    {
      ok: true,
      entry_id: pick.id,
      winner_name,
      row: win,
    },
    { headers: noStore() }
  );
}

function noStore() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  };
}
