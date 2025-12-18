/**
 * LLM 기반 지능형 리뷰 발췌 API
 * Supabase에서 실시간으로 리뷰를 로드하고,
 * LLM이 체감속성과 관련된 부분을 발췌 + 하이라이팅
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSampledReviewsFromSupabase } from '@/lib/review/supabase-analyzer';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import { loadProductById } from '@/lib/data/productLoader';

interface ReviewInsight {
  criteriaId: string;
  criteriaName: string;
  totalMentions: number;
  positiveRatio: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  topSample: string | null;
}

interface ProductReviewInsights {
  reviewCount: number;
  insights: ReviewInsight[];
}

interface RequestBody {
  categoryKey: string;
  pcodes: string[];
  criteria: Array<{ id: string; label: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { categoryKey, pcodes, criteria } = body;

    console.log(`[review-keywords-llm] Request:`, { categoryKey, pcodes: pcodes.length, criteria: criteria.length });

    if (!pcodes || pcodes.length === 0 || !criteria || criteria.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pcodes and criteria are required' },
        { status: 400 }
      );
    }

    // 1. Supabase에서 리뷰 로드 (고평점 10개 + 저평점 5개)
    const reviewsMap = await getSampledReviewsFromSupabase(pcodes, 10, 5);
    console.log(`[review-keywords-llm] Loaded reviews for ${reviewsMap.size} products`);

    // 2. 각 제품-체감속성 조합에 대해 LLM으로 발췌
    const result: Record<string, ProductReviewInsights> = {};

    for (const pcode of pcodes) {
      const reviews = reviewsMap.get(pcode);
      if (!reviews || reviews.totalCount === 0) {
        console.log(`[review-keywords-llm] No reviews for ${pcode}, skipping`);
        continue;
      }

      // 제품 정보 로드 (제목 필요)
      const product = await loadProductById(pcode);
      const productTitle = product?.title || `제품 ${pcode}`;

      if (!product) {
        console.log(`[review-keywords-llm] Product not found for ${pcode}, using fallback title`);
      }

      const insights: ReviewInsight[] = [];

      // 각 체감속성에 대해 병렬 처리
      const insightPromises = criteria.map(async (criterion: { id: string; label: string }) => {
        const criteriaName = criterion.label;

        // 고평점 리뷰 우선 (긍정적 내용)
        const allReviews = [...reviews.high, ...reviews.low];
        if (allReviews.length === 0) {
          return null;
        }

        // LLM으로 관련 리뷰 발췌
        const excerpt = await extractRelevantExcerpt(
          allReviews.map(r => r.text),
          criteriaName,
          criterion.id,
          productTitle  // 제품명 전달 (fallback 포함)
        );

        if (!excerpt) {
          console.log(`[review-keywords-llm] No relevant excerpt for ${pcode} - ${criteriaName}`);
          return null;
        }

        // sentiment 판단 (간단히: 고평점 리뷰에서 발췌되었으면 positive)
        const sentiment: 'positive' | 'negative' = excerpt.isPositive ? 'positive' : 'negative';

        return {
          criteriaId: criterion.id,
          criteriaName,
          totalMentions: 1, // LLM이 찾았으면 1
          positiveRatio: sentiment === 'positive' ? 1.0 : 0.0,
          sentiment,
          topSample: excerpt.text,
        } as ReviewInsight;
      });

      const resolvedInsights = await Promise.all(insightPromises);
      insights.push(...resolvedInsights.filter((i: ReviewInsight | null): i is ReviewInsight => i !== null));

      if (insights.length > 0) {
        result[pcode] = {
          reviewCount: reviews.totalCount,
          insights,
        };
      }
    }

    console.log(`[review-keywords-llm] Generated insights for ${Object.keys(result).length} products`);

    return NextResponse.json({
      success: true,
      data: result,
      generated_by: 'llm',
    });

  } catch (error) {
    console.error('[review-keywords-llm] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * LLM을 사용하여 리뷰에서 체감속성 관련 부분 발췌 + 하이라이팅
 */
async function extractRelevantExcerpt(
  reviews: string[],
  criteriaName: string,
  criteriaId: string,
  productTitle: string
): Promise<{ text: string; isPositive: boolean } | null> {
  try {
    // 리뷰를 하나의 텍스트로 결합 (번호 매기기)
    const reviewsText = reviews
      .map((r, i) => `[리뷰${i + 1}]\n${r}`)
      .join('\n\n');

    const prompt = `당신은 제품 리뷰 분석가입니다.
아래는 **"${productTitle}"** 제품의 리뷰입니다.
"${criteriaName}" 속성과 관련된 내용을 찾아 발췌하세요.

## 규칙
1. **"${criteriaName}"와 관련된 내용**을 찾으세요
   - 이 제품에 대한 직접적인 평가 우선
   - 다른 제품과의 긍정적 비교는 포함 가능 (예: "이전 제품보다 좋다")
   - 다른 제품의 단점만 언급하는 내용은 제외

2. **문장 개수**: 최대 3문장 (핵심 문장 1개 + 앞뒤 문맥 각 1문장)
   - 더 짧아도 OK

3. **볼드 처리 필수**:
   - "${criteriaName}"와 가장 관련 깊은 핵심 문장을 **볼드**로 감싸세요
   - 예: "...괜찮아요. **온도가 정말 정확해서 만족합니다.** 추천해요."

4. **생략 표시**: 앞뒤에 "..." 붙이기

## 리뷰 (${reviews.length}개)
${reviewsText}

## 출력 (JSON만)
{
  "found": true,
  "excerpt": "...문맥. **핵심 문장.** 문맥...",
  "isPositive": true
}

관련 내용 없으면:
{
  "found": false,
  "excerpt": null,
  "isPositive": null
}`;

    console.log(`[extractRelevantExcerpt] Processing ${criteriaName} for product ${productTitle} with ${reviews.length} reviews`);

    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.5); // 약간 높은 temperature로 유연한 발췌
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, 2, 1000);

    console.log(`[extractRelevantExcerpt] Raw LLM response for ${criteriaName}:`, response.substring(0, 200));

    // JSON 파싱
    const parsed = parseJSONResponse(response) as { found?: boolean; excerpt?: string; isPositive?: boolean } | null;

    if (parsed && parsed.found && parsed.excerpt) {
      console.log(`[extractRelevantExcerpt] ✅ Found relevant excerpt for ${criteriaName}`);
      return {
        text: parsed.excerpt,
        isPositive: parsed.isPositive ?? true,
      };
    }

    console.log(`[extractRelevantExcerpt] ⚠️ No relevant content found for ${criteriaName}`);
    return null;

  } catch (error) {
    console.error(`[extractRelevantExcerpt] Error for ${criteriaName}:`, error);
    return null;
  }
}

