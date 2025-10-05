import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

let cache: { id: string; title: string; artist: string }[] | null = null;

function loadCSV() {
  if (cache) return cache;

  const csvPath = path.join(process.cwd(), "public", "karafun.csv");
  const csv = fs.readFileSync(csvPath, "utf8");

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Conversion propre des colonnes
  cache = records.map((r: any) => ({
    id: r.Id || r.id || "",
    title: r.Title || r.title || "",
    artist: r.Artist || r.artist || "",
  }));

  return cache;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  if (q.length < 2) return NextResponse.json([]);

  try {
    const songs = loadCSV();

    const results = songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q)
    );

    return NextResponse.json(results.slice(0, 20));
  } catch (err: any) {
    console.error("[api/search] CSV read error:", err);
    return NextResponse.json(
      { error: "CSV read error" },
      { status: 500 }
    );
  }
}
