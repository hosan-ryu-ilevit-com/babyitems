/**
 * v2 룰맵 API - 전체 카테고리 목록 조회
 * GET /api/v2/rules
 */

import { NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';

export interface CategorySummary {
  category_key: string;
  category_name: string;
  target_categories: string[];
  question_count: number;    // 밸런스 게임 질문 수
  filter_count: number;      // 단점 필터 수
}

export async function GET() {
  try {
    const logicMap = logicMapData as Record<string, {
      category_name: string;
      target_categories: string[];
      rules: Record<string, unknown>;
    }>;

    const balanceGame = balanceGameData as {
      scenarios: Record<string, {
        category_name: string;
        questions: unknown[];
      }>;
    };

    const negativeFilter = negativeFilterData as {
      filters: Record<string, {
        category_name: string;
        options: unknown[];
      }>;
    };

    // 카테고리 목록 생성
    const categories: CategorySummary[] = Object.keys(logicMap).map((key) => {
      const logic = logicMap[key];
      const balance = balanceGame.scenarios[key];
      const negative = negativeFilter.filters[key];

      return {
        category_key: key,
        category_name: logic.category_name,
        target_categories: logic.target_categories,
        question_count: balance?.questions?.length || 0,
        filter_count: negative?.options?.length || 0,
      };
    });

    return NextResponse.json({
      success: true,
      categories,
      total: categories.length,
    });
  } catch (error) {
    console.error('Rules API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load rules' },
      { status: 500 }
    );
  }
}
