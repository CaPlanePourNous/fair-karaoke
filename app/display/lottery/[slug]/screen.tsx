"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [names, setNames] = useState<string[]>([]); // facultatif pour le bandeau (on peut le laisser vide)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundReady, setSoundReady] = useState(false);

  // Charger room_id et dernier gagnant (au cas où la page arrive après un tirage)
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

        // 2) optionnel: charger quelques noms (affichage bandeau)
        //    on va juste prendre les chanteurs inscrits au karaoké (ou lottery_entries s’il y a RLS)
        //    Pour rester simple et robuste: on n’affiche rien si ça échoue.
        supa
          .from("singers")
          .select("display_name")
          .eq("room_id", room.id)
          .then(({ data }) => {
            const arr = (data || [])
              .map((s: any) => String(s?.display_name || "").trim())
              .filter(Boolean)
              .slice(-80);
            setNames(arr);
          })
          .catch(() => { /* ignore */ });

        // 3) dernier gagnant (pour afficher si tirage déjà fait)
        const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        let st: LotteryState = { ok: false };
        try { st = await r.json(); } catch {}
        if (st.ok && st.lastWinner?.singer_id) {
          const name = st.lastWinner.display_name || null;
          if (name && alive) {
            // on ne joue pas l’anim rétroactivement, on affiche juste le nom
            setWinnerName(name);
          }
        }
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Realtime: écoute des INSERT sur lottery_winners filtré par room_id
  useEffect(() => {
    if (!roomId) return;
    const ch = supa
      .channel(`lottery-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lottery_winners", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          try {
            // payload.new: { room_id, singer_id, entry_id, created_at, ... }
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
              // fallback sur /api/lottery/state
              const r = await fetch(`/api/lottery/state?room_slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
              let st: LotteryState = { ok: false };
              try { st = await r.json(); } catch {}
              name = st?.lastWinner?.display_name || null;
            }
            if (!name) name = "🎉 Gagnant";

            // animation → arrêt sur le nom
            runSlotAnimation(name);
          } catch (e) {
            // au pire: affiche direct sans anim
            setWinnerName("🎉 Gagnant");
          }
        }
      )
      .subscribe();

    return () => { supa.removeChannel(ch); };
  }, [roomId, slug]);

  // Armer le son (obligatoire pour lecture non bloquée)
  function armSound() {
    const a = new Audio("/ding.mp3");
    a.load();
    audioRef.current = a;
    setSoundReady(true);
  }

  // Confettis vanilla
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

      const fall = 100 + Math.random() * 40; // vh
      const drift = (Math.random() - 0.5) * 40; // vw
      const rot = (Math.random() - 0.5) * 720;

      d.animate(
        [
          { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${drift}vw, ${fall}vh) rotate(${rot}deg)`, opacity: 0.9 },
        ],
        { duration: 1000 + Math.random() * 1800, easing: "cubic-bezier(.17,.67,.31,1.01)", fill: "forwards" }
      );
    }

    setTimeout(() => {
      container.remove();
    }, durationMs);
  }

  // Slot animation: défilement rapide → ralentissement → stop sur winner
  function runSlotAnimation(finalName: string) {
    setRolling(true);
    setWinnerName(null);

    const pool = names.length ? names : ["🎤", "🍻", "…", "???"];
    const displayEl = document.getElementById("slot-display")!;
    let idx = 0;
    let interval = 50; // rapide au démarrage

    // phase 1: 1.2s à vitesse constante
    const t0 = Date.now();
    const phase1 = setInterval(() => {
      displayEl.textContent = pool[idx % pool.length];
      idx++;
      if (Date.now() - t0 > 1200) {
        clearInterval(phase1);
        phase2();
      }
    }, interval);

    // phase 2: slowdown + stop
    function phase2() {
      let steps = 20;
      let current = 0;
      const slow = setInterval(() => {
        if (current < steps - 1) {
          displayEl.textContent = pool[idx % pool.length];
          idx++;
          current++;
        } else {
          clearInterval(slow);
          displayEl.textContent = finalName || "🎉";
          setRolling(false);
          setWinnerName(finalName || "🎉");
          if (soundReady && audioRef.current) {
            try { audioRef.current.currentTime = 0; audioRef.current.play(); } catch {}
          }
          fireConfetti();
        }
      }, interval + current * 25);
    }
  }

  const canArm = useMemo(() => !soundReady, [soundReady]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(1200px 600px at 50% -10%, #1e293b 0%, #0b1220 55%, #050a14 100%)",
        color: "#fff",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,.1)",
        }}
      >
        <div style={{ opacity: 0.9 }}>Salle : <strong>{slug}</strong></div>
        <div style={{ display: "flex", gap: 8 }}>
          {canArm && (
            <button
              onClick={armSound}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.2)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                cursor: "pointer",
              }}
              title="Armer le son pour l’annonce du gagnant"
            >
              🔊 Activer le son
            </button>
          )}
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "24px",
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

          {/* sous-texte */}
          <div style={{ marginTop: 14, opacity: 0.85 }}>
            {rolling
              ? "Tirage en cours…"
              : winnerName
              ? "🎉 Bravo au gagnant !"
              : "Clique sur Tirer au sort depuis la page Host"}
          </div>

          {/* petite liste capsule (facultatif) */}
          {names.length > 0 && (
            <div
              style={{
                margin: "18px auto 0",
                maxWidth: 900,
                maxHeight: "28vh",
                overflow: "auto",
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px dashed rgba(255,255,255,.15)",
                background: "rgba(255,255,255,.03)",
                fontSize: 14,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: 0.85 }}>
                {names.map((n, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid rgba(255,255,255,.12)",
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

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
      </main>

      <footer
        style={{
          padding: "10px 16px",
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,.1)",
          opacity: 0.8,
          fontSize: 13,
        }}
      >
        Écran tirage — {new Date().getFullYear()}
      </footer>
    </div>
  );
}
