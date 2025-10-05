// app/api/catalog/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

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
    const { url } = await req.json().catch(() => ({}));
    const csvUrl =
      url ||
      "https://www.karafun.fr/cl/3107312/de746f0516a28e34c9802584192dc6d3/";

    // 1) Télécharge le CSV
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "fetch_failed", status: res.status },
        { status: 502 }
      );
    }
    const text = await res.text();

    // 2) Parse CSV (auto colonnes, ; ou ,)
    const rows: Row[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: undefined, // auto
      bom: true,
      trim: true,
    });

    // 3) Map -> { karafun_id, title, artist, duration_seconds }
    const mapped = rows
      .map((r) => {
        const title = pick(r, ["title", "Title", "TITRE"]);
        const artist = pick(r, ["artist", "Artist", "ARTISTE"]);
        // Selon exports KaraFun, l'id peut s’appeler id, karafun_id, ref, etc.
        const karafun_id = pick(r, ["karafun_id", "id", "Id", "ID", "KFN"]);
        // durée "mm:ss" ou "m:ss"
        const durRaw = pick(r, ["duration", "Duration", "DURATION", "Durée"]);
        let duration_seconds: number | null = null;
        if (durRaw) {
          const m = String(durRaw).match(/^(\d{1,2}):(\d{2})$/);
          if (m) duration_seconds = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          else if (!Number.isNaN(Number(durRaw))) duration_seconds = Number(durRaw);
        }
        if (!title || !artist || !karafun_id) return null;
        return { karafun_id, title, artist, duration_seconds };
      })
      .filter(Boolean) as {
      karafun_id: string;
      title: string;
      artist: string;
      duration_seconds: number | null;
    }[];

    if (mapped.length === 0) {
      return NextResponse.json({ imported: 0, warning: "no_mapped_rows" });
    }

    // 4) Upsert Supabase
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("songs")
      .upsert(mapped, { onConflict: "karafun_id" });

    if (error) {
      console.error("[catalog/import] upsert error:", error);
      return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
    }

    return NextResponse.json({ imported: mapped.length }, { status: 200 });
  } catch (e) {
    console.error("[catalog/import] fatal:", e);
    return NextResponse.json({ error: "fatal" }, { status: 500 });
  }
}
