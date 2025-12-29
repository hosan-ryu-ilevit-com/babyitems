/**
 * 동적 질문 생성 로직
 * - 후보군 상품들의 스펙을 분석하여 관련된 체감속성만 필터링
 * - 밸런스 게임과 단점 필터 질문을 동적으로 생성
 */

import type {
  ProductItem,
  RuleDefinition,
  RuleLogic,
  BalanceQuestion,
  NegativeFilterOption,
  DirectInputAnalysis,
} from '@/types/recommend-v2';
import { DEFAULT_BALANCE_QUESTIONS } from '@/types/recommend-v2';
import { matchesSubCategory, ENURI_CATEGORY_CODES } from '@/lib/dataSourceConfig';

// ===================================================
// 규칙 평가 함수
// ===================================================

/**
 * 문자열에서 숫자 추출 (예: "7.9kg" → 7.9, "~22kg" → 22)
 */
function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;

  // 숫자와 소수점만 추출 (첫 번째 숫자)
  const match = String(value).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : NaN;
}

/**
 * 단일 규칙 로직을 상품에 적용하여 매칭 여부 확인
 */
function evaluateSingleLogic(product: ProductItem, logic: RuleLogic): boolean {
  const { target, operator, value } = logic;

  // target 경로에서 값 추출 (예: "spec.재질" → product.spec.재질)
  const targetValue = getNestedValue(product as unknown as Record<string, unknown>, target);

  if (targetValue === undefined || targetValue === null) {
    return false;
  }

  // 배열인 경우 contains 연산을 위해 특별 처리
  if (Array.isArray(targetValue)) {
    if (operator === 'contains') {
      // 배열의 요소 중 하나라도 value를 포함하는지 확인
      const valueStr = String(value).toLowerCase();
      return targetValue.some(item =>
        String(item).toLowerCase().includes(valueStr)
      );
    }
    // 배열을 문자열로 변환하여 처리
    const targetStr = targetValue.join(',').toLowerCase();
    const valueStr = String(value).toLowerCase();

    if (operator === 'eq') {
      return targetStr === valueStr;
    }
    return false;
  }

  const targetStr = String(targetValue).toLowerCase();
  const valueStr = String(value).toLowerCase();

  switch (operator) {
    case 'eq':
      return targetStr === valueStr;
    case 'contains':
      return targetStr.includes(valueStr);
    case 'lt':
      return parseNumericValue(targetValue) < parseNumericValue(value);
    case 'lte':
      return parseNumericValue(targetValue) <= parseNumericValue(value);
    case 'gt':
      return parseNumericValue(targetValue) > parseNumericValue(value);
    case 'gte':
      return parseNumericValue(targetValue) >= parseNumericValue(value);
    default:
      return false;
  }
}

/**
 * 중첩된 객체 경로에서 값 추출
 * 예: getNestedValue(product, "spec.재질") → product.spec.재질
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * 규칙 정의의 모든 로직을 상품에 적용하여 점수 계산
 */
export function evaluateRule(product: ProductItem, logicList: RuleLogic[]): number {
  let score = 0;

  for (const logic of logicList) {
    if (evaluateSingleLogic(product, logic)) {
      score += logic.score;
    }
  }

  return score;
}

/**
 * 상품이 특정 규칙에 매칭되는지 확인 (점수가 0보다 큰지)
 */
export function productMatchesRule(product: ProductItem, ruleDefinition: RuleDefinition): boolean {
  return evaluateRule(product, ruleDefinition.logic) > 0;
}

// ===================================================
// 동적 질문 생성 함수
// ===================================================

/**
 * 후보군 상품들을 분석하여 관련된 체감속성 키 목록 반환
 */
export function filterRelevantRuleKeys(
  filteredProducts: ProductItem[],
  logicMap: Record<string, RuleDefinition>
): string[] {
  const relevantKeys: string[] = [];

  for (const [ruleKey, ruleDef] of Object.entries(logicMap)) {
    // 후보군 중 하나라도 이 규칙에 매칭되는 상품이 있는지 확인
    const hasMatchingProduct = filteredProducts.some(product =>
      productMatchesRule(product, ruleDef)
    );

    if (hasMatchingProduct) {
      relevantKeys.push(ruleKey);
    }
  }

  return relevantKeys;
}

/**
 * 동적 밸런스 게임 질문 생성
 * - 후보군에 관련된 체감속성만 포함하는 질문 필터링
 * - 최소 질문 수 보장 (카테고리별 기본 질문 사용)
 */
export function generateDynamicBalanceQuestions(
  relevantRuleKeys: string[],
  allBalanceQuestions: BalanceQuestion[],
  categoryKey: string,
  minQuestions: number = 1,
  maxQuestions: number = 3
): BalanceQuestion[] {
  // 1. 관련된 규칙 키를 가진 질문만 필터링
  const dynamicQuestions = allBalanceQuestions.filter(question =>
    relevantRuleKeys.includes(question.option_A.target_rule_key) ||
    relevantRuleKeys.includes(question.option_B.target_rule_key)
  );

  // 2. 최소 질문 수 보장
  if (dynamicQuestions.length < minQuestions) {
    const defaultQuestionIds = DEFAULT_BALANCE_QUESTIONS[categoryKey] || [];
    const defaultQuestions = allBalanceQuestions.filter(q =>
      defaultQuestionIds.includes(q.id)
    );

    // 중복 제거하며 추가
    const existingIds = new Set(dynamicQuestions.map(q => q.id));
    for (const defaultQ of defaultQuestions) {
      if (!existingIds.has(defaultQ.id)) {
        dynamicQuestions.push(defaultQ);
        existingIds.add(defaultQ.id);
      }
      if (dynamicQuestions.length >= minQuestions) break;
    }
  }

  // 3. 최대 질문 수 제한
  return dynamicQuestions.slice(0, maxQuestions);
}

/**
 * 동적 단점 필터 옵션 생성
 * - 후보군에 관련된 체감속성만 포함하는 옵션 필터링
 */
export function generateDynamicNegativeOptions(
  relevantRuleKeys: string[],
  allNegativeOptions: NegativeFilterOption[],
  maxOptions: number = 6
): NegativeFilterOption[] {
  const dynamicOptions = allNegativeOptions.filter(option =>
    relevantRuleKeys.includes(option.target_rule_key)
  );

  return dynamicOptions.slice(0, maxOptions);
}

// ===================================================
// 하드 필터 적용 함수
// ===================================================

interface FilterCondition {
  [key: string]: unknown;
}

/**
 * 하드 필터 조건을 상품 목록에 적용 (다중 선택 지원)
 * - 기본: AND 로직 (모든 질문에 대해 조건 만족)
 * - 같은 질문 내 다중 선택은 OR 로직 (선택한 것 중 하나라도 만족)
 * - Fallback: AND 결과가 너무 적으면(5개 미만) OR 로직으로 전환
 */
export function applyHardFilters(
  products: ProductItem[],
  answers: Record<string, string[]>,
  questions: Array<{
    id: string;
    options: Array<{
      value: string;
      filter?: FilterCondition;
      category_code?: string;
    }>;
  }>,
  minResultThreshold: number = 5
): ProductItem[] {
  // 답변이 없으면 전체 반환
  if (Object.keys(answers).length === 0) {
    return [...products];
  }

  // "상관없어요" 등 skip 옵션은 필터링에서 제외
  const SKIP_VALUES = ['skip', 'any', '상관없어요', 'none', 'all'];
  const filteredAnswers: Record<string, string[]> = {};
  for (const [questionId, values] of Object.entries(answers)) {
    const nonSkipValues = values.filter(v =>
      !SKIP_VALUES.includes(v.toLowerCase()) && !v.includes('상관없')
    );
    if (nonSkipValues.length > 0) {
      filteredAnswers[questionId] = nonSkipValues;
    }
  }

  // 필터할 조건이 없으면 전체 반환
  if (Object.keys(filteredAnswers).length === 0) {
    return [...products];
  }

  // 1. 먼저 AND 로직 시도
  const andFiltered = applyHardFiltersAND(products, filteredAnswers, questions);

  // 2. AND 결과가 충분하면 반환
  if (andFiltered.length >= minResultThreshold) {
    console.log(`🔍 Hard filter (AND): ${products.length} → ${andFiltered.length}`);
    return andFiltered;
  }

  // 3. AND 결과가 부족하면 OR 로직으로 fallback
  console.log(`⚠️ AND filter result too few (${andFiltered.length}), falling back to OR logic`);
  const orFiltered = applyHardFiltersOR(products, filteredAnswers, questions);

  // 4. OR 결과도 없으면 AND 결과라도 반환 (0개여도)
  if (orFiltered.length === 0) {
    console.log(`❌ OR filter also returned 0, returning AND result`);
    return andFiltered;
  }

  console.log(`🔍 Hard filter (OR fallback): ${products.length} → ${orFiltered.length}`);
  return orFiltered;
}

/**
 * AND 로직: 모든 질문에 대해 조건을 만족하는 상품만 반환
 * - 같은 질문 내 다중 선택은 OR (선택한 것 중 하나라도 만족)
 */
function applyHardFiltersAND(
  products: ProductItem[],
  answers: Record<string, string[]>,
  questions: Array<{
    id: string;
    options: Array<{
      value: string;
      filter?: FilterCondition;
      category_code?: string;
    }>;
  }>
): ProductItem[] {
  let filtered = [...products];

  for (const [questionId, answerValues] of Object.entries(answers)) {
    const question = questions.find(q => q.id === questionId);
    if (!question) continue;
    if (answerValues.length === 0) continue;

    // 선택된 옵션들의 조건을 수집
    const selectedOptions = answerValues
      .map(v => question.options.find(o => o.value === v))
      .filter(Boolean) as Array<{
        value: string;
        filter?: FilterCondition;
        category_code?: string;
      }>;

    if (selectedOptions.length === 0) continue;

    // 같은 질문 내 다중 선택은 OR: 하나라도 만족하면 통과
    filtered = filtered.filter(product => {
      return selectedOptions.some(option => {
        // category_code 필터 (에누리 제품은 spec.하위카테고리로 매칭)
        if (option.category_code) {
          const isEnuriProduct = Object.values(ENURI_CATEGORY_CODES).includes(product.category_code || '');
          
          if (isEnuriProduct) {
            // 에누리 제품: spec.하위카테고리로 매칭
            const enuriSubCategory = (product.spec as Record<string, unknown>)?.하위카테고리 as string | undefined;
            // categoryKey 추출 (에누리 category_code가 곧 categoryKey)
            const categoryKey = product.category_code || '';
            if (!matchesSubCategory(categoryKey, option.category_code, enuriSubCategory)) {
              return false;
            }
          } else {
            // 다나와 제품: 기존 category_code 필터
            if (product.category_code !== option.category_code) {
              return false;
            }
          }
        }

        // spec 필터
        if (option.filter && Object.keys(option.filter).length > 0) {
          if (!productMatchesSpecFilter(product, option.filter)) {
            return false;
          }
        }

        return true;
      });
    });
  }

  return filtered;
}

/**
 * OR 로직: 하나 이상의 조건을 만족하는 상품 반환
 * - 각 조건을 만족하는 상품에 점수 부여
 * - 더 많은 조건을 만족할수록 높은 점수
 */
function applyHardFiltersOR(
  products: ProductItem[],
  answers: Record<string, string[]>,
  questions: Array<{
    id: string;
    options: Array<{
      value: string;
      filter?: FilterCondition;
      category_code?: string;
    }>;
  }>
): ProductItem[] {
  // 각 상품별 매칭 점수 계산
  const scoredProducts = products.map(product => {
    let matchScore = 0;

    for (const [questionId, answerValues] of Object.entries(answers)) {
      const question = questions.find(q => q.id === questionId);
      if (!question) continue;

      for (const answerValue of answerValues) {
        const selectedOption = question.options.find(o => o.value === answerValue);
        if (!selectedOption) continue;

        // category_code 매칭 체크 (에누리 제품은 spec.하위카테고리로 매칭)
        if (selectedOption.category_code) {
          const isEnuriProduct = Object.values(ENURI_CATEGORY_CODES).includes(product.category_code || '');
          
          if (isEnuriProduct) {
            // 에누리 제품: spec.하위카테고리로 매칭
            const enuriSubCategory = (product.spec as Record<string, unknown>)?.하위카테고리 as string | undefined;
            const categoryKey = product.category_code || '';
            if (matchesSubCategory(categoryKey, selectedOption.category_code, enuriSubCategory)) {
              matchScore += 1;
            }
          } else {
            // 다나와 제품: 기존 category_code 필터
            if (product.category_code === selectedOption.category_code) {
              matchScore += 1;
            }
          }
        }

        // spec 필터 매칭 체크
        if (selectedOption.filter && Object.keys(selectedOption.filter).length > 0) {
          if (productMatchesSpecFilter(product, selectedOption.filter)) {
            matchScore += 1;
          }
        }
      }
    }

    return { product, matchScore };
  });

  // 1개 이상 매칭된 상품만 필터링, 매칭 점수순 정렬
  return scoredProducts
    .filter(sp => sp.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .map(sp => sp.product);
}

/**
 * 상품이 spec 필터 조건을 만족하는지 체크 (단일 상품용)
 * - 필터 조건의 필드가 없는 경우 (에누리 등): 기본 통과 (true)
 * - 필드가 있고 조건 만족: true
 * - 필드가 있고 조건 불만족: false
 */
function productMatchesSpecFilter(
  product: ProductItem,
  filter: FilterCondition
): boolean {
  // 필터 조건이 비어있으면 무조건 통과
  if (Object.keys(filter).length === 0) {
    return true;
  }

  let hasAnyField = false;  // 필터 조건 중 하나라도 해당 필드가 있는지
  let anyMatch = false;     // 조건 매칭 여부

  for (const [path, condition] of Object.entries(filter)) {
    // filter_attrs 경로인 경우 직접 접근
    let value: unknown;
    if (path.startsWith('filter_attrs.') && product.filter_attrs) {
      const attrKey = path.replace('filter_attrs.', '');
      value = product.filter_attrs[attrKey];
    } else {
      value = getNestedValue(product as unknown as Record<string, unknown>, path);
    }

    // 해당 필드가 없으면 이 조건은 건너뜀
    if (value === undefined || value === null) {
      continue;
    }

    hasAnyField = true;

    // condition이 객체인 경우 (lte, gte, contains 등)
    if (typeof condition === 'object' && condition !== null) {
      const condObj = condition as Record<string, unknown>;

      // contains 연산
      if ('contains' in condObj && typeof condObj.contains === 'string') {
        const searchValue = condObj.contains.toLowerCase();

        if (Array.isArray(value)) {
          const found = value.some(item =>
            String(item).toLowerCase().includes(searchValue)
          );
          if (found) {
            anyMatch = true;
            break;
          }
        } else if (typeof value === 'string') {
          if (value.toLowerCase().includes(searchValue)) {
            anyMatch = true;
            break;
          }
        }
      }

      // 숫자 비교 연산
      const numValue = parseNumericValue(value);
      if ('lte' in condObj && typeof condObj.lte === 'number') {
        if (!isNaN(numValue) && numValue <= condObj.lte) {
          anyMatch = true;
          break;
        }
      }
      if ('gte' in condObj && typeof condObj.gte === 'number') {
        if (!isNaN(numValue) && numValue >= condObj.gte) {
          anyMatch = true;
          break;
        }
      }
    }
    // condition이 문자열인 경우 (eq)
    else if (typeof condition === 'string') {
      if (path.startsWith('filter_attrs.')) {
        if (String(value) === condition) {
          anyMatch = true;
          break;
        }
      } else {
        if (String(value).toLowerCase() === condition.toLowerCase()) {
          anyMatch = true;
          break;
        }
      }
    }
  }

  // 필터 조건의 필드가 하나도 없으면 (에누리 등) 기본 통과
  if (!hasAnyField) {
    return true;
  }

  return anyMatch;
}

/**
 * spec 기반 필터 적용
 * - spec.필드명, filter_attrs.필드명, features 등 다양한 경로 지원
 * - contains, eq, 숫자 비교 연산 지원
 */
function applySpecFilter(
  products: ProductItem[],
  filter: FilterCondition
): ProductItem[] {
  return products.filter(product => {
    for (const [path, condition] of Object.entries(filter)) {
      // filter_attrs 경로인 경우 직접 접근
      let value: unknown;
      if (path.startsWith('filter_attrs.') && product.filter_attrs) {
        const attrKey = path.replace('filter_attrs.', '');
        value = product.filter_attrs[attrKey];
      } else {
        value = getNestedValue(product as unknown as Record<string, unknown>, path);
      }

      // condition이 객체인 경우 (lte, gte, contains 등)
      if (typeof condition === 'object' && condition !== null) {
        const condObj = condition as Record<string, unknown>;

        // contains 연산: 배열 또는 문자열에서 포함 여부 확인
        if ('contains' in condObj && typeof condObj.contains === 'string') {
          const searchValue = condObj.contains.toLowerCase();

          if (Array.isArray(value)) {
            // 배열의 요소 중 하나라도 검색값을 포함하면 통과
            const found = value.some(item =>
              String(item).toLowerCase().includes(searchValue)
            );
            if (!found) return false;
          } else if (typeof value === 'string') {
            // 문자열에서 포함 여부 확인
            if (!value.toLowerCase().includes(searchValue)) return false;
          } else {
            return false;
          }
        }

        // 숫자 비교 연산
        const numValue = parseNumericValue(value);
        if ('lte' in condObj && typeof condObj.lte === 'number') {
          if (isNaN(numValue) || numValue > condObj.lte) return false;
        }
        if ('gte' in condObj && typeof condObj.gte === 'number') {
          if (isNaN(numValue) || numValue < condObj.gte) return false;
        }
        if ('lt' in condObj && typeof condObj.lt === 'number') {
          if (isNaN(numValue) || numValue >= condObj.lt) return false;
        }
        if ('gt' in condObj && typeof condObj.gt === 'number') {
          if (isNaN(numValue) || numValue <= condObj.gt) return false;
        }
      }
      // condition이 문자열인 경우 (eq) - filter_attrs용
      else if (typeof condition === 'string') {
        // filter_attrs는 완전 일치가 필요
        if (path.startsWith('filter_attrs.')) {
          if (value === undefined || value === null) return false;
          if (String(value) !== condition) return false;
        } else {
          // spec 필드는 대소문자 무시
          if (String(value).toLowerCase() !== condition.toLowerCase()) {
            return false;
          }
        }
      }
    }

    return true;
  });
}

// ===================================================
// 점수 계산 함수
// ===================================================

/**
 * 밸런스 게임 선택 기반 상품 점수 계산
 */
export function calculateBalanceScore(
  product: ProductItem,
  balanceSelections: Set<string>,
  logicMap: Record<string, RuleDefinition>
): { score: number; matchedRules: string[] } {
  let score = 0;
  const matchedRules: string[] = [];

  for (const ruleKey of balanceSelections) {
    const ruleDef = logicMap[ruleKey];
    if (!ruleDef) continue;

    const ruleScore = evaluateRule(product, ruleDef.logic);
    if (ruleScore > 0) {
      score += ruleScore;
      matchedRules.push(ruleKey);
    }
  }

  return { score, matchedRules };
}

/**
 * 단점 필터 기반 감점 계산
 */
export function calculateNegativeScore(
  product: ProductItem,
  negativeSelections: string[],
  negativeOptions: NegativeFilterOption[],
  logicMap: Record<string, RuleDefinition>
): number {
  let negativeScore = 0;

  for (const selectedKey of negativeSelections) {
    const option = negativeOptions.find(o => o.target_rule_key === selectedKey);
    if (!option) continue;

    const ruleDef = logicMap[option.target_rule_key];
    if (!ruleDef) continue;

    const hasFeature = evaluateRule(product, ruleDef.logic) > 0;

    if (option.exclude_mode === 'drop_if_lacks' && !hasFeature) {
      // 해당 기능이 없으면 감점 (하드컷은 아님)
      negativeScore -= 30; // -100 → -30 (체감속성/하드필터와 균형)
    } else if (option.exclude_mode === 'drop_if_has' && hasFeature) {
      // 해당 기능이 있으면 감점 (하드컷은 아님)
      negativeScore -= 30; // -100 → -30 (체감속성/하드필터와 균형)
    }
  }

  return negativeScore;
}

/**
 * 하드필터 충족도 기반 점수 계산 (체감속성 + 일반 하드필터)
 */
export function calculateHardFilterScore(
  product: ProductItem,
  hardFilterAnswers: Record<string, string[]>,
  hardFilterConfig: { questions?: Array<{
    id: string;
    type?: 'single' | 'multi' | 'review_priorities';
    options: Array<{
      value: string;
      filter?: Record<string, unknown>;
      category_code?: string;
    }>;
  }> } | null
): { score: number; matchedRules: string[] } {
  let score = 0;
  const matchedRules: string[] = [];

  if (!hardFilterConfig?.questions) {
    return { score: 0, matchedRules: [] };
  }

  // Skip 값 정의
  const SKIP_VALUES = ['skip', 'any', '상관없어요', 'none', 'all'];

  for (const [questionId, selectedValues] of Object.entries(hardFilterAnswers)) {
    const question = hardFilterConfig.questions.find(q => q.id === questionId);
    if (!question || selectedValues.length === 0) continue;

    // Skip 값 제외
    const validValues = selectedValues.filter(v =>
      !SKIP_VALUES.includes(v.toLowerCase()) && !v.includes('상관없')
    );
    if (validValues.length === 0) continue;

    // 선택한 옵션 중 하나라도 매칭되는지 확인
    const matched = validValues.some(value => {
      const option = question.options.find(opt => opt.value === value);
      if (!option) return false;

      // category_code 매칭
      if (option.category_code) {
        const isEnuriProduct = Object.values(ENURI_CATEGORY_CODES).includes(product.category_code || '');

        if (isEnuriProduct) {
          // 에누리 제품: spec.하위카테고리로 매칭
          const enuriSubCategory = (product.spec as Record<string, unknown>)?.하위카테고리 as string | undefined;
          const categoryKey = product.category_code || '';
          return matchesSubCategory(categoryKey, option.category_code, enuriSubCategory);
        } else {
          // 다나와 제품: category_code 직접 매칭
          return product.category_code === option.category_code;
        }
      }

      // filter 조건 매칭
      if (option.filter && Object.keys(option.filter).length > 0) {
        return productMatchesSpecFilter(product, option.filter);
      }

      return false;
    });

    if (matched) {
      // 브랜드 질문 식별 (question.id 또는 question.question에 '브랜드' 포함)
      const isBrandQuestion = questionId.includes('브랜드') || question.options.some(opt =>
        opt.filter && 'brand' in opt.filter
      );

      // 점수 부여
      // - 브랜드: +150 (사용자가 명시적으로 선택한 강한 선호)
      // - 체감속성: +25
      // - 일반 하드필터: +40
      let scoreIncrement: number;
      if (isBrandQuestion) {
        scoreIncrement = 150;
      } else {
        const isExperientialTag = question.type === 'review_priorities';
        scoreIncrement = isExperientialTag ? 25 : 40;
      }

      score += scoreIncrement;
      matchedRules.push(`하드필터_${questionId}`);
    }
  }

  return { score, matchedRules };
}

/**
 * 예산 기반 점수 계산 (soft constraint)
 * - 예산 내: 보너스 점수
 * - 예산 초과: 초과 정도에 따라 차등 페널티
 * - 조건 점수가 우선, 예산은 tie-breaker 역할
 */
export function calculateBudgetScore(
  product: ProductItem,
  budget: { min: number; max: number }
): number {
  const effectivePrice = product.lowestPrice ?? product.price;

  // 가격 정보 없거나 예산 미설정 시 중립
  if (!effectivePrice || budget.max === 0) {
    return 0;
  }

  // 예산 대비 초과 비율
  const overPercent = (effectivePrice - budget.max) / budget.max;

  let budgetScore = 0;

  if (overPercent <= 0) {
    // 예산 내: 보너스
    budgetScore = 10;
  } else if (overPercent <= 0.1) {
    // 10% 이내 초과: 작은 보너스 (거의 예산 내로 취급)
    budgetScore = 5;
  } else if (overPercent <= 0.2) {
    // 10-20% 초과: 중립
    budgetScore = 0;
  } else if (overPercent <= 0.3) {
    // 20-30% 초과: 작은 페널티
    budgetScore = -5;
  } else if (overPercent <= 0.5) {
    // 30-50% 초과: 중간 페널티
    budgetScore = -15;
  } else {
    // 50%+ 초과: 큰 페널티
    budgetScore = -25;
  }

  return budgetScore;
}

// ===================================================
// 조건 요약 생성 함수
// ===================================================

export interface ConditionSummary {
  label: string;
  value: string;
}

/**
 * 하드 필터 답변을 사람이 읽을 수 있는 조건 요약으로 변환 (다중 선택 지원)
 */
export function generateConditionSummary(
  answers: Record<string, string[]>,
  questions: Array<{
    id: string;
    question: string;
    options: Array<{
      label: string;
      value: string;
    }>;
  }>
): ConditionSummary[] {
  const summaries: ConditionSummary[] = [];

  for (const [questionId, answerValues] of Object.entries(answers)) {
    const question = questions.find(q => q.id === questionId);
    if (!question) continue;
    if (!answerValues || answerValues.length === 0) continue;

    // 선택된 옵션들의 레이블 수집
    const selectedLabels = answerValues
      .map(v => {
        // 커스텀 입력인 경우 "custom:" 프리픽스 제거
        if (v.startsWith('custom:')) {
          return v.replace('custom:', '');
        }
        const option = question.options.find(o => o.value === v);
        return option?.label;
      })
      .filter(Boolean) as string[];

    if (selectedLabels.length === 0) continue;

    // 질문에서 키워드 추출 (예: "아기 월령이 어떻게 되나요?" → "월령")
    const labelMatch = question.question.match(/(.+?)이?가?\s*(어떻게|있나요|뭔가요)/);
    const label = labelMatch ? labelMatch[1].trim() : question.question.slice(0, 10);

    // 다중 선택인 경우 각각 별도의 조건으로 추가
    for (const selectedLabel of selectedLabels) {
      summaries.push({
        label,
        value: selectedLabel,
      });
    }
  }

  return summaries;
}

// ===================================================
// 직접 입력 점수 계산
// ===================================================

/**
 * 직접 입력 분석 결과를 기반으로 제품 점수 계산
 * - keywords가 제품 title 또는 리뷰에 포함되면 scoreImpact 적용
 * - preference: +점수, avoidance: -점수
 */
export function calculateDirectInputScore(
  product: ProductItem,
  analysis: DirectInputAnalysis | null
): number {
  if (!analysis || !analysis.keywords || analysis.keywords.length === 0) {
    return 0;
  }

  // 제품 정보에서 검색 대상 텍스트 추출
  const searchTargets = [
    product.title || '',
    // spec에서 텍스트 값들 추출
    ...Object.values(product.spec || {})
      .filter(v => typeof v === 'string')
      .map(v => v as string),
  ].join(' ').toLowerCase();

  // 키워드 매칭 확인
  const hasKeyword = analysis.keywords.some(kw =>
    searchTargets.includes(kw.toLowerCase())
  );

  if (!hasKeyword) {
    return 0;
  }

  // 타입에 따라 점수 부여
  return analysis.type === 'preference'
    ? analysis.scoreImpact      // 선호: +점수
    : -analysis.scoreImpact;    // 회피: -점수
}
