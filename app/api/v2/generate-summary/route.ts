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
 * 하드필터 선택 기반 AI 요약 메시지 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body: SummaryRequest = await request.json();
    const { categoryKey, categoryName, conditions, productCount, filteredCount } = body;

    if (!categoryKey || !conditions || conditions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: `전체 **${productCount}개** 제품 중 **${filteredCount}개**가 조건에 맞아요.`,
        },
      });
    }

    // 조건 요약 텍스트 생성
    const conditionText = conditions.map(c => `${c.label}: ${c.value}`).join(', ');

    const prompt = `당신은 친근한 육아용품 추천 도우미입니다.
사용자가 선택한 조건을 기반으로 따뜻하고 공감어린 요약 메시지를 한 줄로 생성해주세요.

## 카테고리
${categoryName}

## 선택한 조건
${conditionText}

## 제품 수
- 전체: ${productCount}개
- 조건에 맞는 제품: ${filteredCount}개

## 요청
1. 선택한 조건을 자연스럽게 요약해주세요
2. 공감어린 톤으로 작성해주세요
3. 마크다운 볼드(**)를 사용해 숫자나 중요 포인트를 강조해주세요
4. 한 문장으로 작성해주세요
5. 이모지는 사용하지 마세요

## 예시
- "**신생아**를 위한 **절충형** 유모차를 찾으시는군요! **42개** 제품이 조건에 맞아요."
- "**팬티형** 기저귀, **6개월 이상** 아기에게 딱 맞는 **28개** 제품이 있어요."
- "**바구니 분리**되는 카시트로 **신생아**를 편하게 이동하실 수 있는 제품 **15개**를 찾았어요."

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
