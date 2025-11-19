import { PROS_TAGS, CONS_TAGS } from '@/data/priorityTags';

/**
 * 선택된 장점/단점 태그를 자연어 문맥으로 변환
 *
 * AI 추천 시스템에 전달할 사용자의 선호도 요약 문장을 생성합니다.
 */
export function generateTagContext(
  prosTagIds: string[],
  consTagIds: string[]
): string {
  const selectedPros = prosTagIds
    .map(id => PROS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const selectedCons = consTagIds
    .map(id => CONS_TAGS.find(tag => tag.id === id))
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

  return parts.join('\n');
}

/**
 * 태그 기반 컨텍스트 요약 (Result 페이지 표시용)
 */
export interface TagContextSummary {
  prosTexts: string[];  // 선택된 장점 태그 텍스트들
  consTexts: string[];  // 선택된 단점 태그 텍스트들
}

export function getTagContextSummary(
  prosTagIds: string[],
  consTagIds: string[]
): TagContextSummary {
  const prosTexts = prosTagIds
    .map(id => PROS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  const consTexts = consTagIds
    .map(id => CONS_TAGS.find(tag => tag.id === id))
    .filter(Boolean)
    .map(tag => tag!.text);

  return {
    prosTexts,
    consTexts
  };
}
