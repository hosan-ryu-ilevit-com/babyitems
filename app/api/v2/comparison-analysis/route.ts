/**
 * V2 비교표 분석 API
 * POST /api/v2/comparison-analysis
 *
 * Top 3 제품에 대한 비교표용 장단점을 생성합니다:
 * - pros: 장점 3개
 * - cons: 주의점 3개
 * - comparison: 한줄 비교
 *
 * 병렬 처리로 빠르게 생성합니다.
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
  rank?: number | null;
}

// 요청 타입
interface ComparisonAnalysisRequest {
  categoryKey: string;
  products: ProductInfo[];
}

// 비교 분석 결과 타입
interface ProductComparison {
  pcode: string;
  pros: string[];
  cons: string[];
  comparison: string;
}

// 응답 타입
interface ComparisonAnalysisResponse {
  success: boolean;
  data?: {
    productDetails: Record<string, { pros: string[]; cons: string[]; comparison: string }>;
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 모든 제품을 한번에 비교 분석 (더 효율적)
 */
async function generateComparisons(
  products: ProductInfo[],
  categoryName: string,
  insights: CategoryInsights
): Promise<ProductComparison[]> {
  const model = getModel(0.5);

  // 제품 목록 문자열화
  const productsText = products.map((p, i) => {
    const specStr = p.spec
      ? Object.entries(p.spec)
          .filter(([_, v]) => v !== null && v !== undefined && v !== '')
          .slice(0, 10)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '스펙 정보 없음';

    return `[${i + 1}위] ${p.brand || ''} ${p.title}
- 가격: ${p.price ? `${p.price.toLocaleString()}원` : '가격 미정'}
- 인기순위: ${p.rank || '미정'}위
- 스펙: ${specStr}`;
  }).join('\n\n');

  // 카테고리 인사이트
  const categoryPros = insights.pros.slice(0, 4).map(p => `- ${p.text}`).join('\n');
  const categoryCons = insights.cons.slice(0, 4).map(c => `- ${c.text}`).join('\n');

  // 제품명 축약 정보 (한 줄 비교용)
  const productShortNames = products.map(p => {
    // 브랜드 + 모델명 앞부분으로 축약 (예: "보르르 분유포트" → "보르르")
    const brand = p.brand || '';
    const titleFirstWord = p.title.split(' ')[0] || '';
    return brand || titleFirstWord;
  });

  const prompt = `당신은 ${categoryName} 제품 비교 전문가입니다.
아래 ${products.length}개의 추천 제품을 비교해주세요.

## 추천 제품 목록
${productsText}

## 제품 축약명 (비교 시 사용)
${products.map((p, i) => `${i + 1}위: "${productShortNames[i]}"`).join(', ')}

## 이 카테고리의 일반적인 장점 (참고용)
${categoryPros}

## 이 카테고리의 일반적인 단점 (참고용)
${categoryCons}

## 요청사항
각 제품별로 다음을 작성해주세요:

1. **장점 3개** (각 35자 이내):
   - 반드시 **구체적인 기능, 스펙, 소재명**을 명시
   - ✅ 예: "43℃ 자동 냉각", "SUS304 스테인리스", "USB-C 충전"
   - ❌ 금지: "온도 조절 우수", "휴대성 높음", "가격 저렴"

2. **주의점 3개** (각 35자 이내):
   - 구체적인 **문제점, 제약사항** 명시
   - ✅ 예: "무게 1.5kg으로 무거움", "분리 세척 불가", "220V 전용"
   - ❌ 금지: "휴대성 낮음", "가격 비쌈"
   - ❌ 금지: "리뷰/평점 없음", "후기 부족", "평점 확인 필요" 등 리뷰 관련 언급 (대부분의 제품이 현재 리뷰가 없음)

3. **한 줄 비교** (70자 이내):
   - 다른 추천 제품들과 비교하여 이 제품의 특징을 한 줄로 요약
   - 다른 제품 언급 시 **제품 코드(pcode) 대신 위의 축약명**을 사용
   - ✅ 예: "${productShortNames[0] || '1위'}보다 저렴하지만 흡입력은 살짝 낮음"
   - ❌ 금지: "제품 1234567 대비", pcode 직접 언급

## 응답 JSON 형식
{
  "comparisons": [
    {
      "pcode": "${products[0]?.pcode || ''}",
      "pros": ["장점1", "장점2", "장점3"],
      "cons": ["주의점1", "주의점2", "주의점3"],
      "comparison": "한 줄 비교"
    },
    ...
  ]
}

JSON만 응답하세요.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsed = parseJSONResponse(responseText) as { comparisons?: ProductComparison[] };

  return parsed.comparisons || [];
}

/**
 * Fallback: 카테고리 인사이트 기반
 */
function generateFallbackComparisons(
  products: ProductInfo[],
  insights: CategoryInsights
): ProductComparison[] {
  return products.map((p, i) => {
    // 카테고리 장단점에서 순환하여 선택
    const prosOffset = i % insights.pros.length;
    const consOffset = i % insights.cons.length;

    return {
      pcode: p.pcode,
      pros: insights.pros.slice(prosOffset, prosOffset + 3).map(pro =>
        pro.text.length > 35 ? pro.text.substring(0, 32) + '...' : pro.text
      ),
      cons: insights.cons.slice(consOffset, consOffset + 3).map(con =>
        con.text.length > 35 ? con.text.substring(0, 32) + '...' : con.text
      ),
      comparison: i === 0
        ? '가장 종합적으로 높은 평가를 받은 제품입니다.'
        : `${i + 1}위 추천 제품입니다.`,
    };
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<ComparisonAnalysisResponse>> {
  try {
    const body: ComparisonAnalysisRequest = await request.json();
    const { categoryKey, products } = body;

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

    let comparisons: ProductComparison[] = [];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable() && insights) {
      try {
        comparisons = await callGeminiWithRetry(
          () => generateComparisons(products.slice(0, 3), categoryName, insights),
          2,
          1500
        );
        generated_by = 'llm';

        console.log(`[comparison-analysis] LLM generated comparisons for ${comparisons.length} products`);
      } catch (llmError) {
        console.error('[comparison-analysis] LLM failed, using fallback:', llmError);
        comparisons = generateFallbackComparisons(products.slice(0, 3), insights);
      }
    } else {
      console.log(`[comparison-analysis] LLM not available, using fallback for ${categoryKey}`);
      if (insights) {
        comparisons = generateFallbackComparisons(products.slice(0, 3), insights);
      } else {
        comparisons = products.slice(0, 3).map(p => ({
          pcode: p.pcode,
          pros: ['추천 제품입니다'],
          cons: ['자세한 정보를 확인하세요'],
          comparison: '추천 순위에 오른 제품입니다.',
        }));
      }
    }

    // Record 형태로 변환 (기존 API 호환)
    const productDetails: Record<string, { pros: string[]; cons: string[]; comparison: string }> = {};
    for (const comp of comparisons) {
      productDetails[comp.pcode] = {
        pros: comp.pros,
        cons: comp.cons,
        comparison: comp.comparison,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        productDetails,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[comparison-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate comparison analysis' },
      { status: 500 }
    );
  }
}
