import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProductEvaluation, UserPersona, ValidationResult } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const VALIDATION_PROMPT = `당신은 제품 평가의 논리적 일관성을 검증하는 Validation 에이전트입니다.

# 입력
1. 사용자 페르소나
2. 제품 평가 결과

# 출력 형식 (JSON)
{
  "productId": "제품 ID",
  "isValid": true 또는 false,
  "invalidEvaluations": [
    {
      "attribute": "속성명",
      "issue": "문제점 설명",
      "suggestedGrade": "제안하는 등급 (optional)"
    }
  ]
}

# 검증 기준

1. **가중치-등급 일관성**
   - 사용자가 높은 가중치(9-10)를 준 속성이 낮은 등급("미흡", "매우 미흡")을 받았다면 → 제품이 적합하지 않을 가능성 높음 (재평가 필요)
   - 사용자가 낮은 가중치(1-3)를 준 속성이 "매우 충족"을 받았다면 → 불필요한 고평가 (재평가 필요)

2. **평가 이유의 구체성**
   - 이유가 "좋다", "적합하다" 같은 추상적 표현만 있으면 안 됨
   - 구체적인 특징이나 수치를 포함해야 함

3. **등급 분포의 현실성**
   - 모든 속성이 "매우 충족"이면 비현실적 (재평가 필요)
   - 고가 제품이라도 모든 속성에서 완벽할 수 없음

4. **맥락과의 일치**
   - 페르소나의 contextualNeeds를 고려했는지 확인
   - 예: "야간 수유"가 니즈인데 온도 조절 속도에 대한 언급이 없으면 문제

# 사용자 페르소나
{PERSONA}

# 제품 평가
{EVALUATION}

# 검증 지침
- isValid는 논리적으로 일관되고 구체적이면 true
- invalidEvaluations는 문제가 있는 속성만 포함
- 경미한 문제는 무시하고, 명백한 논리 오류만 지적

검증 결과를 JSON으로만 출력하세요:`;

export async function validateEvaluation(
  evaluation: ProductEvaluation,
  persona: UserPersona
): Promise<ValidationResult> {
  const prompt = VALIDATION_PROMPT
    .replace('{PERSONA}', JSON.stringify(persona, null, 2))
    .replace('{EVALUATION}', JSON.stringify(evaluation, null, 2));

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from validation response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  return result as ValidationResult;
}

export async function validateMultipleEvaluations(
  evaluations: ProductEvaluation[],
  persona: UserPersona
): Promise<ValidationResult[]> {
  // 병렬 처리
  const validationPromises = evaluations.map(evaluation =>
    validateEvaluation(evaluation, persona)
  );
  return Promise.all(validationPromises);
}
