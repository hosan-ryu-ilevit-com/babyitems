import { PROS_TAGS, CONS_TAGS, ADDITIONAL_TAGS } from '@/data/priorityTags';

/**
 * 선택된 장점/단점/추가 고려사항 태그를 자연어 문맥으로 변환
 *
 * AI 추천 시스템에 전달할 사용자의 선호도 요약 문장을 생성합니다.
 */
export function generateTagContext(
  prosTagIds: string[],
  consTagIds: string[],
  additionalTagIds: string[] = []
): string {
  const selectedPros = prosTagIds
    .map(id => PROS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const selectedCons = consTagIds
    .map(id => CONS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const selectedAdditional = additionalTagIds
    .map(id => ADDITIONAL_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const parts: string[] = [];

  if (selectedPros.length > 0) {
    const prosText = selectedPros
      .map(text => `"${text}"`)
      .join(', ');
    parts.push(`사용자가 중요하게 생각하는 장점: ${prosText}`);
  }

  if (selectedCons.length > 0) {
    const consText = selectedCons
      .map(text => `"${text}"`)
      .join(', ');
    parts.push(`사용자가 절대 피하고 싶은 단점: ${consText}`);
  }

  if (selectedAdditional.length > 0) {
    const additionalText = selectedAdditional
      .map(text => `"${text}"`)
      .join(', ');
    parts.push(`사용자가 추가로 고려하는 부분: ${additionalText}`);
  }

  return parts.join('\n');
}

/**
 * 태그 기반 컨텍스트 요약 (Result 페이지 표시용)
 */
export interface TagContextSummary {
  prosTexts: string[];  // 선택된 장점 태그 텍스트들
  consTexts: string[];  // 선택된 단점 태그 텍스트들
  additionalTexts: string[];  // 선택된 추가 고려사항 태그 텍스트들
}

export function getTagContextSummary(
  prosTagIds: string[],
  consTagIds: string[],
  additionalTagIds: string[] = []
): TagContextSummary {
  const prosTexts = prosTagIds
    .map(id => PROS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const consTexts = consTagIds
    .map(id => CONS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const additionalTexts = additionalTagIds
    .map(id => ADDITIONAL_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  return {
    prosTexts,
    consTexts,
    additionalTexts
  };
}

/**
 * 태그를 contextualNeeds로 직접 변환 (LLM 없이)
 *
 * 바로 추천받기 플로우에서 LLM 호출을 스킵하기 위해 사용
 */
export function convertTagsToContextualNeeds(
  prosTagIds: string[],
  consTagIds: string[],
  additionalTagIds: string[] = []
): string[] {
  const contextualNeeds: string[] = [];

  // 장점 태그 → 긍정형 니즈
  prosTagIds.forEach(id => {
    const tag = PROS_TAGS.find(t => t.id === id);
    if (tag) {
      contextualNeeds.push(tag.text);
    }
  });

  // 단점 태그 → 회피형 니즈 (부정을 긍정으로 변환)
  consTagIds.forEach(id => {
    const tag = CONS_TAGS.find(t => t.id === id);
    if (tag) {
      // 단점을 반대로 변환
      // 예: "입구가 좁아 세척 불편" → "넓은 입구로 쉬운 세척"
      const negativeToPositive: Record<string, string> = {
        'hygiene-narrow': '넓은 입구로 쉬운 세척',
        'hygiene-gap': '틈새 없는 깔끔한 구조',
        'usability-noise': '조용한 작동 소음',
        'usability-sensitive': '정확하고 안정적인 터치 버튼',
        'usability-operation': '직관적이고 간단한 조작',
        'temp-slow': '빠른 온도 조절',
        'material-heavy': '가벼운 무게',
        'material-quality': '깨끗하고 냄새 없는 소재',
        'portability-bulky': '컴팩트한 크기',
        'price-expensive': '합리적인 가격'
      };
      contextualNeeds.push(negativeToPositive[id] || `${tag.text} 회피`);
    }
  });

  // 추가 고려사항 태그
  additionalTagIds.forEach(id => {
    const tag = ADDITIONAL_TAGS.find(t => t.id === id);
    if (tag) {
      contextualNeeds.push(tag.text);
    }
  });

  return contextualNeeds;
}
