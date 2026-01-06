/**
 * Knowledge Agent - Final Recommend API
 *
 * 모든 데이터를 종합하여 LLM으로 Top 3 선정
 * - 스펙 매칭 점수
 * - 리뷰 데이터
 * - 밸런스 선택
 * - 단점 필터
 * - 스펙 정규화 (비교표용)
 * - 장단점 리스트 생성 (Flash Lite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  HardCutProduct,
  BalanceSelection,
  FinalRecommendation,
  FinalRecommendationRequest,
  FinalRecommendationResponse,
  ReviewLite,
} from '@/lib/knowledge-agent/types';

export const maxDuration = 60;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 모델 상수
const FINAL_RECOMMEND_MODEL = 'gemini-2.5-flash-preview-05-20'; // 최종 추천용 (최신 모델)
const SPEC_NORMALIZE_MODEL = 'gemini-2.5-flash-lite'; // 스펙 정규화용
const PROS_CONS_MODEL = 'gemini-2.5-flash-lite'; // 장단점 생성용

/**
 * 리뷰에서 주요 키워드 추출
 */
function extractReviewKeywords(reviews: ReviewLite[]): {
  pros: string[];
  cons: string[];
} {
  const positiveKeywords = ['좋아요', '만족', '추천', '최고', '깨끗', '편리', '빠르', '조용', '예쁘', '튼튼', '가성비'];
  const negativeKeywords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작음'];

  const prosFound = new Set<string>();
  const consFound = new Set<string>();

  for (const review of reviews) {
    const content = review.content.toLowerCase();
    for (const kw of positiveKeywords) {
      if (content.includes(kw)) prosFound.add(kw);
    }
    for (const kw of negativeKeywords) {
      if (content.includes(kw)) consFound.add(kw);
    }
  }

  return {
    pros: Array.from(prosFound),
    cons: Array.from(consFound),
  };
}

// ============================================================================
// 스펙 정규화 (비교표용) - Flash Lite 사용
// ============================================================================

interface NormalizedSpec {
  key: string;
  values: Record<string, string | null>;
}

async function normalizeSpecsForComparison(
  products: HardCutProduct[],
  categoryName: string
): Promise<NormalizedSpec[]> {
  if (!ai || products.length === 0) return [];

  const model = ai.getGenerativeModel({
    model: SPEC_NORMALIZE_MODEL,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  });

  // 각 제품의 스펙 요약 정보를 텍스트로 변환
  const productsSpecText = products.map((p) => {
    return `### 제품 ${p.pcode} (${p.brand || ''} ${p.name})
스펙 요약: ${p.specSummary || '(정보 없음)'}`;
  }).join('\n\n');

  const pcodes = products.map(p => p.pcode);

  const prompt = `당신은 ${categoryName} 스펙 비교 전문가입니다.
아래 ${products.length}개 제품의 스펙 요약 정보를 **비교표 형식**으로 정규화해주세요.

## 제품별 스펙 정보
${productsSpecText}

## 정규화 규칙

### 1. 의미 중심의 스펙 추출
스펙 요약 텍스트에서 제품 간 비교에 유용한 핵심 스펙들을 추출하세요.
예: "용량", "재질", "무게", "크기", "소비전력", "주요 기능", "연결방식", "센서", "배터리" 등

### 2. 동일 의미 스펙 키 통일 (가장 중요!)
같은 의미의 스펙은 하나의 표준 키로 통일하세요:
- "용량", "물통 용량", "물통용량" → **"용량"**
- "재질", "내부 재질", "소재", "바디 소재" → **"재질"**
- "무게", "중량", "제품 무게" → **"무게"**
- "크기", "사이즈", "본체 크기" → **"크기"**
- "연결", "연결방식", "인터페이스" → **"연결방식"**
- "DPI", "해상도", "감도" → **"DPI"**

### 3. 값 정규화
- 한쪽에만 있는 스펙도 포함 (없는 쪽은 null)
- 값은 원본의 수치와 단위를 최대한 유지
- 최소 5개, 최대 10개의 핵심 스펙을 추출

## 응답 JSON 형식
\`\`\`json
{
  "normalizedSpecs": [
    {
      "key": "용량",
      "values": {
        "${pcodes[0]}": "500ml",
        "${pcodes[1]}": "600ml"${pcodes[2] ? `,
        "${pcodes[2]}": "450ml"` : ''}
      }
    }
  ]
}
\`\`\`

JSON만 응답하세요.`;

  try {
    console.log('[Spec Normalize] Normalizing specs for comparison...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.normalizedSpecs && Array.isArray(parsed.normalizedSpecs)) {
        console.log(`[Spec Normalize] Extracted ${parsed.normalizedSpecs.length} spec keys`);
        return parsed.normalizedSpecs;
      }
    }
  } catch (error) {
    console.error('[Spec Normalize] Error:', error);
  }

  return [];
}

// ============================================================================
// 장단점 리스트 생성 - Flash Lite 사용
// ============================================================================

interface ProductProsConsResult {
  pcode: string;
  pros: string[];
  cons: string[];
}

async function generateProsConsForProducts(
  products: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  categoryName: string
): Promise<ProductProsConsResult[]> {
  if (!ai || products.length === 0) return [];

  const model = ai.getGenerativeModel({
    model: PROS_CONS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
  });

  // 사용자 컨텍스트 정리
  const userContext = Object.entries(collectedInfo)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  // 각 제품별 정보 + 리뷰 구성
  const productInfos = products.map((p) => {
    const productReviews = reviews[p.pcode] || [];
    const reviewTexts = productReviews.slice(0, 5).map((r, i) => 
      `[리뷰${i+1}] ${r.rating}점: "${r.content.slice(0, 80)}..."`
    ).join('\n');

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `## 역할
${categoryName} 전문가로서 각 상품의 장점과 단점을 정리합니다.

## 사용자 컨텍스트
${userContext}

## 상품 정보
${productInfos}

## 작성 규칙
1. **스펙 기반**: 제품 스펙에서 명확한 장점/단점 도출
2. **리뷰 기반**: 실제 사용자 리뷰에서 자주 언급되는 포인트
3. **사용자 맥락 반영**: 사용자가 중요시하는 조건과 연관지어 작성
4. **구체적 표현**: "좋다"가 아닌 "무게가 가벼워 휴대가 편함" 식으로
5. 각 상품당 장점 3개, 단점 2개

## 응답 JSON
{
  "results": [
    {
      "pcode": "상품코드",
      "pros": ["장점1 (구체적, 15자 내외)", "장점2", "장점3"],
      "cons": ["단점1 (구체적, 15자 내외)", "단점2"]
    }
  ]
}

⚠️ JSON만 출력하세요.`;

  try {
    console.log('[Pros/Cons] Generating for products...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.results && Array.isArray(parsed.results)) {
        console.log(`[Pros/Cons] Generated for ${parsed.results.length} products`);
        return parsed.results;
      }
    }
  } catch (error) {
    console.error('[Pros/Cons] Error:', error);
  }

  // Fallback: 리뷰 키워드 추출 기반
  return products.map(p => {
    const { pros, cons } = extractReviewKeywords(reviews[p.pcode] || []);
    return {
      pcode: p.pcode,
      pros: pros.slice(0, 3),
      cons: cons.slice(0, 2),
    };
  });
}

/**
 * LLM으로 Top 3 선정 (최신 모델 사용)
 */
async function generateRecommendations(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[]
): Promise<FinalRecommendation[]> {
  if (!ai) {
    // AI 없으면 점수 기반 정렬
    return candidates.slice(0, 3).map((p, i) => ({
      rank: i + 1,
      pcode: p.pcode,
      product: p,
      reason: `스펙 매칭 점수 ${p.matchScore}점으로 상위에 선정되었습니다.`,
      highlights: p.matchedConditions.slice(0, 3),
    }));
  }

  // 최신 모델 사용 (gemini-2.5-flash-preview-05-20)
  const model = ai.getGenerativeModel({
    model: FINAL_RECOMMEND_MODEL,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2000,
    },
  });
  
  console.log(`[FinalRecommend] Using model: ${FINAL_RECOMMEND_MODEL}`);

  // 후보 상품 정보 구성 (리뷰 더 자세히 포함)
  const candidateInfo = candidates.map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const { pros, cons } = extractReviewKeywords(productReviews);

    // 리뷰 전문 포함 (최대 5개, 80자까지)
    const detailedReviews = productReviews.slice(0, 5).map((r, idx) =>
      `  [리뷰${idx + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
    ).join('\n');

    return `
### ${i + 1}. ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 평점: ${p.rating}점 (리뷰 ${p.reviewCount}개)
- 스펙 매칭 점수: ${p.matchScore}점
- 스펙: ${p.specSummary || '정보 없음'}
- 매칭된 조건: ${p.matchedConditions.join(', ') || '없음'}
- 리뷰 키워드: 장점[${pros.join(', ')}] / 단점[${cons.join(', ')}]
- 실제 리뷰:
${detailedReviews || '  (리뷰 없음)'}`;
  }).join('\n');

  const prompt = `## 역할
당신은 ${categoryName} 구매 전문 컨설턴트입니다.
사용자의 요구사항과 리뷰 데이터를 종합하여 최적의 상품 3개를 추천해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 사용자 프로필
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 질문 응답
${Object.entries(collectedInfo).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

### 우선순위 (밸런스 게임)
${balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n') || '없음'}

### 피하고 싶은 단점
${negativeSelections.join(', ') || '없음'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 후보 상품 (${candidates.length}개)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${candidateInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 추천 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **밸런스 선택 반영**: 사용자가 선택한 가치 우선
2. **단점 회피**: 피하고 싶다고 한 단점이 리뷰에 자주 언급되면 감점
3. **리뷰 기반 검증**: 스펙뿐 아니라 실제 사용자 경험 반영
4. **다양성**: 가능하면 다른 가격대/브랜드 포함
5. **리뷰 인용 필수**: reason에 반드시 실제 리뷰 내용을 인용하여 신뢰감 있게 설명

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 형식 (JSON만 출력)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "recommendations": [
    {
      "rank": 1,
      "pcode": "상품코드 (정확히 입력)",
      "reason": "추천 이유 한줄평 (리뷰 인용 포함, 예: '실제 사용자들이 \"조용하고 세척 편해요\"라고 평가했어요')",
      "highlights": ["핵심 장점 1", "핵심 장점 2", "핵심 장점 3"],
      "concerns": ["주의점 (있다면, 리뷰 기반)"],
      "bestFor": "이런 분께 추천",
      "reviewQuotes": ["인용할 리뷰 1 (20자 내외)", "인용할 리뷰 2"]
    }
  ],
  "summary": "전체 추천 요약 (1-2문장)"
}

⚠️ JSON만 출력하세요. 다른 텍스트 없이.
⚠️ reason에는 반드시 실제 리뷰 내용을 "따옴표"로 인용하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // 결과 구성
      return (parsed.recommendations || []).slice(0, 3).map((rec: any, i: number) => {
        const product = candidates.find(c => c.pcode === rec.pcode);
        if (!product) {
          // pcode가 없으면 순서대로 매핑
          const fallbackProduct = candidates[i];
          return {
            rank: i + 1,
            pcode: fallbackProduct?.pcode || '',
            product: fallbackProduct,
            reason: rec.reason || '',
            highlights: rec.highlights || [],
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            reviewQuotes: rec.reviewQuotes || [],
          };
        }

        return {
          rank: rec.rank || i + 1,
          pcode: rec.pcode,
          product,
          reason: rec.reason || '',
          highlights: rec.highlights || [],
          concerns: rec.concerns,
          bestFor: rec.bestFor,
          reviewQuotes: rec.reviewQuotes || [],
        };
      });
    }
  } catch (error) {
    console.error('[FinalRecommend] LLM error:', error);
  }

  // 실패 시 점수 기반 정렬 (리뷰에서 첫 번째 내용 인용)
  return candidates.slice(0, 3).map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const sampleQuotes = productReviews.slice(0, 2).map(r => r.content.slice(0, 30));
    return {
      rank: i + 1,
      pcode: p.pcode,
      product: p,
      reason: sampleQuotes.length > 0
        ? `실제 사용자들이 "${sampleQuotes[0]}..."라고 평가한 제품입니다.`
        : `스펙 매칭 점수 ${p.matchScore}점으로 상위에 선정되었습니다.`,
      highlights: p.matchedConditions.slice(0, 3),
      reviewQuotes: sampleQuotes,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: FinalRecommendationRequest = await request.json();
    const {
      categoryKey,
      categoryName,
      candidates,
      reviews,
      collectedInfo,
      balanceSelections,
      negativeSelections,
    } = body;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No candidates provided',
      });
    }

    console.log(`\n🏆 [FinalRecommend] Starting: ${candidates.length}개 후보`);
    const startTime = Date.now();
    const catName = categoryName || categoryKey;

    // ============================================================================
    // 병렬 실행: LLM 추천 생성 + 스펙 정규화 + 장단점 생성
    // ============================================================================
    const [recommendations, normalizedSpecs, prosConsResults] = await Promise.all([
      // 1. LLM으로 Top 3 선정
      generateRecommendations(
        catName,
        candidates,
        reviews || {},
        collectedInfo || {},
        balanceSelections || [],
        negativeSelections || []
      ),
      // 2. 스펙 정규화 (Top 후보 3개만)
      normalizeSpecsForComparison(
        candidates.slice(0, 3),
        catName
      ),
      // 3. 장단점 생성 (Top 후보 3개만)
      generateProsConsForProducts(
        candidates.slice(0, 3),
        reviews || {},
        collectedInfo || {},
        catName
      ),
    ]);

    // ============================================================================
    // 결과 병합: 각 추천 상품에 정규화된 스펙, 장단점, 리뷰 추가
    // ============================================================================
    const enrichedRecommendations = recommendations.map((rec) => {
      // 장단점 찾기
      const prosConsData = prosConsResults.find(pc => pc.pcode === rec.pcode);
      
      // 정규화된 스펙 객체로 변환
      const normalizedSpecsObj: Record<string, string> = {};
      normalizedSpecs.forEach((spec) => {
        const value = spec.values[rec.pcode];
        if (value) {
          normalizedSpecsObj[spec.key] = value;
        }
      });

      // 해당 상품의 리뷰 목록
      const productReviews = reviews?.[rec.pcode] || [];

      return {
        ...rec,
        // 정규화된 스펙 (비교표용)
        normalizedSpecs: normalizedSpecsObj,
        // LLM 생성 장단점
        prosFromReviews: prosConsData?.pros || rec.highlights || [],
        consFromReviews: prosConsData?.cons || rec.concerns || [],
        // 리뷰 목록 (PLP 표시용)
        reviews: productReviews,
      };
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FinalRecommend] 완료: Top ${recommendations.length} 선정 (${(elapsedMs / 1000).toFixed(1)}초)`);
    console.log(`   - 정규화된 스펙: ${normalizedSpecs.length}개 키`);
    console.log(`   - 장단점 생성: ${prosConsResults.length}개 상품`);

    // 응답에 정규화된 스펙 키 목록도 포함 (비교표 렌더링용)
    const response = {
      success: true,
      recommendations: enrichedRecommendations,
      summary: `${catName} 추천 Top ${recommendations.length}`,
      // 추가 데이터
      specKeys: normalizedSpecs.map(s => s.key),
      normalizedSpecs,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[FinalRecommend] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
