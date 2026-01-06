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
    }));
  }

  const model = ai.getGenerativeModel({
    model: PROS_CONS_MODEL,
    generationConfig: { temperature: 0.4, maxOutputTokens: 3500 },
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

### 1️⃣ 맞춤형 추천 이유 (oneLiner) - 가장 중요!
- **사용자가 중요시하는 가치**와 **리뷰 원문 인용**을 조합하여 작성
- 반드시 리뷰에서 실제로 언급된 표현("~~", '~~')을 1개 이상 포함
- 40~80자 (2문장 OK, 구체적일수록 좋음)
- 작성 공식: "[사용자 선택 기반 추천 포인트] + [리뷰 인용 근거]"
- 좋은 예시:
  - "세척 편의성 중시하셨죠! '분리가 쉽고 구석구석 씻기 편해요'라는 리뷰 많음"
  - "소음 민감하시다면 추천! 실 구매자 90%가 '조용하다'고 평가했어요"
  - "가성비 우선이시라면, '가격 대비 성능 만족'이란 리뷰가 압도적"
  - "안전성 걱정되셨죠? 'ISOFIX 고정 확실하다'는 후기 다수"
- 나쁜 예시 (너무 일반적):
  - ❌ "피로 회복 집중! 꾸준히 챙기세요"
  - ❌ "인기 제품입니다"
  - ❌ "품질 좋은 제품"

### 2️⃣ 장점 (prosFromReviews)
- 리뷰에서 자주 언급되는 구체적 장점 3개
- 15~25자씩
- 사용자 우선순위와 관련된 내용 우선

### 3️⃣ 단점 (consFromReviews)
- 리뷰에서 언급된 실제 단점 2개 (없으면 빈 배열)
- 15~25자씩
- 사용자가 피하고 싶다고 한 단점은 반드시 언급

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📤 응답 JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "results": [
    {
      "pcode": "상품코드",
      "prosFromReviews": ["장점1", "장점2", "장점3"],
      "consFromReviews": ["단점1", "단점2"],
      "oneLiner": "맞춤형 추천 이유 (40~80자, 리뷰 인용 포함)"
    }
  ]
}

⚠️ JSON만 출력
⚠️ oneLiner는 반드시 리뷰 원문 인용('~~')을 포함하여 작성
⚠️ 일반적인 문구 금지 - 구체적이고 설득력 있게!`;

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
        // oneLiner 검증 및 보정
        const validatedResults = parsed.results.map((r: ProductProsConsResult) => ({
          ...r,
          oneLiner: r.oneLiner && r.oneLiner.trim() ? r.oneLiner.trim() : '',
        }));
        console.log(`[GenerateProsCons] Generated for ${validatedResults.length} products, oneLiners:`, validatedResults.map((r: ProductProsConsResult) => `${r.pcode}: "${r.oneLiner}"`));
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
    const hasReviews = Object.keys(reviews || {}).length > 0 &&
      Object.values(reviews || {}).some(r => r.length > 0);

    if (!hasReviews) {
      console.log('[GenerateProsCons] No reviews available, returning empty results');
      return NextResponse.json({
        success: true,
        results: products.map(p => ({
          pcode: p.pcode,
          prosFromReviews: [],
          consFromReviews: [],
          oneLiner: '',
        })),
      });
    }

    console.log(`\n📝 [GenerateProsCons] Starting: ${products.length}개 상품, 리뷰 ${Object.keys(reviews).length}개 상품`);
    console.log(`[GenerateProsCons] User priorities: ${balanceSelections?.join(', ') || '없음'}`);
    console.log(`[GenerateProsCons] User avoid: ${negativeSelections?.join(', ') || '없음'}`);
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
