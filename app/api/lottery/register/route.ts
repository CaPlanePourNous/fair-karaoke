// …imports et consts inchangés…

export async function POST(req: NextRequest) {
  try {
    const db = createAdminSupabaseClient();
    const body = (await req.json().catch(() => ({}))) as {
      display_name?: string;
      room_id?: string;
      room_slug?: string;
    };

    const display_name = (body.display_name || "").trim();
    if (!display_name) {
      return NextResponse.json({ ok: false, error: "MISSING_DISPLAY_NAME" }, { status: 400, headers: noStore });
    }

    // …résolution room_id inchangée…

    // 1) Singer: SELECT existant (tu peux garder maybeSingle())
    const { data: existingSinger } = await db
      .from("singers")
      .select("id")
      .eq("room_id", room_id)
      .ilike("display_name", display_name)
      .maybeSingle();

    let singer_id = existingSinger?.id as string | undefined;

    if (!singer_id) {
      // 2) INSERT singer -> EXIGER une ligne
      const { data: created, error: eInsSinger } = await db
        .from("singers")
        .insert({ room_id, display_name })
        .select("id")
        .single();                     // <-- single() AU LIEU DE maybeSingle()
      if (eInsSinger || !created?.id) {
        return NextResponse.json({ ok: false, error: eInsSinger?.message || "DB_INSERT_SINGER_FAILED" }, { status: 500, headers: noStore });
      }
      singer_id = created.id as string;
    }

    // 3) INSERT lottery_entries -> EXIGER une ligne
    const { data: entry, error: eEntry } = await db
      .from("lottery_entries")
      .insert({ room_id, singer_id })
      .select("id")
      .single();                       // <-- single() AU LIEU DE maybeSingle()

    if (eEntry) {
      // Conflit d’unicité -> déjà inscrit: on relit l’id et on renvoie OK + id
      // (garde ta logique actuelle si elle te va, ci-dessous version compacte)
      const { data: existing, error: eFind } = await db
        .from("lottery_entries")
        .select("id")
        .eq("room_id", room_id)
        .eq("singer_id", singer_id!)
        .maybeSingle();
      if (existing?.id) {
        return NextResponse.json({ ok: true, id: existing.id, note: "already_registered" }, { headers: noStore });
      }
      return NextResponse.json({ ok: false, error: eFind?.message || eEntry.message }, { status: 500, headers: noStore });
    }

    // 4) Sécurité: ne JAMAIS renvoyer OK sans id
    if (!entry?.id) {
      return NextResponse.json({ ok: false, error: "DB_INSERT_ENTRY_NO_ID" }, { status: 500, headers: noStore });
    }

    return NextResponse.json({ ok: true, id: entry.id }, { headers: noStore });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noStore });
  }
}
