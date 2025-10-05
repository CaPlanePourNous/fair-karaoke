// lib/ordering.ts

export type Req = {
  id: string;
  title: string;
  artist: string;
  display_name: string | null;
  ip_address: string | null;
  status: "pending" | "approved" | "playing" | "done";
  created_at: string;        // ISO
  played_at: string | null;  // ISO
  isNew?: boolean;           // badge UI (nouveau)
};

function ipKey(r: Req) {
  return (r.ip_address ?? "").trim().toLowerCase();
}

/**
 * Règles:
 * - Nouveaux (IP jamais vues aujourd’hui) en FIFO (ordre d’arrivée).
 * - Vétérans en FIFO en respectant un écart >= 3 titres entre deux passages de la même IP.
 * - Si l’écart ne peut pas être respecté (plus personne à intercaler), on force l’insertion UNE FOIS
 *   pour éviter un blocage, puis on continue.
 */
export function prepareQueue(waitingRaw: Req[], played: Req[], playing: Req | null): Req[] {
  const MIN_GAP = 3;

  // IP déjà vues aujourd’hui (played + playing)
  const seen = new Set<string>();
  for (const r of played) seen.add(ipKey(r));
  if (playing) seen.add(ipKey(playing));

  // FIFO de base sur created_at pour stabilité
  const waiting = [...waitingRaw].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Regrouper par IP pour extraire "premier titre" des nouveaux
  const byIP = new Map<string, Req[]>();
  for (const r of waiting) {
    const k = ipKey(r);
    if (!byIP.has(k)) byIP.set(k, []);
    byIP.get(k)!.push(r);
  }

  const newcomers: Req[] = [];
  const veterans: Req[] = [];

  for (const [k, arr] of byIP) {
    if (!seen.has(k)) {
      // Nouveau : premier titre dans newcomers (badge), les suivants vont avec les vétérans
      const first = { ...arr[0], isNew: true };
      newcomers.push(first);
      if (arr.length > 1) veterans.push(...arr.slice(1));
    } else {
      veterans.push(...arr);
    }
  }

  // Nouveaux en FIFO (ordre d’arrivée)
  newcomers.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Vétérans en FIFO de base; l’écart est appliqué lors de l’insertion
  veterans.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const result: Req[] = [];
  // Position virtuelle = nb déjà passés aujourd’hui + 1 si un playing existe
  let cursor = played.length + (playing ? 1 : 0);
  const lastPosByIP = new Map<string, number>(); // IP -> dernière position virtuelle

  const canPlace = (r: Req) => {
    const k = ipKey(r);
    const last = lastPosByIP.get(k);
    return last === undefined || (cursor - last) >= MIN_GAP;
  };
  const markPlaced = (r: Req) => {
    lastPosByIP.set(ipKey(r), cursor);
    cursor++;
  };

  // 1) D’abord tous les nouveaux (priorité)
  for (const r of newcomers) {
    result.push(r);
    markPlaced(r);
  }

  // 2) Puis les vétérans avec écart
  while (veterans.length > 0) {
    const candidate = veterans.shift()!;

    if (canPlace(candidate)) {
      // OK : on place
      result.push(candidate);
      markPlaced(candidate);
      continue;
    }

    // Pas encore l’écart requis.
    // S’il reste d’autres titres (d’autres IP) à intercaler, on le remet en fin de file.
    if (veterans.length > 0) {
      veterans.push(candidate);
      // on continue la boucle, une autre IP passera, ce qui fera avancer 'cursor'
      continue;
    }

    // Sinon, AUCUN autre titre à intercaler -> on FORCE l’insertion UNE FOIS
    // (sinon on bloque la file indéfiniment).
    result.push(candidate);
    markPlaced(candidate);
    // et on continue; la file se vide proprement.
  }

  return result;
}
