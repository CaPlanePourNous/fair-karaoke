'use client';
import { useEffect, useState } from 'react';

type Entry = { id:string; display_name:string };

export default function LotteryHost(){
  const [entries, setEntries] = useState<Entry[]>([]);
  const [winners, setWinners] = useState<Entry[]>([]);
  const [msg, setMsg] = useState<string|null>(null);

  async function refresh(){
    const e = await fetch('/api/lottery/list').then(r=>r.json()).catch(()=>[]);
    const w = await fetch('/api/lottery/winners').then(r=>r.json()).catch(()=>[]);
    setEntries(e||[]); setWinners(w||[]);
  }

  async function draw(){
    setMsg(null);
    const r = await fetch('/api/lottery/draw', { method:'POST' });
    const d = await r.json();
    if(!r.ok){ setMsg(d.error||'Erreur'); return; }
    setMsg(`🎉 Gagnant : ${d.winner.display_name}`);
    refresh();
  }

  useEffect(()=>{ refresh(); },[]);

  return (
    <main style={{maxWidth:720, margin:'30px auto', padding:'0 16px'}}>
      <h1>Tirage au sort — Hôte</h1>
      <button onClick={draw} style={{padding:'10px 16px', margin:'8px 0'}}>🎲 Tirer au sort</button>
      {msg && <p style={{marginTop:8}}>{msg}</p>}

      <h2 style={{marginTop:24}}>Inscrits</h2>
      <ul>{entries.map(e => <li key={e.id}>{e.display_name}</li>)}</ul>

      <h2 style={{marginTop:24}}>Gagnants</h2>
      <ul>{winners.map(e => <li key={e.id}>{e.display_name}</li>)}</ul>
    </main>
  );
}
