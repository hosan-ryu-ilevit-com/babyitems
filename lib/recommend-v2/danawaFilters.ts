/**
 * 다나와 필터 데이터를 하드필터 질문으로 변환
 * - 다나와 필터 기반 동적 생성
 * - 수동 정의 질문 fallback
 * - filter_attrs 기반 필터링 지원
 */

import type { HardFilterQuestion, HardFilterOption } from '@/types/recommend-v2';
import manualQuestionsData from '@/data/rules/manual_hard_questions.json';
import filterQuestionsData from '@/data/rules/filter_questions.json';
import filterTipsData from '@/data/rules/filter_tips.json';
import { CATEGORY_CODE_MAP } from './categoryUtils';
import { normalizeFilterValue, normalizeAndDeduplicateValues } from './labelNormalizer';
import { createClient } from '@supabase/supabase-js';
import { getDataSource, ENURI_CATEGORY_CODES } from '@/lib/dataSourceConfig';
import { getModel, parseJSONResponse, isGeminiAvailable, callGeminiWithRetry } from '@/lib/ai/gemini';

// Supabase 클라이언트 (하드필터 생성용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
    type: string;  // 'single' | 'multi' | 'review_priorities'
    question: string;
    tip?: string;  // 질문에 대한 도움말
    source?: string;  // 질문 출처: 'review_analysis' | 'spec' | 'manual'
    options: Array<{
      label: string;
      displayLabel?: string;  // 결과 페이지용 레이블
      value: string;
      filter: Record<string, unknown>;
      // review_priorities 타입 전용 필드
      mentionCount?: number;      // 리뷰 언급 횟수
      sentiment?: string;         // 'positive' | 'negative' | 'neutral'
      sampleReview?: string;      // 대표 리뷰 샘플
      reviewKeywords?: string[];  // 관련 키워드
    }>;
  }>;
}

// 필터 이름 → 한글 질문 텍스트 매핑 (JSON에서 로드)
const FILTER_QUESTION_MAP: Record<string, string> = filterQuestionsData;

// 필터별 도움말 팁 매핑 (JSON에서 로드)
const FILTER_TIP_MAP: Record<string, Record<string, string>> = filterTipsData;

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
 * 제품 데이터에서 특정 필터의 고유 값 추출 (정규화 적용)
 * - Type A(동의어 매핑) + Type B(전처리) 모두 적용
 * - 정규화 후 같아지는 값들을 하나로 병합
 * - 원본 값들(aliases)도 함께 반환하여 필터링 시 사용
 */
function extractUniqueFilterValues(
  products: DanawaProduct[],
  filterName: string
): { normalized: string; aliases: string[]; count: number }[] {
  // 모든 원본 값 수집
  const allValues: string[] = [];
  products.forEach(product => {
    const value = product.filter_attrs?.[filterName];
    if (value && typeof value === 'string') {
      allValues.push(value);
    }
  });

  // 정규화 및 중복 제거 (filterName 전달하여 Type A도 적용)
  const normalized = normalizeAndDeduplicateValues(allValues, filterName);

  // 제품 수가 많은 순으로 정렬
  return normalized.sort((a, b) => b.count - a.count);
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

  // 모든 브랜드 표시
  const displayBrands = brands;

  const options: HardFilterOption[] = displayBrands.map(brand => ({
    label: brand,
    value: brand.toLowerCase().replace(/\s+/g, '_'),
    filter: { brand },
  }));

  options.push({
    label: '전부 좋아요 👍',
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
 * - products가 제공되면 제품 데이터에서 옵션 값 추출 (권장, 정규화 적용)
 * - products가 없으면 다나와 필터 옵션 사용 (fallback)
 */
function convertFilterToQuestion(
  filter: DanawaFilter,
  categoryKey: string,
  index: number,
  products?: DanawaProduct[]
): HardFilterQuestion | null {
  const questionText = FILTER_QUESTION_MAP[filter.filter_name] || `${filter.filter_name}을(를) 선택해주세요`;

  // 필터링 방식 결정
  const isFeatureFilter = FEATURES_ARRAY_FILTERS.includes(filter.filter_name);

  let options: HardFilterOption[];

  if (products && products.length > 0) {
    // 제품 데이터에서 실제 값 추출 (정규화 적용)
    const normalizedValues = extractUniqueFilterValues(products, filter.filter_name);
    if (normalizedValues.length < 2) {
      // 값이 2개 미만이면 필터링 의미 없음
      return null;
    }

    // 정규화된 값을 label로, 원본 값들을 aliases로 저장
    options = normalizedValues.map(({ normalized, aliases }) => ({
      label: normalized,
      value: normalized.toLowerCase().replace(/\s+/g, '_'),
      aliases,  // 원본 값들 저장 (필터링 시 사용)
      filter: isFeatureFilter
        ? {
            // features 배열에서 contains로 검색
            'spec.features': { contains: normalized },
          }
        : {
            // filter_attrs에서 aliases 중 하나라도 매칭 (anyOf)
            [`filter_attrs.${filter.filter_name}`]: aliases.length > 1 ? { anyOf: aliases } : normalized,
          },
    }));
  } else {
    // 다나와 필터 옵션 사용 (fallback, 정규화 적용)
    const normalizedOptions = filter.options.map(opt => ({
      original: opt,
      normalized: normalizeFilterValue(opt),
    }));

    // 정규화 후 중복 제거
    const uniqueNormalized = new Map<string, string[]>();
    for (const { original, normalized } of normalizedOptions) {
      if (!uniqueNormalized.has(normalized)) {
        uniqueNormalized.set(normalized, []);
      }
      uniqueNormalized.get(normalized)!.push(original);
    }

    options = Array.from(uniqueNormalized.entries()).map(([normalized, aliases]) => ({
      label: normalized,
      value: normalized.toLowerCase().replace(/\s+/g, '_'),
      aliases,
      filter: isFeatureFilter
        ? { 'spec.features': { contains: normalized } }
        : { [`filter_attrs.${filter.filter_name}`]: aliases.length > 1 ? { anyOf: aliases } : normalized },
    }));
  }

  // "전부 좋아요" 옵션 추가 (displayLabel에 맥락 포함)
  options.push({
    label: '전부 좋아요 👍',
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
    type: q.type as HardFilterQuestion['type'],  // 'single' | 'multi' | 'review_priorities'
    question: q.question,
    tip: q.tip,  // JSON에서 tip 가져오기
    source: q.source as HardFilterQuestion['source'],  // 질문 출처
    options: q.options.map(opt => ({
      label: opt.label,
      displayLabel: opt.displayLabel,  // 결과 페이지용 레이블
      value: opt.value,
      filter: opt.filter as Record<string, unknown>,
      // review_priorities 타입 전용 필드
      mentionCount: opt.mentionCount,
      sentiment: opt.sentiment as HardFilterOption['sentiment'],
      sampleReview: opt.sampleReview,
      reviewKeywords: opt.reviewKeywords,
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

// 제품 데이터 타입
interface DanawaProduct {
  pcode?: string;
  title?: string;
  brand?: string;
  category_code: string;
  filter_attrs?: Record<string, string>;
  spec?: {
    features?: string[];
    [key: string]: unknown;
  };
}

/**
 * Supabase에서 제품 데이터 로드 (하드필터 생성용)
 * - UI의 제품 카운트와 동일한 데이터 소스 사용
 * - review_count > 0 조건 적용 (실제 서비스와 동일)
 * - categoryKey가 주어지면 해당 카테고리만 로드 (최적화)
 */
export async function loadDanawaProducts(categoryKey?: string): Promise<DanawaProduct[]> {
  // Supabase가 없으면 로컬 파일 fallback
  if (!supabase) {
    console.log('[loadDanawaProducts] Supabase not available, falling back to local files...');
    return loadDanawaProductsFromLocalFiles(categoryKey);
  }

  try {
    const products: DanawaProduct[] = [];
    const startTime = Date.now();

    // 🚀 카테고리가 지정된 경우 해당 카테고리만 로드 (최적화)
    if (categoryKey) {
      const categoryCodes = CATEGORY_CODE_MAP[categoryKey] || [];
      const dataSource = getDataSource(categoryKey);

      // 에누리 데이터 소스인 경우
      if (dataSource === 'enuri' || dataSource === 'both') {
        const enuriCategoryCode = ENURI_CATEGORY_CODES[categoryKey];
        if (enuriCategoryCode) {
          const { data: enuriData, error: enuriError } = await supabase
            .from('enuri_products')
            .select('model_no, title, brand, category_code, filter_attrs, spec')
            .eq('category_code', enuriCategoryCode)
            .gt('review_count', 0);

          if (enuriError) {
            console.error(`[loadDanawaProducts] Enuri error for ${categoryKey}:`, enuriError);
          } else if (enuriData) {
            for (const p of enuriData) {
              products.push({
                pcode: p.model_no,
                title: p.title,
                brand: p.brand,
                category_code: categoryKey,
                filter_attrs: p.filter_attrs || {},
                spec: p.spec || {},
              });
            }
          }
        }
      }

      // 다나와 데이터 소스인 경우
      if (dataSource === 'danawa' || dataSource === 'both') {
        // 다나와 category_code만 필터링 (categoryKey 자체 제외)
        const danawaCodes = categoryCodes.filter(code => code !== categoryKey);
        if (danawaCodes.length > 0) {
          const { data: danawaData, error: danawaError } = await supabase
            .from('danawa_products')
            .select('pcode, title, brand, category_code, filter_attrs, spec')
            .in('category_code', danawaCodes)
            .gt('review_count', 0)
            .order('rank', { ascending: true });

          if (danawaError) {
            console.error('[loadDanawaProducts] Danawa error:', danawaError);
          } else if (danawaData) {
            for (const p of danawaData) {
              products.push({
                pcode: p.pcode,
                title: p.title,
                brand: p.brand,
                category_code: String(p.category_code),
                filter_attrs: p.filter_attrs || {},
                spec: p.spec || {},
              });
            }
          }
        }
      }

      const endTime = Date.now();
      console.log(`[loadDanawaProducts] Loaded ${products.length} products for ${categoryKey} in ${endTime - startTime}ms`);
      return products;
    }

    // categoryKey가 없으면 전체 로드 (기존 동작 - fallback)
    // 1. 다나와 제품 로드 (review_count > 0)
    const { data: danawaData, error: danawaError } = await supabase
      .from('danawa_products')
      .select('pcode, title, brand, category_code, filter_attrs, spec')
      .gt('review_count', 0)
      .order('rank', { ascending: true });

    if (danawaError) {
      console.error('[loadDanawaProducts] Danawa error:', danawaError);
    } else if (danawaData) {
      for (const p of danawaData) {
        products.push({
          pcode: p.pcode,
          title: p.title,
          brand: p.brand,
          category_code: String(p.category_code),  // 타입 통일
          filter_attrs: p.filter_attrs || {},
          spec: p.spec || {},
        });
      }
      console.log(`[loadDanawaProducts] Loaded ${danawaData.length} products from Supabase danawa_products`);
    }

    // 2. 에누리 제품 로드 (formula_maker, baby_formula_dispenser)
    const enuriCategoryKeys = Object.keys(ENURI_CATEGORY_CODES);
    for (const enuriKey of enuriCategoryKeys) {
      const enuriCategoryCode = ENURI_CATEGORY_CODES[enuriKey];
      const { data: enuriData, error: enuriError } = await supabase
        .from('enuri_products')
        .select('model_no, title, brand, category_code, filter_attrs, spec')
        .eq('category_code', enuriCategoryCode)
        .gt('review_count', 0);

      if (enuriError) {
        console.error(`[loadDanawaProducts] Enuri error for ${enuriKey}:`, enuriError);
      } else if (enuriData) {
        for (const p of enuriData) {
          products.push({
            pcode: p.model_no,
            title: p.title,
            brand: p.brand,
            category_code: enuriKey,  // categoryKey 사용 (CATEGORY_CODE_MAP 매칭용)
            filter_attrs: p.filter_attrs || {},
            spec: p.spec || {},
          });
        }
        console.log(`[loadDanawaProducts] Loaded ${enuriData.length} products from Supabase enuri_products (${enuriKey})`);
      }
    }

    console.log(`[loadDanawaProducts] Total: ${products.length} products from Supabase`);
    return products;

  } catch (error) {
    console.error('[loadDanawaProducts] Failed to load from Supabase:', error);
    return loadDanawaProductsFromLocalFiles(categoryKey);
  }
}

/**
 * 로컬 파일에서 제품 로드 (Supabase 불가 시 fallback)
 * - categoryKey가 주어지면 해당 카테고리만 로드
 */
async function loadDanawaProductsFromLocalFiles(categoryKey?: string): Promise<DanawaProduct[]> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const products: DanawaProduct[] = [];

    // 특정 카테고리만 로드하는 경우
    if (categoryKey) {
      const categoryCodes = CATEGORY_CODE_MAP[categoryKey] || [];
      
      // 다나와 제품 로드 (해당 카테고리만)
      try {
        const danawaFilePath = path.join(process.cwd(), 'danawaproduct_1208/danawa_products_20251209_025019.json');
        const danawaData = await fs.readFile(danawaFilePath, 'utf-8');
        const allProducts = JSON.parse(danawaData);
        const filtered = allProducts.filter((p: DanawaProduct) => 
          categoryCodes.includes(String(p.category_code))
        );
        products.push(...filtered);
      } catch {
        // 파일이 없으면 스킵
      }

      // 에누리 데이터 (해당 카테고리만)
      const enuriCategories = ['stroller', 'diaper', 'car_seat', 'formula_maker', 'baby_formula_dispenser'];
      if (enuriCategories.includes(categoryKey)) {
        try {
          const specFilePath = path.join(process.cwd(), 'data', 'specs', `${categoryKey}.json`);
          const specData = await fs.readFile(specFilePath, 'utf-8');
          const localProducts = JSON.parse(specData);

          for (const p of localProducts) {
            products.push({
              pcode: String(p.productId),
              title: p.모델명,
              brand: p.브랜드,
              category_code: categoryKey,
              filter_attrs: p.filter_attrs || {},
              spec: {
                features: p.specs?.특징 || [],
                ...p.specs,
              },
            });
          }
        } catch {
          // 파일이 없으면 스킵
        }
      }

      return products;
    }

    // 전체 로드 (기존 동작)
    // 1. 다나와 제품 JSON 파일 로드
    try {
      const danawaFilePath = path.join(process.cwd(), 'danawaproduct_1208/danawa_products_20251209_025019.json');
      const danawaData = await fs.readFile(danawaFilePath, 'utf-8');
      products.push(...JSON.parse(danawaData));
    } catch {
      console.log('[loadDanawaProducts] Danawa products file not found, continuing...');
    }

    // 2. 로컬 spec 파일에서 에누리 데이터 로드
    const enuriCategories = ['stroller', 'diaper', 'car_seat', 'formula_maker', 'baby_formula_dispenser'];
    for (const catKey of enuriCategories) {
      try {
        const specFilePath = path.join(process.cwd(), 'data', 'specs', `${catKey}.json`);
        const specData = await fs.readFile(specFilePath, 'utf-8');
        const localProducts = JSON.parse(specData);

        for (const p of localProducts) {
          products.push({
            pcode: String(p.productId),
            title: p.모델명,
            brand: p.브랜드,
            category_code: catKey,
            filter_attrs: p.filter_attrs || {},
            spec: {
              features: p.specs?.특징 || [],
              ...p.specs,
            },
          });
        }
      } catch {
        // 파일이 없으면 스킵
      }
    }

    return products;
  } catch (error) {
    console.error('Failed to load danawa products from local files:', error);
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

  // "전부 좋아요" 제외한 옵션들 중 매칭되는 제품이 있는 옵션 수 계산
  const validOptionCount = question.options.filter(opt => {
    if (opt.value === 'any' || opt.label.includes('전부 좋아요') || opt.label === '상관없어요') return false;
    const count = countProductsForFilterOption(products, filterName, opt.label, isFeatureFilter);
    return count > 0;
  }).length;

  // 최소 2개 이상의 옵션에 제품이 있어야 필터링 의미가 있음
  return validOptionCount >= 2;
}

// 질문 설정 타입 (순서, 숨기기, 옵션 순서)
interface QuestionConfig {
  hidden: boolean;
  order: number;
  customNumber?: string;
  optionOrder?: string[]; // 옵션 value 순서
}

/**
 * 질문 설정 파일 로드
 */
async function loadQuestionConfigs(): Promise<Record<string, Record<string, QuestionConfig>>> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'data/rules/question_configs.json');
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * 카테고리별 하드필터 질문 생성 (통합)
 * - 다나와 필터 기반 동적 생성
 * - 실제 제품 데이터가 있는 필터만 포함
 * - 부족할 경우 수동 정의 질문으로 보충
 * - question_configs.json의 숨김/순서 설정 적용
 *
 * @param categoryKey 카테고리 키
 * @param targetCategoryCodes 세부 카테고리 코드 (선택)
 * @param options.forAdmin true면 숨긴 질문도 포함 (어드민용)
 */
export async function generateHardFiltersForCategory(
  categoryKey: string,
  targetCategoryCodes?: string[],
  options?: { forAdmin?: boolean }
): Promise<HardFilterQuestion[]> {
  const forAdmin = options?.forAdmin ?? false;
  // 1. 다나와 필터 및 제품 데이터 로드 (🚀 카테고리별 최적화 로드)
  const [danawaFilters, categoryProducts, questionConfigs] = await Promise.all([
    loadDanawaFilters(),
    loadDanawaProducts(categoryKey),  // 해당 카테고리만 로드
    loadQuestionConfigs(),
  ]);

  // targetCategoryCodes가 지정된 경우 추가 필터링
  const categoryCodes = targetCategoryCodes || CATEGORY_CODE_MAP[categoryKey] || [];
  const filteredProducts = targetCategoryCodes 
    ? categoryProducts.filter(p => categoryCodes.includes(String(p.category_code)))
    : categoryProducts;

  // 2. 다나와 필터 기반 동적 생성 (제품 데이터에서 옵션 값 추출)
  const dynamicQuestions = convertDanawaFiltersToHardFilters(
    danawaFilters,
    categoryKey,
    targetCategoryCodes,
    10,  // 더 많이 생성 (유효성 검사 후 필터링됨)
    filteredProducts  // 제품 데이터 전달 → 옵션 값을 실제 데이터에서 추출
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

    return isValidFilterQuestion(question, filteredProducts, originalFilterName);
  });

  // 4. 브랜드 필터 추가 (brand 필드가 filter_attrs가 아닌 별도 필드인 카테고리)
  const BRAND_FILTER_CATEGORIES = ['stroller', 'car_seat', 'baby_desk', 'baby_wipes', 'diaper'];
  if (BRAND_FILTER_CATEGORIES.includes(categoryKey)) {
    const brandQuestion = createBrandQuestion(categoryKey, filteredProducts, validQuestions.length);
    if (brandQuestion) {
      validQuestions.push(brandQuestion);  // 브랜드 질문을 맨 뒤에 추가
    }
  }

  console.log(`[danawaFilters] ${categoryKey}: ${dynamicQuestions.length} generated, ${validQuestions.length} valid`);

  // 5. 수동 정의 질문 로드
  const manualQuestions = getManualQuestions(categoryKey);
  
  // review_priorities 질문 분리 (항상 맨 앞에 와야 함)
  const reviewPriorityQuestions = manualQuestions.filter(q => q.type === 'review_priorities');
  const otherManualQuestions = manualQuestions.filter(q => q.type !== 'review_priorities');

  // 6. 수동 질문을 먼저 포함하고, 동적 질문으로 보충
  // 수동 질문이 우선순위 높음 (직접 정의한 질문이므로)
  const existingIds = new Set(manualQuestions.map(q => q.id));
  const additionalDynamicQuestions = validQuestions.filter(q => !existingIds.has(q.id));
  
  // 동적 질문 + 기타 수동 질문 합침 (review_priorities 제외)
  let nonReviewQuestions = [...otherManualQuestions, ...additionalDynamicQuestions];

  // 7. 저장된 질문 설정 적용 (숨기기, 순서, 옵션 순서)
  const categoryConfigs = questionConfigs[categoryKey] || {};
  if (Object.keys(categoryConfigs).length > 0) {
    // 숨긴 질문 제외 (어드민 모드가 아닌 경우에만)
    if (!forAdmin) {
      nonReviewQuestions = nonReviewQuestions.filter(q => !categoryConfigs[q.id]?.hidden);
    }

    // 순서 재정렬
    nonReviewQuestions.sort((a, b) => {
      const orderA = categoryConfigs[a.id]?.order ?? 999;
      const orderB = categoryConfigs[b.id]?.order ?? 999;
      return orderA - orderB;
    });

    // 옵션 순서 적용
    nonReviewQuestions = nonReviewQuestions.map(q => {
      const config = categoryConfigs[q.id];
      if (config?.optionOrder && config.optionOrder.length > 0) {
        const sortedOptions = [...q.options].sort((a, b) => {
          const idxA = config.optionOrder!.indexOf(a.value);
          const idxB = config.optionOrder!.indexOf(b.value);
          // 순서에 없는 옵션은 맨 뒤로
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        return { ...q, options: sortedOptions };
      }
      return q;
    });
  }

  // 8. review_priorities를 맨 앞에, 나머지 질문은 최대 4개로 제한 (총 5개)
  const maxOtherQuestions = reviewPriorityQuestions.length > 0 ? 4 : 5;
  const finalQuestions = [...reviewPriorityQuestions, ...nonReviewQuestions.slice(0, maxOtherQuestions)];
  
  console.log(`[danawaFilters] ${categoryKey}: ${reviewPriorityQuestions.length} review_priorities + ${nonReviewQuestions.length} other questions → ${finalQuestions.length} final`);

  return finalQuestions;
}

// requiresSubCategorySelection은 categoryUtils.ts로 이동됨

/**
 * LLM을 사용하여 하드필터 질문 텍스트를 동적으로 생성
 * - 선택지 레이블들과 카테고리 지식을 바탕으로 자연스러운 질문 생성
 * - 카테고리 인사이트 (장점, 단점, 트레이드오프) 반영
 * - 한 문장으로 간결하게, 세심하고 꼼꼼한 느낌
 */
export async function enhanceHardFilterQuestionsWithLLM(
  questions: HardFilterQuestion[],
  categoryKey: string,
  categoryName: string,
  insights?: {
    pros?: Array<{ text: string; mention_rate: number }>;
    cons?: Array<{ text: string; mention_rate: number; deal_breaker_for?: string }>;
    common_concerns?: string[];
    decision_factors?: string[];
  }
): Promise<HardFilterQuestion[]> {
  // Gemini가 사용 불가능하면 원본 반환
  if (!isGeminiAvailable()) {
    console.log('[enhanceHardFilterQuestions] Gemini not available, returning original questions');
    return questions;
  }

  // review_priorities 타입은 제외 (이미 고정 텍스트 사용)
  const questionsToEnhance = questions.filter(q => q.type !== 'review_priorities');
  const reviewPriorityQuestions = questions.filter(q => q.type === 'review_priorities');

  if (questionsToEnhance.length === 0) {
    return questions;
  }

  try {
    const model = getModel(0.3); // 낮은 temperature로 일관성 유지

    // 질문 정보를 프롬프트에 포함 (선택 비율 및 팁 포함)
    const questionsInfo = questionsToEnhance.map((q, i) => {
      const optionLabels = q.options
        .filter(opt => opt.value !== 'any' && !opt.label.includes('전부 좋아요'))
        .map(opt => {
          // mentionCount가 있으면 비율 정보 추가
          if (opt.mentionCount) {
            return `${opt.label} (${opt.mentionCount}% 선택)`;
          }
          return opt.label;
        })
        .join(', ');

      const tipInfo = q.tip ? `\n   참고 지식(Tip): "${q.tip}"` : '';

      return `${i + 1}. 필터명: "${q.question.replace('을(를) 선택해주세요', '').replace('원하는 ', '').replace('이 있나요?', '')}"
   선택지: [${optionLabels}]${tipInfo}`;
    }).join('\n');

    // 카테고리 인사이트 컨텍스트 구성
    let insightsContext = '';
    if (insights) {
      const parts: string[] = [];
      if (insights.pros && insights.pros.length > 0) {
        const topPros = insights.pros.slice(0, 3).map(p => `${p.text} (${p.mention_rate}% 언급)`).join(', ');
        parts.push(`주요 장점: ${topPros}`);
      }
      if (insights.cons && insights.cons.length > 0) {
        const topCons = insights.cons.slice(0, 3).map(c => `${c.text} (${c.mention_rate}% 언급)`).join(', ');
        parts.push(`주요 단점: ${topCons}`);
      }
      if (insights.common_concerns && insights.common_concerns.length > 0) {
        parts.push(`부모들의 주요 고민: ${insights.common_concerns.slice(0, 3).join(', ')}`);
      }
      if (insights.decision_factors && insights.decision_factors.length > 0) {
        parts.push(`결정 요소: ${insights.decision_factors.slice(0, 3).join(', ')}`);
      }
      if (parts.length > 0) {
        insightsContext = `\n📊 카테고리 인사이트:\n${parts.join('\n')}\n`;
      }
    }

    const prompt = `당신은 10년 경력의 ${categoryName} 전문 상담사이자 육아 전문가입니다.
${insightsContext}
아래 필터 질문들을 처음 구매하는 초보 부모를 위해 친절하고 전문적인 가이드 질문으로 변환해주세요.

📋 변환할 질문들:
${questionsInfo}

🎯 변환 규칙:
1. 질문은 반드시 **한 문장**으로 간결하게 구성합니다. (30~50자 내외)
2. **[질문]과 [전문가 가이드]를 자연스럽게 연결**하세요.
   - 단순한 질문보다는, "왜 이 선택이 중요한지" 혹은 "어떤 상황에서 무엇이 좋은지" 팁을 곁들여 물어보세요.
3. ⚠️ **중요: 정보량이 없는 뻔한 설명 금지** (Tautology 회피)
   - ❌ "벨트는 아이를 고정하는 방식입니다." (당연한 말)
   - ✅ "3점식은 착용이 간편하고, 5점식은 움직임이 많은 아이도 단단하게 잡아줍니다." (차이점/장점 설명)
   - 각 옵션의 **핵심 가치(안전성, 편의성, 가성비 등)를 대조**하여 선택의 기준을 제시하세요.
4. ⚠️ **중요: 확신을 가진 전문가의 톤을 유지하세요.**
   - ⚠️ **매우 중요: 반드시 '제공된 선택지'와 관련된 내용만 설명하세요.** 선택지에 없는 기능(예: KC인증, 무독성 등 선택지에 없는 키워드)을 언급하거나 유도하면 절대 안 됩니다. 사용자가 선택할 수 없는 것을 설명하면 혼란을 줍니다.
   - ❌ 피할 표현: "~라고 합니다", "~알려져 있습니다", "~인 것 같아요" (불확실함/전언)
   - ✅ 좋은 표현: "~입니다", "~가 좋습니다", "~를 추천합니다" (명확한 사실/조언)
   - 제공된 '참고 지식(Tip)'이 있다면 이를 최우선으로 활용하고, 없다면 확실한 지식만 언급하세요.
5. ⚠️ **사용자 이탈 방지**: 사용자가 당장 확인할 수 없는 정보(예: 차량 호환 여부, 집안 치수 측정 등)를 요구하지 마세요. 대신 각 옵션의 특징을 설명하여 즉석에서 판단할 수 있게 도와주세요.
   - ❌ "차량 벨트 타입을 확인해 주세요." (이탈 유발)
6. **자연스러운 한국어 구사**: 번역투(예: "~확인 후 선택해 주시겠어요?")를 피하고, 매끄러운 대화체로 작성하세요.
7. **페르소나**: 초보 부모의 막막함을 해결해주는 든든한 조력자
8. 전문용어는 풀어서 설명하거나 괄호로 보충
9. ⚠️ **객관식 선택 유도** - 사용자가 선택지 중에서 고르도록 하는 질문
10. ⚠️ **중립적 가이드** - 특정 옵션만 좋다고 강요하지 마세요.
   - ❌ "유리가 최고입니다." (편파적)
   - ✅ "유리는 위생적이고 PPSU는 가벼워서 좋은데, 어떤 걸 선호하세요?" (균형 잡힌 비교)

❌ 나쁜 예 (두 문장이거나 불확실함, 뻔한 설명):
- "재질을 선택해 주세요. 유리가 좋다고들 합니다."
- "분유 단계를 골라주세요. 보통 6개월마다 바뀐다고 하네요."
- "안전벨트 타입은 3점식과 5점식이 있는데, 어떤 방식으로 아이를 고정하고 싶으신가요?" (정보량 없음)

✅ 좋은 예 (한 문장, 전문적, 확신, 중립적, 특징 비교):
- "신생아 때는 위생적인 유리가, 외출 시에는 가벼운 PPSU가 편리한데 어떤 재질을 선호하세요?"
- "아기의 성장 발달에 맞춰 6개월마다 단계를 올려주셔야 영양 불균형을 막을 수 있습니다."
- "3점식은 승하차가 간편하고, 5점식은 충격을 더 효과적으로 분산시켜 주는데 어떤 방식이 좋으세요?"

📤 응답 형식 (JSON만 출력):
{
  "questions": [
    {"index": 1, "question": "첫 번째 문장. 두 번째 문장."},
    {"index": 2, "question": "첫 번째 문장. 두 번째 문장."}
  ]
}

JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    }, 2, 500);

    const parsed = parseJSONResponse<{ questions: Array<{ index: number; question: string }> }>(result);

    if (!parsed.questions || parsed.questions.length === 0) {
      console.log('[enhanceHardFilterQuestions] LLM returned empty, using original');
      return questions;
    }

    // 원본 질문에 LLM 생성 텍스트 적용
    const enhancedMap = new Map<number, string>();
    for (const item of parsed.questions) {
      enhancedMap.set(item.index, item.question);
    }

    const enhancedQuestions = questionsToEnhance.map((q, i) => {
      const enhancedText = enhancedMap.get(i + 1);
      if (enhancedText) {
        return { ...q, question: enhancedText };
      }
      return q;
    });

    console.log(`[enhanceHardFilterQuestions] Enhanced ${enhancedQuestions.length} questions for ${categoryKey}`);

    // review_priorities + enhanced questions 순서 유지
    return [...reviewPriorityQuestions, ...enhancedQuestions];

  } catch (error) {
    console.error('[enhanceHardFilterQuestions] LLM failed:', error);
    return questions;
  }
}
