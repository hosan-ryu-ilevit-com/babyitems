/**
 * 다나와 필터 데이터를 하드필터 질문으로 변환
 * - 다나와 필터 기반 동적 생성
 * - 수동 정의 질문 fallback
 * - filter_attrs 기반 필터링 지원
 */

import type { HardFilterQuestion, HardFilterOption } from '@/types/recommend-v2';
import manualQuestionsData from '@/data/rules/manual_hard_questions.json';
import { CATEGORY_CODE_MAP } from './categoryUtils';

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

// 제외할 필터 (카테고리별로 다르게 적용)
// 기본값: 브랜드/출시년도 제외 (대부분의 카테고리에서 불필요)
const DEFAULT_EXCLUDED_FILTERS = ['제조사별', '브랜드별', '색상계열', '출시년도'];

// 카테고리별 제외 필터 (해당 카테고리에서는 이 필터들만 제외)
// 유모차/카시트: 브랜드/출시년도가 유의미한 필터일 수 있음
const CATEGORY_EXCLUDED_FILTERS: Record<string, string[]> = {
  stroller: ['색상계열'],  // 브랜드, 출시년도 포함
  car_seat: ['색상계열'],  // 브랜드, 출시년도 포함
};

function getExcludedFilters(categoryKey: string): string[] {
  return CATEGORY_EXCLUDED_FILTERS[categoryKey] || DEFAULT_EXCLUDED_FILTERS;
}

// 세부 카테고리 선택 후 제외할 필터 (이미 선택했으므로 중복)
// 단, 타입 기반 sub-category를 가진 카테고리에만 적용 (유모차, 카시트)
// 기저귀는 브랜드 기반 sub-category이므로 타입 필터는 유지해야 함
const SUB_CATEGORY_TYPE_FILTERS = ['타입', '형태', '종류', '품목'];
const TYPE_BASED_SUB_CATEGORY_KEYS = ['stroller', 'car_seat'];  // 브랜드가 아닌 타입으로 sub-category 구분하는 카테고리

// features 배열에 포함되는 필터들 (spec.features에서 contains 연산 필요)
// 이 필터들만 spec.features를 사용하고, 나머지는 모두 filter_attrs 사용
const FEATURES_ARRAY_FILTERS = ['안전기능', '기능', '특징', '부가기능'];

// NOTE: 기존 FILTER_ATTRS_FILTERS 리스트는 제거됨
// 모든 다나와 필터는 기본적으로 filter_attrs에 저장되므로,
// FEATURES_ARRAY_FILTERS에 해당하지 않는 모든 필터는 filter_attrs.X 경로 사용

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

  const excludedFilters = getExcludedFilters(categoryKey);
  const uniqueFilters = new Map<string, DanawaFilter>();
  for (const filter of relevantFilters) {
    if (excludedFilters.includes(filter.filter_name)) continue;

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
  // - FEATURES_ARRAY_FILTERS: spec.features 배열에서 contains 검색
  // - 그 외 모든 필터: filter_attrs.X에서 정확히 매칭 (다나와 필터 데이터 위치)
  const isFeatureFilter = FEATURES_ARRAY_FILTERS.includes(filter.filter_name);

  const options: HardFilterOption[] = displayOptions.map(opt => ({
    label: opt,
    value: opt.toLowerCase().replace(/\s+/g, '_'),
    filter: isFeatureFilter
      ? {
          // features 배열에서 contains로 검색
          'spec.features': { contains: opt },
        }
      : {
          // filter_attrs에서 정확히 매칭 (다나와 필터 데이터 기본 위치)
          [`filter_attrs.${filter.filter_name}`]: opt,
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

// 제품 데이터 타입 (간소화)
interface DanawaProduct {
  category_code: string;
  filter_attrs?: Record<string, string>;
  spec?: {
    features?: string[];
    [key: string]: unknown;
  };
}

/**
 * 다나와 제품 JSON 파일 로드
 */
export async function loadDanawaProducts(): Promise<DanawaProduct[]> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.join(process.cwd(), 'danawaproduct_1208/danawa_products_20251209_025019.json');
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load danawa products:', error);
    return [];
  }
}

/**
 * 필터 옵션에 매칭되는 제품 수 계산
 */
function countProductsForFilterOption(
  products: DanawaProduct[],
  filterName: string,
  optionValue: string,
  isFeatureFilter: boolean
): number {
  return products.filter(product => {
    if (isFeatureFilter) {
      // spec.features 배열에서 contains 검색
      const features = product.spec?.features || [];
      return features.some(f => f.toLowerCase().includes(optionValue.toLowerCase()));
    } else {
      // filter_attrs에서 정확히 매칭
      const attrValue = product.filter_attrs?.[filterName];
      return attrValue === optionValue;
    }
  }).length;
}

/**
 * 필터 질문이 유효한지 확인
 * - 최소 2개 이상의 옵션에 매칭되는 제품이 있어야 함 (필터링 의미가 있어야 함)
 * - 1개 옵션만 있으면 모든 제품이 같은 값이므로 필터링 의미 없음
 */
function isValidFilterQuestion(
  question: HardFilterQuestion,
  products: DanawaProduct[],
  filterName: string
): boolean {
  const isFeatureFilter = FEATURES_ARRAY_FILTERS.includes(filterName);

  // "상관없어요" 제외한 옵션들 중 매칭되는 제품이 있는 옵션 수 계산
  const validOptionCount = question.options.filter(opt => {
    if (opt.value === 'any' || opt.label === '상관없어요') return false;
    const count = countProductsForFilterOption(products, filterName, opt.label, isFeatureFilter);
    return count > 0;
  }).length;

  // 최소 2개 이상의 옵션에 제품이 있어야 필터링 의미가 있음
  return validOptionCount >= 2;
}

/**
 * 카테고리별 하드필터 질문 생성 (통합)
 * - 다나와 필터 기반 동적 생성
 * - 실제 제품 데이터가 있는 필터만 포함
 * - 부족할 경우 수동 정의 질문으로 보충
 */
export async function generateHardFiltersForCategory(
  categoryKey: string,
  targetCategoryCodes?: string[]
): Promise<HardFilterQuestion[]> {
  // 1. 다나와 필터 및 제품 데이터 로드
  const [danawaFilters, allProducts] = await Promise.all([
    loadDanawaFilters(),
    loadDanawaProducts(),
  ]);

  // 해당 카테고리의 제품만 필터링
  const categoryCodes = targetCategoryCodes || CATEGORY_CODE_MAP[categoryKey] || [];
  const categoryProducts = allProducts.filter(p => categoryCodes.includes(p.category_code));

  // 2. 다나와 필터 기반 동적 생성 (더 많이 생성해서 유효성 검사 후 필터링)
  const dynamicQuestions = convertDanawaFiltersToHardFilters(
    danawaFilters,
    categoryKey,
    targetCategoryCodes,
    10  // 더 많이 생성 (유효성 검사 후 필터링됨)
  );

  // 3. 유효한 질문만 필터링 (실제 제품 데이터가 있는 필터만)
  const validQuestions = dynamicQuestions.filter(question => {
    // question.id에서 filter_name 추출 (hf_categoryKey_filterName_index 형식)
    const parts = question.id.split('_');
    // categoryKey가 underscore 포함 가능하므로 마지막 2개를 제외하고 중간 부분이 filterName
    const filterName = parts.slice(2, -1).join('_').replace(/_/g, ' ').trim() || parts[2];

    // 원본 필터 이름 찾기 (ID에서 공백이 _로 변환되었으므로)
    const originalFilterName = Object.keys(FILTER_QUESTION_MAP).find(name =>
      name.replace(/\s+/g, '_') === parts.slice(2, -1).join('_')
    ) || filterName;

    return isValidFilterQuestion(question, categoryProducts, originalFilterName);
  });

  console.log(`[danawaFilters] ${categoryKey}: ${dynamicQuestions.length} generated, ${validQuestions.length} valid`);

  // 4. 수동 정의 질문 로드
  const manualQuestions = getManualQuestions(categoryKey);

  // 5. 유효한 동적 질문이 2개 미만이면 수동 질문으로 보충
  if (validQuestions.length < 2) {
    const existingIds = new Set(validQuestions.map(q => q.id));
    const additionalQuestions = manualQuestions.filter(q => !existingIds.has(q.id));

    return [...validQuestions, ...additionalQuestions].slice(0, 5);
  }

  // 6. 유효한 동적 질문이 충분하면 그대로 반환 (최대 5개)
  return validQuestions.slice(0, 5);
}

// requiresSubCategorySelection은 categoryUtils.ts로 이동됨
