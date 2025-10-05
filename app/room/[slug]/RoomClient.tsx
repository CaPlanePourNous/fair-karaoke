"use client";

import { useEffect, useState } from "react";

type Suggestion = { id: string; title: string; artist: string; url?: string };

export default function RoomClient({ slug }: { slug: string }) {
  const isLantignie = slug.toLowerCase() === "lantignie";

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [kid, setKid] = useState<Suggestion | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ------ Stats file d’attente (facultatif si déjà en place côté API) ------
  const [stats, setStats] = useState<{ total_waiting: number; est_minutes: number } | null>(null);
  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        if (!r.ok) return;
        const s = await r.json();
        if (!stop) setStats({ total_waiting: s.total_waiting, est_minutes: s.est_minutes });
      } catch {}
    }
    load();
    const it = setInterval(load, 10000);
    return () => { stop = true; clearInterval(it); };
  }, []);
  const limitReached = (stats?.total_waiting ?? 0) >= 15 || (stats?.est_minutes ?? 0) > 45;

  // ------ Auto-complétion à partir du CSV local via /api/search ------
  const [q, setQ] = useState("");
  const [list, setList] = useState<Suggestion[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = q.trim();
      if (qq.length < 2) { setList([]); return; }
      try {
        const r = await fetch("/api/search?q=" + encodeURIComponent(qq), { cache: "no-store" });
        const data = await r.json();
        setList(Array.isArray(data) ? data : []);
      } catch {
        setList([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function pick(s: Suggestion) {
    setTitle(s.title);
    setArtist(s.artist);
    setKid(s);
    setQ("");
    setList([]);
    setMsg(null);
  }

  // ------ Soumission chanson ------
  async function submit() {
    setMsg(null);
    if (!displayName.trim() || !title.trim() || !artist.trim()) {
      setMsg("Remplis les 3 champs.");
      return;
    }
    const r = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName.trim(),
        title: title.trim(),
        artist: artist.trim(),
        // pas d'id strict requis ici puisqu’on travaille sur un CSV local
        karafun_id: kid?.id ?? null,
      }),
    });
    const data = await r.json();
    if (!r.ok) { setMsg(`Erreur: ${data.error || "inconnue"}`); return; }
    setMsg("Demande envoyée 👍");
    setTitle(""); setArtist(""); setKid(null);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px" }}>
      <h1>🎤 Karaoké – {isLantignie ? "Lantignié" : slug} 🎶</h1>

      {stats && (
        <p style={{ margin: "8px 0 16px", padding: "8px 12px", background: "#f6f6f6", borderRadius: 8 }}>
          En attente : <strong>{stats.total_waiting}</strong> • Estimation ≈ <strong>{stats.est_minutes} min</strong>
          {limitReached && <span style={{ color: "#b00", marginLeft: 8 }}> (liste pleine pour l’instant)</span>}
        </p>
      )}

      <label>Nom ou Surnom</label>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Nom ou Surnom"
        style={{ width: "100%", padding: 8, margin: "6px 0 14px" }}
      />

      <label>Recherche dans le catalogue KaraFun</label>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tape un titre ou un artiste"
        style={{ width: "100%", padding: 8, margin: "6px 0 6px" }}
      />
      {list.length > 0 && (
        <ul style={{ border: "1px solid #ccc", borderRadius: 6, maxHeight: 220, overflowY: "auto", margin: "0 0 12px", padding: 6 }}>
          {list.map((s, i) => (
            <li
              key={i}
              onClick={() => pick(s)}
              style={{ padding: "6px 4px", cursor: "pointer", borderBottom: "1px solid #eee" }}
            >
              <strong>{s.title}</strong> — {s.artist}
            </li>
          ))}
        </ul>
      )}

      <label>Titre</label>
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setKid(null); }}
        placeholder="Ex: L’aventurier"
        style={{ width: "100%", padding: 8, margin: "6px 0 14px" }}
      />

      <label>Artiste</label>
      <input
        value={artist}
        onChange={(e) => { setArtist(e.target.value); setKid(null); }}
        placeholder="Ex: Indochine"
        style={{ width: "100%", padding: 8, margin: "6px 0 14px" }}
      />

      <button
        onClick={submit}
        disabled={limitReached}
        style={{
          padding: "10px 16px",
          cursor: limitReached ? "not-allowed" : "pointer",
          opacity: limitReached ? 0.6 : 1,
        }}
      >
        Demander
      </button>

      {limitReached && (
        <p style={{ marginTop: 8, color: "#b00" }}>
          La file dépasse 45 min (~15 titres). Réessaie un peu plus tard.
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {kid?.url && (
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          🔍 <a href={kid.url} target="_blank" rel="noreferrer">Voir sur KaraFun</a>
        </p>
      )}
    </main>
  );
}
