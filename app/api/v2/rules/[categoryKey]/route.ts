/**
 * v2 룰맵 API - 카테고리별 상세 조회
 * GET /api/v2/rules/[categoryKey]
 *
 * category-insights 데이터를 우선 사용하여 가이드 정보를 제공합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import hardFiltersData from '@/data/rules/hard_filters.json';
import { generateHardFiltersForCategory, enhanceHardFilterQuestionsWithLLM } from '@/lib/recommend-v2/danawaFilters';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import type {
  CategoryLogicMap,
  CategoryBalanceGame,
  CategoryNegativeFilter,
  BalanceQuestion,
  NegativeFilterOption,
  FeelAttribute
} from '@/types/rules';
import type { HardFilterQuestion } from '@/types/recommend-v2';

// Guide 정보만 포함하는 새 타입
interface HardFilterGuide {
  guide?: {
    title: string;
    points: string[];
    trend: string;
  };
}

// 가이드 카드용 타입
interface GuideProConItem {
  text: string;
  mentionRate?: number;
  dealBreakerFor?: string;
}

interface GuideTradeoff {
  title: string;
  optionA: string;
  optionB: string;
}

interface CategoryRulesResponse {
  category_key: string;
  category_name: string;
  target_categories: string[];
  logic_map: Record<string, FeelAttribute>;
  balance_game: BalanceQuestion[];
  negative_filter: NegativeFilterOption[];
  hard_filters: {
    guide: {
      title: string;
      summary?: string;
      points: string[];
      trend: string;
      // 새로운 초보 부모 친화적 데이터
      topPros?: GuideProConItem[];
      topCons?: GuideProConItem[];
      keyTradeoff?: GuideTradeoff;
    };
    questions: HardFilterQuestion[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryKey: string }> }
) {
  try {
    const { categoryKey } = await params;

    // Get subCategoryCode from query params (for stroller, car_seat, diaper)
    const { searchParams } = new URL(request.url);
    const subCategoryCode = searchParams.get('subCategoryCode');

    // JSON 데이터 타입 캐스팅
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const balanceGame = balanceGameData as { scenarios: Record<string, CategoryBalanceGame> };
    const negativeFilter = negativeFilterData as { filters: Record<string, CategoryNegativeFilter> };

    // 카테고리 존재 확인
    const categoryLogic = logicMap[categoryKey];
    if (!categoryLogic) {
      return NextResponse.json(
        {
          success: false,
          error: `Category '${categoryKey}' not found`,
          availableCategories: Object.keys(logicMap)
        },
        { status: 404 }
      );
    }

    const categoryBalance = balanceGame.scenarios[categoryKey];
    const categoryNegative = negativeFilter.filters[categoryKey];

    // 가이드 정보: category-insights 우선, hard_filters.json fallback
    const insights = await loadCategoryInsights(categoryKey);
    const hardFilterGuide = (hardFiltersData as Record<string, HardFilterGuide>)[categoryKey];

    // category-insights의 guide 데이터 변환 (초보 부모 친화적 구조 포함)
    let guideData: {
      title: string;
      summary?: string;
      points: string[];
      trend: string;
      topPros?: GuideProConItem[];
      topCons?: GuideProConItem[];
      keyTradeoff?: GuideTradeoff;
    };

    if (insights?.guide) {
      // 기본 가이드 데이터
      guideData = {
        title: insights.guide.title,
        summary: insights.guide.summary || undefined,
        points: insights.guide.key_points || [],
        trend: insights.guide.trend || '',
      };

      // 초보 부모 친화적 데이터 추가 (인사이트에서 추출)
      // Top 3 장점 (mention_rate 높은 순)
      if (insights.pros && insights.pros.length > 0) {
        guideData.topPros = insights.pros.slice(0, 3).map(pro => ({
          text: pro.text,
          mentionRate: pro.mention_rate,
        }));
      }

      // Top 3 단점 (deal_breaker_for가 있는 것 우선)
      if (insights.cons && insights.cons.length > 0) {
        const consWithDealBreaker = insights.cons
          .filter(con => con.deal_breaker_for)
          .slice(0, 3);
        guideData.topCons = consWithDealBreaker.map(con => ({
          text: con.text,
          mentionRate: con.mention_rate,
          dealBreakerFor: con.deal_breaker_for,
        }));
      }

      // 핵심 트레이드오프 (첫 번째)
      if (insights.tradeoffs && insights.tradeoffs.length > 0) {
        const firstTradeoff = insights.tradeoffs[0];
        guideData.keyTradeoff = {
          title: firstTradeoff.title,
          optionA: firstTradeoff.option_a.text,
          optionB: firstTradeoff.option_b.text,
        };
      }
    } else if (hardFilterGuide?.guide) {
      guideData = hardFilterGuide.guide;
    } else {
      guideData = {
        title: `${categoryLogic.category_name} 선택 가이드`,
        points: [],
        trend: '',
      };
    }

    // 하드필터 질문: 다나와 필터 기반 동적 생성 + manual fallback
    // (hard_filters.json의 questions는 제거됨 - 다나와 필터와 중복 방지)
    const targetCategoryCodes = subCategoryCode ? [subCategoryCode] : undefined;
    const dynamicQuestions = await generateHardFiltersForCategory(categoryKey, targetCategoryCodes);

    // LLM으로 질문 텍스트 자연스럽게 변환 (서버에서 미리 생성, 인사이트 포함)
    const insightsForLLM = insights ? {
      pros: insights.pros?.slice(0, 3).map(p => ({ text: p.text, mention_rate: p.mention_rate })),
      cons: insights.cons?.slice(0, 3).map(c => ({ text: c.text, mention_rate: c.mention_rate, deal_breaker_for: c.deal_breaker_for })),
      common_concerns: insights.question_context?.common_concerns,
      decision_factors: insights.question_context?.decision_factors,
    } : undefined;

    const enhancedQuestions = await enhanceHardFilterQuestionsWithLLM(
      dynamicQuestions.slice(0, 5),
      categoryKey,
      categoryLogic.category_name,
      insightsForLLM
    );

    // 응답 구성
    const response: CategoryRulesResponse = {
      category_key: categoryKey,
      category_name: categoryLogic.category_name,
      target_categories: categoryLogic.target_categories,
      logic_map: categoryLogic.rules,
      balance_game: categoryBalance?.questions || [],
      negative_filter: categoryNegative?.options || [],
      hard_filters: {
        guide: guideData,
        questions: enhancedQuestions,
      },
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Category rules API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load category rules' },
      { status: 500 }
    );
  }
}
