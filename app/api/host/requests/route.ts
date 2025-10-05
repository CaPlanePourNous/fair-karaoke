// app/api/requests/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, artist, display_name, ip } = body;

    if (!title || !artist || !ip)
      return NextResponse.json({ error: "Champs manquants." }, { status: 400 });

    // 1️⃣ R5 - Vérifie les doublons (même titre/artiste dans pending/playing/done)
    const { count: dupCount } = await sbServer
      .from("requests")
      .select("*", { count: "exact", head: true })
      .eq("title", title)
      .eq("artist", artist);

    if (dupCount && dupCount > 0)
      return NextResponse.json({ error: "Titre déjà présent." }, { status: 400 });

    // 2️⃣ R1 - max 2 chansons par IP
    const { count: countByIp } = await sbServer
      .from("requests")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .in("status", ["pending", "playing"]);

    if (countByIp && countByIp >= 2)
      return NextResponse.json({ error: "2 chansons max par chanteur." }, { status: 400 });

    // 3️⃣ Cooldown de 30 secondes
    const { data: lastReq } = await sbServer
      .from("requests")
      .select("created_at")
      .eq("ip", ip)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastReq?.[0]) {
      const lastTime = new Date(lastReq[0].created_at).getTime();
      if (Date.now() - lastTime < 30_000)
        return NextResponse.json({ error: "Merci d’attendre 30s avant une nouvelle demande." }, { status: 400 });
    }

    // 4️⃣ File limitée à 15 chansons
    const { count: queueCount } = await sbServer
      .from("requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (queueCount && queueCount >= 15)
      return NextResponse.json({ error: "File d’attente pleine (15 titres max)." }, { status: 400 });

    // 5️⃣ Tout est bon → ajout de la chanson
    const { error } = await sbServer.from("requests").insert({
      title,
      artist,
      display_name,
      ip,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
  console.error("Erreur /api/host/queue :", e);
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

}
