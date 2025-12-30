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

// Request body type
interface GenerateQuestionsRequest {
  categoryKey: string;
  hardFilterAnswers?: Record<string, string[]>;
  filteredProducts?: ProductItem[];  // 후보군 상품 (스펙 분석용)
  filteredProductCount?: number;  // deprecated, filteredProducts.length 사용
  balanceSelections?: BalanceSelection[];  // 밸런스 게임 선택값 (단점 필터 충돌 방지용)
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
  balanceSelections: BalanceSelection[] = []
): Promise<{
  balance_questions: BalanceQuestion[];
  negative_filter_options: NegativeFilterOption[];
}> {
  const model = getModel(0.5); // 약간의 창의성 허용

  // 후보군 상품 리스트 직접 포맷 (LLM이 분석할 수 있도록)
  const productsText = formatProductsForLLM(filteredProducts, 25);

  // 사용자 컨텍스트 문자열 생성
  const userContextText = Object.entries(hardFilterAnswers)
    .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
    .join('\n') || '(선택된 조건 없음)';

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

  const prompt = `당신은 ${insights.category_name} 구매 상담 전문가입니다.
사용자가 하드필터로 후보군을 좁힌 상태입니다. 이제 **후보군 상품들을 직접 분석**해서 의미있는 질문을 생성해주세요.

═══════════════════════════════════════
👤 사용자가 이미 선택한 조건 (하드필터)
═══════════════════════════════════════
${userContextText}

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
1. ❌ 가격/예산 관련 질문 절대 금지 (예산은 마지막에 따로 필터링함)
2. 전문용어나 일상에서 안 쓰는 단어는 소괄호로 풀어서 설명
   예: "PPSU(열에 강한 플라스틱) 소재", "BPA-free(환경호르몬 없는)"
3. 초보 부모도 바로 이해할 수 있는 쉬운 말로 작성

**[밸런스 게임 질문 - 1~3개]**

후보군 상품을 분석해서 **정말 핵심적인** 질문을 생성하세요:

**기본 원칙: "tradeoff" (상반 관계) 우선**
- A를 선택하면 B를 포기해야 하는 관계
- 예: "가벼운 소재 → 내구성 약함" vs "튼튼한 소재 → 무거움"
- 후보군에서 A 특성 제품과 B 특성 제품이 명확히 나뉘어야 함
- ❌ 잘못된 예: "모유실감 좋음 vs 배앓이 방지 좋음" (둘 다 가능한 제품 있음)

**후보가 많을 때: "priority" (우선순위) 추가 가능**
- 둘 다 좋지만 뭐가 더 중요한지 (후보 줄이기용)

형식 요구사항:
- type: "tradeoff" 또는 "priority"
- title: 핵심 대비를 담은 제목 (예: "가벼움 vs 튼튼함")
- option_A.text: **상황+이유가 담긴 구체적 문장** (30~50자)
  예시: "매일 외출이 잦아서 가볍고 들고 다니기 편한 게 좋아요"
  예시: "아기가 잘 떨어뜨려서 깨지지 않는 튼튼한 소재가 필요해요"
- option_B.text: **상황+이유가 담긴 구체적 문장** (30~50자)
- target_rule_key: 영문 소문자+언더스코어 (예: "lightweight", "durable_material")

**[단점 필터 옵션 - 3~6개]**

후보군 상품들을 분석해서, **일부 제품에만 해당하는 단점**만 필터로 제시하세요.
전체 후보군이 다 해당하는 단점은 필터링 의미가 없으니 제외!

⚠️ **충돌 방지 규칙 (매우 중요!)**:
- 위 "밸런스 게임 선택 결과"에서 사용자가 ✅ 선택한 옵션과 **반대되는 단점은 절대 생성 금지**
- 예시: 사용자가 "2단계 기저귀" 선택 → "2단계는 싫어요" 단점 생성 ❌
- 예시: 사용자가 "가벼운 제품" 선택 → "가벼우면 불안해요" 단점 생성 ❌

형식 요구사항:
- label: **핵심 단어 조합** (15~25자) - 완결된 문장 ❌, 키워드 나열 ✅
  ❌ 잘못된 예: "출수구에 물이 고여 세균 증식이 우려되는 건 걱정돼요"
  ✅ 올바른 예: "출수구에 물이 고여 세균 증식 우려됨"
  ❌ 잘못된 예: "초기 구매 비용이 높아서 부담되는 건 피하고 싶어요"
  ✅ 올바른 예: "초기 구매 비용이 너무 높아 부담됨"
  ❌ 잘못된 예: "세척할 때 손이 안 들어가서 닦기 어려운 건 싫어요"
  ✅ 올바른 예: "입구가 좁아 손이 안 들어가 세척 불편함"
- target_rule_key: 영문 소문자+언더스코어
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
      "label": "구체적인 상황이 담긴 단점 문장 (25~40자)",
      "target_rule_key": "con_rule_key",
      "exclude_mode": "drop_if_has"
    }
  ]
}

JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  return parseJSONResponse(responseText);
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateQuestionsResponse>> {
  try {
    const body: GenerateQuestionsRequest = await request.json();
    const { categoryKey, hardFilterAnswers = {}, filteredProducts = [], balanceSelections = [] } = body;

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
        console.log(`[generate-questions] Generating with LLM for ${categoryKey}, ${filteredProducts.length} products, ${balanceSelections.length} balance selections`);

        const llmResult = await callGeminiWithRetry(
          () => generateQuestionsWithLLM(insights, hardFilterAnswers, filteredProducts, balanceSelections),
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
