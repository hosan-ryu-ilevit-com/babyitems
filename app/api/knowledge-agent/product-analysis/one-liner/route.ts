/**
 * Knowledge Agent - One-Liner API
 *
 * PDP 탭 위에 표시되는 제품 한줄 평 생성
 * - oneLiner: 50-80자, 이모지 포함, 핵심 강점 요약
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
  recommendReason?: string;
  reviews?: Array<{
    content: string;
    rating: number;
  }>;
}

// 결과 타입
interface OneLinerResult {
  pcode: string;
  oneLiner: string;
}

// 요청 타입
interface OneLinerRequest {
  categoryName: string;
  products: ProductInfo[];
}

// 응답 타입
interface OneLinerResponse {
  success: boolean;
  data?: {
    results: OneLinerResult[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

function generateFallbackOneLiner(product: ProductInfo): OneLinerResult {
  return {
    pcode: product.pcode,
    oneLiner: `✨ ${product.brand || ''} ${product.name?.slice(0, 30) || ''}`,
  };
}

async function generateOneLinersWithLLM(
  products: ProductInfo[],
  categoryName: string
): Promise<OneLinerResult[]> {
  if (!ai || products.length === 0) {
    return products.map(generateFallbackOneLiner);
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2000,
    },
  });

  // 각 제품별 정보 구성
  const productInfos = products.map(p => {
    const reviews = p.reviews || [];
    const reviewTexts = reviews.slice(0, 5).map((r, i) =>
      `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}"`
    ).join('\n');

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 추천 이유: ${p.recommendReason || '정보 없음'}
- 리뷰:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
각 제품의 핵심 강점을 담은 한줄 평(oneLiner)을 작성해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 제품 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## oneLiner (한줄 평) 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**용도**: PDP 탭 위에 표시되는 제품의 핵심 강점
**길이**: 50-80자
**형식**: 이모지 + 핵심 강점 + 리뷰 인용

### ✅ Good Examples
- 🤫 **밤잠 예민한 분들도 걱정 없는 정숙함!** 수면풍 모드가 있어 조용히 사용 가능해요
- ⚡ **빠른 가열로 바쁜 아침도 여유롭게!** 리뷰에서 '20분이면 완성'이라는 평가가 많아요
- 💪 **스테인리스 내솥으로 오래 사용해도 안심!** 코팅 벗겨짐 걱정 없다는 리뷰 다수
- 🎯 **정확한 온도 제어로 완벽한 요리!** 사용자들이 '요리가 한결 쉬워졌다'고 평가해요
- 💧 **강력한 분사력으로 촉촉한 공간!** 거실 전체가 금방 촉촉해진다는 후기가 많아요

### 작성 규칙
1. **제품 중심** - 제품 자체의 강점 표현 (사용자 조건 무관)
2. **구체적 근거** - 스펙이나 리뷰에서 확인 가능한 내용만
3. **자연스러운 톤** - 친근하면서도 신뢰감 있게
4. **금지 패턴** - "실제 사용자들이...", "리뷰에 따르면..." 사용 금지
5. **이모지 필수** - 앞에 적절한 이모지 1개 포함

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 JSON 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "results": [
    {
      "pcode": "상품코드",
      "oneLiner": "이모지 + 한줄 평 (50-80자)"
    }
  ]
}

⚠️ JSON만 출력
⚠️ 반드시 모든 제품(${products.length}개)에 대해 생성`;

  try {
    console.log('[one-liner] Generating with LLM for', products.length, 'products...');
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.results && Array.isArray(parsed.results)) {
        console.log('[one-liner] LLM generated for', parsed.results.length, 'products');
        // 누락된 제품 fallback 처리
        const resultMap = new Map(parsed.results.map((r: OneLinerResult) => [String(r.pcode), r]));
        return products.map(p => {
          const match = resultMap.get(String(p.pcode)) as OneLinerResult | undefined;
          if (match && match.oneLiner) {
            return match;
          }
          return generateFallbackOneLiner(p);
        });
      }
    }
  } catch (error) {
    console.error('[one-liner] LLM error:', error);
  }

  return products.map(generateFallbackOneLiner);
}

export async function POST(request: NextRequest): Promise<NextResponse<OneLinerResponse>> {
  try {
    const body: OneLinerRequest = await request.json();
    const { categoryName, products } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    console.log(`[one-liner] Processing ${products.length} products for ${categoryName}`);

    const results = await generateOneLinersWithLLM(products, categoryName);
    const generated_by = ai ? 'llm' : 'fallback';

    console.log(`[one-liner] Complete: ${results.length} results (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        results,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[one-liner] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate one-liners' },
      { status: 500 }
    );
  }
}
