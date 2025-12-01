import { getModel, callGeminiWithRetry, parseJSONResponse } from '../ai/gemini';
import { AttributeAssessment, UserContextSummary, Message, PrioritySettings, BudgetRange } from '@/types';

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
    const model = getModel(0.3); // 낮은 temperature for classification
    const response = await model.generateContent(prompt);
    console.log('  ✓ Received response from Gemini');
    const text = response.response.text();
    console.log('  📄 Response text length:', text.length);

    return parseJSONResponse<UserContextSummary>(text);
  });

  console.log('✓ Context summary generated');
  console.log('  Priority attributes:', result.priorityAttributes.length);
  console.log('  Additional context:', result.additionalContext.length);

  return result;
}

/**
 * Priority 플로우용: Priority 설정 + Chat 이력 + 추가 요청사항을 함께 분석하여 Context Summary 생성
 *
 * @param prioritySettings - Priority 페이지에서 선택한 6개 속성 중요도
 * @param budget - 선택한 예산 범위
 * @param messages - Chat 대화 이력 (선택적, 바로 추천받기 시 빈 배열)
 * @param phase0Context - Priority 페이지에서 입력한 추가 요청사항 (선택적)
 * @param existingContextSummary - 기존 contextSummary (재추천 시 additionalContext 보존용)
 * @param selectedTags - 선택된 태그들 (장점/단점/추가 고려사항)
 */
export async function generateContextSummaryFromPriorityWithChat(
  prioritySettings: PrioritySettings,
  budget: BudgetRange | undefined,
  messages: Message[],
  phase0Context?: string,
  existingContextSummary?: UserContextSummary,
  selectedTags?: {
    pros?: string[];
    cons?: string[];
    additional?: string[];
  }
): Promise<UserContextSummary> {
  console.log('🔍 Generating context summary from Priority + Chat...');
  console.log('  Priority settings:', prioritySettings);
  console.log('  Budget:', budget);
  console.log('  Messages count:', messages?.length || 0);
  console.log('  Phase0 context:', phase0Context?.substring(0, 100) || 'none');
  console.log('  Existing additionalContext:', existingContextSummary?.additionalContext || 'none');
  console.log('  Selected tags:', selectedTags);

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
        '0-50000': '최대 5만원',
        '50000-100000': '최대 10만원',
        '100000-150000': '최대 15만원',
        '150000+': '15만원+'
      }[budget] || budget
    : undefined;

  // 기존 additionalContext 준비 (재추천 시 보존할 태그들)
  const existingContextText = existingContextSummary?.additionalContext && existingContextSummary.additionalContext.length > 0
    ? `\n\n# 기존에 파악한 맥락 (반드시 보존해야 함)\n${existingContextSummary.additionalContext.map(c => `- ${c}`).join('\n')}`
    : '';

  const prompt = `당신은 분유 워머 추천 서비스의 요약 생성 전문가입니다.
사용자가 선택한 중요도 설정${phase0Context || chatHistory ? ', 추가 요청사항' : ''}${chatHistory ? ', 대화 내역' : ''}을 분석하여, 결과 페이지 최상단에 표시할 깔끔한 요약 정보를 생성해주세요.

# 사용자가 선택한 중요도 (Priority 페이지)
${priorityText}

# 예산
${budgetText || '미선택'}
${phase0Context ? `

# 추가 요청사항 (Priority 페이지 Step 3)
${phase0Context}
` : ''}
${chatHistory ? `

# 채팅 대화 내역
${chatHistory}
` : ''}${existingContextText}

# 작업 지침

1. **priorityAttributes**: 위에 나열된 **선택된 모든 속성** (6개)에 대해 **빠짐없이 전부** 포함하여:
   - name: 속성명 (한글) - 위에 나열된 것과 정확히 동일하게
   - level: 중요도 레벨 ("중요하지 않음" | "보통" | "중요함") - 위에 나열된 것과 정확히 동일하게
   - reason: ${phase0Context || chatHistory ? '추가 요청사항과 대화에서 파악한 이 속성에 대한 사용자의 니즈를 **간결하게 1-2문장**으로 요약. 명확한 언급이 없었다면 일반적으로 작성 (예: "기본적인 수준이면 충분")' : '중요도에 따라 일반적으로 작성 (예: "특히 중요하게 고려함", "적당히 고려함", "기본 수준이면 충분")'}

   ⚠️ 매우 중요:
   - 위에 나열된 **모든 속성을 빠짐없이 100% 포함**해야 합니다
   - 하나라도 누락하면 안 됩니다
   - "중요하지 않음"으로 선택한 속성도 반드시 포함

2. **additionalContext**: 추가 요청사항과 대화에서 파악한 추가 맥락을 **짧은 키워드 형태**로 추출:
   - 예: "쌍둥이 육아 중", "야간 수유 빈번", "외출 많음", "좁은 공간", "디자인 선호: 흰색 유광"
   ${existingContextText ? '- ⚠️ **매우 중요**: 위에 나열된 "기존에 파악한 맥락"을 **반드시 모두 포함**하고, 새로운 대화에서 추가 맥락이 발견되면 함께 포함' : '- 3-5개 정도로 핵심만 추출'}
   - 추가 요청사항의 핵심 내용을 우선적으로 포함
   ${existingContextText ? '- 기존 맥락 + 새로운 맥락 = 총 3-7개 정도' : ''}
   - ⚠️ **매우 중요**: 추가 요청사항이나 대화에서 실제로 파악된 맥락이 **하나도 없으면** 반드시 **빈 배열 []** 을 반환해야 합니다
   - **절대로** "추가 요청사항 없음", "없음", "해당 없음" 같은 텍스트를 배열에 넣지 마세요

3. **budget**: ${budgetText ? `"${budgetText}"` : 'null'} (위에 명시된 예산을 그대로 작성)

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
  "budget": ${budgetText ? `"${budgetText}"` : 'null'}
}
\`\`\`

⚠️ 주의사항:
- reason은 **반드시 간결하게** (1-2문장, 최대 50자 이내)
- additionalContext는 **짧은 키워드**로 (각 항목 10자 이내)
- 추가 요청사항과 대화에서 명확하게 드러난 내용만 포함
- 추측하지 말고 실제 내용 기반으로만 작성
- 추가 요청사항이 있다면 **우선적으로 반영**
- **매우 중요**: 파악된 맥락이 없으면 additionalContext는 **반드시 빈 배열 []**
- **절대 금지**: "추가 요청사항 없음", "없음" 같은 텍스트를 additionalContext에 넣는 것

JSON만 출력하세요.`;

  const result = await callGeminiWithRetry(async () => {
    console.log('  🔄 Sending request to Gemini...');
    const model = getModel(0.3); // 낮은 temperature for classification
    const response = await model.generateContent(prompt);
    console.log('  ✓ Received response from Gemini');
    const text = response.response.text();
    console.log('  📄 Response text length:', text.length);

    return parseJSONResponse<UserContextSummary>(text);
  });

  // 태그를 additionalContext와 priorityAttributes에 반영 (코드 기반, LLM 없이)
  if (selectedTags) {
    const { getTagContextSummary } = await import('@/lib/utils/tagContext');
    const { ADDITIONAL_TAGS } = await import('@/data/priorityTags');

    const tagSummary = getTagContextSummary(
      selectedTags.pros || [],
      selectedTags.cons || [],
      selectedTags.additional || []
    );

    // 장점/단점/추가 고려사항 태그를 additionalContext에 추가
    const tagContexts: string[] = [];

    if (tagSummary.prosTexts.length > 0) {
      tagContexts.push(...tagSummary.prosTexts);
    }

    if (tagSummary.consTexts.length > 0) {
      // 단점 태그는 "회피: " 접두사 추가
      tagContexts.push(...tagSummary.consTexts.map(text => `회피: ${text}`));
    }

    if (tagSummary.additionalTexts.length > 0) {
      tagContexts.push(...tagSummary.additionalTexts);
    }

    // 기존 additionalContext와 병합 (중복 제거)
    result.additionalContext = [
      ...result.additionalContext,
      ...tagContexts
    ].filter((v, i, a) => a.indexOf(v) === i);

    // 추가 고려사항 태그가 특정 속성과 관련이 있으면 priorityAttributes에 반영
    if (selectedTags.additional && selectedTags.additional.length > 0) {
      selectedTags.additional.forEach(tagId => {
        const tag = ADDITIONAL_TAGS.find(t => t.id === tagId);
        if (tag && tag.relatedAttributes.length > 0) {
          // 주 속성 (weight 1.0)만 처리
          const mainAttr = tag.relatedAttributes.find(a => a.weight === 1.0);
          if (mainAttr) {
            const attrKey = mainAttr.attribute;

            // priorityAttributes에서 해당 속성 찾기
            const existingAttr = result.priorityAttributes.find(
              attr => attr.name.includes(getAttributeNameKorean(attrKey))
            );

            if (existingAttr) {
              // 기존 reason에 태그 내용 추가
              existingAttr.reason = `${existingAttr.reason}. 특히 "${tag.text}"`;
              // level을 최소 '보통'으로 올림 (사용자가 선택한 의도 반영)
              if (existingAttr.level === '중요하지 않음') {
                existingAttr.level = '보통';
              }
            }
          }
        }
      });
    }

    console.log('🏷️  Added tags to additionalContext:', tagContexts.length, 'items');
    console.log('🏷️  Adjusted priorityAttributes for additional tags');
  }

  // 속성명 한글 매핑 함수
  function getAttributeNameKorean(key: string): string {
    const map: Record<string, string> = {
      temperatureControl: '온도',
      hygiene: '위생',
      material: '소재',
      usability: '사용',
      portability: '휴대성',
      additionalFeatures: '부가'
    };
    return map[key] || key;
  }

  console.log('✓ Context summary generated');
  console.log('  Priority attributes:', result.priorityAttributes.length);
  console.log('  Additional context:', result.additionalContext.length);
  console.log('  Budget:', result.budget);

  return result;
}
