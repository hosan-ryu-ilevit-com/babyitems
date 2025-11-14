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

    // Filter out any missing products
    const validProducts = productsData.filter(p => p.product && p.markdown);

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
  const prompt = `당신은 육아 제품 비교 전문가입니다. 3개의 분유포트를 비교하는 표를 작성 중입니다.

**현재 제품:**
- 이름: ${currentProduct.product.title}
- 가격: ${currentProduct.product.price.toLocaleString()}원
- 상세 분석:
${currentProduct.markdown}

**비교 대상 제품들:**
${otherProducts.map((p, idx) => `
${idx + 1}. ${p.product.title} (${p.product.price.toLocaleString()}원)
${p.markdown.substring(0, 1000)}...
`).join('\n')}

**요청사항:**
1. 현재 제품의 핵심 장점 3가지를 간결하게 요약 (각 30자 이내)
2. 현재 제품의 주의점 3가지를 간결하게 요약 (각 30자 이내)
3. 다른 2개 제품과 비교한 한 줄 요약 (50자 이내, "A보다 ~하지만 B보다 ~함" 스타일)

**출력 형식 (JSON):**
\`\`\`json
{
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["주의점1", "주의점2", "주의점3"],
  "comparison": "다른 제품 대비 한 줄 비교"
}
\`\`\`

간결하고 핵심만 담아주세요. 불필요한 부연 설명은 제외하세요.`;

  const response = await callGeminiWithRetry(
    async () => {
      const model = getModel(0.7);
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

