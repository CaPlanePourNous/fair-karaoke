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

  // ---- Rafraîchissement principal ----
  async function refresh() {
    try {
      const r = await fetch("/api/host/queue", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = (await r.json()) as QueueData;
      setData(d);
    } catch (e) {
      console.error("Erreur refresh():", e);
    }
  }

  // ---- Fonction de passage à la suivante ----
  async function playNext() {
    if (loading) return;
    setLoading(true);

    // Mise à jour locale optimiste pour retour visuel immédiat
    setData((prev) => {
      const next = prev.waiting[0];
      if (!next) return prev;
      const playedNow = prev.playing ? [prev.playing, ...prev.played] : prev.played;
      return {
        playing: next,
        waiting: prev.waiting.slice(1),
        played: playedNow,
      };
    });

    try {
      // 1) tentative "canonique" : POST /api/host/next
      let resp = await fetch("/api/host/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // 2) fallback si non dispo / non 2xx : POST /api/host/play { next:true, slug }
      if (!resp.ok) {
        const body1 = await resp.text();
        console.log("[/api/host/next] status:", resp.status, "body:", body1);

        resp = await fetch("/api/host/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next: true, slug }),
        });

        const body2 = await resp.text();
        console.log("[/api/host/play] status:", resp.status, "body:", body2);

        if (!resp.ok) {
          // si les deux échouent, avertir et recoller à l’état réel serveur
          alert("Impossible de lancer la suivante.");
        }
      }

      // resynchronisation serveur (si l’API a fait plus/moins que prévu)
      await refresh();
    } catch (err) {
      console.error("playNext() network error:", err);
      alert("Erreur réseau ou API indisponible.");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  // ---- Copier texte ----
  function copyText(txt: string) {
    navigator.clipboard
      .writeText(txt)
      .catch(() => alert("Impossible de copier le texte."));
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
          <p style={{ fontSize: "1.2em", marginBottom: 12 }}>
            ▶ <strong>{data.playing.title}</strong> — {data.playing.artist}{" "}
            ({data.playing.display_name || "?"})
          </p>
        ) : (
          <p>Aucun titre en cours.</p>
        )}

        <button
          onClick={playNext}
          style={{
            padding: "8px 12px",
            marginTop: 8,
            cursor: "pointer",
            background: "#f0f0f0",
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          ⏭ Lire la suivante
        </button>
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
                    onClick={() => copyText(`${r.title} — ${r.artist}`)}
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
                    onClick={() => copyText(r.display_name || "")}
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
