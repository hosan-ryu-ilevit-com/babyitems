/**
 * v2 스코어링 API - 하드필터 + 밸런스게임 + 단점필터 점수 계산
 * POST /api/v2/score
 *
 * 요청:
 * - categoryKey: 카테고리 키
 * - products: 상품 목록 (pcode, title, brand, price, spec 포함)
 * - hardFilterAnswers: 하드필터 답변 (questionId -> 선택된 값들)
 * - balanceSelections: 선택된 밸런스 게임 rule_key 배열
 * - negativeSelections: 선택된 단점 필터 rule_key 배열
 */

import { NextRequest, NextResponse } from 'next/server';
import logicMapData from '@/data/rules/logic_map.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import hardFiltersData from '@/data/rules/hard_filters.json';
import type {
  CategoryLogicMap,
  CategoryNegativeFilter,
  LogicOperator,
  ProductScore
} from '@/types/rules';
import type { HardFilterConfig } from '@/types/recommend-v2';

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
    category_code?: string;  // 에누리 제품용
  }>;
  hardFilterAnswers?: Record<string, string[]>;  // 하드필터 답변 (체감속성 포함)
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

// 하드필터 옵션이 제품과 매칭되는지 확인
function matchesHardFilterOption(
  product: ScoreRequest['products'][0],
  option: { value: string; filter?: Record<string, unknown>; category_code?: string }
): boolean {
  // category_code 매칭 (에누리 제품용)
  if (option.category_code) {
    return product.category_code === option.category_code;
  }

  // filter 조건 매칭
  if (option.filter) {
    for (const [key, expectedValue] of Object.entries(option.filter)) {
      const productValue = product.spec?.[key];

      if (productValue === undefined || productValue === null) {
        return false;
      }

      // 배열 값 처리
      if (Array.isArray(productValue)) {
        const found = productValue.some(v =>
          String(v).toLowerCase().includes(String(expectedValue).toLowerCase())
        );
        if (!found) return false;
      } else {
        // 문자열/숫자 값 처리
        const productStr = String(productValue).toLowerCase();
        const expectedStr = String(expectedValue).toLowerCase();
        if (!productStr.includes(expectedStr)) {
          return false;
        }
      }
    }
    return true;
  }

  return false;
}

// 상품 점수 계산
function calculateProductScore(
  product: ScoreRequest['products'][0],
  categoryLogic: CategoryLogicMap,
  hardFilterAnswers: Record<string, string[]>,
  hardFilterConfig: HardFilterConfig | null,
  balanceSelections: string[],
  negativeSelections: string[],
  negativeFilter: CategoryNegativeFilter | undefined
): ProductScore {
  let baseScore = 0;
  let negativeScore = 0;
  let hardFilterScore = 0;
  const matchedRules: string[] = [];

  // 0. 하드필터 점수 계산 (체감속성 + 일반 하드필터)
  if (hardFilterAnswers && hardFilterConfig?.questions) {
    for (const [questionId, selectedValues] of Object.entries(hardFilterAnswers)) {
      const question = hardFilterConfig.questions.find(q => q.id === questionId);
      if (!question || selectedValues.length === 0) continue;

      // Skip 값 제외 ("상관없어요", "skip" 등)
      const SKIP_VALUES = ['skip', 'any', '상관없어요', 'none', 'all'];
      const validValues = selectedValues.filter(v =>
        !SKIP_VALUES.includes(v.toLowerCase()) && !v.includes('상관없')
      );
      if (validValues.length === 0) continue;

      // 선택한 옵션 중 하나라도 매칭되는지 확인
      const matched = validValues.some(value => {
        const option = question.options.find(opt => opt.value === value);
        return option && matchesHardFilterOption(product, option);
      });

      if (matched) {
        // 체감속성 태그 (review_priorities)는 더 높은 가중치
        const isExperientialTag = question.type === 'review_priorities';
        const scoreIncrement = isExperientialTag ? 20 : 10;
        hardFilterScore += scoreIncrement;
        matchedRules.push(`하드필터_${questionId}`);
      }
    }
  }

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
    totalScore: hardFilterScore + baseScore + negativeScore,
    matchedRules,
    spec: product.spec,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ScoreRequest = await request.json();
    const { categoryKey, products, hardFilterAnswers = {}, balanceSelections = [], negativeSelections = [] } = body;

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

    // 하드필터 설정 가져오기
    const hardFilters = hardFiltersData as Record<string, HardFilterConfig>;
    const hardFilterConfig = hardFilters[categoryKey] || null;

    // 네거티브 필터 가져오기
    const negFilter = negativeFilterData as { filters: Record<string, CategoryNegativeFilter> };
    const categoryNegative = negFilter.filters[categoryKey];

    // 모든 상품 점수 계산
    const scoredProducts: ProductScore[] = products.map((product) =>
      calculateProductScore(
        product,
        categoryLogic,
        hardFilterAnswers,
        hardFilterConfig,
        balanceSelections,
        negativeSelections,
        categoryNegative
      )
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
