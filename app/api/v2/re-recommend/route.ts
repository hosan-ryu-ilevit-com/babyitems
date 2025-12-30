/**
 * V2 재추천 API - 결과 페이지에서 자연어 조건으로 재추천
 * POST /api/v2/re-recommend
 *
 * 기존 조건을 유지하면서 새 자연어 조건을 추가하여 재추천합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ReRecommendRequest {
  categoryKey: string;
  existingConditions: {
    hardFilterAnswers: Record<string, string>;
    balanceSelections: string[];
    negativeSelections: string[];
    budget: { min: number; max: number };
  };
  newCondition: string;  // 새로운 자연어 조건
  previousConditions?: string[];  // 이전에 추가된 자연어 조건들
}

interface ProductItem {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  rank: number | null;
  thumbnail: string | null;
  spec: Record<string, unknown>;
  filter_attrs?: Record<string, unknown>;
}

interface ScoredProduct extends ProductItem {
  baseScore: number;
  negativeScore: number;
  hardFilterScore: number;
  budgetScore: number;
  directInputScore: number;
  totalScore: number;
  matchedRules: string[];
  isOverBudget: boolean;
  overBudgetAmount: number;
  overBudgetPercent: number;
  recommendationReason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReRecommendRequest = await request.json();
    const { categoryKey, existingConditions, newCondition, previousConditions = [] } = body;

    if (!categoryKey || !newCondition) {
      return NextResponse.json({
        success: false,
        error: '카테고리와 새 조건이 필요합니다.',
      });
    }

    console.log(`[ReRecommend] Category: ${categoryKey}, New condition: "${newCondition}"`);

    // 1. 카테고리에서 제품 조회
    const { data: products, error: productError } = await supabase
      .from('danawa_products')
      .select('*')
      .eq('category_key', categoryKey)
      .not('price', 'is', null)
      .order('rank', { ascending: true })
      .limit(100);

    if (productError || !products?.length) {
      console.error('[ReRecommend] Product fetch error:', productError);
      return NextResponse.json({
        success: false,
        error: '제품을 불러오지 못했습니다.',
      });
    }

    // 2. 예산 필터링
    const budgetFiltered = products.filter((p) => {
      const price = p.price || 0;
      return price >= existingConditions.budget.min && price <= existingConditions.budget.max;
    });

    if (budgetFiltered.length === 0) {
      return NextResponse.json({
        success: false,
        error: '예산 범위 내 제품이 없습니다.',
      });
    }

    // 3. 카테고리 인사이트 로드
    let insights = null;
    try {
      insights = await loadCategoryInsights(categoryKey);
    } catch (e) {
      console.log('[ReRecommend] No insights for category:', categoryKey);
    }

    // 4. LLM으로 새 조건 기반 Top 3 선정
    const allConditions = [...previousConditions, newCondition].join('. ');
    const top3 = await selectTop3WithLLM(
      budgetFiltered,
      existingConditions,
      allConditions,
      insights
    );

    // 5. 결과 반환
    return NextResponse.json({
      success: true,
      data: {
        top3Products: top3,
        appliedCondition: newCondition,
        totalCandidates: budgetFiltered.length,
      },
    });
  } catch (error) {
    console.error('[ReRecommend] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '재추천 중 오류가 발생했습니다.',
    });
  }
}

/**
 * LLM으로 Top 3 선정
 */
async function selectTop3WithLLM(
  products: ProductItem[],
  conditions: ReRecommendRequest['existingConditions'],
  naturalLanguageCondition: string,
  insights: unknown
): Promise<ScoredProduct[]> {
  if (!isGeminiAvailable()) {
    console.log('[ReRecommend] Gemini not available, using fallback');
    return fallbackSelection(products, naturalLanguageCondition);
  }

  // 상위 20개만 LLM에 전달
  const candidates = products.slice(0, 20);

  const productSummary = candidates
    .map((p, i) => {
      const specs = p.spec
        ? Object.entries(p.spec)
            .filter(([k]) => !['created_at', 'updated_at', 'pcode'].includes(k))
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : '';
      return `${i + 1}. ${p.brand || ''} ${p.title} - ${p.price?.toLocaleString()}원
   스펙: ${specs}`;
    })
    .join('\n');

  const prompt = `당신은 육아용품 전문가입니다. 아래 조건에 가장 적합한 TOP 3 제품을 선정하세요.

## 사용자 조건
- 예산: ${conditions.budget.min.toLocaleString()}원 ~ ${conditions.budget.max.toLocaleString()}원
- 추가 요청: ${naturalLanguageCondition}

## 후보 제품 목록
${productSummary}

## 선정 규칙
1. 사용자의 "추가 요청"을 가장 중요하게 반영
2. 예산 범위 내 제품만 선정
3. 각 제품에 대해 짧은 추천 이유 작성 (1문장)

응답 형식 (JSON):
{
  "top3": [
    { "index": 1, "reason": "추천 이유" },
    { "index": 2, "reason": "추천 이유" },
    { "index": 3, "reason": "추천 이유" }
  ]
}`;

  try {
    const model = getModel(0.3);
    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    const parsed = parseJSONResponse<{
      top3: Array<{ index: number; reason: string }>;
    }>(result);

    // 선정된 제품 반환
    return parsed.top3.map((item, rank) => {
      const product = candidates[item.index - 1];
      return {
        ...product,
        baseScore: 80 - rank * 10,
        negativeScore: 0,
        hardFilterScore: 0,
        budgetScore: 0,
        directInputScore: 0,
        totalScore: 80 - rank * 10,
        matchedRules: [],
        isOverBudget: false,
        overBudgetAmount: 0,
        overBudgetPercent: 0,
        recommendationReason: item.reason,
      };
    });
  } catch (error) {
    console.error('[ReRecommend] LLM error:', error);
    return fallbackSelection(products, naturalLanguageCondition);
  }
}

/**
 * LLM 실패 시 폴백 선정 (가격순)
 */
function fallbackSelection(
  products: ProductItem[],
  condition: string
): ScoredProduct[] {
  // 키워드 기반 간단한 필터링
  const keywords = condition.toLowerCase().split(/\s+/);

  const scored = products.map((p) => {
    let score = 50;
    const titleLower = (p.title || '').toLowerCase();
    const brandLower = (p.brand || '').toLowerCase();

    // 키워드 매칭 점수
    keywords.forEach((kw) => {
      if (titleLower.includes(kw) || brandLower.includes(kw)) {
        score += 10;
      }
    });

    // 랭킹 보너스
    if (p.rank && p.rank <= 10) {
      score += (11 - p.rank) * 2;
    }

    return { product: p, score };
  });

  // 점수순 정렬 후 Top 3
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((item, rank) => ({
    ...item.product,
    baseScore: item.score,
    negativeScore: 0,
    hardFilterScore: 0,
    budgetScore: 0,
    directInputScore: 0,
    totalScore: item.score,
    matchedRules: [],
    isOverBudget: false,
    overBudgetAmount: 0,
    overBudgetPercent: 0,
    recommendationReason: `${rank + 1}위 추천 제품입니다.`,
  }));
}
