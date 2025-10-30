import { getModel, callGeminiWithRetry, parseJSONResponse } from './gemini';
import { ImportanceLevel } from '@/types';

/**
 * 사용자 답변에서 중요도를 추출하는 함수
 */
export interface IntentAnalysisResult {
  type: 'importance_response' | 'follow_up_question' | 'off_topic';
  importance?: ImportanceLevel;
  needsMoreExplanation?: boolean;
  detectedIntent?: string;
}

const INTENT_ANALYSIS_PROMPT = `당신은 사용자의 답변을 분석하여 의도를 파악하는 AI입니다.

사용자가 분유포트의 특정 속성에 대한 중요도를 답변했는지, 아니면 추가 설명을 요청하는지 판단해야 합니다.

**답변 유형:**
1. importance_response: 해당 속성의 전체적인 중요도를 표현
   - 직접적 표현: "중요해요", "매우 중요합니다", "별로 안 중요해요"
   - 맥락적 표현: "소음은 중요한데 무게는 괜찮아요" → 전체적으로는 "중요" 또는 "보통"으로 판단
   - 세부 항목 언급: 속성 내부의 특정 요소들을 언급하더라도, 전체 속성에 대한 의견이면 importance_response

2. follow_up_question: 추가 설명이나 질문을 원함
   - 예: "그게 뭔가요?", "더 설명해주세요", "예를 들어주세요", "잘 모르겠어요"
   - 속성 자체를 이해하지 못하거나 더 알고 싶어하는 경우

3. off_topic: 주제와 완전히 무관한 대화
   - 예: "날씨가 좋네요", "저녁 뭐 먹지?", "다른 제품 추천해주세요"
   - **주의**: 속성 내부의 세부 항목(용량, 무게, 소음 등)에 대한 의견은 off_topic이 아닙니다!

**중요도 분류 기준:**
- "매우 중요": "매우 중요", "최우선", "꼭 필요", "절대적", "가장 중요", 여러 세부 항목을 강조
- "중요": "중요", "필요", "신경써야", "고려해야", 일부 세부 항목을 중요하게 여김
- "보통": "보통", "괜찮", "크게 상관없", "별로", "안 중요", 대부분의 세부 항목이 중요하지 않음

**세부 항목 언급 처리:**
사용자가 속성 내부의 특정 요소만 언급하더라도 (예: "소음만 중요해요", "무게는 별로예요"):
- 전체 속성에 대한 의견으로 간주
- 언급한 요소의 중요도를 바탕으로 전체 중요도 추정
- type은 "importance_response"

사용자 답변을 분석하고 다음 JSON 형식으로 응답하세요:

{
  "type": "importance_response | follow_up_question | off_topic",
  "importance": "매우 중요 | 중요 | 보통" (type이 importance_response인 경우만),
  "needsMoreExplanation": false,
  "detectedIntent": "사용자의 의도 설명"
}`;

/**
 * 사용자 답변의 의도를 분석
 */
export async function analyzeUserIntent(
  userMessage: string,
  currentAttributeName: string,
  attributeDetails?: string[]
): Promise<IntentAnalysisResult> {
  return callGeminiWithRetry(async () => {
    const model = getModel(0.3); // 낮은 temperature로 일관성 있는 분류

    const detailsContext = attributeDetails
      ? `\n\n속성 내부 세부 항목:\n${attributeDetails.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
      : '';

    const prompt = `${INTENT_ANALYSIS_PROMPT}

현재 질문 중인 속성: ${currentAttributeName}${detailsContext}

사용자 답변: "${userMessage}"

위 답변을 분석하여 JSON으로 응답하세요.
사용자가 세부 항목(예: 소음, 무게, 용량 등)을 언급하더라도, 이는 해당 속성에 대한 의견이므로 importance_response로 분류하세요.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return parseJSONResponse<IntentAnalysisResult>(text);
  });
}

/**
 * 사용자의 추가 질문에 대해 더 자세한 설명을 생성
 */
export async function generateDetailedExplanation(
  attributeName: string,
  attributeDescription: string,
  attributeDetails: string[],
  userQuestion: string
): Promise<string> {
  return callGeminiWithRetry(async () => {
    const model = getModel(0.7);

    const prompt = `당신은 분유포트 구매를 돕는 친절한 AI 쇼핑 비서입니다.

사용자가 "${attributeName}"에 대해 다음과 같이 질문했습니다:
"${userQuestion}"

**속성 정보:**
${attributeDescription}

**세부 사항:**
${attributeDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}

사용자의 질문에 대해 친절하고 명확하게 답변해주세요.
육아에 지친 30-40대 여성이 이해하기 쉽게, 구체적인 예시와 함께 설명해주세요.
답변은 3-4문장 정도로 간결하게 작성하세요.`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    return response.text();
  });
}

/**
 * 다음 속성으로 전환하는 자연스러운 멘트 생성
 */
export async function generateTransitionMessage(
  completedAttributeName: string,
  nextAttributeName: string,
  nextAttributeDescription: string,
  nextAttributeDetails: string[]
): Promise<string> {
  return callGeminiWithRetry(async () => {
    const model = getModel(0.7);

    const prompt = `당신은 분유포트 구매를 돕는 친절한 AI 쇼핑 비서입니다.

사용자가 "${completedAttributeName}"에 대한 중요도 평가를 완료했습니다.
이제 "${nextAttributeName}"에 대해 질문할 차례입니다.

**다음 속성 정보:**
${nextAttributeDescription}

**세부 사항:**
${nextAttributeDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}

자연스럽게 다음 속성으로 전환하는 멘트를 작성해주세요.
형식:
1. 이전 답변에 대한 짧은 긍정 (1문장)
2. 다음 속성 소개 (2-3문장)
3. 중요도 질문 (1문장)

전체 4-5문장으로 작성하고, 친근하면서도 전문적인 톤을 유지하세요.`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    return response.text();
  });
}
