// ...imports/consts/types identiques à ta version précédente...

export async function GET(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const { searchParams } = new URL(req.url);
    const roomSlug = searchParams.get("room_slug") || "lantignie";
    let room_id = searchParams.get("room_id") || "";

    if (!room_id) {
      const { data: r, error: eRoom } = await db.from("rooms").select("id").eq("slug", roomSlug).maybeSingle();
      if (eRoom) return NextResponse.json({ ok: false, error: eRoom.message }, { status: 500, headers: noStore });
      if (!r)   return NextResponse.json({ ok: false, error: "Room inconnue" }, { status: 404, headers: noStore });
      room_id = r.id as string;
    }

    const { data: rows, error: eReq } = await db
      .from("requests")
      .select("id, room_id, singer_id, singer, title, artist, status, created_at, updated_at, played_at, ip")
      .eq("room_id", room_id)
      .order("created_at", { ascending: true });

    if (eReq) return NextResponse.json({ ok: false, error: eReq.message }, { status: 500, headers: noStore });

    const all = (rows || []) as Row[];
    const { orderedWaiting, rejectIds } = computeOrdering(all as any);

    const byId = new Map(all.map(r => [r.id, r]));
    const waiting = (orderedWaiting || [])
      .map((w: any) => (typeof w === "string" ? byId.get(w) : w))
      .filter(Boolean) as Row[];

    const playing = all.find(r => r.status === "playing") || null;
    const done = all
      .filter(r => r.status === "done")
      .sort((a, b) => {
        const ta = a.played_at || a.updated_at || a.created_at;
        const tb = b.played_at || b.updated_at || b.created_at;
        return (tb || "").localeCompare(ta || "");
      });

    const playedSingerIds = new Set(
      all
        .filter(r => r.status === "done" || r.status === "playing")
        .map(r => r.singer_id)
        .filter(Boolean)
    );
    const waitingWithFlag = waiting.map(r => ({
      ...r,
      isNew: r.singer_id ? !playedSingerIds.has(r.singer_id) : true,
    }));

    return NextResponse.json(
      { ok: true, room_id, playing, waiting: waitingWithFlag, played: done, rejectIds },
      { headers: noStore }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erreur /api/host/queue :", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
