/**
 * 하드필터 레이블 정규화 유틸리티
 * - Type A: 동의어 매핑 (같은 의미의 다른 표현을 하나로)
 * - Type B: 전처리 규칙 기반 정규화 (suffix 제거 등)
 */

// ============================================================
// Type A: 동의어 매핑 테이블
// - 필터별로 같은 의미의 값들을 canonical 값으로 매핑
// - canonical: 대표 값 (UI에 표시)
// - aliases: 같은 의미의 다른 표현들
// ============================================================
interface SynonymMapping {
  canonical: string;
  aliases: string[];
}

const SYNONYM_MAPPINGS: Record<string, SynonymMapping[]> = {
  // 허용무게: "~Xkg"와 "Xkg"를 같은 것으로 처리
  허용무게: [
    { canonical: '~13kg', aliases: ['~13kg', '13kg', '0~13kg'] },
    { canonical: '~18kg', aliases: ['~18kg', '18kg'] },
    { canonical: '~19kg', aliases: ['~19kg', '19kg'] },
    { canonical: '~20kg', aliases: ['~20kg', '20kg'] },
    { canonical: '~23kg', aliases: ['~23kg', '23kg'] },
    { canonical: '~25kg', aliases: ['~25kg', '25kg'] },
    { canonical: '~34kg', aliases: ['~34kg', '34kg'] },
    { canonical: '~36kg', aliases: ['~36kg', '36kg'] },
  ],
};

/**
 * Type A: 동의어 매핑 적용
 * - 특정 필터의 값을 canonical 값으로 변환
 */
function applySynonymMapping(filterName: string, value: string): string {
  const mappings = SYNONYM_MAPPINGS[filterName];
  if (!mappings) return value;

  for (const { canonical, aliases } of mappings) {
    if (aliases.includes(value)) {
      return canonical;
    }
  }
  return value;
}

/**
 * Type A: 동의어 매핑에서 aliases 가져오기
 */
export function getSynonymAliases(filterName: string, canonical: string): string[] {
  const mappings = SYNONYM_MAPPINGS[filterName];
  if (!mappings) return [canonical];

  const mapping = mappings.find(m => m.canonical === canonical);
  return mapping?.aliases || [canonical];
}

// ============================================================
// Type B: 전처리 규칙 기반 정규화
// ============================================================

/**
 * Type B: 전처리 규칙 적용
 * - 끝의 쉼표 제거 (예: "높이조절," → "높이조절")
 * - "까지" 제거 (예: "~36kg까지" → "~36kg")
 * - 앞뒤 공백 제거
 */
function applyPreprocessingRules(value: string): string {
  if (!value || typeof value !== 'string') return value;

  let normalized = value.trim();

  // 1. 끝의 쉼표(+공백) 제거: "높이조절," → "높이조절"
  normalized = normalized.replace(/,\s*$/, '');

  // 2. "까지" 제거: "~36kg까지" → "~36kg"
  normalized = normalized.replace(/까지$/, '');

  // 3. 다시 trim (혹시 남은 공백)
  normalized = normalized.trim();

  return normalized;
}

// ============================================================
// 통합 정규화 함수
// ============================================================

/**
 * 필터 값을 정규화된 형태로 변환 (Type B만 적용)
 * - 기본 전처리 규칙만 적용
 * - 필터명 없이 호출 시 사용
 */
export function normalizeFilterValue(value: string): string {
  return applyPreprocessingRules(value);
}

/**
 * 필터 값을 정규화된 형태로 변환 (Type A + Type B 모두 적용)
 * - 필터명이 있으면 동의어 매핑도 적용
 */
export function normalizeFilterValueWithContext(filterName: string, value: string): string {
  // Type B 먼저 적용
  let normalized = applyPreprocessingRules(value);

  // Type A 적용
  normalized = applySynonymMapping(filterName, normalized);

  return normalized;
}

/**
 * 정규화된 값에서 원본 값들(aliases)을 역으로 찾기 위한 매칭 함수
 * - 필터링 시 정규화된 값과 원본 값 모두 매칭되도록
 */
export function matchesNormalizedValue(
  productValue: string | undefined,
  normalizedTarget: string
): boolean {
  if (!productValue) return false;

  // 제품 값도 정규화해서 비교
  const normalizedProductValue = normalizeFilterValue(productValue);
  return normalizedProductValue === normalizedTarget;
}

/**
 * 여러 값들을 정규화하고 중복 제거 (Type A + Type B)
 * - 정규화 후 같아지는 값들을 하나로 병합
 * - 각 정규화된 값에 대해 원본 값들(aliases) 추적
 * - filterName이 제공되면 Type A(동의어 매핑)도 적용
 */
export function normalizeAndDeduplicateValues(
  values: string[],
  filterName?: string
): { normalized: string; aliases: string[]; count: number }[] {
  const normalizedMap = new Map<string, { aliases: Set<string>; count: number }>();

  for (const value of values) {
    // Type B + (선택적) Type A 적용
    const normalized = filterName
      ? normalizeFilterValueWithContext(filterName, value)
      : normalizeFilterValue(value);

    if (!normalizedMap.has(normalized)) {
      normalizedMap.set(normalized, { aliases: new Set(), count: 0 });
    }

    const entry = normalizedMap.get(normalized)!;
    entry.aliases.add(value);
    entry.count++;
  }

  return Array.from(normalizedMap.entries()).map(([normalized, data]) => ({
    normalized,
    aliases: Array.from(data.aliases),
    count: data.count,
  }));
}

/**
 * 특정 필터에 대해 정규화가 필요한지 확인
 * - 모든 필터에 적용하되, 특정 필터는 더 공격적인 정규화 가능
 */
export function shouldNormalizeFilter(filterName: string): boolean {
  // 현재는 모든 필터에 기본 정규화 적용
  return true;
}

/**
 * 필터별 추가 정규화 규칙 (확장 가능)
 */
export function getFilterSpecificNormalizer(
  filterName: string
): ((value: string) => string) | null {
  // 필터별 특수 정규화 규칙 추가 가능
  // 현재는 기본 정규화만 사용
  return null;
}
