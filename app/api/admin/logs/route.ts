// GET /api/admin/logs - 관리자 로그 조회 API (event_logs 테이블 사용)
// DELETE /api/admin/logs - 세션 삭제 API
import { NextRequest, NextResponse } from 'next/server';
import {
  getEventsByDateRange,
  groupEventsBySession,
  getRecentEvents,
} from '@/lib/logging/query';
import type { SessionSummary } from '@/types/logging';

// 비밀번호 검증
function validatePassword(password: string): boolean {
  return password === '1545';
}

export async function GET(request: NextRequest) {
  try {
    console.log('[Logs API] Request received');

    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (!password || !validatePassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const days = searchParams.get('days'); // 최근 N일

    let events;

    // 날짜 범위 조회
    if (startDate && endDate) {
      console.log(`[Logs API] Fetching events from ${startDate} to ${endDate}`);
      events = await getEventsByDateRange(startDate, endDate);
    }
    // 최근 N일 조회
    else if (days) {
      const daysNum = parseInt(days, 10);
      console.log(`[Logs API] Fetching recent ${daysNum} days`);
      events = await getRecentEvents(daysNum);
    }
    // 기본값: 최근 30일
    else {
      console.log('[Logs API] Fetching recent 30 days (default)');
      events = await getRecentEvents(30);
    }

    console.log(`[Logs API] Found ${events.length} events`);

    // 이벤트를 세션별로 그룹화
    const sessions = groupEventsBySession(events);
    console.log(`[Logs API] Grouped into ${sessions.length} sessions`);

    // 최신 세션이 위로 오도록 정렬
    const sortedSessions = sessions.sort(
      (a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
    );

    return NextResponse.json({
      sessions: sortedSessions,
      totalEvents: events.length,
      totalSessions: sessions.length,
    });
  } catch (error) {
    console.error('[Logs API] Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('[Logs API] DELETE request received');

    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (!password || !validatePassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    console.log(`[Logs API] Deleting session: ${sessionId}`);

    // Delete all events for this session from event_logs table
    const { supabase } = await import('@/lib/supabase/client');

    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not available' },
        { status: 503 }
      );
    }

    const { error, count } = await supabase
      .from('event_logs')
      .delete({ count: 'exact' })
      .eq('session_id', sessionId);

    if (error) {
      console.error('[Logs API] Delete failed:', error);
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      );
    }

    console.log(`[Logs API] Deleted ${count} events for session ${sessionId}`);

    return NextResponse.json({
      success: true,
      message: 'Session deleted',
      deletedCount: count || 0,
    });
  } catch (error) {
    console.error('[Logs API] Error deleting session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
