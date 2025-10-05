import { sbServer } from '@/lib/supabaseServer';

export async function POST() {
  const e1 = await sbServer.from('lottery_entries').select('id,display_name');
  const w1 = await sbServer.from('lottery_winners').select('entry_id');
  if (e1.error || w1.error) {
    const err = (e1.error||w1.error)!.message;
    return Response.json({ error: err }, { status:500 });
  }

  const won = new Set((w1.data||[]).map(r => r.entry_id));
  const pool = (e1.data||[]).filter(e => !won.has(e.id));
  if (pool.length === 0) return Response.json({ error: 'Aucun candidat disponible.' }, { status: 400 });

  const pick = pool[Math.floor(Math.random()*pool.length)];
  const ins = await sbServer.from('lottery_winners').insert({ entry_id: pick.id }).select('id').single();
  if (ins.error) return Response.json({ error: ins.error.message }, { status:400 });

  return Response.json({ ok:true, winner: pick });
}
