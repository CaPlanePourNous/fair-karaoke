'use client';
import { useEffect, useState } from 'react';

export function RoomQueueView({ slug }: { slug: string }) {
  const [data, setData] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await fetch(`/api/queue/list?room_slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j?.ok !== true) throw new Error(j?.error || 'LOAD_QUEUE_FAILED');

      const items = Array.isArray(j.items) ? j.items : [];

      // ✅ Garde uniquement les "en attente"
      const waitingOnly = items.filter((q: any) => {
        if (typeof q?.status === 'string') return q.status === 'waiting';
        // fallback si pas de status : exclure "en cours" / "passées" si indicateurs présents
        if (typeof q?.is_playing === 'boolean' && q.is_playing) return false;
        if (typeof q?.played === 'boolean' && q.played) return false;
        return true; // par défaut on garde (comportement ancien)
      });

      setData(waitingOnly);
    } catch (e: any) {
      setErr(e.message || 'Erreur de chargement');
    }
  }

  useEffect(() => { load(); }, [slug]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-semibold mb-3">File d’attente</h1>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}

      <ul className="space-y-2">
        {data.map((q) => (
          <li
            key={q.id}
            className="rounded-lg border p-3 bg-gray-50"
          >
            <div className="text-sm">
              <span className="font-medium">{q.title}</span>
              {q.artist ? <span className="text-gray-600"> — {q.artist}</span> : null}
            </div>
            <div className="text-xs text-gray-600">
              {q.display_name ?? 'Anonyme'}
              {/* ⛔️ plus d’heure, plus de badge "En cours" ici */}
            </div>
          </li>
        ))}

        {data.length === 0 && (
          <li className="text-gray-600 text-sm">Aucune demande en attente.</li>
        )}
      </ul>
    </div>
  );
}
