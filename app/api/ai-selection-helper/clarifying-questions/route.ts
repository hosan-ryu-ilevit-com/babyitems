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

// 🔧 단계/사이즈 기반 카테고리 (개월 정보 필수)
// 이 카테고리들은 제품 필터링에 아기 개월/단계 정보가 반드시 필요함
const STAGE_BASED_CATEGORIES: Record<string, {
  question: string;
  subtext: string;
  options: Array<{ value: string; label: string; description: string }>;
}> = {
  diaper: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '사이즈/타입 추천에 필요해요',
    options: [
      { value: 'newborn', label: '신생아 (0~1개월)', description: '밴드형 NB/1단계' },
      { value: '2_6months', label: '2~6개월', description: '밴드형 2~3단계' },
      { value: '7_12months', label: '7~12개월', description: '팬티형 전환 시기' },
      { value: 'over_12months', label: '12개월 이상', description: '팬티형 4단계 이상' },
    ],
  },
  formula: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '분유 단계 추천에 필요해요',
    options: [
      { value: 'stage1', label: '0~6개월', description: '1단계 분유' },
      { value: 'stage2', label: '6~12개월', description: '2단계 분유' },
      { value: 'stage3', label: '12개월 이상', description: '3단계 분유' },
    ],
  },
  pacifier: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '쪽쪽이 사이즈 추천에 필요해요',
    options: [
      { value: '0_3months', label: '0~3개월', description: '1단계 젖꼭지' },
      { value: '3_6months', label: '3~6개월', description: '2단계 젖꼭지' },
      { value: 'over_6months', label: '6개월 이상', description: '3단계 젖꼭지' },
    ],
  },
  baby_bottle: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '용량/젖꼭지 단계 추천에 필요해요',
    options: [
      { value: 'newborn', label: '신생아 (0~2개월)', description: '150ml, SS 젖꼭지' },
      { value: '3_6months', label: '3~6개월', description: '240ml, S/M 젖꼭지' },
      { value: 'over_6months', label: '6개월 이상', description: '260ml+, L 젖꼭지' },
    ],
  },
  stroller: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '유모차 타입 추천에 필요해요',
    options: [
      { value: 'newborn', label: '신생아 (0~3개월)', description: '디럭스형 권장 (완전 눕힘)' },
      { value: '4_6months', label: '4~6개월', description: '목 가누기 시작, 절충형 가능' },
      { value: 'over_6months', label: '6개월 이상', description: '휴대용/경량형 사용 가능' },
    ],
  },
  car_seat: {
    question: '아기 개월 수가 어떻게 되나요?',
    subtext: '카시트 타입 추천에 필요해요',
    options: [
      { value: 'newborn', label: '신생아 (0~12개월)', description: '바구니형/신생아 겸용' },
      { value: '1_3years', label: '1~3세', description: '컨버터블/회전형' },
      { value: 'over_3years', label: '3세 이상', description: '주니어/부스터형' },
    ],
  },
};

// 개월 정보가 포함되어 있는지 확인하는 패턴
const AGE_PATTERNS = [
  /\d+\s*개월/,           // "6개월", "12개월"
  /신생아/,               // "신생아"
  /\d+\s*살/,             // "1살", "2살"
  /\d+\s*세/,             // "1세", "2세"
  /돌\s*(전|지남|지나)/,   // "돌 전", "돌 지남"
  /백일/,                 // "백일"
  /\d+단계/,              // "1단계", "2단계"
];

function hasAgeInfo(text: string): boolean {
  return AGE_PATTERNS.some(pattern => pattern.test(text));
}

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

**핵심 원칙 - 질문은 반드시 제품 선택에 영향을 줘야 함:**
질문의 답변이 실제 제품 필터링/추천에 영향을 주어야 합니다.
- ✅ 좋은 질문: "용량이 얼마나 필요하세요?" → 150ml vs 260ml 제품 구분 가능
- ✅ 좋은 질문: "세척 편의성이 중요하세요?" → 세척 용이한 제품 필터링 가능
- ❌나쁜 질문: "시간이 얼마나 단축되길 바라세요?" → 모든 제품이 빠름을 추구하므로 구분 불가

**중요 규칙:**
1. **페인포인트/니즈는 질문하지 말고 인사이트로 인식하세요.**
   - 예: "분유 타는 시간이 오래걸려요" → collectedInsights에 { type: "pain_point", value: "분유 제조 속도" } 추가
   - 예: "세척이 너무 번거로워요" → pain_point로 인식. "얼마나 편해지길 원하세요?" 같은 정도 질문 금지
   - 사용자가 이미 언급한 불편함은 우선순위로 인식하면 됨. 정도를 묻는 건 무의미.
2. **질문은 "핵심 선택 기준 (하드 필터)"에 있는 스펙 기반으로 생성하세요.**
   - 하드 필터에 용량, 재질, 타입 등이 있다면 그것을 물어보세요.
   - 하드 필터에 없는 추상적 질문(빠르기 정도, 만족도 등)은 제품 선택에 도움 안 됨.
3. 사용자의 초기 입력(initialContext)에서 **이미 파악된 정보는 다시 묻지 마세요.**
   - 예: "6개월 아기" → age 질문 불필요
   - 예: "가벼운 게 좋아요" → priority(휴대성) 이미 파악됨
4. 선택지는 2-3개로 제한하세요. ("기타" 옵션은 프론트에서 자동 추가됨)
5. 각 선택지에는 label(짧은 텍스트)과 description(부연설명)을 포함하세요.
6. **질문은 1~3개**를 생성하세요. 적더라도 의미있는 질문만.
7. 중복된 유형의 질문은 생성하지 마세요 (age 질문 2개 금지).
8. **절대 금지:**
   - "기존 제품 만족 여부" 질문 - 정보량 0
   - "얼마나 빠르길/편하길 원하세요?" - 정도 질문은 제품 구분 불가
   - 추상적 선호도 질문 - 구체적 스펙으로 물어보세요

**collectedInsights 추출:**
- 초기 입력에서 파악 가능한 정보를 정리
- type: 'age' | 'environment' | 'concern' | 'priority' | 'budget' | 'experience' | 'pain_point'
- 특히 pain_point는 사용자가 언급한 불편함/문제점을 그대로 캡처하세요
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
      // AI가 질문을 생성하지 못한 경우
      // 단계 기반 카테고리면 개월 질문 + 예산 질문, 아니면 예산 질문만
      const stageConfigFallback = STAGE_BASED_CATEGORIES[categoryKey];
      const needsAgeFallback = stageConfigFallback && !hasAgeInfo(initialContext);

      const fallbackQuestions: ClarifyingQuestion[] = [];
      if (needsAgeFallback) {
        fallbackQuestions.push({
          id: 'age_mandatory',
          text: stageConfigFallback.question,
          subtext: stageConfigFallback.subtext,
          options: stageConfigFallback.options,
        });
      }
      fallbackQuestions.push(budgetQuestion);

      return NextResponse.json({
        success: true,
        data: {
          questions: fallbackQuestions,
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

    // 🔧 단계 기반 카테고리에서 개월 정보가 없으면 필수 질문 추가
    const stageConfig = STAGE_BASED_CATEGORIES[categoryKey];
    const needsAgeQuestion = stageConfig && !hasAgeInfo(initialContext);

    let finalQuestions: ClarifyingQuestion[] = [];

    if (needsAgeQuestion) {
      // 개월 질문을 맨 앞에 추가
      const ageQuestion: ClarifyingQuestion = {
        id: 'age_mandatory',
        text: stageConfig.question,
        subtext: stageConfig.subtext,
        options: stageConfig.options,
      };
      // AI 생성 질문에서 age 관련 질문 제거 (중복 방지)
      const filteredAiQuestions = aiQuestions.filter(q =>
        !q.id.toLowerCase().includes('age') &&
        !q.text.includes('개월') &&
        !q.text.includes('월령')
      );
      finalQuestions = [ageQuestion, ...filteredAiQuestions.slice(0, 2), budgetQuestion];
      console.log('[ClarifyingQuestions] Added mandatory age question for stage-based category:', categoryKey);
    } else {
      // 기존 로직: AI 생성 질문 + 예산 질문
      finalQuestions = [...aiQuestions, budgetQuestion];
    }

    // AI 생성 질문 + 예산 질문
    const questions = finalQuestions;

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
