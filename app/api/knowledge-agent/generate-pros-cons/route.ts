/**
 * Knowledge Agent - 장단점 재생성 API
 *
 * 리뷰 크롤링 완료 후 호출하여 실제 리뷰 기반 장단점을 생성합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

const PROS_CONS_MODEL = 'gemini-2.5-flash-lite';

interface ReviewLite {
  content: string;
  rating: number;
  author?: string;
  date?: string;
}

interface ProductProsConsResult {
  pcode: string;
  prosFromReviews: string[];
  consFromReviews: string[];
  oneLiner: string; // 한줄평
  comparativeOneLiner: string; // 다른 상품과 비교한 한줄 정리
}

interface RequestBody {
  products: Array<{
    pcode: string;
    name: string;
    brand?: string;
    price?: number;
    specSummary?: string;
    matchedConditions?: string[];
    bestFor?: string;
  }>;
  reviews: Record<string, ReviewLite[]>;
  categoryName: string;
  collectedInfo?: Record<string, string>;
  // 사용자 선택지 (맞춤형 한줄평 생성용)
  balanceSelections?: string[];
  negativeSelections?: string[];
}

/**
 * 리뷰 정성적 분석
 */
function analyzeReviewsQualitative(reviews: ReviewLite[]): {
  avgRating: number;
  sentimentScore: number;
  keyInsights: string[];
} {
  if (reviews.length === 0) {
    return { avgRating: 0, sentimentScore: 0, keyInsights: [] };
  }

  // 평균 별점
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  // 감정 분석 (간단한 키워드 기반)
  const positiveWords = ['좋', '만족', '추천', '최고', '훌륭', '편리', '깨끗', '빠르', '조용', '예쁘', '튼튼', '가성비'];
  const negativeWords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작', '냄새'];

  let positiveCount = 0;
  let negativeCount = 0;
  const keyInsights: string[] = [];

  reviews.forEach(r => {
    const content = r.content.toLowerCase();
    positiveWords.forEach(w => { if (content.includes(w)) positiveCount++; });
    negativeWords.forEach(w => { if (content.includes(w)) negativeCount++; });

    // 핵심 인사이트 추출
    if (r.content.length > 50) {
      if (r.rating >= 4.5) {
        keyInsights.push(`[👍${r.rating}점] ${r.content.slice(0, 60)}...`);
      } else if (r.rating <= 2.5) {
        keyInsights.push(`[⚠️${r.rating}점] ${r.content.slice(0, 60)}...`);
      }
    }
  });

  const totalSentiment = positiveCount + negativeCount;
  const sentimentScore = totalSentiment > 0
    ? (positiveCount - negativeCount) / totalSentiment
    : 0;

  return {
    avgRating: Math.round(avgRating * 10) / 10,
    sentimentScore: Math.round(sentimentScore * 100) / 100,
    keyInsights: keyInsights.slice(0, 3),
  };
}

/**
 * LLM으로 장단점 + 맞춤형 추천 이유 생성
 */
async function generateProsConsWithOneLiner(
  products: RequestBody['products'],
  reviews: Record<string, ReviewLite[]>,
  categoryName: string,
  collectedInfo?: Record<string, string>,
  balanceSelections?: string[],
  negativeSelections?: string[]
): Promise<ProductProsConsResult[]> {
  if (!ai || products.length === 0) {
    return products.map(p => ({
      pcode: p.pcode,
      prosFromReviews: [],
      consFromReviews: [],
      oneLiner: '',
      comparativeOneLiner: '',
    }));
  }

  const model = ai.getGenerativeModel({
    model: PROS_CONS_MODEL,
    generationConfig: { temperature: 0.4, maxOutputTokens: 6000 },
  });

  // 사용자 컨텍스트 (질문 응답)
  const userQA = collectedInfo
    ? Object.entries(collectedInfo).map(([q, a]) => `- ${q}: ${a}`).join('\n')
    : '(없음)';

  // 사용자 우선순위 (밸런스 게임 선택)
  const userPriorities = balanceSelections && balanceSelections.length > 0
    ? balanceSelections.map(s => `- "${s}"`).join('\n')
    : '(없음)';

  // 사용자가 피하고 싶은 단점
  const userAvoid = negativeSelections && negativeSelections.length > 0
    ? negativeSelections.map(s => `- "${s}"`).join('\n')
    : '(없음)';

  // 각 제품별 정보 + 리뷰 구성
  const productInfos = products.map((p) => {
    const productReviews = reviews[p.pcode] || reviews[String(p.pcode)] || [];
    const qualitative = analyzeReviewsQualitative(productReviews);

    // 리뷰 원문 (최대 12개)
    const reviewTexts = productReviews.slice(0, 12).map((r, i) =>
      `[리뷰${i+1}] ${r.rating}점: "${r.content.slice(0, 150)}${r.content.length > 150 ? '...' : ''}"`
    ).join('\n');

    return `### ${p.brand || ''} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString() || '정보없음'}원
- 스펙: ${p.specSummary || '정보 없음'}
- 매칭된 조건: ${p.matchedConditions?.join(', ') || '없음'}
- 추천 포인트: ${p.bestFor || '없음'}
- 리뷰 분석: 평균 ${qualitative.avgRating}점 (${productReviews.length}개 리뷰)
- 리뷰 원문:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `## 역할
당신은 ${categoryName} 전문 컨설턴트입니다.
사용자의 선택과 실제 리뷰를 종합하여, **"왜 이 상품이 이 사용자에게 추천되는지"** 정성적으로 설명합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 👤 사용자 프로필
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 질문 응답
${userQA}

### 중요시하는 가치 (밸런스 게임 선택)
${userPriorities}

### 피하고 싶은 단점
${userAvoid}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📦 추천 상품 + 리뷰 (${products.length}개)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✍️ 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1️⃣ 추천 이유 (oneLiner) - 왜 이 제품이 당신에게 딱 맞는지
- **목표:** 사용자가 선택한 **선호 속성**과 **피하고 싶은 단점**을 기반으로, 이 제품이 왜 딱 맞는 추천인지 확신을 줍니다.
- **작성 톤:** 쇼핑 큐레이터가 옆에서 귓속말하듯 신뢰감 있고 간결하게.
- **구조 (2문장):**
  1. **첫 문장 - 맞춤 포인트:** 사용자가 선택한 선호 속성 또는 피하고 싶은 단점을 직접 언급하며, 이 제품이 그 조건을 어떻게 충족하는지 설명 (예: "세척이 중요하신 분께 딱! 통세척으로 물때 걱정 없어요.", "소음 싫다고 하셨죠? 35dB 저소음으로 밤중에도 조용해요")
  2. **두 번째 문장 - 리뷰 근거:** 실제 리뷰에서 해당 포인트를 뒷받침하는 구체적인 칭찬/평가 인용
- **필수 반영:**
  - 사용자가 선택한 **"중요시하는 가치"** 중 이 제품이 충족하는 것을 언급
  - 또는 사용자가 **"피하고 싶은 단점"**을 이 제품이 회피하는 점을 언급
- **금지:** "당신은 ~를 선택했으므로", "리뷰에 따르면" 같은 기계적인 접속사 사용 금지.
- **길이:** 70~100자 내외 (자연스러운 두 문장)

- **Good Example:**
  - 🤫 **소음 걱정 없이 밤수유 가능해요.** "숨소리보다 조용해서 아기가 깨지 않았다"는 후기가 많아요.
  - 🧼 **세척 편의성 중시하시는 분께 딱!** "통세척 가능해서 매일 청소해도 귀찮지 않다"는 평이 압도적이에요.
  - 💪 **무게 가벼운 제품 찾으셨죠?** "한 손으로도 거뜬히 들어올린다"는 후기 덕에 손목 부담 없어요.
  - ⚡ **느린 가열 싫다고 하셨는데**, 이 제품은 1분 급속 가열로 "새벽에도 바로 먹일 수 있다"는 평을 받았어요.
- **Bad Example:**
  - ❌ 소음을 중요하게 여기셔서 추천해요. 조용하다는 리뷰가 많아요. (기계적)
  - ❌ 좋은 제품입니다. 인기가 많아요. (선호/피하고 싶은 것 언급 없음)
  - ❌ 리뷰에 따르면 세척이 편리합니다. (기계적 접속사)

### 2️⃣ 장점 (prosFromReviews) - 3가지
- 단순 스펙 나열이 아닌 **사용자가 얻게 되는 구체적 이익(Benefit)**을 작성
- 경쟁 제품들과 구별되는 **이 제품만의 고유한 강점(USP)**을 최우선으로 배치
- **형식:** "**키워드**: 구체적 설명" (예: "**압도적 분사력**: 거실 전체가 금방 촉촉해져요")

### 3️⃣ 단점 (consFromReviews) - 2가지
- 제품을 비하하지 말고, **"구매 전 고려해야 할 현실적 특징(Trade-off)"**으로 작성
- 치명적인 결함보다는 사용 환경에 따른 호불호나, 감수할 수 있는 불편함을 언급하여 **신뢰도**를 높이기
- **형식:** "**키워드**: 구체적 설명" (예: "**소음**: 터보 모드에서는 팬 소리가 들릴 수 있어요")
- ❌ "무거워요" → ⭕ "**무게감**: 안정감은 있지만, 자주 이동하기엔 조금 무거워요"

### 4️⃣ 상대 비교 한줄 정리 (comparativeOneLiner) - 다른 상품들과 비교
- **목표:** 이 상품이 다른 추천 상품들과 비교했을 때 **어떤 점에서 차별화되는지** 핵심 포인트로 정리
- **필수 요소:**
  1. **비교 관점:** 가격, 기능, 스펙, 장단점 중 가장 큰 차이점을 강조
  2. **상대적 포지셔닝:** "다른 상품 대비", "가장 ~한", "유일하게 ~" 같은 비교 표현 사용
  3. **볼드 강조:** 핵심 차별점은 **굵게** 표시
- **길이:** 35~60자 (비교 핵심을 짧게)
- **Good Example:**
  - **가격 대비 성능**이 가장 뛰어나며, 세척 편의성도 우수해요
  - 3개 중 **유일하게 무선** 지원, 대신 가격대가 높아요
  - **소음이 가장 적어** 밤중 사용에 최적, 다만 용량은 작은 편이에요
- **Bad Example:**
  - ❌ 좋은 제품입니다 (비교 없음)
  - ❌ 추천합니다 (구체성 없음)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📤 응답 JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "results": [
    {
      "pcode": "12345678",
      "prosFromReviews": ["**저소음**: 35dB로 밤중에도 아기가 깨지 않아요", "**급속가열**: 1분 내 적정 온도 도달", "**통세척**: 분리 없이 물로 헹굼 가능"],
      "consFromReviews": ["**무게감**: 안정감은 있지만 이동 시 무거움", "**가격대**: 입문용 대비 2배 이상"],
      "oneLiner": "🤫 소음 걱정 없이 밤수유 가능해요. \\"숨소리보다 조용해서 아기가 깨지 않았다\\"는 후기가 많아요.",
      "comparativeOneLiner": "3개 중 **소음이 가장 적어** 밤중 사용에 최적이에요"
    }
  ]
}

⚠️ JSON만 출력하세요!
⚠️ oneLiner는 반드시 2문장으로 작성하세요:
   - 첫 문장: 사용자가 선택한 선호/피할단점을 언급하며 이 제품이 어떻게 충족하는지
   - 두 번째 문장: 실제 리뷰 인용 ("~"는 후기가 많아요 / ~는 평이 압도적이에요)
⚠️ oneLiner 길이: 70~100자 (두 문장 합쳐서)
⚠️ comparativeOneLiner는 다른 추천 상품들과의 비교 관점에서 작성
⚠️ 뻔한 문구 금지 - Hook이 있는 카피로!`;

  try {
    console.log(`[GenerateProsCons] Generating for ${products.length} products with reviews...`);
    console.log(`[GenerateProsCons] Review counts per product:`, Object.entries(reviews).map(([k, v]) => `${k}: ${(v as ReviewLite[]).length}`).join(', '));

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log(`[GenerateProsCons] Raw LLM response (first 500 chars):`, responseText.slice(0, 500));

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[GenerateProsCons] Parsed JSON:`, JSON.stringify(parsed, null, 2).slice(0, 1000));

      if (parsed.results && Array.isArray(parsed.results)) {
        // oneLiner 및 comparativeOneLiner 검증 및 보정
        const validatedResults = parsed.results.map((r: ProductProsConsResult) => ({
          ...r,
          oneLiner: r.oneLiner && r.oneLiner.trim() ? r.oneLiner.trim() : '',
          comparativeOneLiner: r.comparativeOneLiner && r.comparativeOneLiner.trim() ? r.comparativeOneLiner.trim() : '',
        }));

        // LLM 응답에서 누락된 상품들에 대해 빈 결과 추가 (pcode 매칭)
        const resultPcodes = new Set(validatedResults.map((r: ProductProsConsResult) => String(r.pcode)));
        const missingProducts = products.filter(p => !resultPcodes.has(String(p.pcode)));

        if (missingProducts.length > 0) {
          console.log(`[GenerateProsCons] ⚠️ Missing ${missingProducts.length} products in LLM response:`, missingProducts.map(p => p.pcode));
          missingProducts.forEach(p => {
            // 리뷰가 있는데 누락된 경우 vs 리뷰가 없어서 누락된 경우 구분
            const hasReviewsForProduct = (reviews[p.pcode] || reviews[String(p.pcode)] || []).length > 0;
            validatedResults.push({
              pcode: p.pcode,
              prosFromReviews: [],
              consFromReviews: [],
              // 리뷰 없는 상품은 스펙 기반 간단 메시지
              oneLiner: hasReviewsForProduct ? '' : (p.specSummary ? `📦 ${p.brand || ''} ${categoryName} 상품` : ''),
              comparativeOneLiner: '',
            });
          });
        }

        console.log(`[GenerateProsCons] Generated for ${validatedResults.length} products, oneLiners:`, validatedResults.map((r: ProductProsConsResult) => `${r.pcode}: "${r.oneLiner}"`));
        console.log(`[GenerateProsCons] comparativeOneLiners:`, validatedResults.map((r: ProductProsConsResult) => `${r.pcode}: "${r.comparativeOneLiner}"`));
        return validatedResults;
      }
    } else {
      console.error(`[GenerateProsCons] No JSON found in response`);
    }
  } catch (error) {
    console.error('[GenerateProsCons] Error:', error);
  }

  // Fallback: 빈 결과 반환
  console.log(`[GenerateProsCons] Returning fallback empty results`);
  return products.map(p => ({
    pcode: p.pcode,
    prosFromReviews: [],
    consFromReviews: [],
    oneLiner: '',
    comparativeOneLiner: '',
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { products, reviews, categoryName, collectedInfo, balanceSelections, negativeSelections } = body;

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No products provided',
      });
    }

    // 리뷰가 있는지 확인
    const reviewKeys = Object.keys(reviews || {});
    const reviewCounts = reviewKeys.map(k => `${k}: ${(reviews[k] || []).length}개`);
    const hasReviews = reviewKeys.length > 0 &&
      Object.values(reviews || {}).some(r => r.length > 0);

    console.log(`[GenerateProsCons] Review check: keys=${reviewKeys.length}, hasReviews=${hasReviews}`);
    console.log(`[GenerateProsCons] Review counts: ${reviewCounts.join(', ') || '(없음)'}`);

    if (!hasReviews) {
      console.log('[GenerateProsCons] ⚠️ No reviews available, returning empty results');
      console.log('[GenerateProsCons] Product pcodes:', products.map(p => p.pcode).join(', '));
      return NextResponse.json({
        success: true,
        results: products.map(p => ({
          pcode: p.pcode,
          prosFromReviews: [],
          consFromReviews: [],
          oneLiner: '',
          comparativeOneLiner: '',
        })),
      });
    }

    console.log(`\n📝 [GenerateProsCons] Starting: ${products.length}개 상품, 리뷰 ${Object.keys(reviews).length}개 상품`);
    console.log(`[GenerateProsCons] User priorities: ${balanceSelections?.join(', ') || '없음'}`);
    console.log(`[GenerateProsCons] User avoid: ${negativeSelections?.join(', ') || '없음'}`);
    console.log(`[GenerateProsCons] collectedInfo: ${JSON.stringify(collectedInfo || {})}`);

    // 상세 디버깅 로그
    console.log(`[GenerateProsCons] === DEBUG DATA ===`);
    products.forEach(p => {
      const reviewKey = p.pcode;
      const reviewKeyStr = String(p.pcode);
      const reviewsForProduct = reviews[reviewKey] || reviews[reviewKeyStr] || [];
      console.log(`  - ${p.brand || ''} ${p.name} (pcode: ${p.pcode})`);
      console.log(`    specSummary: ${p.specSummary?.slice(0, 50) || '(없음)'}...`);
      console.log(`    matchedConditions: ${p.matchedConditions?.join(', ') || '(없음)'}`);
      console.log(`    reviews: ${reviewsForProduct.length}개 (key tried: "${reviewKey}", "${reviewKeyStr}")`);
      if (reviewsForProduct.length > 0) {
        console.log(`    첫 리뷰: "${reviewsForProduct[0].content?.slice(0, 50)}..."`);
      }
    });
    console.log(`[GenerateProsCons] Review keys in request: ${Object.keys(reviews).join(', ')}`);
    console.log(`[GenerateProsCons] === END DEBUG ===`);

    const startTime = Date.now();

    const results = await generateProsConsWithOneLiner(
      products,
      reviews,
      categoryName,
      collectedInfo,
      balanceSelections,
      negativeSelections
    );

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [GenerateProsCons] 완료 (${(elapsedMs / 1000).toFixed(1)}초)`);

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (error) {
    console.error('[GenerateProsCons] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
