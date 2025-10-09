// app/display/lottery/[slug]/screen.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type LotteryState = {
  ok: boolean;
  lastWinner?: { singer_id: string; display_name?: string | null; created_at: string };
  error?: string;
};

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LotteryDisplay({ slug }: { slug: string }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // anti-doublon: mémorise le dernier tirage (timestamp) déjà traité
  const lastWinnerAtRef = useRef<number>(0);

  // noms des inscrits pour enrichir le pool d’animation
  const namesRef = useRef<string[]>([]);

  // construit un pool (symboles + noms) pour l’animation
  function buildPool() {
    const symbols = ["🎤", "🍻", "…", "???", "🎶", "⭐"];
    const names = namesRef.current.length ? namesRef.current.slice() : [];
    const out: string[] = [];
    let i = 0, j = 0;
    while (out.length < 120) {
      out.push(symbols[i % symbols.length]);
      if (i % 2 === 1 && names.length) {
        out.push(names[j % names.length]);
        j++;
      }
      i++;
    }
    return out;
  }

  // Charger room_id, initialiser le marqueur "dernier gagnant" (sans l’afficher)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        const { data: room, error: eRoom } = await supa
          .from("rooms")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (eRoom) throw new Error(eRoom.message);
        if (!room?.id) throw new Error("ROOM_NOT_FOUND");
        if (!alive) return;
        setRoomId(room.id as string);

        // initialise le point de référence pour éviter d’animer sur un vieux tirage
        const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        let st: LotteryState = { ok: false };
        try { st = await r.json(); } catch {}
        if (st.ok && st.lastWinner?.created_at) {
          const ts = Date.parse(st.lastWinner.created_at);
          if (Number.isFinite(ts)) lastWinnerAtRef.current = ts;
        }

        // charger les noms des inscrits (affichage bandeau)
        const loadEntries = async () => {
          try {
            const { data, error: eList } = await supa
              .from("lottery_entries")
              .select("display_name")
              .eq("room_id", room.id);
            if (!eList && Array.isArray(data)) {
              namesRef.current = data
                .map((e: any) => String(e?.display_name || "").trim())
                .filter(Boolean);
            }
          } catch {/* ignore */}
        };
        await loadEntries();
        const it = setInterval(loadEntries, 30000);
        if (!alive) clearInterval(it);
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Realtime: un seul déclencheur (INSERT sur lottery_winners pour la room)
  useEffect(() => {
    if (!roomId) return;
    const ch = supa
      .channel(`lottery-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lottery_winners", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          try {
            // timestamp de l’INSERT (drawn_at prioritaire, fallback created_at)
            const p = (payload?.new as any) || {};
            const tsStr: string | undefined = p.drawn_at || p.created_at;
            if (tsStr) {
              const ts = Date.parse(tsStr);
              // garde anti-doublon: on ignore si on a déjà traité ce tirage
              if (Number.isFinite(ts) && ts <= lastWinnerAtRef.current) return;
              if (Number.isFinite(ts)) lastWinnerAtRef.current = ts;
            }

            // récupérer le nom
            let name: string | null = null;
            const singerId = p.singer_id as string | undefined;
            if (singerId) {
              const { data: s } = await supa
                .from("singers")
                .select("display_name")
                .eq("id", singerId)
                .maybeSingle();
              name = (s?.display_name || "").trim() || null;
            }
            if (!name) {
              const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
              let st: LotteryState = { ok: false };
              try { st = await r.json(); } catch {}
              name = st?.lastWinner?.display_name || null;
              const t2 = st?.lastWinner?.created_at ? Date.parse(st.lastWinner.created_at) : NaN;
              if (Number.isFinite(t2)) lastWinnerAtRef.current = t2;
            }
            if (!name) name = "🎉 Gagnant";

            if (!rolling) runSlotAnimation(name);
          } catch {
            setWinnerName("🎉 Gagnant"); // fallback sans anim
          }
        }
      )
      .subscribe();

    return () => { supa.removeChannel(ch); };
  }, [roomId, slug, rolling]);

  // Confettis plus nombreux/longs
  function fireConfetti(durationMs = 2800) {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.pointerEvents = "none";
    container.style.inset = "0";
    container.style.overflow = "hidden";
    container.style.zIndex = "99999";
    document.body.appendChild(container);

    const colors = ["#ff4747", "#ffd166", "#06d6a0", "#118ab2", "#8338ec"];
    const N = 240;

    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.width = `${8 + Math.random() * 6}px`;
      d.style.height = d.style.width;
      d.style.background = colors[Math.floor(Math.random() * colors.length)];
      d.style.top = "-10px";
      d.style.left = `${Math.random() * 100}%`;
      d.style.opacity = "0.95";
      d.style.transform = `rotate(${Math.random() * 360}deg)`;
      d.style.borderRadius = Math.random() < 0.3 ? "999px" : "3px";
      container.appendChild(d);

      const fall = 110 + Math.random() * 55;
      const drift = (Math.random() - 0.5) * 48;
      const rot = (Math.random() - 0.5) * 900;

      d.animate(
        [
          { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${drift}vw, ${fall}vh) rotate(${rot}deg)`, opacity: 0.9 },
        ],
        { duration: 1400 + Math.random() * 1800, easing: "cubic-bezier(.17,.67,.31,1.01)", fill: "forwards" }
      );
    }

    setTimeout(() => { container.remove(); }, durationMs);
  }

  // Animation (~5.5 s : 3.0s rapide + ~2.5s slowdown)
  function runSlotAnimation(finalName: string) {
    if (rolling) return;
    setRolling(true);
    setWinnerName(null);

    const pool = buildPool();
    const displayEl = document.getElementById("slot-display");
    if (!displayEl) {
      setRolling(false);
      setWinnerName(finalName || "🎉");
      return;
    }

    let idx = 0;
    const fastInterval = 50;

    // Phase 1 : 3s à vitesse constante
    const t0 = Date.now();
    const fastTimer = setInterval(() => {
      (displayEl as HTMLElement).textContent = pool[idx % pool.length];
      idx++;
      if (Date.now() - t0 >= 3000) {
        clearInterval(fastTimer);
        slowDown();
      }
    }, fastInterval);

    // Phase 2 : ralentissement progressif ≈ 2.5 s
    function slowDown() {
      const steps = 16;
      const base = 60;
      const grow = 40;
      let step = 0;

      const tick = () => {
        if (step < steps - 1) {
          (displayEl as HTMLElement).textContent = pool[idx % pool.length];
          idx++;
          step++;
          const nextDelay = base + step * grow;
          setTimeout(tick, nextDelay);
        } else {
          (displayEl as HTMLElement).textContent = finalName || "🎉";
          setRolling(false);
          setWinnerName(finalName || "🎉");
          try { new Audio("/ding.mp3").play().catch(() => {}); } catch {}
          fireConfetti();
        }
      };

      setTimeout(tick, base);
    }
  }

  // Reset manuel (neutre “Prêt pour le tirage…”)
  function resetScreen() {
    if (rolling) return;
    setWinnerName(null);
    setError(null);
  }

  // R = reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r" && !rolling) resetScreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rolling]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(1200px 600px at 50% -10%, #1e293b 0%, #0b1220 55%, #050a14 100%)",
        color: "#fff",
      }}
    >
      {!rolling && (
        <button
          onClick={resetScreen}
          style={{
            position: "fixed",
            top: 10,
            right: 12,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            cursor: "pointer",
            opacity: 0.7,
          }}
          title="Réinitialiser l’écran (R)"
        >
          Réinitialiser
        </button>
      )}

      <div style={{ width: "min(1100px, 92vw)", textAlign: "center", userSelect: "none" }}>
        <div
          style={{
            margin: "0 auto",
            padding: "16px 20px",
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
            border: "1px solid rgba(255,255,255,.12)",
            boxShadow: "0 10px 30px rgba(0,0,0,.35) inset",
          }}
        >
          <div
            id="slot-display"
            style={{
              fontSize: "min(10vw, 88px)",
              lineHeight: 1.1,
              fontWeight: 900,
              letterSpacing: ".5px",
              textShadow: "0 2px 0 rgba(0,0,0,.35)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              minHeight: "1.2em",
            }}
          >
            {winnerName ?? "Prêt pour le tirage…"}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            opacity: 0.9,
            fontSize: winnerName ? "min(5vw, 32px)" : "min(3.5vw, 20px)",
            fontWeight: winnerName ? 800 : 500,
          }}
        >
          {rolling ? "Tirage en cours…" : winnerName ? "🎉 Bravo au gagnant !" : ""}
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,80,80,.35)",
              background: "rgba(255,80,80,.08)",
              color: "#ffd7d7",
              fontSize: 14,
            }}
          >
            Erreur: {error}
          </div>
        )}
      </div>
    </div>
  );
}
