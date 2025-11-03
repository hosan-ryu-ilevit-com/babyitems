// POST /api/log - 로그 이벤트 저장 API
import { NextRequest, NextResponse } from 'next/server';
import { saveLogEvent } from '@/lib/logging/logger';
import type { LogEvent } from '@/types/logging';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, eventType, ...rest } = body;

    if (!sessionId || !eventType) {
      return NextResponse.json(
        { error: 'sessionId and eventType are required' },
        { status: 400 }
      );
    }

    // IP 주소 추출
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // User-Agent 추출
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 로그 이벤트 생성
    const logEvent: LogEvent = {
      sessionId,
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      eventType,
      ...rest,
    };

    // 로그 저장
    await saveLogEvent(logEvent);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error saving log:', error);
    return NextResponse.json(
      { error: 'Failed to save log' },
      { status: 500 }
    );
  }
}
