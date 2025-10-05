// app/api/search/route.ts
import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';

type Suggestion = { title: string; artist: string; karafun_id?: string; url?: string };

// Petit cache process-global pour éviter de recharger à chaque appel
let CATALOG: Suggestion[] | null = null;
let CATALOG_TRIED = false;

function loadCatalogOnce() {
  if (CATALOG_TRIED) return;
  CATALOG_TRIED = true;
  try {
    // Mets ton fichier ici si tu en as un (même format qu’avant)
    // Exemple: [{ "title":"...", "artist":"...", "karafun_id":"12345" }, ...]
    const p = path.join(process.cwd(), 'data', 'karafun_catalog.json');
    const raw = fs.readFileSync(p, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      // Normalise un minimum
      CATALOG = arr.map((x: any) => ({
        title: String(x.title || ''),
        artist: String(x.artist || ''),
        karafun_id: x.karafun_id ? String(x.karafun_id) : undefined,
        url: x.karafun_id ? `https://www.karafun.fr/karaoke/${x.karafun_id}/` : undefined,
      }));
      console.log(`[search] catalogue chargé (${CATALOG.length} titres).`);
    } else {
      CATALOG = [];
      console.warn(`[search] catalogue JSON invalide (array attendu).`);
    }
  } catch (e: any) {
    // Pas de fichier ? Ce n’est pas bloquant : on renverra []
    CATALOG = [];
    console.warn('[search] aucun fichier catalogue local trouvé (OK pour MVP).', e?.message || e);
  }
}

export async function GET(req: Request) {
  loadCatalogOnce();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  // Si pas de catalogue, renvoyer [] proprement
  if (!CATALOG || !CATALOG.length) return NextResponse.json([]);

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  // Filtrage très simple: tous les tokens doivent apparaître dans titre ou artiste
  const res = CATALOG.filter((s) => {
    const hay = (s.title + ' ' + s.artist).toLowerCase();
    return tokens.every(t => hay.includes(t));
  }).slice(0, 25);

  return NextResponse.json(res);
}
