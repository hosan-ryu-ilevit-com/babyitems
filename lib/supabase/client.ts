import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabase는 선택적 - 로깅에만 사용되며 없어도 앱 작동
let supabaseClient: SupabaseClient | null = null;

// 🚨 임시 비활성화 - Supabase 복구 후 이 부분 제거
const SUPABASE_DISABLED = false; // 다시 활성화해서 데이터 확인

if (!SUPABASE_DISABLED && supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createSupabaseClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
  } catch (error) {
    console.warn('⚠️  Supabase initialization failed (logging will be disabled):', error);
  }
} else {
  console.warn('⚠️  Supabase temporarily disabled (logging off)');
}

export const supabase = supabaseClient;

// createClient 함수 export (ab-test.ts 등에서 사용)
export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is not configured');
  }
  return createSupabaseClient(supabaseUrl, supabaseKey);
}

// Supabase 사용 가능 여부 확인 헬퍼
export const isSupabaseAvailable = (): boolean => {
  return supabaseClient !== null;
};
