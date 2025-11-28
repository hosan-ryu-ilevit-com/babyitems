import { PrioritySettings, PriorityLevel, CoreAttributeKey } from '@/types';
import { PROS_TAGS, CONS_TAGS, ADDITIONAL_TAGS, CustomTag } from '@/data/priorityTags';

/**
 * 선택된 장점/단점/추가 고려사항 태그를 PrioritySettings로 변환
 *
 * 개선된 로직:
 * 1. 장점 태그의 relatedAttributes 배열을 순회하며 가중치 적용 (기본 +3점 × weight)
 * 2. 단점 태그의 relatedAttributes 배열을 순회하며 가중치 적용 (기본 -2점 × weight)
 * 3. 추가 고려사항 태그의 relatedAttributes 배열을 순회하며 가중치 적용 (기본 +3점 × weight)
 * 4. 커스텀 태그도 동일한 로직으로 처리 (AI 분석 결과 기반)
 * 5. 속성별 총점 계산
 * 6. 점수에 따라 high(6+), medium(3-5), low(~2) 분류
 *
 * 예시:
 * - "1도 단위 정확 조절" 장점 선택:
 *   → temperatureControl: +3 × 1.0 = +3
 *   → usability: +3 × 0.3 = +0.9
 * - "가볍고 컴팩트해서 휴대" 추가 고려사항 선택:
 *   → portability: +3 × 1.0 = +3 (medium)
 * - "물이 빨리 끓어요" 커스텀 장점 선택:
 *   → AI 분석 → temperatureControl: +3 × 1.0 = +3
 */
export function convertTagsToPriority(
  prosTagIds: string[],
  consTagIds: string[],
  additionalTagIds: string[] = [],
  customProsTags: CustomTag[] = [],
  customConsTags: CustomTag[] = []
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

  // 장점 태그 집계 (기본 +3점 × weight)
  prosTagIds.forEach(tagId => {
    const tag = PROS_TAGS.find(t => t.id === tagId);
    if (tag) {
      tag.relatedAttributes.forEach(({ attribute, weight }) => {
        if (priorityAttributes.includes(attribute)) {
          scores[attribute] += 3 * weight;
        }
      });
    }
  });

  // 단점 태그 집계 (기본 -2점 × weight)
  consTagIds.forEach(tagId => {
    const tag = CONS_TAGS.find(t => t.id === tagId);
    if (tag) {
      tag.relatedAttributes.forEach(({ attribute, weight }) => {
        if (priorityAttributes.includes(attribute)) {
          scores[attribute] -= 2 * weight;
        }
      });
    }
  });

  // 추가 고려사항 태그 집계 (기본 +3점 × weight - 장점과 동일 가중치)
  additionalTagIds.forEach(tagId => {
    const tag = ADDITIONAL_TAGS.find(t => t.id === tagId);
    if (tag) {
      tag.relatedAttributes.forEach(({ attribute, weight }) => {
        if (priorityAttributes.includes(attribute)) {
          scores[attribute] += 3 * weight;
        }
      });
    }
  });

  // 커스텀 장점 태그 집계 (AI 분석 결과 기반)
  customProsTags.forEach(customTag => {
    // 선택된 커스텀 태그만 처리
    if (prosTagIds.includes(customTag.id)) {
      customTag.relatedAttributes.forEach(({ attribute, weight }) => {
        if (priorityAttributes.includes(attribute)) {
          scores[attribute] += 3 * weight;
        }
      });
    }
  });

  // 커스텀 단점 태그 집계 (AI 분석 결과 기반)
  customConsTags.forEach(customTag => {
    // 선택된 커스텀 태그만 처리
    if (consTagIds.includes(customTag.id)) {
      customTag.relatedAttributes.forEach(({ attribute, weight }) => {
        if (priorityAttributes.includes(attribute)) {
          scores[attribute] -= 2 * weight;
        }
      });
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

  console.log('📊 Tag → Priority 변환 결과:', {
    selectedPros: prosTagIds.length,
    selectedCons: consTagIds.length,
    selectedAdditional: additionalTagIds.length,
    customPros: customProsTags.length,
    customCons: customConsTags.length,
    scores: Object.entries(scores)
      .filter(([key]) => priorityAttributes.includes(key as CoreAttributeKey))
      .map(([key, val]) => `${key}: ${val.toFixed(1)}`)
      .join(', '),
    priority: prioritySettings
  });

  return prioritySettings;
}

/**
 * 선택된 태그들을 분석해서 최소 1개 이상의 high priority가 있는지 확인
 */
export function validateTagSelection(
  prosTagIds: string[],
  consTagIds: string[],
  additionalTagIds: string[] = [],
  customProsTags: CustomTag[] = [],
  customConsTags: CustomTag[] = []
): { isValid: boolean; message?: string } {
  const priority = convertTagsToPriority(prosTagIds, consTagIds, additionalTagIds, customProsTags, customConsTags);

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
