import { UserContextSummary, BudgetRange, PrioritySettings, PriorityLevel } from '@/types';
import { convertTagsToPriority } from './tagToPriority';

/**
 * 태그 기반 흐름에서 코드로 contextSummary 생성 (LLM 호출 없음)
 *
 * @param selectedProsTags - 선택된 장점 태그들
 * @param selectedConsTags - 선택된 단점 태그들
 * @param budget - 예산 범위
 * @returns UserContextSummary
 */
export function generateContextSummaryFromTags(
  selectedProsTags: Array<{ id: string; text: string }>,
  selectedConsTags: Array<{ id: string; text: string }>,
  budget: BudgetRange
): UserContextSummary {
  // 1. Convert tags to prioritySettings
  const prosTagIds = selectedProsTags.map(t => t.id);
  const consTagIds = selectedConsTags.map(t => t.id);

  const prioritySettings: PrioritySettings = convertTagsToPriority(
    prosTagIds,
    consTagIds,
    [] // No additional tags in v2 flow
  );

  // 2. Generate priorityAttributes from prioritySettings
  const attributeNames: Record<string, string> = {
    temperatureControl: '온도 조절/유지 성능',
    hygiene: '위생/세척 편의성',
    material: '안전한 소재',
    usability: '사용 편의성',
    portability: '휴대성',
    additionalFeatures: '부가 기능 및 디자인'
  };

  const levelKorean: Record<PriorityLevel, string> = {
    high: '중요함',
    medium: '보통',
    low: '중요하지 않음'
  };

  const priorityAttributes = Object.entries(prioritySettings)
    .map(([key, level]) => ({
      name: attributeNames[key as keyof typeof attributeNames],
      level: levelKorean[level as PriorityLevel],
      reason: generateReasonForAttribute(
        key,
        level as PriorityLevel,
        selectedProsTags,
        selectedConsTags
      )
    }));

  // 3. Generate additionalContext from selected tags
  const additionalContext = [
    ...selectedProsTags.map(t => t.text),
    ...selectedConsTags.map(t => `회피: ${t.text}`)
  ];

  // 4. Convert budget to Korean format
  const budgetKorean = {
    '0-50000': '최대 5만원',
    '50000-100000': '최대 10만원',
    '100000-150000': '최대 15만원',
    '150000+': '15만원 이상'
  }[budget] || budget;

  console.log('📊 코드 기반 Context Summary 생성 완료');
  console.log(`   Priority attributes: ${priorityAttributes.length}`);
  console.log(`   Additional context: ${additionalContext.length}`);
  console.log(`   Budget: ${budgetKorean}`);

  return {
    priorityAttributes,
    additionalContext,
    budget: budgetKorean
  };
}

/**
 * 속성별 reason 생성 (간단한 로직)
 */
function generateReasonForAttribute(
  attributeKey: string,
  level: PriorityLevel,
  selectedProsTags: Array<{ id: string; text: string }>,
  selectedConsTags: Array<{ id: string; text: string }>
): string {
  const attributeDescriptions: Record<string, string> = {
    temperatureControl: '정확한 온도 조절과 유지',
    hygiene: '깨끗하고 위생적인 관리',
    material: '안전하고 믿을 수 있는 소재',
    usability: '편리하고 쉬운 사용',
    portability: '가볍고 휴대 가능한 디자인',
    additionalFeatures: '유용한 부가 기능과 디자인'
  };

  const description = attributeDescriptions[attributeKey] || '해당 기능';

  // 레벨에 따라 다른 reason 생성
  if (level === 'high') {
    return `${description}을 특히 중요하게 고려합니다`;
  } else if (level === 'medium') {
    return `${description}도 적당히 고려합니다`;
  } else {
    return `기본적인 수준이면 충분합니다`;
  }
}
