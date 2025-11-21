import { NextRequest, NextResponse } from 'next/server';
import { loadProductDetails, loadProductById } from '@/lib/data/productLoader';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';

/**
 * POST /api/compare
 * Use LLM to generate smart, concise pros/cons and comparisons
 */
export async function POST(req: NextRequest) {
  try {
    const { productIds } = await req.json();

    if (!productIds || !Array.isArray(productIds) || productIds.length !== 3) {
      return NextResponse.json(
        { error: 'Exactly 3 product IDs required' },
        { status: 400 }
      );
    }

    // Load product data and markdown for all 3 products
    const productsData = await Promise.all(
      productIds.map(async (id) => {
        const product = await loadProductById(id);
        const markdown = await loadProductDetails(id);
        return { id, product, markdown };
      })
    );

    // Filter out any missing products and cast to correct type
    const validProducts = productsData.filter((p): p is { id: string; product: any; markdown: string } =>
      p.product !== null && p.markdown !== null
    );

    if (validProducts.length !== 3) {
      return NextResponse.json(
        { error: 'Could not load all products' },
        { status: 400 }
      );
    }

    // Generate smart summaries using LLM
    const results: Record<string, { pros: string[]; cons: string[]; comparison: string }> = {};

    for (let i = 0; i < validProducts.length; i++) {
      const currentProduct = validProducts[i];
      const otherProducts = validProducts.filter((_, idx) => idx !== i);

      try {
        const summary = await generateProductSummary(
          currentProduct,
          otherProducts
        );
        results[currentProduct.id] = summary;
      } catch (error) {
        console.error(`Failed to generate summary for ${currentProduct.id}:`, error);
        results[currentProduct.id] = {
          pros: [],
          cons: [],
          comparison: ''
        };
      }
    }

    return NextResponse.json({ productDetails: results });
  } catch (error) {
    console.error('Compare API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate smart, concise pros/cons and comparison using LLM
 */
async function generateProductSummary(
  currentProduct: { id: string; product: any; markdown: string },
  otherProducts: { id: string; product: any; markdown: string }[]
) {
  const cv = currentProduct.product.coreValues;

  const prompt = `당신은 분유포트 제품 비교 전문가입니다. 3개의 제품을 비교하는 표를 작성 중입니다.

**현재 제품:**
- 이름: ${currentProduct.product.title}
- 가격: ${currentProduct.product.price.toLocaleString()}원

**핵심 속성 점수 (1-10점):**
- 온도 조절/유지: ${cv.temperatureControl}/10
- 위생/세척: ${cv.hygiene}/10
- 소재/안전성: ${cv.material}/10
- 사용 편의성: ${cv.usability}/10
- 휴대성: ${cv.portability}/10
- 부가 기능: ${cv.additionalFeatures}/10

**상세 분석 (여기서 구체적 스펙을 추출하세요!):**
${currentProduct.markdown}

**비교 대상 제품들:**
${otherProducts.map((p, idx) => `
${idx + 1}. ${p.product.title} (${p.product.price.toLocaleString()}원)
   - 온도: ${p.product.coreValues.temperatureControl}/10, 위생: ${p.product.coreValues.hygiene}/10
   - 소재: ${p.product.coreValues.material}/10, 편의성: ${p.product.coreValues.usability}/10
${p.markdown.substring(0, 1000)}...
`).join('\n')}

**요청사항:**
1. **장점 3개** (각 35자 이내):
   - 반드시 **구체적인 기능, 스펙, 소재명**을 명시하세요!
   - **마크다운 상세 분석**에서 실제로 언급된 내용만 추출하세요!
   - ✅ 좋은 예: "43℃ 자동 냉각 기능", "SUS304 스테인리스 내부", "분리형 뚜껑으로 세척 간편", "24시간 보온 가능"
   - ❌ 절대 금지: "온도 조절 우수", "휴대성 높음", "위생 점수 8/10", "세척 편리", "사용 간편"
   - **"높음", "낮음", "우수", "미흡", "점수", "/10" 같은 표현 사용 시 0점 처리됩니다!**

2. **주의점 3개** (각 35자 이내):
   - 구체적인 **문제점, 제약사항**만 명시하세요
   - ✅ 좋은 예: "2시간 이상 보온 시 온도 하락", "분리 세척 불가", "220V 전용 (프리볼트 미지원)"
   - ❌ 절대 금지: "휴대성 낮음 (1/10)", "온도 조절 부족", "가격이 비쌈", "무거움"
   - **추상적 표현("낮음", "부족", "비쌈") 사용 금지! 구체적 문제만 서술!**

3. **한 줄 비교** (70자 이내):
   - 자연스러운 한국어 서술체로 2개 제품과 비교
   - ✅ 예: "A보다 가격이 저렴하고 휴대가 간편하나, B만큼 온도 조절 기능은 다양하지 않음"

**⚠️ 치명적 실수 방지:**
- "휴대성 낮음", "온도 조절 높음" → ❌ 즉시 탈락
- "8/10", "점수", "높음", "낮음" → ❌ 즉시 탈락
- 마크다운에 없는 내용 지어내기 → ❌ 즉시 탈락
- **장점/주의점이 3개 미만이면 그대로 출력하세요. 억지로 4개 채우지 마세요!**

**출력 형식 (JSON만):**
\`\`\`json
{
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["주의점1", "주의점2", "주의점3"],
  "comparison": "한 줄 비교"
}
\`\`\``;

  const response = await callGeminiWithRetry(
    async () => {
      const model = getModel(0.5); // 0.7 → 0.5: 더 정확한 스펙 추출
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
    3  // maxRetries
  );

  // Parse JSON from markdown code block if present
  let jsonStr = response.trim();
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonStr);

  return {
    pros: parsed.pros || [],
    cons: parsed.cons || [],
    comparison: parsed.comparison || ''
  };
}

