// GET /api/admin/logs - 관리자 로그 조회 API
// DELETE /api/admin/logs - 세션 삭제 API
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllLogDates,
  getLogsByDate,
  getLogsByDateRange,
  deleteSessionFromDate,
} from '@/lib/logging/logger';
import type { SessionSummary, DailyLog } from '@/types/logging';

// 비밀번호 검증
function validatePassword(password: string): boolean {
  return password === '1545';
}

// 세션별로 로그 그룹화
function groupBySession(logs: DailyLog[]): SessionSummary[] {
  const sessionMap = new Map<string, SessionSummary>();

  for (const dailyLog of logs) {
    for (const event of dailyLog.events) {
      if (!sessionMap.has(event.sessionId)) {
        sessionMap.set(event.sessionId, {
          sessionId: event.sessionId,
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          ip: event.ip,
          events: [],
          journey: [],
          completed: false,
        });
      }

      const session = sessionMap.get(event.sessionId)!;
      session.events.push(event);
      session.lastSeen = event.timestamp;

      // 페이지 이동 경로 추적
      if (event.eventType === 'page_view' && event.page) {
        if (!session.journey.includes(event.page)) {
          session.journey.push(event.page);
        }
      }

      // result 페이지 도달 여부
      if (event.eventType === 'recommendation_received') {
        session.completed = true;
      }
    }
  }

  // 최신 세션이 위로 오도록 정렬
  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
  );
}

export async function GET(request: NextRequest) {
  try {
    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (!password || !validatePassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 특정 날짜 조회
    if (date) {
      const logs = await getLogsByDate(date);
      if (!logs) {
        return NextResponse.json({ error: 'No logs found' }, { status: 404 });
      }
      const sessions = groupBySession([logs]);
      return NextResponse.json({ date, sessions, totalEvents: logs.events.length });
    }

    // 날짜 범위 조회
    if (startDate && endDate) {
      const logs = await getLogsByDateRange(startDate, endDate);
      const sessions = groupBySession(logs);
      const totalEvents = logs.reduce((sum, log) => sum + log.events.length, 0);
      return NextResponse.json({ startDate, endDate, sessions, totalEvents });
    }

    // 모든 날짜 목록 조회
    const dates = await getAllLogDates();
    return NextResponse.json({ dates });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (!password || !validatePassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const sessionId = searchParams.get('sessionId');

    if (!date || !sessionId) {
      return NextResponse.json(
        { error: 'date and sessionId are required' },
        { status: 400 }
      );
    }

    const success = await deleteSessionFromDate(date, sessionId);

    if (success) {
      return NextResponse.json({ success: true, message: 'Session deleted' });
    } else {
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
