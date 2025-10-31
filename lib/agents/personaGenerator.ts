import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserPersona } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

const PERSONA_GENERATION_PROMPT = `당신은 육아 부모의 대화를 분석하여 분유포트 구매 페르소나를 생성하는 AI 에이전트입니다.

# 입력
사용자와의 대화 내역 (구조화된 질문 응답 또는 자유 대화)

# 출력 형식 (JSON)
{
  "summary": "페르소나 요약 (2-3문장)",
  "coreValueWeights": {
    "temperatureControl": 1-10,
    "hygiene": 1-10,
    "material": 1-10,
    "usability": 1-10,
    "portability": 1-10,
    "priceValue": 1-10,
    "durability": 1-10,
    "additionalFeatures": 1-10
  },
  "contextualNeeds": ["니즈1", "니즈2", ...],
  "budget": 숫자 또는 null
}

# 8가지 핵심 가치 설명
- temperatureControl: 정확한 온도 조절 (분유 40-45도 유지, 빠른 가열)
- hygiene: 위생 관리 용이성 (세척 편의, 물때 관리, 안전 소재)
- material: 소재 안전성 (스테인리스, BPA Free, 식품등급)
- usability: 사용 편의성 (조작 단순, 한손 사용, 무게감)
- portability: 휴대성 (크기, 무선, 접이식, 여행용)
- priceValue: 가성비 (가격 대비 성능, 실용성)
- durability: 내구성 (고장 적음, 오래 사용)
- additionalFeatures: 부가 기능 (살균, 중탕, 타이머, 야간등)

# Few-shot 예시

## 예시 1
**입력:**
Q: 분유포트를 주로 어디서 사용하실 건가요?
A: 집에서만 쓸 거예요. 무게는 상관 없어요.

Q: 온도 조절이 얼마나 정확해야 하나요?
A: 45도 정확하게 맞춰지는 게 제일 중요해요. 자주 분유 타거든요.

Q: 위생 관리는 얼마나 중요하신가요?
A: 매일 세척하는데 입구가 좁으면 힘들어서 넓은 게 좋아요.

Q: 예산은 얼마나 되시나요?
A: 10만원 이하로 생각하고 있어요.

**출력:**
{
  "summary": "집에서 상시 사용하는 메인 분유포트를 찾는 부모. 정확한 온도 유지와 세척 편의성을 최우선으로 고려하며, 휴대성은 중요하지 않음.",
  "coreValueWeights": {
    "temperatureControl": 10,
    "hygiene": 9,
    "material": 7,
    "usability": 7,
    "portability": 1,
    "priceValue": 8,
    "durability": 6,
    "additionalFeatures": 5
  },
  "contextualNeeds": ["집에서 상시 사용", "빈번한 분유 수유", "매일 세척"],
  "budget": 100000
}

## 예시 2
**입력:**
Q: 분유포트를 주로 어디서 사용하실 건가요?
A: 여행 갈 때 가지고 다니려고요. 해외도 자주 가요.

Q: 크기나 무게는 어떤가요?
A: 최대한 가볍고 작아야 해요. 기저귀 가방도 무겁거든요.

Q: 예산은?
A: 7만원 정도까지는 괜찮아요.

**출력:**
{
  "summary": "해외 여행용 서브 포트를 찾는 부모. 휴대성과 가벼운 무게가 최우선이며, 프리볼트 기능 필요. 온도 정확도보다 편의성 중시.",
  "coreValueWeights": {
    "temperatureControl": 6,
    "hygiene": 8,
    "material": 7,
    "usability": 7,
    "portability": 10,
    "priceValue": 7,
    "durability": 5,
    "additionalFeatures": 8
  },
  "contextualNeeds": ["해외여행", "휴대 용이", "프리볼트", "가벼운 무게"],
  "budget": 70000
}

## 예시 3
**입력:**
사용자: 밤에 애가 자주 깨서 분유를 급하게 타야 할 때가 많아요. 지금 쓰는 건 물 식히는데 시간이 너무 오래 걸려요.

AI: 야간 수유가 잦으시군요. 온도 조절이 빠르고 정확한 제품이 필요하실 것 같아요.

사용자: 네, 그리고 남편이 출장이 많아서 제가 혼자 애를 보는 경우가 많아요. 한 손으로 쓸 수 있어야 해요.

AI: 사용 편의성도 중요하시겠네요. 예산은 어느 정도 생각하고 계세요?

사용자: 좋은 제품이면 15만원까지는 괜찮아요.

**출력:**
{
  "summary": "야간 수유가 빈번하고 혼자 육아하는 시간이 많은 부모. 빠른 온도 조절과 한손 조작이 핵심이며, 프리미엄 가격대 수용 가능.",
  "coreValueWeights": {
    "temperatureControl": 10,
    "hygiene": 7,
    "material": 6,
    "usability": 9,
    "portability": 3,
    "durability": 7,
    "priceValue": 6,
    "additionalFeatures": 8
  },
  "contextualNeeds": ["야간 수유", "빠른 온도 조절", "한손 조작", "혼자 육아"],
  "budget": 150000
}

# 중요 지침
1. **가중치 할당**: 사용자가 명시적으로 강조한 요소는 9-10점, 언급한 요소는 6-8점, 언급 없으면 4-6점
2. **예산 처리**: 명시적인 금액이 없으면 null 반환
3. **컨텍스트 추출**: 대화에서 "야간 수유", "여행", "쌍둥이", "집에서만", "외출 잦음" 같은 맥락 파악
4. **균형 유지**: 모든 가중치를 10으로 주지 말 것. 우선순위가 명확해야 함
5. **요약 작성**: 2-3문장으로 핵심 니즈와 구매 맥락을 명확히 서술

# 실제 사용자 대화
아래 대화를 분석하여 JSON 페르소나를 생성하세요.

{CHAT_HISTORY}

페르소나 JSON만 출력하세요 (설명 없이):`;

export async function generatePersona(chatHistory: string): Promise<UserPersona> {
  const prompt = PERSONA_GENERATION_PROMPT.replace('{CHAT_HISTORY}', chatHistory);

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  return result as UserPersona;
}

export async function generatePersonaWithReflection(
  chatHistory: string,
  maxIterations: number = 2
): Promise<UserPersona> {
  let persona = await generatePersona(chatHistory);

  for (let i = 0; i < maxIterations; i++) {
    const reflection = await reflectOnPersona(chatHistory, persona);

    if (reflection.isValid) {
      console.log(`✓ Persona validated after ${i + 1} iteration(s)`);
      break;
    }

    console.log(`→ Reflection feedback: ${reflection.feedback}`);

    // Regenerate with feedback
    const refinedPrompt = `${chatHistory}\n\n# 이전 페르소나의 문제점\n${reflection.feedback}\n\n위 피드백을 반영하여 페르소나를 재생성하세요.`;
    persona = await generatePersona(refinedPrompt);
  }

  return persona;
}

interface ReflectionResult {
  isValid: boolean;
  feedback: string;
}

async function reflectOnPersona(
  chatHistory: string,
  persona: UserPersona
): Promise<ReflectionResult> {
  const reflectionPrompt = `당신은 생성된 페르소나를 검증하는 Reflection 에이전트입니다.

# 원본 대화
${chatHistory}

# 생성된 페르소나
${JSON.stringify(persona, null, 2)}

# 검증 기준
1. **가중치 일관성**: 대화에서 강조한 요소가 높은 가중치(9-10)를 받았는가?
2. **우선순위 명확성**: 모든 값이 비슷하지 않고 차별화되어 있는가?
3. **컨텍스트 정확성**: contextualNeeds가 대화 내용과 일치하는가?
4. **예산 정확성**: 명시된 예산이 정확히 반영되었는가?
5. **요약 품질**: summary가 핵심 니즈를 명확히 표현하는가?

# 출력 형식 (JSON)
{
  "isValid": true 또는 false,
  "feedback": "문제점 설명 (isValid가 false일 때만)"
}

검증 결과를 JSON으로만 출력하세요:`;

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(reflectionPrompt);
    const text = response.response.text();

    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from reflection response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  return result as ReflectionResult;
}
