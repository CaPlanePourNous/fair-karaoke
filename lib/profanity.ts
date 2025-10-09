// lib/profanity.ts

// --- Normalisation robuste (diacritiques, espaces, ponctuation, leet, répétitions) ---
function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
function normalizeSeparators(s: string) {
  // fondre espaces, tirets, underscores etc. en un seul espace
  return s.replace(/[\s\-_\.]+/g, ' ').trim();
}
function leetToPlain(s: string) {
  // remplacements courants de leet vers lettres
  return s
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' '); // reste → séparateur
}
function collapseRepeats(s: string) {
  // "coooonnnard" → "connard"
  return s.replace(/(.)\1{2,}/g, '$1');
}
export function canonicalize(input: string) {
  let s = input.toLowerCase();
  s = stripDiacritics(s);
  s = leetToPlain(s);
  s = normalizeSeparators(s);
  s = collapseRepeats(s);
  return s;
}

// --- Seed FR à partir du Wiktionnaire (catégories "Termes vulgaires", "Insultes") ---
// NB: on met des formes de base ; les variantes seront couvertes par la canonicalisation ci-dessus.
// Réfs: Catégorie:Termes vulgaires en français, Insultes en français, French offensive terms (Wiktionary).
const FR_BASE = [
  // jurons/insultes fréquents
  'con', 'connard', 'connasse', 'conne',
  'pute', 'salope', 'merde', 'putain', 'chier', 'chiant',
  'encule', 'enculee', 'enculer', 'fdp', 'batard', 'batarde',
  'bouffon', 'abruti', 'attarde', 'crevard', 'gros con',
  'ta gueule', 'tg', 'nique ta mere', 'nique ta mère', 'nique ta race',
  'va te faire foutre', 'aller se faire foutre',
  'va te faire enculer', 'aller se faire enculer',
  'branleur', 'branleuse', 'branler', 'branlette',
  'cul', 'trou du cul', 'trouduc',
  'bite', 'couille', 'couilles', 'couillon', 'couillonne',
  'foutre', 'foutoir',
  'pd', 'pede', 'pedale', 'tafiole', // slurs: à bloquer fermement
  'sale chienne',
  // locutions courantes listées sur la catégorie (échantillon)
  'a la con', 'a chier', 'mords moi le noeud', 'poils de cul',
];

// Anglais basique (utile si quelqu’un met un pseudo en anglais)
const EN_BASE = [
  'fuck', 'fucker', 'motherfucker', 'mf', 'shit', 'bullshit', 'asshole', 'dick', 'bitch', 'bastard',
  'cunt', 'wanker', 'jerk', 'retard', 'slut', 'whore', 'twat',
];

// Slurs ethniques (liste courte → à bloquer sans appel)
const SLURS = [
  'bamboula', 'bougnoule', 'metec', 'metèque', 'chinetoque', 'niak', 'negro', 'negre', 'tete de negre',
];

// On fusionne & dédoublonne
const CANON_TERMS = Array.from(new Set([...FR_BASE, ...EN_BASE, ...SLURS].map(canonicalize)));

// --- API publique ---
export type ProfanityHit = { term: string, matched: string };

export function detectProfanity(inputName: string): ProfanityHit | null {
  if (!inputName) return null;
  const canon = canonicalize(inputName);
  if (canon.length < 2) return { term: 'trop court', matched: inputName };

  // blocage de suites sans lettres (emoji-only, etc.)
  if (!/[a-z0-9]/.test(canon)) return { term: 'caractères non valides', matched: inputName };

  // recherche par inclusion sur la forme canonicalisée
  for (const t of CANON_TERMS) {
    // délimitation souple (mots composés & locutions)
    // ex: "je suis un connard" → " connard "
    const needle = ` ${t} `;
    const hay = ` ${canon} `;
    if (hay.includes(needle)) {
      return { term: t, matched: inputName };
    }
  }
  return null;
}

// Option: exposer la liste (debug)
export function _debugProfanityList() {
  return CANON_TERMS.slice().sort();
}
