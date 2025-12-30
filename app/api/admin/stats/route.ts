// 새로운 UTM 기반 퍼널 통계 API
import { NextRequest, NextResponse } from 'next/server';
import { getRecentEvents, groupEventsBySession } from '@/lib/logging/query';
import type {
  CampaignFunnelStats,
  FunnelStep,
  SessionSummary,
  ProductRecommendationRanking,
  V2FunnelStats,
  CategoryAnalytics,
  V2ProductRecommendationRanking,
  V2NewFlowFunnelStats,
  V2NewFlowCategoryAnalytics,
  PostRecommendationAction
} from '@/types/logging';

// 테스트/내부 IP 및 Phone 필터링
const EXCLUDED_IPS = ['::1', '211.53.92.162', '::ffff:172.16.230.123'];
const EXCLUDED_PHONES = ['01088143142'];

function shouldExcludeSession(session: SessionSummary): boolean {
  const isExcludedIp = EXCLUDED_IPS.includes(session.ip || '');
  const isExcludedPhone = EXCLUDED_PHONES.includes(session.phone || '');
  return isExcludedIp || isExcludedPhone;
}

// 퍼널 단계별 계산 (홈 페이지뷰 기준)
function calculateFunnelStep(count: number, homeCount: number): FunnelStep {
  return {
    count,
    percentage: homeCount > 0 ? Math.round((count / homeCount) * 100) : 0
  };
}

// 제품별 추천 통계 계산
function calculateProductRecommendationRankings(sessions: SessionSummary[]): ProductRecommendationRanking[] {
  const productMap = new Map<string, {
    productTitle: string;
    rank1Count: number;
    rank2Count: number;
    rank3Count: number;
  }>();

  sessions.forEach(session => {
    session.events.forEach(event => {
      if (event.eventType === 'recommendation_received' && event.recommendations?.fullReport?.recommendations) {
        const recommendations = event.recommendations.fullReport.recommendations;

        recommendations.forEach(rec => {
          const { productId, productTitle, rank } = rec;

          if (!productMap.has(productId)) {
            productMap.set(productId, {
              productTitle: productTitle || productId,
              rank1Count: 0,
              rank2Count: 0,
              rank3Count: 0,
            });
          }

          const stats = productMap.get(productId)!;
          if (rank === 1) stats.rank1Count++;
          else if (rank === 2) stats.rank2Count++;
          else if (rank === 3) stats.rank3Count++;
        });
      }
    });
  });

  // Map을 배열로 변환하고 총 추천 횟수로 정렬
  const rankings: ProductRecommendationRanking[] = Array.from(productMap.entries()).map(([productId, stats]) => ({
    productId,
    productTitle: stats.productTitle,
    totalRecommendations: stats.rank1Count + stats.rank2Count + stats.rank3Count,
    rank1Count: stats.rank1Count,
    rank2Count: stats.rank2Count,
    rank3Count: stats.rank3Count,
  }));

  // 총 추천 횟수로 내림차순 정렬
  rankings.sort((a, b) => b.totalRecommendations - a.totalRecommendations);

  return rankings;
}

// V2 Flow: UTM 캠페인별로 퍼널 통계 계산 (페이지 방문 필터 기준)
function calculateV2CampaignFunnel(sessions: SessionSummary[], utmCampaign: string): V2FunnelStats {
  // UTM 필터링
  const filteredSessions = sessions.filter(session => {
    if (utmCampaign === 'all') return true;
    if (utmCampaign === 'none') return !session.utmCampaign;
    return session.utmCampaign === utmCampaign;
  });

  // 퍼널 단계별 카운트 (페이지 방문 기준 = journey 포함 여부)
  const homePageViews = new Set<string>(); // 전체 세션 (baseline)
  const categoriesEntry = new Set<string>(); // journey에 'categories' 포함
  const tagsEntry = new Set<string>(); // journey에 'tags' 포함
  const resultV2Received = new Set<string>(); // journey에 'result-v2' 또는 'result' 포함

  // Pre-recommendation actions
  let anchorGuideOpenedTotal = 0;
  let anchorSearchUsedTotal = 0;
  const anchorGuideOpenedSessions = new Set<string>();
  const anchorSearchUsedSessions = new Set<string>();

  // Post-recommendation actions
  let coupangClickedTotal = 0;
  let anchorRegeneratedTotal = 0;
  let comparisonViewedTotal = 0;
  const coupangClickedSessions = new Set<string>();
  const anchorRegeneratedSessions = new Set<string>();
  const comparisonViewedSessions = new Set<string>();

  filteredSessions.forEach(session => {
    const sid = session.sessionId;

    // 홈 뷰: 모든 세션 (baseline = 100%)
    homePageViews.add(sid);

    // 카테고리뷰: journey에 'categories' 포함
    if (session.journey.includes('categories')) {
      categoriesEntry.add(sid);
    }

    // 추천 뷰 (태그 선택): journey에 'tags' 포함
    if (session.journey.includes('tags')) {
      tagsEntry.add(sid);
    }

    // 완료 뷰: journey에 'result-v2' 또는 'result' 포함
    if (session.journey.includes('result-v2') || session.journey.includes('result')) {
      resultV2Received.add(sid);
    }

    // Pre/Post recommendation actions (기존 로직 유지)
    session.events.forEach(event => {
      // Pre-recommendation actions
      if (event.eventType === 'button_click' && event.page === 'anchor') {
        if (event.buttonLabel?.includes('가이드')) {
          anchorGuideOpenedTotal++;
          anchorGuideOpenedSessions.add(sid);
        }
      }
      if (event.eventType === 'anchor_product_changed' && event.anchorData?.action === 'search_used') {
        anchorSearchUsedTotal++;
        anchorSearchUsedSessions.add(sid);
      }

      // Post-recommendation actions
      if (event.eventType === 'button_click' && event.page === 'result-v2' && event.buttonLabel?.includes('쿠팡')) {
        coupangClickedTotal++;
        coupangClickedSessions.add(sid);
      }
      if (event.eventType === 'result_v2_regenerated') {
        anchorRegeneratedTotal++;
        anchorRegeneratedSessions.add(sid);
      }
      if (event.eventType === 'button_click' && event.buttonLabel?.includes('비교')) {
        comparisonViewedTotal++;
        comparisonViewedSessions.add(sid);
      }
    });
  });

  const homeCount = homePageViews.size;

  return {
    utmCampaign,
    totalSessions: filteredSessions.length,
    funnel: {
      homePageViews: { count: homeCount, percentage: 100 },
      categoriesEntry: calculateFunnelStep(categoriesEntry.size, homeCount),
      tagsEntry: calculateFunnelStep(tagsEntry.size, homeCount),
      resultV2Received: calculateFunnelStep(resultV2Received.size, homeCount),
      preRecommendationActions: {
        anchorGuideOpened: {
          total: anchorGuideOpenedTotal,
          unique: anchorGuideOpenedSessions.size
        },
        anchorSearchUsed: {
          total: anchorSearchUsedTotal,
          unique: anchorSearchUsedSessions.size
        }
      },
      postRecommendationActions: {
        coupangClicked: {
          total: coupangClickedTotal,
          unique: coupangClickedSessions.size
        },
        anchorRegenerated: {
          total: anchorRegeneratedTotal,
          unique: anchorRegeneratedSessions.size
        },
        comparisonViewed: {
          total: comparisonViewedTotal,
          unique: comparisonViewedSessions.size
        }
      }
    }
  };
}

// V2 Flow: 카테고리별 분석
function calculateCategoryAnalytics(sessions: SessionSummary[]): CategoryAnalytics[] {
  const categoryMap = new Map<string, {
    categoryLabel: string;
    sessions: Set<string>;
    completed: Set<string>;
    anchors: Map<string, { title: string; count: number }>;
    prosTags: Map<string, number>;
    consTags: Map<string, number>;
    budgets: Map<string, number>;
    customTagCount: number;
    timestamps: Map<string, { start: number; end?: number }>;
  }>();

  sessions.forEach(session => {
    session.events.forEach(event => {
      // Category selection
      if (event.eventType === 'category_selected' && event.categoryData) {
        const { category, categoryLabel } = event.categoryData;
        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            categoryLabel,
            sessions: new Set(),
            completed: new Set(),
            anchors: new Map(),
            prosTags: new Map(),
            consTags: new Map(),
            budgets: new Map(),
            customTagCount: 0,
            timestamps: new Map()
          });
        }
        const data = categoryMap.get(category)!;
        data.sessions.add(session.sessionId);
        data.timestamps.set(session.sessionId, { start: new Date(event.timestamp).getTime() });
      }

      // Anchor product selection
      if (event.eventType === 'anchor_product_selected' && event.anchorData) {
        const { category, productId, productTitle } = event.anchorData;
        const data = categoryMap.get(category);
        if (data) {
          const anchor = data.anchors.get(productId) || { title: productTitle, count: 0 };
          anchor.count++;
          data.anchors.set(productId, anchor);
        }
      }

      // Tag selections
      if (event.eventType === 'tag_selected' && event.tagData) {
        const { category, tagText, tagType } = event.tagData;
        const data = categoryMap.get(category);
        if (data) {
          if (tagType === 'pros') {
            data.prosTags.set(tagText, (data.prosTags.get(tagText) || 0) + 1);
          } else {
            data.consTags.set(tagText, (data.consTags.get(tagText) || 0) + 1);
          }
        }
      }

      // Custom tag creation
      if (event.eventType === 'custom_tag_created' && event.tagData) {
        const { category } = event.tagData;
        const data = categoryMap.get(category);
        if (data) {
          data.customTagCount++;
        }
      }

      // Result v2 received (completion)
      if (event.eventType === 'result_v2_received' && event.resultV2Data) {
        const { category, budget } = event.resultV2Data;
        const data = categoryMap.get(category);
        if (data) {
          data.completed.add(session.sessionId);
          data.budgets.set(budget, (data.budgets.get(budget) || 0) + 1);
          const ts = data.timestamps.get(session.sessionId);
          if (ts) {
            ts.end = new Date(event.timestamp).getTime();
          }
        }
      }
    });
  });

  // Convert to analytics array
  const analytics: CategoryAnalytics[] = [];
  for (const [category, data] of categoryMap.entries()) {
    const totalSessions = data.sessions.size;
    const completedSessions = data.completed.size;

    // Calculate average time to completion
    let totalTime = 0;
    let completedCount = 0;
    for (const ts of data.timestamps.values()) {
      if (ts.end) {
        totalTime += (ts.end - ts.start) / 1000; // seconds
        completedCount++;
      }
    }
    const avgTime = completedCount > 0 ? Math.round(totalTime / completedCount) : undefined;

    // Top anchors
    const popularAnchors = Array.from(data.anchors.entries())
      .map(([productId, { title, count }]) => ({
        productId,
        productTitle: title,
        selectionCount: count,
        percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
      }))
      .sort((a, b) => b.selectionCount - a.selectionCount)
      .slice(0, 5);

    // Top pros tags
    const popularProsTags = Array.from(data.prosTags.entries())
      .map(([tagText, count]) => ({
        tagText,
        selectionCount: count,
        percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
      }))
      .sort((a, b) => b.selectionCount - a.selectionCount)
      .slice(0, 10);

    // Top cons tags
    const popularConsTags = Array.from(data.consTags.entries())
      .map(([tagText, count]) => ({
        tagText,
        selectionCount: count,
        percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
      }))
      .sort((a, b) => b.selectionCount - a.selectionCount)
      .slice(0, 10);

    // Budget distribution
    const budgetDistribution = Array.from(data.budgets.entries())
      .map(([budgetRange, count]) => ({
        budgetRange,
        count,
        percentage: completedSessions > 0 ? Math.round((count / completedSessions) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    analytics.push({
      category,
      categoryLabel: data.categoryLabel,
      totalSessions,
      completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
      avgTimeToCompletion: avgTime,
      popularAnchorProducts: popularAnchors,
      popularProsTags,
      popularConsTags,
      budgetDistribution,
      customTagCreationRate: totalSessions > 0 ? Math.round((data.customTagCount / totalSessions) * 100) : 0
    });
  }

  // Sort by total sessions (most popular first)
  analytics.sort((a, b) => b.totalSessions - a.totalSessions);

  return analytics;
}

// ============================================================
// V2 NEW FLOW (recommend-v2 with hard filters, balance game)
// ============================================================

// V2 New Flow: 퍼널 통계 계산
function calculateV2NewFlowFunnel(sessions: SessionSummary[], utmCampaign: string): V2NewFlowFunnelStats {
  // UTM 필터링
  const filteredSessions = sessions.filter(session => {
    if (utmCampaign === 'all') return true;
    if (utmCampaign === 'none') return !session.utmCampaign;
    return session.utmCampaign === utmCampaign;
  });

  // 퍼널 단계별 세션 Set
  const homePageViews = new Set<string>();
  const categoriesV2Entry = new Set<string>();
  const carouselDirectEntry = new Set<string>(); // 캐러셀에서 직접 recommend-v2 진입
  const recommendV2Entry = new Set<string>();
  const guideStartClicked = new Set<string>();
  const subCategorySelected = new Set<string>();
  const hardFilterCompleted = new Set<string>();
  const checkpointViewed = new Set<string>();
  const balanceCompleted = new Set<string>();
  const negativeCompleted = new Set<string>();
  const budgetConfirmed = new Set<string>();
  const recommendationReceived = new Set<string>();

  // 하드필터 질문별 이탈 추적
  const hardFilterQuestionStats = new Map<string, {
    questionText: string;
    enteredSessions: Set<string>;
    completedSessions: Set<string>;
  }>();

  // 단계별 타임스탬프 (소요시간 계산용)
  const sessionTimestamps = new Map<string, {
    guideStart?: number;
    hardFilterComplete?: number;
    checkpointView?: number;
    balanceComplete?: number;
    negativeComplete?: number;
    budgetConfirm?: number;
    recommendationReceive?: number;
  }>();

  // 결과 페이지 액션
  let productModalOpenedTotal = 0;
  let danawaPriceClickedTotal = 0;
  let sellersToggledTotal = 0;
  let favoriteToggledTotal = 0;
  let lowestPriceClickedTotal = 0;
  const productModalOpenedSessions = new Set<string>();
  const danawaPriceClickedSessions = new Set<string>();
  const sellersToggledSessions = new Set<string>();
  const favoriteToggledSessions = new Set<string>();
  const lowestPriceClickedSessions = new Set<string>();

  // 직접 입력 사용률
  let hardFilterCustomInputTotal = 0;
  let budgetDirectInputTotal = 0;
  const hardFilterCustomInputSessions = new Set<string>();
  const budgetDirectInputSessions = new Set<string>();

  // AI 도움 요청 사용률
  let aiHelperTotalRequests = 0;
  let aiHelperHardFilterTotal = 0;
  let aiHelperBalanceTotal = 0;
  let aiHelperNegativeTotal = 0;
  let aiHelperBudgetTotal = 0;
  const aiHelperTotalSessions = new Set<string>();
  const aiHelperHardFilterSessions = new Set<string>();
  const aiHelperBalanceSessions = new Set<string>();
  const aiHelperNegativeSessions = new Set<string>();
  const aiHelperBudgetSessions = new Set<string>();

  filteredSessions.forEach(session => {
    const sid = session.sessionId;
    const timestamps: typeof sessionTimestamps extends Map<string, infer T> ? T : never = {};

    // 모든 세션은 홈 방문으로 간주
    homePageViews.add(sid);

    session.events.forEach(event => {
      const eventType = event.eventType;
      const v2Data = event.v2FlowData;
      const ts = new Date(event.timestamp).getTime();

      // Step 2a: categories-v2 페이지 방문 (버튼 클릭 → categories-v2)
      if (eventType === 'page_view' && event.page === 'categories-v2') {
        categoriesV2Entry.add(sid);
      }

      // Step 2b: 캐러셀에서 직접 recommend-v2 진입 (홈에서 카테고리 캐러셀 클릭)
      if (eventType === 'button_click' && event.page === 'home' && event.buttonLabel?.includes('카테고리_캐러셀_클릭')) {
        carouselDirectEntry.add(sid);
      }

      // Step 3: recommend-v2 페이지 진입 (총합)
      if (eventType === 'v2_page_view' && v2Data) {
        recommendV2Entry.add(sid);
      }

      // Step 4: 가이드 카드 '시작하기' 클릭
      if (eventType === 'v2_guide_start') {
        guideStartClicked.add(sid);
        timestamps.guideStart = ts;
      }

      // Step 5: 하위 카테고리 선택
      if (eventType === 'v2_subcategory_selected') {
        subCategorySelected.add(sid);
      }

      // 하드필터 개별 질문 답변 (이탈 추적용)
      if (eventType === 'v2_hard_filter_answer' && v2Data?.hardFilter) {
        const { questionId, questionText } = v2Data.hardFilter;
        if (!hardFilterQuestionStats.has(questionId)) {
          hardFilterQuestionStats.set(questionId, {
            questionText: questionText || questionId,
            enteredSessions: new Set(),
            completedSessions: new Set(),
          });
        }
        const stats = hardFilterQuestionStats.get(questionId)!;
        stats.enteredSessions.add(sid);
        stats.completedSessions.add(sid); // 답변하면 완료
      }

      // Step 6: 하드필터 완료
      if (eventType === 'v2_hard_filter_completed') {
        hardFilterCompleted.add(sid);
        timestamps.hardFilterComplete = ts;
      }

      // Step 7: 조건 분석 완료 화면
      if (eventType === 'v2_checkpoint_viewed') {
        checkpointViewed.add(sid);
        timestamps.checkpointView = ts;
      }

      // Step 8: 밸런스 게임 완료
      if (eventType === 'v2_balance_completed') {
        balanceCompleted.add(sid);
        timestamps.balanceComplete = ts;
      }

      // Step 9: 피할 단점 완료
      if (eventType === 'v2_negative_completed') {
        negativeCompleted.add(sid);
        timestamps.negativeComplete = ts;
      }

      // Step 10: 예산 설정 완료 (추천받기 클릭)
      if (eventType === 'v2_recommendation_requested') {
        budgetConfirmed.add(sid);
        timestamps.budgetConfirm = ts;
      }

      // Step 11: 추천 결과 수신
      if (eventType === 'v2_recommendation_received') {
        recommendationReceived.add(sid);
        timestamps.recommendationReceive = ts;
      }

      // 결과 페이지 액션
      if (eventType === 'v2_product_modal_opened') {
        productModalOpenedTotal++;
        productModalOpenedSessions.add(sid);
      }
      if (eventType === 'v2_danawa_price_clicked') {
        danawaPriceClickedTotal++;
        danawaPriceClickedSessions.add(sid);
      }
      if (eventType === 'v2_sellers_toggle') {
        sellersToggledTotal++;
        sellersToggledSessions.add(sid);
      }
      if (eventType === 'v2_favorite_toggled') {
        favoriteToggledTotal++;
        favoriteToggledSessions.add(sid);
      }
      if (eventType === 'v2_lowest_price_clicked') {
        lowestPriceClickedTotal++;
        lowestPriceClickedSessions.add(sid);
      }
      // Also track from button_click events in product-modal
      if (eventType === 'button_click' && event.page === 'product-modal') {
        const label = event.buttonLabel || '';
        if (label.includes('바로가기') || label.includes('최저가')) {
          danawaPriceClickedTotal++;
          danawaPriceClickedSessions.add(sid);
        }
        if (label.includes('판매처 더보기') || label.includes('판매처 접기')) {
          sellersToggledTotal++;
          sellersToggledSessions.add(sid);
        }
        if (label.includes('찜하기') || label.includes('찜 취소')) {
          favoriteToggledTotal++;
          favoriteToggledSessions.add(sid);
        }
        if (label.includes('최저가로 구매하기')) {
          lowestPriceClickedTotal++;
          lowestPriceClickedSessions.add(sid);
        }
      }

      // 직접 입력 사용
      if (eventType === 'v2_hard_filter_custom_input') {
        hardFilterCustomInputTotal++;
        hardFilterCustomInputSessions.add(sid);
      }
      if (eventType === 'v2_budget_changed' && v2Data?.budget?.isDirectInput) {
        budgetDirectInputTotal++;
        budgetDirectInputSessions.add(sid);
      }

      // AI 도움 요청 카운팅
      if (eventType === 'ai_helper_clicked' && 'aiHelperData' in event && event.aiHelperData) {
        aiHelperTotalRequests++;
        aiHelperTotalSessions.add(sid);

        // 질문 타입별로 분류
        const questionType = event.aiHelperData.questionType;
        if (questionType === 'hard_filter') {
          aiHelperHardFilterTotal++;
          aiHelperHardFilterSessions.add(sid);
        } else if (questionType === 'balance_game') {
          aiHelperBalanceTotal++;
          aiHelperBalanceSessions.add(sid);
        } else if (questionType === 'negative') {
          aiHelperNegativeTotal++;
          aiHelperNegativeSessions.add(sid);
        } else if (questionType === 'budget') {
          aiHelperBudgetTotal++;
          aiHelperBudgetSessions.add(sid);
        }
      }
    });

    sessionTimestamps.set(sid, timestamps);
  });

  const homeCount = homePageViews.size;

  // 하드필터 질문별 이탈률 계산
  const hardFilterDropoff = Array.from(hardFilterQuestionStats.entries())
    .map(([questionId, stats], index) => ({
      questionIndex: index,
      questionId,
      questionText: stats.questionText,
      enteredCount: stats.enteredSessions.size,
      completedCount: stats.completedSessions.size,
      dropoffRate: stats.enteredSessions.size > 0
        ? Math.round((1 - stats.completedSessions.size / stats.enteredSessions.size) * 100)
        : 0
    }));

  // 단계별 평균 소요 시간 계산
  const timeDiffs = {
    guideToHardFilter: [] as number[],
    hardFilterToCheckpoint: [] as number[],
    checkpointToBalance: [] as number[],
    balanceToNegative: [] as number[],
    negativeTobudget: [] as number[],
    budgetToResult: [] as number[],
    total: [] as number[],
  };

  sessionTimestamps.forEach(ts => {
    if (ts.guideStart && ts.hardFilterComplete) {
      timeDiffs.guideToHardFilter.push((ts.hardFilterComplete - ts.guideStart) / 1000);
    }
    if (ts.hardFilterComplete && ts.checkpointView) {
      timeDiffs.hardFilterToCheckpoint.push((ts.checkpointView - ts.hardFilterComplete) / 1000);
    }
    if (ts.checkpointView && ts.balanceComplete) {
      timeDiffs.checkpointToBalance.push((ts.balanceComplete - ts.checkpointView) / 1000);
    }
    if (ts.balanceComplete && ts.negativeComplete) {
      timeDiffs.balanceToNegative.push((ts.negativeComplete - ts.balanceComplete) / 1000);
    }
    if (ts.negativeComplete && ts.budgetConfirm) {
      timeDiffs.negativeTobudget.push((ts.budgetConfirm - ts.negativeComplete) / 1000);
    }
    if (ts.budgetConfirm && ts.recommendationReceive) {
      timeDiffs.budgetToResult.push((ts.recommendationReceive - ts.budgetConfirm) / 1000);
    }
    if (ts.guideStart && ts.recommendationReceive) {
      timeDiffs.total.push((ts.recommendationReceive - ts.guideStart) / 1000);
    }
  });

  const avgTime = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  return {
    utmCampaign,
    totalSessions: filteredSessions.length,
    funnel: {
      homePageViews: { count: homeCount, percentage: 100 },
      categoriesV2Entry: calculateFunnelStep(categoriesV2Entry.size, homeCount),
      carouselDirectEntry: calculateFunnelStep(carouselDirectEntry.size, homeCount),
      recommendV2Entry: calculateFunnelStep(recommendV2Entry.size, homeCount),
      guideStartClicked: calculateFunnelStep(guideStartClicked.size, homeCount),
      subCategorySelected: calculateFunnelStep(subCategorySelected.size, homeCount),
      hardFilterCompleted: calculateFunnelStep(hardFilterCompleted.size, homeCount),
      checkpointViewed: calculateFunnelStep(checkpointViewed.size, homeCount),
      balanceCompleted: calculateFunnelStep(balanceCompleted.size, homeCount),
      negativeCompleted: calculateFunnelStep(negativeCompleted.size, homeCount),
      budgetConfirmed: calculateFunnelStep(budgetConfirmed.size, homeCount),
      recommendationReceived: calculateFunnelStep(recommendationReceived.size, homeCount),
    },
    hardFilterDropoff,
    avgTimePerStep: {
      guideToHardFilter: avgTime(timeDiffs.guideToHardFilter),
      hardFilterToCheckpoint: avgTime(timeDiffs.hardFilterToCheckpoint),
      checkpointToBalance: avgTime(timeDiffs.checkpointToBalance),
      balanceToNegative: avgTime(timeDiffs.balanceToNegative),
      negativeTobudget: avgTime(timeDiffs.negativeTobudget),
      budgetToResult: avgTime(timeDiffs.budgetToResult),
      totalTime: avgTime(timeDiffs.total),
    },
    resultPageActions: {
      productModalOpened: { total: productModalOpenedTotal, unique: productModalOpenedSessions.size },
      danawaPriceClicked: { total: danawaPriceClickedTotal, unique: danawaPriceClickedSessions.size },
      sellersToggled: { total: sellersToggledTotal, unique: sellersToggledSessions.size },
      favoriteToggled: { total: favoriteToggledTotal, unique: favoriteToggledSessions.size },
      lowestPriceClicked: { total: lowestPriceClickedTotal, unique: lowestPriceClickedSessions.size },
    },
    customInputUsage: {
      hardFilterCustomInput: { total: hardFilterCustomInputTotal, unique: hardFilterCustomInputSessions.size },
      budgetDirectInput: { total: budgetDirectInputTotal, unique: budgetDirectInputSessions.size },
    },
    aiHelperUsage: {
      totalRequests: { total: aiHelperTotalRequests, unique: aiHelperTotalSessions.size },
      hardFilterHelp: { total: aiHelperHardFilterTotal, unique: aiHelperHardFilterSessions.size },
      balanceGameHelp: { total: aiHelperBalanceTotal, unique: aiHelperBalanceSessions.size },
      negativeHelp: { total: aiHelperNegativeTotal, unique: aiHelperNegativeSessions.size },
      budgetHelp: { total: aiHelperBudgetTotal, unique: aiHelperBudgetSessions.size },
    },
  };
}

// V2 New Flow: 카테고리별 분석
function calculateV2NewFlowCategoryAnalytics(sessions: SessionSummary[]): V2NewFlowCategoryAnalytics[] {
  const categoryMap = new Map<string, {
    categoryName: string;
    sessions: Set<string>;
    completedSessions: Set<string>;
    timestamps: Map<string, { start?: number; end?: number }>;
    stepReached: Map<string, number>; // step name -> count
    hardFilterSelections: Map<string, Map<string, { label: string; count: number }>>; // questionId -> value -> {label, count}
    balanceSelections: Map<string, Map<'A' | 'B', { label: string; count: number }>>; // questionId -> A/B -> {label, count}
    negativeSelections: Map<string, { label: string; count: number }>; // ruleKey -> {label, count}
    budgetPresets: Map<string, number>; // preset -> count
    recommendedProducts: Map<string, { title: string; brand?: string; rank1Count: number; rank2Count: number; rank3Count: number }>; // pcode -> stats
  }>();

  sessions.forEach(session => {
    const sid = session.sessionId;

    session.events.forEach(event => {
      const eventType = event.eventType;
      const v2Data = event.v2FlowData;
      const ts = new Date(event.timestamp).getTime();

      // recommend-v2 페이지 진입 시 카테고리 추적 시작
      if (eventType === 'v2_page_view' && v2Data?.category) {
        const { category, categoryName } = v2Data;
        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            categoryName: categoryName || category,
            sessions: new Set(),
            completedSessions: new Set(),
            timestamps: new Map(),
            stepReached: new Map(),
            hardFilterSelections: new Map(),
            balanceSelections: new Map(),
            negativeSelections: new Map(),
            budgetPresets: new Map(),
            recommendedProducts: new Map(),
          });
        }
        const data = categoryMap.get(category)!;
        data.sessions.add(sid);
        data.timestamps.set(sid, { start: ts });
      }

      // 각 이벤트에서 카테고리 정보가 있으면 해당 카테고리 통계 업데이트
      if (v2Data?.category) {
        const data = categoryMap.get(v2Data.category);
        if (!data) return;

        // 단계별 도달 추적
        if (eventType === 'v2_guide_start') {
          data.stepReached.set('guideStart', (data.stepReached.get('guideStart') || 0) + 1);
        }
        if (eventType === 'v2_subcategory_selected') {
          data.stepReached.set('subCategory', (data.stepReached.get('subCategory') || 0) + 1);
        }
        if (eventType === 'v2_hard_filter_completed') {
          data.stepReached.set('hardFilter', (data.stepReached.get('hardFilter') || 0) + 1);
        }
        if (eventType === 'v2_checkpoint_viewed') {
          data.stepReached.set('checkpoint', (data.stepReached.get('checkpoint') || 0) + 1);
        }
        if (eventType === 'v2_balance_completed') {
          data.stepReached.set('balance', (data.stepReached.get('balance') || 0) + 1);
        }
        if (eventType === 'v2_negative_completed') {
          data.stepReached.set('negative', (data.stepReached.get('negative') || 0) + 1);
        }
        if (eventType === 'v2_recommendation_requested') {
          data.stepReached.set('budget', (data.stepReached.get('budget') || 0) + 1);
        }

        // 하드필터 선택 통계
        if (eventType === 'v2_hard_filter_answer' && v2Data.hardFilter) {
          const { questionId, selectedValues, selectedLabels } = v2Data.hardFilter;
          if (!data.hardFilterSelections.has(questionId)) {
            data.hardFilterSelections.set(questionId, new Map());
          }
          const questionStats = data.hardFilterSelections.get(questionId)!;
          selectedValues?.forEach((value, i) => {
            const label = selectedLabels?.[i] || value;
            const existing = questionStats.get(value) || { label, count: 0 };
            existing.count++;
            questionStats.set(value, existing);
          });
        }

        // 밸런스 게임 선택 통계
        if (eventType === 'v2_balance_selection' && v2Data.balance) {
          const { questionId, selectedOption, optionALabel, optionBLabel } = v2Data.balance;
          if (!data.balanceSelections.has(questionId)) {
            data.balanceSelections.set(questionId, new Map());
          }
          const questionStats = data.balanceSelections.get(questionId)!;
          const label = selectedOption === 'A' ? optionALabel : optionBLabel;
          const existing = questionStats.get(selectedOption) || { label: label || '', count: 0 };
          existing.count++;
          questionStats.set(selectedOption, existing);
        }

        // 피할 단점 통계
        if (eventType === 'v2_negative_toggle' && v2Data.negative) {
          const { ruleKey, label, isSelected } = v2Data.negative;
          if (isSelected) {
            const existing = data.negativeSelections.get(ruleKey) || { label: label || ruleKey, count: 0 };
            existing.count++;
            data.negativeSelections.set(ruleKey, existing);
          }
        }

        // 예산 프리셋 통계
        if (eventType === 'v2_budget_preset_clicked' && v2Data.budget) {
          const { preset } = v2Data.budget;
          if (preset) {
            data.budgetPresets.set(preset, (data.budgetPresets.get(preset) || 0) + 1);
          }
        }

        // 완료 추적 및 추천 상품 통계
        if (eventType === 'v2_recommendation_received' && v2Data.recommendation) {
          data.completedSessions.add(sid);
          const timestamp = data.timestamps.get(sid);
          if (timestamp) {
            timestamp.end = ts;
          }

          // 추천 상품 통계
          v2Data.recommendation.recommendedProducts?.forEach((p) => {
            const existing = data.recommendedProducts.get(p.pcode) || {
              title: p.title,
              brand: p.brand,
              rank1Count: 0,
              rank2Count: 0,
              rank3Count: 0,
            };
            if (p.rank === 1) existing.rank1Count++;
            else if (p.rank === 2) existing.rank2Count++;
            else if (p.rank === 3) existing.rank3Count++;
            data.recommendedProducts.set(p.pcode, existing);
          });
        }
      }
    });
  });

  // 분석 결과 생성
  const analytics: V2NewFlowCategoryAnalytics[] = [];

  categoryMap.forEach((data, category) => {
    const totalSessions = data.sessions.size;
    const completedSessions = data.completedSessions.size;

    // 평균 소요 시간 계산
    let totalTime = 0;
    let completedCount = 0;
    data.timestamps.forEach(ts => {
      if (ts.start && ts.end) {
        totalTime += (ts.end - ts.start) / 1000;
        completedCount++;
      }
    });
    const avgTime = completedCount > 0 ? Math.round(totalTime / completedCount) : 0;

    // 단계별 이탈률 계산
    const getDropoff = (step: string, prevCount: number) => {
      const count = data.stepReached.get(step) || 0;
      return prevCount > 0 ? Math.round((1 - count / prevCount) * 100) : 0;
    };

    // 인기 하드필터 선택
    const popularHardFilters: V2NewFlowCategoryAnalytics['popularSelections']['hardFilters'] = [];
    data.hardFilterSelections.forEach((valueMap, questionId) => {
      valueMap.forEach((stats, value) => {
        popularHardFilters.push({
          questionId,
          value,
          label: stats.label,
          count: stats.count,
          percentage: totalSessions > 0 ? Math.round((stats.count / totalSessions) * 100) : 0,
        });
      });
    });
    popularHardFilters.sort((a, b) => b.count - a.count);

    // 인기 밸런스 선택
    const popularBalanceChoices: V2NewFlowCategoryAnalytics['popularSelections']['balanceChoices'] = [];
    data.balanceSelections.forEach((optionMap, questionId) => {
      optionMap.forEach((stats, option) => {
        popularBalanceChoices.push({
          questionId,
          selectedOption: option,
          label: stats.label,
          count: stats.count,
          percentage: totalSessions > 0 ? Math.round((stats.count / totalSessions) * 100) : 0,
        });
      });
    });
    popularBalanceChoices.sort((a, b) => b.count - a.count);

    // 인기 피할 단점 선택
    const popularNegativeChoices: V2NewFlowCategoryAnalytics['popularSelections']['negativeChoices'] = [];
    data.negativeSelections.forEach((stats, ruleKey) => {
      popularNegativeChoices.push({
        ruleKey,
        label: stats.label,
        count: stats.count,
        percentage: totalSessions > 0 ? Math.round((stats.count / totalSessions) * 100) : 0,
      });
    });
    popularNegativeChoices.sort((a, b) => b.count - a.count);

    // 예산 프리셋 분포
    const budgetPresets: V2NewFlowCategoryAnalytics['popularSelections']['budgetPresets'] = [];
    data.budgetPresets.forEach((count, preset) => {
      budgetPresets.push({
        preset,
        count,
        percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
      });
    });
    budgetPresets.sort((a, b) => b.count - a.count);

    analytics.push({
      category,
      categoryName: data.categoryName,
      totalSessions,
      completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
      avgTotalTimeSeconds: avgTime,
      stepDropoffRates: {
        guideStart: getDropoff('guideStart', totalSessions),
        subCategory: getDropoff('subCategory', data.stepReached.get('guideStart') || totalSessions),
        hardFilter: getDropoff('hardFilter', data.stepReached.get('subCategory') || data.stepReached.get('guideStart') || totalSessions),
        checkpoint: getDropoff('checkpoint', data.stepReached.get('hardFilter') || totalSessions),
        balance: getDropoff('balance', data.stepReached.get('checkpoint') || totalSessions),
        negative: getDropoff('negative', data.stepReached.get('balance') || totalSessions),
        budget: getDropoff('budget', data.stepReached.get('negative') || totalSessions),
      },
      popularSelections: {
        hardFilters: popularHardFilters.slice(0, 15),
        balanceChoices: popularBalanceChoices.slice(0, 10),
        negativeChoices: popularNegativeChoices.slice(0, 10),
        budgetPresets,
      },
      recommendedProducts: Array.from(data.recommendedProducts.entries())
        .map(([pcode, stats]) => ({
          pcode,
          title: stats.title,
          brand: stats.brand,
          totalRecommendations: stats.rank1Count + stats.rank2Count + stats.rank3Count,
          rank1Count: stats.rank1Count,
          rank2Count: stats.rank2Count,
          rank3Count: stats.rank3Count,
        }))
        .sort((a, b) => b.totalRecommendations - a.totalRecommendations)
        .slice(0, 20),
    });
  });

  // 세션 수로 정렬
  analytics.sort((a, b) => b.totalSessions - a.totalSessions);

  return analytics;
}

// V2 Flow: 제품별 추천 통계
function calculateV2ProductRankings(sessions: SessionSummary[]): V2ProductRecommendationRanking[] {
  const productMap = new Map<string, {
    category: string;
    productTitle: string;
    rank1Count: number;
    rank2Count: number;
    rank3Count: number;
    fitScores: number[];
  }>();

  sessions.forEach(session => {
    session.events.forEach(event => {
      if (event.eventType === 'result_v2_received' && event.resultV2Data) {
        const { category, recommendedProductIds, fitScores } = event.resultV2Data;

        recommendedProductIds.forEach((productId, index) => {
          const rank = index + 1;
          const fitScore = fitScores?.[index];

          if (!productMap.has(productId)) {
            productMap.set(productId, {
              category,
              productTitle: productId, // Would need to fetch actual title
              rank1Count: 0,
              rank2Count: 0,
              rank3Count: 0,
              fitScores: []
            });
          }

          const stats = productMap.get(productId)!;
          if (rank === 1) stats.rank1Count++;
          else if (rank === 2) stats.rank2Count++;
          else if (rank === 3) stats.rank3Count++;

          if (fitScore !== undefined) {
            stats.fitScores.push(fitScore);
          }
        });
      }
    });
  });

  // Convert to rankings array
  const rankings: V2ProductRecommendationRanking[] = Array.from(productMap.entries()).map(([productId, stats]) => {
    const avgFitScore = stats.fitScores.length > 0
      ? stats.fitScores.reduce((sum, score) => sum + score, 0) / stats.fitScores.length
      : undefined;

    return {
      category: stats.category,
      productId,
      productTitle: stats.productTitle,
      totalRecommendations: stats.rank1Count + stats.rank2Count + stats.rank3Count,
      rank1Count: stats.rank1Count,
      rank2Count: stats.rank2Count,
      rank3Count: stats.rank3Count,
      avgFitScore: avgFitScore ? Math.round(avgFitScore * 10) / 10 : undefined
    };
  });

  // Sort by total recommendations
  rankings.sort((a, b) => b.totalRecommendations - a.totalRecommendations);

  return rankings;
}

// UTM 캠페인별로 퍼널 통계 계산
function calculateCampaignFunnel(sessions: SessionSummary[], utmCampaign: string): CampaignFunnelStats {
  // UTM 필터링 (이미 고유한 세션들)
  const filteredSessions = sessions.filter(session => {
    if (utmCampaign === 'all') return true;
    if (utmCampaign === 'none') return !session.utmCampaign;
    return session.utmCampaign === utmCampaign;
  });

  const uniqueSessions = filteredSessions;

  // 퍼널 단계별 카운트
  const homePageViews = new Set<string>(); // 홈 페이지뷰 세션 ID
  const priorityEntry = new Set<string>();
  const prosTagsSelected = new Set<string>();
  const consTagsSelected = new Set<string>();
  const additionalSelected = new Set<string>();
  const budgetSelected = new Set<string>();
  const recommendationReceived = new Set<string>();

  // Pre-recommendation actions (총 클릭 횟수)
  let guideOpenedTotal = 0;
  let rankingTabClickedTotal = 0;

  // Pre-recommendation actions (유니크 세션)
  const guideOpenedSessions = new Set<string>();
  const rankingTabClickedSessions = new Set<string>();

  // Post-recommendation actions (총 클릭 횟수)
  let productChatClickedTotal = 0;
  let recommendationReasonViewedTotal = 0;
  let purchaseCriteriaViewedTotal = 0;
  let coupangClickedTotal = 0;
  let lowestPriceClickedTotal = 0;
  let comparisonTabClickedTotal = 0;
  let comparisonChatUsedTotal = 0;

  // Post-recommendation actions (유니크 세션)
  const productChatClickedSessions = new Set<string>();
  const recommendationReasonViewedSessions = new Set<string>();
  const purchaseCriteriaViewedSessions = new Set<string>();
  const coupangClickedSessions = new Set<string>();
  const lowestPriceClickedSessions = new Set<string>();
  const comparisonTabClickedSessions = new Set<string>();
  const comparisonChatUsedSessions = new Set<string>();

  uniqueSessions.forEach(session => {
    const sessionId = session.sessionId;

    session.events.forEach(event => {
      const eventType = event.eventType;
      const page = event.page;
      const buttonLabel = event.buttonLabel || '';

      // 1. 홈 페이지뷰 (이벤트 타입 무관하게 page가 'home'이면 카운트)
      if (page === 'home') {
        homePageViews.add(sessionId);
      }

      // 2. Priority 진입 (page === 'priority'인 모든 이벤트)
      if (page === 'priority') {
        priorityEntry.add(sessionId);
      }

      // 3. 장점 태그 선택 (최소 1개 이상)
      if (eventType === 'button_click' && buttonLabel.includes('장점 태그 선택')) {
        prosTagsSelected.add(sessionId);
      }

      // 4. 단점 태그 선택 (최소 1개 이상, 또는 건너뛰기)
      if (eventType === 'button_click' && (buttonLabel.includes('단점 태그 선택') || buttonLabel.includes('Step 2 → Step 3'))) {
        consTagsSelected.add(sessionId);
      }

      // 5. 추가 고려사항 선택 (최소 1개 이상, 또는 건너뛰기)
      if (eventType === 'button_click' && (buttonLabel.includes('추가 고려사항 태그 선택') || buttonLabel.includes('Step 3 → Step 4'))) {
        additionalSelected.add(sessionId);
      }

      // 6. 예산 선택 (최종 단계)
      if (eventType === 'button_click' && buttonLabel.includes('예산 선택')) {
        budgetSelected.add(sessionId);
      }

      // Pre-recommendation actions (Home 및 Priority 페이지)
      if ((page === 'home' || page === 'priority') && eventType === 'button_click') {
        if (buttonLabel.includes('분유포트 1분 가이드 열기') || buttonLabel.includes('구매 1분 가이드')) {
          guideOpenedTotal++;
          guideOpenedSessions.add(sessionId);
        }
        if (buttonLabel.includes('랭킹') && (buttonLabel.includes('클릭') || buttonLabel.includes('보기'))) {
          rankingTabClickedTotal++;
          rankingTabClickedSessions.add(sessionId);
        }
      }

      // Post-recommendation actions (Result 페이지)
      if (page === 'result' && eventType === 'button_click') {
        if (buttonLabel.includes('이 상품 질문하기') || buttonLabel.includes('바텀시트 이 상품 질문하기')) {
          productChatClickedTotal++;
          productChatClickedSessions.add(sessionId);
        }
        if (buttonLabel.includes('추천 이유 보기')) {
          recommendationReasonViewedTotal++;
          recommendationReasonViewedSessions.add(sessionId);
        }
        if (buttonLabel.includes('내 구매 기준 열기')) {
          purchaseCriteriaViewedTotal++;
          purchaseCriteriaViewedSessions.add(sessionId);
        }
        if (buttonLabel.includes('쿠팡에서 보기') || buttonLabel.includes('바텀시트 쿠팡에서 보기')) {
          coupangClickedTotal++;
          coupangClickedSessions.add(sessionId);
        }
        if (buttonLabel.includes('최저가 보기') || buttonLabel.includes('바텀시트 최저가 보기')) {
          lowestPriceClickedTotal++;
          lowestPriceClickedSessions.add(sessionId);
        }
        if (buttonLabel.includes('상세 비교 탭')) {
          comparisonTabClickedTotal++;
          comparisonTabClickedSessions.add(sessionId);
        }
      }

      // 제품 비교 질문하기 (comparison_chat_message)
      if (eventType === 'comparison_chat_message' && event.comparisonData?.source === 'result') {
        comparisonChatUsedTotal++;
        comparisonChatUsedSessions.add(sessionId);
      }
    });

    // 7. Best 3 추천 완료 (초록색 '완료' 태그 = session.completed)
    // Result 페이지 도달 여부로 판단 (관리자 페이지의 '완료' 태그와 일치)
    if (session.completed) {
      recommendationReceived.add(sessionId);
    }
  });

  // 퍼널 계산
  const homeCount = homePageViews.size;
  const priorityCount = priorityEntry.size;
  const prosCount = prosTagsSelected.size;
  const consCount = consTagsSelected.size;
  const additionalCount = additionalSelected.size;
  const budgetCount = budgetSelected.size;
  const recommendationCount = recommendationReceived.size;

  return {
    utmCampaign,
    totalSessions: uniqueSessions.length,
    funnel: {
      homePageViews: { count: homeCount, percentage: 100 }, // 기준점 (항상 100%)
      priorityEntry: calculateFunnelStep(priorityCount, homeCount),
      prosTagsSelected: calculateFunnelStep(prosCount, homeCount),
      consTagsSelected: calculateFunnelStep(consCount, homeCount),
      additionalSelected: calculateFunnelStep(additionalCount, homeCount),
      budgetSelected: calculateFunnelStep(budgetCount, homeCount),
      recommendationReceived: calculateFunnelStep(recommendationCount, homeCount),
      preRecommendationActions: {
        guideOpened: {
          total: guideOpenedTotal,
          unique: guideOpenedSessions.size
        },
        rankingTabClicked: {
          total: rankingTabClickedTotal,
          unique: rankingTabClickedSessions.size
        }
      },
      postRecommendationActions: {
        productChatClicked: {
          total: productChatClickedTotal,
          unique: productChatClickedSessions.size
        },
        recommendationReasonViewed: {
          total: recommendationReasonViewedTotal,
          unique: recommendationReasonViewedSessions.size
        },
        purchaseCriteriaViewed: {
          total: purchaseCriteriaViewedTotal,
          unique: purchaseCriteriaViewedSessions.size
        },
        coupangClicked: {
          total: coupangClickedTotal,
          unique: coupangClickedSessions.size
        },
        lowestPriceClicked: {
          total: lowestPriceClickedTotal,
          unique: lowestPriceClickedSessions.size
        },
        comparisonTabClicked: {
          total: comparisonTabClickedTotal,
          unique: comparisonTabClickedSessions.size
        },
        comparisonChatUsed: {
          total: comparisonChatUsedTotal,
          unique: comparisonChatUsedSessions.size
        }
      }
    }
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('[Stats API] Request received');

    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (password !== '1545') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Stats API] Auth passed, fetching events...');

    // 최근 30일 이벤트 가져오기 (새로운 구조)
    const events = await getRecentEvents(30);
    console.log(`[Stats API] Found ${events.length} events`);

    // 이벤트를 세션별로 그룹화
    const allSessions = groupEventsBySession(events);
    console.log(`[Stats API] Total sessions: ${allSessions.length}`);

    // 테스트 IP/Phone 제외
    const filteredSessions = allSessions.filter(s => !shouldExcludeSession(s));
    console.log(`[Stats API] Filtered sessions (excluding test): ${filteredSessions.length}`);

    // UTM 캠페인 목록 추출
    const utmCampaigns = new Set<string>();
    utmCampaigns.add('all'); // 전체
    let hasNone = false;

    filteredSessions.forEach(session => {
      if (session.utmCampaign) {
        utmCampaigns.add(session.utmCampaign);
      } else {
        hasNone = true;
      }
    });

    if (hasNone) {
      utmCampaigns.add('none'); // UTM 없음
    }

    // UTM별 퍼널 통계 계산
    const campaignStats: CampaignFunnelStats[] = [];
    for (const utmCampaign of Array.from(utmCampaigns)) {
      campaignStats.push(calculateCampaignFunnel(filteredSessions, utmCampaign));
    }

    // 제품별 추천 통계 계산 (Main Flow)
    const productRecommendationRankings = calculateProductRecommendationRankings(filteredSessions);

    // V2 Flow 통계 계산
    const v2CampaignStats: V2FunnelStats[] = [];
    for (const utmCampaign of Array.from(utmCampaigns)) {
      v2CampaignStats.push(calculateV2CampaignFunnel(filteredSessions, utmCampaign));
    }

    const categoryAnalytics = calculateCategoryAnalytics(filteredSessions);
    const v2ProductRankings = calculateV2ProductRankings(filteredSessions);

    // V2 New Flow (recommend-v2 with hard filters, balance game)
    const v2NewFlowCampaignStats: V2NewFlowFunnelStats[] = [];
    for (const utmCampaign of Array.from(utmCampaigns)) {
      v2NewFlowCampaignStats.push(calculateV2NewFlowFunnel(filteredSessions, utmCampaign));
    }
    const v2NewFlowCategoryAnalytics = calculateV2NewFlowCategoryAnalytics(filteredSessions);

    // 응답 반환
    return NextResponse.json({
      // Main Flow (Priority-based)
      mainFlow: {
        campaigns: campaignStats,
        productRecommendationRankings
      },
      // V2 Flow (Category-based, old anchor flow)
      v2Flow: {
        campaigns: v2CampaignStats,
        categoryAnalytics,
        productRecommendationRankings: v2ProductRankings
      },
      // V2 New Flow (recommend-v2 with hard filters, balance game)
      v2NewFlow: {
        campaigns: v2NewFlowCampaignStats,
        categoryAnalytics: v2NewFlowCategoryAnalytics,
      },
      availableCampaigns: Array.from(utmCampaigns)
    });
  } catch (error) {
    console.error('Failed to generate stats:', error);
    return NextResponse.json(
      { error: 'Failed to generate stats' },
      { status: 500 }
    );
  }
}
