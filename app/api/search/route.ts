// app/api/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

type Song = { id: string; title: string; artist: string };

let cache: Song[] | null = null;

function loadCSV(): Song[] {
  if (cache) return cache;

  const csvPath = path.join(process.cwd(), "public", "karafun.csv");
  const csv = fs.readFileSync(csvPath, "utf8");

  // Détecte le séparateur
  const header = csv.split(/\r?\n/)[0] ?? "";
  const delimiter = header.includes(";") ? ";" : ",";

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter,
    relax_column_count: true,
  });

  cache = records.map((r: any) => ({
    id: String(r.Id ?? r.id ?? "").trim(),
    title: String(r.Title ?? r.title ?? "").trim(),
    artist: String(r.Artist ?? r.artist ?? "").trim(),
  }));

  return cache!;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    if (q.length < 2) return NextResponse.json([]);

    const songs = loadCSV();

    const results = songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q)
    );

    // Ajout de l'URL KaraFun (recherche titre + artiste)
    const payload = results.slice(0, 20).map((s) => ({
      ...s,
      url: `https://www.karafun.fr/search/?query=${encodeURIComponent(
        `${s.title} ${s.artist}`
      )}`,
    }));

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/search] CSV read/parse error:", err);
    return NextResponse.json({ error: "CSV read error" }, { status: 500 });
  }
}
