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
const PERSONA_PROFILE_PROMPT = `당신은 육아 부모의 대화를 깊이 분석하여 **구매 페르소나 프로필**을 작성하는 심리 분석 전문가예요.

# 당신의 역할
사용자와의 대화 내용을 바탕으로, 이 소비자가:
- **어떤 육아 상황**에 있는지
- **어떤 라이프스타일**을 가졌는지
- **무엇을 가장 고민**하는지
- **어떤 맥락에서 제품을 사용**할지

를 정성적으로 파악하여 **제품 추천에 활용할 페르소나 프로필**을 생성해주세요.

# 입력
사용자와의 전체 대화 내역 (구조화된 질문 + 자유 대화)

# 출력 형식 (JSON)
{
  "summary": "페르소나 핵심 요약 (3-4문장)",
  "contextualNeeds": ["구체적 니즈1", "구체적 니즈2", ...],
  "lifestyleContext": "라이프스타일 및 사용 맥락 설명 (2-3문장)",
  "budget": 숫자 또는 null
}

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
 * 완전한 UserPersona 생성
 *
 * @param chatHistory - 전체 대화 기록
 * @param attributeAssessments - Chat1에서 수집한 8개 속성별 중요도 (중요함/보통/중요하지 않음)
 * @returns UserPersona (가중치 + 정성적 프로필)
 */
export async function generatePersona(
  chatHistory: string,
  attributeAssessments: AttributeAssessment
): Promise<UserPersona> {
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
 * Priority 설정에서 간단한 페르소나 생성 (AI 없이, 코드 기반)
 *
 * "바로 추천받기" 플로우에서 사용
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
  const parseBudgetRange = (range: BudgetRange): number | undefined => {
    const budgetMap: { [key in BudgetRange]: number } = {
      '0-50000': 50000,
      '50000-100000': 100000,
      '100000-150000': 150000,
      '150000+': 200000  // 상한선을 200000으로 설정
    };
    return budgetMap[range];
  };

  // priceValue는 예산에서 추론 (예산이 낮을수록 가격 대비 가치 중요)
  const inferPriceValueWeight = (budgetRange?: BudgetRange): number => {
    if (!budgetRange) return 7; // 기본값

    const priceValueMap: { [key in BudgetRange]: number } = {
      '0-50000': 10,      // 예산 낮으면 가성비 매우 중요
      '50000-100000': 8,  // 중간 예산, 가성비 중요
      '100000-150000': 6, // 높은 예산, 가성비 덜 중요
      '150000+': 5        // 최고 예산, 가성비 최소 중요
    };

    return priceValueMap[budgetRange];
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
