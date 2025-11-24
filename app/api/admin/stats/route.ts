// 새로운 UTM 기반 퍼널 통계 API
import { NextRequest, NextResponse } from 'next/server';
import { getAllLogDates, getLogsByDate } from '@/lib/logging/logger';
import type {
  CampaignFunnelStats,
  FunnelStep,
  SessionSummary
} from '@/types/logging';

// 테스트/내부 IP 필터링
const EXCLUDED_IPS = ['::1', '211.53.92.162', '::ffff:172.16.230.123'];

function shouldExcludeSession(session: SessionSummary): boolean {
  return EXCLUDED_IPS.includes(session.ip || '');
}

// 퍼널 단계별 계산
function calculateFunnelStep(count: number, previousCount: number): FunnelStep {
  return {
    count,
    percentage: previousCount > 0 ? Math.round((count / previousCount) * 100) : 0
  };
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
  const finalInputCompleted = new Set<string>();
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

      // 1. 홈 페이지뷰
      if (page === 'home' && eventType === 'page_view') {
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

      // 6. 예산 선택 (금액 선택 또는 Step 4 → Step 5 버튼 클릭)
      if (eventType === 'button_click' && (buttonLabel.includes('예산 선택') || buttonLabel.includes('Step 4 → Step 5'))) {
        budgetSelected.add(sessionId);
      }

      // 7. 마지막 입력 완료 (Step 5 완료: "없어요" 또는 "추가 입력 제출" 또는 "바로 추천받기")
      if (eventType === 'button_click' && (
        buttonLabel.includes('추가 입력 스킵 (없어요)') ||
        buttonLabel.includes('추가 입력 제출') ||
        buttonLabel.includes('바로 추천받기 (최종)')
      )) {
        finalInputCompleted.add(sessionId);
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

    // 8. Best 3 추천 완료 (초록색 '완료' 태그 = session.completed)
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
  const finalInputCount = finalInputCompleted.size;
  const recommendationCount = recommendationReceived.size;

  return {
    utmCampaign,
    totalSessions: uniqueSessions.length,
    funnel: {
      homePageViews: { count: homeCount, percentage: 100 }, // 기준점
      priorityEntry: calculateFunnelStep(priorityCount, homeCount),
      prosTagsSelected: calculateFunnelStep(prosCount, priorityCount),
      consTagsSelected: calculateFunnelStep(consCount, prosCount),
      additionalSelected: calculateFunnelStep(additionalCount, consCount),
      budgetSelected: calculateFunnelStep(budgetCount, additionalCount),
      finalInputCompleted: calculateFunnelStep(finalInputCount, budgetCount),
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
    // 비밀번호 검증
    const password = request.headers.get('x-admin-password');
    if (password !== '1545') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 모든 날짜의 로그 가져오기
    const dates = await getAllLogDates();

    // 모든 날짜의 세션을 sessionId 기준으로 병합
    const globalSessionMap = new Map<string, SessionSummary>();

    for (const date of dates) {
      const dailyLog = await getLogsByDate(date);
      if (!dailyLog) continue;

      for (const event of dailyLog.events) {
        const sessionId = event.sessionId;

        if (!globalSessionMap.has(sessionId)) {
          globalSessionMap.set(sessionId, {
            sessionId,
            firstSeen: event.timestamp,
            lastSeen: event.timestamp,
            ip: event.ip,
            phone: event.phone,
            utmCampaign: event.utmCampaign,
            events: [],
            journey: [],
            completed: false,
            recommendationMethods: [],
          });
        }

        const session = globalSessionMap.get(sessionId)!;
        session.events.push(event);

        // 타임스탬프 업데이트
        if (event.timestamp < session.firstSeen) {
          session.firstSeen = event.timestamp;
        }
        if (event.timestamp > session.lastSeen) {
          session.lastSeen = event.timestamp;
        }

        // phone 업데이트
        if (event.phone && !session.phone) {
          session.phone = event.phone;
        }

        // utmCampaign 업데이트
        if (event.utmCampaign && !session.utmCampaign) {
          session.utmCampaign = event.utmCampaign;
        }

        // 페이지 journey 추적
        if (event.eventType === 'page_view' && event.page) {
          if (!session.journey.includes(event.page)) {
            session.journey.push(event.page);
          }
        }

        // 추천 완료 여부 (recommendation_received 이벤트 기준)
        if (event.eventType === 'recommendation_received') {
          session.completed = true;
        }
      }
    }

    const allSessions = Array.from(globalSessionMap.values());

    // 테스트 IP 제외
    const filteredSessions = allSessions.filter(s => !shouldExcludeSession(s));

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

    // 응답 반환
    return NextResponse.json({
      campaigns: campaignStats,
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
