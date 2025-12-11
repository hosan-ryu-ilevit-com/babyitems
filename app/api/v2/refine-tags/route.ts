/**
 * V2 태그 정제 API - LLM 기반 태그 후처리
 * POST /api/v2/refine-tags
 *
 * 회색 태그들을 LLM (flash-lite)으로 정제:
 * - 중복 제거
 * - 영어 → 한글 변환
 * - 심플하고 알아볼 수 있는 특성으로 변환
 *
 * 입력:
 * - products: Array<{ pcode: string; rawTags: string[] }>
 * - categoryName: string (카테고리명, 문맥 제공용)
 *
 * 출력:
 * - refinedTags: Record<pcode, string[]>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModel, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';

interface ProductTags {
  pcode: string;
  rawTags: string[];
}

interface RefineTagsRequest {
  products: ProductTags[];
  categoryName: string;
}

interface RefineTagsResponse {
  success: boolean;
  data?: {
    refinedTags: Record<string, string[]>;
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * Fallback: LLM 없이 기본 정제
 * - 중복 제거
 * - 기본적인 영어 패턴 제거
 */
function fallbackRefine(products: ProductTags[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const product of products) {
    const seen = new Set<string>();
    const refined: string[] = [];

    for (const tag of product.rawTags) {
      // 이미 본 태그는 스킵
      const normalized = tag.toLowerCase().trim();
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // 영어만 있는 태그는 스킵 (vs 포함 등)
      if (/^[a-zA-Z0-9\s_\-]+$/.test(tag) && tag.includes(' ')) {
        continue;
      }

      // 너무 긴 태그는 스킵 (20자 이상)
      if (tag.length > 20) continue;

      refined.push(tag);
    }

    result[product.pcode] = refined;
  }

  return result;
}

/**
 * LLM으로 태그 정제
 */
async function refineTagsWithLLM(
  products: ProductTags[],
  categoryName: string
): Promise<Record<string, string[]>> {
  const model = getModel(0.3); // 낮은 temperature로 일관된 결과

  // 제품별 태그 목록 생성
  const productTagsList = products.map(p => ({
    pcode: p.pcode,
    tags: p.rawTags,
  }));

  const prompt = `당신은 ${categoryName} 제품의 특성 태그를 정제하는 전문가입니다.

## 입력 데이터
각 제품의 raw 태그 목록입니다:
${JSON.stringify(productTagsList, null, 2)}

## 작업 지침
각 제품의 태그를 다음 기준으로 정제해주세요:

1. **중복 제거**: 의미가 같은 태그는 하나만 남김
   - 예: "가벼운 무게", "경량" → "가벼움" 하나만

2. **영어 → 한글 변환**: 영어 태그는 자연스러운 한글로
   - 예: "precise fit" → "정확한 착용감"
   - 예: "easy adjustment" → "쉬운 조절"

3. **심플하게**: 태그는 2~6자 정도의 짧은 명사/형용사형으로
   - 예: "빠른 가열 속도가 장점입니다" → "빠른 가열"
   - 예: "손목 보호에 좋은 가벼움" → "가벼움"

## 응답 형식 (JSON만)
{
  "refinedTags": {
    "pcode1": ["태그1", "태그2", "태그3"],
    "pcode2": ["태그1", "태그2"]
  }
}

JSON만 응답하세요.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const parsed = parseJSONResponse(responseText) as {
    refinedTags?: Record<string, string[]>;
  };

  // 결과 검증 및 보정
  const refinedTags: Record<string, string[]> = {};
  for (const product of products) {
    const tags = parsed.refinedTags?.[product.pcode];
    if (tags && Array.isArray(tags)) {
      // 최대 5개, 빈 문자열 제거
      refinedTags[product.pcode] = tags
        .filter(t => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 5);
    } else {
      // LLM이 해당 제품을 빠뜨렸으면 fallback
      refinedTags[product.pcode] = product.rawTags.slice(0, 5);
    }
  }

  return refinedTags;
}

export async function POST(request: NextRequest): Promise<NextResponse<RefineTagsResponse>> {
  try {
    const body: RefineTagsRequest = await request.json();
    const { products, categoryName } = body;

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'products array is required',
      }, { status: 400 });
    }

    // 태그가 없는 제품은 빈 배열로 처리
    const validProducts = products.map(p => ({
      pcode: p.pcode,
      rawTags: p.rawTags || [],
    }));

    // 모든 제품의 태그가 비어있으면 바로 반환
    const hasAnyTags = validProducts.some(p => p.rawTags.length > 0);
    if (!hasAnyTags) {
      const emptyResult: Record<string, string[]> = {};
      validProducts.forEach(p => { emptyResult[p.pcode] = []; });
      return NextResponse.json({
        success: true,
        data: {
          refinedTags: emptyResult,
          generated_by: 'fallback',
        },
      });
    }

    let refinedTags: Record<string, string[]>;
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable()) {
      try {
        refinedTags = await refineTagsWithLLM(validProducts, categoryName || '제품');
        generated_by = 'llm';
        console.log(`[refine-tags] LLM refined tags for ${products.length} products`);
      } catch (llmError) {
        console.error('[refine-tags] LLM failed, using fallback:', llmError);
        refinedTags = fallbackRefine(validProducts);
      }
    } else {
      console.log('[refine-tags] LLM not available, using fallback');
      refinedTags = fallbackRefine(validProducts);
    }

    return NextResponse.json({
      success: true,
      data: {
        refinedTags,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[refine-tags] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to refine tags',
    }, { status: 500 });
  }
}
