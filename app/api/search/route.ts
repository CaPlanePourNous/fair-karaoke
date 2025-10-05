// app/api/search/route.ts
export const runtime = "nodejs";         // <— force l’environnement Node (fs OK)
export const dynamic = "force-dynamic";  // <— évite mise en cache

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

let cache:
  | { id: string; title: string; artist: string }[]
  | null = null;

function loadCSV() {
  if (cache) return cache;

  const csvPath = path.join(process.cwd(), "public", "karafun.csv");
  const csv = fs.readFileSync(csvPath, "utf8");

  // Détecte automatiquement le séparateur (',' vs ';')
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
    id: (r.Id ?? r.id ?? "").toString().trim(),
    title: (r.Title ?? r.title ?? "").toString().trim(),
    artist: (r.Artist ?? r.artist ?? "").toString().trim(),
  }));

  return cache;
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

    return NextResponse.json(results.slice(0, 20));
  } catch (err) {
    console.error("[/api/search] CSV read/parse error:", err);
    return NextResponse.json({ error: "CSV read error" }, { status: 500 });
  }
}
