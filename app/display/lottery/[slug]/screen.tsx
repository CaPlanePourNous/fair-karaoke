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

  // garde-fous pour éviter anims multiples
  const lastWinnerAtRef = useRef<number>(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Charger room_id + dernier gagnant (si la page arrive après un tirage)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        // 1) room_id
        const { data: room, error: eRoom } = await supa
          .from("rooms")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (eRoom) throw new Error(eRoom.message);
        if (!room?.id) throw new Error("ROOM_NOT_FOUND");
        if (!alive) return;
        setRoomId(room.id as string);

        // 2) dernier gagnant
        const r = await fetch(
          `/api/lottery/state?room_slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" }
        );
        let st: LotteryState = { ok: false };
        try { st = await r.json(); } catch {}
        if (st.ok && st.lastWinner?.created_at) {
          const ts = Date.parse(st.lastWinner.created_at);
          if (Number.isFinite(ts)) lastWinnerAtRef.current = ts;
          const name = (st.lastWinner.display_name || "").trim();
          if (name && alive) {
            // on affiche le dernier gagnant (sans relancer d’anim rétroactive)
            setWinnerName(name);
          }
        }
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Realtime: écoute INSERT sur lottery_winners pour la room
  useEffect(() => {
    if (!roomId) return;
    const ch = supa
      .channel(`lottery-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lottery_winners", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          try {
            const createdAt = (payload?.new as any)?.created_at as string | undefined;
            if (createdAt) {
              const t = Date.parse(createdAt);
              if (Number.isFinite(t)) lastWinnerAtRef.current = t;
            }

            const singerId = (payload?.new as any)?.singer_id as string | undefined;
            let name: string | null = null;
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
              if (st?.lastWinner?.created_at) {
                const t = Date.parse(st.lastWinner.created_at);
                if (Number.isFinite(t)) lastWinnerAtRef.current = t;
              }
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

  // Fallback: Poll l’état toutes les 2s, lance l’anim si un nouveau gagnant apparaît
  useEffect(() => {
    if (!roomId) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        if (rolling) return; // ne poll pas pendant l'anim
        const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        let st: LotteryState = { ok: false };
        try { st = await r.json(); } catch {}
        const created = st?.lastWinner?.created_at;
        const name = (st?.lastWinner?.display_name || "").trim();
        if (!created || !name) return;
        const ts = Date.parse(created);
        if (!Number.isFinite(ts)) return;
        if (ts > lastWinnerAtRef.current) {
          lastWinnerAtRef.current = ts;
          runSlotAnimation(name);
        }
      } catch {
        // ignore
      }
    }, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [roomId, slug, rolling]);

  // Confettis
  function fireConfetti(durationMs = 1800) {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.pointerEvents = "none";
    container.style.inset = "0";
    container.style.overflow = "hidden";
    container.style.zIndex = "99999";
    document.body.appendChild(container);

    const colors = ["#ff4747", "#ffd166", "#06d6a0", "#118ab2", "#8338ec"];
    const N = 120;

    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.width = `${8 + Math.random() * 6}px`;
      d.style.height = d.style.width;
      d.style.background = colors[Math.floor(Math.random() * colors.length)];
      d.style.top = "-10px";
      d.style.left = `${Math.random() * 100}%`;
      d.style.opacity = "0.9";
      d.style.transform = `rotate(${Math.random() * 360}deg)`;
      d.style.borderRadius = Math.random() < 0.3 ? "999px" : "3px";
      container.appendChild(d);

      const fall = 100 + Math.random() * 40;
      const drift = (Math.random() - 0.5) * 40;
      const rot = (Math.random() - 0.5) * 720;

      d.animate(
        [
          { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${drift}vw, ${fall}vh) rotate(${rot}deg)`, opacity: 0.9 },
        ],
        { duration: 1000 + Math.random() * 1800, easing: "cubic-bezier(.17,.67,.31,1.01)", fill: "forwards" }
      );
    }

    setTimeout(() => { container.remove(); }, durationMs);
  }

  // Animation slot : ~6.5 s (3 s rapide + ~3.5 s slowdown progressif)
  function runSlotAnimation(finalName: string) {
    if (rolling) return;
    setRolling(true);
    setWinnerName(null);

    const pool = ["🎤", "🍻", "…", "???"];
    const displayEl = document.getElementById("slot-display");
    if (!displayEl) {
      // si pour une raison quelconque l’élément n’est pas prêt, on affiche direct
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

    // Phase 2 : ralentissement progressif par setTimeout chaînés
    function slowDown() {
      // 18 pas, délai qui s’allonge à chaque tick (≈ 3.5 s au total)
      const steps = 18;
      const base = 80;     // ms de départ
      const grow = 60;     // on ajoute ~60 ms par pas
      let step = 0;

      const tick = () => {
        if (step < steps - 1) {
          (displayEl as HTMLElement).textContent = pool[idx % pool.length];
          idx++;
          step++;
          const nextDelay = base + step * grow;
          setTimeout(tick, nextDelay);
        } else {
          // arrêt final sur le gagnant
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
      <div
        style={{
          width: "min(1100px, 92vw)",
          textAlign: "center",
          userSelect: "none",
        }}
      >
        {/* Bandeau roulette */}
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

        {/* sous-texte minimal */}
        <div style={{ marginTop: 14, opacity: 0.85 }}>
          {rolling
            ? "Tirage en cours…"
            : winnerName
            ? "🎉 Bravo au gagnant !"
            : ""}
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
