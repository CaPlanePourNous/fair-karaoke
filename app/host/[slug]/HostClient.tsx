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

  // ---- Chargement file d'attente ----
  async function refresh() {
    try {
      const r = await fetch("/api/host/queue");
      const d = await r.json();
      setData(d);
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Passer à la suivante ----
  async function playNext() {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch("/api/host/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: true }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || "Erreur /api/host/play");
      }
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Copier dans le presse-papiers ----
  function copyText(txt: string) {
    navigator.clipboard.writeText(txt).catch(() =>
      alert("Impossible de copier le texte.")
    );
  }

  // ---- Rafraîchissement auto ----
  useEffect(() => {
    refresh();
    const it = setInterval(refresh, 5000);
    return () => clearInterval(it);
  }, []);

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "16px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "auto 1fr",
        gap: "16px",
      }}
    >
      {/* === En cours === */}
      <section
        style={{
          gridColumn: "1 / span 2",
          background: "#f9f9f9",
          padding: "16px",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2 style={{ marginBottom: 12 }}>🎤 En cours</h2>
        {data?.playing ? (
          <>
            <p style={{ fontSize: "1.2em", marginBottom: 12 }}>
              ▶ <strong>{data.playing.title}</strong> — {data.playing.artist}{" "}
              ({data.playing.display_name || "?"})
            </p>
            <button
              onClick={playNext}
              disabled={loading}
              style={{
                padding: "8px 12px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              ⏭ Lire la suivante
            </button>
          </>
        ) : (
          <p>Aucun titre en cours.</p>
        )}
      </section>

      {/* === À venir === */}
      <section
        style={{
          background: "#f6f6f6",
          padding: "16px",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2>📋 File d’attente</h2>
        {data.waiting.length === 0 ? (
          <p>Aucun titre en attente.</p>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {data.waiting.map((r) => (
              <li
                key={r.id}
                style={{
                  marginBottom: 8,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "6px 8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{r.title}</strong> — {r.artist}{" "}
                  <span style={{ opacity: 0.7 }}>
                    ({r.display_name || "?"})
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() =>
                      copyText(`${r.title} — ${r.artist}`)
                    }
                    title="Copier le titre + artiste"
                    style={{
                      padding: "4px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      cursor: "pointer",
                      background: "#fafafa",
                    }}
                  >
                    🎵
                  </button>
                  <button
                    onClick={() =>
                      copyText(r.display_name || "")
                    }
                    title="Copier le nom du chanteur"
                    style={{
                      padding: "4px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      cursor: "pointer",
                      background: "#fafafa",
                    }}
                  >
                    👤
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* === Déjà passées === */}
      <section
        style={{
          background: "#f6f6f6",
          padding: "16px",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2>✅ Déjà passées</h2>
        {data.played.length === 0 ? (
          <p>Aucun titre terminé.</p>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {data.played.map((r) => (
              <li
                key={r.id}
                style={{
                  marginBottom: 8,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "6px 8px",
                }}
              >
                <strong>{r.title}</strong> — {r.artist}{" "}
                <span style={{ opacity: 0.7 }}>
                  ({r.display_name || "?"})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
