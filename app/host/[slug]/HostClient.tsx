"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id?: string | number;
  title: string;
  artist: string;
  display_name?: string | null;
};

type QueueResponse = {
  ok: boolean;
  error?: string;
  playing: Item | null;
  waiting: Item[];
  done: Item[]; // l'API renvoie aussi 'played' en alias, mais on normalise côté route
};

type LotteryState = {
  ok: boolean;
  error?: string;
  entriesCount?: number;
  lastWinner?: { singer_id: string; created_at: string; display_name?: string | null };
};

export default function HostClient({ slug }: { slug: string }) {
  const isLantignie = slug.toLowerCase() === "lantignie";

  const [data, setData] = useState<QueueResponse>({
    ok: true,
    playing: null,
    waiting: [],
    done: [],
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotteryBusy, setLotteryBusy] = useState(false);
  const [lotteryInfo, setLotteryInfo] = useState<LotteryState | null>(null);

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

  // --- Fetch résilient (ne jette jamais) ---
  async function fetchQueue(): Promise<QueueResponse> {
    try {
      const r = await fetch(`/api/host/queue?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`GET /api/host/queue ${r.status} ${txt}`);
      }
      const d = (await r.json()) as any;
      return {
        ok: !!d.ok,
        error: d.error,
        playing: d.playing ?? null,
        waiting: Array.isArray(d.waiting) ? d.waiting : [],
        // l’API renvoie 'played' et 'done' → on prend 'done'
        done: Array.isArray(d.done) ? d.done : (Array.isArray(d.played) ? d.played : []),
      };
    } catch (e) {
      return { ok: false, error: String(e), playing: null, waiting: [], done: [] };
    }
  }

  async function fetchLotteryState(): Promise<LotteryState> {
    try {
      const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      return j as LotteryState;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const d = await fetchQueue();
      if (mounted) {
        setData(d);
        setErr(d.ok ? null : d.error || "Erreur");
      }
    };
    load();
    const it = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(it); };
  }, [slug]);

  const canNext = useMemo(
    () => Array.isArray(data.waiting) && data.waiting.length > 0,
    [data.waiting]
  );

  // --- Action: Lire la suivante (contrat: POST /api/host/play { room_slug })
  async function handleNext() {
    if (busy || !canNext) return;
    setBusy(true);
    try {
      const r = await fetch("/api/host/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_slug: slug }),
      });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      // refetch pour afficher l’état à jour
      const d = await fetchQueue();
      setData(d);
      setErr(d.ok ? null : d.error || "Erreur");
    } catch (e: any) {
      setErr(String(e?.message || e));
      alert(String(e?.message || "Impossible de passer à la suivante"));
    } finally {
      setBusy(false);
    }
  }

  // --- Lottery: tirage + état ---
  async function handleDraw() {
    if (lotteryBusy) return;
    setLotteryBusy(true);
    try {
      const r = await fetch("/api/lottery/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_slug: slug }),
      });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
      alert("🎉 Tirage effectué !");
      const st = await fetchLotteryState();
      setLotteryInfo(st);
    } catch (e: any) {
      alert(String(e?.message || "Échec du tirage"));
    } finally {
      setLotteryBusy(false);
    }
  }

  async function handleRefreshLottery() {
    const st = await fetchLotteryState();
    setLotteryInfo(st);
    if (!st.ok && st.error) {
      console.warn("Lottery state:", st.error);
    }
  }

  // --- util copier ---
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

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>
          🎛️ Host · {isLantignie ? "Lantignié" : slug}
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleNext}
            disabled={!canNext || busy}
            aria-busy={busy}
            style={btnPrimary}
            title="Lire la suivante (playing → done, 1er waiting → playing)"
          >
            ⏭ Lire la suivante
          </button>
          <button
            onClick={async () => {
              const d = await fetchQueue();
              setData(d);
              setErr(d.ok ? null : d.error || "Erreur");
            }}
            style={btn}
            title="Rafraîchir"
          >
            ↻
          </button>
        </div>
      </header>

      {err && (
        <div style={{ marginBottom: 12, padding: 8, border: "1px solid #f5b3b3", color: "#a40000", borderRadius: 8 }}>
          ⚠️ API: {err} — l’interface reste fonctionnelle, nouvel essai automatique en cours…
        </div>
      )}

      {/* En cours (aucun bouton copier ici, comme demandé) */}
      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>🎶 En cours</h2>
        {data.playing ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{data.playing.title}</div>
              <div style={{ opacity: 0.75 }}>{data.playing.artist}</div>
              {!!data.playing.display_name && (
                <div style={{ marginTop: 4 }}>👤 {data.playing.display_name}</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>Aucune chanson en cours.</div>
        )}
      </section>

      {/* Grille 2 colonnes : File / Passées */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>🕒 File d’attente ({data.waiting?.length ?? 0})</h2>
          {Array.isArray(data.waiting) && data.waiting.length > 0 ? (
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.waiting.map((r, idx) => (
                <li
                  key={(r.id ?? idx).toString()}
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
                      {idx + 1}. {r.title}
                    </div>
                    <div style={{ opacity: 0.75 }}>{r.artist}</div>
                    {!!r.display_name && <div style={{ opacity: 0.85 }}>👤 {r.display_name}</div>}
                  </div>

                  {/* Sur les 2 premiers : deux boutons copier (titre+artiste ET nom) */}
                  {idx < 2 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={btn}
                        onClick={() => copy(`${r.title} — ${r.artist}`)}
                        title="Copier titre + artiste"
                      >
                        📋 Copier titre + artiste
                      </button>

                      <button
                        style={{
                          ...btn,
                          cursor: r.display_name ? "pointer" : "not-allowed",
                          opacity: r.display_name ? 1 : 0.6,
                        }}
                        onClick={() => {
                          const name = (r.display_name || "").trim();
                          if (name) copy(name);
                        }}
                        disabled={!r.display_name}
                        title="Copier nom du chanteur"
                      >
                        📋 Copier nom
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ opacity: 0.7 }}>Rien en attente.</div>
          )}
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0 }}>✅ Déjà passées</h2>
          {Array.isArray(data.done) && data.done.length > 0 ? (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "60vh", overflow: "auto" }}>
              {data.done.map((r, idx) => (
                <li key={(r.id ?? `p-${idx}`).toString()} style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
                  <div style={{ fontWeight: 600 }}>{r.title}</div>
                  <div style={{ opacity: 0.75 }}>{r.artist}</div>
                  {!!r.display_name && <div style={{ opacity: 0.85 }}>👤 {r.display_name}</div>}
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ opacity: 0.7 }}>Aucune chanson passée pour l’instant.</div>
          )}
        </div>
      </section>

      {/* Loterie (Host) */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>🎲 Tirage au sort (Host)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleDraw} disabled={lotteryBusy} style={btnPrimary}>
            {lotteryBusy ? "…" : "Tirer au sort"}
          </button>
          <button onClick={handleRefreshLottery} style={btn}>
            État loterie
          </button>
        </div>
        {!!lotteryInfo && (
          <div style={{ marginTop: 8, opacity: 0.9 }}>
            {lotteryInfo.ok ? (
              <>
                <div>Inscriptions : <strong>{lotteryInfo.entriesCount ?? "?"}</strong></div>
                {lotteryInfo.lastWinner ? (
                  <div>
                    Dernier gagnant :{" "}
                    <strong>{lotteryInfo.lastWinner.display_name || lotteryInfo.lastWinner.singer_id}</strong>{" "}
                    ({new Date(lotteryInfo.lastWinner.created_at).toLocaleString()})
                  </div>
                ) : (
                  <div>Aucun gagnant récent.</div>
                )}
              </>
            ) : (
              <div style={{ color: "#a40000" }}>Erreur loterie : {lotteryInfo.error}</div>
            )}
          </div>
        )}
      </section>

      {/* Responsive */}
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
