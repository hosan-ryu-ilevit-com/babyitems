// 로깅 시스템 타입 정의

export type LogEventType =
  | 'page_view'
  | 'button_click'
  | 'user_input'
  | 'ai_response'
  | 'recommendation_received';

export interface LogEvent {
  sessionId: string;
  timestamp: string; // ISO 8601 format
  ip?: string;
  userAgent?: string;
  eventType: LogEventType;
  page?: string; // home, ranking, chat/structured, chat/open, result
  attribute?: string; // 현재 질문 중인 속성 (예: "온도 조절/유지 성능")
  attributeIcon?: string; // 속성 아이콘 (예: "🌡️")
  buttonLabel?: string; // 버튼 텍스트
  userInput?: string; // 자연어 입력
  aiResponse?: string; // AI 응답 텍스트
  recommendations?: {
    productIds: string[];
    persona?: string; // 간단한 페르소나 요약
    isQuickRecommendation?: boolean; // 바로 추천받기 여부
    fullReport?: {
      userContext?: {
        priorityAttributes?: Array<{
          name: string;
          level: string;
          reason: string;
        }>;
        additionalContext?: string[];
        budget?: string;
      };
      recommendations?: Array<{
        rank: number;
        productId: string;
        productTitle: string;
        price: number;
        finalScore: number;
        strengths: string[];
        weaknesses: string[];
        comparison: string;
        additionalConsiderations: string;
      }>;
    };
  };
  metadata?: Record<string, unknown>; // 추가 정보
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  events: LogEvent[];
}

export interface SessionSummary {
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  ip?: string;
  events: LogEvent[];
  journey: string[]; // 페이지 이동 경로
  completed: boolean; // result 페이지까지 도달 여부
  recommendationMethods?: ('quick' | 'chat')[]; // 사용한 추천 방식들 (배열로 여러 개 가능)
}
