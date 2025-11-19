import { PrioritySettings, PriorityLevel, CoreAttributeKey } from '@/types';
import { PROS_TAGS, CONS_TAGS } from '@/data/priorityTags';

/**
 * 선택된 장점/단점 태그를 PrioritySettings로 변환
 *
 * 로직:
 * 1. 장점 태그의 relatedAttribute를 집계 (각 +2점)
 * 2. 단점 태그의 relatedAttribute를 집계 (각 -1점)
 * 3. 속성별 총점 계산
 * 4. 점수에 따라 high(6+), medium(3-5), low(~2) 분류
 */
export function convertTagsToPriority(
  prosTagIds: string[],
  consTagIds: string[]
): PrioritySettings {
  // 6개 우선순위 속성만 점수 계산 (priceValue 제외)
  const priorityAttributes: CoreAttributeKey[] = [
    'temperatureControl',
    'hygiene',
    'material',
    'usability',
    'portability',
    'additionalFeatures'
  ];

  // 초기 점수 맵
  const scores: Record<CoreAttributeKey, number> = {
    temperatureControl: 0,
    hygiene: 0,
    material: 0,
    usability: 0,
    portability: 0,
    additionalFeatures: 0,
    priceValue: 0,
    durability: 0
  };

  // 장점 태그 집계 (+2점)
  prosTagIds.forEach(tagId => {
    const tag = PROS_TAGS.find(t => t.id === tagId);
    if (tag && priorityAttributes.includes(tag.relatedAttribute)) {
      scores[tag.relatedAttribute] += 2;
    }
  });

  // 단점 태그 집계 (-1점)
  consTagIds.forEach(tagId => {
    const tag = CONS_TAGS.find(t => t.id === tagId);
    if (tag && priorityAttributes.includes(tag.relatedAttribute)) {
      scores[tag.relatedAttribute] -= 1;
    }
  });

  // 점수를 PriorityLevel로 변환
  const scoreToPriority = (score: number): PriorityLevel => {
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  };

  // PrioritySettings 생성
  const prioritySettings: PrioritySettings = {
    temperatureControl: scoreToPriority(scores.temperatureControl),
    hygiene: scoreToPriority(scores.hygiene),
    material: scoreToPriority(scores.material),
    usability: scoreToPriority(scores.usability),
    portability: scoreToPriority(scores.portability),
    additionalFeatures: scoreToPriority(scores.additionalFeatures)
  };

  return prioritySettings;
}

/**
 * 선택된 태그들을 분석해서 최소 1개 이상의 high priority가 있는지 확인
 */
export function validateTagSelection(
  prosTagIds: string[],
  consTagIds: string[]
): { isValid: boolean; message?: string } {
  const priority = convertTagsToPriority(prosTagIds, consTagIds);

  // high priority 개수 확인
  const highCount = Object.values(priority).filter(level => level === 'high').length;

  if (highCount === 0) {
    return {
      isValid: false,
      message: '최소 1개 이상의 장점을 선택해주세요. 선택한 장점이 중요한 속성으로 반영됩니다.'
    };
  }

  if (highCount > 3) {
    return {
      isValid: false,
      message: '장점을 너무 많이 선택하셨어요. 정말 중요한 장점 위주로 선택해주세요.'
    };
  }

  return { isValid: true };
}
