// 통계 대시보드 API
import { NextRequest, NextResponse } from 'next/server';
import { getAllLogDates, getLogsByDate } from '@/lib/logging/logger';
import { products } from '@/data/products';
import type {
  DashboardStats,
  ProductClickStats,
  RecommendationStats,
  SessionSummary
} from '@/types/logging';

// 테스트/내부 IP 필터링
const EXCLUDED_IPS = ['::1', '211.53.92.162'];

function shouldExcludeSession(session: SessionSummary): boolean {
  return EXCLUDED_IPS.includes(session.ip || '');
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

    // 모든 세션 수집
    const allSessions: SessionSummary[] = [];

    for (const date of dates) {
      const dailyLog = await getLogsByDate(date);
      if (!dailyLog) continue;

      // 이벤트를 세션별로 그룹화
      const sessionMap = new Map<string, SessionSummary>();

      for (const event of dailyLog.events) {
        const sessionId = event.sessionId;

        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            sessionId,
            firstSeen: event.timestamp,
            lastSeen: event.timestamp,
            ip: event.ip,
            phone: event.phone, // URL 파라미터로 전달된 전화번호
            utmCampaign: event.utmCampaign, // UTM 캠페인 파라미터
            events: [],
            journey: [],
            completed: false,
            recommendationMethods: [],
          });
        }

        const session = sessionMap.get(sessionId)!;
        session.events.push(event);
        session.lastSeen = event.timestamp;

        // phone 업데이트 (이벤트에 phone이 있으면 세션에 반영)
        if (event.phone && !session.phone) {
          session.phone = event.phone;
        }

        // utmCampaign 업데이트 (이벤트에 utmCampaign이 있으면 세션에 반영)
        if (event.utmCampaign && !session.utmCampaign) {
          session.utmCampaign = event.utmCampaign;
        }

        // 페이지 journey 추적
        if (event.eventType === 'page_view' && event.page) {
          if (!session.journey.includes(event.page)) {
            session.journey.push(event.page);
          }
        }

        // result 페이지 도달 여부
        if (event.page === 'result') {
          session.completed = true;
        }

        // 추천 방식 추적
        if (event.eventType === 'button_click') {
          if (event.buttonLabel === '바로 추천받기' && !session.recommendationMethods?.includes('quick')) {
            session.recommendationMethods = session.recommendationMethods || [];
            session.recommendationMethods.push('quick');
          }
          if (event.buttonLabel === '채팅으로 더 자세히 추천받기' && !session.recommendationMethods?.includes('chat')) {
            session.recommendationMethods = session.recommendationMethods || [];
            session.recommendationMethods.push('chat');
          }
        }
      }

      allSessions.push(...Array.from(sessionMap.values()));
    }

    // 테스트 IP 제외
    const filteredSessions = allSessions.filter(s => !shouldExcludeSession(s));

    // 통계 계산
    const stats: DashboardStats = {
      home: {
        totalVisits: 0,
        quickStartClicks: 0,
        rankingPageClicks: 0,
      },
      ranking: {
        totalVisits: 0,
        productClicks: [],
        coupangClicks: 0,
        chatClicks: 0,
      },
      priority: {
        totalVisits: 0,
        quickRecommendations: 0,
        chatRecommendations: 0,
      },
      result: {
        totalVisits: 0,
        recommendations: [],
        detailChatClicks: 0,
        totalCoupangClicks: 0,
        totalProductChatClicks: 0,
      },
    };

    // 상품별 통계 맵
    const rankingProductMap = new Map<string, ProductClickStats>();
    const recommendationProductMap = new Map<string, RecommendationStats>();

    // 세션별로 이벤트 분석
    for (const session of filteredSessions) {
      for (const event of session.events) {
        const page = event.page;
        const eventType = event.eventType;
        const buttonLabel = event.buttonLabel || '';

        // 1. 홈 페이지 통계
        if (page === 'home') {
          if (eventType === 'page_view') {
            stats.home.totalVisits++;
          }
          if (eventType === 'button_click') {
            if (buttonLabel.includes('1분만에 추천받기')) {
              stats.home.quickStartClicks++;
            }
            if (buttonLabel.includes('대표상품 랭킹보기')) {
              stats.home.rankingPageClicks++;
            }
          }
        }

        // 2. 랭킹 페이지 통계 (홈 바텀시트 포함)
        if (page === 'ranking' || page === 'home_bottomsheet') {
          if (eventType === 'page_view' && page === 'ranking') {
            stats.ranking.totalVisits++;
          }
          if (eventType === 'button_click') {
            // 쿠팡에서 보기
            if (buttonLabel.includes('쿠팡에서 보기:')) {
              stats.ranking.coupangClicks++;
              // 상품명 추출
              const productTitle = buttonLabel.replace('쿠팡에서 보기: ', '');
              updateRankingProductStats(rankingProductMap, productTitle, 'coupang');
            }
            // 질문하기
            if (buttonLabel.includes('이 상품 질문하기:')) {
              stats.ranking.chatClicks++;
              const productTitle = buttonLabel.replace('이 상품 질문하기: ', '');
              updateRankingProductStats(rankingProductMap, productTitle, 'chat');
            }
          }
        }

        // 3. Priority 페이지 통계
        if (page === 'priority') {
          if (eventType === 'page_view') {
            stats.priority.totalVisits++;
          }
          if (eventType === 'button_click') {
            if (buttonLabel === '바로 추천받기') {
              stats.priority.quickRecommendations++;
            }
            if (buttonLabel === '채팅으로 더 자세히 추천받기') {
              stats.priority.chatRecommendations++;
            }
          }
        }

        // 4. Result 페이지 통계
        if (page === 'result') {
          if (eventType === 'page_view') {
            stats.result.totalVisits++;
          }

          // 추천 결과 수집
          if (eventType === 'recommendation_received' && event.recommendations) {
            const productIds = event.recommendations.productIds || [];
            const fullReport = event.recommendations.fullReport;

            if (fullReport?.recommendations) {
              for (const rec of fullReport.recommendations) {
                updateRecommendationStats(
                  recommendationProductMap,
                  rec.productId,
                  rec.productTitle,
                  rec.rank
                );
              }
            }
          }

          if (eventType === 'button_click') {
            // 채팅하고 더 정확히 추천받기 (Result 페이지 전용)
            if (
              buttonLabel === '채팅하고 더 정확히 추천받기' ||
              buttonLabel === '채팅받고 추천받기' ||
              (buttonLabel.includes('채팅') && buttonLabel.includes('더 정확히'))
            ) {
              stats.result.detailChatClicks++;
            }

            // 쿠팡에서 보기 (Result 페이지)
            if (buttonLabel.includes('쿠팡에서 보기:') || buttonLabel.includes('바텀시트 쿠팡에서 보기:')) {
              stats.result.totalCoupangClicks++;
              const productTitle = buttonLabel
                .replace('쿠팡에서 보기: ', '')
                .replace('바텀시트 쿠팡에서 보기: ', '');
              updateRecommendationClickStats(recommendationProductMap, productTitle, 'coupang');
            }

            // 질문하기 (Result 페이지)
            if (buttonLabel.includes('이 상품 질문하기:') || buttonLabel.includes('바텀시트 이 상품 질문하기:')) {
              stats.result.totalProductChatClicks++;
              const productTitle = buttonLabel
                .replace('이 상품 질문하기: ', '')
                .replace('바텀시트 이 상품 질문하기: ', '');
              updateRecommendationClickStats(recommendationProductMap, productTitle, 'chat');
            }
          }
        }
      }
    }

    // Map을 배열로 변환 및 랭킹 정보 매핑
    stats.ranking.productClicks = Array.from(rankingProductMap.values())
      .map(product => {
        // 실제 상품 데이터에서 랭킹 찾기
        const actualProduct = products.find(p => p.title === product.productTitle);
        return {
          ...product,
          ranking: actualProduct?.ranking || 0,
        };
      })
      .sort((a, b) => b.totalClicks - a.totalClicks);

    stats.result.recommendations = Array.from(recommendationProductMap.values())
      .sort((a, b) => b.recommendCount - a.recommendCount);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to generate stats:', error);
    return NextResponse.json(
      { error: 'Failed to generate stats' },
      { status: 500 }
    );
  }
}

// 랭킹 페이지 상품 통계 업데이트
function updateRankingProductStats(
  map: Map<string, ProductClickStats>,
  productTitle: string,
  type: 'coupang' | 'chat'
) {
  // 상품 ID 추출 (간단하게 제목으로 매핑)
  const productId = extractProductId(productTitle);

  if (!map.has(productId)) {
    map.set(productId, {
      productId,
      productTitle,
      ranking: 0, // 랭킹은 나중에 매핑
      totalClicks: 0,
      coupangClicks: 0,
      chatClicks: 0,
    });
  }

  const stats = map.get(productId)!;
  stats.totalClicks++;
  if (type === 'coupang') {
    stats.coupangClicks++;
  } else {
    stats.chatClicks++;
  }
}

// 추천 상품 통계 업데이트
function updateRecommendationStats(
  map: Map<string, RecommendationStats>,
  productId: string,
  productTitle: string,
  rank: number
) {
  if (!map.has(productId)) {
    map.set(productId, {
      productId,
      productTitle,
      recommendCount: 0,
      rank1Count: 0,
      rank2Count: 0,
      rank3Count: 0,
      coupangClicks: 0,
      chatClicks: 0,
    });
  }

  const stats = map.get(productId)!;
  stats.recommendCount++;

  if (rank === 1) stats.rank1Count++;
  else if (rank === 2) stats.rank2Count++;
  else if (rank === 3) stats.rank3Count++;
}

// 추천 상품 클릭 통계 업데이트
function updateRecommendationClickStats(
  map: Map<string, RecommendationStats>,
  productTitle: string,
  type: 'coupang' | 'chat'
) {
  // productTitle로 기존 통계 찾기 (정확히 일치하는 것만)
  for (const stats of map.values()) {
    if (stats.productTitle === productTitle) {
      if (type === 'coupang') {
        stats.coupangClicks++;
      } else {
        stats.chatClicks++;
      }
      break; // 첫 번째 매칭만 업데이트
    }
  }

  // 매칭되는 상품이 없는 경우는 추천되지 않은 상품이므로 무시
}

// 상품 ID 추출 (제목 → ID 매핑)
function extractProductId(productTitle: string): string {
  // 간단하게 제목을 ID로 사용 (실제로는 제품 데이터와 매칭 필요)
  return productTitle.split(' ').slice(0, 3).join('-').toLowerCase();
}
