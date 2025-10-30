import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product, UserPersona, ProductEvaluation, AttributeEvaluation, EvaluationGrade, CoreValues } from '@/types';
import { callGeminiWithRetry, parseJSONResponse } from '../ai/gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const EVALUATION_PROMPT = `당신은 사용자의 페르소나를 기반으로 분유포트 제품을 평가하는 AI 에이전트입니다.

# 입력
1. 사용자 페르소나 (니즈, 가중치, 맥락)
2. 평가할 제품 정보

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
  ]
}

# 평가 기준
각 속성별로 사용자의 니즈와 우선순위를 고려하여 평가합니다.

## 평가 등급
- **매우 충족**: 사용자가 중요하게 생각하는 부분을 완벽히 충족
- **충족**: 사용자의 니즈를 충분히 만족
- **보통**: 평균적인 수준, 특별히 좋거나 나쁘지 않음
- **미흡**: 사용자의 니즈에 비해 부족함
- **매우 미흡**: 사용자가 중요하게 생각하는 부분이 현저히 부족

## 8가지 핵심 속성
1. **temperatureControl** (온도 조절/유지 성능)
   - 제품 점수: {TEMP_CONTROL}/10
   - 정확한 온도 조절(40-45도), 빠른 가열, 온도 유지 능력

2. **hygiene** (위생/세척 편의성)
   - 제품 점수: {HYGIENE}/10
   - 세척 용이성, 물때 관리, 분리 세척 가능 여부

3. **material** (소재/안전성)
   - 제품 점수: {MATERIAL}/10
   - 스테인리스, BPA Free, 식품등급 소재

4. **usability** (사용 편의성)
   - 제품 점수: {USABILITY}/10
   - 조작 단순성, 한손 사용, 무게감, 직관적 UI

5. **portability** (휴대성)
   - 제품 점수: {PORTABILITY}/10
   - 크기, 무선 기능, 접이식, 여행용 적합성

6. **priceValue** (가격/가성비)
   - 제품 점수: {PRICE_VALUE}/10
   - 가격 대비 성능, 실용성

7. **additionalFeatures** (부가 기능/디자인)
   - 제품 점수: {ADDITIONAL_FEATURES}/10
   - 살균, 중탕, 타이머, 야간등 등 추가 기능

# 사용자 페르소나
{PERSONA}

# 평가할 제품
{PRODUCT}

# 평가 지침
1. **가중치 고려**: 사용자가 높은 가중치(9-10)를 준 속성에 집중
2. **맥락 반영**: contextualNeeds를 고려한 실질적 평가
3. **균형 유지**: 모든 속성을 '매우 충족'으로 평가하지 말 것
4. **구체적 이유**: "좋다"가 아니라 "왜 좋은지" 구체적으로 설명
5. **사용자 관점**: 페르소나의 상황에서 평가 (예: 야간 수유가 많으면 빠른 가열 중요)

평가 결과를 JSON으로만 출력하세요 (설명 없이):`;

export async function evaluateProduct(
  product: Product,
  persona: UserPersona
): Promise<ProductEvaluation> {
  const coreValues = product.coreValues;

  const prompt = EVALUATION_PROMPT
    .replace('{TEMP_CONTROL}', coreValues.temperatureControl.toString())
    .replace('{HYGIENE}', coreValues.hygiene.toString())
    .replace('{MATERIAL}', coreValues.material.toString())
    .replace('{USABILITY}', coreValues.usability.toString())
    .replace('{PORTABILITY}', coreValues.portability.toString())
    .replace('{PRICE_VALUE}', coreValues.priceValue.toString())
    .replace('{DURABILITY}', coreValues.durability.toString())
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

  return result as ProductEvaluation;
}

export async function evaluateMultipleProducts(
  products: Product[],
  persona: UserPersona
): Promise<ProductEvaluation[]> {
  // 병렬 처리로 속도 향상
  const evaluationPromises = products.map(product => evaluateProduct(product, persona));
  return Promise.all(evaluationPromises);
}
