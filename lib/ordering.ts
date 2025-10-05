// lib/ordering.ts

export type RequestRow = {
  id: string;
  singer: string;
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
  rejectIds: string[];           // à passer "rejected"
  orderedWaiting: string[];      // file d’attente finale (ids) dans l’ordre
  reasons: Record<string, string>;
};

const key = (t: string, a: string) =>
  `${t}`.trim().toLowerCase() + " :: " + `${a}`.trim().toLowerCase();

/**
 * Calcule la file d’attente stable selon R1–R5 + anti-spam 30s IP.
 * - R1: 2 chansons max par chanteur (compte playing + waiting)
 * - R2: 3 chansons d’écart mini (tolérance si impossible)
 * - R3: nouveaux chanteurs prioritaires
 * - R4: file max 15
 * - R5: pas de doublon (title+artist), y compris "done"
 * - Anti-spam: 30s entre deux demandes d’une même IP
 */
export function computeOrdering(input: OrderingInput): OrderingResult {
  const now = input.now ?? new Date();
  const MAX = input.maxQueue ?? 15;

  const playing = input.requests.filter((r) => r.status === "playing");
  const done = input.requests.filter((r) => r.status === "done");
  const waiting = input.requests
    .filter((r) => r.status === "waiting")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const playedSet = new Set<string>([
    ...done.map((d) => key(d.title, d.artist)),
    ...(input.alreadyPlayed ?? []).map((p) => key(p.title, p.artist)),
  ]);

  const currentPlayingSinger = playing[0]?.singer ?? null;

  const reasons: Record<string, string> = {};
  const rejectIds: string[] = [];

  // R1: compteur par chanteur (inclut playing)
  const perSingerCount: Record<string, number> = {};
  for (const r of playing) perSingerCount[r.singer] = (perSingerCount[r.singer] ?? 0) + 1;

  // Anti-spam IP: on regarde l’intervalle entre 2 requêtes successives du même IP
  const waitingByTime = [...waiting].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const validCandidates: RequestRow[] = [];

  for (let i = 0; i < waitingByTime.length; i++) {
    const r = waitingByTime[i];
    const k = key(r.title, r.artist);

    // R5: doublon avec déjà joué
    if (playedSet.has(k)) {
      rejectIds.push(r.id);
      reasons[r.id] = "R5: doublon (déjà passé)";
      continue;
    }
    // R5: doublon multiple en waiting (on garde le plus ancien)
    if (validCandidates.some((x) => key(x.title, x.artist) === k)) {
      rejectIds.push(r.id);
      reasons[r.id] = "R5: doublon (waiting)";
      continue;
    }

    // Anti-spam IP < 30s
    if (r.ip) {
      const prev = waitingByTime
        .slice(0, i)
        .filter((x) => x.ip === r.ip)
        .pop();
      if (prev) {
        const dt = (new Date(r.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000;
        if (dt < 30) {
          rejectIds.push(r.id);
          reasons[r.id] = "Anti-spam IP: <30s";
          continue;
        }
      }
    }

    // R1: max 2 par chanteur (incluant playing)
    const count = perSingerCount[r.singer] ?? 0;
    if (count >= 2) {
      rejectIds.push(r.id);
      reasons[r.id] = "R1: >2 par chanteur";
      continue;
    }

    perSingerCount[r.singer] = count + 1;
    validCandidates.push(r);
  }

  // R3: nouveaux chanteurs prioritaires (pas en playing, pas dans done)
  const singersWithHistory = new Set<string>([
    ...done.map((d) => d.singer),
    ...(currentPlayingSinger ? [currentPlayingSinger] : []),
  ]);

  const newbies = validCandidates.filter((r) => !singersWithHistory.has(r.singer));
  const olds = validCandidates.filter((r) => singersWithHistory.has(r.singer));

  const ordered: RequestRow[] = [];

  // R2: >= 3 d’écart minimum : on autorise si dernière occurrence du chanteur est à >=3 places
  const canPlace = (row: RequestRow, list: RequestRow[]) => {
    const lastIndex = [...list]
      .map((x, i) => [x.singer, i] as const)
      .filter(([s]) => s === row.singer)
      .map(([, i]) => i)
      .pop();
    if (lastIndex === undefined) return true;
    return list.length - lastIndex >= 4; // 3 éléments d’écart entre deux de même chanteur
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
    // Si impossible de respecter strictement R2, on tolère et on annote
    for (const r of remaining) {
      ordered.push(r);
      reasons[r.id] = (reasons[r.id] ?? "") + (reasons[r.id] ? " | " : "") + "R2: tolérance";
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
