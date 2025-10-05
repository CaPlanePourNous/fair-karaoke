import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const entry_id = searchParams.get("entry_id");
  if (!entry_id) return NextResponse.json({ ok: true, won: false });

  const { data, error } = await sbServer
    .from("lottery_winners")
    .select("entry_id")
    .eq("entry_id", entry_id)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const won = !!(data && data.length > 0);
  return NextResponse.json({ ok: true, won });
}
