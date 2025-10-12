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
  done: Item[];
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

  // ---- Pause inscriptions (nouveau) ----
  const [paused, setPaused] = useState<boolean | null>(null);
  const [afterCutoff, setAfterCutoff] = useState<boolean>(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  async function loadPauseState() {
    try {
      const r = await fetch(`/api/host/requests/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setPaused(!!j.paused);
        setAfterCutoff(!!j.afterCutoff);
      }
    } catch {}
  }
  useEffect(() => { loadPauseState(); }, [slug]);

  async function togglePause(next: boolean) {
    if (pauseBusy) return;
    setPauseBusy(true);
    try {
      const r = await fetch("/api/host/requests/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_slug: slug, paused: next }),
      });
      const j = await r.json();
      if (j?.ok) setPaused(!!j.paused);
    } finally {
      setPauseBusy(false);
    }
  }
  // --------------------------------------

  // Styles sobres (pills)
  const card: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  };
  const pill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 999,
    background: "#f7f7f7",
    cursor: "pointer",
  };
  const pillPrimary: React.CSSProperties = {
    ...pill,
    background: "#efefef",
    fontWeight: 600,
  };

  // Fetch file d’attente
  async function fetchQueue(): Promise<QueueResponse> {
    try {
      const r = await fetch(`/api/host/queue?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`GET /api/host/queue ${r.status}`);
      const d = await r.json();
      return {
        ok: !!d.ok,
        error: d.error,
        playing: d.playing ?? null,
        waiting: Array.isArray(d.waiting) ? d.waiting : [],
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

  async function handleNext() {
    if (busy || !canNext) return;
    setBusy(true);
    try {
      const r = await fetch("/api/host/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_slug: slug }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
      const d = await fetchQueue();
      setData(d);
      setErr(d.ok ? null : d.error || "Erreur");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

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
      const st = await fetchLotteryState();
      setLotteryInfo(st);
    } catch (e: any) {
      // pas d'alert -> pas d'anim redéclenchée
      console.warn("Lottery draw failed:", e?.message || e);
    } finally {
      setLotteryBusy(false);
    }
  }

  async function handleRefreshLottery() {
    const st = await fetchLotteryState();
    setLotteryInfo(st);
  }

  async function removeRequest(id: string | number | undefined) {
    if (!id && id !== 0) return;
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || j?.ok !== true) throw new Error(j?.error || `HTTP ${r.status}`);
      const d = await fetchQueue();
      setData(d);
      setErr(d.ok ? null : d.error || "Erreur");
    } catch (e: any) {
      console.warn("Suppression impossible:", e?.message || e);
    }
  }

  // Copier
  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); } catch {}
  };
  const fmtTitleArtist = (r: Item) => `${r.title} - ${r.artist}`;
  const fmtSinger = (r: Item) => r.display_name?.trim() || "";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>🎛️ Host · {isLantignie ? "Lantignié" : slug}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            aria-busy={busy}
            onClick={handleNext}
            disabled={!canNext || busy}
            title="Lire la suivante (playing → done, 1er waiting → playing)"
            style={pillPrimary}
          >
            ⏭ Lire la suivante
          </button>
          <button
            onClick={async () => { const d = await fetchQueue(); setData(d); setErr(d.ok ? null : d.error || "Erreur"); loadPauseState(); }}
            title="Rafraîchir"
            style={pill}
          >
            ↻
          </button>
        </div>
      </header>

      {/* Nouveau : Suspendre / Réactiver inscriptions */}
      <section style={{ ...card, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong>Inscriptions :</strong>
        {paused === null ? (
          <span>Chargement…</span>
        ) : paused ? (
          <span style={{ color: "#b00020" }}>🔒 Suspendues</span>
        ) : afterCutoff ? (
          <span style={{ color: "#b00020" }}>⏰ Coupure auto (≥ 23:45)</span>
        ) : (
          <span style={{ color: "#0a6" }}>✅ Ouvertes</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => togglePause(!paused)}
          disabled={pauseBusy}
          style={{
            ...pill,
            color: "#fff",
            background: paused ? "#10b981" : "#ef4444",
            borderColor: paused ? "#0f9e6c" : "#d43a3a",
            fontWeight: 700,
          }}
          title={paused ? "Réactiver les inscriptions" : "Suspendre les inscriptions"}
        >
          {paused ? "Réactiver" : "Suspendre"}
        </button>
      </section>

      {err && (
        <div style={{ marginBottom: 12, padding: 8, border: "1px solid #f5b3b3", color: "#a40000", borderRadius: 8 }}>
          ⚠️ API: {err}
        </div>
      )}

      {/* En cours */}
      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>🎶 En cours</h2>
        {data.playing ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{data.playing.title}</div>
              <div style={{ opacity: 0.75 }}>{data.playing.artist}</div>
              {!!data.playing.display_name && <div style={{ marginTop: 4 }}>👤 {data.playing.display_name}</div>}
            </div>
            {/* Pas d’actions ici, on reste fidèle à ta page “qui allait bien” */}
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>Aucune chanson en cours.</div>
        )}
      </section>

      {/* File d’attente + passées */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>🕒 File d’attente ({data.waiting?.length ?? 0})</h2>
          {Array.isArray(data.waiting) && data.waiting.length > 0 ? (
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.waiting.map((r, idx) => (
                <li
                  key={(r.id ?? idx).toString()}
                  style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx + 1}. {r.title}
                    </div>
                    <div style={{ opacity: 0.75 }}>{r.artist}</div>
                    {!!r.display_name && <div style={{ opacity: 0.85 }}>👤 {r.display_name}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      title="Copier titre + artiste"
                      style={pill}
                      onClick={() => copy(fmtTitleArtist(r))}
                    >
                      📋 Copier titre + artiste
                    </button>
                    {!!r.display_name && (
                      <button
                        title="Copier nom du chanteur"
                        style={pill}
                        onClick={() => copy(fmtSinger(r))}
                      >
                        📋 Copier nom
                      </button>
                    )}
                    <button
                      title="Retirer de la file"
                      style={{ ...pill, borderColor: "#e4c0c0", background: "#ffecec" }}
                      onClick={() => removeRequest(r.id)}
                    >
                      🗑 Retirer
                    </button>
                  </div>
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
                <li
  key={(r.id ?? `p-${idx}`).toString()}
  style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}
>
  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
    {r.title}
  </div>
  <div style={{ opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
    {r.artist}
  </div>
</li>

              ))}
            </ol>
          ) : (
            <div style={{ opacity: 0.7 }}>Aucune chanson passée.</div>
          )}
        </div>
      </section>

      {/* Loterie */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>🎲 Tirage au sort (Host)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleDraw} disabled={lotteryBusy} style={pillPrimary}>
            {lotteryBusy ? "…" : "Tirer au sort"}
          </button>
          <button onClick={handleRefreshLottery} style={pill}>
            État loterie
          </button>
        </div>
        {!!lotteryInfo && (
          <div style={{ marginTop: 8 }}>
            {lotteryInfo.ok ? (
              <>
                <div>Inscriptions : <strong>{lotteryInfo.entriesCount ?? "?"}</strong></div>
                {lotteryInfo.lastWinner ? (
                  <div>
                    Dernier gagnant : <strong>{lotteryInfo.lastWinner.display_name || lotteryInfo.lastWinner.singer_id}</strong>{" "}
                    ({new Date(lotteryInfo.lastWinner.created_at).toLocaleString()})
                  </div>
                ) : <div>Aucun gagnant récent.</div>}
              </>
            ) : (
              <div style={{ color: "#a40000" }}>Erreur loterie : {lotteryInfo.error}</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
