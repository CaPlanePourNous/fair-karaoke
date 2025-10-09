'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { RoomQueueModal } from '@/components/RoomQueueModal';

type Suggestion = {
  title: string;
  artist: string | null;
  karafun_id?: string;           // id renvoyé par /api/search
  id?: string | number;          // fallback éventuel
  url?: string;
};

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Storage entry_id pour la loterie
function saveEntryId(id: string) {
  try { localStorage.setItem('lottery_entry_id', id); } catch {}
}
function loadEntryId() {
  try { return localStorage.getItem('lottery_entry_id'); } catch { return null; }
}

// Mapping d’erreurs techniques → messages clairs
function toUserMessage(raw: unknown): string {
  const s = String(raw || '').toLowerCase();
  if (s.includes('singers_room_name_unique')) return "Ce nom est déjà utilisé ici. Ajoute une initiale ou choisis un autre nom.";
  if (s.includes('lottery_entries') && s.includes('duplicate')) return "Tu es déjà inscrit au tirage 😉";
  if (
    s.includes('duplicate key value') ||
    s.includes('unique constraint') ||
    s.includes('titre déjà présent') ||
    (s.includes('requests') && s.includes('duplicate'))
  ) return "Ce titre est déjà dans la liste ou a déjà été chanté ce soir. Choisis-en un autre.";
  if (s.includes('file pleine') || s.includes('max 15')) return "La file est pleine (≈15 titres / ~45 min). Réessaie un peu plus tard.";
  if (s.includes('2 chansons max')) return "Tu as déjà 2 chansons en file. Attends qu’une passe avant d’en proposer une autre.";
  if (s.includes('30s') || s.includes('rate limit')) return "Doucement 🙂 Attends 30 secondes avant d’envoyer une nouvelle demande.";
  if (s.includes('foreign key') || s.includes('not found')) return "Salle ou chanteur introuvable. Recharge la page puis réessaie.";
  if (s.includes('failed to fetch') || s.includes('network')) return "Problème réseau. Vérifie ta connexion et réessaie.";
  return "Oups… une erreur est survenue. Réessaie, ou choisis un autre titre.";
}

export default function RoomClient({ slug }: { slug: string }) {
  const isLantignie = slug.toLowerCase() === 'lantignie';

  const [displayName, setDisplayName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const msgRef = useRef<HTMLDivElement | null>(null);
  const [won, setWon] = useState(false);

  const [lotteryLoading, setLotteryLoading] = useState(false);

  // (optionnel) singer id si tu l’utilises ailleurs, pas requis pour /api/requests
  const singerIdRef = useRef<string | null>(null);

  // Stats d’attente
  const [stats, setStats] = useState<{ total_waiting: number; est_minutes: number } | null>(null);
  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/stats');
        const s = await r.json();
        setStats({ total_waiting: s.total_waiting, est_minutes: s.est_minutes });
      } catch {}
    }
    load();
    const it = setInterval(load, 10_000);
    return () => clearInterval(it);
  }, []);
  const limitReached =
    (stats?.total_waiting ?? 0) >= 15 || (stats?.est_minutes ?? 0) > 45;

  // Scroll le message dans la vue dès qu’on en a un
  useEffect(() => {
    if (msg && msgRef.current) {
      // le timeout laisse le DOM peindre le message avant de scroller
      setTimeout(() => {
        msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  }, [msg]);

  // Recherche KaraFun
  const [q, setQ] = useState('');
  const [list, setList] = useState<Suggestion[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = q.trim();
      if (qq.length < 2) { setList([]); return; }
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(qq));
        const data = await r.json();
        setList(Array.isArray(data) ? data : []);
      } catch {
        setList([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // ✅ Demander via le même chemin que l’ancien bouton: POST /api/requests
  async function pickFromCatalog(item: { id: string|number; title: string; artist?: string|null }) {
    const name = displayName.trim();
    if (!name) {
      setMsg("Renseigne ton nom avant de demander un titre.");
      return;
    }
    if (limitReached) {
      setMsg("La file est pleine (≈15 titres / ~45 min). Réessaie plus tard.");
      return;
    }
    setMsg(null);
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Même payload que l’ancien bouton: display_name + karafun_id
        body: JSON.stringify({
          room_slug: slug,
          display_name: name,
          title: item.title,
          artist: item.artist || '',
          karafun_id: String(item.id),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        setMsg(toUserMessage(j?.error || 'UNKNOWN'));
        return;
      }
      setMsg('🎶 Demande enregistrée !');
      setQ('');
      setList([]);
    } catch (e) {
      setMsg(toUserMessage(e));
    }
  }

  // Son (alerte tirage)
  const [soundReady, setSoundReady] = useState(false);
  const [ding, setDing] = useState<HTMLAudioElement | null>(null);
  function armSound() {
    const a = new Audio('/ding.mp3');
    a.load();
    setDing(a);
    setSoundReady(true);
    setMsg('Son activé ✅');
  }

  // Realtime tirage
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

  // Polling secours
  useEffect(() => {
    const entryId = loadEntryId();
    if (!entryId) return;
    const it = setInterval(async () => {
      try {
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
      } catch {}
    }, 8000);
    return () => clearInterval(it);
  }, [ding, won]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>
      <h1>🎤 Karaoké – {isLantignie ? 'Lantignié' : slug} </h1>

      {/* Règles */}
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

      {/* En attente + bouton Voir la file */}
      {stats && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-100 rounded-md border text-sm shadow-sm"
          style={{ margin: '8px 0 16px' }}
        >
          <div>
            En attente : <strong>{stats.total_waiting}</strong> • Estimation ≈{' '}
            <strong>{stats.est_minutes} min</strong>
            {limitReached && (
              <span style={{ color: '#b00', marginLeft: 8 }}> (liste pleine)</span>
            )}
          </div>
          <div className="flex items-center">
            <RoomQueueModal
              slug={slug}
              triggerClassName="px-2 py-1 rounded-md border text-sm bg-white shadow-sm"
              label="Voir la file"
            />
          </div>
        </div>
      )}

      {/* Pseudo */}
      <label>Nom ou Surnom</label>
      <input
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="Nom ou Surnom"
        autoFocus
        style={{ width: '100%', padding: 8, margin: '6px 0 8px' }}
      />

      {/* Message placé AVANT le bloc de recherche */}
      <div ref={msgRef} aria-live="polite" style={{ minHeight: msg ? 24 : 0, margin: msg ? '6px 0 10px' : '0' }}>
        {msg && <p style={{ margin: 0 }}>{msg}</p>}
      </div>

      {/* Recherche KaraFun */}
      <label>Recherche dans le catalogue KaraFun</label>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Tape un titre ou un artiste"
        style={{ width: '100%', padding: 8, margin: '6px 0 6px' }}
      />

      {q.trim().length >= 2 && (
        <p style={{ margin: '6px 0 10px', fontSize: 14, opacity: .85 }}>
          🔎 Pas trouvé ?{' '}
          <a
            href={`https://www.karafun.fr/search/?q=${encodeURIComponent(q.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chercher “{q.trim()}” sur KaraFun
          </a>
        </p>
      )}

      {/* Résultats + bouton Demander */}
      {list.length > 0 && (
        <ul style={{ border: '1px solid #ccc', borderRadius: 6, maxHeight: 320, overflowY: 'auto', margin: '0 0 12px', padding: 6 }}>
          {list.map((s, i) => {
            const trackId = (s.karafun_id ?? s.id) as string | number | undefined;
            const disabled = limitReached || !trackId;
            return (
              <li
                key={i}
                style={{ padding: '8px 6px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                  <div style={{ fontSize: 13, opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.artist || 'Artiste inconnu'}
                  </div>
                </div>
                <button
                  onClick={() => trackId && pickFromCatalog({ id: trackId, title: s.title, artist: s.artist })}
                  disabled={disabled}
                  title={disabled ? (limitReached ? 'File pleine' : 'ID piste manquant') : 'Demander ce titre'}
                  style={{
                    flexShrink: 0,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    background: disabled ? '#eee' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  Demander
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <hr style={{ margin: '24px 0' }} />
      <h2>🎁 Tirage au sort</h2>
      <p>Inscris ton nom pour participer (une inscription par personne).</p>

      <button
        onClick={async () => {
          if (lotteryLoading) return;
          const name = displayName.trim();
          if (!name) {
            setMsg("Renseigne ton nom avant de t’inscrire au tirage.");
            return;
          }
          setLotteryLoading(true);
          try {
            const r = await fetch('/api/lottery/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room_slug: slug, display_name: name }),
            });
            let d: any = null;
            try { d = await r.json(); } catch {}
            const ok = r.ok && d?.ok === true && typeof d?.id === 'string';
            if (!ok) {
              const code = d?.error || 'REGISTER_FAILED';
              const map: Record<string, string> = {
                MISSING_DISPLAY_NAME: "Renseigne ton nom avant de t’inscrire.",
                ROOM_NOT_FOUND: "Salle introuvable.",
                DB_INSERT_SINGER_FAILED: "Inscription impossible (création du profil).",
                DB_INSERT_ENTRY_NO_ID: "Inscription impossible (ID absent).",
                REGISTER_FAILED: "Inscription impossible.",
              };
              setMsg(map[code] ?? `Inscription impossible: ${code}`);
              return;
            }
            saveEntryId(d.id);
            setMsg('Inscription au tirage enregistrée ✅');
            // singerIdRef.current = d.singer_id ?? singerIdRef.current; // si dispo côté API
          } catch (e) {
            setMsg(toUserMessage(e));
          } finally {
            setLotteryLoading(false);
          }
        }}
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
