// app/api/host/lottery/hide/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

export async function POST(req: Request) {
  const body = await req.json().catch(()=> ({}));
  const entry_id: string | undefined = body.entry_id;

  if (entry_id) {
    const { error } = await sbServer
      .from('lottery_winners')
      .delete()
      .eq('entry_id', entry_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // sinon : on masque le plus récent gagnant du jour
  const today = new Date().toISOString().slice(0,10);
  const { data, error } = await sbServer
    .from('lottery_winners')
    .select('id')
    .gte('created_at', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)   return NextResponse.json({ error: 'Aucun gagnant à masquer.' }, { status: 400 });

  const { error: e2 } = await sbServer
    .from('lottery_winners')
    .delete()
    .eq('id', data.id);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
