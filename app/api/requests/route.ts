// app/api/requests/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabaseServer';
import { detectProfanity } from '@/lib/profanity';

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

// 🔧 util cutoff (Europe/Paris)
function isAfterCutoffParis(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return h > 23 || (h === 23 && m >= 45);
}

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  const xr = req.headers.get('x-real-ip');
  if (xr) return xr.trim();
  return '0.0.0.0';
}

function inferRoomSlugFromReferer(req: NextRequest): string | null {
  const ref = req.headers.get('referer') || '';
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

    // 🔒 verrouillage horaire (23:45 Europe/Paris et après)
    if (isAfterCutoffParis()) {
      return NextResponse.json(
        { ok: false, error: "INSCRIPTIONS_CLOSED_CUTOFF" },
        { status: 403 }
      );
    }

    // 🔒 verrouillage manuel (bouton Host)
    {
      const { data: state, error: eState } = await db
        .from("rooms")
        .select("requests_paused")
        .eq("id", roomId)
        .maybeSingle();
      if (eState) return NextResponse.json({ ok: false, error: eState.message }, { status: 500 });
      if (state?.requests_paused) {
        return NextResponse.json(
          { ok: false, error: "INSCRIPTIONS_PAUSED" },
          { status: 403 }
        );
      }
    }

    // 2) Trouver/créer le chanteur si singer_id non fourni
    let singerId = (body.singer_id || '').trim();

    // Normalisation nom + filtre insultes
    const normName = (body.display_name || '').trim().replace(/\s+/g, ' ');
    {
      const hit = detectProfanity(normName);
      if (hit) {
        return NextResponse.json(
          { ok: false, error: `Nom refusé : langage inapproprié (${hit.term}).` },
          { status: 400 }
        );
      }
    }

    if (!singerId) {
      if (!normName) {
        return NextResponse.json({ ok: false, error: 'display_name ou singer_id requis' }, { status: 400 });
      }

      // 2.a — Chercher un chanteur existant portant *ce nom* (insensible à la casse) dans la même salle
      const { data: existing, error: eSel } = await db
        .from('singers')
        .select('id, ip')
        .eq('room_id', roomId)
        .ilike('display_name', normName)
        .maybeSingle();
      if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 500 });

      if (existing?.id) {
        // 2.b — Le nom existe déjà : autorisé uniquement si c’est *la même IP*
        if (existing.ip && existing.ip !== ip) {
          return NextResponse.json(
            { ok: false, error: 'NAME_TAKEN_BY_OTHER_IP' },
            { status: 409 }
          );
        }
        // Même IP (ou IP inconnue sur l’ancien enregistrement) => on réutilise
        singerId = existing.id as string;

        // (facultatif) s.ip vide -> on l’attache à l’IP actuelle pour la suite
        if (!existing.ip) {
          await db.from('singers').update({ ip }).eq('id', singerId);
        }
      } else {
        // 2.c — Le nom n’existe pas : on crée le chanteur, rattaché à *cette* IP
        const ins = await db
          .from('singers')
          .insert({ room_id: roomId, display_name: normName, ip, is_present: true })
          .select('id')
          .single();

        if (ins.error) {
          // En cas de concurrence et d’unicité, on retente en SELECT pour vérifier l’IP
          const msg = (ins.error.message || '').toLowerCase();
          const isUnique =
            msg.includes('duplicate key value') ||
            msg.includes('unique constraint');

          if (!isUnique) {
            return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
          }

          const { data: ex2, error: e2 } = await db
            .from('singers')
            .select('id, ip')
            .eq('room_id', roomId)
            .ilike('display_name', normName)
            .maybeSingle();
          if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
          if (!ex2?.id) {
            return NextResponse.json({ ok: false, error: 'SINGER_UNIQUE_CONFLICT' }, { status: 500 });
          }
          if (ex2.ip && ex2.ip !== ip) {
            return NextResponse.json(
              { ok: false, error: 'NAME_TAKEN_BY_OTHER_IP' },
              { status: 409 }
            );
          }
          singerId = ex2.id as string;
          if (!ex2.ip) {
            await db.from('singers').update({ ip }).eq('id', singerId);
          }
        } else {
          singerId = ins.data!.id as string;
        }
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

    // 5) Règles IP — (a) max 2 demandes actives (waiting + playing), (b) cooldown 30s
    {
      const { count, error } = await db
        .from('requests')
        .select('*', { head: true, count: 'exact' })
        .eq('room_id', roomId)
        .eq('ip', ip)
        .in('status', ['waiting', 'playing']);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if ((count ?? 0) >= 2) {
        return NextResponse.json({ ok: false, error: '2 chansons max par appareil.' }, { status: 400 });
      }

      const { data: last, error: eLast } = await db
        .from('requests')
        .select('created_at')
        .eq('room_id', roomId)
        .eq('ip', ip)
        .order('created_at', { ascending: false })
        .limit(1);
      if (eLast) return NextResponse.json({ ok: false, error: eLast.message }, { status: 500 });
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
        singer: normName || null,
        title,
        artist,
        karafun_id,
        ip,
        status: 'waiting',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (eInsReq) return NextResponse.json({ ok: false, error: eInsReq.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: insReq.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Erreur /api/requests:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
