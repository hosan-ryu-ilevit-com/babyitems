/**
 * v2 룰맵 API - 카테고리별 상세 조회
 * GET /api/v2/rules/[categoryKey]
 */

import { NextRequest, NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import hardFiltersData from '@/data/rules/hard_filters.json';
import { generateHardFiltersForCategory } from '@/lib/recommend-v2/danawaFilters';
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

interface CategoryRulesResponse {
  category_key: string;
  category_name: string;
  target_categories: string[];
  logic_map: Record<string, FeelAttribute>;
  balance_game: BalanceQuestion[];
  negative_filter: NegativeFilterOption[];
  hard_filters: {
    guide: { title: string; points: string[]; trend: string };
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

    // 가이드 정보 (hard_filters.json에서 guide만 사용)
    const hardFilterGuide = (hardFiltersData as Record<string, HardFilterGuide>)[categoryKey];

    // 하드필터 질문: 다나와 필터 기반 동적 생성 + manual fallback
    // (hard_filters.json의 questions는 제거됨 - 다나와 필터와 중복 방지)
    const targetCategoryCodes = subCategoryCode ? [subCategoryCode] : undefined;
    const dynamicQuestions = await generateHardFiltersForCategory(categoryKey, targetCategoryCodes);

    // 응답 구성
    const response: CategoryRulesResponse = {
      category_key: categoryKey,
      category_name: categoryLogic.category_name,
      target_categories: categoryLogic.target_categories,
      logic_map: categoryLogic.rules,
      balance_game: categoryBalance?.questions || [],
      negative_filter: categoryNegative?.options || [],
      hard_filters: {
        guide: hardFilterGuide?.guide || {
          title: `${categoryLogic.category_name} 선택 가이드`,
          points: [],
          trend: '',
        },
        questions: dynamicQuestions.slice(0, 5), // 최대 5개 질문
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
