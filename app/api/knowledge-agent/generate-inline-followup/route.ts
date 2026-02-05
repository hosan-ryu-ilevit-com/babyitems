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
      questionId
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

/**
 * 인라인 꼬리질문 생성
 */
async function generateInlineFollowUp(
  categoryName: string,
  questionText: string,
  userAnswer: string,
  collectedInfo: Record<string, string>,
  questionId?: string
): Promise<InlineFollowUpResponse> {
  // 브랜드/예산 질문은 별도 처리 (정해진 꼬리질문 또는 없음)
  if (questionId === 'brand' || questionId === 'preferred_brand' || questionId === 'brand_preference') {
    return handleBrandFollowUp(userAnswer);
  }

  if (questionId === 'budget' || questionId === 'price_range' || questionId === 'budget_range') {
    // 예산 질문은 꼬리질문 없음
    return { hasFollowUp: false, skipReason: 'Budget question - no follow-up needed' };
  }

  // 일반 질문에 대한 AI 기반 꼬리질문 생성
  const prompt = `당신은 "${categoryName}" 구매 상담 전문가입니다.

사용자가 다음 질문에 답변했습니다:
- 질문: "${questionText}"
- 답변: "${userAnswer}"

지금까지 수집된 정보:
${Object.entries(collectedInfo).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(없음)'}

이 답변을 바탕으로 더 나은 추천을 위해 꼬리질문이 필요한지 판단하세요.

꼬리질문이 필요한 경우:
1. deepdive: 사용자의 답변을 더 구체화해야 할 때 (예: "넓은 공간" → 몇 평인지)
2. contradiction: 이전 답변과 모순이 있을 때
3. clarify: 답변이 모호하거나 여러 해석이 가능할 때

꼬리질문이 불필요한 경우:
- 답변이 충분히 명확할 때
- 추가 정보가 추천에 큰 영향을 주지 않을 때
- "상관없어요" 등 중립적 답변일 때

반드시 아래 JSON 형식으로만 응답하세요:

꼬리질문이 필요한 경우:
{
  "hasFollowUp": true,
  "followUp": {
    "question": "꼬리질문 내용 (1문장, 친근한 말투)",
    "type": "deepdive" | "contradiction" | "clarify",
    "options": [
      { "value": "option1", "label": "옵션1 라벨" },
      { "value": "option2", "label": "옵션2 라벨" },
      { "value": "option3", "label": "옵션3 라벨" }
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
      // 옵션이 2개 미만이면 스킵
      if (!data.followUp.options || data.followUp.options.length < 2) {
        return { hasFollowUp: false, skipReason: 'Insufficient options generated' };
      }

      return {
        hasFollowUp: true,
        followUp: {
          question: data.followUp.question,
          type: data.followUp.type || 'deepdive',
          options: data.followUp.options.slice(0, 4), // 최대 4개
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
          { value: 'no_preference', label: '상관없어요' },
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
