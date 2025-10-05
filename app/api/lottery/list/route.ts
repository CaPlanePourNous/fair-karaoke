import { sb } from '@/lib/supabase';
export async function GET(){
  const { data } = await sb
    .from('lottery_entries')
    .select('id,display_name')
    .order('created_at',{ascending:false});
  return Response.json(data||[]);
}
