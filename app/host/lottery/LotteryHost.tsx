'use client';

import { useEffect, useState } from 'react';

export default function LotteryHost() {
  const [count, setCount] = useState<number>(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/lottery/stats', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setCount(d.count ?? 0);
      else setMsg(d.error || 'Erreur stats');
    } catch (e) {
      console.error(e);
      setMsg('Erreur réseau (stats).');
    }
  }

  useEffect(() => {
    load();
    const it = setInterval(load, 5000);
    return () => clearInterval(it);
  }, []);

  async function draw() {
    setLoading(true); setMsg(null); setWinner(null);
    try {
      const r = await fetch('/api/host/lottery/draw', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      setLoading(false);

      if (!r.ok) {
        setMsg(d.error || 'Erreur tirage.');
        return;
      }

      const name = (d.winner_name || '').trim() || 'Gagnant·e';
      setWinner(name);

      // Le tiré est supprimé de la table d’inscriptions → le compteur doit baisser
      load();
    } catch (e) {
      console.error(e);
      setLoading(false);
      setMsg('Erreur réseau (tirage).');
    }
  }

  return (
    <main style={{maxWidth:700, margin:'24px auto', padding:'0 16px'}}>
      <h1>Tirage au sort — Hôte</h1>

      <div style={{margin:'8px 0 16px', padding:'8px 12px', background:'#f6f6f6', borderRadius:8}}>
        Inscriptions aujourd’hui : <strong>{count}</strong>
      </div>

      <div style={{display:'flex', gap:12, alignItems:'center'}}>
        <button onClick={draw} disabled={loading || count <= 0}>
          {loading ? 'Tirage…' : 'Tirer au sort'}
        </button>
        <button onClick={load} disabled={loading}>Rafraîchir</button>
      </div>

      {winner && (
        <p style={{marginTop:16, fontSize:18}}>
          🎉 Tirage effectué → <strong>{winner}</strong> 🎉
        </p>
      )}

      {msg && <p style={{marginTop:12, color:'#b00'}}>{msg}</p>}

      <p style={{marginTop:24, opacity:.7}}>
        Note : l’écran “gagnant” côté joueur reste affiché jusqu’au **rechargement** de sa page,
        comme souhaité. Le bouton “Masquer” n’est donc plus nécessaire.
      </p>
    </main>
  );
}
