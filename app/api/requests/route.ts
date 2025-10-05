// app/api/requests/route.ts
import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase'; // <- côté serveur (service key) OU remplace par client si tu préfères

function getIP(req: Request) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  // @ts-ignore
  return (req as any).ip || '0.0.0.0';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const display_name = String(body.display_name || '').trim();
    const title        = String(body.title || '').trim();
    const artist       = String(body.artist || '').trim();
    const karafun_id   = body.karafun_id ? String(body.karafun_id) : null;

    if (!display_name || !title || !artist) {
      return NextResponse.json({ error: 'Champs manquants.' }, { status: 400 });
    }

    const ip = getIP(req);

    // 1) Limite 2 titres actifs par IP (pending/approved)
    {
      const { count, error } = await sbServer
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .in('status', ['pending', 'approved']);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((count ?? 0) >= 2) {
        return NextResponse.json(
          { error: '2 titres actifs autorisés par appareil. Réessaie plus tard.' },
          { status: 400 }
        );
      }
    }

    // 2) Pas de doublon exact (titre+artiste) déjà en attente/lecture
    {
      const { count, error } = await sbServer
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .ilike('title', title)
        .ilike('artist', artist)
        .in('status', ['pending', 'approved']);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Ce titre est déjà en file. Choisis-en un autre.' },
          { status: 400 }
        );
      }
    }

    // 3) File pleine (>= 15 ≈ 45 min)
    {
      const { count, error } = await sbServer
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'approved', 'playing']);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((count ?? 0) >= 15) {
        return NextResponse.json(
          { error: 'La file dépasse ~45 minutes. Réessaie plus tard.' },
          { status: 400 }
        );
      }
    }

    // 4) Interdire un titre déjà chanté dans la soirée (par quiconque)
    {
      const { data, error } = await sbServer
        .from('requests')
        .select('id', { count: 'exact' })
        .ilike('title', title)
        .ilike('artist', artist)
        .in('status', ['playing', 'done'])  // déjà passé ce soir
        .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()); // depuis minuit
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((data?.length ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Ce titre a déjà été chanté ce soir. Choisis-en un autre.' },
          { status: 400 }
        );
      }
    }

    // 5) Insert
    const { data, error } = await sbServer
      .from('requests')
      .insert({
        display_name,
        title,
        artist,
        karafun_id,
        ip_address: ip,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 });
  }
}
