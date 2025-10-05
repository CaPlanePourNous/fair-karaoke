// app/host/[slug]/HostClient.tsx
"use client";
import { useEffect, useRef, useState } from "react";

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

  // Anti-course entre l’action et le polling
  const pausePollingUntil = useRef<number>(0);

  // ---- Rafraîchissement principal (avec pause temporaire) ----
  async function refresh(label: string = "refresh") {
    // Ne pas poller si on est dans la fenêtre de pause
    if (Date.now() < pausePollingUntil.current) {
      // console.debug(`[${label}] polling paused`);
      return;
    }
    try {
      const url = "/api/host/queue";
      // Logs côté client
      console.log(`[${label}] GET ${url}`);
      const r = await fetch(url, { cache: "no-store" });
      const text = await r.text();
      console.log(`[${label}] GET ${url} -> status:`, r.status);
      // Essayons de parser JSON, sinon on logue le texte
      try {
        const d = JSON.parse(text) as QueueData;
        setData(d);
        // Debug lisible
        console.log(`[${label}] queue:`, {
          playing: d?.playing?.id ? `${d.playing.title} — ${d.playing.artist}` : null,
          waiting: d?.waiting?.length,
          played: d?.played?.length,
        });
      } catch (e) {
        console.warn(`[${label}] Non-JSON response from /api/host/queue:`, text);
      }
    } catch (e) {
      console.error(`[${label}] /api/host/queue error:`, e);
    }
  }

  // ---- Copier texte ----
  function copyText(txt: string) {
    navigator.clipboard
      .writeText(txt)
      .catch(() => alert("Impossible de copier le texte."));
  }

  // ---- Passer à la suivante (avec logging + anti-polling) ----
  async function playNext() {
    if (loading) return;
    setLoading(true);

    // Pause le polling 2 secondes pour éviter l’effet “passe 1s puis revient”
    pausePollingUntil.current = Date.now() + 2000;

    try {
      // 1) Essai canonique : /api/host/next
      const url1 = "/api/host/next";
      console.log(`[playNext] POST ${url1}`);
      let resp = await fetch(url1, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      let body1 = await resp.text();
      console.log(`[playNext] ${url1} -> status:`, resp.status);
      console.log(`[playNext] ${url1} -> body:`, body1);

      // 2) Fallback si /next échoue
      if (!resp.ok) {
        const url2 = "/api/host/play";
        const payload = { next: true, slug };
        console.log(`[playNext] FALLBACK POST ${url2}`, payload);
        resp = await fetch(url2, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body2 = await resp.text();
        console.log(`[playNext] ${url2} -> status:`, resp.status);
        console.log(`[playNext] ${url2} -> body:`, body2);

        if (!resp.ok) {
          alert("Impossible de lancer la suivante (next/play en échec). Voir console.");
        }
      }

      // 3) On force un refresh serveur après l’action
      await refresh("after-playNext");

    } catch (err) {
      console.error("[playNext] network/API error:", err);
      alert("Erreur réseau ou API indisponible.");
      await refresh("after-error");
    } finally {
      setLoading(false);
      // On prolonge un peu la pause pour laisser passer un éventuel trigger DB
      pausePollingUntil.current = Date.now() + 1000;
      // Et on re-poll explicitement une fois juste après
      setTimeout(() => refresh("post-timeout"), 1200);
    }
  }

  // ---- Polling auto (toutes les 5s) ----
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
            cursor: loading ? "wait" : "pointer",
            background: "#f0f0f0",
            border: "1px solid #ccc",
            borderRadius: 6,
            opacity: loading ? 0.7 : 1,
          }}
          title="Marque la chanson en cours comme terminée et lance la suivante"
        >
          {loading ? "⏳ ..." : "⏭ Lire la suivante"}
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
            {data.waiting.map((r, idx) => (
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
                {/* boutons de copie pour les 2 premiers en file */}
                {idx < 2 && (
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
                )}
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
