import { NextRequest, NextResponse } from 'next/server';
import { loadProductDetails, loadProductById } from '@/lib/data/productLoader';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';
import { Product } from '@/types';
import { getProductSpec } from '@/lib/data/specLoader';
import { getReviewsForProduct, sampleLongestReviews, formatReviewsForLLM } from '@/lib/review';
import type { Category, ProductSpec } from '@/lib/data';

interface ProductWithDetails {
  id: string;
  product: Product;
  markdown: string;
  isSpecBased?: false;
}

interface SpecProductWithDetails {
  id: string;
  spec: ProductSpec;
  reviews: string;
  isSpecBased: true;
}

type ProductData = ProductWithDetails | SpecProductWithDetails;

/**
 * POST /api/compare
 * Use LLM to generate smart, concise pros/cons and comparisons
 * Supports both products.ts (with coreValues) and specs/*.json (without coreValues)
 */
export async function POST(req: NextRequest) {
  try {
    const { productIds, category } = await req.json();

    if (!productIds || !Array.isArray(productIds) || productIds.length < 2 || productIds.length > 4) {
      return NextResponse.json(
        { error: '2-4 product IDs required' },
        { status: 400 }
      );
    }

    // Try to load from both sources: products.ts AND specs/*.json
    const productsData: ProductData[] = await Promise.all(
      productIds.map(async (id) => {
        // Try products.ts first (old system with coreValues + markdown)
        const product = await loadProductById(id);
        const markdown = await loadProductDetails(id);

        if (product && markdown) {
          console.log(`✅ Loaded ${id} from products.ts`);
          return { id, product, markdown, isSpecBased: false as const };
        }

        // Fallback to specs/*.json (new system with reviews)
        if (category) {
          try {
            const spec = await getProductSpec(category as Category, id);
            if (spec) {
              console.log(`✅ Loaded ${id} from specs/${category}.json`);
              // Load reviews for this product
              const allReviews = await getReviewsForProduct(category as Category, String(spec.productId));
              const sampledReviews = allReviews.length > 0 ? sampleLongestReviews(allReviews, 20) : [];
              const reviewsText = sampledReviews.length > 0
                ? formatReviewsForLLM(sampledReviews, 30000)
                : '리뷰 없음';

              return {
                id,
                spec,
                reviews: reviewsText,
                isSpecBased: true as const
              };
            }
          } catch (error) {
            console.error(`Failed to load spec for ${id}:`, error);
          }
        }

        console.warn(`⚠️ Product ${id} not found in products.ts or specs`);
        return null;
      })
    );

    // Filter out null values
    const validProducts = productsData.filter((p): p is ProductData => p !== null);

    if (validProducts.length !== productIds.length) {
      const missingIds = productIds.filter((id: string) => !validProducts.find(p => p.id === id));
      console.error(`❌ Missing products: ${missingIds.join(', ')}`);
      return NextResponse.json(
        { error: 'Could not load all products', missingIds },
        { status: 400 }
      );
    }

    // Generate smart summaries using LLM
    const results: Record<string, { pros: string[]; cons: string[]; comparison: string }> = {};

    for (let i = 0; i < validProducts.length; i++) {
      const currentProduct = validProducts[i];
      const otherProducts = validProducts.filter((_, idx) => idx !== i);

      try {
        const summary = currentProduct.isSpecBased
          ? await generateSpecBasedSummary(currentProduct, otherProducts)
          : await generateProductSummary(currentProduct, otherProducts);

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
 * Generate smart, concise pros/cons and comparison using LLM (for spec-based products)
 */
async function generateSpecBasedSummary(
  currentProduct: SpecProductWithDetails,
  otherProducts: ProductData[]
) {
  const spec = currentProduct.spec;

  // Format other products for comparison
  const otherProductsText = otherProducts.map((p, idx) => {
    if (p.isSpecBased) {
      const s = p.spec;
      return `${idx + 1}. ${s.브랜드} ${s.모델명} (${s.최저가?.toLocaleString() || '가격정보없음'}원)
   - 총점: ${s.총점 || 'N/A'}/10
   - 순위: ${s.순위}/${s.총제품수}
${p.reviews.substring(0, 1000)}...`;
    } else {
      const prod = p.product;
      return `${idx + 1}. ${prod.title} (${prod.price.toLocaleString()}원)
   - 온도: ${prod.coreValues.temperatureControl}/10, 위생: ${prod.coreValues.hygiene}/10
${p.markdown.substring(0, 1000)}...`;
    }
  }).join('\n\n');

  const prompt = `당신은 ${spec.카테고리} 제품 비교 전문가입니다. ${otherProducts.length + 1}개의 제품을 비교하는 표를 작성 중입니다.

**현재 제품:**
- 브랜드: ${spec.브랜드}
- 모델명: ${spec.모델명}
- 가격: ${spec.최저가?.toLocaleString() || '가격정보없음'}원
- 총점: ${spec.총점 || 'N/A'}/10
- 순위: ${spec.순위}/${spec.총제품수}

**실제 사용자 리뷰:**
${currentProduct.reviews}

**비교 대상 제품들:**
${otherProductsText}

**요청사항:**
1. **장점 3개** (각 35자 이내):
   - 반드시 **구체적인 기능, 스펙, 소재명**을 명시하세요!
   - **실제 리뷰**에서 언급된 내용만 추출하세요!
   - ✅ 좋은 예: "43℃ 자동 냉각 기능", "SUS304 스테인리스 내부", "분리형 뚜껑으로 세척 간편", "24시간 보온 가능"
   - ❌ 절대 금지: "온도 조절 우수", "휴대성 높음", "위생 점수 8/10", "세척 편리", "사용 간편"
   - **"높음", "낮음", "우수", "미흡", "점수", "/10" 같은 표현 사용 시 0점 처리됩니다!**

2. **주의점 3개** (각 35자 이내):
   - 구체적인 **문제점, 제약사항**만 명시하세요
   - ✅ 좋은 예: "2시간 이상 보온 시 온도 하락", "분리 세척 불가", "220V 전용 (프리볼트 미지원)"
   - ❌ 절대 금지: "휴대성 낮음 (1/10)", "온도 조절 부족", "가격이 비쌈", "무거움"

3. **한 줄 비교** (70자 이내):
   - 자연스러운 한국어 서술체로 다른 제품들과 비교
   - ✅ 예: "A보다 가격이 저렴하고 휴대가 간편하나, B만큼 온도 조절 기능은 다양하지 않음"

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
      const model = getModel(0.5);
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
    3
  );

  // Parse JSON
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
    comparison: parsed.comparison || '',
    specs: spec.specs || null  // 스펙 데이터 추가
  };
}

/**
 * Generate smart, concise pros/cons and comparison using LLM (for products.ts products)
 */
async function generateProductSummary(
  currentProduct: ProductWithDetails,
  otherProducts: ProductData[]
) {
  const cv = currentProduct.product.coreValues;

  // Format other products for comparison (handle both types)
  const otherProductsText = otherProducts.map((p, idx) => {
    if (p.isSpecBased) {
      const s = p.spec;
      return `${idx + 1}. ${s.브랜드} ${s.모델명} (${s.최저가?.toLocaleString() || '가격정보없음'}원)
   - 총점: ${s.총점 || 'N/A'}/10
   - 순위: ${s.순위}/${s.총제품수}
${p.reviews.substring(0, 1000)}...`;
    } else {
      return `${idx + 1}. ${p.product.title} (${p.product.price.toLocaleString()}원)
   - 온도: ${p.product.coreValues.temperatureControl}/10, 위생: ${p.product.coreValues.hygiene}/10
   - 소재: ${p.product.coreValues.material}/10, 편의성: ${p.product.coreValues.usability}/10
${p.markdown.substring(0, 1000)}...`;
    }
  }).join('\n\n');

  const prompt = `당신은 분유포트 제품 비교 전문가입니다. ${otherProducts.length + 1}개의 제품을 비교하는 표를 작성 중입니다.

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
${otherProductsText}

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
    comparison: parsed.comparison || '',
    specs: null  // products.ts 제품은 specs 없음
  };
}

