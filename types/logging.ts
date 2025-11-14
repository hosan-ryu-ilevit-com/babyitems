// 로깅 시스템 타입 정의

export type LogEventType =
  | 'page_view'
  | 'button_click'
  | 'user_input'
  | 'ai_response'
  | 'recommendation_received'
  | 'product_chat_message';

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
        comparison: string[];
        additionalConsiderations: string;
      }>;
    };
  };
  chatData?: {
    productId: string;
    productTitle?: string;
    userMessage: string;
    aiResponse: string;
    hasRecommendation: boolean;
    recommendedProductId?: string;
    isInitialMessage?: boolean;
    isExampleQuestion?: boolean;
  };
  guideCardNumber?: string; // 가이드 카드 번호
  guideCardTitle?: string; // 가이드 카드 제목
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

// 통계 대시보드 타입
export interface DashboardStats {
  // 1. 홈 페이지 통계
  home: {
    totalVisits: number; // 홈 페이지 방문 수
    quickStartClicks: number; // "1분만에 추천받기" 클릭 수
    rankingPageClicks: number; // "대표상품 랭킹보기" 클릭 수
  };

  // 2. 랭킹 페이지 통계
  ranking: {
    totalVisits: number; // 랭킹 페이지 방문 수
    productClicks: ProductClickStats[]; // 상품별 클릭 통계
    coupangClicks: number; // 쿠팡 링크 클릭 총합
    chatClicks: number; // 질문하기 클릭 총합
  };

  // 3. Priority 페이지 통계
  priority: {
    totalVisits: number; // Priority 페이지 방문 수
    quickRecommendations: number; // "바로 추천받기" 클릭 수
    chatRecommendations: number; // "채팅으로 더 자세히" 클릭 수
  };

  // 4. Result 페이지 통계
  result: {
    totalVisits: number; // Result 페이지 방문 수
    recommendations: RecommendationStats[]; // 추천된 상품별 통계
    detailChatClicks: number; // "채팅하고 더 정확히 추천받기" 클릭 수
    totalCoupangClicks: number; // Result에서 쿠팡 클릭 총합
    totalProductChatClicks: number; // Result에서 질문하기 클릭 총합
  };
}

export interface ProductClickStats {
  productId: string;
  productTitle: string;
  ranking: number;
  totalClicks: number; // 해당 상품의 모든 버튼 클릭 수
  coupangClicks: number; // 쿠팡 링크 클릭 수
  chatClicks: number; // 질문하기 클릭 수
}

export interface RecommendationStats {
  productId: string;
  productTitle: string;
  recommendCount: number; // 추천된 횟수
  rank1Count: number; // 1위로 추천된 횟수
  rank2Count: number; // 2위로 추천된 횟수
  rank3Count: number; // 3위로 추천된 횟수
  coupangClicks: number; // 쿠팡 링크 클릭 수
  chatClicks: number; // 질문하기 클릭 수
}
