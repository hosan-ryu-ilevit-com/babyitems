/**
 * 온보딩 기반 첫 질문 생성 API
 *
 * 사용자가 온보딩에서 입력한 상황/니즈/불만사항을 기반으로
 * 첫 번째 질문을 생성합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 10;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

interface OnboardingQuestionRequest {
  categoryName: string;
  onboarding?: {
    purchaseSituation?: string;
    replaceReasons?: string[];
    replaceOther?: string;
    firstSituations?: string[];
    firstSituationOther?: string;
  };
  babyInfo?: {
    gender?: string;
    calculatedMonths?: number;
    expectedDate?: string;
    isBornYet?: boolean;
  };
}

interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  isPopular?: boolean;
}

interface OnboardingQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: OnboardingQuestionRequest = await request.json();
    const { categoryName, onboarding, babyInfo } = body;

    console.log('[OnboardingQuestion] Request:', { categoryName, onboarding, babyInfo });

    // 온보딩 데이터가 없거나 의미있는 정보가 없으면 빈 배열 반환
    if (!onboarding || (!onboarding.replaceReasons?.length && !onboarding.firstSituations?.length && !onboarding.replaceOther && !onboarding.firstSituationOther)) {
      console.log('[OnboardingQuestion] No meaningful onboarding data, skipping');
      return NextResponse.json({
        success: true,
        questions: [],
      });
    }

    // "상관없어요"만 선택한 경우도 스킵
    const hasOnlyDontCare =
      (onboarding.replaceReasons?.length === 1 && onboarding.replaceReasons[0] === '상관없어요') ||
      (onboarding.firstSituations?.length === 1 && onboarding.firstSituations[0] === '상관없어요');

    if (hasOnlyDontCare) {
      console.log('[OnboardingQuestion] Only "dont care" selected, skipping');
      return NextResponse.json({
        success: true,
        questions: [],
      });
    }

    if (!ai) {
      return NextResponse.json({
        success: true,
        questions: [],
      });
    }

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
      },
    });

    // 온보딩 정보 정리
    const onboardingContext: string[] = [];

    if (onboarding.purchaseSituation) {
      const situationMap: Record<string, string> = {
        first: '첫 구매',
        replace: '기존 제품 교체/업그레이드',
        gift: '선물용/둘러보기',
      };
      onboardingContext.push(`구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}`);
    }

    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0 && !onboarding.replaceReasons.includes('상관없어요')) {
      onboardingContext.push(`기존 제품 불만사항: ${onboarding.replaceReasons.join(', ')}`);
    }

    if (onboarding.replaceOther) {
      onboardingContext.push(`기타 불만: ${onboarding.replaceOther}`);
    }

    if (onboarding.firstSituations && onboarding.firstSituations.length > 0 && !onboarding.firstSituations.includes('상관없어요')) {
      onboardingContext.push(`구매 니즈/상황: ${onboarding.firstSituations.join(', ')}`);
    }

    if (onboarding.firstSituationOther) {
      onboardingContext.push(`기타 상황: ${onboarding.firstSituationOther}`);
    }

    if (babyInfo?.calculatedMonths !== undefined) {
      onboardingContext.push(`아기 월령: ${babyInfo.calculatedMonths}개월`);
    }

    const onboardingText = onboardingContext.join('\n');

    const prompt = `당신은 "${categoryName}" 구매 전문가입니다.

## 사용자가 온보딩에서 입력한 정보
${onboardingText}

## 목표
위 온보딩 정보를 기반으로 **딱 1개의 첫 질문**을 생성하세요.

## 생성 규칙
1. **온보딩 정보와 직접 연관된 질문만 생성**
   - 예: "기존 제품 불만: 소음이 커서" → "소음 레벨은 어느 정도가 좋으신가요?"
   - 예: "구매 니즈: 목욕 시 안전한 제품" → "목욕 시 안전 기능은 어떤 게 중요하신가요?"
   - 예: "기존 제품 불만: 세척이 번거로웠어요" → "세척 편의성은 어느 정도로 중요하신가요?"

2. **여러 불만/니즈가 있다면 가장 구체적이고 중요한 것 1개만 선택**
   - 우선순위: 구체적 스펙/기능 > 일반적 니즈

3. **옵션 설계 (3-4개)**
   - 온보딩 정보와 직접 연관된 구체적인 선택지
   - 모든 옵션에 소괄호 설명 필수
   - "상관없어요" 옵션은 시스템이 자동 추가하므로 생성 금지
   - **isPopular**: 시장 데이터 기반 인기 옵션 (한 질문당 0~2개)
   - **isRecommend**: 사용자 상황 기반 추천 옵션 (한 질문당 1~2개, 웬만하면 1개는 표시)
     * 아기 월령, 성별, 온보딩 상황을 고려
     * 예: 신생아 → 저자극/무향 옵션에 isRecommend: true
     * 예: "소음 불만" → 초저소음 옵션에 isRecommend: true
     * 사용자 상황을 고려했을 때 적합한 옵션이 있다면 반드시 표시

4. **질문 형태**
   - 자연스럽고 친근한 말투
   - 온보딩에서 언급한 키워드를 그대로 활용

## 출력 형식
단일 질문 객체만 출력 (배열 아님):

{
  "id": "onboarding_1",
  "question": "질문 내용 (온보딩 키워드 포함)",
  "options": [
    {"value": "opt1", "label": "선택지1 (구체적 설명)", "description": "부가 설명", "isPopular": true},
    {"value": "opt2", "label": "선택지2 (구체적 설명)", "description": "부가 설명", "isRecommend": true},
    {"value": "opt3", "label": "선택지3 (구체적 설명)", "description": "부가 설명"}
  ],
  "type": "single",
  "priority": 0,
  "dataSource": "온보딩 기반"
}

⚠️ JSON 객체만 출력 (배열 아님, 설명 없음)`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    console.log('[OnboardingQuestion] LLM response:', text.slice(0, 200));

    // JSON 파싱
    let question: OnboardingQuestion | null = null;
    try {
      question = JSON.parse(text);
    } catch (parseError) {
      console.error('[OnboardingQuestion] JSON parse error:', parseError);
      // JSON 추출 시도
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          question = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('[OnboardingQuestion] Failed to extract JSON');
        }
      }
    }

    if (!question || !question.question || !question.options || question.options.length === 0) {
      console.log('[OnboardingQuestion] Invalid question generated, skipping');
      return NextResponse.json({
        success: true,
        questions: [],
      });
    }

    // 유효성 검사
    question.id = 'onboarding_1';
    question.type = 'single';
    question.priority = 0; // 가장 높은 우선순위
    question.dataSource = '온보딩 기반';

    console.log('[OnboardingQuestion] ✅ Generated:', question.question);

    return NextResponse.json({
      success: true,
      questions: [question],
    });

  } catch (error) {
    console.error('[OnboardingQuestion] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      questions: [],
    }, { status: 500 });
  }
}
