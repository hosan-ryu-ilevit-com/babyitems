// 클라이언트 사이드 로깅 유틸리티
'use client';

import type { LogEventType } from '@/types/logging';

// sessionId 생성 및 관리
function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';

  const STORAGE_KEY = 'baby_item_session_id';
  let sessionId = localStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    // UUID v4 생성
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
    localStorage.setItem(STORAGE_KEY, sessionId);
  }

  return sessionId;
}

// 로그 이벤트 전송
async function sendLogEvent(
  eventType: LogEventType,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    await fetch('/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        eventType,
        ...data,
      }),
    });
  } catch (error) {
    console.error('Failed to send log event:', error);
  }
}

// 페이지 뷰 로깅
export function logPageView(page: string): void {
  sendLogEvent('page_view', { page });
}

// 속성별 아이콘 매핑
const ATTRIBUTE_ICONS: Record<string, string> = {
  'temperatureControl': '🌡️',
  'hygiene': '🧼',
  'material': '🛡️',
  'usability': '⚙️',
  'portability': '🎒',
  'priceValue': '💰',
  'durability': '🔧',
  'additionalFeatures': '✨',
};

// 속성 이름 매핑
const ATTRIBUTE_NAMES: Record<string, string> = {
  'temperatureControl': '온도 조절/유지 성능',
  'hygiene': '위생/세척 편의성',
  'material': '소재 (안전성)',
  'usability': '사용 편의성',
  'portability': '휴대성',
  'priceValue': '가격 및 가성비',
  'durability': '내구성/A/S',
  'additionalFeatures': '부가 기능 및 디자인',
};

// 버튼 클릭 로깅
export function logButtonClick(
  buttonLabel: string,
  page?: string,
  attributeKey?: string
): void {
  const data: Record<string, unknown> = { buttonLabel, page };
  if (attributeKey) {
    data.attribute = ATTRIBUTE_NAMES[attributeKey];
    data.attributeIcon = ATTRIBUTE_ICONS[attributeKey];
  }
  sendLogEvent('button_click', data);
}

// 사용자 입력 로깅
export function logUserInput(
  userInput: string,
  page?: string,
  attributeKey?: string
): void {
  const data: Record<string, unknown> = { userInput, page };
  if (attributeKey) {
    data.attribute = ATTRIBUTE_NAMES[attributeKey];
    data.attributeIcon = ATTRIBUTE_ICONS[attributeKey];
  }
  sendLogEvent('user_input', data);
}

// AI 응답 로깅
export function logAIResponse(
  aiResponse: string,
  page?: string,
  attributeKey?: string
): void {
  const data: Record<string, unknown> = { aiResponse, page };
  if (attributeKey) {
    data.attribute = ATTRIBUTE_NAMES[attributeKey];
    data.attributeIcon = ATTRIBUTE_ICONS[attributeKey];
  }
  sendLogEvent('ai_response', data);
}

// 추천 결과 로깅
export function logRecommendation(
  productIds: string[],
  persona?: string
): void {
  sendLogEvent('recommendation_received', {
    recommendations: {
      productIds,
      persona,
    },
  });
}

// sessionId 가져오기 (관리자 페이지 등에서 사용)
export function getSessionId(): string {
  return getOrCreateSessionId();
}
