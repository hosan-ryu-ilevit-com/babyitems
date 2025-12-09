/**
 * V2 동적 질문 생성 API
 * POST /api/v2/generate-questions
 *
 * category-insights 데이터를 기반으로 LLM이 동적으로 질문을 생성합니다.
 * - 밸런스 게임 (AB) 질문: tradeoffs 기반
 * - 단점 필터 질문: cons 기반
 *
 * 입력:
 * - categoryKey: 카테고리 키
 * - hardFilterAnswers: 하드필터 응답 (사용자 컨텍스트용)
 * - filteredProductCount: 현재 필터링된 상품 수 (선택적)
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

// Request body type
interface GenerateQuestionsRequest {
  categoryKey: string;
  hardFilterAnswers?: Record<string, string[]>;
  filteredProductCount?: number;
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
 */
async function generateQuestionsWithLLM(
  insights: CategoryInsights,
  hardFilterAnswers: Record<string, string[]>,
  filteredProductCount: number
): Promise<{
  balance_questions: BalanceQuestion[];
  negative_filter_options: NegativeFilterOption[];
}> {
  const model = getModel(0.5); // 적당한 창의성

  // 사용자 컨텍스트 문자열 생성
  const userContext = Object.entries(hardFilterAnswers)
    .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
    .join('\n');

  // Tradeoffs 문자열 생성
  const tradeoffsText = insights.tradeoffs
    .map((t, i) => `${i + 1}. "${t.title}": A) ${t.option_a.text} vs B) ${t.option_b.text}`)
    .join('\n');

  // Cons 문자열 생성 (상위 8개)
  const consText = insights.cons
    .slice(0, 8)
    .map((c, i) => `${i + 1}. (${c.mention_rate}%) ${c.text}${c.deal_breaker_for ? ` [치명적: ${c.deal_breaker_for}]` : ''}`)
    .join('\n');

  const prompt = `당신은 ${insights.category_name} 전문가입니다.
사용자의 상황에 맞는 질문을 생성해주세요.

## 카테고리: ${insights.category_name}
## 현재 후보 상품 수: ${filteredProductCount}개

## 사용자가 선택한 조건:
${userContext || '(아직 선택 없음)'}

## 이 카테고리의 주요 트레이드오프:
${tradeoffsText}

## 이 카테고리의 주요 단점/우려사항 (언급률 순):
${consText}

## 생성 규칙:
1. 밸런스 게임 질문 3개:
   - 사용자 상황에 가장 관련 있는 트레이드오프 선택
   - 선택지는 짧고 구체적으로 (15자 이내)
   - target_rule_key는 영문 소문자와 언더스코어만 사용

2. 단점 필터 옵션 4~5개:
   - 사용자 상황에서 치명적일 수 있는 단점 선택
   - 라벨은 20자 이내로 간결하게
   - 사용자가 체크하면 해당 단점이 있는 제품을 제외

## 응답 JSON 형식:
{
  "balance_questions": [
    {
      "id": "bg_${insights.category_key}_01",
      "title": "질문 제목",
      "option_A": { "text": "선택지A", "target_rule_key": "rule_key_a" },
      "option_B": { "text": "선택지B", "target_rule_key": "rule_key_b" }
    }
  ],
  "negative_filter_options": [
    {
      "id": "neg_${insights.category_key}_01",
      "label": "이건 피하고 싶어요",
      "target_rule_key": "rule_key",
      "exclude_mode": "drop_if_has"
    }
  ]
}

JSON만 응답하세요.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  return parseJSONResponse(responseText);
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateQuestionsResponse>> {
  try {
    const body: GenerateQuestionsRequest = await request.json();
    const { categoryKey, hardFilterAnswers = {}, filteredProductCount = 100 } = body;

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

    // LLM 사용 가능 여부 확인
    if (isGeminiAvailable()) {
      try {
        const llmResult = await callGeminiWithRetry(
          () => generateQuestionsWithLLM(insights, hardFilterAnswers, filteredProductCount),
          2, // 최대 2번 재시도
          1000
        );

        balance_questions = llmResult.balance_questions || [];
        negative_filter_options = llmResult.negative_filter_options || [];
        generated_by = 'llm';

        console.log(`[generate-questions] LLM generated ${balance_questions.length} balance questions, ${negative_filter_options.length} negative filters for ${categoryKey}`);
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
      // LLM 없을 때 fallback
      console.log(`[generate-questions] Gemini not available, using fallback for ${categoryKey}`);
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
