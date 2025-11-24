// 태그 클릭 통계 API (공개 - 비밀번호 불필요)
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';
import type { LogEvent } from '@/types/logging';

interface TagStats {
  tag: string;
  clickCount: number;
  isPopular: boolean; // 상위 4개
}

interface TagStatsResponse {
  pros: TagStats[];
  cons: TagStats[];
  lastUpdated: string;
}

export async function GET(request: NextRequest) {
  try {
    // Supabase 사용 불가능하면 빈 결과 반환
    if (!isSupabaseAvailable() || !supabase) {
      return NextResponse.json({
        pros: [],
        cons: [],
        lastUpdated: new Date().toISOString()
      });
    }

    // 모든 로그 가져오기
    const { data: logs, error } = await supabase
      .from('daily_logs')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Failed to fetch logs:', error);
      return NextResponse.json({
        pros: [],
        cons: [],
        lastUpdated: new Date().toISOString()
      });
    }

    // 태그 클릭 집계
    const prosClicks: Record<string, number> = {};
    const consClicks: Record<string, number> = {};

    logs?.forEach((log) => {
      const events = log.events as LogEvent[];

      events.forEach((event) => {
        if (event.eventType === 'button_click' && event.buttonLabel) {
          // 장점 태그 클릭 (두 가지 패턴 모두 지원)
          if (event.buttonLabel.startsWith('장점 태그: ')) {
            const tag = event.buttonLabel.replace('장점 태그: ', '');
            prosClicks[tag] = (prosClicks[tag] || 0) + 1;
          }
          else if (event.buttonLabel.startsWith('장점 태그 선택: ')) {
            const tag = event.buttonLabel.replace('장점 태그 선택: ', '');
            prosClicks[tag] = (prosClicks[tag] || 0) + 1;
          }
          // 단점 태그 클릭 (두 가지 패턴 모두 지원)
          else if (event.buttonLabel.startsWith('단점 태그: ')) {
            const tag = event.buttonLabel.replace('단점 태그: ', '');
            consClicks[tag] = (consClicks[tag] || 0) + 1;
          }
          else if (event.buttonLabel.startsWith('단점 태그 선택: ')) {
            const tag = event.buttonLabel.replace('단점 태그 선택: ', '');
            consClicks[tag] = (consClicks[tag] || 0) + 1;
          }
        }
      });
    });

    // 정렬 및 상위 4개 식별
    const prosStats: TagStats[] = Object.entries(prosClicks)
      .map(([tag, clickCount]) => ({ tag, clickCount, isPopular: false }))
      .sort((a, b) => b.clickCount - a.clickCount)
      .map((stat, index) => ({
        ...stat,
        isPopular: index < 4 // 상위 4개
      }));

    const consStats: TagStats[] = Object.entries(consClicks)
      .map(([tag, clickCount]) => ({ tag, clickCount, isPopular: false }))
      .sort((a, b) => b.clickCount - a.clickCount)
      .map((stat, index) => ({
        ...stat,
        isPopular: index < 4 // 상위 4개
      }));

    return NextResponse.json({
      pros: prosStats,
      cons: consStats,
      lastUpdated: new Date().toISOString()
    } as TagStatsResponse);

  } catch (error) {
    console.error('Tag stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag statistics' },
      { status: 500 }
    );
  }
}
