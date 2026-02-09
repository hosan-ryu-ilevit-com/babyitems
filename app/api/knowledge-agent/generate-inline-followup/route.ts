import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';
import type { InlineFollowUpResponse } from '@/lib/knowledge-agent/types';

/**
 * POST /api/knowledge-agent/generate-inline-followup
 *
 * 맞춤질문 답변 직후 즉시 꼬리질문을 생성합니다.
 * - deepdive: 더 깊은 정보 수집
 * - contradiction: 모순점 체크
 * - clarify: 구체화 요청
 */
export async function POST(request: NextRequest) {
  try {
    const {
      categoryName,
      questionText,
      userAnswer,
      collectedInfo,
      questionId,
      onboarding,  // 🆕 온보딩 데이터
      babyInfo,    // 🆕 아기 정보
    } = await request.json();

    if (!categoryName || !questionText || !userAnswer) {
      return NextResponse.json(
        { error: 'categoryName, questionText, and userAnswer are required' },
        { status: 400 }
      );
    }

    const result = await generateInlineFollowUp(
      categoryName,
      questionText,
      userAnswer,
      collectedInfo || {},
      questionId,
      onboarding,
      babyInfo
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[generate-inline-followup] Error:', error);
    return NextResponse.json(
      { hasFollowUp: false, skipReason: 'API error' },
      { status: 200 } // 에러여도 200 반환하여 플로우 중단 방지
    );
  }
}

// 온보딩/아기정보 타입 (inline 정의)
interface OnboardingContext {
  purchaseSituation?: string;
  replaceReasons?: string[];
  replaceOther?: string;
  firstSituations?: string[];
  firstSituationOther?: string;
}

interface BabyInfoContext {
  gender?: string;
  calculatedMonths?: number;
  expectedDate?: string;
  isBornYet?: boolean;
}

/**
 * 인라인 꼬리질문 생성
 */
async function generateInlineFollowUp(
  categoryName: string,
  questionText: string,
  userAnswer: string,
  collectedInfo: Record<string, string>,
  questionId?: string,
  onboarding?: OnboardingContext | null,
  babyInfo?: BabyInfoContext | null
): Promise<InlineFollowUpResponse> {
  // 브랜드/예산 질문은 별도 처리 (정해진 꼬리질문 또는 없음)
  if (questionId === 'brand' || questionId === 'preferred_brand' || questionId === 'brand_preference') {
    return handleBrandFollowUp(userAnswer);
  }

  if (questionId === 'budget' || questionId === 'price_range' || questionId === 'budget_range') {
    // 예산 질문은 꼬리질문 없음
    return { hasFollowUp: false, skipReason: 'Budget question - no follow-up needed' };
  }

  // 🆕 "상관없어요" 등 중립적 답변 시 꼬리질문 스킵
  const neutralAnswerPatterns = [
    '상관없', '상관 없', '괜찮', '아무거나', '잘 모르', '모르겠',
    '없어요', '없습니다', '특별히 없', '딱히 없', '노상관', '노 상관'
  ];
  const isNeutralAnswer = neutralAnswerPatterns.some(pattern =>
    userAnswer.toLowerCase().includes(pattern)
  );
  if (isNeutralAnswer) {
    return { hasFollowUp: false, skipReason: 'Neutral answer - no follow-up needed' };
  }

  // 🆕 온보딩/아기정보 컨텍스트 구성
  const userContextParts: string[] = [];

  if (onboarding) {
    const situationMap: Record<string, string> = {
      first: '첫 구매',
      replace: '교체/업그레이드',
      gift: '둘러보기/선물',
    };
    if (onboarding.purchaseSituation) {
      userContextParts.push(`구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}`);
    }
    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
      userContextParts.push(`기존 제품 불만: ${onboarding.replaceReasons.join(', ')}`);
    }
    if (onboarding.replaceOther) {
      userContextParts.push(`기타 불만: ${onboarding.replaceOther}`);
    }
    if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
      userContextParts.push(`구매 니즈: ${onboarding.firstSituations.join(', ')}`);
    }
    if (onboarding.firstSituationOther) {
      userContextParts.push(`기타 니즈: ${onboarding.firstSituationOther}`);
    }
  }

  if (babyInfo) {
    if (babyInfo.calculatedMonths !== undefined) {
      userContextParts.push(`아기 월령: ${babyInfo.calculatedMonths}개월`);
    } else if (babyInfo.expectedDate) {
      userContextParts.push(`출산예정일: ${babyInfo.expectedDate}`);
    }
    if (babyInfo.gender) {
      const genderMap: Record<string, string> = { male: '남아', female: '여아', unknown: '모름' };
      userContextParts.push(`성별: ${genderMap[babyInfo.gender] || babyInfo.gender}`);
    }
  }

  const userContextSection = userContextParts.length > 0
    ? `\n## 이미 수집된 사용자 정보 (중복 질문 금지!)\n${userContextParts.map(p => `- ${p}`).join('\n')}\n`
    : '';

  // 일반 질문에 대한 AI 기반 꼬리질문 생성
  const prompt = `당신은 "${categoryName}" 구매 상담 전문가입니다.

사용자가 다음 질문에 답변했습니다:
- 질문: "${questionText}"
- 답변: "${userAnswer}"

지금까지 수집된 정보:
${Object.entries(collectedInfo).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(없음)'}
${userContextSection}
이 답변을 바탕으로 더 나은 추천을 위해 꼬리질문이 필요한지 판단하세요.

## 꼬리질문이 필요한 경우
1. deepdive: 사용자의 답변을 더 구체화해야 할 때 (예: "넓은 공간" → 몇 평인지)
2. contradiction: 이전 답변과 모순이 있을 때
3. clarify: 답변이 모호하거나 여러 해석이 가능할 때

## 꼬리질문이 불필요한 경우 (생성하지 마세요!)
- 답변이 충분히 명확할 때
- 추가 정보가 추천에 큰 영향을 주지 않을 때
- "상관없어요" 등 중립적 답변일 때
- ⛔ **위 "이미 수집된 정보"에 포함된 내용을 다시 묻는 질문** (예: 이미 월령을 알면 월령 묻기 금지)
- ⛔ **이미 불만사항으로 언급된 내용을 다시 묻는 질문** (예: "소음" 불만 → 소음 관련 추가 질문 불필요)

## 옵션 생성 규칙 (중요!)
- 옵션은 3~4개 생성
- ⛔ "상관없어요", "잘 모르겠어요", "둘 다", "기타" 같은 회피성 옵션 금지 (시스템이 자동 추가함)
- 옵션에는 친절한 소괄호 부가설명 추가 (예: "대용량 (5L 이상)")
- **옵션 라벨에 isPopular/isRecommend 같은 메타 문구 절대 포함 금지**
- ⭐ **옵션은 구체적이고 정보 가치가 있어야 함**: 선택 즉시 추천에 반영 가능한 명확한 조건이어야 함
  - ❌ 나쁜 예: "피하고 싶은 성분이 있나요?", "특별히 원하는 기능이 있나요?" (그 자체로 정보값 없음)
  - ✅ 좋은 예: "BPA-free 소재", "스테인리스 재질", "유리 재질" (바로 필터링 가능)
- **isPopular**: 시장 데이터 기반 인기 옵션 (한 질문당 0~2개)
- **isRecommend**: 사용자 상황 기반 추천 옵션 (한 질문당 0~1개)
  * 아기 월령, 성별, 온보딩 상황을 고려
  * 예: 신생아 → 저자극/무향 옵션에 isRecommend: true
  * 예: "소음 불만" → 초저소음 옵션에 isRecommend: true
  * 사용자 상황을 고려했을 때 적합한 옵션이 있다면 반드시 표시

## 자연스러운 질문 작성 (중요!)
- ⛔ 이미 수집된 정보(월령, 성별, 상황 등)를 '억지로' 언급하지 마세요
  - ❌ 나쁜 예: "20개월 남아라고 하셨는데, 디자인은 어떤 게 좋으신가요?"
- 질문은 자연스럽게 이전 답변과 연결되어야 함
- 수집된 정보는 내부적으로 활용하되, 질문에서 굳이 반복하지 않음

반드시 아래 JSON 형식으로만 응답하세요:

꼬리질문이 필요한 경우:
{
  "hasFollowUp": true,
  "followUp": {
    "question": "꼬리질문 내용 (1문장, 친근한 말투)",
    "type": "deepdive" | "contradiction" | "clarify",
    "options": [
      { "value": "option1", "label": "옵션1 라벨 (부가설명)", "isPopular": true },
      { "value": "option2", "label": "옵션2 라벨 (부가설명)", "isRecommend": true },
      { "value": "option3", "label": "옵션3 라벨 (부가설명)" }
    ]
  }
}

꼬리질문이 불필요한 경우:
{
  "hasFollowUp": false,
  "skipReason": "불필요한 이유 (1문장)"
}`;

  try {
    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.4);
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[generateInlineFollowUp] No JSON found, skipping follow-up');
      return { hasFollowUp: false, skipReason: 'Could not parse response' };
    }

    const data = JSON.parse(jsonMatch[0]);

    // 유효성 검사
    if (data.hasFollowUp === true && data.followUp) {
      const sanitizeOptionLabel = (label: string): string =>
        label
          .replace(/[\s\[\(]*is(?:Recommend|Popular)\s*:\s*(?:true|false)[\]\)]*/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

      // 옵션이 2개 미만이면 스킵
      if (!data.followUp.options || data.followUp.options.length < 2) {
        return { hasFollowUp: false, skipReason: 'Insufficient options generated' };
      }

      return {
        hasFollowUp: true,
        followUp: {
          question: data.followUp.question,
          type: data.followUp.type || 'deepdive',
          options: data.followUp.options.slice(0, 4).map((opt: any) => ({
            ...opt,
            label: sanitizeOptionLabel(opt.label || ''),
          })), // 최대 4개
        },
      };
    }

    return {
      hasFollowUp: false,
      skipReason: data.skipReason || 'AI determined no follow-up needed',
    };
  } catch (error) {
    console.error('[generateInlineFollowUp] Error:', error);
    return { hasFollowUp: false, skipReason: 'Generation error' };
  }
}

/**
 * 브랜드 질문에 대한 정해진 꼬리질문 처리
 */
function handleBrandFollowUp(userAnswer: string): InlineFollowUpResponse {
  // "상관없어요" 또는 브랜드 미지정 시
  if (
    userAnswer.includes('상관없') ||
    userAnswer.includes('잘 모르') ||
    userAnswer.includes('추천해')
  ) {
    return {
      hasFollowUp: true,
      followUp: {
        question: '따로 선호하시는 브랜드가 없군요. 그렇다면 나의 선택 기준에 가까운 쪽을 골라주세요.',
        type: 'deepdive',
        options: [
          { value: 'popular', label: '검증된 국민템이 좋아요' },
          { value: 'value', label: '실속있는 가성비 상품이 좋아요' },
        ],
      },
    };
  }

  // 특정 브랜드를 선택한 경우 → 꼬리질문 없음
  return {
    hasFollowUp: false,
    skipReason: 'Specific brand selected - no follow-up needed',
  };
}
