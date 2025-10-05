import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeOrdering, type RequestRow } from "@/lib/ordering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("ENV missing: NEXT_PUBLIC_SUPABASE_URL");
  if (!key)
    throw new Error(
      "ENV missing: SUPABASE_SERVICE_ROLE_KEY (prefer) or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const db = getSupabase();
  try {
    const { data, error } = await db
      .from("requests")
      .select("id,singer,title,artist,status,created_at")
      .in("status", ["waiting", "playing", "done"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    const reqs = (data ?? []) as RequestRow[];
    const playing = reqs.find((r) => r.status === "playing") || null;
    const done = reqs.filter((r) => r.status === "done");

    const ord = computeOrdering({
      requests: reqs,
      alreadyPlayed: done.map((d) => ({ title: d.title, artist: d.artist })),
      maxQueue: 15,
    });

    const waitingOrdered = ord.orderedWaiting
      .map((id) => reqs.find((r) => r.id === id))
      .filter(Boolean) as RequestRow[];

    const recentDone = done
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      playing,
      waiting: waitingOrdered,
      done: recentDone,
    });
  } catch (e: unknown) {
    console.error("Erreur /api/host/queue :", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
