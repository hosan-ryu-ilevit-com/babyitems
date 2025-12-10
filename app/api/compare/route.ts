import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase에서 가져온 제품 데이터 타입
interface SupabaseProductData {
  pcode: string;
  spec: Record<string, unknown> | null;
  filter_attrs: Record<string, unknown> | null;
  review_count: number | null;
  average_rating: number | null;
  lowest_price: number | null;
  lowest_mall: string | null;
  lowest_link: string | null;
}

/**
 * POST /api/compare
 * Supabase 기반 제품 비교 API
 * LLM을 사용하여 장점/주의점/한줄비교 생성
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

    console.log(`📊 [Compare API] Fetching ${productIds.length} products from Supabase`);

    // Supabase에서 제품 데이터 + 가격 정보 조회
    const [productsResult, pricesResult] = await Promise.all([
      supabase
        .from('danawa_products')
        .select('pcode, spec, filter_attrs, review_count, average_rating')
        .in('pcode', productIds),
      supabase
        .from('danawa_prices')
        .select('pcode, lowest_price, lowest_mall, lowest_link')
        .in('pcode', productIds),
    ]);

    if (productsResult.error) {
      console.error('❌ Products fetch error:', productsResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: productsResult.error.message },
        { status: 500 }
      );
    }

    const products = productsResult.data || [];
    const prices = pricesResult.data || [];

    // 가격 정보를 pcode로 매핑
    const priceMap = new Map(prices.map(p => [p.pcode, p]));

    // 제품 데이터 병합
    const productsData: SupabaseProductData[] = products.map(product => ({
      ...product,
      lowest_price: priceMap.get(product.pcode)?.lowest_price || null,
      lowest_mall: priceMap.get(product.pcode)?.lowest_mall || null,
      lowest_link: priceMap.get(product.pcode)?.lowest_link || null,
    }));

    // 누락된 제품 확인
    const foundIds = new Set(productsData.map(p => p.pcode));
    const missingIds = productIds.filter((id: string) => !foundIds.has(id));

    if (missingIds.length > 0) {
      console.warn(`⚠️ Missing products: ${missingIds.join(', ')}`);
      // 일부 제품이 없어도 있는 것들로 진행
      if (productsData.length < 2) {
        return NextResponse.json(
          { error: 'Not enough products found', missingIds },
          { status: 400 }
        );
      }
    }

    console.log(`✅ [Compare API] Loaded ${productsData.length} products`);

    // LLM으로 각 제품의 장점/주의점/한줄비교 생성
    const results: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }> = {};

    for (let i = 0; i < productsData.length; i++) {
      const currentProduct = productsData[i];
      const otherProducts = productsData.filter((_, idx) => idx !== i);

      try {
        const summary = await generateSupabaseSummary(currentProduct, otherProducts, category);
        results[currentProduct.pcode] = summary;
      } catch (error) {
        console.error(`❌ Failed to generate summary for ${currentProduct.pcode}:`, error);
        results[currentProduct.pcode] = {
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
 * Supabase 데이터 기반 LLM 요약 생성
 */
async function generateSupabaseSummary(
  currentProduct: SupabaseProductData,
  otherProducts: SupabaseProductData[],
  category?: string
): Promise<{ pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }> {
  const spec = currentProduct.spec || {};

  // 제품명 추출 (spec에서 여러 가능한 필드 확인)
  const productName = (spec as Record<string, string>)['제품명']
    || (spec as Record<string, string>)['모델명']
    || (spec as Record<string, string>)['상품명']
    || `제품 ${currentProduct.pcode}`;

  const brand = (spec as Record<string, string>)['브랜드']
    || (spec as Record<string, string>)['제조사']
    || '미상';

  // 스펙 정보를 문자열로 포맷팅
  const specText = Object.entries(spec)
    .filter(([key, value]) =>
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !['제품명', '모델명', '상품명', '브랜드', '제조사'].includes(key)
    )
    .slice(0, 20)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n') || '스펙 정보 없음';

  // filter_attrs 정보도 포함
  const filterAttrsText = currentProduct.filter_attrs
    ? Object.entries(currentProduct.filter_attrs)
        .filter(([_, value]) => value !== null && value !== undefined)
        .slice(0, 10)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    : '';

  // 다른 제품들 정보 포맷팅
  const otherProductsText = otherProducts.map((p, idx) => {
    const pSpec = p.spec || {};
    const pName = (pSpec as Record<string, string>)['제품명']
      || (pSpec as Record<string, string>)['모델명']
      || `제품 ${p.pcode}`;
    const pBrand = (pSpec as Record<string, string>)['브랜드'] || '미상';

    const pSpecText = Object.entries(pSpec)
      .filter(([key, value]) =>
        value !== null &&
        value !== undefined &&
        !['제품명', '모델명', '상품명', '브랜드', '제조사'].includes(key)
      )
      .slice(0, 10)
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n');

    return `${idx + 1}. ${pBrand} ${pName}
   - 가격: ${p.lowest_price?.toLocaleString() || '가격정보없음'}원
   - 리뷰: ${p.review_count || 0}개 (평점: ${p.average_rating || 'N/A'})
   - 주요 스펙:
${pSpecText}`;
  }).join('\n\n');

  const categoryName = getCategoryName(category);

  const prompt = `당신은 ${categoryName} 제품 비교 전문가입니다. ${otherProducts.length + 1}개의 제품을 비교하는 표를 작성 중입니다.

**현재 제품:**
- 브랜드: ${brand}
- 제품명: ${productName}
- 가격: ${currentProduct.lowest_price?.toLocaleString() || '가격정보없음'}원
- 리뷰: ${currentProduct.review_count || 0}개 (평점: ${currentProduct.average_rating || 'N/A'})

**주요 스펙:**
${specText}

${filterAttrsText ? `**필터 속성:**\n${filterAttrsText}` : ''}

**비교 대상 제품들:**
${otherProductsText}

**요청사항:**
1. **장점 3개** (각 35자 이내):
   - 반드시 **구체적인 기능, 스펙, 소재명**을 명시하세요!
   - **위 스펙 정보**에서 실제로 언급된 내용만 추출하세요!
   - ✅ 좋은 예: "43℃ 자동 냉각 기능", "SUS304 스테인리스 내부", "분리형 뚜껑으로 세척 간편", "24시간 보온 가능"
   - ❌ 절대 금지: "온도 조절 우수", "휴대성 높음", "위생 점수 8/10", "세척 편리", "사용 간편"
   - **"높음", "낮음", "우수", "미흡", "점수", "/10" 같은 표현 사용 시 0점 처리됩니다!**

2. **주의점 3개** (각 35자 이내):
   - **실사용 관점**의 구체적인 단점만 언급하세요
   - ✅ 좋은 예: "2시간 이상 보온 시 온도 하락", "분리 세척 불가", "220V 전용 (프리볼트 미지원)", "뚜껑 분리가 어려움", "용량이 500ml로 작은 편"
   - ❌ 절대 금지 (메타 정보):
     * "리뷰 없음", "리뷰 부족", "별점 정보 없음", "평점 미확인", "리뷰 및 평점 정보가 확인되지 않음"
     * "스펙 정보 부족", "기능 명시 안됨", "정보 확인 불가", "상세 스펙 미제공"
     * "휴대성 낮음", "온도 조절 부족", "가격이 비쌈" (추상적 표현)
   - **⚠️ 리뷰·별점·스펙 정보의 부재를 주의점으로 언급하면 0점 처리됩니다!**
   - 주의점을 찾기 어려우면 빈 배열 []로 출력하세요. 억지로 채우지 마세요!

3. **한 줄 비교** (70자 이내):
   - 자연스러운 한국어 서술체로 다른 제품들과 비교
   - ✅ 예: "A보다 가격이 저렴하고 휴대가 간편하나, B만큼 온도 조절 기능은 다양하지 않음"

**⚠️ 주의:**
- 스펙 정보가 부족해도 있는 정보 내에서 최선의 분석을 제공하세요
- 장점/주의점이 3개 미만이면 그대로 출력하세요 (빈 배열 [] 허용)
- **절대 "정보 부족", "리뷰 없음", "스펙 미확인" 같은 메타 정보를 출력하지 마세요!**

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

  // JSON 파싱
  let jsonStr = response.trim();
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      pros: parsed.pros || [],
      cons: parsed.cons || [],
      comparison: parsed.comparison || '',
      specs: currentProduct.spec
    };
  } catch (parseError) {
    console.error('❌ JSON parse error:', parseError, 'Response:', jsonStr);
    return {
      pros: [],
      cons: [],
      comparison: '',
      specs: currentProduct.spec
    };
  }
}

/**
 * 카테고리 한글 이름 변환
 */
function getCategoryName(category?: string): string {
  const categoryNames: Record<string, string> = {
    'milk_powder_port': '분유포트',
    'baby_bottle': '젖병',
    'baby_bottle_sterilizer': '젖병소독기',
    'baby_formula_dispenser': '분유케이스',
    'baby_monitor': '베이비모니터',
    'baby_play_mat': '아기매트',
    'car_seat': '카시트',
    'nasal_aspirator': '코흡입기',
    'thermometer': '체온계',
  };
  return categoryNames[category || ''] || '육아용품';
}
