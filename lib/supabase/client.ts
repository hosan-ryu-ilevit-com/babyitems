import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabase는 선택적 - 로깅에만 사용되며 없어도 앱 작동
let supabaseClient: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
  } catch (error) {
    console.warn('⚠️  Supabase initialization failed (logging will be disabled):', error);
  }
} else {
  console.warn('⚠️  Supabase credentials not found (logging will be disabled)');
}

export const supabase = supabaseClient;

// Supabase 사용 가능 여부 확인 헬퍼
export const isSupabaseAvailable = (): boolean => {
  return supabaseClient !== null;
};
