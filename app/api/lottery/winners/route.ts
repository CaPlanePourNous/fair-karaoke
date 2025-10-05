// app/api/lottery/winners/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function GET() {
  // On récupère les derniers gagnants
  const { data: wins, error } = await sbServer
    .from('lottery_winners')
    .select('entry_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // On renvoie une liste vide mais avec no-store, pour éviter de mettre en cache une erreur
    return NextResponse.json([], { headers: noStore() });
  }

  const ids = (wins ?? []).map(w => w.entry_id);
  if (ids.length === 0) {
    return NextResponse.json([], { headers: noStore() });
  }

  // Rattache les noms
  const { data: entries } = await sbServer
    .from('lottery_entries')
    .select('id, display_name')
    .in('id', ids);

  const byId = new Map((entries ?? []).map(e => [e.id, e.display_name]));
  const out = (wins ?? []).map(w => ({
    entry_id: w.entry_id,
    display_name: byId.get(w.entry_id) || '(?)',
    created_at: w.created_at,
  }));

  return NextResponse.json(out, { headers: noStore() });
}

function noStore() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  };
}
