// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');

// Server-side client (service role) – bypasses RLS for trusted API routes
export const sbServer = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
