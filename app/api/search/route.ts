// app/api/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import Papa from "papaparse";

type Song = { id: string; title: string; artist: string };

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

let cache: Song[] | null = null;

async function loadCSV(): Promise<Song[]> {
  if (cache) return cache;

  // 1) Essaye le fichier local
  const localPath = path.join(process.cwd(), "public", "karafun.csv");
  let csv: string | null = null;
  try {
    csv = await readFile(localPath, "utf8");
  } catch {
    // 2) Fallback: URL distante si fournie
    const url = process.env.KARAFUN_CSV_URL;
    if (url) {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        csv = await r.text();
      }
    }
  }

  if (!csv) {
    throw new Error(
      "Catalogue introuvable (ni public/karafun.csv, ni KARAFUN_CSV_URL)."
    );
  }

  // Papa auto-détecte le délimiteur si on laisse delimiter=""
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: "", // auto-detect ; ; ou ,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors?.length) {
    // On log en console mais on essaie quand même de continuer si data existe
    console.warn("[/api/search] Papa errors:", parsed.errors.slice(0, 3));
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  cache = rows
    .map((r: any) => ({
      id: String(r.Id ?? r.id ?? "").trim(),
      title: String(r.Title ?? r.title ?? "").trim(),
      artist: String(r.Artist ?? r.artist ?? "").trim(),
    }))
    .filter((s) => s.title && s.artist);

  return cache!;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    if (q.length < 2) {
      return NextResponse.json([], { headers: noStore });
    }

    const songs = await loadCSV();

    const results = songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q)
    );

    // Joins légers + champ karafun_id attendu par RoomClient
    const payload = results.slice(0, 20).map((s) => ({
      id: s.id,
      karafun_id: s.id || null,
      title: s.title,
      artist: s.artist,
      url: `https://www.karafun.fr/search/?query=${encodeURIComponent(
        `${s.title} ${s.artist}`
      )}`,
    }));

    return NextResponse.json(payload, { headers: noStore });
  } catch (err) {
    console.error("[/api/search] error:", err);
    return NextResponse.json({ error: "CSV read/parse error" }, { status: 500, headers: noStore });
  }
}
