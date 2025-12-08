/**
 * v2 룰맵 API - 카테고리별 상세 조회
 * GET /api/v2/rules/[categoryKey]
 */

import { NextRequest, NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import type { 
  CategoryLogicMap, 
  CategoryBalanceGame, 
  CategoryNegativeFilter,
  BalanceQuestion,
  NegativeFilterOption,
  FeelAttribute
} from '@/types/rules';

interface CategoryRulesResponse {
  category_key: string;
  category_name: string;
  target_categories: string[];
  logic_map: Record<string, FeelAttribute>;
  balance_game: BalanceQuestion[];
  negative_filter: NegativeFilterOption[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryKey: string }> }
) {
  try {
    const { categoryKey } = await params;

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

    // 응답 구성
    const response: CategoryRulesResponse = {
      category_key: categoryKey,
      category_name: categoryLogic.category_name,
      target_categories: categoryLogic.target_categories,
      logic_map: categoryLogic.rules,
      balance_game: categoryBalance?.questions || [],
      negative_filter: categoryNegative?.options || [],
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
