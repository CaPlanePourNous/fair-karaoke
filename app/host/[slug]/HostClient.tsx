"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id?: string | number;
  title: string;
  artist: string;
  display_name?: string;
};

type HostQueuePayload = {
  playing?: Item | null;
  waiting?: Item[];
  played?: Item[];
};

export default function HostClient({ slug }: { slug: string }) {
  const isLantignie = slug.toLowerCase() === "lantignie";

  const [data, setData] = useState<HostQueuePayload>({
    playing: null,
    waiting: [],
    played: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Fetch queue periodically (background) ---
  const fetchQueue = async () => {
    try {
      const r = await fetch("/api/host/queue", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = (await r.json()) as HostQueuePayload;
      setData({
        playing: d?.playing ?? null,
        waiting: Array.isArray(d?.waiting) ? d.waiting : [],
        played: Array.isArray(d?.played) ? d.played : [],
      });
      setError(null);
    } catch (e: any) {
      setError("Impossible de charger la file");
    }
  };

  useEffect(() => {
    fetchQueue();
    const it = setInterval(fetchQueue, 5000);
    return () => clearInterval(it);
  }, []);

  // --- Helpers copy ---
  const copy = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };
  const copyTitleArtist = (it: Item) => copy(`${it.title} — ${it.artist}`);
  const copySinger = (it: Item) => copy(it.display_name ?? "");

  const waitingFirstTwo = useMemo(() => (data.waiting ?? []).slice(0, 2), [data.waiting]);

  // Peut passer à la suivante seulement s'il y a au moins 1 en attente
  const canNext = Array.isArray(data.waiting) && data.waiting.length > 0;

  // --- Action: Lire la suivante -> POST /api/host/next (gère done + start) ---
  const handleNext = async () => {
    if (busy || !canNext) return;
    setBusy(true);
    try {
      const r = await fetch("/api/host/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || "Échec de /api/host/next");
      }
      await fetchQueue();
    } catch (e: any) {
      setError(e?.message || "Impossible de passer à la suivante");
    } finally {
      setBusy(false);
    }
  };

  // --- Styles sobres ---
  const card: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  };
  const btn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 999,
    background: "#f7f7f7",
    cursor: "pointer",
  };
  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "#efefef",
    fontWeight: 600,
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1>🎤 Karaoké — {isLantignie ? "Lantignié" : slug}</h1>

      {error && <p style={{ color: "#b00", margin: "8px 0" }}>{error}</p>}

      {/* Zone 1 : En cours */}
      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>En cours</h2>
        {data.playing ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {data.playing.title} — {data.playing.artist}
            </div>
            {data.playing.display_name && (
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Chanteur·euse : <strong>{data.playing.display_name}</strong>
              </div>
            )}
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn} onClick={() => copyTitleArtist(data.playing!)}>Copier Titre+Artiste</button>
              {data.playing.display_name && (
                <button style={btn} onClick={() => copySinger(data.playing!)}>Copier Nom</button>
              )}
            </div>
          </div>
        ) : (
          <p style={{ marginTop: 8, opacity: 0.8 }}>Aucune lecture en cours.</p>
        )}
      </section>

      {/* Zone bouton central : Lire la suivante */}
      <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
        <button
          style={btnPrimary}
          onClick={handleNext}
          disabled={!canNext || busy}
          aria-busy={busy}
          title="Marque la chanson en cours comme terminée et lance la suivante"
        >
          {"▶"} Lire la suivante
        </button>
      </div>

      {/* Zone 2 : grille 2 colonnes (Attente / Passées) */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {/* Colonne gauche : File d'attente */}
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>File d’attente</h2>
          {Array.isArray(data.waiting) && data.waiting.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
              {data.waiting.map((it, idx) => (
                <li
                  key={(it.id ?? idx).toString()}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #f1f1f1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.title} — {it.artist}
                    </div>
                    {it.display_name && (
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{it.display_name}</div>
                    )}
                  </div>

                  {/* Boutons de copie SEULEMENT pour les deux premiers de la file */}
                  {idx < 2 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={btn} onClick={() => copyTitleArtist(it)} title="Copier Titre + Artiste">
                        Copier T+A
                      </button>
                      {it.display_name && (
                        <button style={btn} onClick={() => copySinger(it)} title="Copier Nom">
                          Copier Nom
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: 8, opacity: 0.8 }}>Personne en attente.</p>
          )}
        </div>

        {/* Colonne droite : Chansons passées */}
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Passées</h2>
          {Array.isArray(data.played) && data.played.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
              {data.played.map((it, idx) => (
                <li
                  key={(it.id ?? `p-${idx}`).toString()}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #f1f1f1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.title} — {it.artist}
                    </div>
                    {it.display_name && (
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{it.display_name}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: 8, opacity: 0.8 }}>Aucune chanson passée pour l’instant.</p>
          )}
        </div>
      </section>

      {/* Responsive : pile en 1 colonne en dessous de 900px */}
      <style jsx>{`
        @media (max-width: 900px) {
          section:nth-of-type(3) {
            display: block !important;
          }
          section:nth-of-type(3) > div + div {
            margin-top: 16px;
          }
        }
      `}</style>
    </main>
  );
}
