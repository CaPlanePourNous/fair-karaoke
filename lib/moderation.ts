// /lib/moderation.ts

// --- Normalisation & utilitaires -------------------------------------------

// Normalise : NFKD -> supprime diacritiques -> passe en minuscule -> trim -> compresse espaces
export function normalize(input: string) {
  if (!input) return "";
  const s = input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")      // enlève les diacritiques
    .replace(/\p{Cf}|\p{Cc}/gu, "") // enlève invisibles/controls
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return s;
}

// Remappe les détournements fréquents (leet/symboles) vers lettres simples
function deobfuscate(src: string) {
  const map: Record<string, string> = {
    "0": "o",
    "1": "i",
    "!": "i",
    "¡": "i",
    "l": "l", // laissé tel quel
    "3": "e",
    "4": "a",
    "@": "a",
    "5": "s",
    "$": "s",
    "7": "t",
    "+": "t",
    "8": "b",
    "€": "e",
    "£": "l",
    "²": "2", // neutre
  };
  return src.replace(/[@!¡0-9\+\$€£]/g, (ch) => map[ch] ?? ch);
}

// Compresse tous les séparateurs non alnum en un seul espace (utile pour détection heuristique)
function collapseNonAlnumToSpace(s: string) {
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// --- Données : blocklist fournie & allowlist anti-faux-positifs ------------

// Liste fournie par l’utilisateur (on NE L’ÉTEND PAS ici).
// ⚠️ On ne montre pas cette liste ailleurs que dans le code, et on n’en ajoute pas.
const PROFANE_BASE = [
  "con", "connard", "connasse", "pute", "salope", "fdp", "encule", "enculé",
  "niquer", "nique", "merde", "batard", "bâtard", "salopard",
  "pd", "ntm", "ta gueule", "tg", "putain"
] as const;

// Allowlist minimale pour éviter les faux positifs évidents sur "con"
const ALLOWLIST = [
  "conseil", "conseils", "conseiller", "conseillère", "conserver", "conscience",
  "concert", "concerne", "concorde", "concours", "concombre", "confiture",
  "connect", "connexion", "confort", "conjugaison", "connu", "construire",
];

// Certains termes courts (ex. "con", "pd", "tg") doivent être traités en mot entier
const WHOLE_WORD_ONLY = new Set<string>(["con", "pd", "tg"]);

// --- Génération de motifs robustes -----------------------------------------

type PatternOpts = {
  allowSeparators?: boolean; // permet c.o-n / c o n
  maxSepLen?: number;
  enableLeet?: boolean;      // tolère leetspeak courant
  wholeWord?: boolean;       // impose \b aux extrémités
};

function charToClass(ch: string, enableLeet: boolean) {
  // Retourne une classe de caractères tolérante pour ch (ex: a -> [a@4])
  const leetMap: Record<string, string> = {
    a: "a@4",
    b: "b8",
    e: "e3€",
    i: "i1!¡",
    l: "l1",
    o: "o0",
    s: "s5$",
    t: "t7+",
    u: "u",
    c: "c",
    n: "n",
    d: "d",
    r: "r",
    p: "p",
    g: "g",
    m: "m",
  };
  const base = ch.replace(/\p{M}/gu, ""); // safety
  if (!enableLeet) return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const set = leetMap[base] ?? base;
  const safe = set.replace(/[^\w@€£$+!¡]/g, "");
  return `[${[...new Set(safe)].map(c => c.replace(/[\\\]\[]/g, "\\$&")).join("")}]`;
}

// Crée une regex tolérant séparateurs et leet, à partir d’un terme simple (déjà en minuscule sans diacritiques)
function buildPattern(term: string, opts: PatternOpts) {
  const {
    allowSeparators = true,
    maxSepLen = 2,
    enableLeet = true,
    wholeWord = false,
  } = opts;

  // Séparateurs autorisés entre lettres (ex: ".", "-", " ", "_", emojis) — très large
  const SEP = allowSeparators ? `[^a-z0-9]{0,${maxSepLen}}` : "";

  // Chaque caractère devient une classe, jointe par SEP
  const chars = [...term].map(ch => charToClass(ch, enableLeet)).join(SEP);

  const core = chars
    // tolère diacritiques éventuels entre lettres
    .replace(/\]/g, "](?:\\p{M})*");

  const boundaryStart = wholeWord ? `(?<![a-z0-9])` : "";
  const boundaryEnd   = wholeWord ? `(?![a-z0-9])`  : "";

  return new RegExp(`${boundaryStart}${core}${boundaryEnd}`, "iu");
}

// Cache des regex compilées
const patternCache = new Map<string, RegExp>();

function getPatternFor(term: string): RegExp {
  const base = normalize(term);
  const key = `${base}|${WHOLE_WORD_ONLY.has(base) ? "w" : "s"}`;
  if (patternCache.has(key)) return patternCache.get(key)!;
  const rx = buildPattern(base, {
    allowSeparators: true,
    maxSepLen: 2,
    enableLeet: true,
    wholeWord: WHOLE_WORD_ONLY.has(base),
  });
  patternCache.set(key, rx);
  return rx;
}

// --- Heuristiques de blocage non lexical -----------------------------------

// trop court
function tooShort(n: string) {
  return n.length < 2;
}

// répétition excessive d’un même caractère
function isRepetitive(n: string) {
  return /^(.)\1{2,}$/.test(n);
}

// pas d’alphanum du tout (que symboles/emojis)
function hasNoAlnum(n: string) {
  return !/[a-z0-9]/i.test(n);
}

// entropie ultra faible (ex. "aaaaab", "000xx") — rapide & brut
function veryLowEntropy(n: string) {
  const uniq = new Set(n.split(""));
  return uniq.size <= Math.max(1, Math.ceil(n.length / 4));
}

// --- API principale ---------------------------------------------------------

export type ModerationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "profanity"
        | "trop court"
        | "répétitif"
        | "caractères non valides"
        | "faible entropie"
        | "faux positif allowlist";
      match?: string;     // variante capturée dans l’entrée
      base?: string;      // terme de base (depuis la blocklist)
    };

export function containsProfanity(name: string): string | null {
  const result = explainModeration(name);
  if (result.ok) return null;
  if (result.reason === "profanity") return result.base ?? "profanity";
  if (result.reason === "trop court") return "trop court";
  if (result.reason === "répétitif") return "répétitif";
  if (result.reason === "caractères non valides") return "caractères non valides";
  if (result.reason === "faible entropie") return "faible entropie";
  if (result.reason === "faux positif allowlist") return "faux positif allowlist";
  return "rejeté";
}

// Version détaillée pour diagnostiquer pourquoi c’est refusé
export function explainModeration(name: string): ModerationResult {
  // Prétraitements
  const raw = String(name ?? "");
  const n0 = normalize(raw);
  const n1 = deobfuscate(n0);
  const n2 = collapseNonAlnumToSpace(n1);

  // Heuristiques "forme"
  if (tooShort(n2)) return { ok: false, reason: "trop court" };
  if (isRepetitive(n2)) return { ok: false, reason: "répétitif" };
  if (hasNoAlnum(n0)) return { ok: false, reason: "caractères non valides" };
  if (veryLowEntropy(n2) && n2.length <= 4) return { ok: false, reason: "faible entropie" };

  // Allowlist : si le token est exactement dans une whitelist, on laisse passer (utile pour "con..." légitimes)
  // On ne split pas trop agressivement : tokens alphanum simples
  const tokens = n2.split(" ").filter(Boolean);
  if (tokens.length === 1 && ALLOWLIST.includes(tokens[0])) {
    return { ok: true };
  }

  // Détection lexicale robuste par motif
  for (const base of PROFANE_BASE) {
    const rx = getPatternFor(base);
    // Test sur la chaîne "déobfusquée" mais conservant les séparateurs
    const m = rx.exec(n1);
    if (m) {
      // Anti faux positif simple : si le seul token est un mot allowlist, on ignore
      if (tokens.length === 1 && ALLOWLIST.includes(tokens[0])) {
        return { ok: false, reason: "faux positif allowlist" };
      }
      return { ok: false, reason: "profanity", base, match: m[0] };
    }
  }

  return { ok: true };
}

// --- Helpers d’intégration --------------------------------------------------

// Message utilisateur neutre
export function rejectionMessage(): string {
  return "Nom invalide. Merci de choisir un pseudonyme correct et respectueux.";
}

// Exemple d’usage côté serveur/client :
// const res = explainModeration(pseudo);
// if (!res.ok) { return { error: rejectionMessage(), code: res.reason } }
