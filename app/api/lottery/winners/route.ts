// app/api/lottery/winners/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
};

/**
 * Liste les gagnants récents.
 * GET ?room_slug=<slug> | ?room_id=<uuid> [&limit=50]
 * Réponse: { ok:true, winners:[{entry_id, display_name|null, created_at}] } | { ok:false, error }
 *
 * NOTE: si tu supprimes l'entrée après tirage, display_name peut être introuvable ;
 *       idéalement, stocke display_name directement dans lottery_winners à l'INSERT.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomSlug = (searchParams.get("room_slug") || "").trim();
    const roomIdParam = (searchParams.get("room_id") || "").trim();
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 500);

    const db = createAdminSupabaseClient();

    // 1) Résoudre la room (slug prioritaire, room_id accepté)
    let roomId = roomIdParam;
    if (!roomId && roomSlug) {
      const { data: room, error: eRoom } = await db
        .from("rooms")
        .select("id")
        .eq("slug", roomSlug)
        .maybeSingle();
      if (eRoom) return NextResponse.json({ ok:false, error:eRoom.message }, { status:500, headers:noStore });
      if (!room)  return NextResponse.json({ ok:false, error:"Room inconnue" }, { status:404, headers:noStore });
      roomId = room.id as string;
    }

    // 2) Récupérer les gagnants (optionnellement filtré par room)
    let q = db
      .from("lottery_winners")
      .select("entry_id, room_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (roomId) q = q.eq("room_id", roomId);

    const { data: wins, error: eWins } = await q;
    if (eWins) return NextResponse.json({ ok:false, error:eWins.message }, { status:500, headers:noStore });

    const entryIds = (wins ?? []).map(w => w.entry_id);
    let nameByEntry: Record<string, string | null> = {};

    if (entryIds.length > 0) {
      // 3) Récupérer les noms depuis lottery_entries (fallback: peut être vide si tu supprimes après tirage)
      const { data: entries } = await db
        .from("lottery_entries")
        .select("id, display_name")
        .in("id", entryIds);

      if (entries) {
        nameByEntry = Object.fromEntries(
          entries.map(e => [e.id as string, (e.display_name ?? null) as string | null])
        );
      }
    }

    const winners = (wins ?? []).map(w => ({
      entry_id: w.entry_id,
      display_name: nameByEntry[w.entry_id] ?? null,
      created_at: w.created_at,
    }));

    return NextResponse.json({ ok: true, winners }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok:false, error: msg }, { status:500, headers:noStore });
  }
}
