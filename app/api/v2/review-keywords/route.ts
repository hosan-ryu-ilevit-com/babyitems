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
  reviewMetadata?: {
    author: string | null;
    review_date: string | null;
    helpful_count: number;
    rating: number;
    originalIndex: number;
  };
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

    // 1. Supabase에서 리뷰 로드 (고평점 25개 + 저평점 5개)
    const reviewsMap = await getSampledReviewsFromSupabase(pcodes, 35, 5);
    console.log(`[review-keywords-llm] Loaded reviews for ${reviewsMap.size} products`);

    // 2. 각 제품-체감속성 조합에 대해 LLM으로 발췌 (제품별 병렬 처리)
    const result: Record<string, ProductReviewInsights> = {};

    // 제품별 병렬 처리
    const productPromises = pcodes.map(async (pcode) => {
      const reviews = reviewsMap.get(pcode);
      if (!reviews || reviews.totalCount === 0) {
        console.log(`[review-keywords-llm] No reviews for ${pcode}, skipping`);
        return null;
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
          allReviews,
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
          reviewMetadata: excerpt.metadata,
        } as ReviewInsight;
      });

      const resolvedInsights = await Promise.all(insightPromises);
      insights.push(...resolvedInsights.filter((i: ReviewInsight | null): i is ReviewInsight => i !== null));

      if (insights.length > 0) {
        return {
          pcode,
          data: {
            reviewCount: reviews.totalCount,
            insights,
          }
        };
      }

      return null;
    });

    // 모든 제품 병렬 처리 완료 대기
    const productResults = await Promise.all(productPromises);

    // 결과 병합
    productResults.forEach(productResult => {
      if (productResult) {
        result[productResult.pcode] = productResult.data;
      }
    });

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
 * criteriaId에서 관련 키워드 추출 (힌트용)
 */
function getRelatedKeywords(criteriaId: string): string[] {
  // criteriaId를 언더스코어로 분리하여 기본 키워드 생성
  const baseKeywords = criteriaId.split('_').filter(k => k.length > 2);

  // 추가 관련 키워드 매핑
  const keywordMap: Record<string, string[]> = {
    temperature: ['온도', '보온', '따뜻', '뜨겁', '미지근', '냉각', '식', '열'],
    accuracy: ['정확', '오차', '일정', '안정', '맞', '틀림'],
    cleaning: ['세척', '청소', '씻', '분해', '위생', '깨끗'],
    noise: ['소음', '시끄럽', '조용', '소리', '작동음', '쿵쿵', '윙윙'],
    ease: ['편', '쉽', '간편', '어렵', '힘듦', '복잡'],
    durability: ['내구', '고장', '망가', '튼튼', '약함', '파손', '마모'],
    speed: ['빠르', '느리', '시간', '금방', '오래'],
    suction: ['흡입', '빨', '세기', '강', '약'],
    portability: ['휴대', '무게', '가볍', '무겁', '들고'],
  };

  // criteriaId에 포함된 키워드와 매칭
  const matchedKeywords: string[] = [];
  for (const [key, keywords] of Object.entries(keywordMap)) {
    if (criteriaId.toLowerCase().includes(key)) {
      matchedKeywords.push(...keywords);
    }
  }

  return [...new Set([...baseKeywords, ...matchedKeywords])].slice(0, 10);
}

/**
 * LLM을 사용하여 리뷰에서 체감속성 관련 부분 발췌 + 하이라이팅
 */
async function extractRelevantExcerpt(
  reviews: Array<{
    text: string;
    rating: number;
    author?: string | null;
    review_date?: string | null;
    helpful_count?: number;
  }>,
  criteriaName: string,
  criteriaId: string,
  productTitle: string
): Promise<{
  text: string;
  isPositive: boolean;
  metadata?: {
    author: string | null;
    review_date: string | null;
    helpful_count: number;
    rating: number;
    originalIndex: number;
  };
} | null> {
  try {
    // 리뷰를 하나의 텍스트로 결합 (번호 매기기)
    const reviewsText = reviews
      .map((r, i) => `[리뷰${i + 1}]\n${r.text}`)
      .join('\n\n');

    // 관련 키워드 추출
    const keywords = getRelatedKeywords(criteriaId);
    const keywordsHint = keywords.length > 0 ? `\n관련 키워드 (참고용): ${keywords.join(', ')}` : '';

    const prompt = `당신은 제품 리뷰 분석가입니다.
아래는 **"${productTitle}"** 제품의 리뷰입니다.
"${criteriaName}" 속성과 관련된 내용을 찾아 발췌하세요.${keywordsHint}

## 규칙
1. **단일 리뷰 선택 (중요!)**:
   - "${criteriaName}"와 가장 관련성 높은 **1개 리뷰만** 선택하세요
   - ❌ 여러 리뷰를 합치지 마세요
   - ✅ 가장 구체적이고 상세한 1개 리뷰를 선택

2. **"${criteriaName}"와 직접/간접적으로 관련된 내용**을 찾으세요
   - 이 제품에 대한 실제 사용 경험 우선
   - 다른 제품과의 비교도 OK (긍정/부정 모두 포함 가능)
   - 유사하거나 관련된 표현도 적극 포함 (예: "온도 정확도" → "온도", "보온", "따뜻함" 등)

3. **발췌 범위**: 선택한 리뷰에서 1~3문장 발췌
   - 1문장도 충분하면 OK
   - 핵심 부분을 **볼드**로 강조

4. **생략 표시**: 앞뒤에 "..." 붙이기

5. **reviewIndex 반환 필수**: 선택한 리뷰의 번호를 반환하세요

## 예시
### 입력 리뷰:
[리뷰1] 가격 대비 괜찮아요
[리뷰5] 온도가 정확해요. 분유 타기 편합니다. 강추!
[리뷰8] 디자인이 예뻐요

### 체감속성: "온도 정확도"
### 출력:
{
  "found": true,
  "excerpt": "**온도가 정확해요.** 분유 타기 편합니다...",
  "isPositive": true,
  "reviewIndex": 5
}

## 리뷰 (${reviews.length}개)
${reviewsText}

## 출력 (JSON만)
{
  "found": true,
  "excerpt": "...문맥. **핵심 부분.** 문맥...",
  "isPositive": true,
  "reviewIndex": 3
}

관련 내용 없으면:
{
  "found": false,
  "excerpt": null,
  "isPositive": null,
  "reviewIndex": null
}`;

    console.log(`[extractRelevantExcerpt] Processing ${criteriaName} for product ${productTitle} with ${reviews.length} reviews`);

    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.3); // 정확한 발췌를 위해 낮은 temperature 사용
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, 2, 1000);

    console.log(`[extractRelevantExcerpt] Raw LLM response for ${criteriaName}:`, response.substring(0, 200));

    // JSON 파싱
    const parsed = parseJSONResponse(response) as {
      found?: boolean;
      excerpt?: string;
      isPositive?: boolean;
      reviewIndex?: number;
    } | null;

    if (parsed && parsed.found && parsed.excerpt) {
      // reviewIndex로 원본 리뷰 찾기 (1-based → 0-based)
      const reviewIdx = (parsed.reviewIndex || 1) - 1;
      const originalReview = reviews[reviewIdx];

      console.log(`[extractRelevantExcerpt] ✅ Found relevant excerpt for ${criteriaName} (reviewIndex: ${parsed.reviewIndex})`);

      return {
        text: parsed.excerpt,
        isPositive: parsed.isPositive ?? true,
        metadata: originalReview ? {
          author: originalReview.author || null,
          review_date: originalReview.review_date || null,
          helpful_count: originalReview.helpful_count || 0,
          rating: originalReview.rating,
          originalIndex: reviewIdx,
        } : undefined,
      };
    }

    console.log(`[extractRelevantExcerpt] ⚠️ No relevant content found for ${criteriaName}`);
    return null;

  } catch (error) {
    console.error(`[extractRelevantExcerpt] Error for ${criteriaName}:`, error);
    return null;
  }
}

