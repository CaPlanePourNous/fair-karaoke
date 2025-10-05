// app/api/requests/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function noStore() {
  return {
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  };
}

function getIP(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  // @ts-ignore
  return (req as any).ip || "0.0.0.0";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const display_name = String(body.display_name || "").trim();
    const title = String(body.title || "").trim();
    const artist = String(body.artist || "").trim();
    const karafun_id = body.karafun_id ?? null;

    if (!display_name || !title || !artist) {
      return NextResponse.json(
        { error: "Champs manquants." },
        { status: 400, headers: noStore() }
      );
    }

    const ip = getIP(req);

    // 1) max 2 titres actifs par IP
    {
      const { count, error } = await sbServer
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip)
        .in("status", ["pending", "approved"]);
      if (error) throw error;
      if ((count ?? 0) >= 2) {
        return NextResponse.json(
          {
            error:
              "2 titres actifs autorisés par appareil. Réessaie plus tard.",
          },
          { status: 400, headers: noStore() }
        );
      }
    }

    // 2) doublon exact (titre + artiste) déjà en attente
    {
      const { count, error } = await sbServer
        .from("requests")
        .select("*", { count: "exact", head: true })
        .ilike("title", title)
        .ilike("artist", artist)
        .in("status", ["pending", "approved"]);
      if (error) throw error;
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: "Ce titre est déjà en file. Choisis-en un autre." },
          { status: 400, headers: noStore() }
        );
      }
    }

    // 3) blocage si file > 15
    {
      const { count, error } = await sbServer
        .from("requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "approved", "playing"]);
      if (error) throw error;
      if ((count ?? 0) >= 15) {
        return NextResponse.json(
          { error: "La file dépasse 45 minutes. Réessaie plus tard." },
          { status: 400, headers: noStore() }
        );
      }
    }

    // 4) insert
    const { data, error } = await sbServer
      .from("requests")
      .insert({
        display_name,
        title,
        artist,
        ip_address: ip,
        status: "pending",
        karafun_id,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id }, { headers: noStore() });
  } catch (err: any) {
    console.error("[requests] error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Erreur d’insertion" },
      { status: 500, headers: noStore() }
    );
  }
}
