import { NextRequest, NextResponse } from 'next/server';
import { products } from '@/data/products';
import { loadProductDetails } from '@/lib/data/productLoader';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';

/**
 * POST /api/compare-features
 *
 * 제품별 핵심 특징 태그 생성 (LLM 기반)
 * - 마크다운 장점 분석 + coreValues 점수를 활용
 * - 각 제품당 3-5개의 직관적인 태그 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { productIds } = await request.json();

    if (!productIds || !Array.isArray(productIds) || productIds.length !== 3) {
      return NextResponse.json(
        { error: 'Exactly 3 product IDs required' },
        { status: 400 }
      );
    }

    // 제품 데이터 로드
    const selectedProducts = productIds
      .map((id: string) => products.find((p) => p.id === id))
      .filter(Boolean);

    if (selectedProducts.length !== 3) {
      return NextResponse.json(
        { error: 'One or more products not found' },
        { status: 404 }
      );
    }

    // 마크다운 상세 정보 로드
    const productDetailsPromises = productIds.map(async (id: string) => {
      const details = await loadProductDetails(id);
      return { id, details };
    });

    const productDetailsArray = await Promise.all(productDetailsPromises);
    const productDetailsMap = productDetailsArray.reduce((acc, { id, details }) => {
      acc[id] = details || '';
      return acc;
    }, {} as Record<string, string>);

    // LLM으로 핵심 특징 태그 생성 (3개 제품 동시 비교)
    const features: Record<string, string[]> = {};

    // 3개 제품을 한 번에 비교 분석
    const prod1 = selectedProducts[0]!;
    const prod2 = selectedProducts[1]!;
    const prod3 = selectedProducts[2]!;

    const comparisonPrompt = `당신은 분유포트 제품의 핵심 특징을 간결하게 추출하고 **3개 제품을 비교**하는 전문가입니다.

아래 **3개 제품**을 분석하여 각 제품의 **차별화된 강점**을 3-5개씩 추출하세요.

---

## 제품 1: ${prod1.title}
**가격:** ${prod1.price.toLocaleString()}원

**핵심 속성 점수 (1-10점):**
- 온도 조절/유지: ${prod1.coreValues.temperatureControl}/10
- 위생/세척: ${prod1.coreValues.hygiene}/10
- 소재/안전성: ${prod1.coreValues.material}/10
- 사용 편의성: ${prod1.coreValues.usability}/10
- 휴대성: ${prod1.coreValues.portability}/10
- 부가 기능: ${prod1.coreValues.additionalFeatures}/10

**상세 분석:**
${(productDetailsMap[prod1.id] || '').slice(0, 2500)}

---

## 제품 2: ${prod2.title}
**가격:** ${prod2.price.toLocaleString()}원

**핵심 속성 점수 (1-10점):**
- 온도 조절/유지: ${prod2.coreValues.temperatureControl}/10
- 위생/세척: ${prod2.coreValues.hygiene}/10
- 소재/안전성: ${prod2.coreValues.material}/10
- 사용 편의성: ${prod2.coreValues.usability}/10
- 휴대성: ${prod2.coreValues.portability}/10
- 부가 기능: ${prod2.coreValues.additionalFeatures}/10

**상세 분석:**
${(productDetailsMap[prod2.id] || '').slice(0, 2500)}

---

## 제품 3: ${prod3.title}
**가격:** ${prod3.price.toLocaleString()}원

**핵심 속성 점수 (1-10점):**
- 온도 조절/유지: ${prod3.coreValues.temperatureControl}/10
- 위생/세척: ${prod3.coreValues.hygiene}/10
- 소재/안전성: ${prod3.coreValues.material}/10
- 사용 편의성: ${prod3.coreValues.usability}/10
- 휴대성: ${prod3.coreValues.portability}/10
- 부가 기능: ${prod3.coreValues.additionalFeatures}/10

**상세 분석:**
${(productDetailsMap[prod3.id] || '').slice(0, 2500)}

---

## 요구사항:
1. **각 제품당 3-5개**의 특징 태그 생성
2. 각 특징은 **2-4단어**로 짧고 명확하게 (예: "빠른 냉각", "세척 쉬움", "프리미엄 유리")
3. **3개 제품을 비교**하여 각 제품의 **차별점/강점**을 강조
4. 점수가 높은 속성(8점 이상)을 우선 반영
5. 마크다운 장점/단점 모두 참고하여 종합 판단
6. 육아맘이 한눈에 이해할 수 있는 쉬운 표현
7. 3개 제품 간 **겹치는 태그 최소화** (차별화!)

## 출력 형식 (JSON만):
{
  "${prod1.id}": ["특징1", "특징2", "특징3"],
  "${prod2.id}": ["특징1", "특징2", "특징3"],
  "${prod3.id}": ["특징1", "특징2", "특징3"]
}`;

    try {
      const response = await callGeminiWithRetry(async () => {
        const model = getModel(0.6); // 약간 높은 temperature로 창의적 비교
        const result = await model.generateContent(comparisonPrompt);
        return result.response;
      });

      const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      // JSON 파싱 (마크다운 코드 블록 제거)
      let jsonStr = content.trim();
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
      }

      const parsedFeatures = JSON.parse(jsonStr);

      // 각 제품의 특징 저장
      for (const product of selectedProducts) {
        if (parsedFeatures[product.id] && Array.isArray(parsedFeatures[product.id])) {
          features[product.id] = parsedFeatures[product.id].slice(0, 5); // 최대 5개
        } else {
          // 폴백: 점수 기반 자동 생성
          features[product.id] = generateFallbackFeatures(product);
        }
      }
    } catch (error) {
      console.error('Failed to generate comparative features:', error);
      // 폴백: 모든 제품에 점수 기반 자동 생성
      for (const product of selectedProducts) {
        features[product.id] = generateFallbackFeatures(product);
      }
    }

    return NextResponse.json({ features });
  } catch (error) {
    console.error('Error in compare-features API:', error);
    return NextResponse.json(
      { error: 'Failed to generate features' },
      { status: 500 }
    );
  }
}

/**
 * LLM 실패 시 폴백: 점수 기반 특징 자동 생성
 */
function generateFallbackFeatures(product: any): string[] {
  const features: string[] = [];
  const cv = product.coreValues;

  if (cv.temperatureControl >= 8) features.push('정확한 온도 조절');
  if (cv.hygiene >= 8) features.push('세척 편리');
  if (cv.material >= 8) features.push('안전한 소재');
  if (cv.usability >= 8) features.push('사용 쉬움');
  if (cv.portability >= 8) features.push('휴대 편리');
  if (cv.additionalFeatures >= 8) features.push('다양한 기능');
  if (cv.priceValue >= 8) features.push('가성비 좋음');

  // 최소 3개 보장
  if (features.length < 3) {
    if (cv.temperatureControl >= 5) features.push('온도 관리');
    if (cv.hygiene >= 5) features.push('위생적');
    if (cv.material >= 5) features.push('안전 인증');
  }

  return features.slice(0, 5);
}
