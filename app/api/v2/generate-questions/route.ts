/**
 * V2 동적 질문 생성 API
 * POST /api/v2/generate-questions
 *
 * category-insights + 후보군 상품 스펙을 기반으로 의미있는 질문을 동적 생성합니다.
 *
 * 핵심 원칙:
 * 1. 밸런스 게임: 후보군 내에서 실제로 양쪽 선택지가 존재하는 트레이드오프만 질문
 * 2. 단점 필터: 후보군 중 일부에만 해당하는 단점만 필터로 제시 (전체 해당이면 의미없음)
 * 3. 사용자 컨텍스트: 하드필터 선택을 고려해 관련성 높은 질문 우선
 *
 * 입력:
 * - categoryKey: 카테고리 키
 * - hardFilterAnswers: 하드필터 응답 (사용자 컨텍스트)
 * - filteredProducts: 현재 후보군 상품 배열 (스펙 분석용)
 *
 * 출력:
 * - balance_questions: 밸런스 게임 질문 배열
 * - negative_filter_options: 단점 필터 옵션 배열
 * - guide: 가이드 정보
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { BalanceQuestion, NegativeFilterOption } from '@/types/rules';
import type { CategoryInsights, Tradeoff, ConInsight } from '@/types/category-insights';
import type { ProductItem } from '@/types/recommend-v2';

// 후보군 상품 스펙 요약
interface ProductSpecSummary {
  totalCount: number;
  priceRange: { min: number; max: number; avg: number };
  specDistribution: Record<string, { values: string[]; counts: Record<string, number> }>;
  brandDistribution: Record<string, number>;
}

// 밸런스 게임 선택 정보
interface BalanceSelection {
  questionId: string;
  questionTitle: string;
  selectedOption: 'A' | 'B';
  selectedText: string;       // 선택한 옵션의 텍스트
  rejectedText: string;       // 선택하지 않은 옵션의 텍스트
  targetRuleKey: string;      // 선택한 옵션의 rule key
}

// 생성 옵션: 필요한 것만 생성하여 토큰 절약
type GenerateMode = 'all' | 'balance_only' | 'negative_only';

// Request body type
interface GenerateQuestionsRequest {
  categoryKey: string;
  hardFilterAnswers?: Record<string, string[]>;
  filteredProducts?: ProductItem[];  // 후보군 상품 (스펙 분석용)
  filteredProductCount?: number;  // deprecated, filteredProducts.length 사용
  balanceSelections?: BalanceSelection[];  // 밸런스 게임 선택값 (단점 필터 충돌 방지용)
  generate?: GenerateMode;  // 생성 모드 (기본값: 'all')
  selectedSubCategories?: string[];  // 선택된 하위 카테고리 이름 목록 (유모차/카시트/기저귀 등)
}

// Response type
interface GenerateQuestionsResponse {
  success: boolean;
  data?: {
    category_key: string;
    category_name: string;
    guide: {
      title: string;
      summary: string;
      key_points: string[];
      trend: string;
    };
    balance_questions: BalanceQuestion[];
    negative_filter_options: NegativeFilterOption[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 후보군 상품의 스펙 분포 분석
 */
function analyzeProductSpecs(products: ProductItem[]): ProductSpecSummary {
  if (!products || products.length === 0) {
    return {
      totalCount: 0,
      priceRange: { min: 0, max: 0, avg: 0 },
      specDistribution: {},
      brandDistribution: {},
    };
  }

  // 가격 분석
  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p !== undefined);
  const priceRange = prices.length > 0
    ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      }
    : { min: 0, max: 0, avg: 0 };

  // 브랜드 분포
  const brandDistribution: Record<string, number> = {};
  products.forEach(p => {
    const brand = p.brand || '기타';
    brandDistribution[brand] = (brandDistribution[brand] || 0) + 1;
  });

  // 스펙 분포 (주요 스펙 필드만)
  const specDistribution: Record<string, { values: string[]; counts: Record<string, number> }> = {};
  const importantSpecKeys = ['재질', '소재', '용량', '무게', '타입', '형태', '사이즈'];

  products.forEach(p => {
    if (!p.spec) return;
    Object.entries(p.spec).forEach(([key, value]) => {
      if (!importantSpecKeys.some(k => key.includes(k))) return;
      if (value === null || value === undefined) return;

      const strValue = String(value);
      if (!specDistribution[key]) {
        specDistribution[key] = { values: [], counts: {} };
      }
      if (!specDistribution[key].values.includes(strValue)) {
        specDistribution[key].values.push(strValue);
      }
      specDistribution[key].counts[strValue] = (specDistribution[key].counts[strValue] || 0) + 1;
    });
  });

  return {
    totalCount: products.length,
    priceRange,
    specDistribution,
    brandDistribution,
  };
}

/**
 * 후보군 스펙 분포를 LLM이 이해할 수 있는 텍스트로 변환
 */
function formatSpecDistributionForLLM(summary: ProductSpecSummary): string {
  if (summary.totalCount === 0) return '(후보군 정보 없음)';

  const lines: string[] = [];

  // 총 제품 수 및 가격 범위
  lines.push(`- 총 ${summary.totalCount}개 제품`);
  if (summary.priceRange.avg > 0) {
    lines.push(`- 가격대: ${summary.priceRange.min.toLocaleString()}원 ~ ${summary.priceRange.max.toLocaleString()}원 (평균 ${summary.priceRange.avg.toLocaleString()}원)`);
  }

  // 주요 브랜드 분포 (상위 5개)
  const topBrands = Object.entries(summary.brandDistribution)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);
  if (topBrands.length > 0) {
    lines.push(`- 주요 브랜드: ${topBrands.map(([brand, count]) => `${brand}(${count}개)`).join(', ')}`);
  }

  // 스펙 분포 (의미있는 다양성이 있는 것만)
  Object.entries(summary.specDistribution).forEach(([specKey, data]) => {
    const specData = data as { values: string[]; counts: Record<string, number> };
    if (specData.values.length >= 2) { // 최소 2개 이상 값이 있어야 의미 있음
      const topValues = Object.entries(specData.counts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 4)
        .map(([value, count]) => `${value}(${count}개)`)
        .join(', ');
      lines.push(`- ${specKey}: ${topValues}`);
    }
  });

  return lines.join('\n');
}

/**
 * 후보군 상품 리스트를 LLM이 분석할 수 있는 텍스트로 변환
 * 타이틀 + 핵심 스펙을 직접 전달하여 LLM이 맥락을 파악할 수 있도록 함
 */
function formatProductsForLLM(products: ProductItem[], maxCount: number = 25): string {
  if (!products || products.length === 0) return '(후보군 정보 없음)';

  const targetProducts = products.slice(0, maxCount);

  // 가격 범위 계산
  const prices = targetProducts.map(p => p.price).filter((p): p is number => p !== null && p !== undefined);
  const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
  const priceMax = prices.length > 0 ? Math.max(...prices) : 0;

  const lines: string[] = [];
  lines.push(`📊 후보군 요약: 총 ${products.length}개 상품, 가격 ${priceMin.toLocaleString()}원 ~ ${priceMax.toLocaleString()}원`);
  lines.push('');
  lines.push('📦 상품 목록 (상위 ' + targetProducts.length + '개):');

  targetProducts.forEach((p, i) => {
    // 핵심 스펙 추출 (있는 것만)
    const specParts: string[] = [];
    if (p.spec) {
      const importantKeys = ['소재', '재질', '타입', '형태', '용량', '무게', '크기', '사이즈'];
      Object.entries(p.spec).forEach(([key, value]) => {
        if (value && importantKeys.some(k => key.includes(k))) {
          specParts.push(`${key}:${value}`);
        }
      });
    }

    const priceStr = p.price ? `${p.price.toLocaleString()}원` : '가격미정';
    const specStr = specParts.length > 0 ? ` [${specParts.slice(0, 4).join(', ')}]` : '';

    lines.push(`${i + 1}. ${p.title} (${priceStr})${specStr}`);
  });

  return lines.join('\n');
}

/**
 * Tradeoff → BalanceQuestion 변환 (fallback용)
 */
function tradeoffToBalanceQuestion(tradeoff: Tradeoff, index: number, categoryKey: string): BalanceQuestion {
  return {
    id: `bg_${categoryKey}_${String(index + 1).padStart(2, '0')}`,
    title: tradeoff.title,
    option_A: {
      text: tradeoff.option_a.text,
      target_rule_key: `rule_${categoryKey}_${tradeoff.option_a.keywords[0]?.toLowerCase().replace(/\s+/g, '_') || 'a'}`,
    },
    option_B: {
      text: tradeoff.option_b.text,
      target_rule_key: `rule_${categoryKey}_${tradeoff.option_b.keywords[0]?.toLowerCase().replace(/\s+/g, '_') || 'b'}`,
    },
  };
}

/**
 * ConInsight → NegativeFilterOption 변환 (fallback용)
 */
function conToNegativeFilter(con: ConInsight, index: number, categoryKey: string): NegativeFilterOption {
  return {
    id: `neg_${categoryKey}_${String(index + 1).padStart(2, '0')}`,
    label: con.text.length > 50 ? con.text.substring(0, 47) + '...' : con.text,
    target_rule_key: `rule_${categoryKey}_con_${con.keywords[0]?.toLowerCase().replace(/\s+/g, '_') || index}`,
    exclude_mode: 'drop_if_has',
  };
}

/**
 * LLM을 사용하여 동적으로 질문 생성
 *
 * 핵심: 후보군 스펙 분포를 분석하여 "의미있는" 질문만 생성
 * - 후보군 내에서 실제로 차이가 나는 트레이드오프
 * - 일부 제품에만 해당하는 단점 (전체 해당이면 필터 의미없음)
 * - 밸런스 게임에서 선택한 옵션과 충돌하는 단점은 제외
 */
async function generateQuestionsWithLLM(
  insights: CategoryInsights,
  hardFilterAnswers: Record<string, string[]>,
  filteredProducts: ProductItem[],
  balanceSelections: BalanceSelection[] = [],
  generateMode: GenerateMode = 'all',
  selectedSubCategories: string[] = []
): Promise<{
  balance_questions: BalanceQuestion[];
  negative_filter_options: NegativeFilterOption[];
}> {
  const model = getModel(0.5); // 약간의 창의성 허용

  // 후보군 상품 리스트 직접 포맷 (LLM이 분석할 수 있도록)
  const productsText = formatProductsForLLM(filteredProducts, 25);

  // 선택된 하위 카테고리 문자열 생성
  const subCategoryText = selectedSubCategories.length > 0
    ? `- 선택한 하위 카테고리: ${selectedSubCategories.join(', ')}`
    : '';

  // 복수 선택된 항목 식별 (같은 질문에서 2개 이상 선택)
  const multiSelectedItems: { questionId: string; values: string[] }[] = [];
  Object.entries(hardFilterAnswers).forEach(([key, values]) => {
    if (values.length >= 2) {
      multiSelectedItems.push({ questionId: key, values });
    }
  });

  // 사용자 컨텍스트 문자열 생성 (하위 카테고리 포함)
  const hardFilterLines = Object.entries(hardFilterAnswers)
    .map(([key, values]) => {
      const isMulti = values.length >= 2;
      return `- ${key}: ${values.join(', ')}${isMulti ? ' ⚠️ (복수선택: 둘 다 괜찮다는 의미)' : ''}`;
    });
  if (subCategoryText) {
    hardFilterLines.unshift(subCategoryText);
  }
  const userContextText = hardFilterLines.length > 0
    ? hardFilterLines.join('\n')
    : '(선택된 조건 없음)';

  // 복수 선택 항목 별도 표시 (LLM이 명확히 인식하도록)
  const multiSelectWarning = multiSelectedItems.length > 0
    ? `\n\n⚠️ **복수 선택된 속성 (사용자가 "둘 다 괜찮아요"라고 답한 항목)**:\n${multiSelectedItems.map(item => `- ${item.questionId}: ${item.values.join(' + ')}`).join('\n')}`
    : '';

  // 밸런스 게임 선택 결과 문자열 생성
  const balanceSelectionsText = balanceSelections.length > 0
    ? balanceSelections.map(sel =>
        `- "${sel.questionTitle}": ✅ "${sel.selectedText}" 선택 / ❌ "${sel.rejectedText}" 거부`
      ).join('\n')
    : '(아직 선택 없음)';

  // Tradeoffs를 상세하게 포맷
  const tradeoffsText = insights.tradeoffs
    .map((t, i) => {
      return `${i + 1}. "${t.title}"
   - A: "${t.option_a.text}"
   - B: "${t.option_b.text}"`;
    })
    .join('\n');

  // Cons를 상세하게 포맷 (상위 10개)
  const consText = insights.cons
    .slice(0, 10)
    .map((c, i) => {
      return `${i + 1}. [언급률 ${c.mention_rate}%] "${c.text}"
   - 치명적인 경우: ${c.deal_breaker_for || '일반적 불만'}`;
    })
    .join('\n');

  // 모드에 따라 프롬프트 분리
  let prompt: string;

  if (generateMode === 'balance_only') {
    // 밸런스 게임 질문만 생성
    prompt = `당신은 ${insights.category_name} 구매 상담 전문가입니다.
사용자가 하드필터로 후보군을 좁힌 상태입니다. **밸런스 게임 질문**만 생성해주세요.

═══════════════════════════════════════
👤 사용자가 이미 선택한 조건 (하드필터)
═══════════════════════════════════════
${userContextText}${multiSelectWarning}

═══════════════════════════════════════
📦 현재 후보군 상품 (하드필터 통과)
═══════════════════════════════════════
${productsText}

═══════════════════════════════════════
💡 참고: 이 카테고리의 일반적인 트레이드오프
═══════════════════════════════════════
${tradeoffsText}

═══════════════════════════════════════
🎯 밸런스 게임 질문 생성 규칙 (1~3개)
═══════════════════════════════════════

**[공통 규칙]**
1. ❌ 가격/예산 관련 질문 절대 금지 (따로 필터링함)
2. 전문용어나 일상에서 안 쓰는 단어는 풀어서 설명
   예: "PPSU(열에 강한 플라스틱) 소재", "BPA-free(환경호르몬 없는)"
3. 초보 부모도 바로 이해할 수 있는 쉬운 말로 작성

⚠️ **Rule 1. 하드필터 중복 질문 절대 금지**
위 '사용자가 이미 선택한 조건(하드필터)'을 확인하세요. 사용자가 이미 명확히 의사를 밝힌 속성은 밸런스 게임에서 다시 묻지 마세요.
- ❌ 상황: 하드필터에서 "가벼운 무게(휴대용)"를 이미 선택함
- ❌ 금지된 질문: "가벼움 vs 튼튼함" (사용자는 이미 가벼움을 선택했으므로 이 질문은 불필요)
- ✅ 행동: 이미 선택된 속성과 관련된 트레이드오프는 건너뛰고, 아직 결정하지 않았지만 구매에 중요한 다른 속성을 물어보세요.

⚠️ **Rule 1-1. 복수 선택 속성 처리 (중요!)**
위 "⚠️ 복수 선택된 속성"을 확인하세요. 사용자가 같은 질문에서 2개 이상 선택한 경우 "둘 다 괜찮아요"라는 의미입니다.
- ❌ 상황: 하드필터에서 "PPSU + 유리" 둘 다 선택, 또는 "브랜드A + 브랜드B" 둘 다 선택
- ❌ 금지된 질문: 해당 속성의 트레이드오프를 그냥 물어보기 (예: "플라스틱 vs 유리")
- ✅ **올바른 행동**:
  1. 다른 질문이 충분하면(2개 이상) → 해당 트레이드오프 질문 생략
  2. 다른 질문이 부족하면(1개 이하) → 질문을 변형하여 포함:
     - option_A.text와 option_B.text 앞에 "둘 다 좋지만, 하나만 고른다면 "식의 문구 자연스럽게 추가

⚠️ **Rule 2. 물리적/직관적 트레이드오프만 허용 (Strong)**
부모들이 실제로 고민하는 **물리적/구조적 상반 관계**만 질문하세요. 기술적으로 둘 다 만족시킬 수 있는 "좋은 기능 vs 좋은 기능"은 가짜 트레이드오프입니다.

- ❌ **나쁜 예**
  - "빠른 흡수 vs 많은 흡수량" (좋은 기저귀는 둘 다 잘함)
  - "안전성 vs 디자인"
  - "모유실감 vs 배앓이 방지" (둘 다 되는 젖병 많음)

- ✅ **좋은 예 (직관적으로 두 개의 선택지가 반대된다는 것이 느껴져야 함)
  - "가벼움(휴대성) vs 튼튼함(안정감)" (물리적으로 가벼우면 흔들림이 있을 수밖에 없음)
  - "컴팩트한 크기 vs 넉넉한 내부 공간" (작으면 좁을 수밖에 없음)
  - "세척이 쉬운 단순 구조 vs 기능이 많은 복잡 구조" (기능이 많으면 부품이 많아 세척이 귀찮음)
  - "깨지지 않는 플라스틱 vs 위생적인 유리" (소재의 고유 특성)

형식 요구사항:
- type: "tradeoff" (기본)
- title: 상반 관계가 명확히 드러나는 제목 (예: "무게 vs 안정감")
- option_A.text: **A를 선택하면 B를 포기해야 함이 암시된 문장** (30~50자)
  예: "무겁더라도 흔들림 없이 안정적인 게 좋아요"
- option_B.text: **B를 선택하면 A를 포기해야 함이 암시된 문장** (30~50자)
  예: "좀 흔들려도 가볍고 들고 다니기 편한 게 좋아요"
- target_rule_key: 영문 소문자+언더스코어 (⚠️ 필수: A와 B는 서로 다른 고유한 키여야 함)

═══════════════════════════════════════
📤 응답 형식 (JSON만 출력)
═══════════════════════════════════════

{
  "balance_questions": [
    {
      "id": "bg_${insights.category_key}_01",
      "type": "tradeoff",
      "title": "A vs B",
      "option_A": { "text": "상황+이유가 담긴 구체적 문장 (30~50자)", "target_rule_key": "rule_key_a" },
      "option_B": { "text": "상황+이유가 담긴 구체적 문장 (30~50자)", "target_rule_key": "rule_key_b" }
    }
  ]
}

JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;

  } else if (generateMode === 'negative_only') {
    // 단점 필터 옵션만 생성 (하드필터 + 밸런스 선택 결과 반영)
    prompt = `당신은 ${insights.category_name} 구매 상담 전문가입니다.
사용자가 하드필터와 밸런스 게임을 완료했습니다. 이제 **단점 필터 옵션**만 생성해주세요.

═══════════════════════════════════════
👤 사용자가 이미 선택한 조건 (하드필터)
═══════════════════════════════════════
${userContextText}${multiSelectWarning}

═══════════════════════════════════════
🎮 사용자가 밸런스 게임에서 선택한 결과
═══════════════════════════════════════
${balanceSelectionsText}

═══════════════════════════════════════
📦 현재 후보군 상품
═══════════════════════════════════════
${productsText}

═══════════════════════════════════════
⚠️ 참고: 이 카테고리의 주요 단점/불만 (리뷰 기반)
═══════════════════════════════════════
${consText}

═══════════════════════════════════════
🎯 단점 필터 옵션 생성 규칙 (3~6개)
═══════════════════════════════════════

**[공통 규칙]**
1. ❌ 가격/예산 관련 질문 절대 금지 (따로 필터링함)
2. 전문용어나 일상에서 안 쓰는 단어는 풀어서 설명
3. 초보 부모도 바로 이해할 수 있는 쉬운 말로 작성

후보군 상품들을 분석해서, **일부 제품에만 해당하는 단점**만 필터로 제시하세요.
전체 후보군이 다 해당하는 단점은 필터링 의미가 없으니 제외!

⚠️ **충돌/중복 방지 규칙 (매우 중요!)**:

**Rule 1. 이미 선택한 조건과 중복/모순 금지**
- 위 "하드필터"에서 사용자가 이미 선택한 조건(하위카테고리, 체감속성, 스펙 필터)과 **같은 내용을 다시 묻거나 반대되는 단점 생성 금지**
- ❌ 예시: 하드필터에서 "PPSU 소재" 선택 → "플라스틱 소재가 걱정돼요" 단점 생성 금지
- ❌ 예시: 하드필터에서 "식기세척기 사용 가능" 선택 → "식기세척기 사용 불가는 싫어요" 단점 생성 금지 (이미 필터링됨)
- ❌ 예시: 하드필터에서 "신생아용" 선택 → "신생아에게 안 맞는 건 싫어요" 단점 생성 금지 (당연한 말)

**Rule 2. 밸런스 게임 선택과 모순 금지**
- 위 "밸런스 게임 선택 결과"에서 사용자가 ✅ 선택한 옵션과 **반대되는 단점은 절대 생성 금지**
- ❌ 예시: 사용자가 "가벼운 제품" 선택 → "가벼우면 불안해요" 단점 생성 금지
- ❌ 예시: 사용자가 "컴팩트한 크기" 선택 → "작으면 불편해요" 단점 생성 금지

**Rule 3. 단점 옵션 간 중복 금지 (필수!)**
- 생성하는 3~6개의 단점은 **각각 완전히 다른 관점/주제**여야 함
- 같은 속성을 다른 표현으로 반복하면 안 됨
- ❌ 나쁜 예: "세척이 어려워요" + "닦기 힘들어요" + "청소하기 번거로워요" (모두 세척 관련 → 1개만 선택)
- ❌ 나쁜 예: "무거워요" + "들기 힘들어요" (같은 무게 관련 → 1개만 선택)
- ✅ 좋은 예: "세척이 복잡해요" + "소재가 불안해요" + "소음이 커요" + "내구성이 약해요" (각각 다른 관점)

형식 요구사항:
- label: **구체적인 상황과 걱정 포인트가 담긴 문장** (25~45자)
  단순 키워드 나열보다는 부모가 실제로 걱정할 법한 상황을 구체적으로 묘사하세요.
  ✅ 올바른 예: "출수구에 물이 고여 세균이 번식할까 봐 걱정돼요"
  ✅ 올바른 예: "부품이 너무 많아 매번 세척하기 번거로운 건 싫어요"
  ✅ 올바른 예: "플라스틱 변형이나 변색이 생길까 봐 찝찝해요"
- target_rule_key: 영문 소문자+언더스코어 (각 옵션마다 **서로 다른 고유한 키** 필수)
- exclude_mode: "drop_if_has"

═══════════════════════════════════════
📤 응답 형식 (JSON만 출력)
═══════════════════════════════════════

{
  "negative_filter_options": [
    {
      "id": "neg_${insights.category_key}_01",
      "label": "구체적인 상황과 걱정 포인트가 담긴 문장 (25~45자)",
      "target_rule_key": "con_rule_key",
      "exclude_mode": "drop_if_has"
    }
  ]
}

JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;

  } else {
    // 'all' 모드: 기존과 동일 (둘 다 생성)
    prompt = `당신은 ${insights.category_name} 구매 상담 전문가입니다.
사용자가 하드필터로 후보군을 좁힌 상태입니다. 이제 **후보군 상품들을 직접 분석**해서 의미있는 질문을 생성해주세요.

═══════════════════════════════════════
👤 사용자가 이미 선택한 조건 (하드필터)
═══════════════════════════════════════
${userContextText}${multiSelectWarning}

═══════════════════════════════════════
🎮 사용자가 밸런스 게임에서 선택한 결과
═══════════════════════════════════════
${balanceSelectionsText}

═══════════════════════════════════════
📦 현재 후보군 상품 (하드필터 통과)
═══════════════════════════════════════
${productsText}

═══════════════════════════════════════
💡 참고: 이 카테고리의 일반적인 트레이드오프
═══════════════════════════════════════
${tradeoffsText}

═══════════════════════════════════════
⚠️ 참고: 이 카테고리의 주요 단점/불만 (리뷰 기반)
═══════════════════════════════════════
${consText}

═══════════════════════════════════════
🎯 생성 규칙 (매우 중요!)
═══════════════════════════════════════

**[공통 규칙]**
1. ❌ 가격/예산 관련 질문 절대 금지 (따로 필터링함)
2. 전문용어나 일상에서 안 쓰는 단어는 풀어서 설명
   예: "PPSU(열에 강한 플라스틱) 소재", "BPA-free(환경호르몬 없는)"
3. 초보 부모도 바로 이해할 수 있는 쉬운 말로 작성

**[밸런스 게임 질문 - 1~3개]**

⚠️ **Rule 1. 하드필터 중복 질문 절대 금지**
위 '사용자가 이미 선택한 조건(하드필터)'을 확인하세요. 사용자가 이미 명확히 의사를 밝힌 속성은 밸런스 게임에서 다시 묻지 마세요.
- ❌ 상황: 하드필터에서 "가벼운 무게(휴대용)"를 이미 선택함
- ❌ 금지된 질문: "가벼움 vs 튼튼함" (사용자는 이미 가벼움을 선택했으므로 이 질문은 불필요)
- ✅ 행동: 이미 선택된 속성과 관련된 트레이드오프는 건너뛰고, 아직 결정하지 않았지만 구매에 중요한 다른 속성을 물어보세요.

⚠️ **Rule 1-1. 복수 선택 속성 처리 (중요!)**
위 "⚠️ 복수 선택된 속성"을 확인하세요. 사용자가 같은 질문에서 2개 이상 선택한 경우 "둘 다 괜찮아요"라는 의미입니다.
- ❌ 상황: 하드필터에서 "PPSU + 유리" 둘 다 선택, 또는 "브랜드A + 브랜드B" 둘 다 선택
- ❌ 금지된 질문: 해당 속성의 트레이드오프를 그냥 물어보기 (예: "플라스틱 vs 유리")
- ✅ **올바른 행동**:
  1. 다른 질문이 충분하면(2개 이상) → 해당 트레이드오프 질문 생략
  2. 다른 질문이 부족하면(1개 이하) → 질문을 변형하여 포함:
     - option_A.text와 option_B.text 앞에 "둘 다 좋다고 하셨는데, 정말 하나만 고르자면 " 추가
     - 예: "둘 다 좋다고 하셨는데, 정말 하나만 고르자면 가벼운 플라스틱이 더 끌려요"

⚠️ **Rule 2. 물리적/직관적 트레이드오프만 허용 (Strong)**
부모들이 실제로 고민하는 **물리적/구조적 상반 관계**만 질문하세요. 기술적으로 둘 다 만족시킬 수 있는 "좋은 기능 vs 좋은 기능"은 가짜 트레이드오프입니다.

- ❌ **나쁜 예**
  - "빠른 흡수 vs 많은 흡수량" (좋은 기저귀는 둘 다 잘함)
  - "안전성 vs 디자인"
  - "모유실감 vs 배앓이 방지" (둘 다 되는 젖병 많음)

- ✅ **좋은 예 (직관적으로 두 개의 선택지가 반대된다는 것이 느껴져야 함)
  - "가벼움(휴대성) vs 튼튼함(안정감)" (물리적으로 가벼우면 흔들림이 있을 수밖에 없음)
  - "컴팩트한 크기 vs 넉넉한 내부 공간" (작으면 좁을 수밖에 없음)
  - "세척이 쉬운 단순 구조 vs 기능이 많은 복잡 구조" (기능이 많으면 부품이 많아 세척이 귀찮음)
  - "깨지지 않는 플라스틱 vs 위생적인 유리" (소재의 고유 특성)

형식 요구사항:
- type: "tradeoff" (기본)
- title: 상반 관계가 명확히 드러나는 제목 (예: "무게 vs 안정감")
- option_A.text: **A를 선택하면 B를 포기해야 함이 암시된 문장** (30~50자)
  예: "무겁더라도 흔들림 없이 안정적인 게 좋아요"
- option_B.text: **B를 선택하면 A를 포기해야 함이 암시된 문장** (30~50자)
  예: "좀 흔들려도 가볍고 들고 다니기 편한 게 좋아요"
- target_rule_key: 영문 소문자+언더스코어 (⚠️ 필수: A와 B는 서로 다른 고유한 키여야 함)

**[단점 필터 옵션 - 3~6개]**

후보군 상품들을 분석해서, **일부 제품에만 해당하는 단점**만 필터로 제시하세요.
전체 후보군이 다 해당하는 단점은 필터링 의미가 없으니 제외!

⚠️ **충돌/중복 방지 규칙 (매우 중요!)**:

**Rule 1. 이미 선택한 조건과 중복/모순 금지**
- 위 "하드필터"에서 사용자가 이미 선택한 조건(하위카테고리, 체감속성, 스펙 필터)과 **같은 내용을 다시 묻거나 반대되는 단점 생성 금지**
- ❌ 예시: 하드필터에서 "PPSU 소재" 선택 → "플라스틱 소재가 걱정돼요" 단점 생성 금지
- ❌ 예시: 하드필터에서 "식기세척기 사용 가능" 선택 → "식기세척기 사용 불가는 싫어요" 단점 생성 금지 (이미 필터링됨)

**Rule 2. 밸런스 게임 선택과 모순 금지**
- 위 "밸런스 게임 선택 결과"에서 사용자가 ✅ 선택한 옵션과 **반대되는 단점은 절대 생성 금지**
- ❌ 예시: 사용자가 "가벼운 제품" 선택 → "가벼우면 불안해요" 단점 생성 금지
- ❌ 예시: 사용자가 "컴팩트한 크기" 선택 → "작으면 불편해요" 단점 생성 금지

**Rule 3. 단점 옵션 간 중복 금지 (필수!)**
- 생성하는 3~6개의 단점은 **각각 완전히 다른 관점/주제**여야 함
- 같은 속성을 다른 표현으로 반복하면 안 됨
- ❌ 나쁜 예: "세척이 어려워요" + "닦기 힘들어요" + "청소하기 번거로워요" (모두 세척 관련 → 1개만 선택)
- ✅ 좋은 예: "세척이 복잡해요" + "소재가 불안해요" + "소음이 커요" + "내구성이 약해요" (각각 다른 관점)

형식 요구사항:
- label: **구체적인 상황과 걱정 포인트가 담긴 문장** (25~45자)
  단순 키워드 나열보다는 부모가 실제로 걱정할 법한 상황을 구체적으로 묘사하세요.
  ✅ 올바른 예: "출수구에 물이 고여 세균이 번식할까 봐 걱정돼요"
  ✅ 올바른 예: "부품이 너무 많아 매번 세척하기 번거로운 건 싫어요"
  ✅ 올바른 예: "플라스틱 변형이나 변색이 생길까 봐 찝찝해요"
- target_rule_key: 영문 소문자+언더스코어 (각 옵션마다 **서로 다른 고유한 키** 필수)
- exclude_mode: "drop_if_has"

═══════════════════════════════════════
📤 응답 형식 (JSON만 출력)
═══════════════════════════════════════

{
  "balance_questions": [
    {
      "id": "bg_${insights.category_key}_01",
      "type": "tradeoff",
      "title": "A vs B",
      "option_A": { "text": "상황+이유가 담긴 구체적 문장 (30~50자)", "target_rule_key": "rule_key_a" },
      "option_B": { "text": "상황+이유가 담긴 구체적 문장 (30~50자)", "target_rule_key": "rule_key_b" }
    }
  ],
  "negative_filter_options": [
    {
      "id": "neg_${insights.category_key}_01",
      "label": "구체적인 상황과 걱정 포인트가 담긴 문장 (25~45자)",
      "target_rule_key": "con_rule_key",
      "exclude_mode": "drop_if_has"
    }
  ]
}

JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;
  }

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const parsed = parseJSONResponse(responseText) as {
    balance_questions?: BalanceQuestion[];
    negative_filter_options?: NegativeFilterOption[];
  };

  // 밸런스 게임 질문 유효성 검사 및 보정
  if (parsed.balance_questions) {
    parsed.balance_questions = parsed.balance_questions.map(q => {
      // ⚠️ target_rule_key가 누락된 경우 fallback 생성
      if (!q.option_A.target_rule_key) q.option_A.target_rule_key = `rule_A_${Math.random().toString(36).substring(2, 7)}`;
      if (!q.option_B.target_rule_key) q.option_B.target_rule_key = `rule_B_${Math.random().toString(36).substring(2, 7)}`;

      // A와 B의 키가 같으면 B의 키를 강제로 변경 (UI 버그 방지)
      if (q.option_A.target_rule_key === q.option_B.target_rule_key) {
        console.warn(`[generate-questions] Duplicate rule keys detected for question: ${q.title}`);
        q.option_B.target_rule_key = `${q.option_B.target_rule_key}_alt`;
      }
      return q;
    });
  }

  // 모드에 따라 빈 배열로 초기화
  return {
    balance_questions: parsed.balance_questions || [],
    negative_filter_options: parsed.negative_filter_options || [],
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateQuestionsResponse>> {
  try {
    const body: GenerateQuestionsRequest = await request.json();
    const { categoryKey, hardFilterAnswers = {}, filteredProducts = [], balanceSelections = [], generate = 'all', selectedSubCategories = [] } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    if (!insights) {
      return NextResponse.json(
        { success: false, error: `Category insights not found for: ${categoryKey}` },
        { status: 404 }
      );
    }

    let balance_questions: BalanceQuestion[];
    let negative_filter_options: NegativeFilterOption[];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    // LLM 사용: 후보군이 있고 Gemini가 사용 가능할 때
    const hasProducts = filteredProducts.length > 0;

    if (hasProducts && isGeminiAvailable()) {
      try {
        console.log(`[generate-questions] Generating with LLM for ${categoryKey}, mode=${generate}, ${filteredProducts.length} products, ${balanceSelections.length} balance selections`);

        const llmResult = await callGeminiWithRetry(
          () => generateQuestionsWithLLM(insights, hardFilterAnswers, filteredProducts, balanceSelections, generate, selectedSubCategories),
          2, // 최대 2번 재시도
          1000
        );

        balance_questions = llmResult.balance_questions || [];
        negative_filter_options = llmResult.negative_filter_options || [];
        generated_by = 'llm';

        console.log(`[generate-questions] LLM generated ${balance_questions.length} balance questions, ${negative_filter_options.length} negative filters`);
      } catch (llmError) {
        console.error('[generate-questions] LLM failed, using fallback:', llmError);
        // Fallback to static conversion
        balance_questions = insights.tradeoffs.slice(0, 3).map((t, i) =>
          tradeoffToBalanceQuestion(t, i, categoryKey)
        );
        negative_filter_options = insights.cons.slice(0, 5).map((c, i) =>
          conToNegativeFilter(c, i, categoryKey)
        );
      }
    } else {
      // LLM 없거나 후보군 정보 없을 때 fallback
      const reason = !hasProducts ? 'no products provided' : 'Gemini not available';
      console.log(`[generate-questions] Using fallback for ${categoryKey} (${reason})`);

      balance_questions = insights.tradeoffs.slice(0, 3).map((t, i) =>
        tradeoffToBalanceQuestion(t, i, categoryKey)
      );
      negative_filter_options = insights.cons.slice(0, 5).map((c, i) =>
        conToNegativeFilter(c, i, categoryKey)
      );
    }

    // 가이드 정보
    const guide = insights.guide || {
      title: `${insights.category_name} 선택 가이드`,
      summary: '',
      key_points: [],
      trend: '',
    };

    return NextResponse.json({
      success: true,
      data: {
        category_key: categoryKey,
        category_name: insights.category_name,
        guide,
        balance_questions,
        negative_filter_options,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[generate-questions] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}

/**
 * GET: 특정 카테고리의 기본 질문 조회 (LLM 없이)
 */
export async function GET(request: NextRequest): Promise<NextResponse<GenerateQuestionsResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const categoryKey = searchParams.get('categoryKey');

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey query parameter is required' },
        { status: 400 }
      );
    }

    const insights = await loadCategoryInsights(categoryKey);
    if (!insights) {
      return NextResponse.json(
        { success: false, error: `Category insights not found for: ${categoryKey}` },
        { status: 404 }
      );
    }

    // Static conversion (no LLM)
    const balance_questions = insights.tradeoffs.slice(0, 3).map((t, i) =>
      tradeoffToBalanceQuestion(t, i, categoryKey)
    );
    const negative_filter_options = insights.cons.slice(0, 5).map((c, i) =>
      conToNegativeFilter(c, i, categoryKey)
    );

    const guide = insights.guide || {
      title: `${insights.category_name} 선택 가이드`,
      summary: '',
      key_points: [],
      trend: '',
    };

    return NextResponse.json({
      success: true,
      data: {
        category_key: categoryKey,
        category_name: insights.category_name,
        guide,
        balance_questions,
        negative_filter_options,
        generated_by: 'fallback',
      },
    });
  } catch (error) {
    console.error('[generate-questions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get questions' },
      { status: 500 }
    );
  }
}
