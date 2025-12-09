/**
 * V2 최종 추천 API - LLM 기반 Top 3 선정 + 추천 이유 생성
 * POST /api/v2/recommend-final
 *
 * 기존 score API의 점수 기반 정렬 대신, LLM이 사용자 상황을 종합적으로 분석하여
 * 최적의 Top 3 제품을 선정하고 개인화된 추천 이유를 생성합니다.
 *
 * 입력:
 * - categoryKey: 카테고리 키
 * - candidateProducts: 점수 계산이 완료된 후보 상품들 (상위 10~20개 권장)
 * - userContext: 사용자 선택 정보
 *   - hardFilterAnswers: 하드 필터 응답
 *   - balanceSelections: 밸런스 게임 선택 (rule_key 배열)
 *   - negativeSelections: 단점 필터 선택 (rule_key 배열)
 * - budget: { min, max }
 *
 * 출력:
 * - top3Products: 최종 Top 3 제품 (추천 이유 포함)
 * - selectionReason: 전체 선정 기준 설명
 * - generated_by: 'llm' | 'fallback'
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';

// 후보 상품 타입
interface CandidateProduct {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  rank?: number | null;
  thumbnail?: string | null;
  spec?: Record<string, unknown>;
  baseScore?: number;
  negativeScore?: number;
  totalScore?: number;
  matchedRules?: string[];
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
}

// 요청 타입
interface RecommendFinalRequest {
  categoryKey: string;
  candidateProducts: CandidateProduct[];
  userContext?: UserContext;
  budget?: { min: number; max: number };
}

// 추천 제품 타입 (이유 포함)
interface RecommendedProduct extends CandidateProduct {
  recommendationReason: string;
  matchedPreferences: string[];
  rank: number;
}

// 응답 타입
interface RecommendFinalResponse {
  success: boolean;
  data?: {
    categoryKey: string;
    categoryName: string;
    top3Products: RecommendedProduct[];
    selectionReason: string;
    generated_by: 'llm' | 'fallback';
    totalCandidates: number;
  };
  error?: string;
}

/**
 * 밸런스 선택을 자연어로 변환
 */
function formatBalanceSelections(selections: string[]): string {
  const descriptions: Record<string, string> = {
    // 예시 매핑 (실제로는 logic_map에서 description을 가져올 수 있음)
    'rule_bottle_lightweight': '가벼운 제품 선호',
    'rule_bottle_durable': '내구성 있는 제품 선호',
    'rule_pot_warm_fast': '빠른 가열 선호',
    'rule_pot_temp_accurate': '정확한 온도 조절 선호',
    // ... 더 많은 매핑
  };

  return selections
    .map(key => descriptions[key] || key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 단점 필터 선택을 자연어로 변환
 */
function formatNegativeSelections(selections: string[]): string {
  return selections
    .map(key => key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 상품 정보를 LLM 프롬프트용 문자열로 변환
 */
function formatProductForPrompt(product: CandidateProduct, index: number): string {
  const specStr = product.spec
    ? Object.entries(product.spec)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 10) // 상위 10개 스펙만
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : '스펙 정보 없음';

  return `[${index + 1}] ${product.title}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '가격 미정'}
- 인기순위: ${product.rank || '미정'}위
- 현재점수: ${product.totalScore || 0}점
- 주요스펙: ${specStr}`;
}

/**
 * LLM을 사용하여 Top 3 선정 및 추천 이유 생성
 */
async function selectTop3WithLLM(
  categoryKey: string,
  categoryName: string,
  insights: CategoryInsights,
  candidates: CandidateProduct[],
  userContext: UserContext,
  budget: { min: number; max: number }
): Promise<{
  top3Products: RecommendedProduct[];
  selectionReason: string;
}> {
  const model = getModel(0.4); // 낮은 temperature로 일관된 결과

  // 사용자 선택 요약
  const hardFilterSummary = userContext.hardFilterAnswers
    ? Object.entries(userContext.hardFilterAnswers)
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .join('\n')
    : '선택 없음';

  const balanceSummary = userContext.balanceSelections?.length
    ? formatBalanceSelections(userContext.balanceSelections)
    : '선택 없음';

  const negativeSummary = userContext.negativeSelections?.length
    ? formatNegativeSelections(userContext.negativeSelections)
    : '선택 없음';

  // 카테고리 인사이트에서 핵심 정보 추출
  const topPros = insights.pros.slice(0, 5).map(p => `- ${p.text}`).join('\n');
  const topCons = insights.cons.slice(0, 5).map(c => `- ${c.text}`).join('\n');

  // 후보 상품 목록
  const candidatesStr = candidates
    .slice(0, 15) // 최대 15개 후보
    .map((p, i) => formatProductForPrompt(p, i))
    .join('\n\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
아래 사용자 상황과 후보 상품들을 분석하여, 가장 적합한 Top 3 제품을 선정하고 개인화된 추천 이유를 작성해주세요.

## 사용자 상황

### 1. 기본 조건 (하드 필터)
${hardFilterSummary}

### 2. 선호하는 특성 (밸런스 게임 선택)
${balanceSummary}

### 3. 피하고 싶은 단점
${negativeSummary}

### 4. 예산 범위
${budget.min.toLocaleString()}원 ~ ${budget.max.toLocaleString()}원

## 이 카테고리의 일반적인 장점들 (언급률 순)
${topPros}

## 이 카테고리의 주요 단점/우려사항 (언급률 순)
${topCons}

## 후보 상품 목록 (현재 점수 기준 정렬)
${candidatesStr}

## 선정 기준
1. 사용자의 하드 필터 조건을 모두 만족해야 함
2. 밸런스 게임에서 선택한 선호 특성을 가진 제품 우선
3. 피하고 싶다고 한 단점이 없는 제품 우선
4. 예산 범위 내에서 가성비 고려
5. 단순히 점수만 보지 말고, 사용자 상황에 맞는 제품인지 종합 판단

## 응답 JSON 형식
{
  "top3": [
    {
      "pcode": "선정된 상품의 pcode",
      "rank": 1,
      "recommendationReason": "이 사용자에게 이 제품을 1위로 추천하는 구체적인 이유 (2-3문장, 사용자 선택과 연결지어 설명)",
      "matchedPreferences": ["매칭된 사용자 선호 항목들"]
    },
    {
      "pcode": "...",
      "rank": 2,
      "recommendationReason": "2위 추천 이유",
      "matchedPreferences": ["..."]
    },
    {
      "pcode": "...",
      "rank": 3,
      "recommendationReason": "3위 추천 이유",
      "matchedPreferences": ["..."]
    }
  ],
  "selectionReason": "전체적인 선정 기준과 3개 제품의 특징 요약 (1-2문장)"
}

중요:
- pcode는 후보 목록에 있는 실제 상품의 pcode만 사용
- 추천 이유는 "이 제품은..."으로 시작하지 말고, 사용자 관점에서 작성 (예: "소음에 민감하다고 하셨는데, 이 제품은 저소음 설계로...")
- JSON만 응답`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsed = parseJSONResponse(responseText) as {
    top3?: Array<{
      pcode: string;
      rank: number;
      recommendationReason?: string;
      matchedPreferences?: string[];
    }>;
    selectionReason?: string;
  };

  // 결과를 RecommendedProduct 형태로 변환
  const top3Products: RecommendedProduct[] = [];

  for (const item of parsed.top3 || []) {
    const candidate = candidates.find(c => c.pcode === item.pcode);
    if (candidate) {
      top3Products.push({
        ...candidate,
        rank: item.rank,
        recommendationReason: item.recommendationReason || '',
        matchedPreferences: item.matchedPreferences || [],
      });
    }
  }

  // 만약 3개 미만이면 기존 점수 기준으로 채우기
  if (top3Products.length < 3) {
    const selectedPcodes = new Set(top3Products.map(p => p.pcode));
    const remaining = candidates
      .filter(c => !selectedPcodes.has(c.pcode))
      .slice(0, 3 - top3Products.length);

    for (const p of remaining) {
      top3Products.push({
        ...p,
        rank: top3Products.length + 1,
        recommendationReason: '점수 기반 추천 제품입니다.',
        matchedPreferences: p.matchedRules || [],
      });
    }
  }

  return {
    top3Products,
    selectionReason: parsed.selectionReason || '사용자 선호도와 제품 특성을 종합적으로 고려하여 선정했습니다.',
  };
}

/**
 * Fallback: 점수 기준 Top 3 반환
 */
function selectTop3Fallback(
  candidates: CandidateProduct[]
): {
  top3Products: RecommendedProduct[];
  selectionReason: string;
} {
  const sorted = [...candidates].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  const top3 = sorted.slice(0, 3);

  const top3Products: RecommendedProduct[] = top3.map((p, index) => ({
    ...p,
    rank: index + 1,
    recommendationReason: generateFallbackReason(p, index + 1),
    matchedPreferences: p.matchedRules || [],
  }));

  return {
    top3Products,
    selectionReason: '선호도 점수를 기반으로 가장 적합한 제품을 선정했습니다.',
  };
}

/**
 * Fallback용 추천 이유 생성
 */
function generateFallbackReason(product: CandidateProduct, rank: number): string {
  const parts: string[] = [];

  if (product.matchedRules && product.matchedRules.length > 0) {
    const positiveRules = product.matchedRules.filter(r => !r.startsWith('❌'));
    if (positiveRules.length > 0) {
      parts.push(`선호하신 조건 ${positiveRules.length}개가 매칭되었습니다`);
    }
  }

  if (product.totalScore && product.totalScore > 0) {
    parts.push(`선호도 점수 ${product.totalScore}점으로 높은 적합도를 보입니다`);
  }

  if (product.rank && product.rank <= 10) {
    parts.push(`인기순위 ${product.rank}위의 검증된 제품입니다`);
  }

  if (parts.length === 0) {
    parts.push(`종합적인 분석 결과 ${rank}위로 추천드립니다`);
  }

  return parts.join('. ') + '.';
}

export async function POST(request: NextRequest): Promise<NextResponse<RecommendFinalResponse>> {
  try {
    const body: RecommendFinalRequest = await request.json();
    const {
      categoryKey,
      candidateProducts,
      userContext = {},
      budget = { min: 0, max: 10000000 }
    } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'candidateProducts array is required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let top3Products: RecommendedProduct[];
    let selectionReason: string;
    let generated_by: 'llm' | 'fallback' = 'fallback';

    // LLM 사용 가능 여부 확인
    if (isGeminiAvailable() && insights) {
      try {
        const llmResult = await callGeminiWithRetry(
          () => selectTop3WithLLM(
            categoryKey,
            categoryName,
            insights,
            candidateProducts,
            userContext,
            budget
          ),
          2, // 최대 2번 재시도
          1500
        );

        top3Products = llmResult.top3Products;
        selectionReason = llmResult.selectionReason;
        generated_by = 'llm';

        console.log(`[recommend-final] LLM selected Top 3 for ${categoryKey}: ${top3Products.map(p => p.pcode).join(', ')}`);
      } catch (llmError) {
        console.error('[recommend-final] LLM failed, using fallback:', llmError);
        const fallbackResult = selectTop3Fallback(candidateProducts);
        top3Products = fallbackResult.top3Products;
        selectionReason = fallbackResult.selectionReason;
      }
    } else {
      // LLM 없을 때 fallback
      console.log(`[recommend-final] LLM not available, using fallback for ${categoryKey}`);
      const fallbackResult = selectTop3Fallback(candidateProducts);
      top3Products = fallbackResult.top3Products;
      selectionReason = fallbackResult.selectionReason;
    }

    return NextResponse.json({
      success: true,
      data: {
        categoryKey,
        categoryName,
        top3Products,
        selectionReason,
        generated_by,
        totalCandidates: candidateProducts.length,
      },
    });
  } catch (error) {
    console.error('[recommend-final] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate final recommendations' },
      { status: 500 }
    );
  }
}

/**
 * GET: API 정보 및 사용법 반환
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    info: {
      endpoint: '/api/v2/recommend-final',
      method: 'POST',
      description: 'LLM 기반 최종 Top 3 추천 API',
      input: {
        categoryKey: 'string (required)',
        candidateProducts: 'CandidateProduct[] (required) - 점수 계산된 후보 상품들',
        userContext: {
          hardFilterAnswers: 'Record<string, string[]> (optional)',
          balanceSelections: 'string[] (optional) - 선택한 밸런스 게임 rule_key',
          negativeSelections: 'string[] (optional) - 선택한 단점 필터 rule_key',
        },
        budget: '{ min: number, max: number } (optional)',
      },
      output: {
        top3Products: 'RecommendedProduct[] - 추천 이유가 포함된 Top 3 제품',
        selectionReason: 'string - 전체 선정 기준 설명',
        generated_by: "'llm' | 'fallback'",
      },
    },
  });
}
