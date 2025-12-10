// 서버 사이드 로깅 유틸리티 (Supabase 기반)
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';
import type { LogEvent, DailyLog } from '@/types/logging';

// 로그 이벤트 저장 (개별 row 방식 - 안정적)
export async function saveLogEvent(event: LogEvent): Promise<void> {
  // Supabase 사용 불가능하면 조용히 종료
  if (!isSupabaseAvailable() || !supabase) {
    console.warn('[Logger] ⚠️ Logging skipped - Supabase not available');
    return;
  }

  try {
    console.log(`[Logger] Saving event: ${event.eventType} for session ${event.sessionId.substring(0, 8)}...`);

    // 각 이벤트를 개별 row로 저장 (확장 가능하고 안정적)
    const { error } = await supabase
      .from('event_logs')
      .insert({
        session_id: event.sessionId,
        event_type: event.eventType,
        timestamp: event.timestamp,
        page: event.page,
        button_label: event.buttonLabel,
        ip: event.ip,
        user_agent: event.userAgent,
        phone: event.phone,
        utm_campaign: event.utmCampaign,
        event_data: {
          // 나머지 이벤트 데이터는 JSONB로 저장
          recommendations: event.recommendations,
          chatData: event.chatData,
          favoriteData: event.favoriteData,
          comparisonData: event.comparisonData,
          categoryData: event.categoryData,
          anchorData: event.anchorData,
          tagData: event.tagData,
          resultV2Data: event.resultV2Data,
          v2FlowData: event.v2FlowData, // V2 새 플로우 데이터 (하드필터, 밸런스, 단점, 예산, 추천 등)
          purchaseData: event.purchaseData, // 구매 링크 클릭 데이터
          productData: event.productData, // 제품 상세 데이터
          metadata: event.metadata, // 추가 메타데이터
          userInput: event.userInput, // 사용자 입력
          aiResponse: event.aiResponse, // AI 응답
        }
      })
      .select();

    if (error) {
      console.error('[Logger] ❌ Failed to save log event:', error);
      console.error('[Logger] Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('[Logger] ✅ Event saved successfully');
    }
  } catch (error) {
    console.error('[Logger] ❌ Exception while saving log event:', error);
  }
}

// 특정 날짜의 로그 읽기
export async function getLogsByDate(date: string): Promise<DailyLog | null> {
  if (!isSupabaseAvailable() || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('daily_logs_v2')
      .select('*')
      .eq('date', date)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 데이터가 없는 경우
        return null;
      }
      console.error('Failed to fetch log:', error);
      return null;
    }

    return {
      date: data.date,
      events: data.events as LogEvent[],
    };
  } catch (error) {
    console.error('Failed to get logs by date:', error);
    return null;
  }
}

// 모든 로그 날짜 목록 가져오기
export async function getAllLogDates(): Promise<string[]> {
  if (!isSupabaseAvailable() || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('daily_logs_v2')
      .select('date')
      .order('date', { ascending: false });

    if (error) {
      console.error('Failed to fetch log dates:', error);
      return [];
    }

    return data.map((log) => log.date);
  } catch (error) {
    console.error('Failed to get all log dates:', error);
    return [];
  }
}

// 날짜 범위로 로그 조회
export async function getLogsByDateRange(
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  if (!isSupabaseAvailable() || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('daily_logs_v2')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      console.error('Failed to fetch logs by date range:', error);
      return [];
    }

    return data.map((log) => ({
      date: log.date,
      events: log.events as LogEvent[],
    }));
  } catch (error) {
    console.error('Failed to get logs by date range:', error);
    return [];
  }
}

// 특정 날짜에서 특정 세션의 로그 삭제
export async function deleteSessionFromDate(
  date: string,
  sessionId: string
): Promise<boolean> {
  if (!isSupabaseAvailable() || !supabase) {
    return false;
  }

  try {
    const dailyLog = await getLogsByDate(date);

    if (!dailyLog) {
      return false;
    }

    // 해당 세션의 이벤트만 제거
    const filteredEvents = dailyLog.events.filter(
      (event) => event.sessionId !== sessionId
    );

    if (filteredEvents.length > 0) {
      // 이벤트가 남아있으면 업데이트
      const { error } = await supabase
        .from('daily_logs_v2')
        .update({ events: filteredEvents })
        .eq('date', date);

      if (error) {
        console.error('Failed to update log after deletion:', error);
        return false;
      }
    } else {
      // 모든 이벤트가 삭제되면 해당 날짜 로그 삭제
      const { error } = await supabase
        .from('daily_logs_v2')
        .delete()
        .eq('date', date);

      if (error) {
        console.error('Failed to delete log:', error);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to delete session:', error);
    return false;
  }
}
