'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type QItem = {
  id: string;
  title: string;
  artist: string | null;
  display_name: string | null;
  is_playing: boolean;
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function RoomQueueModal({
  slug,
  triggerClassName,
  label = "Voir la file",
}: {
  slug: string;
  triggerClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/queue/list?room_slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j?.ok !== true) {
        throw new Error(j?.error || 'LOAD_QUEUE_FAILED');
      }
      setItems(j.items as QItem[]);
    } catch (e: any) {
      setErr(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();

    // Realtime: si une requête change, on recharge (simple & robuste)
    const ch = supabase
      .channel(`rq_${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slug]);

  const queue = useMemo(() => {
    // is_playing en tête, puis ordre d’arrivée
    return [...items].sort((a, b) => {
      if (a.is_playing && !b.is_playing) return -1;
      if (!a.is_playing && b.is_playing) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [items]);

  return (
    <>
      <button
        className={triggerClassName}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-[min(700px,92vw)] max-h-[80vh] overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-lg">File d’attente</h2>
              <button onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
            </div>

            <div className="p-4 overflow-auto" style={{ maxHeight: '60vh' }}>
              {loading && <div>Chargement…</div>}
              {err && <div className="text-red-600 text-sm">{err}</div>}
              {!loading && !err && queue.length === 0 && (
                <div className="text-sm text-gray-600">Aucune demande en attente.</div>
              )}

              <ul className="space-y-2">
                {queue.map((q) => (
                  <li
                    key={q.id}
                    className={`rounded-lg border p-3 ${q.is_playing ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}
                  >
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
              </ul>
            </div>

            <div className="px-4 py-3 border-t text-right">
              <button className="px-3 py-1.5 rounded bg-gray-800 text-white" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
