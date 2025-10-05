// app/api/catalog/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

type Row = Record<string, string>;

function pick(obj: Row, keys: string[]) {
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toUpperCase()] ?? obj[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as { url?: string }));
    const configured = process.env.KARAFUN_CSV_URL;
    const csvUrl =
      body.url?.trim() ||
      (configured && configured.trim()) ||
      // fallback (évite l'échec si l'env n'est pas encore posée)
      "https://www.karafun.fr/cl/3107312/de746f0516a28e34c9802584192dc6d3/";

    // 1) Télécharger le CSV
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "fetch_failed", status: res.status },
        { status: 502 }
      );
    }
    const text = await res.text();

    // 2) Auto-détection du délimiteur sur la ligne d'entête
    const header = (text.split(/\r?\n/, 1)[0] || "").trim();
    const delimiter = header.includes(";") ? ";" : ",";
    // (Option) si ni ; ni , détectés, tente ; par défaut
    const chosen = delimiter || ";";

    // 3) Parse CSV
    const rows: Row[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      trim: true,
      delimiter: chosen,
    });

    // 4) Normalisation → table public.songs
    const mapped = rows
      .map((r) => {
        const karafun_id = pick(r, ["Id", "id", "KFN", "karafun_id"]);
        const title = pick(r, ["Title", "title", "TITRE"]);
        const artist = pick(r, ["Artist", "artist", "ARTISTE"]);

        // Ton CSV de référence n'a pas de durée => null
        const duration_seconds: number | null = null;

        if (!karafun_id || !title || !artist) return null;
        return { karafun_id, title, artist, duration_seconds };
      })
      .filter(Boolean) as {
      karafun_id: string;
      title: string;
      artist: string;
      duration_seconds: number | null;
    }[];

    if (mapped.length === 0) {
      return NextResponse.json(
        { imported: 0, warning: "no_mapped_rows", delimiter: chosen },
        { status: 200 }
      );
    }

    // 5) Upsert en chunks via client admin (bypass RLS)
    const supabase = createAdminSupabaseClient();
    const chunkSize = 1000;
    for (let i = 0; i < mapped.length; i += chunkSize) {
      const chunk = mapped.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("songs")
        .upsert(chunk, { onConflict: "karafun_id" });
      if (error) {
        console.error("[catalog/import] upsert_failed_chunk", { i, error });
        return NextResponse.json(
          { error: "upsert_failed_chunk", at: i },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { imported: mapped.length, delimiter: chosen },
      { status: 200 }
    );
  } catch (e) {
    console.error("[catalog/import] fatal:", e);
    return NextResponse.json({ error: "fatal" }, { status: 500 });
  }
}
