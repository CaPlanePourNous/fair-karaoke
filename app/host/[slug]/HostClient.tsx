'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Req = {
  id: string;
  room_id: string;
  singer_id?: string | null;
  title: string;
  artist: string;
  status: 'waiting'|'playing'|'done'|'rejected';
  created_at: string;
  // display_name possible si tu utilises la vue requests_with_singer
  display_name?: string | null;
};

type QueuePayload = {
  ok: boolean;
  error?: string;
  playing: Req | null;
  waiting: Req[];
  done: Req[];
};

const safeArr = (v: any) => (Array.isArray(v) ? v : []);

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false),1200); } catch {}
      }}
      className="px-2 py-1 border rounded text-sm"
      title={text}
    >
      {ok ? 'Copié' : label}
    </button>
  );
}

export default function HostClient({ roomId }: { roomId: string }) {
  const [data, setData] = useState<QueuePayload>({ ok: true, playing: null, waiting: [], done: [] });
  const [loading, setLoading] = useState(false);
  const [playLoading, setPlayLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      // même si la route n’en a pas besoin, on passe le room_id pour clarté
      const r = await fetch(`/api/host/queue?room_id=${encodeURIComponent(roomId)}`, { cache: 'no-store' });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData({
        ok: true,
        playing: j?.playing ?? null,
        waiting: safeArr(j?.waiting),
        done: safeArr(j?.done),
      });
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setData(d => ({ ...d, ok: false })); // on garde l’affichage, pas de crash
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    fetchQueue().finally(() => setLoading(false));
    const it = setInterval(fetchQueue, 5000);
    return () => clearInterval(it);
  }, [fetchQueue]);

  const canPlayNext = useMemo(() => (data.waiting?.length ?? 0) > 0, [data.waiting]);

  async function playNext() {
    if (playLoading) return;
    setPlayLoading(true);
    try {
      const r = await fetch('/api/host/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // refetch pour afficher l’état à jour
      await fetchQueue();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setPlayLoading(false);
    }
  }

  // rendu “3 zones”
  return (
    <main className="max-w-6xl mx-auto p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">🎛️ Host · Room {roomId}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={playNext}
            disabled={!canPlayNext || playLoading}
            className={`px-3 py-2 rounded text-white ${(!canPlayNext || playLoading) ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
            title={canPlayNext ? 'Lire la suivante' : 'Aucune chanson en attente'}
          >
            ⏭ Lire la suivante
          </button>
          <button
            onClick={() => fetchQueue()}
            disabled={loading}
            className="px-3 py-2 rounded border"
            title="Rafraîchir maintenant"
          >
            ↻
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 p-2 border border-red-400 text-red-700 rounded">
          ⚠️ API: {err} — l’interface reste fonctionnelle, nouvel essai automatique en cours…
        </div>
      )}

      <section className="mb-4 p-3 rounded border">
        <h2 className="font-semibold mb-2">🎶 En cours</h2>
        {data.playing ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-medium">{data.playing.title}</div>
              <div className="text-sm text-gray-600">{data.playing.artist}</div>
              {!!data.playing.display_name && (
                <div className="text-sm mt-1">👤 {data.playing.display_name}</div>
              )}
            </div>
            <div className="flex gap-2">
              <CopyBtn text={`${data.playing.title} — ${data.playing.artist}`} label="Copier titre+artiste" />
              <CopyBtn text={data.playing.title} label="Copier titre" />
              <CopyBtn text={data.playing.artist} label="Copier artiste" />
            </div>
          </div>
        ) : (
          <div className="text-gray-600">Aucune chanson en cours.</div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* file d’attente */}
        <section className="p-3 rounded border">
          <h2 className="font-semibold mb-2">🕒 File d’attente ({data.waiting?.length ?? 0})</h2>
          <ol className="space-y-2">
            {safeArr(data.waiting).map((r: Req, idx: number) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border rounded p-2">
                <div>
                  <div className="font-medium">{idx + 1}. {r.title}</div>
                  <div className="text-sm text-gray-600">{r.artist}</div>
                  {!!r.display_name && <div className="text-sm">👤 {r.display_name}</div>}
                </div>
                {/* copier sur les 2 premiers comme tu le faisais */}
                {idx < 2 && (
                  <div className="flex gap-2">
                    <CopyBtn text={`${r.title} — ${r.artist}`} label="Copier titre+artiste" />
                    <CopyBtn text={r.title} label="Copier titre" />
                    <CopyBtn text={r.artist} label="Copier artiste" />
                  </div>
                )}
              </li>
            ))}
            {(!data.waiting || data.waiting.length === 0) && (
              <li className="text-gray-600">Rien en attente.</li>
            )}
          </ol>
        </section>

        {/* déjà passées */}
        <section className="p-3 rounded border">
          <h2 className="font-semibold mb-2">✅ Déjà passées</h2>
          <ol className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {safeArr(data.done).map((r: Req) => (
              <li key={r.id} className="border rounded p-2">
                <div className="font-medium">{r.title}</div>
                <div className="text-sm text-gray-600">{r.artist}</div>
                {!!r.display_name && <div className="text-sm">👤 {r.display_name}</div>}
              </li>
            ))}
            {(!data.done || data.done.length === 0) && (
              <li className="text-gray-600">Aucune pour l’instant.</li>
            )}
          </ol>
        </section>
      </div>
    </main>
  );
}
