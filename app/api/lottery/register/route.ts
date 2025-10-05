// app/api/lottery/register/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase';

function getIP(req: Request) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  // @ts-ignore - Next dev server
  return (req as any).ip || '0.0.0.0';
}

function noStore() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const display_name = String(body.display_name || '').trim();
  if (!display_name) {
    return NextResponse.json({ error: 'Nom requis' }, { status: 400, headers: noStore() });
  }

  const ip = getIP(req);
  const today = new Date().toISOString().slice(0, 10);

  // déjà inscrit avec cette IP aujourd’hui ?
  const { count, error: e1 } = await sbServer
    .from('lottery_entries')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('created_date', today);

  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500, headers: noStore() });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Déjà inscrit aujourd’hui (1 inscription par appareil).' },
      { status: 409, headers: noStore() }
    );
  }

  // insertion
  const { data, error } = await sbServer
    .from('lottery_entries')
    .insert({ display_name, ip_address: ip })
    .select()
    .single();

  if (error) {
    // conflit d’unicité éventuel
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'Déjà inscrit aujourd’hui.' }, { status: 409, headers: noStore() });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: noStore() });
  }

  return NextResponse.json({ ok: true, id: data.id }, { headers: noStore() });
}
