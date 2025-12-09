/**
 * 다나와 필터 데이터를 하드필터 질문으로 변환
 * - 다나와 필터 기반 동적 생성
 * - 수동 정의 질문 fallback
 * - filter_attrs 기반 필터링 지원
 */

import type { HardFilterQuestion, HardFilterOption } from '@/types/recommend-v2';
import manualQuestionsData from '@/data/rules/manual_hard_questions.json';

// 다나와 필터 원본 타입
interface DanawaFilter {
  category_code: string;
  filter_name: string;
  options: string[];
  option_count: number;
}

// 수동 정의 질문 타입
interface ManualQuestionConfig {
  questions: Array<{
    id: string;
    type: string;
    question: string;
    options: Array<{
      label: string;
      value: string;
      filter: Record<string, unknown>;
    }>;
  }>;
}

// 카테고리 키 → 다나와 카테고리 코드 매핑
export const CATEGORY_CODE_MAP: Record<string, string[]> = {
  stroller: ['16349368', '16349193', '16349195', '16349196'],
  car_seat: ['16349200', '16349201', '16349202', '16353763'],
  formula: ['16249091'],
  formula_maker: ['16349381'],
  formula_pot: ['16330960'],
  baby_bottle: ['16349219'],
  pacifier: ['16349351'],
  diaper: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042'],
  baby_wipes: ['16349119'],
  thermometer: ['17325941'],
  nasal_aspirator: ['16349248'],
  ip_camera: ['11427546'],
  baby_bed: ['16338152'],
  high_chair: ['16338153', '16338154'],
  baby_sofa: ['16338155'],
  baby_desk: ['16338156'],
};

// 필터 이름 → 한글 질문 텍스트 매핑
const FILTER_QUESTION_MAP: Record<string, string> = {
  '제조사별': '선호하는 브랜드가 있나요?',
  '브랜드별': '선호하는 브랜드가 있나요?',
  '재질': '어떤 재질을 선호하세요?',
  '뚜껑': '뚜껑 타입은 어떤 게 좋으세요?',
  '안전기능': '꼭 필요한 안전기능이 있나요?',
  '품목': '어떤 제품을 찾으세요?',
  '형태': '어떤 형태를 원하세요?',
  '한팩당': '한 팩에 몇 매가 좋으세요?',
  '용량': '원하는 용량이 있나요?',
  '사용연령': '아기 월령이 어떻게 되나요?',
  '대상연령': '아기 월령이 어떻게 되나요?',
  '타입': '어떤 타입을 찾으세요?',
  '색상계열': '선호하는 색상이 있나요?',
  '기능': '필요한 기능이 있나요?',
  '종류': '어떤 종류를 찾으세요?',
  '소재': '어떤 소재를 선호하세요?',
  '허용무게': '아이 체중이 어떻게 되나요?',
  '벨트타입': '어떤 벨트 타입을 원하세요?',
  '단계': '분유 단계가 어떻게 되나요?',
};

// 중요도가 높은 필터 (먼저 표시)
const HIGH_PRIORITY_FILTERS = ['재질', '타입', '종류', '품목', '형태', '용량', '사용연령', '대상연령', '뚜껑', '단계', '허용무게'];

// 제외할 필터 (너무 많거나 불필요)
const EXCLUDED_FILTERS = ['제조사별', '브랜드별', '색상계열', '출시년도'];

// 세부 카테고리 선택 후 제외할 필터 (이미 선택했으므로 중복)
// 단, 타입 기반 sub-category를 가진 카테고리에만 적용 (유모차, 카시트)
// 기저귀는 브랜드 기반 sub-category이므로 타입 필터는 유지해야 함
const SUB_CATEGORY_TYPE_FILTERS = ['타입', '형태', '종류', '품목'];
const TYPE_BASED_SUB_CATEGORY_KEYS = ['stroller', 'car_seat'];  // 브랜드가 아닌 타입으로 sub-category 구분하는 카테고리

// features 배열에 포함되는 필터들 (contains 연산 필요)
const FEATURES_ARRAY_FILTERS = ['안전기능', '기능', '특징', '부가기능'];

// filter_attrs 기반 필터 (다나와 필터 옵션과 1:1 매칭)
const FILTER_ATTRS_FILTERS = ['재질', '뚜껑', '안전기능', '품목', '형태', '단계', '종류', '대상연령', '허용무게', '벨트타입'];

/**
 * 다나와 필터를 하드필터 질문으로 변환
 */
export function convertDanawaFiltersToHardFilters(
  danawaFilters: DanawaFilter[],
  categoryKey: string,
  targetCategoryCodes?: string[],
  maxQuestions: number = 4
): HardFilterQuestion[] {
  // 특정 세부 카테고리가 지정된 경우 해당 코드만 사용
  const categoryCodes = targetCategoryCodes || CATEGORY_CODE_MAP[categoryKey] || [];

  // 해당 카테고리의 필터만 추출
  const relevantFilters = danawaFilters.filter(f =>
    categoryCodes.includes(f.category_code)
  );

  // 제외 필터 제거 및 중복 제거 (같은 filter_name은 하나만)
  // 세부 카테고리가 지정된 경우 타입/형태 관련 필터도 제외 (이미 선택했으므로)
  // 단, 타입 기반 sub-category (유모차/카시트)에만 적용. 기저귀는 브랜드 기반이므로 타입 필터 유지
  const isSubCategorySelected = targetCategoryCodes && targetCategoryCodes.length === 1;
  const shouldExcludeTypeFilters = isSubCategorySelected && TYPE_BASED_SUB_CATEGORY_KEYS.includes(categoryKey);

  const uniqueFilters = new Map<string, DanawaFilter>();
  for (const filter of relevantFilters) {
    if (EXCLUDED_FILTERS.includes(filter.filter_name)) continue;

    // 타입 기반 sub-category 선택 후에는 타입/형태 필터 제외 (유모차, 카시트만)
    if (shouldExcludeTypeFilters && SUB_CATEGORY_TYPE_FILTERS.includes(filter.filter_name)) continue;

    // 이미 있는 경우 옵션이 더 많은 것으로 교체
    const existing = uniqueFilters.get(filter.filter_name);
    if (!existing || filter.option_count > existing.option_count) {
      uniqueFilters.set(filter.filter_name, filter);
    }
  }

  // 필터를 중요도 순으로 정렬
  const sortedFilters = Array.from(uniqueFilters.values()).sort((a, b) => {
    const aIdx = HIGH_PRIORITY_FILTERS.indexOf(a.filter_name);
    const bIdx = HIGH_PRIORITY_FILTERS.indexOf(b.filter_name);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  });

  // 최대 질문 수만큼 변환
  const questions: HardFilterQuestion[] = [];

  for (const filter of sortedFilters.slice(0, maxQuestions)) {
    const question = convertFilterToQuestion(filter, categoryKey, questions.length);
    if (question) {
      questions.push(question);
    }
  }

  return questions;
}

/**
 * 단일 다나와 필터를 하드필터 질문으로 변환
 */
function convertFilterToQuestion(
  filter: DanawaFilter,
  categoryKey: string,
  index: number
): HardFilterQuestion | null {
  const questionText = FILTER_QUESTION_MAP[filter.filter_name] || `${filter.filter_name}을 선택해주세요`;

  // 옵션이 너무 많으면 상위 6개만 + "상관없어요"
  const maxOptions = 6;
  const displayOptions = filter.options.slice(0, maxOptions);

  // 필터링 방식 결정
  const isFeatureFilter = FEATURES_ARRAY_FILTERS.includes(filter.filter_name);
  const isFilterAttrsFilter = FILTER_ATTRS_FILTERS.includes(filter.filter_name);

  const options: HardFilterOption[] = displayOptions.map(opt => ({
    label: opt,
    value: opt.toLowerCase().replace(/\s+/g, '_'),
    filter: isFeatureFilter
      ? {
          // features 배열에서 contains로 검색
          'spec.features': { contains: opt },
        }
      : isFilterAttrsFilter
      ? {
          // filter_attrs에서 정확히 매칭 (가장 정확)
          [`filter_attrs.${filter.filter_name}`]: opt,
        }
      : {
          // spec 필드에서 정확히 매칭
          [`spec.${filter.filter_name}`]: opt,
        },
  }));

  // "상관없어요" 옵션 추가
  options.push({
    label: '상관없어요',
    value: 'any',
    filter: {},
  });

  return {
    id: `hf_${categoryKey}_${filter.filter_name.replace(/\s+/g, '_')}_${index}`,
    type: 'single',
    question: questionText,
    options,
  };
}

/**
 * 수동 정의 질문 로드
 */
export function getManualQuestions(categoryKey: string): HardFilterQuestion[] {
  const manualQuestions = manualQuestionsData as Record<string, ManualQuestionConfig>;
  const config = manualQuestions[categoryKey];

  if (!config?.questions) {
    return [];
  }

  return config.questions.map((q) => ({
    id: q.id,
    type: q.type as 'single' | 'multi',
    question: q.question,
    options: q.options.map(opt => ({
      label: opt.label,
      value: opt.value,
      filter: opt.filter as Record<string, unknown>,
    })),
  }));
}

/**
 * 다나와 필터 JSON 파일 로드
 */
export async function loadDanawaFilters(): Promise<DanawaFilter[]> {
  try {
    // 서버 사이드에서 파일 로드
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.join(process.cwd(), 'danawaproduct_1208/danawa_filters_20251208_114030.json');
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load danawa filters:', error);
    return [];
  }
}

/**
 * 카테고리별 하드필터 질문 생성 (통합)
 * - 다나와 필터 기반 동적 생성
 * - 부족할 경우 수동 정의 질문으로 보충
 */
export async function generateHardFiltersForCategory(
  categoryKey: string,
  targetCategoryCodes?: string[]
): Promise<HardFilterQuestion[]> {
  // 1. 다나와 필터 기반 동적 생성
  const danawaFilters = await loadDanawaFilters();
  const dynamicQuestions = convertDanawaFiltersToHardFilters(
    danawaFilters,
    categoryKey,
    targetCategoryCodes,
    4
  );

  // 2. 수동 정의 질문 로드
  const manualQuestions = getManualQuestions(categoryKey);

  // 3. 동적 질문이 2개 미만이면 수동 질문으로 보충
  if (dynamicQuestions.length < 2) {
    // 수동 질문 우선, 중복 ID 제거
    const existingIds = new Set(dynamicQuestions.map(q => q.id));
    const additionalQuestions = manualQuestions.filter(q => !existingIds.has(q.id));

    return [...dynamicQuestions, ...additionalQuestions].slice(0, 5);
  }

  // 4. 동적 질문이 충분하면 그대로 반환 (최대 5개)
  return dynamicQuestions.slice(0, 5);
}

/**
 * 세부 카테고리 선택이 필요한지 확인
 * - 유모차: 디럭스형/절충형/휴대용/쌍둥이용 (category_code로 필터)
 * - 카시트: 일체형/분리형/바구니형/부스터형 (category_code로 필터)
 * - 기저귀: 밴드형/팬티형 (filter_attrs.타입으로 필터)
 */
export function requiresSubCategorySelection(categoryKey: string): boolean {
  const categoriesWithSubCategories = ['stroller', 'car_seat', 'diaper'];
  return categoriesWithSubCategories.includes(categoryKey);
}
