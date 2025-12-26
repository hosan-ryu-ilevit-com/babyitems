/**
 * Clarifying Questions API
 * 선택지 기반으로 사용자 니즈를 명확화하는 질문 생성
 *
 * B안: 첫 호출에 1-3개 질문을 한번에 생성 (로딩 1회만)
 *
 * POST /api/ai-selection-helper/clarifying-questions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { generateHardFiltersForCategory } from '@/lib/recommend-v2/danawaFilters';
import hardFiltersData from '@/data/rules/hard_filters.json';
import balanceGameData from '@/data/rules/balance_game.json';
import negativeFilterData from '@/data/rules/negative_filter.json';
import type {
  ClarifyingQuestion,
  ClarifyingAnswer,
  CollectedInsight,
} from '@/types/recommend-v2';
import { CATEGORY_BUDGET_RANGES } from '@/types/recommend-v2';

// 카테고리별 가이드 데이터
const categoryGuides = hardFiltersData as Record<string, { guide?: { title: string; points: string[]; trend: string } }>;

// 밸런스 게임 데이터
const balanceScenarios = (balanceGameData as { scenarios: Record<string, { questions: Array<{ title: string; option_A: { text: string }; option_B: { text: string } }> }> }).scenarios;

// 체감속성(단점 필터) 데이터
const negativeFilters = (negativeFilterData as { filters: Record<string, { options: Array<{ label: string; target_rule_key: string }> }> }).filters;

interface BatchQuestionsRequest {
  categoryKey: string;
  categoryName: string;
  initialContext: string;
}

interface AIGeneratedBatchQuestions {
  questions: Array<{
    id: string;
    text: string;
    subtext?: string;
    options: Array<{
      value: string;
      label: string;
      description: string;
    }>;
  }>;
  collectedInsights: CollectedInsight[];
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchQuestionsRequest = await request.json();
    const { categoryKey, categoryName, initialContext } = body;

    // 유효성 검사
    if (!categoryKey || !initialContext) {
      return NextResponse.json(
        { success: false, error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 카테고리 데이터 로드
    const insights = await loadCategoryInsights(categoryKey);
    const guide = categoryGuides[categoryKey]?.guide;
    const balanceQuestions = balanceScenarios[categoryKey]?.questions || [];

    // 하드 필터 질문 로드
    const hardFilterQuestions = await generateHardFiltersForCategory(categoryKey);

    // 체감속성(단점 필터) 로드
    const categoryNegativeOptions = negativeFilters[categoryKey]?.options || [];

    // 하드 필터 질문 컨텍스트 (이 카테고리에서 중요한 스펙 질문들)
    const hardFilterContext = hardFilterQuestions.length > 0 ? `
**이 카테고리의 핵심 선택 기준 (하드 필터):**
${hardFilterQuestions.slice(0, 5).map(q => `- ${q.question}${q.tip ? ` (팁: ${q.tip})` : ''}`).join('\n')}
` : '';

    // 체감속성 컨텍스트 (사용자가 피하고 싶어하는 단점들)
    const negativeContext = categoryNegativeOptions.length > 0 ? `
**이 카테고리에서 사용자들이 자주 걱정하는 점들:**
${categoryNegativeOptions.slice(0, 5).map(opt => `- ${opt.label}`).join('\n')}
` : '';

    // 인사이트 컨텍스트 구성
    const insightsContext = `
**카테고리 인사이트:**
- 가이드: ${guide?.title || categoryName}
- 핵심 포인트: ${guide?.points?.slice(0, 3).join(', ') || ''}
- 트렌드: ${guide?.trend || ''}
${insights ? `- 주요 장점: ${insights.pros?.slice(0, 3).map(p => p.text.slice(0, 50)).join(' / ') || ''}
- 주요 단점: ${insights.cons?.slice(0, 3).map(c => c.text.slice(0, 50)).join(' / ') || ''}` : ''}
- 밸런스 질문 예시: ${balanceQuestions.slice(0, 2).map(q => q.title).join(', ')}
${hardFilterContext}
${negativeContext}`;

    // 프롬프트 구성 - 한번에 1-3개 질문 생성
    const systemPrompt = `당신은 육아용품 전문 컨설턴트입니다. 사용자의 상황을 더 정확히 파악하기 위해 **선택지 기반 질문 1-3개**를 한번에 생성합니다.

**역할:**
- 전문가 컨설턴트처럼 체계적이고 신뢰감 있는 질문
- "~하신가요?", "어떠세요?" 등 정중한 톤 사용

**질문 유형 (우선순위 순):**
1. age (월령): 아기 나이/발달 단계
2. environment (환경): 사용 환경/상황 (집, 외출, 여행 등)
3. pain_point (불편점): 현재 겪고 있는 **구체적인 문제나 불편함** (예: "밤수유 때 소음이 신경 쓰여요", "세척이 번거로워요")
4. priority (우선순위): 중요하게 생각하는 가치 (가격, 안전, 편의 등)
5. spec (스펙): **카테고리의 핵심 선택 기준** (하드 필터 참고)
6. concern (고민): 특별히 걱정되는 점 (체감속성/걱정 포인트 참고)

**중요: 질문 생성 시 아래 카테고리 정보를 적극 활용하세요:**
- "핵심 선택 기준 (하드 필터)": 이 카테고리에서 가장 중요한 스펙 질문들
- "사용자들이 자주 걱정하는 점들": 이 카테고리 구매 시 흔한 고민거리
- 이 정보들을 기반으로 선택지를 구성하면 더 의미있는 질문이 됩니다.

**중요 규칙:**
1. 사용자의 초기 입력(initialContext)에서 **이미 파악된 정보는 다시 묻지 마세요.**
   - 예: "6개월 아기" → age 질문 불필요
   - 예: "가벼운 게 좋아요" → priority(휴대성) 이미 파악됨
2. 선택지는 2-3개로 제한하세요. ("기타" 옵션은 프론트에서 자동 추가됨)
3. 각 선택지에는 label(짧은 텍스트)과 description(부연설명)을 포함하세요.
4. **질문은 1~4개**를 생성하세요. (너무 적으면 사용자 니즈 파악이 어렵습니다)
5. 초기 입력이 매우 상세하더라도 최소 1개 질문은 생성하세요.
6. 중복된 유형의 질문은 생성하지 마세요 (age 질문 2개 금지).
7. **절대 금지: "기존 제품 만족 여부"만 묻는 질문** - "만족해요/불만족해요"는 기존 제품이 뭔지 모르면 정보량이 0입니다. 대신 **구체적인 불편점/문제점**을 물어보세요.

**collectedInsights 추출:**
- 초기 입력에서 파악 가능한 정보를 정리
- type: 'age' | 'environment' | 'concern' | 'priority' | 'budget' | 'experience'
- source: 'initial'

**응답 형식 (JSON):**
{
  "questions": [
    {
      "id": "age_1",
      "text": "질문 내용 (30자 이내)",
      "subtext": "부연 설명 (선택, 40자 이내)",
      "options": [
        { "value": "option1", "label": "레이블1", "description": "설명1 (30자 이내)" },
        { "value": "option2", "label": "레이블2", "description": "설명2 (30자 이내)" }
      ]
    }
  ],
  "collectedInsights": [
    { "type": "age", "value": "6개월", "source": "initial" }
  ]
}`;

    const userPrompt = `
**카테고리:** ${categoryName}

**사용자 초기 입력:**
"${initialContext}"

${insightsContext}

위 정보를 바탕으로:
1. 초기 입력에서 파악 가능한 정보를 collectedInsights에 정리하세요.
2. 아직 파악되지 않은 중요한 정보를 묻는 질문 2~3개를 생성하세요.
3. 최소 2개 질문은 생성하세요.

JSON으로 응답하세요.`;

    const model = getModel(0.4);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    console.log('[ClarifyingQuestions] Batch generation');
    console.log('[ClarifyingQuestions] Initial Context:', initialContext);
    console.log('[ClarifyingQuestions] Raw AI Response:', response);

    const parsed = parseJSONResponse<AIGeneratedBatchQuestions>(response);

    // 🔧 예산 질문 (카테고리별 동적 생성)
    const budgetRange = CATEGORY_BUDGET_RANGES[categoryKey] || { min: 10000, max: 500000 };
    const { min, max } = budgetRange;

    // 가격 포맷팅 헬퍼
    const formatPrice = (price: number) => {
      if (price >= 10000) {
        return `${Math.round(price / 10000)}만원`;
      }
      return `${price.toLocaleString()}원`;
    };

    // 카테고리 가격대에 따른 4구간 옵션 생성
    const range = max - min;
    const q1 = min + range * 0.25;
    const q2 = min + range * 0.5;
    const q3 = min + range * 0.75;

    const budgetQuestion: ClarifyingQuestion = {
      id: 'budget_fixed',
      text: '예산은 어느 정도 생각하고 계신가요?',
      subtext: `${categoryName} 평균 가격대 기준`,
      options: [
        {
          value: 'budget_low',
          label: `${formatPrice(min)}~${formatPrice(q1)}`,
          description: '가성비 좋은 제품 위주'
        },
        {
          value: 'budget_mid',
          label: `${formatPrice(q1)}~${formatPrice(q2)}`,
          description: '인기 있는 가격대'
        },
        {
          value: 'budget_high',
          label: `${formatPrice(q2)}~${formatPrice(q3)}`,
          description: '검증된 브랜드 제품'
        },
        {
          value: 'budget_premium',
          label: `${formatPrice(q3)} 이상`,
          description: '프리미엄 제품'
        },
      ],
    };

    // 유효성 검증
    if (!parsed.questions || parsed.questions.length === 0) {
      // AI가 질문을 생성하지 못한 경우 - 예산 질문만 반환
      return NextResponse.json({
        success: true,
        data: {
          questions: [budgetQuestion],
          collectedInsights: parsed.collectedInsights || [],
        }
      });
    }

    // 질문 객체들 구성 (최대 3개로 제한) + 예산 질문 추가
    const aiQuestions: ClarifyingQuestion[] = parsed.questions.slice(0, 3).map(q => ({
      id: q.id,
      text: q.text,
      subtext: q.subtext,
      options: q.options.map(opt => ({
        value: opt.value,
        label: opt.label,
        description: opt.description || '',
      })),
    }));

    // AI 생성 질문 + 예산 질문
    const questions = [...aiQuestions, budgetQuestion];

    return NextResponse.json({
      success: true,
      data: {
        questions,
        collectedInsights: parsed.collectedInsights || [],
      }
    });

  } catch (error) {
    console.error('Clarifying Questions error:', error);
    return NextResponse.json(
      { success: false, error: '질문 생성에 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
