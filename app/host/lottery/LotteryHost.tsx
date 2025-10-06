'use client';

import { useEffect, useState } from 'react';

type LotteryState = {
  ok: boolean;
  error?: string;
  entriesCount?: number;
  lastWinner?: { singer_id: string; created_at: string; display_name?: string | null };
};

export default function LotteryHost({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<number>(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [lastWinner, setLastWinner] = useState<LotteryState['lastWinner']>(undefined);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchState() {
    try {
      const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      let j: LotteryState = { ok: false };
      try { j = await r.json(); } catch {}
      if (!r.ok || j.ok === false) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setEntries(j.entriesCount ?? 0);
      setLastWinner(j.lastWinner);
      setMsg(null);
    } catch (e: any) {
      console.error(e);
      setMsg(`Erreur état loterie: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    fetchState();
    const it = setInterval(fetchState, 5000);
    return () => clearInterval(it);
  }, [slug]);

  async function draw() {
    setLoading(true); setMsg(null); setWinner(null);
    try {
      const r = await fetch('/api/lottery/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_slug: slug }),
      });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      const name = (j?.winner?.display_name || j?.winner?.singer_id || '').toString().trim();
      setWinner(name || 'Gagnant·e');
      // Recharger les stats après tirage
      await fetchState();
    } catch (e: any) {
      console.error(e);
      setMsg(`Erreur tirage: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
      <h1>Tirage au sort — {slug}</h1>

      <div style={{ margin: '8px 0 16px', padding: '8px 12px', background: '#f6f6f6', borderRadius: 8 }}>
        Inscriptions : <strong>{entries}</strong>
        {lastWinner && (
          <span style={{ marginLeft: 12, opacity: .85 }}>
            Dernier gagnant : <strong>{lastWinner.display_name || lastWinner.singer_id}</strong> ({new Date(lastWinner.created_at).toLocaleString()})
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={draw} disabled={loading || entries <= 0} style={{ padding: '8px 12px' }}>
          {loading ? 'Tirage…' : 'Tirer au sort'}
        </button>
        <button onClick={fetchState} disabled={loading} style={{ padding: '8px 12px' }}>
          Rafraîchir
        </button>
      </div>

      {winner && (
        <p style={{ marginTop: 16, fontSize: 18 }}>
          🎉 Tirage effectué → <strong>{winner}</strong> 🎉
        </p>
      )}

      {msg && <p style={{ marginTop: 12, color: '#b00' }}>{msg}</p>}

      <p style={{ marginTop: 24, opacity: .75, fontSize: 14 }}>
        Astuce : Ouvre la page Room correspondante — le gagnant verra l’overlay vert et entendra <code>ding.mp3</code> via Realtime.
      </p>
    </main>
  );
}
