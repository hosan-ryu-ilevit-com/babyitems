/**
 * Knowledge Agent - Normalize Specs API
 *
 * 비교표용 스펙 정규화
 * - normalizedSpecs: 제품별로 동일한 스펙 키로 정규화된 값들
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
  specSummary?: string;
}

// 정규화된 스펙 타입
interface NormalizedSpec {
  key: string;
  values: Record<string, string | null>;
}

// 결과 타입
interface NormalizeSpecsResult {
  normalizedSpecs: NormalizedSpec[];
  specsByProduct: Record<string, Record<string, string | null>>;
}

// 요청 타입
interface NormalizeSpecsRequest {
  categoryName: string;
  products: ProductInfo[];
}

// 응답 타입
interface NormalizeSpecsResponse {
  success: boolean;
  data?: {
    result: NormalizeSpecsResult;
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

async function normalizeSpecsForComparison(
  products: ProductInfo[],
  categoryName: string
): Promise<NormalizeSpecsResult> {
  const emptyResult: NormalizeSpecsResult = {
    normalizedSpecs: [],
    specsByProduct: {},
  };

  if (!ai || products.length === 0) {
    return emptyResult;
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  });

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
    console.log('[normalize-specs] Normalizing specs for', products.length, 'products...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.normalizedSpecs && Array.isArray(parsed.normalizedSpecs)) {
        console.log(`[normalize-specs] Extracted ${parsed.normalizedSpecs.length} spec keys`);

        // specsByProduct 생성
        const specsByProduct: Record<string, Record<string, string | null>> = {};
        products.forEach(product => {
          const productSpecs: Record<string, string | null> = {};
          parsed.normalizedSpecs.forEach((spec: NormalizedSpec) => {
            productSpecs[spec.key] = spec.values[product.pcode] || null;
          });
          specsByProduct[product.pcode] = productSpecs;
        });

        return {
          normalizedSpecs: parsed.normalizedSpecs,
          specsByProduct,
        };
      }
    }
  } catch (error) {
    console.error('[normalize-specs] Error:', error);
  }

  return emptyResult;
}

export async function POST(request: NextRequest): Promise<NextResponse<NormalizeSpecsResponse>> {
  try {
    const body: NormalizeSpecsRequest = await request.json();
    const { categoryName, products } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    console.log(`[normalize-specs] Processing ${products.length} products for ${categoryName}`);

    const result = await normalizeSpecsForComparison(products, categoryName);
    const generated_by = ai && result.normalizedSpecs.length > 0 ? 'llm' : 'fallback';

    console.log(`[normalize-specs] Complete: ${result.normalizedSpecs.length} spec keys (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        result,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[normalize-specs] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to normalize specs' },
      { status: 500 }
    );
  }
}
