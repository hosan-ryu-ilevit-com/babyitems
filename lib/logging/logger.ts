// 서버 사이드 로깅 유틸리티 (Supabase 기반)
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';
import type { LogEvent, DailyLog } from '@/types/logging';

// 오늘 날짜 문자열 생성 (YYYY-MM-DD)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// 로그 이벤트 저장
export async function saveLogEvent(event: LogEvent): Promise<void> {
  // Supabase 사용 불가능하면 조용히 종료
  if (!isSupabaseAvailable() || !supabase) {
    console.debug('Logging skipped (Supabase not available)');
    return;
  }

  try {
    const today = getTodayDate();

    // 오늘 날짜의 로그 조회
    const { data: existingLog, error: fetchError } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('date', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116은 "no rows returned" 에러 (정상)
      console.error('Failed to fetch log:', fetchError);
      return;
    }

    if (existingLog) {
      // 기존 로그에 이벤트 추가
      const updatedEvents = [...(existingLog.events as LogEvent[]), event];
      const { error: updateError } = await supabase
        .from('daily_logs')
        .update({ events: updatedEvents })
        .eq('date', today);

      if (updateError) {
        console.error('Failed to update log:', updateError);
      }
    } else {
      // 새 로그 생성
      const { error: insertError } = await supabase
        .from('daily_logs')
        .insert({
          date: today,
          events: [event],
        });

      if (insertError) {
        console.error('Failed to insert log:', insertError);
      }
    }
  } catch (error) {
    console.error('Failed to save log event:', error);
  }
}

// 특정 날짜의 로그 읽기
export async function getLogsByDate(date: string): Promise<DailyLog | null> {
  if (!isSupabaseAvailable() || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('daily_logs')
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
      .from('daily_logs')
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
      .from('daily_logs')
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
        .from('daily_logs')
        .update({ events: filteredEvents })
        .eq('date', date);

      if (error) {
        console.error('Failed to update log after deletion:', error);
        return false;
      }
    } else {
      // 모든 이벤트가 삭제되면 해당 날짜 로그 삭제
      const { error } = await supabase
        .from('daily_logs')
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
