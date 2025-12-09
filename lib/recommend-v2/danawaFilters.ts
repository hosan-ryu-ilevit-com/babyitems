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
    tip?: string;  // 질문에 대한 도움말
    options: Array<{
      label: string;
      displayLabel?: string;  // 결과 페이지용 레이블
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

// 필터별 도움말 팁 매핑 (카테고리별로 다른 팁 제공)
// 구조: categoryKey -> filterName -> tip
const FILTER_TIP_MAP: Record<string, Record<string, string>> = {
  // 분유포트
  formula_pot: {
    '재질': '유리는 환경호르몬 걱정 없고, 스테인리스는 충격에 강해요',
    '용량': '1L면 1회 분유 4~5개 분량, 자주 끓이기 싫다면 큰 용량 추천',
    '기능': '자동출수는 한 손 수유할 때 정말 편해요',
    '안전기능': '공회전 방지는 물 없이 가열되는 걸 막아줘요',
  },
  // 분유
  formula: {
    '단계': '보통 6개월마다 단계가 올라가요. 아기 개월수에 맞춰 선택하세요',
    '종류': '일반 분유 vs 특수분유(알레르기/역류)는 아기 상황에 따라 달라요',
    '타입': '액상분유는 외출할 때 따로 물 안 챙겨도 돼서 편해요',
  },
  // 기저귀
  diaper: {
    '타입': '밴드형은 신생아용, 뒤집기 시작하면 팬티형으로 갈아타세요',
    '형태': '밴드형은 누워서, 팬티형은 서서 갈아입힐 때 편해요',
    '용량': '대용량은 단가가 싸지만, 처음엔 소량으로 아기에게 맞는지 확인해보세요',
  },
  // 물티슈
  baby_wipes: {
    '한팩당': '80매가 기본, 100매 이상은 들고 다니기엔 무거워요',
    '뚜껑': '캡형이 수분 유지에 좋고, 외출용은 휴대 간편한 스티커형도 괜찮아요',
    '형태': '엠보싱이 있으면 잘 닦이고, 두께감 있는 게 손에 묻지 않아요',
  },
  // 유모차
  stroller: {
    '타입': '디럭스는 신생아부터, 절충형은 6개월 전후, 휴대용은 세울 수 있을 때부터',
    '형태': '양대면은 엄마 얼굴 보며 안심, 앞보기는 호기심 많아질 때 전환',
    '기능': '원터치 폴딩은 한 손에 아기 안고 접을 때 필수예요',
    '허용무게': '아이 체중 + 짐 무게까지 고려해서 여유 있게 선택하세요',
  },
  // 카시트
  car_seat: {
    '타입': '신생아용 바구니→컨버터블→부스터 순으로, 올인원은 오래 써요',
    '형태': '회전형이면 아이 태우고 내리기 편해요. 좁은 차는 고정형도 괜찮아요',
    '허용무게': '성장 속도를 감안해서 넉넉한 허용무게로 선택하세요',
    '벨트타입': 'ISOFIX가 설치 쉽고 안전해요. 차량에 지원되는지 확인하세요',
    '안전기능': '측면충돌보호, 신생아쿠션은 안전을 위해 꼭 확인하세요',
  },
  // 하이체어/유아의자
  high_chair: {
    '타입': '하이체어는 이유식 시작부터, 부스터는 외출용으로 좋아요',
    '형태': '접이식은 공간 절약, 고정형은 안정감이 더 좋아요',
    '소재': 'PU가죽은 청소 편하고, 패브릭은 통기성 좋아요',
    '기능': '높이조절 있으면 식탁에 맞춰 성장할 때까지 써요',
  },
  // 유아침대
  baby_bed: {
    '타입': '범퍼침대는 낙상 방지, 원목침대는 오래 쓸 수 있어요',
    '형태': '접이식은 여행용, 고정형은 튼튼해서 집에서 오래 써요',
    '소재': '원목은 인테리어에 좋고, 범퍼는 푹신해서 안전해요',
    '기능': '높이조절 있으면 부모 침대 옆에 붙여서 써요',
  },
  // 유아소파
  baby_sofa: {
    '타입': '1인용은 혼자 앉힐 때, 2인용은 형제자매 같이 앉을 때 좋아요',
    '형태': '매트 변신형은 낮잠 재울 때도 활용 가능해요',
    '소재': 'PU가죽은 청소 편하고, 패브릭은 촉감이 부드러워요',
    '색상계열': '밝은 색은 얼룩 보여서, 어두운 색이 관리 편해요',
  },
  // 유아책상
  baby_desk: {
    '형태': '접이식은 공간 절약, 고정형은 안정감 좋아요',
    '소재': '원목은 튼튼하고, 플라스틱은 가벼워서 옮기기 편해요',
    '기능': '높이조절 되면 성장하면서 오래 쓸 수 있어요',
    '색상계열': '캐릭터 디자인은 아이가 좋아하지만 질릴 수 있어요',
  },
  // 공통 (특정 카테고리에 없는 경우 fallback)
  _default: {
    '재질': '아기 피부에 닿는 제품은 소재가 중요해요',
    '타입': '아기 월령과 사용 환경에 따라 적합한 타입이 달라요',
    '형태': '생활 공간과 사용 목적에 맞게 선택하세요',
    '용량': '사용 빈도를 생각해서 적당한 용량을 선택하세요',
    '기능': '자주 쓸 기능인지 한 번 생각해보세요',
    '안전기능': '안전은 기본, 인증마크 꼭 확인하세요',
    '사용연령': '성장 속도가 다르니 넉넉하게 선택해도 괜찮아요',
    '대상연령': '성장 속도가 다르니 넉넉하게 선택해도 괜찮아요',
    '허용무게': '여유 있게 선택하면 오래 쓸 수 있어요',
    '벨트타입': '차량 호환 여부를 먼저 확인하세요',
    '소재': '청소 편의성과 아이 피부 모두 고려하세요',
    '한팩당': '외출용은 적은 매수, 집에서는 대용량이 경제적이에요',
    '뚜껑': '수분 유지가 중요하면 캡형을 추천해요',
    '단계': '개월수에 맞는 단계를 선택하세요',
    '종류': '사용 목적에 맞는 종류를 선택하세요',
    '제조사별': '선호하는 브랜드가 있으신가요?',
    '브랜드별': '선호하는 브랜드가 있으신가요?',
    '색상계열': '실용성과 아이의 취향 중 뭐가 더 중요할까요?',
  },
};

/**
 * 카테고리와 필터명에 맞는 팁 반환
 */
export function getFilterTip(categoryKey: string, filterName: string): string | undefined {
  // 카테고리 전용 팁 우선
  const categoryTips = FILTER_TIP_MAP[categoryKey];
  if (categoryTips?.[filterName]) {
    return categoryTips[filterName];
  }
  // 없으면 기본 팁
  return FILTER_TIP_MAP._default?.[filterName];
}

// 중요도가 높은 필터 (먼저 표시)
const HIGH_PRIORITY_FILTERS = ['재질', '타입', '종류', '품목', '형태', '용량', '사용연령', '대상연령', '뚜껑', '단계', '허용무게'];

// 제외할 필터 (카테고리별로 다르게 적용)
// 기본값: 브랜드/출시년도 제외 (대부분의 카테고리에서 불필요)
const DEFAULT_EXCLUDED_FILTERS = ['제조사별', '브랜드별', '색상계열', '출시년도'];

// 카테고리별 제외 필터 (해당 카테고리에서는 이 필터들만 제외)
// 유모차/카시트: 브랜드/출시년도가 유의미한 필터일 수 있음
// baby_desk: filter_attrs가 부족해서 색상계열이라도 포함
const CATEGORY_EXCLUDED_FILTERS: Record<string, string[]> = {
  stroller: ['색상계열'],  // 브랜드, 출시년도 포함
  car_seat: ['색상계열'],  // 브랜드, 출시년도 포함
  baby_desk: ['제조사별', '브랜드별', '출시년도'],  // 색상계열 포함 (유일한 filter_attrs)
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
 * - products가 제공되면 제품 데이터에서 옵션 값 추출 (권장)
 * - products가 없으면 다나와 필터 옵션 사용 (fallback)
 */
export function convertDanawaFiltersToHardFilters(
  danawaFilters: DanawaFilter[],
  categoryKey: string,
  targetCategoryCodes?: string[],
  maxQuestions: number = 4,
  products?: DanawaProduct[]
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
    const question = convertFilterToQuestion(filter, categoryKey, questions.length, products);
    if (question) {
      questions.push(question);
    }
  }

  return questions;
}

/**
 * 제품 데이터에서 특정 필터의 고유 값 추출
 */
function extractUniqueFilterValues(
  products: DanawaProduct[],
  filterName: string
): string[] {
  const valueCounts = new Map<string, number>();
  products.forEach(product => {
    const value = product.filter_attrs?.[filterName];
    if (value && typeof value === 'string') {
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }
  });
  // 제품 수가 많은 순으로 정렬
  return Array.from(valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}

/**
 * 제품 데이터에서 브랜드 고유 값 추출 (brand 필드 사용)
 */
function extractUniqueBrands(products: DanawaProduct[]): string[] {
  const brandCounts = new Map<string, number>();
  products.forEach(product => {
    const brand = (product as { brand?: string }).brand;
    if (brand && typeof brand === 'string') {
      brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    }
  });
  // 제품 수가 많은 순으로 정렬
  return Array.from(brandCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([brand]) => brand);
}

/**
 * 브랜드 하드필터 질문 생성
 */
function createBrandQuestion(
  categoryKey: string,
  products: DanawaProduct[],
  index: number
): HardFilterQuestion | null {
  const brands = extractUniqueBrands(products);

  if (brands.length < 2) {
    return null;
  }

  // 상위 6개 브랜드만 표시
  const displayBrands = brands.slice(0, 6);

  const options: HardFilterOption[] = displayBrands.map(brand => ({
    label: brand,
    value: brand.toLowerCase().replace(/\s+/g, '_'),
    filter: { brand },
  }));

  options.push({
    label: '상관없어요',
    displayLabel: '브랜드 무관',
    value: 'any',
    filter: {},
  });

  return {
    id: `hf_${categoryKey}_브랜드_${index}`,
    type: 'single',
    question: '선호하는 브랜드가 있나요?',
    tip: '좋아하는 브랜드가 있으시다면 골라주세요.',
    options,
  };
}

/**
 * 단일 다나와 필터를 하드필터 질문으로 변환
 * - products가 제공되면 제품 데이터에서 옵션 값 추출 (권장)
 * - products가 없으면 다나와 필터 옵션 사용 (fallback)
 */
function convertFilterToQuestion(
  filter: DanawaFilter,
  categoryKey: string,
  index: number,
  products?: DanawaProduct[]
): HardFilterQuestion | null {
  const questionText = FILTER_QUESTION_MAP[filter.filter_name] || `${filter.filter_name}을(를) 선택해주세요`;

  // 옵션 값 결정: 제품 데이터 우선, 없으면 다나와 필터 사용
  let displayOptions: string[];

  if (products && products.length > 0) {
    // 제품 데이터에서 실제 값 추출 (권장)
    const uniqueValues = extractUniqueFilterValues(products, filter.filter_name);
    if (uniqueValues.length < 2) {
      // 값이 2개 미만이면 필터링 의미 없음
      return null;
    }
    displayOptions = uniqueValues.slice(0, 6); // 상위 6개
  } else {
    // 다나와 필터 옵션 사용 (fallback)
    displayOptions = filter.options.slice(0, 6);
  }

  // 필터링 방식 결정
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
          // filter_attrs에서 정확히 매칭
          [`filter_attrs.${filter.filter_name}`]: opt,
        },
  }));

  // "상관없어요" 옵션 추가 (displayLabel에 맥락 포함)
  options.push({
    label: '상관없어요',
    displayLabel: `${filter.filter_name} 무관`,
    value: 'any',
    filter: {},
  });

  // 필터명에 맞는 팁 가져오기
  const tip = getFilterTip(categoryKey, filter.filter_name);

  return {
    id: `hf_${categoryKey}_${filter.filter_name.replace(/\s+/g, '_')}_${index}`,
    type: 'single',
    question: questionText,
    tip,
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
    tip: q.tip,  // JSON에서 tip 가져오기
    options: q.options.map(opt => ({
      label: opt.label,
      displayLabel: opt.displayLabel,  // 결과 페이지용 레이블
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

  // 2. 다나와 필터 기반 동적 생성 (제품 데이터에서 옵션 값 추출)
  const dynamicQuestions = convertDanawaFiltersToHardFilters(
    danawaFilters,
    categoryKey,
    targetCategoryCodes,
    10,  // 더 많이 생성 (유효성 검사 후 필터링됨)
    categoryProducts  // 제품 데이터 전달 → 옵션 값을 실제 데이터에서 추출
  );

  // 3. 유효한 질문만 필터링 (실제 제품 데이터가 있는 필터만)
  const validQuestions = dynamicQuestions.filter(question => {
    // question.id에서 filter_name 추출 (hf_categoryKey_filterName_index 형식)
    // categoryKey가 underscore를 포함할 수 있으므로 prefix로 정확히 제거
    const prefix = `hf_${categoryKey}_`;
    const idWithoutPrefix = question.id.slice(prefix.length); // 'filterName_index'
    const lastUnderscoreIdx = idWithoutPrefix.lastIndexOf('_');
    const filterNameFromId = idWithoutPrefix.slice(0, lastUnderscoreIdx).replace(/_/g, ' ');

    // 원본 필터 이름 찾기 (ID에서 공백이 _로 변환되었으므로)
    const originalFilterName = Object.keys(FILTER_QUESTION_MAP).find(name =>
      name.replace(/\s+/g, '_') === idWithoutPrefix.slice(0, lastUnderscoreIdx)
    ) || filterNameFromId;

    return isValidFilterQuestion(question, categoryProducts, originalFilterName);
  });

  // 4. 브랜드 필터 추가 (brand 필드가 filter_attrs가 아닌 별도 필드인 카테고리)
  const BRAND_FILTER_CATEGORIES = ['stroller', 'car_seat', 'baby_desk', 'baby_wipes'];
  if (BRAND_FILTER_CATEGORIES.includes(categoryKey)) {
    const brandQuestion = createBrandQuestion(categoryKey, categoryProducts, validQuestions.length);
    if (brandQuestion) {
      validQuestions.unshift(brandQuestion);  // 브랜드 질문을 맨 앞에 추가
    }
  }

  console.log(`[danawaFilters] ${categoryKey}: ${dynamicQuestions.length} generated, ${validQuestions.length} valid`);

  // 5. 수동 정의 질문 로드
  const manualQuestions = getManualQuestions(categoryKey);

  // 6. 유효한 동적 질문이 2개 미만이면 수동 질문으로 보충
  if (validQuestions.length < 2) {
    const existingIds = new Set(validQuestions.map(q => q.id));
    const additionalQuestions = manualQuestions.filter(q => !existingIds.has(q.id));

    return [...validQuestions, ...additionalQuestions].slice(0, 5);
  }

  // 7. 유효한 동적 질문이 충분하면 그대로 반환 (최대 5개)
  return validQuestions.slice(0, 5);
}

// requiresSubCategorySelection은 categoryUtils.ts로 이동됨
