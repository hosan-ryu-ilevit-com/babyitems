/**
 * V2 비교표 분석 API
 * POST /api/v2/comparison-analysis
 *
 * Top 3 제품에 대한 비교표용 장단점을 생성합니다:
 * - pros: 장점 3개
 * - cons: 주의점 3개
 * - comparison: 한줄 비교
 *
 * 병렬 처리로 빠르게 생성합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getProModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  spec?: Record<string, unknown>;
  filter_attrs?: Record<string, unknown>;  // 추가: 필터 속성
  rank?: number | null;
}

// 요청 타입 - products 또는 productIds로 요청 가능
interface ComparisonAnalysisRequest {
  categoryKey: string;
  products?: ProductInfo[];
  productIds?: string[];  // 추가: pcode 배열로 요청 시 Supabase에서 조회
}

// 비교 분석 결과 타입
interface ProductComparison {
  pcode: string;
  pros: string[];
  cons: string[];
  comparison: string;
}

// 응답 타입
interface ComparisonAnalysisResponse {
  success: boolean;
  data?: {
    productDetails: Record<string, {
      pros: string[];
      cons: string[];
      comparison: string;
      specs?: Record<string, unknown>;  // 추가: 스펙 정보
    }>;
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 모든 제품을 한번에 비교 분석 (더 효율적)
 */
async function generateComparisons(
  products: ProductInfo[],
  categoryName: string,
  insights: CategoryInsights
): Promise<ProductComparison[]> {
  const model = getProModel(0.5);

  // 제품 목록 문자열화 (스펙 + 필터 속성을 더 상세히 포함)
  const productsText = products.map((p, i) => {
    // 스펙 정보 포맷팅
    const specStr = p.spec
      ? Object.entries(p.spec)
          .filter(([key, v]) =>
            v !== null &&
            v !== undefined &&
            v !== '' &&
            // 제품명/브랜드 등 메타 정보 제외
            !['제품명', '모델명', '상품명', '브랜드', '제조사'].includes(key)
          )
          .slice(0, 20) // 스펙 정보 20개까지 포함
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n  - ')
      : '스펙 정보 없음';

    // 필터 속성 정보 포맷팅 (추가 스펙 정보)
    const filterAttrsStr = p.filter_attrs
      ? Object.entries(p.filter_attrs)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .slice(0, 10)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n  - ')
      : '';

    return `### ${p.brand || ''} ${p.title}
- 순위: ${i + 1}위
- 가격: ${p.price ? `${p.price.toLocaleString()}원` : '가격 미정'}
- 주요 스펙:
  - ${specStr}${filterAttrsStr ? `\n- 필터 속성:\n  - ${filterAttrsStr}` : ''}`;
  }).join('\n\n');

  // 카테고리 인사이트
  const categoryPros = insights.pros.slice(0, 4).map(p => `- ${p.text}`).join('\n');
  const categoryCons = insights.cons.slice(0, 4).map(c => `- ${c.text}`).join('\n');

  // 제품명 축약 정보 (한 줄 비교용) - 브랜드 + 모델명 조합
  const productShortNames = products.map(p => {
    const brand = p.brand || '';
    // 모델명에서 핵심 키워드 추출 (브랜드 중복 제거)
    let titleShort = p.title.replace(brand, '').trim().split(' ').slice(0, 2).join(' ');
    if (!titleShort) titleShort = p.title.split(' ')[0] || '';
    return brand ? `${brand} ${titleShort}`.trim() : titleShort;
  });

  const prompt = `당신은 ${categoryName} 제품 비교 전문가입니다.
아래 ${products.length}개의 추천 제품을 비교해주세요.

## 추천 제품 목록
${productsText}

## 제품 간략명 (한 줄 비교 시 사용)
${products.map((p, i) => `- ${productShortNames[i]}`).join('\n')}

## 이 카테고리의 일반적인 장점 (참고용)
${categoryPros}

## 이 카테고리의 일반적인 단점 (참고용)
${categoryCons}

## 요청사항
각 제품별로 다음을 작성해주세요:

### 1. 장점 3개 (각 35자 이내)
**반드시 위 스펙 정보에서 확인된 구체적인 기능, 수치, 소재명을 명시하세요!**
- ✅ 좋은 예시:
  * "43℃~100℃ 1도 단위 온도 조절"
  * "SUS304 스테인리스 스틸 내부"
  * "분리형 뚜껑으로 세척 간편"
  * "24시간 보온 유지 기능"
  * "무선 사용 최대 8시간"
  * "800ml 대용량"
- ❌ 절대 금지 (추상적 표현):
  * "온도 조절 우수", "휴대성 높음", "가격 저렴", "세척 편리", "사용 간편"
  * "점수 8/10", "위생적", "안전함", "품질 좋음"

### 2. 주의점 3개 (각 35자 이내)
**실사용 관점의 구체적인 단점만 명시! 스펙에서 확인된 제약사항 위주로 작성하세요.**
- ✅ 좋은 예시:
  * "무게 1.5kg으로 휴대 시 무거움"
  * "뚜껑 분리 세척 불가"
  * "220V 전용 (프리볼트 미지원)"
  * "용량 500ml로 쌍둥이 사용 시 부족"
  * "보온 2시간 후 온도 하락"
  * "전용 파우치 미포함"
- ❌ 절대 금지:
  * **"리뷰 없음", "리뷰 부족", "리뷰 적음", "후기 부족", "평점 미확인"** → 0점 처리!
  * **"스펙 정보 부족", "정보 확인 불가", "상세 정보 없음"** → 0점 처리!
  * "휴대성 낮음", "가격 비쌈", "무겁다" (구체적 수치 없이)
- 주의점을 찾기 어려우면 **빈 배열 []**로 출력하세요. 억지로 채우지 마세요!

### 3. 한 줄 비교 (70자 이내)
다른 추천 제품들과 비교하여 이 제품의 특징을 자연스러운 한국어로 요약하세요.
- **다른 제품 언급 시 반드시 위의 "제품 간략명"을 사용** (브랜드+모델명 조합)
- ✅ 좋은 예시: "${productShortNames[0] || ''}보다 20% 저렴하면서 보온력은 비슷함"
- ❌ 절대 금지:
  * "제품 1234567 대비", "pcode", 제품 코드 언급
  * "비교제품 1", "비교제품 2", "1번 제품", "2번 제품"
  * "1위 제품", "2위 제품"과 같은 순위 기반 표현

## 응답 JSON 형식
{
  "comparisons": [
    {
      "pcode": "${products[0]?.pcode || ''}",
      "pros": ["장점1", "장점2", "장점3"],
      "cons": ["주의점1", "주의점2", "주의점3"],
      "comparison": "한 줄 비교"
    },
    {
      "pcode": "${products[1]?.pcode || ''}",
      "pros": ["장점1", "장점2", "장점3"],
      "cons": ["주의점1", "주의점2", "주의점3"],
      "comparison": "한 줄 비교"
    },
    {
      "pcode": "${products[2]?.pcode || ''}",
      "pros": ["장점1", "장점2", "장점3"],
      "cons": ["주의점1", "주의점2", "주의점3"],
      "comparison": "한 줄 비교"
    }
  ]
}

JSON만 응답하세요.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsed = parseJSONResponse(responseText) as { comparisons?: ProductComparison[] };

  return parsed.comparisons || [];
}

/**
 * Fallback: 카테고리 인사이트 기반 + 제품 스펙 기반 생성
 */
function generateFallbackComparisons(
  products: ProductInfo[],
  insights: CategoryInsights
): ProductComparison[] {
  return products.map((p, i) => {
    // 1. 스펙 기반 장점 생성 시도
    const specBasedPros: string[] = [];
    const specBasedCons: string[] = [];

    if (p.spec) {
      const spec = p.spec as Record<string, unknown>;

      // 일반적인 장점 스펙 키워드 매핑
      if (spec['용량']) specBasedPros.push(`${spec['용량']} 용량`);
      if (spec['무게'] && typeof spec['무게'] === 'string' && spec['무게'].includes('g')) {
        const weight = parseFloat(spec['무게'].toString());
        if (weight < 1000) specBasedPros.push(`${spec['무게']} 가벼운 무게`);
      }
      if (spec['재질']) specBasedPros.push(`${spec['재질']} 재질`);
      if (spec['기능'] || spec['부가기능']) {
        const features = (spec['기능'] || spec['부가기능']) as string;
        if (features.includes('보온')) specBasedPros.push('보온 기능 지원');
        if (features.includes('분리')) specBasedPros.push('분리 세척 가능');
        if (features.includes('무선')) specBasedPros.push('무선 사용 가능');
      }

      // 주의점: 정보 부족 시 일반적인 주의점
      if (!spec['AS'] && !spec['보증기간']) specBasedCons.push('AS 정보 확인 필요');
    }

    // 2. 카테고리 인사이트에서 보충
    const prosOffset = i % Math.max(1, insights.pros.length);
    const consOffset = i % Math.max(1, insights.cons.length);

    const insightPros = insights.pros.slice(prosOffset, prosOffset + 3).map(pro =>
      pro.text.length > 35 ? pro.text.substring(0, 32) + '...' : pro.text
    );
    const insightCons = insights.cons.slice(consOffset, consOffset + 3).map(con =>
      con.text.length > 35 ? con.text.substring(0, 32) + '...' : con.text
    );

    // 3. 스펙 기반 + 인사이트 기반 합쳐서 최대 3개
    const finalPros = [...specBasedPros, ...insightPros].slice(0, 3);
    const finalCons = [...specBasedCons, ...insightCons].slice(0, 3);

    // 4. 비어있으면 기본값 제공
    if (finalPros.length === 0) {
      finalPros.push('추천 순위에 오른 제품입니다');
    }
    // 주의점이 없으면 빈 배열 유지 (일부러 생성하지 않음)

    return {
      pcode: p.pcode,
      pros: finalPros,
      cons: finalCons,
      comparison: i === 0
        ? '가장 종합적으로 높은 평가를 받은 제품입니다.'
        : `${i + 1}위 추천 제품입니다.`,
    };
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<ComparisonAnalysisResponse>> {
  try {
    const body: ComparisonAnalysisRequest = await request.json();
    const { categoryKey, products: inputProducts, productIds } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    // products 또는 productIds 중 하나는 필수
    let products: ProductInfo[] = inputProducts || [];

    // productIds로 요청한 경우 Supabase에서 제품 정보 조회
    if ((!products || products.length === 0) && productIds && productIds.length > 0) {
      console.log(`[comparison-analysis] Fetching products from Supabase: ${productIds.join(', ')}`);

      const { data: supabaseProducts, error } = await supabase
        .from('danawa_products')
        .select('pcode, title, brand, price, rank, spec, filter_attrs')
        .in('pcode', productIds);

      if (error) {
        console.error('[comparison-analysis] Supabase error:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch products from database' },
          { status: 500 }
        );
      }

      if (!supabaseProducts || supabaseProducts.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No products found' },
          { status: 404 }
        );
      }

      // Supabase 데이터를 ProductInfo 형태로 변환
      products = supabaseProducts.map(p => ({
        pcode: p.pcode,
        title: p.title || `${p.brand || ''} 제품`,
        brand: p.brand,
        price: p.price,
        spec: p.spec as Record<string, unknown> || {},
        filter_attrs: p.filter_attrs as Record<string, unknown> || {},
        rank: p.rank,
      }));

      console.log(`[comparison-analysis] Loaded ${products.length} products from Supabase`);
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array or productIds required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let comparisons: ProductComparison[] = [];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable() && insights) {
      try {
        comparisons = await callGeminiWithRetry(
          () => generateComparisons(products.slice(0, 3), categoryName, insights),
          2,
          1500
        );
        generated_by = 'llm';

        console.log(`[comparison-analysis] LLM generated comparisons for ${comparisons.length} products`);
      } catch (llmError) {
        console.error('[comparison-analysis] LLM failed, using fallback:', llmError);
        comparisons = generateFallbackComparisons(products.slice(0, 3), insights);
      }
    } else {
      console.log(`[comparison-analysis] LLM not available, using fallback for ${categoryKey}`);
      if (insights) {
        comparisons = generateFallbackComparisons(products.slice(0, 3), insights);
      } else {
        comparisons = products.slice(0, 3).map(p => ({
          pcode: p.pcode,
          pros: ['추천 제품입니다'],
          cons: ['자세한 정보를 확인하세요'],
          comparison: '추천 순위에 오른 제품입니다.',
        }));
      }
    }

    // Record 형태로 변환 (기존 API 호환 + 스펙 정보 포함)
    const productDetails: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> }> = {};

    // 잘못된 값 필터링 함수 (LLM이 "[]", "없음", 빈 문자열 등을 반환하는 경우)
    const filterInvalidItems = (items: string[]): string[] => {
      if (!Array.isArray(items)) return [];
      return items.filter(item => {
        if (!item || typeof item !== 'string') return false;
        const trimmed = item.trim();
        // 빈 문자열, "[]", "없음", "-" 등 무효한 값 제거
        if (!trimmed) return false;
        if (trimmed === '[]' || trimmed === '[ ]') return false;
        if (trimmed === '없음' || trimmed === '-' || trimmed === 'N/A') return false;
        return true;
      });
    };

    for (const comp of comparisons) {
      // 해당 제품의 스펙 정보 찾기
      const productData = products.find(p => p.pcode === comp.pcode);
      const mergedSpecs = productData
        ? { ...(productData.spec || {}), ...(productData.filter_attrs || {}) }
        : undefined;

      productDetails[comp.pcode] = {
        pros: filterInvalidItems(comp.pros),
        cons: filterInvalidItems(comp.cons),
        comparison: comp.comparison,
        specs: mergedSpecs,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        productDetails,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[comparison-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate comparison analysis' },
      { status: 500 }
    );
  }
}
