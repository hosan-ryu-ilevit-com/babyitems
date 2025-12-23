import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is not configured');
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}
