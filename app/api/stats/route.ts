// app/api/stats/route.ts
import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function noStore() {
  return {
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  };
}

export async function GET() {
  try {
    const { count, error } = await sbServer
      .from("requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "approved"]);

    if (error) throw error;

    const total_waiting = count ?? 0;
    const est_minutes = total_waiting * 3;

    return NextResponse.json(
      { total_waiting, est_minutes },
      { headers: noStore() }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erreur stats" },
      { status: 500, headers: noStore() }
    );
  }
}
