import { sbServer } from '@/lib/supabaseServer';

export async function POST() {
  // marque le "playing" courant comme "done"
  const { data: cur } = await sbServer
    .from('requests')
    .select('id')
    .eq('status','playing')
    .order('updated_at', { ascending:false })
    .limit(1)
    .maybeSingle();

  if (!cur) return Response.json({ error: 'Aucun titre en cours.' }, { status:400 });

  const up = await sbServer
    .from('requests')
    .update({ status: 'done', played_at: new Date().toISOString() })
    .eq('id', cur.id);

  if (up.error) return Response.json({ error: up.error.message }, { status:400 });
  return Response.json({ ok:true });
}
