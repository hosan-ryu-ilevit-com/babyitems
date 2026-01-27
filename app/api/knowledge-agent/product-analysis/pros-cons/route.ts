/**
 * Knowledge Agent - Pros/Cons API
 *
 * 비교표용 장단점 생성 (리뷰 기반)
 * - prosFromReviews: 장점 3가지
 * - consFromReviews: 단점 2가지
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  name: string;
  brand?: string;
  price?: number;
  specSummary?: string;
  reviews?: Array<{
    content: string;
    rating: number;
  }>;
}

// 결과 타입
interface ProsConsResult {
  pcode: string;
  pros: string[];
  cons: string[];
}

// 요청 타입
interface ProsConsRequest {
  categoryName: string;
  products: ProductInfo[];
}

// 응답 타입
interface ProsConsResponse {
  success: boolean;
  data?: {
    results: ProsConsResult[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

// 리뷰 정성 분석 (간소화 버전)
function analyzeReviewsForProsCons(reviews: Array<{ rating: number; content: string }>): {
  avgRating: number;
  topMentions: string[];
  keyInsights: string[];
} {
  if (reviews.length === 0) {
    return { avgRating: 0, topMentions: [], keyInsights: [] };
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const mentionCounter: Record<string, number> = {};
  const keyInsights: string[] = [];

  const featurePatterns = [
    /(세척|청소|분해|조립|설치|배송|소음|무게|크기|용량|디자인|품질|가성비)/gi,
  ];

  reviews.forEach(r => {
    featurePatterns.forEach(pattern => {
      const matches = r.content.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const key = m.toLowerCase();
          mentionCounter[key] = (mentionCounter[key] || 0) + 1;
        });
      }
    });

    // 핵심 인사이트 추출
    if (r.content.length > 50) {
      if (r.rating >= 4.5 && keyInsights.length < 3) {
        keyInsights.push(`[👍${r.rating}점] ${r.content.slice(0, 50)}...`);
      } else if (r.rating <= 2.5 && keyInsights.length < 5) {
        keyInsights.push(`[⚠️${r.rating}점] ${r.content.slice(0, 50)}...`);
      }
    }
  });

  const topMentions = Object.entries(mentionCounter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k]) => k);

  return { avgRating, topMentions, keyInsights };
}

// Fallback 생성
function generateSingleFallback(product: ProductInfo): ProsConsResult {
  const reviews = product.reviews || [];
  const highRated = reviews.filter(r => r.rating >= 4);
  const lowRated = reviews.filter(r => r.rating <= 2);

  const pros: string[] = [];
  const cons: string[] = [];

  if (highRated.length > 0) {
    pros.push('**품질**: 실사용자 만족도가 높아요');
    if (highRated.some(r => r.content.includes('가성비'))) pros.push('**가성비**: 가격 대비 만족도가 좋아요');
    if (highRated.some(r => r.content.includes('디자인'))) pros.push('**디자인**: 예쁜 디자인이라는 평가가 많아요');
  }

  if (lowRated.length > 0) {
    if (lowRated.some(r => r.content.includes('배송'))) cons.push('**배송**: 배송 관련 불만이 일부 있어요');
    else cons.push('**고려사항**: 일부 사용자 불만이 있어요');
  }

  return {
    pcode: product.pcode,
    pros: pros.length > 0 ? pros : ['**선택**: 인기 제품이에요'],
    cons: cons.length > 0 ? cons : ['**가격**: 예산을 고려해주세요'],
  };
}

function generateProsConsFallback(products: ProductInfo[]): ProsConsResult[] {
  return products.map(generateSingleFallback);
}

async function generateProsConsWithLLM(
  products: ProductInfo[],
  categoryName: string
): Promise<ProsConsResult[]> {
  if (!ai || products.length === 0) {
    return generateProsConsFallback(products);
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.2, maxOutputTokens: 8000 },
  });

  // 각 제품별 정보 구성
  const productInfos = products.map(p => {
    const reviews = p.reviews || [];
    const analysis = analyzeReviewsForProsCons(reviews);
    const reviewTexts = reviews.slice(0, 7).map((r, i) =>
      `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
    ).join('\n');

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰 분석: 평균 ${analysis.avgRating.toFixed(1)}점
- 자주 언급: ${analysis.topMentions.join(', ') || '없음'}
- 리뷰 원문:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `## 역할
${categoryName} 전문가로서 각 상품의 장단점을 정리합니다.

## 상품 + 리뷰 정보
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✍️ 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 데이터 우선순위
1. **리뷰가 있으면**: 리뷰 내용 기반으로 장단점 작성
2. **리뷰가 없으면**: 스펙/가격/브랜드 정보 기반으로 장단점 작성

### 장점 (pros) - 3가지
- **사용자가 얻게 되는 구체적 이익(Benefit)**을 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**압도적 분사력**: 거실 전체가 금방 촉촉해져요")

### 단점 (cons) - 2가지
- **"구매 전 고려해야 할 현실적 특징(Trade-off)"**으로 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**소음**: 터보 모드에서는 팬 소리가 들릴 수 있어요")

## 📤 응답 JSON
{
  "results": [
    {
      "pcode": "상품코드",
      "pros": ["**키워드**: 장점1", "**키워드**: 장점2", "**키워드**: 장점3"],
      "cons": ["**키워드**: 고려사항1", "**키워드**: 고려사항2"]
    }
  ]
}

⚠️ JSON만 출력
⚠️ 반드시 모든 제품(${products.length}개)에 대해 pros 3개, cons 2개씩 생성`;

  try {
    console.log('[pros-cons] Generating with LLM for', products.length, 'products...');
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.results && Array.isArray(parsed.results)) {
        console.log('[pros-cons] LLM generated for', parsed.results.length, 'products');

        // 디버깅: LLM이 반환한 pcode들 확인
        const llmPcodes = parsed.results.map((r: ProsConsResult) => ({
          pcode: r.pcode,
          type: typeof r.pcode,
          prosCount: r.pros?.length || 0,
        }));
        console.log('[pros-cons] LLM returned pcodes:', JSON.stringify(llmPcodes));

        // 입력 제품 pcode들
        const inputPcodes = products.map(p => ({ pcode: p.pcode, type: typeof p.pcode }));
        console.log('[pros-cons] Input pcodes:', JSON.stringify(inputPcodes));

        // 누락된 제품 fallback 처리 (pcode trim 적용)
        const resultMap = new Map(
          parsed.results.map((r: ProsConsResult) => [String(r.pcode).trim(), r])
        );

        return products.map(p => {
          const pcodeTrimmed = String(p.pcode).trim();
          const match = resultMap.get(pcodeTrimmed) as ProsConsResult | undefined;

          if (match && match.pros?.length > 0) {
            return match;
          }

          // 디버깅: fallback 사유
          if (!match) {
            console.log(`[pros-cons] Fallback: pcode ${pcodeTrimmed} not found in LLM results`);
          } else if (!match.pros || match.pros.length === 0) {
            console.log(`[pros-cons] Fallback: pcode ${pcodeTrimmed} has empty pros`);
          }

          return generateSingleFallback(p);
        });
      }
    }
  } catch (error) {
    console.error('[pros-cons] LLM error:', error);
  }

  return generateProsConsFallback(products);
}

export async function POST(request: NextRequest): Promise<NextResponse<ProsConsResponse>> {
  try {
    const body: ProsConsRequest = await request.json();
    const { categoryName, products } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    console.log(`[pros-cons] Processing ${products.length} products for ${categoryName}`);

    const results = await generateProsConsWithLLM(products, categoryName);
    const generated_by = ai ? 'llm' : 'fallback';

    console.log(`[pros-cons] Complete: ${results.length} results (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        results,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[pros-cons] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate pros/cons' },
      { status: 500 }
    );
  }
}
