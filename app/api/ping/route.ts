export async function GET() {
  const ok = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return new Response(JSON.stringify({ ok }), { headers: { "Content-Type": "application/json" } });
}
