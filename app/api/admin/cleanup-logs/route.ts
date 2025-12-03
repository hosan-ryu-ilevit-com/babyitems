// 로그 정리 API - 오래된 로그 삭제
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    console.log('[Cleanup] Request received');

    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (password !== '1545') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, daysToKeep } = body;

    if (!isSupabaseAvailable() || !supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not available'
      });
    }

    console.log(`[Cleanup] Action: ${action}, daysToKeep: ${daysToKeep}`);

    if (action === 'delete_old') {
      // 최근 N일 데이터만 유지
      const keepFromDate = new Date();
      keepFromDate.setDate(keepFromDate.getDate() - (daysToKeep || 7));
      const keepFromDateStr = keepFromDate.toISOString().split('T')[0];

      console.log(`[Cleanup] Deleting logs before ${keepFromDateStr}`);

      const { error, count } = await supabase
        .from('daily_logs_v2')
        .delete({ count: 'exact' })
        .lt('date', keepFromDateStr);

      if (error) {
        console.error('[Cleanup] Delete error:', error);
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }

      console.log(`[Cleanup] Deleted ${count} old log entries`);

      return NextResponse.json({
        success: true,
        message: `Deleted logs before ${keepFromDateStr}`,
        deletedCount: count
      });
    } else if (action === 'delete_all') {
      // 모든 로그 삭제 (위험!)
      console.log('[Cleanup] Deleting ALL logs');

      const { error, count } = await supabase
        .from('daily_logs_v2')
        .delete({ count: 'exact' })
        .neq('date', '1900-01-01'); // 모든 날짜 삭제

      if (error) {
        console.error('[Cleanup] Delete all error:', error);
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }

      console.log(`[Cleanup] Deleted ${count} log entries`);

      return NextResponse.json({
        success: true,
        message: 'Deleted all logs',
        deletedCount: count
      });
    } else if (action === 'vacuum') {
      // 이벤트 배열 크기 줄이기 (최근 100개만 유지)
      console.log('[Cleanup] Vacuuming logs (keeping last 100 events per day)');

      const { data: logs, error: fetchError } = await supabase
        .from('daily_logs_v2')
        .select('*');

      if (fetchError) {
        return NextResponse.json({
          success: false,
          error: fetchError.message
        }, { status: 500 });
      }

      let vacuumedCount = 0;
      for (const log of logs || []) {
        const events = log.events as any[];
        if (events && events.length > 100) {
          // 최근 100개만 유지
          const trimmedEvents = events.slice(-100);

          const { error: updateError } = await supabase
            .from('daily_logs_v2')
            .update({ events: trimmedEvents })
            .eq('date', log.date);

          if (!updateError) {
            vacuumedCount++;
            console.log(`[Cleanup] Vacuumed ${log.date}: ${events.length} -> ${trimmedEvents.length} events`);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Vacuumed ${vacuumedCount} log entries`,
        vacuumedCount
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: delete_old, delete_all, or vacuum'
    }, { status: 400 });
  } catch (error) {
    console.error('[Cleanup] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
