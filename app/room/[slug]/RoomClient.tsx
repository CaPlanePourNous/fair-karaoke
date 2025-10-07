'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

type Suggestion = {
  title: string;
  artist: string;
  karafun_id?: string;
  url?: string;
};

// --- Supabase côté client (clé publique)
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Storage entry_id pour la loterie
function saveEntryId(id: string) {
  try { localStorage.setItem('lottery_entry_id', id); } catch {}
}
function loadEntryId() {
  try { return localStorage.getItem('lottery_entry_id'); } catch { return null; }
}

// --- Mapping d’erreurs techniques → messages clairs
function toUserMessage(raw: unknown): string {
  const s = String(raw || '').toLowerCase();

  // Doublon de nom dans la salle
  if (s.includes('singers_room_name_unique')) {
    return "Ce nom est déjà utilisé ici. Ajoute une initiale ou choisis un autre nom.";
  }

  // Doublon d’inscription au tirage
  if (s.includes('lottery_entries') && s.includes('duplicate')) {
    return "Tu es déjà inscrit au tirage 😉";
  }

  // Doublon de chanson (inclut “déjà chanté ce soir”)
  if (
    s.includes('duplicate key value') ||
    s.includes('unique constraint') ||
    s.includes('titre déjà présent') ||
    (s.includes('requests') && s.includes('duplicate'))
  ) {
    return "Ce titre est déjà dans la liste ou a déjà été chanté ce soir. Choisis-en un autre.";
  }

  // Limite de file
  if (s.includes('file d’attente pleine') || s.includes('file pleine') || s.includes('max 15')) {
    return "La file est pleine (≈15 titres / ~45 min). Réessaie un peu plus tard.";
  }

  // R1 : 2 chansons max par chanteur
  if (s.includes('2 chansons max')) {
    return "Tu as déjà 2 chansons en file. Attends qu’une passe avant d’en proposer une autre.";
  }

  // Anti-spam IP (30s)
  if (s.includes('30s') || s.includes('anti-spam') || s.includes('rate limit') || s.includes('too fast')) {
    return "Doucement 🙂 Attends 30 secondes avant d’envoyer une nouvelle demande.";
  }

  // Références invalides
  if (s.includes('foreign key') || s.includes('salle inconnue') || s.includes('not found')) {
    return "Salle ou chanteur introuvable. Recharge la page puis réessaie.";
  }

  // Réseau
  if (s.includes('failed to fetch') || s.includes('network')) {
    return "Problème réseau. Vérifie ta connexion et réessaie.";
  }

  return "Oups… une erreur est survenue. Réessaie, ou choisis un autre titre.";
}

export default function RoomClient({ slug }: { slug: string }) {
  const isLantignie = slug.toLowerCase() === 'lantignie';

  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [kid, setKid] = useState<Suggestion | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  // états de chargement
  const [submitLoading, setSubmitLoading] = useState(false);
  const [lotteryLoading, setLotteryLoading] = useState(false);

  // ------ Stats d’attente ------
  const [stats, setStats] = useState<{ total_waiting: number; est_minutes: number } | null>(null);
  useEffect(() => {
    async function load() {
      const r = await fetch('/api/stats');
      const s = await r.json();
      setStats({ total_waiting: s.total_waiting, est_minutes: s.est_minutes });
    }
    load();
    const it = setInterval(load, 10_000);
    return () => clearInterval(it);
  }, []);
  const limitReached =
    (stats?.total_waiting ?? 0) >= 15 || (stats?.est_minutes ?? 0) > 45;

  // ------ Auto-complétion catalogue ------
  const [q, setQ] = useState('');
  const [list, setList] = useState<Suggestion[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = q.trim();
      if (qq.length < 2) { setList([]); return; }
      const r = await fetch('/api/search?q=' + encodeURIComponent(qq));
      const data = await r.json();
      setList(Array.isArray(data) ? data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function pick(s: Suggestion) {
    setTitle(s.title);
    setArtist(s.artist);
    setKid(s);
    setQ('');
    setList([]);
    setMsg(null);
  }

  // ------ Son (alerte tirage) ------
  const [soundReady, setSoundReady] = useState(false);
  const [ding, setDing] = useState<HTMLAudioElement | null>(null);
  function armSound() {
    const a = new Audio('/ding.mp3');
    a.load();
    setDing(a);
    setSoundReady(true);
    setMsg('Son activé ✅');
  }

  // ------ Tirage : écoute Realtime ------
  useEffect(() => {
    const entryId = loadEntryId();
    if (!entryId) return;
    const ch = supa
      .channel('lottery-win-' + entryId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lottery_winners', filter: `entry_id=eq.${entryId}` },
        () => {
          setWon(true);
          setMsg('🎉 Tu as été tiré au sort !');
          if (ding) { ding.currentTime = 0; ding.play().catch(() => {}); }
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
      )
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, [ding]);

  // Fallback polling (si Realtime HS)
  useEffect(() => {
    const entryId = loadEntryId();
    if (!entryId) return;
    const it = setInterval(async () => {
      const r = await fetch('/api/lottery/has-won?entry_id=' + entryId);
      const d = await r.json();
      if (d?.won) {
        if (!won) {
          setWon(true);
          setMsg('🎉 Tu as été tiré au sort !');
          if (ding) { ding.currentTime = 0; ding.play().catch(() => {}); }
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        clearInterval(it);
      }
    }, 8000);
    return () => clearInterval(it);
  }, [ding, won]);

  // ------ Envoi d’une demande ------
  async function submit() {
    if (submitLoading) return;
    setSubmitLoading(true);
    setMsg(null);
    try {
      if (!displayName.trim() || !title.trim() || !artist.trim()) {
        setMsg('Remplis les 3 champs.');
        return;
      }
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_slug: slug,
          display_name: displayName.trim(),
          title: title.trim(),
          artist: artist.trim(),
          karafun_id: kid?.karafun_id ?? null,
        }),
      });
      const data = await r.json();
      if (!r.ok || data?.ok === false) {
        setMsg(toUserMessage(data?.error));
        return;
      }
      setMsg('Demande envoyée 👍');
      setTitle(''); setArtist(''); setKid(null);
    } catch (e) {
      setMsg(toUserMessage(e));
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>
      <h1>🎤 Karaoké – {isLantignie ? 'Lantignié' : slug} 🎶</h1>

      {/* Règles de fonctionnement (courtes, positives) */}
      <div
        role="note"
        style={{
          margin: '6px 0 12px',
          padding: '10px 12px',
          border: '1px solid rgba(0,0,0,.12)',
          borderRadius: 8,
          background: '#f8f8f8',
          color: '#000',
          fontSize: 14,
        }}
      >
        <strong>Pour une soirée fluide :</strong>
        <ul style={{ margin: '6px 0 0 18px' }}>
          <li>2 chansons max par chanteur en même temps.</li>
          <li>Un titre ne peut être chanté qu’une seule fois dans la soirée.</li>
          <li>File limitée à ~15 titres (≈45 min).</li>
          <li>Anti-spam : 30 s entre deux demandes.</li>
        </ul>
      </div>

      {stats && (
        <p style={{
          margin: '8px 0 16px',
          padding: '8px 12px',
          background: '#f6f6f6',
          borderRadius: 8,
          color: '#000'
        }}>
          En attente : <strong>{stats.total_waiting}</strong> • Estimation ≈ <strong>{stats.est_minutes} min</strong>
          {limitReached && <span style={{ color: '#b00', marginLeft: 8 }}> (liste pleine)</span>}
        </p>
      )}

      <label>Nom ou Surnom</label>
      <input
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="Nom ou Surnom"
        autoFocus
        style={{ width: '100%', padding: 8, margin: '6px 0 14px' }}
      />

      <label>Recherche dans le catalogue KaraFun</label>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Tape un titre ou un artiste"
        style={{ width: '100%', padding: 8, margin: '6px 0 6px' }}
      />

      {/* Lien de recherche directe KaraFun quand l’utilisateur tape quelque chose */}
      {q.trim().length >= 2 && (
        <p style={{ margin: '6px 0 10px', fontSize: 14, opacity: .85 }}>
          🔎 Pas trouvé ?{' '}
          <a
            href={`https://www.karafun.fr/karaoke/search/?q=${encodeURIComponent(q.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chercher “{q.trim()}” sur KaraFun
          </a>
        </p>
      )}

      {list.length > 0 && (
        <ul style={{ border: '1px solid #ccc', borderRadius: 6, maxHeight: 220, overflowY: 'auto', margin: '0 0 12px', padding: 6 }}>
          {list.map((s, i) => (
            <li key={i} onClick={() => pick(s)} style={{ padding: '6px 4px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
              <strong>{s.title}</strong> — {s.artist}
            </li>
          ))}
        </ul>
      )}

      <label>Titre</label>
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); setKid(null); }}
        placeholder="Ex: L’aventurier"
        style={{ width: '100%', padding: 8, margin: '6px 0 14px' }}
      />

      <label>Artiste</label>
      <input
        value={artist}
        onChange={e => { setArtist(e.target.value); setKid(null); }}
        placeholder="Ex: Indochine"
        style={{ width: '100%', padding: 8, margin: '6px 0 14px' }}
      />

      <button
        onClick={submit}
        disabled={limitReached || submitLoading}
        style={{
          padding: '10px 16px',
          cursor: limitReached || submitLoading ? 'not-allowed' : 'pointer',
          opacity: limitReached || submitLoading ? .6 : 1
        }}
      >
        {submitLoading ? 'Envoi...' : 'Demander'}
      </button>

      {limitReached && (
        <p style={{ marginTop: 8, color: '#b00' }}>
          La file dépasse 45 min (~15 titres). Réessaie plus tard.
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }} aria-live="polite">{msg}</p>}

      {kid?.url && (
        <p style={{ opacity: .7, marginTop: 8 }}>
          Astuce : <a href={kid.url} target="_blank" rel="noopener noreferrer">voir la fiche KaraFun</a>
        </p>
      )}

      <hr style={{ margin: '24px 0' }} />
      <h2>🎁 Tirage au sort</h2>
      <p>Inscris ton nom pour participer (une inscription par personne).</p>

      <button
        onClick={async () => {
          if (lotteryLoading) return;
          if (!displayName.trim()) {
            setMsg('Renseigne ton nom avant de t’inscrire au tirage.');
            return;
          }
          setLotteryLoading(true);
          try {
            const r = await fetch('/api/lottery/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                room_slug: slug,
                display_name: displayName.trim(),
              }),
            });
            const d = await r.json();
            if (!r.ok || d?.ok === false) setMsg(toUserMessage(d?.error));
            else {
              setMsg('Inscription au tirage enregistrée ✅');
              if (d.id) saveEntryId(d.id);
            }
          } catch (e) {
            setMsg(toUserMessage(e));
          } finally {
            setLotteryLoading(false);
          }
        }}
        className={isLantignie ? 'neonButton' : undefined} // classe globale éventuelle
        style={!isLantignie ? { padding: '8px 14px', cursor: lotteryLoading ? 'wait' : 'pointer', opacity: lotteryLoading ? .7 : 1 } : undefined}
        disabled={lotteryLoading}
      >
        {lotteryLoading ? '...' : 'M’inscrire au tirage'}
      </button>

      {!soundReady && (
        <p style={{ marginTop: 8 }}>
          🔊 Pour être alerté si tu es tiré, active le son :
          <button onClick={armSound} style={{ marginLeft: 8, padding: '6px 10px' }}>
            Activer le son
          </button>
        </p>
      )}

      {won && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#16a34a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            zIndex: 9999,
            textAlign: 'center',
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎉 VOUS AVEZ GAGNÉ ! 🎉</div>
          <div style={{ fontSize: 20, opacity: 0.9 }}>
            {displayName ? displayName : 'Bravo !'}
          </div>
          <div style={{ marginTop: 16, fontSize: 14, opacity: 0.9 }}>
            Attendez que l’animateur vous fasse signe 😉
          </div>
        </div>
      )}
    </main>
  );
}
