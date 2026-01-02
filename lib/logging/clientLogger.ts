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

// sessionStorage에서 tracking 정보 가져오기
function getTrackingFromSession(): { phone: string | null; utmCampaign: string | null } {
  if (typeof window === 'undefined') return { phone: null, utmCampaign: null };

  try {
    const sessionData = sessionStorage.getItem('babyitem_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      return {
        phone: session.phone || null,
        utmCampaign: session.utmCampaign || null,
      };
    }
  } catch (error) {
    console.error('Failed to get tracking info from session:', error);
  }
  return { phone: null, utmCampaign: null };
}

// 로그 이벤트 전송
async function sendLogEvent(
  eventType: LogEventType,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    const { phone, utmCampaign } = getTrackingFromSession();

    await fetch('/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        eventType,
        phone, // 전화번호 포함
        utmCampaign, // UTM 캠페인 포함
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

// 재추천 결과 로깅 (사용자 입력 기반)
export function logReRecommendation(
  userInput: string,
  productIds: string[],
  previousProductIds?: string[]
): void {
  sendLogEvent('recommendation_received', {
    page: 'result',
    recommendations: {
      productIds,
      previousProductIds,
      isReRecommendation: true,
      userInput, // 사용자가 입력한 자연어
    },
  });
}

// sessionId 가져오기 (관리자 페이지 등에서 사용)
export function getSessionId(): string {
  return getOrCreateSessionId();
}

// 찜하기 로깅
export function logFavoriteAction(
  action: 'added' | 'removed',
  productId: string,
  productTitle: string,
  currentFavoritesCount: number
): void {
  sendLogEvent(action === 'added' ? 'favorite_added' : 'favorite_removed', {
    favoriteData: {
      productId,
      productTitle,
      action,
      currentFavoritesCount,
    },
  });
}

// 찜하기 비교하기 클릭 로깅
export function logFavoritesCompareClick(productIds: string[]): void {
  sendLogEvent('favorites_compare_clicked', {
    comparisonData: {
      source: 'home',
      productIds,
      actionType: 'compare_clicked',
    },
  });
}

// 비교 채팅 로깅
export function logComparisonChat(
  source: 'home' | 'result',
  productIds: string[],
  userMessage: string,
  aiResponse?: string
): void {
  sendLogEvent('comparison_chat_message', {
    comparisonData: {
      source,
      productIds,
      actionType: 'chat_message',
      userMessage,
      aiResponse,
    },
  });
}

// 비교표 제품 액션 로깅 (쿠팡, 최저가, 질문하기)
export function logComparisonProductAction(
  source: 'home' | 'result',
  actionType: 'coupang_clicked' | 'lowest_price_clicked' | 'product_chat_clicked',
  productId: string,
  productTitle: string,
  productIds?: string[]
): void {
  sendLogEvent('comparison_product_action', {
    comparisonData: {
      source,
      actionType,
      productId,
      productTitle,
      productIds,
    },
  });
}

// ============ V2 Flow Logging Functions ============

// 카테고리 선택 로깅
export function logCategorySelection(
  category: string,
  categoryLabel: string
): void {
  sendLogEvent('category_selected', {
    page: 'categories',
    categoryData: {
      category,
      categoryLabel,
    },
  });
}

// 앵커 제품 선택 로깅
export function logAnchorProductSelection(
  productId: string,
  productTitle: string,
  category: string,
  ranking: number,
  brand?: string,
  model?: string
): void {
  sendLogEvent('anchor_product_selected', {
    page: 'anchor',
    anchorData: {
      productId,
      productTitle,
      category,
      ranking,
      brand,
      model,
      action: 'selected',
    },
  });
}

// 앵커 제품 변경 로깅
export function logAnchorProductChange(
  productId: string,
  productTitle: string,
  category: string,
  ranking: number,
  searchKeyword?: string
): void {
  sendLogEvent('anchor_product_changed', {
    page: 'anchor',
    anchorData: {
      productId,
      productTitle,
      category,
      ranking,
      action: searchKeyword ? 'search_used' : 'changed',
      searchKeyword,
    },
  });
}

// 태그 선택 로깅
export function logTagSelection(
  tagText: string,
  tagType: 'pros' | 'cons',
  step: 1 | 2 | 3,
  category: string,
  tagId?: string,
  mentionCount?: number,
  isCustom?: boolean,
  relatedAttributes?: Array<{ attribute: string; weight: number }>
): void {
  sendLogEvent('tag_selected', {
    page: 'tags',
    tagData: {
      tagId,
      tagText,
      tagType,
      step,
      mentionCount,
      isCustom,
      category,
      relatedAttributes,
    },
  });
}

// 커스텀 태그 생성 로깅
export function logCustomTagCreation(
  tagText: string,
  tagType: 'pros' | 'cons',
  category: string,
  relatedAttributes: Array<{ attribute: string; weight: number }>
): void {
  sendLogEvent('custom_tag_created', {
    page: 'tags',
    tagData: {
      tagText,
      tagType,
      step: tagType === 'pros' ? 1 : 2,
      isCustom: true,
      category,
      relatedAttributes,
    },
  });
}

// V2 추천 결과 수신 로깅
export function logResultV2Received(
  category: string,
  anchorProductId: string,
  recommendedProductIds: string[],
  selectedProsTags: string[],
  selectedConsTags: string[],
  budget: string,
  fitScores?: number[]
): void {
  sendLogEvent('result_v2_received', {
    page: 'result-v2',
    resultV2Data: {
      category,
      anchorProductId,
      recommendedProductIds,
      selectedProsTags,
      selectedConsTags,
      budget,
      fitScores,
      isRegeneration: false,
    },
  });
}

// V2 추천 재생성 로깅 (앵커 변경)
export function logResultV2Regeneration(
  category: string,
  newAnchorProductId: string,
  previousAnchorId: string,
  recommendedProductIds: string[],
  selectedProsTags: string[],
  selectedConsTags: string[],
  budget: string,
  fitScores?: number[]
): void {
  sendLogEvent('result_v2_regenerated', {
    page: 'result-v2',
    resultV2Data: {
      category,
      anchorProductId: newAnchorProductId,
      recommendedProductIds,
      selectedProsTags,
      selectedConsTags,
      budget,
      fitScores,
      isRegeneration: true,
      previousAnchorId,
    },
  });
}

// ============ V2 New Flow Logging Functions (recommend-v2 페이지) ============

// recommend-v2 페이지 진입 로깅
export function logV2PageView(
  category: string,
  categoryName: string
): void {
  sendLogEvent('v2_page_view', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
    },
  });
}

// 가이드 카드 '시작하기' 클릭
export function logV2GuideStart(
  category: string,
  categoryName: string
): void {
  sendLogEvent('v2_guide_start', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 0,
    },
  });
}

// 하위 카테고리 선택
export function logV2SubCategorySelected(
  category: string,
  categoryName: string,
  subCategoryCode: string,
  subCategoryName: string
): void {
  sendLogEvent('v2_subcategory_selected', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 1,
      subCategory: {
        code: subCategoryCode,
        name: subCategoryName,
      },
    },
  });
}

// 하드필터 개별 질문 답변
export function logV2HardFilterAnswer(
  category: string,
  categoryName: string,
  questionId: string,
  questionText: string,
  questionIndex: number,
  totalQuestions: number,
  selectedValues: string[],
  selectedLabels: string[],
  productCountAfterFilter?: number
): void {
  sendLogEvent('v2_hard_filter_answer', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 1,
      hardFilter: {
        questionId,
        questionText,
        questionIndex,
        totalQuestions,
        selectedValues,
        selectedLabels,
        productCountAfterFilter,
      },
    },
  });
}

// 하드필터 직접 입력
export function logV2HardFilterCustomInput(
  category: string,
  categoryName: string,
  questionId: string,
  questionText: string,
  questionIndex: number,
  totalQuestions: number,
  customInputText: string
): void {
  sendLogEvent('v2_hard_filter_custom_input', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 1,
      hardFilter: {
        questionId,
        questionText,
        questionIndex,
        totalQuestions,
        selectedValues: [],
        selectedLabels: [],
        isCustomInput: true,
        customInputText,
      },
    },
  });
}

// 하드필터 전체 완료
export function logV2HardFilterCompleted(
  category: string,
  categoryName: string,
  totalQuestions: number,
  totalProductsFiltered: number,
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_hard_filter_completed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 1,
      hardFilter: {
        questionId: 'all',
        questionText: 'completed',
        questionIndex: totalQuestions,
        totalQuestions,
        selectedValues: [],
        selectedLabels: [],
        productCountAfterFilter: totalProductsFiltered,
      },
      elapsedTimeMs,
    },
  });
}

// 조건 분석 완료 화면 조회
export function logV2CheckpointViewed(
  category: string,
  categoryName: string,
  filteredProductCount: number,
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_checkpoint_viewed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 2,
      elapsedTimeMs,
    },
    metadata: {
      filteredProductCount,
    },
  });
}

// 밸런스 게임 개별 선택
export function logV2BalanceSelection(
  category: string,
  categoryName: string,
  questionId: string,
  questionIndex: number,
  totalQuestions: number,
  selectedOption: 'A' | 'B',
  optionALabel: string,
  optionBLabel: string,
  ruleKey: string
): void {
  sendLogEvent('v2_balance_selection', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 3,
      balance: {
        questionId,
        questionIndex,
        totalQuestions,
        selectedOption,
        optionALabel,
        optionBLabel,
        selectedLabel: selectedOption === 'A' ? optionALabel : optionBLabel,
        ruleKey,
      },
    },
  });
}

// 밸런스 게임 완료
export function logV2BalanceCompleted(
  category: string,
  categoryName: string,
  totalSelections: number,
  selectedRuleKeys: string[],
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_balance_completed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 3,
      elapsedTimeMs,
    },
    metadata: {
      totalSelections,
      selectedRuleKeys,
    },
  });
}

// 단점 개별 토글
export function logV2NegativeToggle(
  category: string,
  categoryName: string,
  ruleKey: string,
  label: string,
  isSelected: boolean,
  totalSelected: number
): void {
  sendLogEvent('v2_negative_toggle', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 4,
      negative: {
        ruleKey,
        label,
        isSelected,
        totalSelected,
      },
    },
  });
}

// 피할 단점 완료
export function logV2NegativeCompleted(
  category: string,
  categoryName: string,
  selectedRuleKeys: string[],
  selectedLabels: string[],
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_negative_completed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 4,
      elapsedTimeMs,
    },
    metadata: {
      selectedCount: selectedRuleKeys.length,
      selectedRuleKeys,
      selectedLabels,
    },
  });
}

// 예산 변경 (슬라이더/입력)
export function logV2BudgetChanged(
  category: string,
  categoryName: string,
  min: number,
  max: number,
  isDirectInput: boolean,
  productsInRange?: number
): void {
  sendLogEvent('v2_budget_changed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      budget: {
        min,
        max,
        isDirectInput,
        productsInRange,
      },
    },
  });
}

// 예산 프리셋 버튼 클릭
export function logV2BudgetPresetClicked(
  category: string,
  categoryName: string,
  preset: string, // 가성비/적정가/프리미엄/전체
  min: number,
  max: number,
  productsInRange?: number
): void {
  sendLogEvent('v2_budget_preset_clicked', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      budget: {
        min,
        max,
        preset,
        productsInRange,
      },
    },
  });
}

// 추천받기 버튼 클릭
export function logV2RecommendationRequested(
  category: string,
  categoryName: string,
  budgetMin: number,
  budgetMax: number,
  candidateCount: number,
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_recommendation_requested', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      budget: {
        min: budgetMin,
        max: budgetMax,
      },
      elapsedTimeMs,
    },
    metadata: {
      candidateCount,
    },
  });
}

// 추천 결과 수신
export function logV2RecommendationReceived(
  category: string,
  categoryName: string,
  recommendedProducts: Array<{
    pcode: string;
    title: string;
    brand?: string;
    rank: number;
    price?: number;
    score?: number;
    tags?: string[]; // 매칭된 규칙들 (matchedRules)
    reason?: string; // 제품별 추천 이유 (recommendationReason)
  }>,
  selectionReason: string | undefined,
  totalCandidates: number,
  processingTimeMs?: number,
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
  }>
): void {
  sendLogEvent('v2_recommendation_received', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      recommendation: {
        recommendedProducts,
        selectionReason,
        totalCandidates,
        processingTimeMs,
        highlightedReviews,
      },
    },
  });
}

// 제품 상세 모달 열기
export function logV2ProductModalOpened(
  category: string,
  categoryName: string,
  pcode: string,
  title: string,
  brand: string | undefined,
  rank: number
): void {
  sendLogEvent('v2_product_modal_opened', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      productModal: {
        pcode,
        title,
        brand,
        rank,
      },
    },
  });
}

// 다나와 가격 링크 클릭
export function logV2DanawaPriceClicked(
  category: string,
  categoryName: string,
  pcode: string,
  mall: string,
  price: number,
  isLowestPrice: boolean
): void {
  sendLogEvent('v2_danawa_price_clicked', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      danawaClick: {
        pcode,
        mall,
        price,
        isLowestPrice,
      },
    },
  });
}

// 판매처 더보기/접기
export function logV2SellersToggle(
  category: string,
  categoryName: string,
  pcode: string,
  action: 'expand' | 'collapse'
): void {
  sendLogEvent('v2_sellers_toggle', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
    },
    metadata: {
      pcode,
      action,
    },
  });
}

// 찜하기 토글
export function logV2FavoriteToggled(
  category: string,
  categoryName: string,
  pcode: string,
  title: string,
  action: 'add' | 'remove'
): void {
  sendLogEvent('v2_favorite_toggled', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      favorite: {
        pcode,
        title,
        action,
      },
    },
  });
}

// 최저가로 구매하기 클릭
export function logV2LowestPriceClicked(
  category: string,
  categoryName: string,
  pcode: string,
  mall: string,
  price: number
): void {
  sendLogEvent('v2_lowest_price_clicked', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      danawaClick: {
        pcode,
        mall,
        price,
        isLowestPrice: true,
      },
    },
  });
}

// 이전 단계로 돌아가기
export function logV2StepBack(
  category: string,
  categoryName: string,
  fromStep: number,
  toStep: number
): void {
  sendLogEvent('v2_step_back', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      stepTransition: {
        fromStep,
        toStep,
        direction: 'back',
      },
    },
  });
}

// ============ 추가 상세 로깅 함수들 ============

// 찜하기 페이지에서 '최저가로 구매하기' 클릭
export function logFavoriteLowestPriceClick(
  productId: string,
  productTitle: string,
  brand: string | undefined,
  price: number,
  mall: string
): void {
  sendLogEvent('favorite_lowest_price_clicked', {
    page: 'favorites',
    favoriteData: {
      productId,
      productTitle,
      brand,
      action: 'lowest_price_click',
    },
    purchaseData: {
      price,
      mall,
    },
  });
}

// 카테고리 페이지 연령대 태그 선택
export function logAgeBadgeSelection(
  ageBadge: string,
  category: string
): void {
  sendLogEvent('age_badge_selected', {
    page: 'categories-v2',
    categoryData: {
      ageBadge,
      category,
    },
  });
}

// 가이드 카드 탭 선택 (주요 구매포인트/불만포인트)
export function logGuideCardTabSelection(
  category: string,
  categoryName: string,
  tab: 'pros' | 'cons',
  tabLabel: string
): void {
  sendLogEvent('guide_card_tab_selected', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      guideCard: {
        selectedTab: tab,
        tabLabel,
      },
    },
  });
}

// 가이드 카드 토글 열기/닫기
export function logGuideCardToggle(
  category: string,
  categoryName: string,
  toggleType: 'pros' | 'cons',
  isOpen: boolean
): void {
  const toggleLabel = toggleType === 'pros' ? '구매 포인트' : '불만 포인트';
  sendLogEvent('guide_card_toggle', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      guideCard: {
        toggleType,
        toggleLabel,
        isOpen,
        action: isOpen ? 'expand' : 'collapse',
      },
    },
  });
}

// 체크포인트 상세 로깅 (후보 개수, 해설 텍스트)
export function logV2CheckpointViewedDetailed(
  category: string,
  categoryName: string,
  totalProductCount: number,
  filteredProductCount: number,
  summaryText: string,
  conditions: Array<{ label: string; value: string }>,
  elapsedTimeMs?: number
): void {
  sendLogEvent('v2_checkpoint_viewed', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 2,
      checkpoint: {
        totalProductCount,
        filteredProductCount,
        summaryText,
        conditions,
      },
      elapsedTimeMs,
    },
  });
}

// 프로덕트 모달에서 쇼핑몰 링크 클릭 (가격 포함)
export function logProductModalPurchaseClick(
  productId: string,
  productTitle: string,
  mall: string,
  price: number,
  isLowestPrice: boolean,
  page: string
): void {
  sendLogEvent('product_modal_purchase_clicked', {
    page,
    productData: {
      productId,
      productTitle,
    },
    purchaseData: {
      mall,
      price,
      isLowestPrice,
    },
  });
}

// 비교표 상세보기 클릭 (상세 정보 포함)
export function logComparisonDetailViewClick(
  productId: string,
  productTitle: string,
  brand: string | undefined,
  rank: number,
  page: string
): void {
  sendLogEvent('comparison_detail_view_clicked', {
    page,
    productData: {
      productId,
      productTitle,
      brand,
      rank,
    },
  });
}

// 추천 결과 상세 로깅 (개별 상품 태그, 설명 포함)
export function logV2RecommendationReceivedDetailed(
  category: string,
  categoryName: string,
  recommendedProducts: Array<{
    pcode: string;
    title: string;
    brand?: string;
    rank: number;
    price?: number;
    score?: number;
    tags?: string[];
    reason?: string;
    matchedRules?: string[];
  }>,
  selectionReason: string | undefined,
  totalCandidates: number,
  budgetFiltered: number,
  userSelections: {
    hardFilterAnswers?: Record<string, string[]>;
    balanceSelections?: string[];
    negativeSelections?: string[];
    budget?: { min: number; max: number };
  },
  processingTimeMs?: number
): void {
  sendLogEvent('v2_recommendation_received', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      recommendation: {
        recommendedProducts,
        selectionReason,
        totalCandidates,
        budgetFiltered,
        processingTimeMs,
      },
    },
    userSelections,
  });
}

// 밸런스 게임 스킵 로깅
export function logV2BalanceSkipped(
  category: string,
  categoryName: string,
  questionId: string,
  questionIndex: number,
  totalQuestions: number,
  optionALabel: string,
  optionBLabel: string
): void {
  sendLogEvent('v2_balance_skipped', {
    page: 'recommend-v2',
    v2FlowData: {
      category,
      categoryName,
      step: 3,
      balance: {
        questionId,
        questionIndex,
        totalQuestions,
        selectedOption: 'skipped',
        optionALabel,
        optionBLabel,
        selectedLabel: '잘 모르겠어요',
        ruleKey: '',
      },
    },
  });
}

// 다시 추천받기 모달 열기 로깅
export function logV2ReRecommendModalOpened(
  category: string,
  categoryName: string
): void {
  sendLogEvent('v2_re_recommend_modal_opened', {
    page: 'recommend-v2',
    buttonLabel: '다시 추천받기',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      reRecommend: {
        action: 'modal_opened',
      },
    },
  });
}

// 같은 카테고리 다시 추천받기 로깅
export function logV2ReRecommendSameCategory(
  category: string,
  categoryName: string
): void {
  sendLogEvent('v2_re_recommend_same_category', {
    page: 'recommend-v2',
    buttonLabel: `${categoryName} 다시 추천받기`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      reRecommend: {
        action: 'same_category',
        targetCategory: category,
        targetCategoryName: categoryName,
      },
    },
  });
}

// 다른 카테고리 추천받기 로깅
export function logV2ReRecommendDifferentCategory(
  fromCategory: string,
  fromCategoryName: string
): void {
  sendLogEvent('v2_re_recommend_different_category', {
    page: 'recommend-v2',
    buttonLabel: '다른 카테고리 추천받기',
    v2FlowData: {
      category: fromCategory,
      categoryName: fromCategoryName,
      step: 5,
      reRecommend: {
        action: 'different_category',
        fromCategory,
        fromCategoryName,
      },
    },
  });
}

// ============================================
// 새로운 기능 로깅 함수들
// ============================================

// 1. AI 헬퍼 버튼 클릭 ("뭘 고를지 모르겠어요")
export function logAIHelperButtonClicked(
  questionType: 'hard_filter' | 'balance_game' | 'negative' | 'budget' | 'category_selection',
  questionId: string,
  questionText: string,
  category: string,
  categoryName: string,
  step?: number
): void {
  // 질문 텍스트 길이 제한
  const shortQuestion = questionText.length > 30 ? questionText.substring(0, 30) + '...' : questionText;

  sendLogEvent('ai_helper_clicked', {
    page: 'recommend-v2',
    buttonLabel: `💚 AI 도움: "${shortQuestion}"`,
    v2FlowData: {
      category,
      categoryName,
      step,
    },
    aiHelperData: {
      questionType,
      questionId,
      questionText,
    },
  });
}

// 2. 예시 질문 클릭
export function logExampleQuestionClicked(
  questionType: 'hard_filter' | 'balance_game' | 'negative' | 'budget' | 'category_selection',
  questionId: string,
  exampleText: string,
  exampleIndex: number,
  category: string,
  categoryName: string
): void {
  // 예시 텍스트 길이 제한 (상세 컬럼에 표시용)
  const shortText = exampleText.length > 40 ? exampleText.substring(0, 40) + '...' : exampleText;

  sendLogEvent('example_question_clicked', {
    page: 'recommend-v2',
    buttonLabel: `예시 질문: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
    },
    aiHelperData: {
      questionType,
      questionId,
      questionText: '',
      exampleText,
    },
  });
}

// 3. 예시 질문 적용
export function logExampleQuestionApplied(
  questionType: 'hard_filter' | 'balance_game' | 'negative' | 'budget' | 'category_selection',
  questionId: string,
  exampleText: string,
  selectedOptions: string[],
  selectedLabels: string[],
  category: string,
  categoryName: string
): void {
  // 선택된 옵션들을 상세 컬럼에 표시
  const labelsText = selectedLabels.slice(0, 3).join(', ') + (selectedLabels.length > 3 ? '...' : '');

  sendLogEvent('example_question_applied', {
    page: 'recommend-v2',
    buttonLabel: `AI 추천 적용: ${labelsText} (${selectedLabels.length}개)`,
    v2FlowData: {
      category,
      categoryName,
    },
    aiHelperData: {
      questionType,
      questionId,
      questionText: '',
      exampleText,
      selectedOptions,
      selectedLabels,
    },
  });
}

// 4. 리뷰 탭 열기
export function logReviewTabOpened(
  pcode: string,
  productTitle: string,
  tabType: 'reviews' | 'insights' | 'real_reviews',
  category: string,
  categoryName: string,
  brand?: string,
  rank?: number,
  page?: string
): void {
  sendLogEvent('review_tab_opened', {
    page: page || 'recommend-v2',
    buttonLabel: `리뷰 탭: ${tabType}`,
    v2FlowData: {
      category,
      categoryName,
    },
    reviewData: {
      pcode,
      productTitle,
      brand,
      tabType,
      rank,
    },
  });
}

// 5. 체감속성 상세 보기
export function logCriteriaDetailViewed(
  criteriaId: string,
  criteriaName: string,
  pcode: string,
  productTitle: string,
  mentionCount: number,
  category: string,
  categoryName: string
): void {
  sendLogEvent('criteria_detail_viewed', {
    page: 'recommend-v2',
    buttonLabel: `체감속성 상세: ${criteriaName}`,
    v2FlowData: {
      category,
      categoryName,
    },
    reviewData: {
      pcode,
      productTitle,
      tabType: 'insights',
      criteriaId,
      criteriaName,
      mentionCount,
    },
  });
}

// 6. 구매 기준 펼치기/접기
export function logPurchaseCriteriaExpanded(
  page: 'result' | 'result-v2',
  criteriaCount: number,
  isExpanded: boolean,
  criteriaType: 'priority' | 'reason',
  expandedCriteria?: string[]
): void {
  sendLogEvent('criteria_detail_viewed', {
    page,
    buttonLabel: isExpanded ? '내 구매 기준 펼치기' : '내 구매 기준 접기',
    purchaseCriteriaData: {
      page,
      criteriaCount,
      isExpanded,
      criteriaType,
      expandedCriteria,
    },
  });
}

// 7. 자연어 입력 로깅
export function logNaturalLanguageInput(
  page: 'priority' | 'tags' | 'recommend-v2',
  currentStep: number,
  userInput: string,
  parsedResult?: {
    prioritySettings?: Record<string, string>;
    budget?: { min: number; max: number };
    selectedTags?: string[];
  },
  category?: string,
  categoryName?: string
): void {
  // 입력 내용 길이 제한
  const shortInput = userInput.length > 40 ? userInput.substring(0, 40) + '...' : userInput;

  sendLogEvent('user_input', {
    page,
    userInput,
    buttonLabel: `자연어 입력: "${shortInput}"`,
    v2FlowData: category ? {
      category,
      categoryName: categoryName || '',
      step: currentStep,
    } : undefined,
    metadata: {
      parsedResult,
      inputLength: userInput.length,
      currentStep,
    },
  });
}

// ============================================
// Step -1 (ContextInput) 로깅 함수들
// ============================================

// 8. 컨텍스트 입력 예시 칩 클릭
export function logContextInputExampleClick(
  category: string,
  categoryName: string,
  exampleText: string,
  exampleIndex: number
): void {
  const shortText = exampleText.length > 40 ? exampleText.substring(0, 40) + '...' : exampleText;

  sendLogEvent('context_input_example_clicked', {
    page: 'recommend-v2',
    buttonLabel: `예시 클릭: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: -1,
    },
    metadata: {
      exampleText,
      exampleIndex,
    },
  });
}

// 9. 컨텍스트 입력 제출 (자연어 입력)
export function logContextInputSubmit(
  category: string,
  categoryName: string,
  inputText: string
): void {
  const shortText = inputText.length > 40 ? inputText.substring(0, 40) + '...' : inputText;

  sendLogEvent('context_input_submitted', {
    page: 'recommend-v2',
    userInput: inputText,
    buttonLabel: `컨텍스트 입력: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: -1,
    },
    metadata: {
      inputLength: inputText.length,
    },
  });
}

// 10. 컨텍스트 입력 버튼 클릭 (추천받기 시작 / 건너뛰기)
export function logContextInputButtonClick(
  category: string,
  categoryName: string,
  buttonType: 'start' | 'skip',
  inputText?: string
): void {
  const buttonLabel = buttonType === 'start' ? '추천받기 시작' : '잘 모르겠어요 (건너뛰기)';

  sendLogEvent('context_input_button_clicked', {
    page: 'recommend-v2',
    buttonLabel,
    v2FlowData: {
      category,
      categoryName,
      step: -1,
    },
    metadata: {
      buttonType,
      hasInput: !!inputText,
      inputLength: inputText?.length || 0,
    },
  });
}

// ============================================
// 직접 입력 (DirectInput) 로깅 함수들
// ============================================

// 11. 직접 입력 등록 (하드필터/단점 필터)
export function logDirectInputRegister(
  category: string,
  categoryName: string,
  filterType: 'hard_filter' | 'negative_filter',
  inputText: string,
  questionId?: string,
  step?: number,
  currentSelectionCount?: number
): void {
  const shortText = inputText.length > 40 ? inputText.substring(0, 40) + '...' : inputText;
  const filterLabel = filterType === 'hard_filter' ? '하드필터' : '단점필터';

  sendLogEvent('direct_input_registered', {
    page: 'recommend-v2',
    userInput: inputText,
    buttonLabel: `${filterLabel} 직접입력: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: step ?? (filterType === 'hard_filter' ? 1 : 4),
    },
    metadata: {
      filterType,
      questionId,
      inputLength: inputText.length,
      inputText,
      currentSelectionCount: currentSelectionCount ?? 0,
      isDirectInput: true,
    },
  });
}

// 12. 직접 추가 버튼 클릭 (편집 모드 진입)
export function logDirectInputButtonClick(
  category: string,
  categoryName: string,
  filterType: 'hard_filter' | 'negative_filter',
  questionId?: string,
  step?: number
): void {
  const filterLabel = filterType === 'hard_filter' ? '하드필터' : '단점필터';

  sendLogEvent('direct_input_button_clicked', {
    page: 'recommend-v2',
    buttonLabel: `${filterLabel} 직접 추가 클릭`,
    v2FlowData: {
      category,
      categoryName,
      step: step ?? (filterType === 'hard_filter' ? 1 : 4),
    },
    metadata: {
      filterType,
      questionId,
    },
  });
}

// ============================================
// Followup Carousel (추가 질문) 로깅 함수들
// ============================================

// 13. 추가 질문 응답 로깅
export function logFollowupQuestionAnswer(
  category: string,
  categoryName: string,
  questionId: string,
  questionTitle: string,
  selectedValue: string,
  selectedLabel: string,
  questionIndex: number,
  totalQuestions: number,
  isOther: boolean = false
): void {
  const shortLabel = selectedLabel.length > 30 ? selectedLabel.substring(0, 30) + '...' : selectedLabel;

  sendLogEvent('followup_question_answered', {
    page: 'recommend-v2',
    buttonLabel: `추가질문 ${questionIndex + 1}/${totalQuestions}: ${shortLabel}`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
    },
    metadata: {
      followup: {
        questionId,
        questionTitle,
        selectedValue,
        selectedLabel,
        questionIndex,
        totalQuestions,
        isOther,
      },
    },
  });
}

// 14. 추가 질문 직접 입력 로깅
export function logFollowupQuestionOtherInput(
  category: string,
  categoryName: string,
  questionId: string,
  questionTitle: string,
  otherText: string,
  questionIndex: number,
  totalQuestions: number
): void {
  const shortText = otherText.length > 30 ? otherText.substring(0, 30) + '...' : otherText;

  sendLogEvent('followup_question_other_input', {
    page: 'recommend-v2',
    userInput: otherText,
    buttonLabel: `추가질문 ${questionIndex + 1} 직접입력: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
    },
    metadata: {
      followup: {
        questionId,
        questionTitle,
        otherText,
        questionIndex,
        totalQuestions,
        isOther: true,
      },
    },
  });
}

// 15. 마지막 자연어 추가조건 입력 로깅
export function logFinalNaturalInput(
  category: string,
  categoryName: string,
  inputText: string
): void {
  const shortText = inputText.length > 40 ? inputText.substring(0, 40) + '...' : inputText;

  sendLogEvent('final_natural_input_submitted', {
    page: 'recommend-v2',
    userInput: inputText,
    buttonLabel: `마지막 자연어 입력: "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
    },
    metadata: {
      inputLength: inputText.length,
      inputText,
    },
  });
}

// 16. 건너뛰고 바로 추천받기 버튼 클릭
export function logSkipToRecommendation(
  category: string,
  categoryName: string,
  skippedFrom: 'question' | 'natural_input',
  currentQuestionIndex?: number,
  totalQuestions?: number
): void {
  sendLogEvent('skip_to_recommendation_clicked', {
    page: 'recommend-v2',
    buttonLabel: skippedFrom === 'natural_input'
      ? '건너뛰고 바로 추천받기'
      : `추가질문 ${(currentQuestionIndex ?? 0) + 1} 건너뛰기`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
    },
    metadata: {
      skippedFrom,
      currentQuestionIndex,
      totalQuestions,
    },
  });
}

// 17. 자연어 입력 후 추천받기 버튼 클릭
export function logRecommendWithNaturalInput(
  category: string,
  categoryName: string,
  naturalInput: string,
  followupAnswers: Array<{ questionId: string; answer: string; isOther: boolean }>
): void {
  const shortText = naturalInput.length > 40 ? naturalInput.substring(0, 40) + '...' : naturalInput;

  sendLogEvent('recommend_with_natural_input_clicked', {
    page: 'recommend-v2',
    userInput: naturalInput,
    buttonLabel: `추천받기 (자연어 입력): "${shortText}"`,
    v2FlowData: {
      category,
      categoryName,
      step: 5,
    },
    metadata: {
      naturalInput,
      followupAnswersCount: followupAnswers.length,
      followupAnswers,
    },
  });
}

// ============================================
// Result Chat (추천 결과 채팅) 로깅 함수들
// ============================================

// 18. 결과 페이지 채팅 메시지 로깅 (사용자 + AI 응답)
export function logResultChatMessage(
  category: string,
  categoryName: string,
  userMessage: string,
  aiResponse: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  responseType?: 'answer' | 're-recommendation'
): void {
  const shortUserMsg = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;

  sendLogEvent('result_chat_message', {
    page: 'result',
    userInput: userMessage,
    aiResponse: aiResponse,
    buttonLabel: `결과 채팅: "${shortUserMsg}"`,
    v2FlowData: {
      category,
      categoryName,
    },
    metadata: {
      userMessage,
      aiResponse,
      responseType,
      chatHistoryLength: chatHistory.length,
      fullChatHistory: chatHistory,
    },
  });
}

// 19. 결과 페이지 채팅 전체 대화 내역 로깅 (세션 종료 시 또는 페이지 이탈 시)
export function logResultChatFullHistory(
  category: string,
  categoryName: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  productPcodes: string[]
): void {
  sendLogEvent('result_chat_full_history', {
    page: 'result',
    buttonLabel: `결과 채팅 전체 내역 (${chatHistory.length}개 메시지)`,
    v2FlowData: {
      category,
      categoryName,
    },
    metadata: {
      totalMessages: chatHistory.length,
      userMessages: chatHistory.filter(m => m.role === 'user').length,
      assistantMessages: chatHistory.filter(m => m.role === 'assistant').length,
      productPcodes,
      fullChatHistory: chatHistory,
    },
  });
}

// 20. 정확한 예산 범위로 추천받기 버튼 클릭
export function logV2BudgetRestrictClicked(
  category: string,
  categoryName: string,
  budgetMin: number,
  budgetMax: number
): void {
  sendLogEvent('v2_budget_restrict_clicked', {
    page: 'recommend-v2',
    buttonLabel: '정확한 예산 범위로 추천받기',
    v2FlowData: {
      category,
      categoryName,
      step: 5,
      budget: {
        min: budgetMin,
        max: budgetMax,
      },
    },
  });
}
