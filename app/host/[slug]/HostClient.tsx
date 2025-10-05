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
  const [loadingNext, setLoadingNext] = useState(false);

  async function refresh(label = "refresh") {
    try {
      const r = await fetch("/api/host/queue", { cache: "no-store" });
      const text = await r.text();
      try {
        const d = JSON.parse(text) as QueueData;
        setData(d);
      } catch {
        console.warn(`[${label}] /api/host/queue non-JSON:`, text);
      }
    } catch (e) {
      console.error(`[${label}] /api/host/queue error:`, e);
    }
  }

  async function playNext() {
    if (loadingNext) return;
    setLoadingNext(true);
    try {
      const r = await fetch("/api/host/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: true }),
      });
      const body = await r.text();
      if (!r.ok) {
        let msg = "Erreur /api/host/play";
        try {
          const j = JSON.parse(body);
          msg = j?.error || msg;
        } catch {}
        alert(msg);
      }
      await refresh("after-next");
    } catch (e) {
      console.error("playNext error:", e);
      alert("Erreur réseau /api/host/play");
      await refresh("after-next-error");
    } finally {
      setLoadingNext(false);
    }
  }

  function copyText(txt: string) {
    navigator.clipboard.writeText(txt).catch(() => {
      alert("Impossible de copier le texte.");
    });
  }

  useEffect(() => {
    refresh("on-mount");
    const it = setInterval(() => refresh("interval"), 5000);
    return () => clearInterval(it);
  }, []);

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "auto 1fr",
        gap: 16,
      }}
    >
      {/* En cours (haut, full width) */}
      <section
        style={{
          gridColumn: "1 / span 2",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          background: "#f9f9f9",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 12 }}>🎤 En cours — {slug}</h2>

        {data.playing ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "1.15rem" }}>
              ▶ <strong>{data.playing.title}</strong> — {data.playing.artist}{" "}
              <span style={{ opacity: 0.75 }}>
                ({data.playing.display_name || "?"})
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  copyText(`${data.playing!.title} — ${data.playing!.artist}`)
                }
                title="Copier Titre + Artiste"
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                🎵
              </button>
              {data.playing.display_name && (
                <button
                  onClick={() => copyText(data.playing!.display_name || "")}
                  title="Copier Nom du chanteur"
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  👤
                </button>
              )}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0 }}>Aucune chanson en cours.</p>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            onClick={playNext}
            disabled={loadingNext}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#eee",
              cursor: loadingNext ? "wait" : "pointer",
              opacity: loadingNext ? 0.7 : 1,
            }}
          >
            {loadingNext ? "⏳ ..." : "⏭ Lire la suivante"}
          </button>
        </div>
      </section>

      {/* File d’attente (bas gauche) */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          background: "#f6f6f6",
        }}
      >
        <h2 style={{ marginTop: 0 }}>📋 File d’attente</h2>

        {data.waiting.length === 0 ? (
          <p>Aucun titre en attente.</p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
            {data.waiting.map((r, idx) => (
              <li
                key={r.id}
                style={{
                  marginBottom: 8,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  {r.isNew && <span style={{ color: "green" }}>🆕 </span>}
                  <strong>{r.title}</strong> — {r.artist}{" "}
                  <span style={{ opacity: 0.75 }}>
                    ({r.display_name || "?"})
                  </span>
                </div>

                {/* Boutons copier pour les 2 premiers en file */}
                {idx < 2 && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => copyText(`${r.title} — ${r.artist}`)}
                      title="Copier Titre + Artiste"
                      style={{
                        padding: "4px 6px",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                        background: "#fafafa",
                        cursor: "pointer",
                      }}
                    >
                      🎵
                    </button>
                    {r.display_name && (
                      <button
                        onClick={() => copyText(r.display_name || "")}
                        title="Copier Nom du chanteur"
                        style={{
                          padding: "4px 6px",
                          border: "1px solid #ccc",
                          borderRadius: 4,
                          background: "#fafafa",
                          cursor: "pointer",
                        }}
                      >
                        👤
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Déjà passées (bas droite) */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          background: "#f6f6f6",
        }}
      >
        <h2 style={{ marginTop: 0 }}>✅ Déjà passées</h2>

        {data.played.length === 0 ? (
          <p>Aucun titre terminé.</p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
            {data.played.map((r) => (
              <li
                key={r.id}
                style={{
                  marginBottom: 8,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <strong>{r.title}</strong> — {r.artist}{" "}
                <span style={{ opacity: 0.75 }}>
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
