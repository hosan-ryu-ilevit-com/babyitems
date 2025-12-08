/**
 * v2 스코어링 API - 밸런스게임 + 단점필터 점수 계산
 * POST /api/v2/score
 * 
 * 요청:
 * - categoryKey: 카테고리 키
 * - products: 상품 목록 (pcode, title, brand, price, spec 포함)
 * - balanceSelections: 선택된 밸런스 게임 rule_key 배열
 * - negativeSelections: 선택된 단점 필터 rule_key 배열
 */

import { NextRequest, NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import type { 
  CategoryLogicMap, 
  CategoryNegativeFilter,
  LogicOperator,
  ProductScore 
} from '@/types/rules';

interface ScoreRequest {
  categoryKey: string;
  products: Array<{
    pcode: string;
    title: string;
    brand?: string;
    price?: number;
    rank?: number;
    thumbnail?: string;
    spec?: Record<string, unknown>;
  }>;
  balanceSelections: string[];    // 밸런스 게임에서 선택된 rule_key 배열
  negativeSelections: string[];   // 단점 필터에서 선택된 rule_key 배열
}

// 값 추출 (spec.재질, title, brand 등 지원)
function extractValue(product: ScoreRequest['products'][0], target: string): unknown {
  if (target.startsWith('spec.')) {
    const specKey = target.replace('spec.', '');
    return product.spec?.[specKey];
  }
  return product[target as keyof typeof product];
}

// 연산자 비교
function evaluateCondition(value: unknown, operator: LogicOperator, compareValue: string | number): boolean {
  if (value === undefined || value === null) return false;

  switch (operator) {
    case 'eq':
      return String(value) === String(compareValue);
    
    case 'contains':
      return String(value).toLowerCase().includes(String(compareValue).toLowerCase());
    
    case 'lt':
      return Number(value) < Number(compareValue);
    
    case 'lte':
      return Number(value) <= Number(compareValue);
    
    case 'gt':
      return Number(value) > Number(compareValue);
    
    case 'gte':
      return Number(value) >= Number(compareValue);
    
    default:
      return false;
  }
}

// 상품 점수 계산
function calculateProductScore(
  product: ScoreRequest['products'][0],
  categoryLogic: CategoryLogicMap,
  balanceSelections: string[],
  negativeSelections: string[],
  negativeFilter: CategoryNegativeFilter | undefined
): ProductScore {
  let baseScore = 0;
  let negativeScore = 0;
  const matchedRules: string[] = [];

  // 1. 밸런스 게임 점수 계산
  for (const ruleKey of balanceSelections) {
    const attribute = categoryLogic.rules[ruleKey];
    if (!attribute) continue;

    for (const rule of attribute.logic) {
      const value = extractValue(product, rule.target);
      if (evaluateCondition(value, rule.operator, rule.value)) {
        baseScore += rule.score;
        if (!matchedRules.includes(ruleKey)) {
          matchedRules.push(ruleKey);
        }
      }
    }
  }

  // 2. 단점 필터 점수 계산
  for (const ruleKey of negativeSelections) {
    const attribute = categoryLogic.rules[ruleKey];
    if (!attribute) continue;

    // 네거티브 필터의 exclude_mode 확인
    const negOption = negativeFilter?.options.find(opt => opt.target_rule_key === ruleKey);
    const excludeMode = negOption?.exclude_mode || 'drop_if_lacks';

    let hasAttribute = false;

    for (const rule of attribute.logic) {
      const value = extractValue(product, rule.target);
      if (evaluateCondition(value, rule.operator, rule.value)) {
        hasAttribute = true;
        break;
      }
    }

    // drop_if_lacks: 해당 속성이 없으면 감점
    // drop_if_has: 해당 속성이 있으면 감점
    if (excludeMode === 'drop_if_lacks' && !hasAttribute) {
      negativeScore -= 100; // 강력한 감점
      matchedRules.push(`❌${ruleKey}`);
    } else if (excludeMode === 'drop_if_has' && hasAttribute) {
      negativeScore -= 100;
      matchedRules.push(`❌${ruleKey}`);
    }
  }

  return {
    pcode: product.pcode,
    title: product.title,
    brand: product.brand,
    price: product.price,
    thumbnail: product.thumbnail,
    rank: product.rank,
    baseScore,
    negativeScore,
    totalScore: baseScore + negativeScore,
    matchedRules,
    spec: product.spec,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ScoreRequest = await request.json();
    const { categoryKey, products, balanceSelections = [], negativeSelections = [] } = body;

    // 유효성 검사
    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    // 로직맵 가져오기
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const categoryLogic = logicMap[categoryKey];

    if (!categoryLogic) {
      return NextResponse.json(
        { success: false, error: `Category '${categoryKey}' not found` },
        { status: 404 }
      );
    }

    // 네거티브 필터 가져오기
    const negFilter = negativeFilterData as { filters: Record<string, CategoryNegativeFilter> };
    const categoryNegative = negFilter.filters[categoryKey];

    // 모든 상품 점수 계산
    const scoredProducts: ProductScore[] = products.map((product) =>
      calculateProductScore(product, categoryLogic, balanceSelections, negativeSelections, categoryNegative)
    );

    // 점수 기준 정렬 (높은 순)
    scoredProducts.sort((a, b) => b.totalScore - a.totalScore);

    // 통계
    const totalCount = products.length;
    const filteredCount = scoredProducts.filter(p => p.negativeScore < 0).length;

    return NextResponse.json({
      success: true,
      data: {
        categoryKey,
        categoryName: categoryLogic.category_name,
        scoredProducts,
        top3: scoredProducts.slice(0, 3),
        stats: {
          totalCount,
          filteredCount,
          appliedBalanceKeys: balanceSelections,
          appliedNegativeKeys: negativeSelections,
        },
      },
    });
  } catch (error) {
    console.error('Score API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate scores' },
      { status: 500 }
    );
  }
}
