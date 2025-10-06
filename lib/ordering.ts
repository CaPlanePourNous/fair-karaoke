// lib/ordering.ts

export type Status = "waiting" | "playing" | "done" | "rejected";

export type Req = {
  id: string;
  room_id: string;
  singer_id: string | null;
  singer?: string | null; // legacy texte
  title: string;
  artist: string;
  status: Status;
  created_at: string;        // ISO
  updated_at?: string | null;
  played_at?: string | null;
  ip?: string | null;
};

export type OrderingInput = {
  waiting: Req[];
  playing: Req | null;
  done: Req[];
};

export type OrderingResult = {
  rejectIds: string[];
  orderedWaiting: Req[];
  reasons: Record<string, string>;
};

/**
 * Règles:
 * - R1: 2 chansons max par chanteur (waiting + playing)
 * - R2: espacement ≥3 entre deux titres du même chanteur (greedy; si impossible on relâche)
 * - R3: "newbies" (jamais passés, ni en cours) prioritaires
 * - R4: file max 15
 * - R5: pas de doublon (titre+artiste) même s'il est "done"
 */
export function computeOrdering(input: OrderingInput): OrderingResult {
  const playing = input.playing;
  const waiting = [...input.waiting];
  const done = [...input.done];

  const reasons: Record<string, string> = {}; // ✅ objet, pas tableau
  const rejectIds: string[] = [];

  // Normalisation clé "titre+artiste" pour R5
  const keyOf = (r: Req) =>
    `${r.title}`.trim().toLowerCase() + "—" + `${r.artist}`.trim().toLowerCase();

  // R5 — doublons: on construit l'ensemble de tout ce qui existe déjà
  const seenKeys = new Set<string>();
  for (const r of [...done, ...(playing ? [playing] : []), ...waiting]) {
    // On ne marque pas waiting maintenant pour ne pas auto-rejeter tous les doublons d'un coup;
    // on marquera au fil de l'eau: doublon si clé déjà vue AVANT dans l'historique (done/playing)
  }
  for (const r of done) seenKeys.add(keyOf(r));
  if (playing) seenKeys.add(keyOf(playing));

  // R1 — compteur par chanteur (waiting + playing)
  const countBySinger: Record<string, number> = {};
  const inc = (sid: string) => (countBySinger[sid] = (countBySinger[sid] ?? 0) + 1);
  if (playing?.singer_id) inc(playing.singer_id);

  // On rejette d'abord (hard) les waiting qui violent R5 (doublon existant) ou R1 (>2)
  const prefiltered: Req[] = [];
  for (const r of waiting) {
    // R5 doublon?
    const k = keyOf(r);
    if (seenKeys.has(k)) {
      rejectIds.push(r.id);
      reasons[r.id] = "R5: doublon (titre+artiste déjà présent)";
      continue;
    }

    // R1 2 max par chanteur (count waiting+playing)
    const sid = r.singer_id || "";
    if (sid) {
      const nextCount = (countBySinger[sid] ?? 0) + 1;
      if (nextCount > 2) {
        rejectIds.push(r.id);
        reasons[r.id] = "R1: 2 chansons max par chanteur";
        continue;
      }
    }

    // ok pour la suite
    prefiltered.push(r);
    if (sid) inc(sid);
    // On ajoute sa clé dans seenKeys pour éviter qu'un autre waiting identique passe plus tard
    seenKeys.add(k);
  }

  // R3 — "newbie": jamais passé (done) et pas en cours
  const passedSinger = new Set<string>();
  for (const r of done) if (r.singer_id) passedSinger.add(r.singer_id);
  if (playing?.singer_id) passedSinger.add(playing.singer_id);

  // Base de tri initial: newbies d'abord, puis ancienneté (created_at ASC)
  prefiltered.sort((a, b) => {
    const aNew = a.singer_id ? !passedSinger.has(a.singer_id) : false;
    const bNew = b.singer_id ? !passedSinger.has(b.singer_id) : false;
    if (aNew !== bNew) return aNew ? -1 : 1;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });

  // R2 — espacement ≥3: on construit l'ordre en insérant tant que possible
  const ordered: Req[] = [];
  const pool = [...prefiltered];

  // Pour la contrainte d'espacement, on considère l'historique récent:
  // on simule une "timeline" avec (done tail récent + playing + ordered) pour connaître la "distance".
  // Ici, on ne garde que l'info de dernière position par chanteur.
  const lastPos: Record<string, number> = {};
  let pos = 0;

  // seed avec done (on ne connaît pas leur ordre exact -> on prend par played_at/created_at ASC)
  const seed = [...done];
  seed.sort((a, b) => {
    const ta = Date.parse(a.played_at || a.created_at);
    const tb = Date.parse(b.played_at || b.created_at);
    return ta - tb;
  });
  for (const r of seed) {
    if (r.singer_id) lastPos[r.singer_id] = pos++;
  }
  if (playing?.singer_id) lastPos[playing.singer_id] = pos++;

  // Greedy: à chaque étape, on prend le premier candidat qui respecte la distance >=3
  // Si aucun ne peut être placé, on relaxe (on prend le premier).
  while (pool.length > 0) {
    let pickedIndex = -1;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      const sid = cand.singer_id || "";
      if (!sid) {
        pickedIndex = i;
        break;
      }
      const lp = lastPos[sid];
      if (lp === undefined || pos - lp >= 3) {
        pickedIndex = i;
        break;
      }
    }

    if (pickedIndex < 0) {
      // Relax: on prend le premier (on documente que R2 a été relâché pour ce candidat)
      pickedIndex = 0;
      const c = pool[pickedIndex];
      reasons[c.id] = reasons[c.id]
        ? reasons[c.id] + " | R2 tolérance"
        : "R2 tolérance";
    }

    const chosen = pool.splice(pickedIndex, 1)[0];
    ordered.push(chosen);
    const sid = chosen.singer_id || "";
    if (sid) lastPos[sid] = pos;
    pos++;
  }

  // R4 — limite 15
  const limited = ordered.slice(0, 15);
  if (ordered.length > 15) {
    for (const r of ordered.slice(15)) {
      rejectIds.push(r.id);
      reasons[r.id] = reasons[r.id]
        ? reasons[r.id] + " | R4: file pleine (15)"
        : "R4: file pleine (15)";
    }
  }

  return { rejectIds, orderedWaiting: limited, reasons };
}
