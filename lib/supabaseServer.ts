// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('[supabaseServer] Missing envs', {
    hasUrl: !!url,
    hasServiceKey: !!serviceKey,
  });
}

export const sbServer = createClient(url, serviceKey, {
  auth: { persistSession: false },
  global: { headers: { 'X-Client-Info': 'fair-karaoke/server' } },
});
