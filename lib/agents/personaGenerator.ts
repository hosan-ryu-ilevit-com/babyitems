import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserPersona, AttributeAssessment, PrioritySettings, BudgetRange } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';
import { importanceLevelToWeight } from '../utils/scoring';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

/**
 * 정성적 페르소나 프로필 생성 프롬프트
 *
 * 목적: 사용자의 대화 내용을 깊이 분석하여 "이 소비자는 어떤 사람인가"를 정성적으로 파악
 *
 * 가중치는 이미 사용자가 명시적으로 선택했으므로, 여기서는:
 * 1. 페르소나 요약 (구매 맥락, 육아 상황, 핵심 니즈)
 * 2. 상황적 맥락 추출 (야간 수유, 외출 빈도, 가족 구성 등)
 * 3. 예산 파악
 */
const PERSONA_PROFILE_PROMPT = `당신은 육아 부모의 대화와 추가 요청사항을 깊이 분석하여 **구매 페르소나 프로필**을 작성하는 심리 분석 전문가예요.

# 당신의 역할
사용자와의 대화 내용과 **추가 요청사항**을 바탕으로, 이 소비자가:
- **어떤 육아 상황**에 있는지 (예: 쌍둥이, 신생아, 돌 전후 등)
- **어떤 라이프스타일**을 가졌는지 (예: 외출 많음, 야간 수유 빈번 등)
- **무엇을 가장 고민**하는지 (예: 위생, 시간 절약, 안전성 등)
- **어떤 맥락에서 제품을 사용**할지

를 정성적으로 파악하여 **제품 추천에 활용할 페르소나 프로필**을 생성해주세요.

# 입력
사용자와의 전체 대화 내역 (선택한 장단점 태그 + 추가 요청사항 + 구조화된 질문 + 자유 대화)

⚠️ **최우선 반영 사항**:
1. 대화 시작 부분에 **"사용자가 중요하게 생각하는 장점:"**, **"사용자가 절대 피하고 싶은 단점:"** 섹션이 있습니다
2. 이것은 사용자가 **직접 선택한 핵심 요구사항**이므로 **가장 높은 우선순위**로 contextualNeeds에 반영하세요
3. 장점 태그의 구체적 표현을 **그대로 활용**하세요:
   - "1도 단위로 정확하게 온도 조절" → contextualNeeds: "1도 단위 정확한 온도 조절"
   - "쿨링팬으로 빠르게 식혀줘요" → contextualNeeds: "쿨링팬을 통한 빠른 냉각"
4. 단점 태그는 **회피 조건**으로 변환하세요:
   - "입구가 좁아 세척 불편" → contextualNeeds: "넓은 입구로 쉬운 세척"
5. 추가 요청사항이나 자유 대화에서 파악된 내용은 **보조적**으로 추가

# 출력 형식 (JSON)
{
  "summary": "페르소나 핵심 요약 (3-4문장, 추가 요청사항 반영)",
  "contextualNeeds": ["구체적 니즈1", "구체적 니즈2", ...],
  "lifestyleContext": "라이프스타일 및 사용 맥락 설명 (2-3문장)",
  "budget": 숫자 또는 null
}

# contextualNeeds 작성 지침
1. **최우선**: 대화 시작 부분의 장단점 태그를 contextualNeeds로 변환
   - 장점 태그: 구체적 표현 유지 (예: "1도 단위 정확", "쿨링팬", "자동 출수")
   - 단점 태그: 긍정형으로 변환 (예: "좁은 입구" → "넓은 입구")
2. **보조**: 추가 요청사항/대화에서 파악한 상황 추가
3. **형식**: 짧고 명확한 키워드 (5-10개)
4. **구체성**: 제품 추천 이유 작성에 직접 활용되므로 **매우 구체적**으로

예시 1 (장단점 태그 기반):
- 입력:
  사용자가 중요하게 생각하는 장점: "1도 단위로 정확하게 온도 조절할 수 있어요", "쿨링팬으로 빠르게 식혀줘요"
  사용자가 절대 피하고 싶은 단점: "입구가 좁아 손이 안 들어가서 세척이 불편해요"
- contextualNeeds: [
    "1도 단위 정확한 온도 조절",
    "쿨링팬을 통한 빠른 냉각",
    "넓은 입구로 쉬운 세척",
    "손세척 가능한 구조"
  ]

예시 2 (추가 맥락):
- 입력: 장점 태그 + "쌍둥이라 동시에 분유를 자주 타요"
- contextualNeeds: [
    "(장점 태그들)",
    "쌍둥이 육아 중",
    "동시 분유 준비 필요"
  ]

# 실제 사용자 대화
{CHAT_HISTORY}

페르소나 프로필 JSON만 출력하세요 (설명 없이):`;

/**
 * 정성적 페르소나 프로필 타입 (AI가 생성하는 부분)
 */
interface PersonaProfile {
  summary: string;
  contextualNeeds: string[];
  lifestyleContext: string;
  budget: number | null;
}

/**
 * 정성적 페르소나 프로필 생성 (AI)
 *
 * 가중치는 사용자가 이미 선택했으므로 제외하고,
 * summary, contextualNeeds, lifestyleContext, budget만 AI가 생성
 */
async function generatePersonaProfile(chatHistory: string): Promise<PersonaProfile> {
  console.log('🤖 Calling Gemini API for persona profile...');
  console.log('📝 Chat history length:', chatHistory.length);

  const prompt = PERSONA_PROFILE_PROMPT.replace('{CHAT_HISTORY}', chatHistory);

  const result = await callGeminiWithRetry(async () => {
    console.log('  🔄 Sending request to Gemini...');
    const response = await model.generateContent(prompt);
    console.log('  ✓ Received response from Gemini');
    const text = response.response.text();
    console.log('  📄 Response text length:', text.length);

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from persona profile response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  return result as PersonaProfile;
}

/**
 * DEPRECATED: 기존 AttributeAssessment 기반 페르소나 생성
 *
 * Priority 플로우에서는 사용하지 않습니다.
 * 대신 generatePersonaFromPriorityWithChat() 사용
 */
export async function generatePersona(
  chatHistory: string,
  attributeAssessments: AttributeAssessment
): Promise<UserPersona> {
  console.log('⚠️  DEPRECATED: generatePersona() called - use generatePersonaFromPriorityWithChat() instead');
  console.log('📝 Generating persona profile (AI)...');

  // 1. AI가 정성적 분석 수행
  const profile = await generatePersonaProfile(chatHistory);

  console.log('📊 Converting importance levels to weights (code-based)...');

  // 2. 사용자가 선택한 중요도를 가중치로 변환 (코드 기반)
  const coreValueWeights = {
    temperatureControl: importanceLevelToWeight(attributeAssessments.temperatureControl || '보통'),
    hygiene: importanceLevelToWeight(attributeAssessments.hygiene || '보통'),
    material: importanceLevelToWeight(attributeAssessments.material || '보통'),
    usability: importanceLevelToWeight(attributeAssessments.usability || '보통'),
    portability: importanceLevelToWeight(attributeAssessments.portability || '보통'),
    priceValue: importanceLevelToWeight(attributeAssessments.priceValue || '보통'),
    durability: importanceLevelToWeight(attributeAssessments.durability || '보통'),
    additionalFeatures: importanceLevelToWeight(attributeAssessments.additionalFeatures || '보통'),
  };

  // 3. 최종 UserPersona 조합
  const persona: UserPersona = {
    summary: profile.summary,
    coreValueWeights,
    contextualNeeds: profile.contextualNeeds,
    budget: profile.budget ?? undefined,  // null을 undefined로 변환
  };

  console.log('✓ Persona generated');
  console.log('  Summary:', persona.summary.substring(0, 80) + '...');
  console.log('  Weights:', coreValueWeights);
  console.log('  Budget:', persona.budget);

  return persona;
}

/**
 * Priority 설정 + Chat 이력 기반 페르소나 생성 (Primary 방식)
 *
 * Priority 플로우의 메인 함수
 * - Priority 설정을 가중치로 변환 (코드 기반, 확정적)
 * - Chat 이력이 있으면 AI로 contextualNeeds + summary 보강
 * - Chat 이력이 없으면 Priority만으로 기본 페르소나 생성
 *
 * @param settings - Priority 페이지에서 선택한 6개 속성 중요도
 * @param budget - 선택한 예산 범위
 * @param chatHistory - 대화 기록 (선택적)
 * @param tagContextualNeeds - 태그에서 변환된 contextualNeeds (선택적, LLM 스킵용)
 * @returns UserPersona
 */
export async function generatePersonaFromPriorityWithChat(
  settings: PrioritySettings,
  budget?: BudgetRange,
  chatHistory?: string,
  tagContextualNeeds?: string[]
): Promise<UserPersona> {
  console.log('📊 Generating persona from Priority + Chat...');
  console.log('  Priority settings:', settings);
  console.log('  Budget:', budget);
  console.log('  Chat history length:', chatHistory?.length || 0);
  console.log('  Tag contextual needs:', tagContextualNeeds?.length || 0);

  // 1. Priority 설정을 가중치로 변환 (항상 실행, 확정적)
  const basePersona = generatePersonaFromPriority(settings, budget);

  // 2. 태그 기반 contextualNeeds가 있으면 추가 (LLM 없이)
  if (tagContextualNeeds && tagContextualNeeds.length > 0) {
    console.log('🏷️  Adding tag-based contextual needs (no LLM)...');
    basePersona.contextualNeeds = [
      ...basePersona.contextualNeeds,
      ...tagContextualNeeds
    ].filter((v, i, a) => a.indexOf(v) === i); // 중복 제거
  }

  // 3. Chat 이력이 있고 충분히 긴 경우 AI로 보강
  if (chatHistory && chatHistory.trim().length > 50) {
    try {
      console.log('🤖 Enhancing persona with AI analysis...');
      const profile = await generatePersonaProfile(chatHistory);

      // AI가 생성한 정성적 분석으로 업그레이드
      return {
        ...basePersona,
        summary: profile.summary, // AI의 풍부한 요약으로 교체
        contextualNeeds: [
          ...basePersona.contextualNeeds,
          ...profile.contextualNeeds
        ].filter((v, i, a) => a.indexOf(v) === i), // 중복 제거
      };
    } catch (error) {
      console.error('⚠️  Failed to enhance persona with AI, using base persona:', error);
      return basePersona;
    }
  }

  // 4. Chat 이력이 없거나 짧으면 Priority + 태그 기반만 사용
  console.log('ℹ️  No chat history, using Priority + tags only (no LLM)');
  return basePersona;
}

/**
 * Priority 설정에서 간단한 페르소나 생성 (AI 없이, 코드 기반)
 *
 * "바로 추천받기" 플로우 또는 fallback에서 사용
 * Priority 페이지에서 선택한 중요도를 가중치로 직접 변환
 *
 * @param settings - Priority 페이지에서 선택한 6개 속성 중요도
 * @param budget - 선택한 예산 범위
 * @returns UserPersona
 */
export function generatePersonaFromPriority(
  settings: PrioritySettings,
  budget?: BudgetRange
): UserPersona {
  console.log('📊 Generating persona from priority settings (code-based)...');
  console.log('  Priority settings:', settings);
  console.log('  Budget:', budget);

  // Priority level → weight 매핑
  const priorityToWeight = {
    low: 5,
    medium: 7,
    high: 10
  };

  // 예산 범위에서 max 값 추출하여 budget 필드에 저장
  // 커스텀 예산인 경우 문자열에서 숫자를 추출하거나 그대로 반환
  const parseBudgetRange = (range: BudgetRange): number | undefined => {
    // 사전 정의된 범위 처리
    const budgetMap: Record<string, number> = {
      '0-50000': 50000,
      '50000-100000': 100000,
      '100000-150000': 150000,
      '150000+': 200000  // 상한선을 200000으로 설정
    };

    if (budgetMap[range]) {
      return budgetMap[range];
    }

    // 커스텀 예산: 문자열에서 숫자 추출 시도
    const numbers = range.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      // 마지막 숫자를 최대값으로 사용 (예: "4만원~6만원" → 60000)
      const lastNumber = parseInt(numbers[numbers.length - 1]);
      // 만원 단위로 입력했을 가능성 고려
      return lastNumber < 1000 ? lastNumber * 10000 : lastNumber;
    }

    return undefined;
  };

  // priceValue는 예산에서 추론 (예산이 낮을수록 가격 대비 가치 중요)
  const inferPriceValueWeight = (budgetRange?: BudgetRange): number => {
    if (!budgetRange) return 7; // 기본값

    // 사전 정의된 범위 처리
    const priceValueMap: Record<string, number> = {
      '0-50000': 10,      // 예산 낮으면 가성비 매우 중요
      '50000-100000': 8,  // 중간 예산, 가성비 중요
      '100000-150000': 6, // 높은 예산, 가성비 덜 중요
      '150000+': 5        // 최고 예산, 가성비 최소 중요
    };

    if (priceValueMap[budgetRange]) {
      return priceValueMap[budgetRange];
    }

    // 커스텀 예산인 경우 숫자 추출해서 판단
    const budgetValue = parseBudgetRange(budgetRange);
    if (budgetValue) {
      if (budgetValue <= 50000) return 10;
      if (budgetValue <= 100000) return 8;
      if (budgetValue <= 150000) return 6;
      return 5;
    }

    return 7; // fallback
  };

  const coreValueWeights = {
    temperatureControl: priorityToWeight[settings.temperatureControl || 'medium'],
    hygiene: priorityToWeight[settings.hygiene || 'medium'],
    material: priorityToWeight[settings.material || 'medium'],
    usability: priorityToWeight[settings.usability || 'medium'],
    portability: priorityToWeight[settings.portability || 'medium'],
    priceValue: inferPriceValueWeight(budget),
    durability: 7, // durability는 Priority 설정에 없으므로 기본값
    additionalFeatures: priorityToWeight[settings.additionalFeatures || 'medium']
  };

  // 중요도가 'high'인 속성들을 contextualNeeds로 변환
  const highPriorityAttributes = Object.entries(settings)
    .filter(([, level]) => level === 'high')
    .map(([key]) => {
      const attributeNames: { [key: string]: string } = {
        temperatureControl: '빠른 온도 조절과 유지',
        hygiene: '완벽한 위생과 쉬운 세척',
        material: '안전한 소재',
        usability: '편리한 사용성',
        portability: '뛰어난 휴대성',
        additionalFeatures: '유용한 부가 기능'
      };
      return attributeNames[key] || key;
    });

  const persona: UserPersona = {
    summary: `Priority 설정 기반 페르소나: ${highPriorityAttributes.join(', ')}을 중요하게 생각함`,
    coreValueWeights,
    contextualNeeds: highPriorityAttributes,
    budget: budget ? parseBudgetRange(budget) : undefined
  };

  console.log('✓ Priority-based persona generated');
  console.log('  Summary:', persona.summary);
  console.log('  Weights:', coreValueWeights);
  console.log('  Budget:', persona.budget);

  return persona;
}
