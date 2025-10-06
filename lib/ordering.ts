// lib/ordering.ts

export type RequestRow = {
  id: string;
  // Nouveau schéma : on priorise singer_id (uuid)
  singer_id?: string | null;
  // Legacy (temps de migration) : on garde singer (texte) pour fallback
  singer?: string | null;
  display_name?: string | null; // optionnel, utile côté UI
  title: string;
  artist: string;
  ip?: string | null;
  status: "waiting" | "playing" | "done" | "rejected";
  created_at: string; // ISO
};

export type OrderingInput = {
  requests: RequestRow[]; // waiting | playing | done | rejected (on filtrera)
  alreadyPlayed?: Array<{ title: string; artist: string }>;
  now?: Date;
  maxQueue?: number; // défaut 15
};

export type OrderingResult = {
  rejectIds: string[];      // à passer "rejected"
  orderedWaiting: string[]; // file d’attente finale (ids) dans l’ordre
  reasons: Record<string, string>;
};

const dupKey = (t: string, a: string) =>
  `${t}`.trim().toLowerCase() + " :: " + `${a}`.trim().toLowerCase();

// Identifiant stable de chanteur : singer_id sinon singer, sinon un placeholder unique
const singerKeyOf = (r: Pick<RequestRow, "id" | "singer_id" | "singer">) =>
  (r.singer_id && String(r.singer_id)) ||
  (r.singer && r.singer.trim().toLowerCase()) ||
  `__unknown__#${r.id}`;

/**
 * Calcule la file d’attente stable selon R1–R5 + anti-spam 30s IP.
 * - R1: 2 chansons max par chanteur (compte playing + waiting)
 * - R2: 3 chansons d’écart mini (tolérance si impossible)
 * - R3: nouveaux chanteurs prioritaires
 * - R4: file max 15
 * - R5: pas de doublon (title+artist), y compris "done"
 * - Anti-spam: 30s entre deux demandes d’une même IP
 *
 * ⚠️ NOTE: l’anti-spam doit aussi être appliqué à l’insertion (/api/requests).
 */
export function computeOrdering(input: OrderingInput): OrderingResult {
  const now = input.now ?? new Date();
  const MAX = input.maxQueue ?? 15;

  const playing = input.requests.filter((r) => r.status === "playing");
  const done = input.requests.filter((r) => r.status === "done");
  const waiting = input.requests
    .filter((r) => r.status === "waiting")
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // R5: pas de doublon (inclut done et éventuellement alreadyPlayed)
  const playedSet = new Set<string>([
    ...done.map((d) => dupKey(d.title, d.artist)),
    ...(input.alreadyPlayed ?? []).map((p) => dupKey(p.title, p.artist)),
  ]);

  const currentPlayingSingerKey = playing[0]
    ? singerKeyOf(playing[0])
    : null;

  const reasons: Record<string, string> = [];
  const rejectIds: string[] = [];

  // R1: compteur par chanteur (inclut playing)
  const perSingerCount: Record<string, number> = {};
  for (const r of playing) {
    const sk = singerKeyOf(r);
    perSingerCount[sk] = (perSingerCount[sk] ?? 0) + 1;
  }

  // Anti-spam IP : contrôle <30s entre demandes successives du même IP dans waiting
  const waitingByTime = [...waiting].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const validCandidates: RequestRow[] = [];

  for (let i = 0; i < waitingByTime.length; i++) {
    const r = waitingByTime[i];
    const k = dupKey(r.title, r.artist);
    const sk = singerKeyOf(r);

    // R5: doublon déjà joué
    if (playedSet.has(k)) {
      rejectIds.push(r.id);
      reasons[r.id] = "R5: doublon (déjà passé)";
      continue;
    }
    // R5: doublon multiple en waiting (on garde le plus ancien)
    if (validCandidates.some((x) => dupKey(x.title, x.artist) === k)) {
      rejectIds.push(r.id);
      reasons[r.id] = "R5: doublon (waiting)";
      continue;
    }

    // Anti-spam IP < 30s (dans waiting courant)
    if (r.ip) {
      const prev = waitingByTime.slice(0, i).filter((x) => x.ip === r.ip).pop();
      if (prev) {
        const dt =
          (new Date(r.created_at).getTime() -
            new Date(prev.created_at).getTime()) / 1000;
        if (dt < 30) {
          rejectIds.push(r.id);
          reasons[r.id] = "Anti-spam IP: <30s";
          continue;
        }
      }
    }

    // R1: max 2 par chanteur (incluant playing)
    const count = perSingerCount[sk] ?? 0;
    if (count >= 2) {
      rejectIds.push(r.id);
      reasons[r.id] = "R1: >2 par chanteur";
      continue;
    }

    perSingerCount[sk] = count + 1;
    validCandidates.push(r);
  }

  // R3: nouveaux chanteurs prioritaires (pas en playing, pas dans done)
  const singersWithHistory = new Set<string>([
    ...done.map((d) => singerKeyOf(d)),
    ...(currentPlayingSingerKey ? [currentPlayingSingerKey] : []),
  ]);

  const newbies = validCandidates.filter(
    (r) => !singersWithHistory.has(singerKeyOf(r))
  );
  const olds = validCandidates.filter((r) =>
    singersWithHistory.has(singerKeyOf(r))
  );

  const ordered: RequestRow[] = [];

  // R2: >= 3 d’écart entre deux entrées du même chanteur.
  const canPlace = (row: RequestRow, list: RequestRow[]) => {
    const sk = singerKeyOf(row);
    const lastIndex = [...list]
      .map((x, i) => [singerKeyOf(x), i] as const)
      .filter(([s]) => s === sk)
      .map(([, i]) => i)
      .pop();
    if (lastIndex === undefined) return true;
    // on place en fin → il faut au moins 3 éléments entre les deux occurrences
    return list.length - lastIndex >= 4;
  };

  const drainWithSpacing = (pool: RequestRow[]) => {
    const remaining = [...pool];
    let progressed = true;
    while (remaining.length && progressed) {
      progressed = false;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (canPlace(candidate, ordered)) {
          ordered.push(candidate);
          remaining.splice(i, 1);
          progressed = true;
          i--;
        }
      }
    }
    // Tolérance si R2 strict est impossible
    for (const r of remaining) {
      ordered.push(r);
      reasons[r.id] =
        (reasons[r.id] ?? "") +
        (reasons[r.id] ? " | " : "") +
        "R2: tolérance";
    }
  };

  drainWithSpacing(newbies);
  drainWithSpacing(olds);

  // R4: limite 15
  const clipped = ordered.slice(0, MAX);
  const overflow = ordered.slice(MAX);
  for (const r of overflow) {
    rejectIds.push(r.id);
    reasons[r.id] = "R4: file pleine (15)";
  }

  return {
    rejectIds,
    orderedWaiting: clipped.map((r) => r.id),
    reasons,
  };
}
