import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry } from '@/lib/ai/gemini';

interface TipRequest {
  categoryKey: string;
  questionId: string;
  questionText: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  // popularOptions는 더 이상 사용하지 않음 (하위 호환성 유지)
  popularOptions?: Array<{
    value: string;
    label: string;
    percentage: number;
  }>;
}

interface TipResponse {
  tip: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<TipResponse | { error: string }>> {
  try {
    const body: TipRequest = await request.json();
    const { categoryKey, questionId, questionText, options } = body;

    // 입력 검증
    if (!categoryKey || !questionId || !questionText || !options?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const prompt = `질문: ${questionText}
선택지: ${options.map(o => o.label).join(', ')}

당신은 육아용품 전문가입니다. 초보 부모가 위 질문에서 선택하는 데 도움이 되는 팁을 1문장(50자 내외)으로 작성해주세요. 1문장만 사용하기때문에 핵심적인/특히 설명이 필요한 부분들을 우선순위를 정해서 압축적으로 전댈해야 합니다. 

## 규칙
- 순수 텍스트 한 문장만 (리스트/불릿 ❌)
- 동어반복 금지 (예: "안전인증은 안전 기준 통과" ❌)
- 선택지 하나하나 나열 금지
- 선택 유도 금지 (예: "XX가 좋아요" ❌)

## 좋은 예시
- "PPSU는 가볍고 열탕소독 가능, 유리는 스크래치에 강해요"
- "절충형은 6kg대로 가볍고, 디럭스형은 신생아용으로 안정감이 좋아요"
- "4면개방형은 시야 확보가 좋고, 슬라이드도어는 좁은 공간에서 편해요"

## 나쁜 예시
- "자율안전인증은 안전 기준을 통과했다는 뜻이에요" (동어반복)
- "방수기능은 물이 스며드는 걸 막아줘요" (뻔함)
- "- 방수기능: ... - 접이식: ..." (리스트 형식)`;

    // LLM 호출
    const model = getModel(0.2); // 낮은 temperature로 일관성 있는 출력

    let tip = await callGeminiWithRetry(async () => {
      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text().trim();
    });

    // 안전 장치: 마침표+공백 이후 추가 문장 제거 (1문장만 유지)
    const sentenceEnd = tip.indexOf('. ');
    if (sentenceEnd !== -1) {
      tip = tip.substring(0, sentenceEnd + 1);
    }

    // 70자 초과 시 자르기
    if (tip.length > 70) {
      tip = tip.substring(0, 67) + '...';
    }

    return NextResponse.json({ tip });

  } catch (error) {
    console.error('Error generating tip:', error);
    return NextResponse.json(
      { error: 'Failed to generate tip' },
      { status: 500 }
    );
  }
}
