// app/api/requests/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  room_slug?: string;
  room_id?: string;
  singer_id?: string;
  display_name?: string;
  title?: string;
  artist?: string;
  karafun_id?: string | null;
};

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  const xr = req.headers.get('x-real-ip');
  if (xr) return xr.trim();
  return '0.0.0.0';
}

function inferRoomSlugFromReferer(req: NextRequest): string | null {
  const ref = req.headers.get('referer') || '';
  // ex: https://site/room/lantignie → slug=lantignie
  const m = ref.match(/\/room\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export async function POST(req: NextRequest) {
  const db = createAdminSupabaseClient();

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const ip = getClientIp(req);

    const title = (body.title || '').trim();
    const artist = (body.artist || '').trim();
    const karafun_id = body.karafun_id ?? null;

    if (!title || !artist) {
      return NextResponse.json({ ok: false, error: 'Champs manquants (title, artist).' }, { status: 400 });
    }

    // 1) Résoudre la salle (slug prioritaire, sinon id, sinon referer)
    let roomId = (body.room_id || '').trim();
    if (!roomId) {
      let slug = (body.room_slug || '').trim();
      if (!slug) slug = inferRoomSlugFromReferer(req) || '';
      if (!slug) {
        return NextResponse.json({ ok: false, error: 'room_slug requis (ou déduction impossible)' }, { status: 400 });
      }
      const { data: room, error: eRoom } = await db
        .from('rooms')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500 });
      if (!room) return NextResponse.json({ ok: false, error: 'Salle inconnue' }, { status: 404 });
      roomId = room.id as string;
    }

    // 2) Trouver/créer le chanteur si singer_id non fourni
    let singerId = (body.singer_id || '').trim();
    const displayName = (body.display_name || '').trim();
    if (!singerId) {
      if (!displayName) {
        return NextResponse.json({ ok: false, error: 'display_name ou singer_id requis' }, { status: 400 });
      }
      const { data: existing } = await db
        .from('singers')
        .select('id')
        .eq('room_id', roomId)
        .eq('display_name', displayName)
        .maybeSingle();

      if (existing?.id) {
        singerId = existing.id as string;
      } else {
        const { data: ins, error: eIns } = await db
          .from('singers')
          .insert({ room_id: roomId, display_name: displayName, is_present: true })
          .select('id')
          .single();
        if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500 });
        singerId = ins.id as string;
      }
    }

    // 3) R5 — doublon (même titre+artiste) dans la salle, incluant done
    {
      const { count, error } = await db
        .from('requests')
        .select('*', { head: true, count: 'exact' })
        .eq('room_id', roomId)
        .eq('title', title)
        .eq('artist', artist)
        .in('status', ['waiting', 'playing', 'done']);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if ((count ?? 0) > 0) {
        return NextResponse.json({ ok: false, error: 'Titre déjà présent (doublon interdit).' }, { status: 400 });
      }
    }

    // 4) R1 — max 2 chansons par chanteur (waiting + playing)
    {
      const { count, error } = await db
        .from('requests')
        .select('*', { head: true, count: 'exact' })
        .eq('room_id', roomId)
        .eq('singer_id', singerId)
        .in('status', ['waiting', 'playing']);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if ((count ?? 0) >= 2) {
        return NextResponse.json({ ok: false, error: '2 chansons max par chanteur.' }, { status: 400 });
      }
    }

    // 5) Anti-spam IP — ≥30s entre 2 demandes de la même IP (dans cette salle)
    {
      const { data: last } = await db
        .from('requests')
        .select('created_at')
        .eq('room_id', roomId)
        .eq('ip', ip)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastAt = last?.[0]?.created_at ? Date.parse(last[0].created_at as any) : 0;
      if (lastAt && Date.now() - lastAt < 30_000) {
        return NextResponse.json({ ok: false, error: 'Merci d’attendre 30s avant une nouvelle demande.' }, { status: 400 });
      }
    }

    // 6) R4 — file limitée à 15 (waiting uniquement)
    {
      const { count, error } = await db
        .from('requests')
        .select('*', { head: true, count: 'exact' })
        .eq('room_id', roomId)
        .eq('status', 'waiting');
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if ((count ?? 0) >= 15) {
        return NextResponse.json({ ok: false, error: 'File d’attente pleine (15 titres max).' }, { status: 400 });
      }
    }

    // 7) Insert
    const { data: insReq, error: eInsReq } = await db
      .from('requests')
      .insert({
        room_id: roomId,
        singer_id: singerId,
        // Fallback legacy si ta table a encore la colonne texte `singer`
        singer: displayName || null,
        title,
        artist,
        karafun_id,
        ip,
        status: 'waiting',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (eInsReq) {
      return NextResponse.json({ ok: false, error: eInsReq.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: insReq.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Erreur /api/requests:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}