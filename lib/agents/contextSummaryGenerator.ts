import { GoogleGenerativeAI } from '@google/generative-ai';
import { callGeminiWithRetry } from '../ai/gemini';
import { AttributeAssessment, UserContextSummary, Message, PrioritySettings, BudgetRange } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

/**
 * Helper function to safely extract and parse JSON from Gemini response
 */
function extractAndParseJSON(text: string): any {
  // Extract JSON from potential markdown code blocks
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.error('❌ Failed to extract JSON from response');
    console.error('   Response text (first 300 chars):', text.substring(0, 300));
    throw new Error('Failed to extract JSON from Gemini response');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];

  try {
    return JSON.parse(jsonText);
  } catch (parseError) {
    console.error('❌ JSON.parse failed');
    console.error('   JSON text (first 500 chars):', jsonText.substring(0, 500));
    console.error('   Parse error:', parseError);
    throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }
}

/**
 * Context Summary Generator Agent
 *
 * 사용자가 대화 중 선택한 7개 기준의 중요도와 추가 맥락들을 분석하여
 * 결과 페이지 최상단에 표시할 요약 정보를 생성합니다.
 *
 * 출력:
 * - priorityAttributes: 사용자가 중요하게 생각하는 속성들과 그 이유
 * - additionalContext: 대화에서 파악한 추가 맥락 (예: "쌍둥이", "야간 수유 많음")
 * - budget: 예산 (언급되었다면)
 */

const ATTRIBUTE_NAME_MAP: Record<string, string> = {
  temperatureControl: '온도 조절/유지',
  hygiene: '위생/세척 편의성',
  material: '소재/안전성',
  usability: '사용 편의성',
  portability: '휴대성',
  priceValue: '가격 대비 가치',
  durability: '내구성/A/S',
  additionalFeatures: '부가 기능/디자인',
};

export async function generateContextSummary(
  messages: Message[],
  attributeAssessments: AttributeAssessment
): Promise<UserContextSummary> {
  console.log('🔍 Generating user context summary...');

  // 대화 내역을 텍스트로 변환
  const chatHistory = messages
    .map((msg) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
    .join('\n\n');

  // 중요도가 선택된 속성들 추출 (사용자가 선택한 7개)
  const selectedAttributes = Object.entries(attributeAssessments)
    .filter(([, level]) => level !== null)
    .map(([key, level]) => ({
      key,
      name: ATTRIBUTE_NAME_MAP[key as keyof typeof ATTRIBUTE_NAME_MAP],
      level: level!,
    }));

  console.log(`  📊 Selected attributes count: ${selectedAttributes.length}`);

  const prompt = `당신은 분유 워머 추천 서비스의 요약 생성 전문가입니다.
사용자와의 대화 내역과 선택한 중요도 정보를 분석하여, 결과 페이지 최상단에 표시할 깔끔한 요약 정보를 생성해주세요.

# 대화 내역
${chatHistory}

# 사용자가 선택한 중요도
${selectedAttributes
  .map((attr) => `- ${attr.name}: ${attr.level}`)
  .join('\n')}

# 작업 지침

1. **priorityAttributes**: 위에 나열된 **선택된 모든 속성** (보통 7개)에 대해 **빠짐없이 전부** 포함하여:
   - name: 속성명 (한글) - 위에 나열된 것과 정확히 동일하게
   - level: 중요도 레벨 ("중요하지 않음" | "보통" | "중요함") - 위에 나열된 것과 정확히 동일하게
   - reason: 대화에서 파악한 이 속성에 대한 사용자의 니즈를 **간결하게 1-2문장**으로 요약

   ⚠️ 매우 중요:
   - 위에 나열된 **모든 속성을 빠짐없이 100% 포함**해야 합니다
   - 하나라도 누락하면 안 됩니다
   - "중요하지 않음"으로 선택한 속성도 반드시 포함
   - 대화에서 명확한 언급이 없었다면 reason은 일반적으로 작성 (예: "기본적인 수준이면 충분")

2. **additionalContext**: 대화에서 파악한 추가 맥락을 **짧은 키워드 형태**로 추출:
   - 예: "쌍둥이 육아 중", "야간 수유 빈번", "외출 많음", "좁은 공간"
   - 3-5개 정도로 핵심만 추출
   - 없으면 빈 배열

3. **budget**: 예산이 언급되었다면 "~원" 형태로 표시, 없으면 null

# 출력 형식 (JSON)
\`\`\`json
{
  "priorityAttributes": [
    {
      "name": "온도 조절/유지",
      "level": "중요함",
      "reason": "아기가 차가운 우유를 싫어해서 온도 유지가 중요함"
    }
  ],
  "additionalContext": [
    "쌍둥이 육아 중",
    "야간 수유 빈번"
  ],
  "budget": "10만원"
}
\`\`\`

⚠️ 주의사항:
- reason은 **반드시 간결하게** (1-2문장, 최대 50자 이내)
- additionalContext는 **짧은 키워드**로 (각 항목 10자 이내)
- 대화에서 명확하게 드러난 내용만 포함
- 추측하지 말고 실제 대화 내용 기반으로만 작성

JSON만 출력하세요.`;

  const result = await callGeminiWithRetry(async () => {
    console.log('  🔄 Sending request to Gemini...');
    const response = await model.generateContent(prompt);
    console.log('  ✓ Received response from Gemini');
    const text = response.response.text();
    console.log('  📄 Response text length:', text.length);

    return extractAndParseJSON(text);
  });

  console.log('✓ Context summary generated');
  console.log('  Priority attributes:', result.priorityAttributes.length);
  console.log('  Additional context:', result.additionalContext.length);

  return result as UserContextSummary;
}

/**
 * Priority 플로우용: Priority 설정 + Chat 이력을 함께 분석하여 Context Summary 생성
 *
 * @param prioritySettings - Priority 페이지에서 선택한 6개 속성 중요도
 * @param budget - 선택한 예산 범위
 * @param messages - Chat 대화 이력 (선택적, 바로 추천받기 시 빈 배열)
 */
export async function generateContextSummaryFromPriorityWithChat(
  prioritySettings: PrioritySettings,
  budget: BudgetRange | undefined,
  messages: Message[]
): Promise<UserContextSummary> {
  console.log('🔍 Generating context summary from Priority + Chat...');
  console.log('  Priority settings:', prioritySettings);
  console.log('  Budget:', budget);
  console.log('  Messages count:', messages?.length || 0);

  // 속성명 매핑 (Priority 플로우 기준 - 6개)
  const attributeNames: { [key: string]: string } = {
    temperatureControl: '온도 조절/유지 성능',
    hygiene: '위생/세척 편의성',
    material: '안전한 소재',
    usability: '사용 편의성',
    portability: '휴대성',
    additionalFeatures: '부가 기능 및 디자인'
  };

  const priorityLevelKorean: { [key: string]: string } = {
    high: '중요함',
    medium: '보통',
    low: '중요하지 않음'
  };

  // 대화 내역 준비
  const chatHistory = messages && messages.length > 0
    ? messages
        .map((msg) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
        .join('\n\n')
    : '';

  // Priority 설정을 문자열로 변환
  const priorityText = Object.entries(prioritySettings)
    .map(([key, level]) => `- ${attributeNames[key] || key}: ${priorityLevelKorean[level]}`)
    .join('\n');

  // 예산 텍스트
  const budgetText = budget
    ? {
        '0-50000': '5만원 이하',
        '50000-100000': '5~10만원',
        '100000-150000': '10~15만원',
        '150000+': '15만원 이상'
      }[budget] || budget
    : undefined;

  const prompt = `당신은 분유 워머 추천 서비스의 요약 생성 전문가입니다.
사용자가 선택한 중요도 설정${chatHistory ? '과 대화 내역' : ''}을 분석하여, 결과 페이지 최상단에 표시할 깔끔한 요약 정보를 생성해주세요.

# 사용자가 선택한 중요도 (Priority 페이지)
${priorityText}

# 예산
${budgetText || '미선택'}
${chatHistory ? `

# 채팅 대화 내역
${chatHistory}
` : ''}

# 작업 지침

1. **priorityAttributes**: 위에 나열된 **선택된 모든 속성** (6개)에 대해 **빠짐없이 전부** 포함하여:
   - name: 속성명 (한글) - 위에 나열된 것과 정확히 동일하게
   - level: 중요도 레벨 ("중요하지 않음" | "보통" | "중요함") - 위에 나열된 것과 정확히 동일하게
   - reason: ${chatHistory ? '대화에서 파악한 이 속성에 대한 사용자의 니즈를 **간결하게 1-2문장**으로 요약. 대화에서 명확한 언급이 없었다면 일반적으로 작성 (예: "기본적인 수준이면 충분")' : '중요도에 따라 일반적으로 작성 (예: "특히 중요하게 고려함", "적당히 고려함", "기본 수준이면 충분")'}

   ⚠️ 매우 중요:
   - 위에 나열된 **모든 속성을 빠짐없이 100% 포함**해야 합니다
   - 하나라도 누락하면 안 됩니다
   - "중요하지 않음"으로 선택한 속성도 반드시 포함

2. **additionalContext**: ${chatHistory ? '대화에서 파악한 추가 맥락을 **짧은 키워드 형태**로 추출' : '빈 배열로 반환'}:
   - 예: "쌍둥이 육아 중", "야간 수유 빈번", "외출 많음", "좁은 공간"
   - 3-5개 정도로 핵심만 추출
   - 없으면 빈 배열

3. **budget**: "${budgetText || 'null'}"

# 출력 형식 (JSON)
\`\`\`json
{
  "priorityAttributes": [
    {
      "name": "온도 조절/유지 성능",
      "level": "중요함",
      "reason": "아기가 차가운 우유를 싫어해서 온도 유지가 중요함"
    },
    {
      "name": "위생/세척 편의성",
      "level": "보통",
      "reason": "적당한 수준의 세척 편의성이면 충분"
    }
  ],
  "additionalContext": [
    "쌍둥이 육아 중",
    "야간 수유 빈번"
  ],
  "budget": "${budgetText || null}"
}
\`\`\`

⚠️ 주의사항:
- reason은 **반드시 간결하게** (1-2문장, 최대 50자 이내)
- additionalContext는 **짧은 키워드**로 (각 항목 10자 이내)
${chatHistory ? '- 대화에서 명확하게 드러난 내용만 포함' : '- 대화가 없으므로 additionalContext는 빈 배열'}
- 추측하지 말고 실제 내용 기반으로만 작성

JSON만 출력하세요.`;

  const result = await callGeminiWithRetry(async () => {
    console.log('  🔄 Sending request to Gemini...');
    const response = await model.generateContent(prompt);
    console.log('  ✓ Received response from Gemini');
    const text = response.response.text();
    console.log('  📄 Response text length:', text.length);

    return extractAndParseJSON(text);
  });

  console.log('✓ Context summary generated');
  console.log('  Priority attributes:', result.priorityAttributes.length);
  console.log('  Additional context:', result.additionalContext.length);
  console.log('  Budget:', result.budget);

  return result as UserContextSummary;
}
