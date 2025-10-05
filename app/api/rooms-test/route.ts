import { sb } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await sb.from('rooms').select('id, slug').limit(5);
  if (error) return new Response(JSON.stringify({ ok:false, error:error.message }), { status:500 });
  return new Response(JSON.stringify({ ok:true, rooms:data }), { headers:{'Content-Type':'application/json'} });
}
