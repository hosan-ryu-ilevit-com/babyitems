/**
 * V2 제품 상세 분석 API
 * POST /api/v2/product-analysis
 *
 * Top 3 제품에 대한 상세 분석을 생성합니다:
 * - additionalPros: 추가로 이런 점도 좋아요
 * - cons: 이런 점은 주의하세요
 * - purchaseTip: 구매 전 확인하세요
 *
 * 병렬 처리로 3개 제품을 동시에 분석합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  spec?: Record<string, unknown>;
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
}

// 요청 타입
interface ProductAnalysisRequest {
  categoryKey: string;
  products: ProductInfo[];
  userContext?: UserContext;
}

// 제품 분석 결과 타입
interface ProductAnalysis {
  pcode: string;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations: number[] }>;
}

// 응답 타입
interface ProductAnalysisResponse {
  success: boolean;
  data?: {
    analyses: ProductAnalysis[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 단일 제품 분석 생성
 */
async function analyzeProduct(
  product: ProductInfo,
  categoryName: string,
  insights: CategoryInsights,
  userContext: UserContext
): Promise<ProductAnalysis> {
  const model = getModel(0.5);

  // 스펙 정보 문자열화
  const specStr = product.spec
    ? Object.entries(product.spec)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 15)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '스펙 정보 없음';

  // 카테고리 인사이트에서 관련 정보 추출
  const categoryPros = insights.pros.slice(0, 5).map(p => p.text).join('\n');
  const categoryCons = insights.cons.slice(0, 5).map(c => `${c.text}${c.deal_breaker_for ? ` (치명적: ${c.deal_breaker_for})` : ''}`).join('\n');

  // 사용자 선택 요약
  const userPrefs = userContext.balanceSelections?.length
    ? `사용자 선호: ${userContext.balanceSelections.join(', ')}`
    : '';
  const userAvoid = userContext.negativeSelections?.length
    ? `사용자가 피하고 싶은 것: ${userContext.negativeSelections.join(', ')}`
    : '';

  const prompt = `당신은 ${categoryName} 전문 리뷰어입니다.
아래 제품에 대해 실제 사용자 관점에서 분석해주세요.

## 제품 정보
- 제품명: ${product.title}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '가격 미정'}
- 주요 스펙:
${specStr}

## 이 카테고리의 일반적인 장점들
${categoryPros}

## 이 카테고리의 주요 단점/우려사항
${categoryCons}

${userPrefs}
${userAvoid}

## 분석 요청
제품 스펙과 카테고리 특성을 고려하여 다음을 작성해주세요:

1. **추가 장점 (additionalPros)**: 스펙에서 유추할 수 있는 이 제품만의 추가 장점 2-3개
2. **주의점 (cons)**: 이 제품 사용 시 주의해야 할 점 2-3개 (스펙 기반 추론)
3. **구매 팁 (purchaseTip)**: 구매 전 확인해야 할 사항 1-2개

## 응답 JSON 형식
{
  "additionalPros": [
    { "text": "장점 설명 (구체적으로)", "citations": [] }
  ],
  "cons": [
    { "text": "주의점 설명 (구체적으로)", "citations": [] }
  ],
  "purchaseTip": [
    { "text": "구매 팁 (구체적으로)", "citations": [] }
  ]
}

중요:
- 스펙 정보를 기반으로 구체적으로 작성
- 일반적인 내용이 아닌 이 제품에 특화된 내용으로
- 사용자 관점에서 실용적인 정보 위주로
- citations는 빈 배열로 (리뷰 인용 없음)

JSON만 응답하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = parseJSONResponse(responseText) as {
      additionalPros?: Array<{ text: string; citations: number[] }>;
      cons?: Array<{ text: string; citations: number[] }>;
      purchaseTip?: Array<{ text: string; citations: number[] }>;
    };

    return {
      pcode: product.pcode,
      additionalPros: parsed.additionalPros || [],
      cons: parsed.cons || [],
      purchaseTip: parsed.purchaseTip || [],
    };
  } catch (error) {
    console.error(`[product-analysis] Failed to analyze ${product.pcode}:`, error);
    // Fallback: 카테고리 인사이트 기반 기본 응답
    return generateFallbackAnalysis(product, insights);
  }
}

/**
 * Fallback 분석 생성
 */
function generateFallbackAnalysis(product: ProductInfo, insights: CategoryInsights): ProductAnalysis {
  // 카테고리 장점에서 랜덤하게 2개 선택
  const additionalPros = insights.pros.slice(0, 2).map(p => ({
    text: p.text,
    citations: [],
  }));

  // 카테고리 단점에서 랜덤하게 2개 선택
  const cons = insights.cons.slice(0, 2).map(c => ({
    text: c.text,
    citations: [],
  }));

  // 구매 팁
  const purchaseTip = [
    { text: '구매 전 실제 사용 리뷰를 확인해보세요.', citations: [] },
  ];

  return {
    pcode: product.pcode,
    additionalPros,
    cons,
    purchaseTip,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryKey, products, userContext = {} } = body;

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

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let analyses: ProductAnalysis[] = [];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable() && insights) {
      try {
        // 병렬로 3개 제품 분석
        const analysisPromises = products.slice(0, 3).map(product =>
          callGeminiWithRetry(
            () => analyzeProduct(product, categoryName, insights, userContext),
            2,
            1000
          )
        );

        analyses = await Promise.all(analysisPromises);
        generated_by = 'llm';

        console.log(`[product-analysis] LLM analyzed ${analyses.length} products for ${categoryKey}`);
      } catch (llmError) {
        console.error('[product-analysis] LLM failed, using fallback:', llmError);
        analyses = products.slice(0, 3).map(p => generateFallbackAnalysis(p, insights));
      }
    } else {
      console.log(`[product-analysis] LLM not available, using fallback for ${categoryKey}`);
      if (insights) {
        analyses = products.slice(0, 3).map(p => generateFallbackAnalysis(p, insights));
      } else {
        // insights도 없으면 빈 분석 반환
        analyses = products.slice(0, 3).map(p => ({
          pcode: p.pcode,
          additionalPros: [],
          cons: [],
          purchaseTip: [],
        }));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        analyses,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[product-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze products' },
      { status: 500 }
    );
  }
}
