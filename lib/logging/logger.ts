// 서버 사이드 로깅 유틸리티
import { promises as fs } from 'fs';
import path from 'path';
import type { LogEvent, DailyLog } from '@/types/logging';

const LOGS_DIR = path.join(process.cwd(), 'data', 'logs');

// 로그 디렉토리 생성
async function ensureLogsDir() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create logs directory:', error);
  }
}

// 오늘 날짜 파일명 생성 (YYYY-MM-DD.json)
function getTodayLogFilename(): string {
  const today = new Date().toISOString().split('T')[0];
  return path.join(LOGS_DIR, `${today}.json`);
}

// 로그 이벤트 저장
export async function saveLogEvent(event: LogEvent): Promise<void> {
  try {
    await ensureLogsDir();
    const filename = getTodayLogFilename();
    const today = new Date().toISOString().split('T')[0];

    // 기존 로그 읽기
    let dailyLog: DailyLog;
    try {
      const content = await fs.readFile(filename, 'utf-8');
      dailyLog = JSON.parse(content);
    } catch {
      // 파일이 없으면 새로 생성
      dailyLog = {
        date: today,
        events: [],
      };
    }

    // 이벤트 추가
    dailyLog.events.push(event);

    // 파일에 쓰기
    await fs.writeFile(filename, JSON.stringify(dailyLog, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save log event:', error);
  }
}

// 특정 날짜의 로그 읽기
export async function getLogsByDate(date: string): Promise<DailyLog | null> {
  try {
    const filename = path.join(LOGS_DIR, `${date}.json`);
    const content = await fs.readFile(filename, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// 모든 로그 파일 목록 가져오기
export async function getAllLogDates(): Promise<string[]> {
  try {
    await ensureLogsDir();
    const files = await fs.readdir(LOGS_DIR);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''))
      .sort()
      .reverse(); // 최신순 정렬
  } catch {
    return [];
  }
}

// 날짜 범위로 로그 조회
export async function getLogsByDateRange(
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  try {
    const allDates = await getAllLogDates();
    const filteredDates = allDates.filter(
      (date) => date >= startDate && date <= endDate
    );

    const logs = await Promise.all(
      filteredDates.map((date) => getLogsByDate(date))
    );

    return logs.filter((log): log is DailyLog => log !== null);
  } catch {
    return [];
  }
}

// 특정 날짜에서 특정 세션의 로그 삭제
export async function deleteSessionFromDate(
  date: string,
  sessionId: string
): Promise<boolean> {
  try {
    const filename = path.join(LOGS_DIR, `${date}.json`);
    const dailyLog = await getLogsByDate(date);

    if (!dailyLog) {
      return false;
    }

    // 해당 세션의 이벤트만 제거
    const filteredEvents = dailyLog.events.filter(
      (event) => event.sessionId !== sessionId
    );

    // 파일 업데이트 (이벤트가 남아있으면 저장, 없으면 파일 삭제)
    if (filteredEvents.length > 0) {
      dailyLog.events = filteredEvents;
      await fs.writeFile(filename, JSON.stringify(dailyLog, null, 2), 'utf-8');
    } else {
      // 모든 이벤트가 삭제되면 파일 자체를 삭제
      await fs.unlink(filename);
    }

    return true;
  } catch (error) {
    console.error('Failed to delete session:', error);
    return false;
  }
}
