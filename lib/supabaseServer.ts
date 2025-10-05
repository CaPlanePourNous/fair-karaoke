// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');

// Client serveur (service role) : à utiliser UNIQUEMENT dans les routes API
export const sbServer = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
