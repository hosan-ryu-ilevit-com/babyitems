import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface SummaryRequest {
  categoryKey: string;
  categoryName: string;
  conditions: Array<{ label: string; value: string }>;
  productCount: number;
  filteredCount: number;
}

interface SummaryResponse {
  summary: string;
}

/**
 * POST /api/v2/generate-summary
 * 사용자 선택 조건 기반 AI 요약 메시지 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body: SummaryRequest = await request.json();
    const { categoryKey, categoryName, conditions, productCount, filteredCount } = body;

    if (!categoryKey || !conditions || conditions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: `선택하신 조건에 맞는 제품들을 찾았어요. 이제 후보들 중에서 최적의 제품을 고르기 위한 질문을 드릴게요!`,
        },
      });
    }

    // 조건 요약 텍스트 생성
    const conditionText = conditions.map(c => `${c.label}: ${c.value}`).join(', ');

    const prompt = `당신은 친근하고 전문적인 육아용품 추천 도우미입니다.
사용자가 선택한 조건을 기반으로 1차 후보 제품들을 찾았다는 것을 알리는 요약 메시지를 작성해주세요.

## 카테고리
${categoryName}

## 선택한 조건
${conditionText}

## 요청 사항
1. 선택한 조건을 자연스럽게 요약하여 언급해주세요 (예: "**신생아**를 위한 **절충형** 유모차를 찾으시는군요!")
2. 마지막은 반드시 "조건에 맞는 상품들을 찾았습니다." 또는 "상품들을 찾았어요." 로 끝내주세요.
3. **절대 제품 개수(숫자)는 언급하지 마세요.**
4. 너무 가볍거나 들뜬 말투(예: "재미있는 질문")는 피하고, 신뢰감 있고 전문적인 톤을 유지하세요.
5. 마크다운 볼드(**)를 사용해 중요 포인트를 강조해주세요.
6. 이모지는 사용하지 마세요.
7. 한 문장 또는 두 문장의 짧은 문단으로 작성하세요. 뒤에 이어질 공통 문구는 제가 별도로 추가할 예정이니, 상품을 찾았다는 내용까지만 작성하시면 됩니다.

## 예시
- "**신생아**를 위한 **절충형** 유모차들을 찾았습니다."
- "**팬티형** 기저귀 중에서 **6개월 이상** 아기에게 딱 맞는 상품들을 찾았어요."

JSON 형식으로 응답해주세요:
{
  "summary": "요약 메시지"
}`;

    const model = getModel(0.7);

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    const parsed = parseJSONResponse<SummaryResponse>(result);

    return NextResponse.json({
      success: true,
      data: {
        summary: parsed.summary || `전체 **${productCount}개** 제품 중 **${filteredCount}개**가 조건에 맞아요.`,
      },
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    return NextResponse.json({
      success: true,
      data: {
        summary: null,
      },
    });
  }
}
