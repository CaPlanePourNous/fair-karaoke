// app/api/search/route.ts
import { NextResponse } from 'next/server';

type Row = {
  title: string;
  artist: string;
  karafun_id?: string | number;
  url?: string;
};

let CATALOG: Row[] | null = null;
let LAST_LOAD = 0; // ms epoch
const TTL_MS = 1000 * 60 * 60; // 1h

// --- tiny CSV parser (support quotes, commas) ---
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // escaped quote?
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const obj: any = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cols[c] ?? '').trim();
    }
    rows.push(obj);
  }
  return rows;
}

async function loadCatalog(): Promise<void> {
  const now = Date.now();
  if (CATALOG && now - LAST_LOAD < TTL_MS) return;

  const url = process.env.KARAFUN_CSV_URL;
  if (!url) {
    throw new Error('KARAFUN_CSV_URL manquante (variable d’environnement).');
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Impossible de charger le CSV KaraFun (${res.status})`);
  const txt = await res.text();

  const raw = parseCSV(txt);

  // colonnes possibles : id, songid, title/titre, artist/artiste...
  CATALOG = raw.map((r: any) => {
    const id =
      r.id || r.songid || r['song id'] || r['songid'] || r['karafun_id'] || '';
    const title =
      (r.title ?? r.titre ?? r['song'] ?? r['song title'] ?? '').toString().trim();
    const artist =
      (r.artist ?? r.artiste ?? r['singer'] ?? r['artist name'] ?? '').toString().trim();

    const karafun_id = String(id || '').trim();
    const q = karafun_id && title ? `${karafun_id} ${title}` : title || artist;
    const url = q ? `https://www.karafun.fr/search/?query=${encodeURIComponent(q)}` : '';

    return { title, artist, karafun_id, url } as Row;
  }).filter((r: Row) => r.title || r.artist);

  LAST_LOAD = now;
  // console.log(`[search] catalogue chargé (${CATALOG.length} titres).`);
}

export async function GET(req: Request) {
  try {
    await loadCatalog();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'loadCatalog failed' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json([]);

  const Q = q.toLowerCase();
  const max = 20;

  const results = (CATALOG || [])
    .filter(r =>
      (r.title && r.title.toLowerCase().includes(Q)) ||
      (r.artist && r.artist.toLowerCase().includes(Q))
    )
    .slice(0, max);

  return NextResponse.json(results);
}
