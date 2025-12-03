// 새로운 event_logs 테이블에서 데이터 조회하는 유틸리티
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';
import type { LogEvent, SessionSummary } from '@/types/logging';

// 날짜 범위로 이벤트 조회
export async function getEventsByDateRange(
  startDate: string,
  endDate: string
): Promise<LogEvent[]> {
  if (!isSupabaseAvailable() || !supabase) {
    console.log('[Query] Supabase not available');
    return [];
  }

  try {
    console.log(`[Query] Fetching events from ${startDate} to ${endDate}`);

    // 먼저 total count 확인
    const { count: totalCount } = await supabase
      .from('event_logs')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', `${startDate}T00:00:00Z`)
      .lte('timestamp', `${endDate}T23:59:59Z`);

    console.log(`[Query] Total events in range: ${totalCount}`);

    if (!totalCount || totalCount === 0) {
      console.log('[Query] No events found');
      return [];
    }

    // 페이지네이션으로 모든 데이터 가져오기 (1000개씩)
    const pageSize = 1000;
    const pages = Math.ceil(totalCount / pageSize);
    console.log(`[Query] Fetching ${pages} pages (${pageSize} rows each)`);

    const allRows: any[] = [];

    for (let page = 0; page < pages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      console.log(`[Query] Fetching page ${page + 1}/${pages} (rows ${from}-${to})`);

      const { data, error } = await supabase
        .from('event_logs')
        .select('*')
        .gte('timestamp', `${startDate}T00:00:00Z`)
        .lte('timestamp', `${endDate}T23:59:59Z`)
        .order('timestamp', { ascending: true })
        .range(from, to);

      if (error) {
        console.error(`[Query] Failed to fetch page ${page + 1}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        console.log(`[Query] Page ${page + 1}: ${data.length} rows (total so far: ${allRows.length})`);
      }
    }

    console.log(`[Query] Fetched ${allRows.length} total rows`);

    // DB 형식 → LogEvent 형식으로 변환
    const events = allRows.map(row => ({
      sessionId: row.session_id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      page: row.page,
      buttonLabel: row.button_label,
      ip: row.ip,
      userAgent: row.user_agent,
      phone: row.phone,
      utmCampaign: row.utm_campaign,
      ...row.event_data, // JSONB 데이터 병합
    }));

    console.log(`[Query] Converted ${events.length} events`);
    return events;
  } catch (error) {
    console.error('[Query] Exception in get events by date range:', error);
    return [];
  }
}

// 최근 N일 이벤트 조회
export async function getRecentEvents(days: number = 30): Promise<LogEvent[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getEventsByDateRange(
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  );
}

// 이벤트 배열을 SessionSummary 배열로 변환
export function groupEventsBySession(events: LogEvent[]): SessionSummary[] {
  const sessionMap = new Map<string, SessionSummary>();

  events.forEach(event => {
    const sessionId = event.sessionId;

    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        ip: event.ip,
        phone: event.phone,
        utmCampaign: event.utmCampaign,
        events: [],
        journey: [],
        completed: false,
        recommendationMethods: [],
      });
    }

    const session = sessionMap.get(sessionId)!;
    session.events.push(event);

    // 타임스탬프 업데이트
    if (event.timestamp < session.firstSeen) {
      session.firstSeen = event.timestamp;
    }
    if (event.timestamp > session.lastSeen) {
      session.lastSeen = event.timestamp;
    }

    // phone, utmCampaign 업데이트
    if (event.phone && !session.phone) {
      session.phone = event.phone;
    }
    if (event.utmCampaign && !session.utmCampaign) {
      session.utmCampaign = event.utmCampaign;
    }

    // 페이지 journey 추적
    if (event.eventType === 'page_view' && event.page) {
      if (!session.journey.includes(event.page)) {
        session.journey.push(event.page);
      }
    }

    // 추천 완료 여부
    if (event.eventType === 'page_view') {
      if (event.page === 'result' || event.page === 'result-v2') {
        session.completed = true;

        // V2 플로우 판단
        const hasV2Events = session.events.some(e =>
          e.eventType === 'category_selected' ||
          e.eventType === 'tag_selected' ||
          e.eventType === 'anchor_product_selected'
        );

        if (hasV2Events || event.page === 'result-v2') {
          if (!session.recommendationMethods.includes('v2')) {
            session.recommendationMethods.push('v2');
          }
        } else if (session.recommendationMethods.length === 0) {
          session.recommendationMethods.push('quick');
        }
      }
    }

    // 추천 방식 세분화
    if (event.eventType === 'recommendation_received' && event.recommendations?.isQuickRecommendation) {
      if (!session.recommendationMethods.includes('quick')) {
        session.recommendationMethods.push('quick');
      }
    }
  });

  return Array.from(sessionMap.values());
}

// 오래된 로그 삭제 (30일 이상)
export async function cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
  if (!isSupabaseAvailable() || !supabase) {
    return 0;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error, count } = await supabase
      .from('event_logs')
      .delete({ count: 'exact' })
      .lt('timestamp', cutoffDate.toISOString());

    if (error) {
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Failed to cleanup old logs:', error);
    return 0;
  }
}
