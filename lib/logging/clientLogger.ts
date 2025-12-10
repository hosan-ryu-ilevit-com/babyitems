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

// 단점 선택 완료
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
  }>,
  selectionReason: string | undefined,
  totalCandidates: number,
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
        processingTimeMs,
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
