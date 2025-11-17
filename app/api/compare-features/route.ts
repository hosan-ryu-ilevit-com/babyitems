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

    const comparisonPrompt = `당신은 분유포트 제품의 **구체적이고 실질적인 스펙**을 비교 분석하는 전문가입니다.

아래 **3개 제품**의 상세 분석(마크다운)을 정밀하게 읽고, 각 제품만의 **차별화된 구체적 특징**을 추출하세요.

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

**상세 분석 (여기서 구체적 스펙을 반드시 찾아야 함!):**
${(productDetailsMap[prod1.id] || '').slice(0, 3000)}

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

**상세 분석 (여기서 구체적 스펙을 반드시 찾아야 함!):**
${(productDetailsMap[prod2.id] || '').slice(0, 3000)}

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

**상세 분석 (여기서 구체적 스펙을 반드시 찾아야 함!):**
${(productDetailsMap[prod3.id] || '').slice(0, 3000)}

---

## ⚠️ 핵심 요구사항:

### 1. 반드시 **구체적이고 정량적인 스펙/기술**을 태그로 만들 것
❌ 나쁜 예: "사용 쉬움", "안전한 소재", "세척 편리", "보온 우수" (너무 추상적이고 일반적!)
✅ 좋은 예: "1℃ 단위 조절", "43℃ 자동 냉각", "붕규산 유리", "24시간 항온", "접이식 구조", "찜판 제공", "8시간 보온", "프리볼트 110V/220V", "130W 강력", "3분 염소제거", "분리형 상판", "UV 살균"

### 2. **상세 분석(마크다운) 내용을 철저히 읽고** 거기 명시된 **숫자, 온도, 기술명, 소재명, 시간, 용량, 구조**를 태그로 변환
- 온도: "43℃ 자동 냉각", "100℃까지 끓임", "40℃~100℃ 5단계"
- 시간: "24시간 항온", "8시간 보온", "2시간 쿨링", "3분 염소제거"
- 소재: "붕규산 유리", "SUS316 스테인리스", "실리콘 본체", "트라이탄 플라스틱"
- 구조: "접이식 구조", "분리형 뚜껑", "넓은 12cm 입구", "3단 분리 세척"
- 용량: "1.5L 대용량", "600ml 휴대용", "2L 가족형"
- 기능/기술: "찜판 포함", "무드등 내장", "프리볼트 지원", "UV 살균", "터치 버튼", "LCD 디스플레이", "130W 고출력"
- 기타: "500g 초경량", "접이식 10cm", "24개월 보증"

### 3. **3개 제품 간 절대 겹치지 않게** (각 제품의 유니크한 특징만 선택!)
- 만약 3개 모두 "세척 쉬움" 같은 특징이 있다면 → 구체적인 차이점을 찾아 차별화
  - 제품 A: "분리형 뚜껑"
  - 제품 B: "넓은 12cm 입구"
  - 제품 C: "스테인리스 내부"
- 만약 3개 모두 온도 조절 기능이 있다면 → 구체적인 온도 범위나 방식을 명시
  - 제품 A: "40℃~100℃  5단계"
  - 제품 B: "1℃ 단위 조절"
  - 제품 C: "43℃ 자동 냉각"

### 4. 각 제품당 **정확히 4개**의 태그 생성

### 5. 태그는 **2-6단어**로 구성 (짧고 강렬하게, 단 숫자/스펙이 포함되면 조금 길어져도 OK)

### 6. 육아맘이 "아, 이게 차이구나!" 하고 **즉시 이해하고 구매 결정에 도움**이 되어야 함

### 7. **우선순위**: 온도 > 소재 > 용량 > 시간/보온 > 특수 기능 > 구조/편의성
   - 분유포트의 핵심은 온도 조절과 소재이므로, 이 부분의 차이점을 우선 강조

---

## 출력 형식 (JSON만, 코멘트 없이):
{
  "${prod1.id}": ["구체적특징1", "구체적특징2", "구체적특징3", "구체적특징4"],
  "${prod2.id}": ["구체적특징1", "구체적특징2", "구체적특징3", "구체적특징4"],
  "${prod3.id}": ["구체적특징1", "구체적특징2", "구체적특징3", "구체적특징4"]
}

**최종 체크리스트:**
✅ 각 태그에 숫자/온도/소재명/시간/용량 등 정량적 정보가 포함되었는가?
✅ 3개 제품의 태그가 서로 겹치지 않는가?
✅ 마크다운 상세 분석을 꼼꼼히 읽고 실제 스펙을 추출했는가?
✅ 추상적인 표현("우수", "편리", "좋음")을 피했는가?

다시 한번 강조: 반드시 마크다운 내용을 꼼꼼히 읽고, **숫자/온도/소재/시간/용량/기술명**이 명시된 구체적인 스펙을 태그로 만들어야 합니다!`;

    try {
      const response = await callGeminiWithRetry(async () => {
        const model = getModel(0.4); // 낮은 temperature로 정확한 스펙 추출
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
        if (!product) continue; // Type guard
        if (parsedFeatures[product.id] && Array.isArray(parsedFeatures[product.id])) {
          features[product.id] = parsedFeatures[product.id].slice(0, 4); // 정확히 4개
        } else {
          // 폴백: 점수 기반 자동 생성
          features[product.id] = generateFallbackFeatures(product);
        }
      }
    } catch (error) {
      console.error('Failed to generate comparative features:', error);
      // 폴백: 모든 제품에 점수 기반 자동 생성
      for (const product of selectedProducts) {
        if (!product) continue; // Type guard
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
 * (가능한 한 구체적으로, 하지만 마크다운 없이는 한계가 있음)
 */
function generateFallbackFeatures(product: any): string[] {
  const features: string[] = [];
  const cv = product.coreValues;

  // 8점 이상인 속성 우선 (조금 더 구체적으로)
  if (cv.temperatureControl >= 8) features.push('온도 정밀 조절');
  if (cv.hygiene >= 8) features.push('분리 세척 가능');
  if (cv.material >= 8) features.push('프리미엄 소재');
  if (cv.usability >= 8) features.push('간편한 조작');
  if (cv.portability >= 8) features.push('외출용 최적');
  if (cv.additionalFeatures >= 8) features.push('다기능 지원');
  if (cv.priceValue >= 8) features.push('합리적 가격');

  // 7점 이상으로 확장
  if (features.length < 4) {
    if (cv.temperatureControl >= 7 && !features.includes('온도 정밀 조절')) features.push('온도 유지 우수');
    if (cv.hygiene >= 7 && !features.includes('분리 세척 가능')) features.push('위생 관리 쉬움');
    if (cv.material >= 7 && !features.includes('프리미엄 소재')) features.push('안전 인증 소재');
    if (cv.usability >= 7 && !features.includes('간편한 조작')) features.push('직관적 사용');
  }

  // 최소 4개 보장 (점수 낮아도)
  if (features.length < 4) {
    const backups = ['적정 가격', '기본 기능 충실', '실용적 디자인', '안정적 성능'];
    features.push(...backups.slice(0, 4 - features.length));
  }

  return features.slice(0, 4); // 정확히 4개
}
