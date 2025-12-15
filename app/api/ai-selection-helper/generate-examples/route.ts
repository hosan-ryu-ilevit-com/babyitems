'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface GenerateExamplesRequest {
  questionType: 'hard_filter' | 'balance_game';
  questionText: string;
  category: string;
  categoryName: string;
}

interface GenerateExamplesResponse {
  examples: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateExamplesRequest = await request.json();
    const { questionType, questionText, category, categoryName } = body;

    const systemPrompt = `당신은 육아맘의 마음을 잘 아는 상담사입니다.
현재 질문에 대해 사용자가 입력할 수 있는 예시 상황을 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 실제 육아맘들이 흔히 겪는 구체적인 상황으로
3. 질문과 직접 관련된 맥락이어야 함
4. 첫 번째 예시가 가장 흔한 상황
5. "~해요", "~이에요" 같은 자연스러운 말투로`;

    const userPrompt = `**카테고리:** ${categoryName} (${category})
**질문 타입:** ${questionType === 'hard_filter' ? '스펙 선택' : '취향 선택'}
**질문:** ${questionText}

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;

    const model = getModel(0.7); // 창의적인 예시 생성

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<GenerateExamplesResponse>(response);

    // 예시가 3개 미만이면 기본 예시로 채움
    const defaultExamples = [
      '쌍둥이라 자주 사용해요',
      '맞벌이라 시간이 부족해요',
      '아이가 예민한 편이에요',
    ];

    while (parsed.examples.length < 3) {
      parsed.examples.push(defaultExamples[parsed.examples.length]);
    }

    return NextResponse.json({ examples: parsed.examples.slice(0, 3) });

  } catch (error) {
    console.error('Generate examples error:', error);
    // 에러 시 기본 예시 반환
    return NextResponse.json({
      examples: [
        '쌍둥이라 자주 사용해요',
        '맞벌이라 시간이 부족해요',
        '아이가 예민한 편이에요',
      ],
    });
  }
}
