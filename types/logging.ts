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
  // V2 Flow specific events (legacy - category/anchor/tags flow)
  | 'category_selected'
  | 'anchor_product_selected'
  | 'anchor_product_changed'
  | 'tag_selected'
  | 'custom_tag_created'
  | 'result_v2_received'
  | 'result_v2_regenerated'
  // V2 New Flow events (recommend-v2 with hard filters, balance game, etc.)
  | 'v2_page_view'           // recommend-v2 페이지 진입 (카테고리 정보 포함)
  | 'v2_guide_start'         // 가이드 카드 '시작하기' 클릭
  | 'v2_subcategory_selected' // 하위 카테고리 선택
  | 'v2_hard_filter_answer'  // 하드필터 개별 질문 답변
  | 'v2_hard_filter_completed' // 하드필터 전체 완료
  | 'v2_hard_filter_custom_input' // 하드필터 직접 입력
  | 'v2_checkpoint_viewed'   // 조건 분석 완료 화면
  | 'v2_balance_selection'   // 밸런스 게임 개별 선택
  | 'v2_balance_completed'   // 밸런스 게임 완료
  | 'v2_balance_skipped'     // 밸런스 게임 스킵
  | 'v2_negative_toggle'     // 단점 개별 토글
  | 'v2_negative_completed'  // 피할 단점 완료
  | 'v2_budget_changed'      // 예산 슬라이더/입력 변경
  | 'v2_budget_preset_clicked' // 예산 프리셋 버튼 클릭
  | 'v2_recommendation_requested' // 추천받기 버튼 클릭
  | 'v2_recommendation_received' // 추천 결과 수신
  | 'v2_product_modal_opened' // 제품 상세 모달 열기
  | 'v2_danawa_price_clicked' // 다나와 가격 링크 클릭
  | 'v2_sellers_toggle'      // 판매처 더보기/접기
  | 'v2_favorite_toggled'    // 찜하기 토글
  | 'v2_lowest_price_clicked' // 최저가로 구매하기 클릭
  | 'v2_step_back'           // 이전 단계로 돌아가기
  // 추가 상세 로깅 이벤트
  | 'favorite_lowest_price_clicked' // 찜하기 페이지 최저가 구매 클릭
  | 'age_badge_selected'     // 카테고리 페이지 연령대 선택
  | 'guide_card_tab_selected' // 가이드 카드 탭 선택
  | 'guide_card_toggle'      // 가이드 카드 토글 열기/닫기
  | 'product_modal_purchase_clicked' // 상품 모달 구매 링크 클릭
  | 'comparison_detail_view_clicked' // 비교표 상세보기 클릭
  // 다시 추천받기 이벤트
  | 'v2_re_recommend_modal_opened' // 다시 추천받기 모달 열기
  | 'v2_re_recommend_same_category' // 같은 카테고리 다시 추천받기
  | 'v2_re_recommend_different_category' // 다른 카테고리 추천받기
  // 새로운 기능 로깅 이벤트
  | 'ai_helper_clicked' // "뭘 고를지 모르겠어요" 버튼 클릭
  | 'example_question_clicked' // AI 헬퍼 바텀시트 예시 질문 클릭
  | 'example_question_applied' // 예시 질문 선택 후 적용
  | 'review_tab_opened' // 제품 리뷰 탭 열기
  | 'criteria_detail_viewed' // 체감속성/구매 기준 상세 보기
  // Step -1 (ContextInput) 이벤트
  | 'context_input_example_clicked' // 컨텍스트 입력 예시 칩 클릭
  | 'context_input_submitted' // 컨텍스트 입력 제출 (자연어)
  | 'context_input_button_clicked' // 컨텍스트 입력 버튼 (추천받기 시작/건너뛰기)
  // 직접 입력 이벤트
  | 'direct_input_registered' // 하드필터/단점 필터 직접 입력 등록
  | 'direct_input_button_clicked' // 직접 추가 버튼 클릭 (편집 모드 진입)
  // Followup Carousel (추가 질문) 이벤트
  | 'followup_question_answered' // 추가 질문 응답
  | 'followup_question_other_input' // 추가 질문 직접 입력
  | 'final_natural_input_submitted' // 마지막 자연어 추가조건 입력
  | 'skip_to_recommendation_clicked' // 건너뛰고 바로 추천받기 클릭
  | 'recommend_with_natural_input_clicked' // 자연어 입력 후 추천받기 클릭
  // Result Chat (추천 결과 채팅) 이벤트
  | 'result_chat_message' // 결과 페이지 채팅 메시지 (사용자 + AI 응답)
  | 'result_chat_full_history' // 결과 페이지 채팅 전체 대화 내역
  // 예산 관련 추가 이벤트
  | 'v2_budget_restrict_clicked' // 정확한 예산 범위로 추천받기 클릭
  // Knowledge Agent (KA) events
  | 'ka_page_view'
  | 'ka_main_category_selected'
  | 'ka_sub_category_selected'
  | 'ka_category_button_clicked'
  | 'ka_keyword_extraction_requested'
  | 'ka_search_confirmed'
  | 'ka_search_cancelled'
  | 'ka_loading_phase_started'
  | 'ka_loading_phase_completed'
  | 'ka_question_answered'
  | 'ka_question_skipped'
  | 'ka_chat_message'
  | 'ka_product_modal_opened'
  | 'ka_external_link_clicked'
  | 'ka_favorite_toggled'
  | 'ka_comparison_viewed'
  | 'ka_comparison_chat_message'
  | 'ka_comparison_view'
  | 'ka_product_purchase_click'
  | 'ka_balance_selection'
  | 'ka_balance_completed'
  | 'ka_balance_skipped'
  | 'ka_negative_toggle'
  | 'ka_negative_completed'
  | 'ka_budget_changed'
  | 'ka_budget_preset_clicked'
  | 'ka_budget_confirm'
  | 'ka_budget_skip'
  | 'ka_recommendation_received' // Knowledge Agent top3 추천 결과 수신
  | 'knowledge_agent_search_request' // 지식 에이전트 검색 요청 (입력창 또는 버튼 클릭)
  | 'knowledge_agent_search_confirm' // 지식 에이전트 검색 확인 (모달에서)
  | 'knowledge_agent_search_cancel' // 지식 에이전트 검색 취소 (모달에서)
  | 'knowledge_agent_category_select' // 지식 에이전트 메인 카테고리 선택
  | 'knowledge_agent_subcategory_select' // 지식 에이전트 서브 카테고리 선택
  | 'knowledge_agent_product_select' // 지식 에이전트 PLP 상품 클릭
  | 'knowledge_agent_product_modal_open' // 지식 에이전트 PDP 모달 열기
  | 'knowledge_agent_product_purchase_click' // 지식 에이전트 PDP 모달 구매 링크 클릭
  | 'knowledge_agent_product_review_click' // 지식 에이전트 PDP 모달 리뷰 보기 클릭
  | 'knowledge_agent_comparison_view' // 지식 에이전트 비교표 보기
  | 'knowledge_agent_comparison_product_action' // 지식 에이전트 비교표 내 상품 액션 (구매, 리뷰 등)
  | 'knowledge_agent_hardcut_continue' // 지식 에이전트 하드컷팅 완료 후 계속하기
  | 'knowledge_agent_final_input_submit' // 지식 에이전트 최종 자연어 입력 제출
  | 'knowledge_agent_re_recommend_modal_open' // 지식 에이전트 다시 추천받기 모달 열기
  | 'knowledge_agent_re_recommend_same_category' // 지식 에이전트 같은 카테고리 다시 추천받기
  | 'knowledge_agent_re_recommend_different_category' // 지식 에이전트 다른 카테고리 추천받기
  | 'knowledge_agent_ai_helper_action' // 지식 에이전트 AI 헬퍼 관련 액션
  // KA 추가 상세 로깅 이벤트
  | 'ka_comparison_toggle' // KA 비교표 토글 온/오프
  | 'ka_comparison_purchase_click' // KA 비교표 내 구매하기 버튼 클릭
  | 'ka_photo_review_filter_toggle' // KA 포토리뷰만 보기 필터 토글
  | 'ka_blog_review_click' // KA 블로그 리뷰 보기 클릭
  | 'ka_review_sort_change' // KA 리뷰 정렬 변경 (최신순/별점높은순/별점낮은순)
  | 'ka_filter_tag_toggle' // KA 필터 태그 토글 (결과 페이지)
  | 'ka_question_generated' // Knowledge Agent AI 질문 생성 로깅
  | 'ka_product_match_rate'; // Knowledge Agent 상품 매칭도 로깅

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
    brand?: string;
    action: 'added' | 'removed' | 'lowest_price_click';
    currentFavoritesCount?: number;
  };
  purchaseData?: {
    price: number;
    mall: string;
    isLowestPrice?: boolean;
  };
  productData?: {
    productId: string;
    productTitle: string;
    brand?: string;
    rank?: number;
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
    ageBadge?: string; // 연령대 배지 (e.g., "0~6개월")
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
  // V2 New Flow data (recommend-v2 페이지)
  v2FlowData?: {
    category: string;
    categoryName: string;
    step?: number; // 0-5 (현재 단계)
    // 하드필터 관련
    hardFilter?: {
      questionId: string;
      questionText: string;
      questionIndex: number;
      totalQuestions: number;
      selectedValues: string[];
      selectedLabels: string[];
      productCountAfterFilter?: number;
      isCustomInput?: boolean;
      customInputText?: string;
    };
    // 서브카테고리 관련
    subCategory?: {
      code: string;
      name: string;
    };
    // 밸런스 게임 관련
    balance?: {
      questionId: string;
      questionIndex: number;
      totalQuestions: number;
      selectedOption: 'A' | 'B';
      optionALabel: string;
      optionBLabel: string;
      selectedLabel: string;
      ruleKey: string;
    };
    // 피할 단점 관련
    negative?: {
      ruleKey: string;
      label: string;
      isSelected: boolean;
      totalSelected: number;
    };
    // 예산 관련
    budget?: {
      min: number;
      max: number;
      preset?: string; // 가성비/적정가/프리미엄/전체
      isDirectInput?: boolean;
      productsInRange?: number;
    };
    // 추천 결과 관련
    recommendation?: {
      recommendedProducts: Array<{
        pcode: string;
        title: string;
        brand?: string;
        rank: number;
        price?: number;
        score?: number;
        tags?: string[]; // 매칭된 규칙들 (matchedRules)
        reason?: string; // 개별 제품 추천 이유
      }>;
      selectionReason?: string;
      totalCandidates: number;
      budgetFiltered?: number;
      processingTimeMs?: number;
      // 하이라이트된 리뷰 (어드민 추천 리포트용)
      highlightedReviews?: Array<{
        pcode: string;
        productTitle: string;
        rank: number;
        reviews: Array<{
          criteriaId: string;
          criteriaName: string;
          originalText: string;
          excerpt: string;
        }>;
      }>;
    };
    // 상품 모달 관련
    productModal?: {
      pcode: string;
      title: string;
      brand?: string;
      rank: number;
    };
    // 다나와 가격 클릭
    danawaClick?: {
      pcode: string;
      mall: string;
      price: number;
      isLowestPrice: boolean;
    };
    // 가이드 카드 탭 선택
    guideCard?: {
      selectedTab: 'pros' | 'cons';
      tabLabel: string;
    };
    // 체크포인트 상세 정보
    checkpoint?: {
      totalProductCount: number;
      filteredProductCount: number;
      summaryText: string;
      conditions: Array<{ label: string; value: string }>;
    };
    // 찜하기
    favorite?: {
      pcode: string;
      title: string;
      action: 'add' | 'remove';
    };
    // 단계 이동
    stepTransition?: {
      fromStep: number;
      toStep: number;
      direction: 'forward' | 'back';
    };
    // 소요 시간 (ms)
    elapsedTimeMs?: number;
    // 다시 추천받기
    reRecommend?: {
      action: 'modal_opened' | 'same_category' | 'different_category';
      targetCategory?: string;
      targetCategoryName?: string;
      fromCategory?: string;
      fromCategoryName?: string;
    };
  };
  // 새로운 기능 로깅 데이터 필드
  aiHelperData?: {
    questionType: 'hard_filter' | 'balance_game' | 'negative' | 'budget';
    questionId: string;
    questionText: string;
    exampleText?: string; // 선택한 예시 질문
    selectedOptions?: string[]; // 적용 후 선택한 옵션들
    selectedLabels?: string[]; // 라벨명
  };
  reviewData?: {
    pcode: string;
    productTitle: string;
    brand?: string;
    tabType: 'reviews' | 'insights' | 'real_reviews';
    criteriaId?: string; // 체감속성 ID
    criteriaName?: string; // 체감속성명
    mentionCount?: number; // 언급 횟수
    rank?: number; // 추천 순위 (1, 2, 3)
  };
  purchaseCriteriaData?: {
    page: 'result' | 'result-v2';
    criteriaCount: number; // 총 기준 개수
    isExpanded: boolean; // 펼쳐짐/접힘
    expandedCriteria?: string[]; // 펼친 기준들
    criteriaType?: 'priority' | 'reason'; // 우선순위 vs 추천이유
  };
  highlightedReviews?: Array<{
    pcode: string;
    productTitle: string;
    rank: number; // 1, 2, 3위
    reviews: Array<{
      criteriaId: string; // 예: 'cleaning_frequency'
      criteriaName: string; // 예: '세척 편리성'
      originalText: string; // 원본 리뷰
      excerpt: string; // 하이라이트된 발췌문 (마크다운 볼드 포함)
      reviewIndex?: number; // citedReviews 배열 인덱스
    }>;
  }>;
  knowledgeAgentData?: {
    category?: string;
    subCategory?: string;
    searchKeyword?: string;
    extractedKeyword?: string;
    productId?: string;
    productTitle?: string;
    brand?: string;
    rank?: number;
    action?: string; // e.g., 'search_input', 'button_click', 'confirm', 'cancel'
    purchaseData?: {
      mall: string;
      price: number;
      isLowestPrice: boolean;
    };
    comparisonProductIds?: string[];
    comparisonActionType?: 'purchase_click' | 'review_click' | 'detail_view';
    hardcutData?: {
      totalBefore: number;
      totalAfter: number;
      appliedRules: string[];
    };
    finalInputText?: string;
    reRecommendAction?: 'modal_opened' | 'same_category' | 'different_category';
    targetCategory?: string;
    aiHelper?: {
      action: 'opened' | 'example_clicked' | 'example_applied' | 'direct_input';
      exampleText?: string;
      questionId?: string;
      questionText?: string;
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
  phone?: string; // URL 파라미터로 전달된 전화번호
  utmCampaign?: string; // UTM 캠페인 파라미터
  events: LogEvent[];
  journey: string[]; // 페이지 이동 경로
  completed: boolean; // result 페이지까지 도달 여부
  recommendationMethods: ('quick' | 'chat' | 'v2' | 'ka')[]; // 사용한 추천 방식들 (배열로 여러 개 가능)
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

// V2 Flow Funnel Stats (Category-based flow) - Simplified page visit tracking (LEGACY)
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

// V2 New Flow Funnel Stats (recommend-v2 페이지 - 간소화 퍼널)
export interface V2NewFlowFunnelStats {
  utmCampaign: string;
  totalSessions: number;
  funnel: {
    // 핵심 퍼널 단계
    homePageViews: FunnelStep;           // Step 1: 홈 페이지 방문
    // 진입 경로별 분기 (categories-v2 또는 캐러셀 직접 진입)
    categoriesV2Entry: FunnelStep;       // Step 2a: categories-v2 페이지 방문 (버튼 클릭)
    carouselDirectEntry: FunnelStep;     // Step 2b: 캐러셀에서 직접 recommend-v2 진입
    recommendV2Entry: FunnelStep;        // Step 3: recommend-v2 페이지 진입 (총합)
    // (내부 추적용 - 퍼널 UI에는 미표시)
    guideStartClicked: FunnelStep;       // 가이드 카드 '시작하기' 클릭
    subCategorySelected: FunnelStep;     // 하위 카테고리 선택 (해당 시)
    // 메인 퍼널 단계
    hardFilterCompleted: FunnelStep;     // Step 4: 하드필터 완료
    checkpointViewed: FunnelStep;        // Step 5: 조건 분석 완료 화면
    balanceCompleted: FunnelStep;        // Step 6: 밸런스 게임 완료
    negativeCompleted: FunnelStep;       // Step 7: 피할 단점 완료
    budgetConfirmed: FunnelStep;         // Step 8: 예산 설정 완료
    recommendationReceived: FunnelStep;  // Step 9: 추천 결과 수신
  };
  // 하드필터 질문별 이탈률
  hardFilterDropoff: Array<{
    questionIndex: number;
    questionId: string;
    questionText: string;
    enteredCount: number;
    completedCount: number;
    dropoffRate: number; // %
  }>;
  // 단계별 평균 소요 시간 (초)
  avgTimePerStep: {
    guideToHardFilter: number;
    hardFilterToCheckpoint: number;
    checkpointToBalance: number;
    balanceToNegative: number;
    negativeTobudget: number;
    budgetToResult: number;
    totalTime: number;
  };
  // 결과 페이지 상세 액션
  resultPageActions: {
    productModalOpened: PostRecommendationAction;
    danawaPriceClicked: PostRecommendationAction;
    sellersToggled: PostRecommendationAction;
    favoriteToggled: PostRecommendationAction;
    lowestPriceClicked: PostRecommendationAction;
  };
  // 직접 입력 사용률
  customInputUsage: {
    hardFilterCustomInput: PostRecommendationAction;
    budgetDirectInput: PostRecommendationAction;
  };
  // AI 도움 요청 사용률
  aiHelperUsage: {
    totalRequests: PostRecommendationAction; // 전체 AI 도움 요청 수
    hardFilterHelp: PostRecommendationAction; // 하드필터 AI 도움
    balanceGameHelp: PostRecommendationAction; // 밸런스 게임 AI 도움
    negativeHelp: PostRecommendationAction; // 단점 AI 도움
    budgetHelp: PostRecommendationAction; // 예산 AI 도움
  };
}

// 카테고리별 V2 New Flow 분석
export interface V2NewFlowCategoryAnalytics {
  category: string;
  categoryName: string;
  totalSessions: number;
  completionRate: number; // 추천 결과까지 도달한 비율 (%)
  avgTotalTimeSeconds: number; // 평균 총 소요 시간
  // 단계별 이탈률
  stepDropoffRates: {
    guideStart: number;
    subCategory: number;
    hardFilter: number;
    checkpoint: number;
    balance: number;
    negative: number;
    budget: number;
  };
  // 인기 선택지
  popularSelections: {
    hardFilters: Array<{
      questionId: string;
      value: string;
      label: string;
      count: number;
      percentage: number;
    }>;
    balanceChoices: Array<{
      questionId: string;
      selectedOption: 'A' | 'B';
      label: string;
      count: number;
      percentage: number;
    }>;
    negativeChoices: Array<{
      ruleKey: string;
      label: string;
      count: number;
      percentage: number;
    }>;
    budgetPresets: Array<{
      preset: string;
      count: number;
      percentage: number;
    }>;
  };
  // 추천된 상품 랭킹
  recommendedProducts: Array<{
    pcode: string;
    title: string;
    brand?: string;
    totalRecommendations: number;
    rank1Count: number;
    rank2Count: number;
    rank3Count: number;
  }>;
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

// Knowledge Agent (KA) Flow Funnel Stats
export interface KAFlowFunnelStats {
  utmCampaign: string;
  totalSessions: number;
  funnel: {
    homePageViews: FunnelStep;              // 1. 메인 페이지 뷰
    kaLandingEntry: FunnelStep;             // 2. 바로 추천받기 (KA 랜딩 진입)
    categorySelected: FunnelStep;           // 3. 특정 카테고리 버튼 누른 수
    loadingStarted: FunnelStep;             // 4. 분석 시작하기 (로딩 시작)
    firstQuestionViewed: FunnelStep;        // 5. 첫 맞춤질문 로딩 완료
    reportRequested: FunnelStep;            // 6. 최종 추천 결과 보기 버튼
    recommendationReceived: FunnelStep;     // 7. Top5 추천 결과 수신
  };
  // 단계별 평균 소요 시간 (초)
  avgTimePerStep: {
    landingToCategory: number;
    categoryToLoading: number;
    loadingToFirstQuestion: number;
    firstQuestionToReport: number;
    reportToResult: number;
    totalTime: number;
  };
  // 카테고리별 분포
  categoryDistribution: Array<{
    category: string;
    categoryName: string;
    count: number;
    percentage: number;
    completionRate: number;
  }>;
  // 결과 페이지 액션
  resultPageActions: {
    productModalOpened: PostRecommendationAction;  // PDP 열어본 사람
    reviewTabViewed: PostRecommendationAction;     // 상품리뷰 탭 본 사람
    purchaseClicked: PostRecommendationAction;     // 구매하기 버튼 누른 사람
    comparisonViewed: PostRecommendationAction;    // 비교표 토글
  };
}
