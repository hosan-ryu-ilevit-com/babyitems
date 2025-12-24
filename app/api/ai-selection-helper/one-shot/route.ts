/**
 * One-Shot AI Selection API
 * 자연어 입력만으로 모든 필터를 한 번에 AI가 선택
 *
 * POST /api/ai-selection-helper/one-shot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import logicMapData from '@/data/rules/logic_map.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import { generateHardFiltersForCategory } from '@/lib/recommend-v2/danawaFilters';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import type {
  CategoryLogicMap,
  CategoryBalanceGame,
  CategoryNegativeFilter,
  BalanceQuestion,
  NegativeFilterOption,
} from '@/types/rules';
import type { HardFilterQuestion, ClarifyingAnswer, CollectedInsight } from '@/types/recommend-v2';

interface OneShotRequest {
  categoryKey: string;
  categoryName: string;
  userContext: string;
  subCategoryCode?: string;
  // Clarifying Questions에서 수집된 추가 정보
  clarifyingAnswers?: ClarifyingAnswer[];
  collectedInsights?: CollectedInsight[];
}

interface OneShotResponse {
  hardFilterSelections: Record<string, string[]>;
  balanceGameSelections: Record<string, 'A' | 'B' | 'both'>;
  negativeFilterSelections: string[];
  selectionReasons: {
    hardFilters: Record<string, string>;
    balanceGames: Record<string, string>;
    negativeFilters: string;
  };
  overallReasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function POST(request: NextRequest) {
  try {
    const body: OneShotRequest = await request.json();
    const { categoryKey, categoryName, userContext, subCategoryCode, clarifyingAnswers, collectedInsights } = body;

    // 유효성 검사
    if (!userContext || userContext.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: '상황을 조금 더 자세히 알려주세요.' },
        { status: 400 }
      );
    }

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: '카테고리가 필요합니다.' },
        { status: 400 }
      );
    }

    // Rules 데이터 로드
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const balanceGame = balanceGameData as { scenarios: Record<string, CategoryBalanceGame> };
    const negativeFilter = negativeFilterData as { filters: Record<string, CategoryNegativeFilter> };

    const categoryLogic = logicMap[categoryKey];
    if (!categoryLogic) {
      return NextResponse.json(
        { success: false, error: `카테고리 '${categoryKey}'를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // 하드필터 질문 로드
    const targetCategoryCodes = subCategoryCode ? [subCategoryCode] : undefined;
    const hardFilterQuestions = await generateHardFiltersForCategory(categoryKey, targetCategoryCodes);

    // 디버깅: 로드된 하드필터 질문 확인 (특히 review_priorities)
    const reviewQuestions = hardFilterQuestions.filter(q => q.type === 'review_priorities');
    console.log(`[OneShot] Loaded ${hardFilterQuestions.length} hard filters. Review priorities: ${reviewQuestions.length}`);
    if (reviewQuestions.length > 0) {
      console.log('[OneShot] First review question options:', JSON.stringify(reviewQuestions[0].options.map(o => ({ v: o.value, l: o.label }))));
    }

    // 밸런스게임 질문 로드
    const categoryBalance = balanceGame.scenarios[categoryKey];
    const balanceQuestions: BalanceQuestion[] = categoryBalance?.questions || [];

    // 단점필터 옵션 로드
    const categoryNegative = negativeFilter.filters[categoryKey];
    const negativeOptions: NegativeFilterOption[] = categoryNegative?.options || [];

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const insightsContext = insights ? `
카테고리 인사이트:
- 가이드: ${JSON.stringify(insights.guide || {})}
- 주요 장점들: ${JSON.stringify((insights.pros || []).slice(0, 3))}
- 주요 단점들: ${JSON.stringify((insights.cons || []).slice(0, 3))}
- 일반적인 고민: ${JSON.stringify(insights.question_context?.common_concerns || [])}
` : '';

    // 프롬프트 구성
    const systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 분석하여 모든 선택 과정을 한 번에 수행하고, **각 선택에 대한 개별적인 이유**도 함께 제공해주세요.

**입력 정보:**
1. 사용자 상황 (userContext)
2. 선택해야 할 항목들:
   - 하드 필터 (hardFilterQuestions): 필수 선택 조건들
   - 밸런스 게임 (balanceQuestions): 선호도/가치관 파악
   - 기피하는 단점 (negativeOptions): 피하고 싶은 제품 특징

**중요 규칙:**
1. **상황 분석 및 신뢰도 판단 (CRITICAL):** 
   - 사용자의 입력(userContext)이 육아용품 추천과 관련이 없거나, 무의미한 문자열(예: 'asdf', 'ㄱㄱㄱ', '테스트' 등), 혹은 정보가 너무 부족하여 상황을 유추할 수 없는 경우, 반드시 **confidence를 "low"**로 설정하세요.
   - 이 경우 overallReasoning에 "입력하신 내용으로는 구체적인 상황을 파악하기 어려워요. 아기의 월령이나 고민되는 점을 조금 더 자세히 말씀해 주시면 딱 맞는 제품을 찾아드릴게요!"라고 작성하세요.
   - 억지로 추천 이유를 지어내거나 높은 확신을 보이지 마세요.
2. **모든 질문에 대해 답변을 생성해야 합니다.** (건너뛰기 금지)
3. **하드 필터:** 각 질문(id)에 대해 적절한 옵션(value)들을 선택하세요. (복수 선택 가능)
4. **밸런스 게임:** 각 질문(id)에 대해 "A", "B", "both" 중 하나를 선택하세요. "both"는 정말 애매할 때만 사용하세요.
5. **기피하는 단점:** 사용자 상황에서 꼭 피해야 할 단점들의 key 값을 리스트로 반환하세요. **반드시 아래 제공된 옵션의 "key" 값 그대로 사용하세요** (예: "체감속성_위생적인_올실리콘"). 없으면 빈 리스트 [].
6. **selectionReasons:** 각 선택에 대한 개별 이유를 **한글로, 1문장으로** 작성하세요.
   - hardFilters: 각 questionId에 대해 왜 그 옵션을 선택했는지
   - balanceGames: 각 questionId에 대해 왜 A/B/both를 선택했는지
   - negativeFilters: 전체적으로 왜 그 단점들을 선택했는지 (또는 선택하지 않았는지)
7. **overallReasoning:** 전체 선택에 대한 3-4문장 요약. "사용자님의 상황(~~)을 고려하여 ~~한 제품 위주로 골라봤어요" 톤으로 작성하세요. **중요: 선택된 조건과 관련된 핵심 키워드(예: 가성비, 안전성, 휴대성 등)는 반드시 **키워드** 형식으로 감싸서 강조해주세요.** 예: "**가성비**와 **휴대성**을 중요하게 생각하시는 것 같아요."
8. **reasoning/overallReasoning 텍스트는 한글로 작성하세요.** reasoning에서 단점을 언급할 때는 label(한글 설명)을 사용하세요. 단, negativeFilterSelections 배열에는 반드시 제공된 key 값(체감속성_XXX 형식)을 그대로 사용하세요.
9. **신뢰도(confidence) 기준:**
   - **high**: 사용자의 상황이 구체적이고(예: "6개월 아기 유모차, 가벼운 것"), 모든 필터 선택에 명확한 근거가 있는 경우.
   - **medium**: 상황은 파악되나 일부 선택에 추측이 필요한 경우.
   - **low**: 입력이 무의미하거나, 너무 짧거나, 카테고리와 전혀 상관없는 이야기를 하는 경우. (이 경우 위 1번 규칙을 따름)

**응답 형식 (JSON):**
{
  "hardFilterSelections": { "questionId1": ["value1", "value2"], ... },
  "balanceGameSelections": { "questionId1": "A", "questionId2": "B", ... },
  "negativeFilterSelections": ["체감속성_XXX", "체감속성_YYY"],  // 반드시 제공된 key 값 그대로 사용!
  "selectionReasons": {
    "hardFilters": { "questionId1": "이유 1문장", ... },
    "balanceGames": { "questionId1": "이유 1문장", ... },
    "negativeFilters": "이유 1-2문장"
  },
  "overallReasoning": "전체 요약 3-4문장",
  "confidence": "high" | "medium" | "low"
}

${insightsContext}`;

    // Clarifying Questions에서 수집된 추가 컨텍스트 구성
    const clarifyingContext = clarifyingAnswers && clarifyingAnswers.length > 0 ? `
**추가 확인 내용 (Clarifying Questions):**
${clarifyingAnswers.map(a => {
  const answer = a.customText
    ? `기타: "${a.customText}"`
    : a.selectedLabel || a.selectedOption || '선택 없음';
  return `Q: ${a.questionText}\nA: ${answer}`;
}).join('\n\n')}
` : '';

    const insightsFromClarifying = collectedInsights && collectedInsights.length > 0 ? `
**파악된 정보:**
${collectedInsights.map(i => `- ${i.type}: ${i.value}`).join('\n')}
` : '';

    const userPrompt = `
**사용자 초기 입력:**
"${userContext}"
${clarifyingContext}
${insightsFromClarifying}
**카테고리:** ${categoryName}

**1. 하드 필터 질문 목록:**
${JSON.stringify(hardFilterQuestions.map(q => ({
  id: q.id,
  question: q.question,
  tip: q.tip, // 질문 힌트 추가
  type: q.type,
  options: q.options.map(o => ({
    value: o.value,
    label: o.displayLabel || o.label, // displayLabel 우선 사용
    reviewKeywords: o.reviewKeywords // 리뷰 키워드 힌트 추가
  }))
})), null, 2)}

**2. 밸런스 게임 질문 목록:**
${JSON.stringify(balanceQuestions.map(q => ({
  id: q.id,
  title: q.title,
  A: q.option_A?.text,
  B: q.option_B?.text
})), null, 2)}

**3. 기피하는 단점 옵션들:**
${JSON.stringify(negativeOptions.map(o => ({
  key: o.target_rule_key,
  label: o.label
})), null, 2)}

위 정보를 바탕으로 최적의 선택을 JSON으로 반환해주세요.
`;

    const model = getModel(0.4);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    console.log('[OneShot] User Context:', userContext);
    console.log('[OneShot] Raw AI Response:', response);

    const parsed = parseJSONResponse<OneShotResponse>(response);

    // 유효성 검증 및 정제
    // 1. 하드필터 선택 검증
    const validatedHardFilterSelections: Record<string, string[]> = {};
    for (const question of hardFilterQuestions) {
      let selections = parsed.hardFilterSelections?.[question.id] || [];
      // AI가 문자열로 반환한 경우 배열로 변환
      if (typeof selections === 'string') {
        selections = [selections];
      }
      if (!Array.isArray(selections)) {
        selections = [];
      }
      const validValues = question.options.map(o => o.value);
      validatedHardFilterSelections[question.id] = selections.filter((s: string) => validValues.includes(s));

      // 선택이 없으면 첫 번째 옵션 기본 선택
      if (validatedHardFilterSelections[question.id].length === 0 && question.options.length > 0) {
        validatedHardFilterSelections[question.id] = [question.options[0].value];
      }
    }

    // 2. 밸런스게임 선택 검증
    const validatedBalanceSelections: Record<string, 'A' | 'B' | 'both'> = {};
    for (const question of balanceQuestions) {
      const selection = parsed.balanceGameSelections[question.id];
      if (selection === 'A' || selection === 'B' || selection === 'both') {
        validatedBalanceSelections[question.id] = selection;
      } else {
        validatedBalanceSelections[question.id] = 'A'; // fallback
      }
    }

    // 3. 단점필터 선택 검증
    const validNegativeKeys = negativeOptions.map(o => o.target_rule_key);
    const originalNegativeSelections = parsed.negativeFilterSelections || [];
    const validatedNegativeSelections = originalNegativeSelections
      .filter(key => validNegativeKeys.includes(key));

    // 디버깅: 단점필터 검증 결과 로깅
    console.log('[OneShot] negativeOptions count:', negativeOptions.length);
    console.log('[OneShot] AI returned negativeFilterSelections:', originalNegativeSelections);
    console.log('[OneShot] Valid negative keys sample:', validNegativeKeys.slice(0, 3));
    const filteredOutNegative = originalNegativeSelections.filter(key => !validNegativeKeys.includes(key));
    if (filteredOutNegative.length > 0) {
      console.log('[OneShot] ⚠️ Negative filter - Filtered OUT (invalid keys):', filteredOutNegative);
    }
    console.log('[OneShot] Final validated negativeFilterSelections:', validatedNegativeSelections);

    // 4. selectionReasons 기본값 설정
    const selectionReasons = {
      hardFilters: parsed.selectionReasons?.hardFilters || {},
      balanceGames: parsed.selectionReasons?.balanceGames || {},
      negativeFilters: parsed.selectionReasons?.negativeFilters || '특별히 피해야 할 단점이 없어 보여요.',
    };

    // 5. 누락된 reason 채우기
    for (const question of hardFilterQuestions) {
      if (!selectionReasons.hardFilters[question.id]) {
        selectionReasons.hardFilters[question.id] = '사용자 상황에 맞는 옵션을 선택했어요.';
      }
    }
    for (const question of balanceQuestions) {
      if (!selectionReasons.balanceGames[question.id]) {
        selectionReasons.balanceGames[question.id] = '사용자 상황에 더 적합한 옵션을 선택했어요.';
      }
    }

    const validatedResponse: OneShotResponse = {
      hardFilterSelections: validatedHardFilterSelections,
      balanceGameSelections: validatedBalanceSelections,
      negativeFilterSelections: validatedNegativeSelections,
      selectionReasons,
      overallReasoning: parsed.overallReasoning || '사용자님의 상황을 고려하여 최적의 제품을 찾아봤어요.',
      confidence: parsed.confidence || 'medium',
    };

    return NextResponse.json({
      success: true,
      data: validatedResponse,
      meta: {
        hardFilterCount: hardFilterQuestions.length,
        balanceGameCount: balanceQuestions.length,
        negativeOptionCount: negativeOptions.length,
      }
    });

  } catch (error) {
    console.error('One-Shot Selection error:', error);
    return NextResponse.json(
      { success: false, error: 'AI 분석에 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
