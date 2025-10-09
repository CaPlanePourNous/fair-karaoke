'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RoomQueueModal } from '@/components/RoomQueueModal';

type Suggestion = {
  id?: string | number;
  karafun_id?: string | number;
  title: string;
  artist?: string | null;
};

type SearchResponse =
  | { ok: true; items: Suggestion[] }
  | { ok: false; error: string }
  | Suggestion[];

export default function RoomClient({ slug }: { slug: string }) {
  // --- États de base ---
  const [displayName, setDisplayName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  // --- Recherche KaraFun ---
  const [q, setQ] = useState('');
  const [list, setList] = useState<Suggestion[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // --- Sélection + champs non éditables ---
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [titleField, setTitleField] = useState('');
  const [artistField, setArtistField] = useState('');

  // --- Limite (si tu veux la brancher sur tes stats plus tard) ---
  const [limitReached] = useState(false); // garde-fou neutre

  // --- Utils ---
  function toUserMessage(e: any): string {
    if (typeof e === 'string') return e;
    if (e?.message) return String(e.message);
    return 'Une erreur est survenue.';
    }

  // ============================
  // Recherche KaraFun (client → API maison)
  // Essaie /api/search/karafun puis /api/karaoke/search (pour rester compatible)
  // ============================
  async function searchKarafun(query: string) {
    const qtrim = query.trim();
    if (qtrim.length < 2) {
      setList([]);
      return;
    }
    setLoadingSearch(true);
    setMsg(null);
    try {
      // tentative 1 : /api/search/karafun
      let r = await fetch(`/api/search/karafun?q=${encodeURIComponent(qtrim)}`, { cache: 'no-store' });
      let j: SearchResponse | null = null;
      try { j = await r.json(); } catch { j = null; }

      if (!r.ok || !j) {
        // tentative 2 : /api/karaoke/search
        r = await fetch(`/api/karaoke/search?q=${encodeURIComponent(qtrim)}`, { cache: 'no-store' });
        try { j = await r.json(); } catch { j = null; }
      }

      let items: Suggestion[] = [];
      if (Array.isArray(j)) {
        items = j as Suggestion[];
      } else if (j && (j as any).ok === true && Array.isArray((j as any).items)) {
        items = (j as any).items as Suggestion[];
      }

      // normalisation rapide
      items = (items || [])
        .filter(x => x && x.title)
        .map(x => ({
          ...x,
          karafun_id: x.karafun_id ?? x.id, // on garde un id numérique pour l’envoi
        }));

      setList(items);
    } catch (e) {
      setMsg(toUserMessage(e));
    } finally {
      setLoadingSearch(false);
    }
  }

  // ============================
  // Soumission d'une demande (un seul bouton)
  // ============================
  async function submitRequest() {
    const name = displayName.trim();
    if (!name) {
      setMsg('Renseigne ton nom avant de demander un titre.');
      return;
    }
    if (limitReached) {
      setMsg('La file est pleine. Réessaie plus tard.');
      return;
    }
    if (!selected || !(selected.karafun_id ?? selected.id)) {
      setMsg('Choisis un titre dans la liste.');
      return;
    }

    const trackId = String(selected.karafun_id ?? selected.id);
    const payload = {
      room_slug: slug,
      display_name: name,
      title: titleField || selected.title,
      artist: artistField || selected.artist || '',
      provider: 'karafun',
      track_id: trackId,
      karafun_id: trackId, // compat éventuelle côté serveur
    };

    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        setMsg(toUserMessage(j?.error || 'Demande refusée'));
        return;
      }

      setMsg('🎶 Demande enregistrée !');
      setQ('');
      setList([]);
      setSelected(null);
      setTitleField('');
      setArtistField('');
    } catch (e) {
      setMsg(toUserMessage(e));
    }
  }

  // ============================
  // Rendu
  // ============================
  const karaFunLink = `https://www.karafun.fr/search/?q=${encodeURIComponent(q.trim())}`;

  return (
    <div className="space-y-4">
      {/* Nom / Message */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Ton nom (affiché)</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Ex: MARTIN"
          className="w-full rounded-md border px-3 py-2"
        />
        {msg ? <div className="text-sm text-blue-700">{msg}</div> : null}
      </div>

      {/* Recherche KaraFun */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Recherche KaraFun</label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tape un titre ou un artiste"
            className="flex-1 rounded-md border px-3 py-2"
          />
          <button
            onClick={() => searchKarafun(q)}
            disabled={loadingSearch}
            className="rounded-md border px-3 py-2"
          >
            {loadingSearch ? '…' : 'Rechercher'}
          </button>
        </div>
        <a
          href={karaFunLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 underline"
        >
          Voir sur KaraFun ↗
        </a>

        {/* Résultats : clic = sélection (pas de bouton par ligne) */}
        {list.length > 0 && (
          <ul
            className="mt-2"
            style={{
              border: '1px solid #ccc',
              borderRadius: 6,
              maxHeight: 320,
              overflowY: 'auto',
              margin: '0 0 12px',
              padding: 6
            }}
          >
            {list.map((s, i) => {
              const isSel =
                selected &&
                (String(selected.karafun_id ?? selected.id) === String(s.karafun_id ?? s.id));
              return (
                <li
                  key={`${s.karafun_id ?? s.id ?? i}`}
                  onClick={() => {
                    setSelected(s);
                    setTitleField(s.title);
                    setArtistField(s.artist ?? '');
                  }}
                  style={{
                    padding: '8px 6px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    cursor: 'pointer',
                    background: isSel ? '#eef6ff' : '#fff',
                    borderRadius: 4,
                  }}
                  title="Cliquer pour sélectionner ce titre"
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        opacity: 0.8,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.artist || 'Artiste inconnu'}
                    </div>
                  </div>
                  {isSel ? <span style={{ fontSize: 12, opacity: 0.8 }}>Sélectionné</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Champs Titre / Artiste en lecture seule + bouton unique */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Titre</label>
        <input
          value={titleField}
          onChange={() => {}}
          readOnly
          placeholder="Choisis un titre dans la liste"
          className="w-full rounded-md border px-3 py-2 bg-gray-50"
        />

        <label className="block text-sm font-medium">Artiste</label>
        <input
          value={artistField}
          onChange={() => {}}
          readOnly
          placeholder="Rempli automatiquement"
          className="w-full rounded-md border px-3 py-2 bg-gray-50"
        />

        <div className="flex justify-end">
          <button
            onClick={submitRequest}
            disabled={limitReached || !selected}
            title={!selected ? 'Sélectionne un titre dans la liste' : 'Envoyer la demande'}
            className={`rounded-md border px-4 py-2 ${limitReached || !selected ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Demander ce titre
          </button>
        </div>
      </div>

      {/* Bouton Voir la file (modale toggle) */}
      <div className="flex items-center">
        <RoomQueueModal
          slug={slug}
          triggerClassName="px-2 py-1 rounded-md border text-sm bg-white shadow-sm"
          label="Voir la file"
        />
      </div>
    </div>
  );
}
