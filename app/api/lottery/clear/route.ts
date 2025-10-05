import { sbServer } from '@/lib/supabaseServer';

export async function POST(req: Request){
  const { entry_id } = await req.json();
  if (!entry_id) return Response.json({ error:'entry_id manquant' }, { status:400 });

  const del = await sbServer.from('lottery_winners').delete().eq('entry_id', entry_id);
  if (del.error) return Response.json({ error: del.error.message }, { status:400 });

  return Response.json({ ok:true });
}
