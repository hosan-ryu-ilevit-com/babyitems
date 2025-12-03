// 로깅 시스템 타입 정의

export type LogEventType =
  | 'page_view'
  | 'button_click'
  | 'user_input'
  | 'ai_response'
  | 'recommendation_received'
  | 'product_chat_message'
  | 'favorite_added'
  | 'favorite_removed'
  | 'favorites_compare_clicked'
  | 'comparison_chat_message'
  | 'comparison_product_action'
  // V2 Flow specific events
  | 'category_selected'
  | 'anchor_product_selected'
  | 'anchor_product_changed'
  | 'tag_selected'
  | 'custom_tag_created'
  | 'result_v2_received'
  | 'result_v2_regenerated';

export interface LogEvent {
  sessionId: string;
  timestamp: string; // ISO 8601 format
  ip?: string;
  userAgent?: string;
  phone?: string; // URL 파라미터로 전달된 전화번호 (?phone=01012345678)
  utmCampaign?: string; // UTM 캠페인 파라미터 (?utm_campaign=first)
  eventType: LogEventType;
  page?: string; // home, ranking, chat/structured, chat/open, result
  attribute?: string; // 현재 질문 중인 속성 (예: "온도 조절/유지 성능")
  attributeIcon?: string; // 속성 아이콘 (예: "🌡️")
  buttonLabel?: string; // 버튼 텍스트
  userInput?: string; // 자연어 입력
  aiResponse?: string; // AI 응답 텍스트
  recommendations?: {
    productIds: string[];
    persona?: string | {
      summary?: string;
      coreValueWeights?: Record<string, number>;
      contextualNeeds?: string[];
      budget?: number;
    }; // 페르소나 정보 (문자열 또는 객체)
    isQuickRecommendation?: boolean; // 바로 추천받기 여부
    isV2Flow?: boolean; // V2 플로우 여부 (카테고리 기반)
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
  favoriteData?: {
    productId: string;
    productTitle: string;
    action: 'added' | 'removed';
    currentFavoritesCount: number;
  };
  comparisonData?: {
    source: 'home' | 'result'; // 어디서 진입했는지
    productIds?: string[]; // 비교 중인 제품들
    actionType?: 'compare_clicked' | 'coupang_clicked' | 'product_chat_clicked' | 'chat_opened' | 'chat_message';
    productId?: string; // 특정 제품 액션인 경우
    productTitle?: string;
    userMessage?: string; // 비교 채팅 메시지
    aiResponse?: string; // AI 응답
  };
  // V2 Flow specific data
  categoryData?: {
    category: string; // Selected category name
    categoryLabel: string; // Korean label (e.g., "분유포트")
  };
  anchorData?: {
    productId: string;
    productTitle: string;
    category: string;
    ranking: number; // Product ranking in category
    brand?: string;
    model?: string;
    action?: 'selected' | 'changed' | 'search_used'; // Action type
    searchKeyword?: string; // If search was used
  };
  tagData?: {
    tagId?: string; // For predefined tags
    tagText: string;
    tagType: 'pros' | 'cons';
    step: 1 | 2 | 3; // Which step in tags flow (1: pros, 2: cons, 3: budget)
    mentionCount?: number; // How many reviews mentioned this tag
    isCustom?: boolean; // User-created custom tag
    category: string;
    relatedAttributes?: Array<{
      attribute: string;
      weight: number;
    }>;
  };
  resultV2Data?: {
    category: string;
    anchorProductId: string;
    recommendedProductIds: string[];
    selectedProsTags: string[];
    selectedConsTags: string[];
    budget: string;
    fitScores?: number[]; // Fit scores for top 3
    isRegeneration?: boolean; // Was this a regeneration with different anchor?
    previousAnchorId?: string; // If regeneration, what was the previous anchor
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
  phone?: string; // URL 파라미터로 전달된 전화번호
  utmCampaign?: string; // UTM 캠페인 파라미터
  events: LogEvent[];
  journey: string[]; // 페이지 이동 경로
  completed: boolean; // result 페이지까지 도달 여부
  recommendationMethods: ('quick' | 'chat' | 'v2')[]; // 사용한 추천 방식들 (배열로 여러 개 가능)
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

// 제품별 추천 횟수 랭킹
export interface ProductRecommendationRanking {
  productId: string;
  productTitle: string;
  totalRecommendations: number; // 전체 추천된 횟수 (Top 3 안에 든 총 횟수)
  rank1Count: number; // 1위로 추천된 횟수
  rank2Count: number; // 2위로 추천된 횟수
  rank3Count: number; // 3위로 추천된 횟수
}

// 새로운 퍼널 통계 (UTM 기반)
export interface FunnelStep {
  count: number;
  percentage: number; // 이전 단계 대비 비율 (%)
}

export interface PostRecommendationAction {
  total: number; // 총 클릭 횟수
  unique: number; // 유니크 세션 수
}

export interface CampaignFunnelStats {
  utmCampaign: string; // 'all' | 'none' | 특정 캠페인명 (e.g., 'first')
  totalSessions: number;
  funnel: {
    homePageViews: FunnelStep;
    priorityEntry: FunnelStep;
    prosTagsSelected: FunnelStep;
    consTagsSelected: FunnelStep;
    additionalSelected: FunnelStep;
    budgetSelected: FunnelStep; // 최종 단계
    recommendationReceived: FunnelStep; // Best 3 추천 완료
    preRecommendationActions: {
      guideOpened: PostRecommendationAction; // 분유포트 1분 가이드 열기
      rankingTabClicked: PostRecommendationAction; // 랭킹 탭 클릭
    };
    postRecommendationActions: {
      productChatClicked: PostRecommendationAction; // 제품 질문하기
      recommendationReasonViewed: PostRecommendationAction; // 추천이유보기
      purchaseCriteriaViewed: PostRecommendationAction; // 내 구매 기준 펼쳐보기
      coupangClicked: PostRecommendationAction; // 쿠팡에서보기
      lowestPriceClicked: PostRecommendationAction; // 최저가보기
      comparisonTabClicked: PostRecommendationAction; // 상세비교표 탭 클릭
      comparisonChatUsed: PostRecommendationAction; // 제품 비교질문하기 쿼리
    };
  };
}

// V2 Flow Funnel Stats (Category-based flow) - Simplified page visit tracking
export interface V2FunnelStats {
  utmCampaign: string; // 'all' | 'none' | specific campaign
  totalSessions: number;
  funnel: {
    homePageViews: FunnelStep; // Home page visits (baseline = 100%)
    categoriesEntry: FunnelStep; // Categories page visited (journey includes 'categories')
    tagsEntry: FunnelStep; // Tags page visited (journey includes 'tags')
    resultV2Received: FunnelStep; // Result page visited (journey includes 'result-v2' or 'result')
    preRecommendationActions: {
      anchorGuideOpened: PostRecommendationAction; // "구매 1분 가이드" opened
      anchorSearchUsed: PostRecommendationAction; // Product search used
    };
    postRecommendationActions: {
      coupangClicked: PostRecommendationAction; // Coupang link clicked
      anchorRegenerated: PostRecommendationAction; // Changed anchor and regenerated
      comparisonViewed: PostRecommendationAction; // Viewed comparison (if implemented)
    };
  };
}

// Category-specific analytics
export interface CategoryAnalytics {
  category: string;
  categoryLabel: string;
  totalSessions: number;
  completionRate: number; // % that reached result-v2
  avgTimeToCompletion?: number; // Average time in seconds
  popularAnchorProducts: Array<{
    productId: string;
    productTitle: string;
    selectionCount: number;
    percentage: number;
  }>;
  popularProsTags: Array<{
    tagText: string;
    selectionCount: number;
    percentage: number;
  }>;
  popularConsTags: Array<{
    tagText: string;
    selectionCount: number;
    percentage: number;
  }>;
  budgetDistribution: Array<{
    budgetRange: string;
    count: number;
    percentage: number;
  }>;
  customTagCreationRate: number; // % of sessions that created custom tags
}

// V2 Product recommendation rankings (by category)
export interface V2ProductRecommendationRanking {
  category: string;
  productId: string;
  productTitle: string;
  totalRecommendations: number;
  rank1Count: number;
  rank2Count: number;
  rank3Count: number;
  avgFitScore?: number;
}
