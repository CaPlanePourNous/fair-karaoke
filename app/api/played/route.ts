import { sbServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await sbServer
    .from('requests')
    .select('title,artist,played_at,updated_at,created_at,status')
    .in('status',['done','playing'])
    .order('coalesce(played_at, created_at)', { ascending: false })
    .limit(15);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status:500 });
  const today = (data || []).filter(r => {
    const d = new Date(r.played_at ?? r.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  return new Response(JSON.stringify(today), { headers: { 'Content-Type':'application/json' }});
}
