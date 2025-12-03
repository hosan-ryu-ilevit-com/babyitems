// Supabase 연결 테스트 API
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  console.log('[Test DB] API called');

  // 비밀번호 검증
  const password = request.headers.get('x-admin-password');
  if (password !== '1545') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Test DB] Auth passed');

  // Supabase 사용 가능 여부 확인
  if (!isSupabaseAvailable() || !supabase) {
    console.log('[Test DB] Supabase not available');
    return NextResponse.json({
      success: false,
      error: 'Supabase not available'
    });
  }

  console.log('[Test DB] Supabase is available, testing query...');

  try {
    // 간단한 쿼리 테스트
    const { data, error, count } = await supabase
      .from('daily_logs')
      .select('date', { count: 'exact', head: true });

    console.log('[Test DB] Query result:', { data, error, count });

    if (error) {
      console.error('[Test DB] Query error:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error
      });
    }

    console.log('[Test DB] Query succeeded');

    return NextResponse.json({
      success: true,
      totalLogs: count,
      message: 'Supabase connection successful'
    });
  } catch (error) {
    console.error('[Test DB] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
