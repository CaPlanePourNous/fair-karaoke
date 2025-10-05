"use client";
import { useEffect, useState } from "react";

type Req = {
  id: string;
  title: string;
  artist: string;
  display_name: string | null;
  isNew?: boolean;
};

type QueueData = {
  playing: Req | null;
  waiting: Req[];
  played: Req[];
};

export default function HostClient({ slug }: { slug: string }) {
  const [data, setData] = useState<QueueData>({
    playing: null,
    waiting: [],
    played: [],
  });
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const r = await fetch("/api/host/queue");
      const d = await r.json();
      setData(d);
    } catch (e) {
      console.error("Erreur lors du chargement :", e);
    }
  }

  async function playNext() {
    setLoading(true);
    try {
      await fetch("/api/host/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: true }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const it = setInterval(refresh, 5000);
    return () => clearInterval(it);
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px" }}>
      <h1>🎤 File d’attente — {slug}</h1>

      {/* En cours */}
      <section style={{ marginTop: 24 }}>
        <h2>En cours</h2>
        {data.playing ? (
          <div
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#f9f9f9",
            }}
          >
            ▶ <strong>{data.playing.title}</strong> — {data.playing.artist}{" "}
            ({data.playing.display_name || "?"})
          </div>
        ) : (
          <p>Aucune chanson en cours.</p>
        )}
        <button
          onClick={playNext}
          disabled={loading}
          style={{
            padding: "8px 12px",
            marginTop: 8,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          ⏭ Passer à la suivante
        </button>
      </section>

      {/* À venir */}
      <section style={{ marginTop: 24 }}>
        <h2>À venir</h2>
        {data.waiting.length === 0 ? (
          <p>Aucun titre en attente.</p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {data.waiting.map((r) => (
              <li key={r.id} style={{ marginBottom: 6 }}>
                {r.isNew && <span style={{ color: "green" }}>🆕 </span>}
                <strong>{r.title}</strong> — {r.artist}{" "}
                ({r.display_name || "?"})
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Déjà passées */}
      <section style={{ marginTop: 24 }}>
        <h2>Déjà passées</h2>
        {data.played.length === 0 ? (
          <p>Aucun titre terminé.</p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {data.played.map((r) => (
              <li key={r.id} style={{ marginBottom: 6 }}>
                <strong>{r.title}</strong> — {r.artist}{" "}
                ({r.display_name || "?"})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
