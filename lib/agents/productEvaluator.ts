import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product, UserPersona, ProductEvaluation } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';
import { loadMultipleProductDetails } from '../data/productLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

const EVALUATION_PROMPT = `당신은 사용자의 페르소나를 기반으로 분유포트 제품을 평가하는 AI 에이전트예요.

# 입력
1. 사용자 페르소나 (니즈, 가중치, 맥락)
2. 평가할 제품 정보
3. **제품 상세 분석** (실제 사용자 리뷰 기반)

# 제품 상세 분석
{PRODUCT_DETAILS}

**이 상세 분석은 실제 구매자 리뷰를 바탕으로 작성된 내용이에요:**
- **장점**: 실제로 검증된 강점
- **단점**: 실제 사용자들이 경험한 문제점
- **구매 패턴**: 어떤 사람들이 어떤 목적으로 구매했는지
- **기타**: 주의사항 및 중요 정보

# 출력 형식 (JSON)
{
  "productId": "제품 ID",
  "evaluations": [
    {
      "attribute": "temperatureControl",
      "grade": "매우 충족" | "충족" | "보통" | "미흡" | "매우 미흡",
      "reason": "평가 이유 (1-2문장)"
    },
    ...
  ],
  "overallScore": 1 | 2 | 3 | 4 | 5
}

# 평가 기준
각 속성별로 사용자의 니즈와 우선순위를 고려하여 평가해주세요.

## 평가 등급
- **매우 충족**: 사용자가 중요하게 생각하는 부분을 완벽히 충족
- **충족**: 사용자의 니즈를 충분히 만족
- **보통**: 평균적인 수준, 특별히 좋거나 나쁘지 않음
- **미흡**: 사용자의 니즈에 비해 부족함
- **매우 미흡**: 사용자가 중요하게 생각하는 부분이 현저히 부족

## 7가지 핵심 속성 및 세부 평가 기준

1. **temperatureControl** (온도 조절/유지 성능)
   - 제품 점수: {TEMP_CONTROL}/10
   - **세부 평가 항목:**
     • 원터치 자동 분유 모드: 100℃ 가열 → 염소 제거 → 설정 온도로 자동 냉각 → 보온
     • 24시간 항온 유지 (영구 보온 기능): 전원을 끄기 전까지 온도 유지
     • 빠른 냉각(쿨링팬) 기능: 100℃ 물을 분유 온도로 빠르게 냉각
     • 세밀한 온도 조절: 1℃ 단위로 정밀하게 조절 가능

2. **hygiene** (위생/세척 편의성)
   - 제품 점수: {HYGIENE}/10
   - **세부 평가 항목:**
     • 넓은 주입구: 손이 쉽게 들어가 내부 바닥까지 꼼꼼하게 세척 가능
     • 완전 분리형 뚜껑: 뚜껑 내부나 고무패킹까지 구석구석 세척 가능
     • 이음새 없는 내부 구조: 물때나 이물질이 낄 염려가 적음
     • 초기 연마제 관리: 첫 세척 시 연마제가 거의 묻어나오지 않는 제품

3. **material** (소재/안전성)
   - 제품 점수: {MATERIAL}/10
   - **세부 평가 항목:**
     • 가열판 및 내부 소재: 의료용 SUS316 > 식품용 SUS304
     • 포트 본체: 내열 강화유리 (위생적이지만 깨질 위험) vs 스테인리스 (내구성)
     • 뚜껑 및 기타 소재: BPA-Free 제품 확인 필수
     • 기본 안전 기능: 물 없음/과열 시 자동 전원 차단

4. **usability** (사용 편의성)
   - 제품 점수: {USABILITY}/10
   - **세부 평가 항목:**
     • 용량: 최소 1.3L 이상 권장 (하루 수유량 약 1,000ml 고려)
     • 무게 및 그립감: 물을 가득 채웠을 때 손목에 부담이 가지 않는 가벼운 무게
     • 소음: 저소음 설계 여부 (아기 수면 방해 최소화)
     • 조작부 민감도: 터치패드나 다이얼의 적절한 민감도

5. **portability** (휴대성)
   - 제품 점수: {PORTABILITY}/10
   - **세부 평가 항목:**
     • 부피와 무게: 접이식(폴더블) 또는 텀블러 형태의 컴팩트한 디자인
     • 프리볼트 (Free Volt): 110V와 220V 모두 지원
     • 무선 기능: 충전 후 선 없이 사용 가능한 배터리 탑재

6. **priceValue** (가격 대비 가치)
   - 제품 가격: {PRICE}원
   - 제품 점수: {PRICE_VALUE}/10 (점수가 높을수록 가격 대비 성능이 우수함)
   - **평가 기준:**
     • 이 점수는 **가성비(가격 대비 성능)**를 나타냅니다
     • 점수가 높다 = 가격 대비 얻을 수 있는 성능/품질/기능이 뛰어남
     • 저렴해도 성능이 나쁘면 낮은 점수, 비싸도 성능이 훌륭하면 높은 점수일 수 있음
     • 사용자의 페르소나를 고려하여 "이 가격에 이 정도 성능이면 합리적인가?"를 평가

7. **additionalFeatures** (부가 기능/디자인)
   - 제품 점수: {ADDITIONAL_FEATURES}/10
   - **세부 평가 항목:**
     • 다용도 활용성: 분유 수유 시기가 끝난 후 티포트, 찜기 등으로 활용
     • 디자인: 주방 인테리어와 어울리는 깔끔하고 세련된 디자인
     • 추가 구성품: 차망, 중탕 용기, 찜기 등 포함 여부

## 전체 평가 점수 (overallScore)
7개 속성 평가를 종합하여 해당 페르소나에게 이 제품이 얼마나 적합한지 1~5점으로 평가해주세요.
- **5점**: 이 사용자에게 매우 적합한 제품 (핵심 니즈를 모두 충족)
- **4점**: 적합한 제품 (주요 니즈를 충족하나 일부 아쉬운 부분 존재)
- **3점**: 보통 수준 (니즈 충족도가 평균적)
- **2점**: 부적합 (중요한 니즈를 충족하지 못함)
- **1점**: 매우 부적합 (핵심 니즈를 거의 충족하지 못함)

# 사용자 페르소나
{PERSONA}

# 평가할 제품
{PRODUCT}

# 평가 지침
1. **세부 평가 항목 체크**: 각 속성의 세부 평가 항목들을 제품 상세 분석과 대조하여 얼마나 충족하는지 확인해주세요
2. **상세 분석 우선 참고**: 제품의 coreValues 점수는 참고용이며, 실제 평가는 상세 분석의 장단점을 기반으로 수행해주세요
3. **가중치 고려**: 사용자가 높은 가중치(9-10)를 준 속성에 집중해주세요
4. **맥락 반영**: contextualNeeds를 고려한 실질적 평가를 해주세요
5. **구체적 이유**: 상세 분석에서 언급된 구체적 특징과 세부 평가 항목을 이유에 포함해주세요
6. **사용자 관점**: 페르소나의 상황(예: 쌍둥이, 여행 빈도)과 제품의 실제 특성(상세 분석 참고)을 연결해주세요
7. **맥락적 적합도**: 숫자 점수가 높아도 페르소나의 contextualNeeds에 맞지 않으면 낮은 grade를 부여해주세요
8. **전체 점수**: 페르소나의 핵심 니즈(가중치 9-10)를 얼마나 충족하는지가 overallScore의 핵심이에요

**평가 예시:**
- 온도 조절 평가 시: "원터치 자동 분유 모드", "24시간 항온 유지", "빠른 냉각팬" 등의 세부 항목이 제품 상세 분석의 장점에 언급되어 있는지 확인
- 위생 평가 시: "넓은 주입구", "완전 분리형 뚜껑" 등의 언급 여부로 세척 편의성 판단

평가 결과를 JSON으로만 출력하세요 (설명 없이):`;

export async function evaluateProduct(
  product: Product,
  productDetails: string,
  persona: UserPersona
): Promise<ProductEvaluation> {
  console.log(`  📋 Evaluating: ${product.title.substring(0, 40)}...`);

  const coreValues = product.coreValues;

  const prompt = EVALUATION_PROMPT
    .replace('{PRODUCT_DETAILS}', productDetails)
    .replace('{TEMP_CONTROL}', coreValues.temperatureControl.toString())
    .replace('{HYGIENE}', coreValues.hygiene.toString())
    .replace('{MATERIAL}', coreValues.material.toString())
    .replace('{USABILITY}', coreValues.usability.toString())
    .replace('{PORTABILITY}', coreValues.portability.toString())
    .replace('{PRICE}', product.price.toLocaleString())
    .replace('{PRICE_VALUE}', coreValues.priceValue.toString())
    .replace('{ADDITIONAL_FEATURES}', coreValues.additionalFeatures.toString())
    .replace('{PERSONA}', JSON.stringify(persona, null, 2))
    .replace('{PRODUCT}', JSON.stringify({
      id: product.id,
      title: product.title,
      price: product.price,
      reviewCount: product.reviewCount,
      ranking: product.ranking,
      coreValues: product.coreValues
    }, null, 2));

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from evaluation response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  console.log(`  ✓ Evaluated: ${product.title.substring(0, 40)} - Overall: ${result.overallScore}/5`);

  return result as ProductEvaluation;
}

export async function evaluateMultipleProducts(
  products: Product[],
  persona: UserPersona
): Promise<ProductEvaluation[]> {
  console.log(`🔄 Starting parallel evaluation of ${products.length} products...`);

  // 1. 모든 제품의 상세 정보를 먼저 로드
  console.log(`📚 Loading detailed markdown for ${products.length} products...`);
  const productIds = products.map(p => p.id);
  const allDetails = await loadMultipleProductDetails(productIds);

  // 2. 병렬 평가 (상세 정보 포함)
  const evaluationPromises = products.map(product => {
    const details = allDetails[product.id] || '상세 정보 없음';
    return evaluateProduct(product, details, persona);
  });
  const results = await Promise.all(evaluationPromises);

  console.log(`✓ All ${products.length} products evaluated successfully`);

  return results;
}
