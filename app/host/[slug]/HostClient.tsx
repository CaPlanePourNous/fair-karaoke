// app/host/[slug]/HostClient.tsx
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
      console.error(e);
    }
  }

  async function playNext() {
    setLoading(true);
    await fetch("/api/host/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next: true }),
    });
    await refresh();
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const it = setInterval(refresh, 5000);
    return () => clearInterval(it);
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "30px auto", padding: "0 16px" }}>
      <h1>🎤 File d’attente — {slug}</h1>

      <section style={{ marginTop: 24 }}>
        <h2>En cours</h2>
        {data.playing ? (
          <p>
            ▶ <strong>{data.playing.title}</strong> — {data.playing.artist}{" "}
            ({data.playing.display_name || "?"})
          </p>
        ) : (
          <p>Aucune chanson en cours.</p>
        )}
        <button
          onClick={playNext}
          disabled={loading}
          style={{ padding: "8px 12px", marginTop: 8 }}
        >
          ⏭ Passer à la suivante
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>À venir</h2>
        {data.waiting.length === 0 ? (
          <p>Aucun titre en attente.</p>
        ) : (
          <ul>
            {data.waiting.map((r) => (
              <li key={r.id}>
                {r.isNew && <span style={{ color: "green" }}>🆕 </span>}
                <strong>{r.title}</strong> — {r.artist}{" "}
                ({r.display_name || "?"})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Déjà passées</h2>
        {data.played.length === 0 ? (
          <p>Aucun titre terminé.</p>
        ) : (
          <ul>
            {data.played.map((r) => (
              <li key={r.id}>
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
