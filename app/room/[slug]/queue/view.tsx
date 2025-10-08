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
      setData(j.items as any[]);
    } catch (e:any) {
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
          <li key={q.id} className={`rounded-lg border p-3 ${q.is_playing ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}>
            <div className="text-sm">
              <span className="font-medium">{q.title}</span>
              {q.artist ? <span className="text-gray-600"> — {q.artist}</span> : null}
            </div>
            <div className="text-xs text-gray-600">
              {q.display_name ?? 'Anonyme'} · {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {q.is_playing ? <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-green-600 text-white">En cours</span> : null}
            </div>
          </li>
        ))}
        {data.length === 0 && <li className="text-gray-600 text-sm">Aucune demande en attente.</li>}
      </ul>
    </div>
  );
}
