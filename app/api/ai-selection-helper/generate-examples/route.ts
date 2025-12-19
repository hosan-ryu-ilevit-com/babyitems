'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface GenerateExamplesRequest {
  questionType: 'hard_filter' | 'balance_game' | 'negative_filter' | 'category_selection';
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

    let systemPrompt: string;
    let userPrompt: string;

    if (questionType === 'category_selection') {
      // 카테고리 선택용 예시 생성
      systemPrompt = `당신은 육아맘의 마음을 잘 아는 상담사입니다.
"어떤 제품이 필요한지 모르겠다"는 사용자가 입력할 수 있는 육아 상황 예시를 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 아기 개월 수, 육아 환경, 현재 불편한 점 등 구체적인 상황으로
3. 좋은 예시: "신생아 출산 준비 중이에요", "쌍둥이라 수유가 힘들어요", "외출할 때마다 불편해요"
4. 나쁜 예시: "유모차 필요해요" (카테고리를 직접 언급하면 안 됨)
5. "~해요", "~이에요" 같은 자연스러운 말투로`;

      userPrompt = `**질문:** ${questionText}

사용자가 본인의 육아 상황을 설명할 수 있는 예시를 생성해주세요.
카테고리 이름을 직접 언급하지 말고, 상황만 설명해야 합니다.

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;
    } else if (questionType === 'negative_filter') {
      // 단점 필터용 예시 생성 - 상품 단점이 아닌 사용자 상황/우려 기반
      systemPrompt = `당신은 육아맘의 마음을 잘 아는 상담사입니다.
"피하고 싶은 단점"을 선택하는 질문에서, 사용자가 입력할 수 있는 본인의 상황이나 우려를 예시로 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 상품의 단점을 직접 말하면 안 됨 (예: "세척이 복잡해요" ❌)
3. 구매 전이므로 사용자는 상품을 써보지 않았음 - 본인의 상황/환경/우려만 말할 수 있음
4. 좋은 예시: "맞벌이라 시간이 부족해요", "외출이 잦아요", "공간이 좁아요", "아기가 예민해요"
5. 사용자의 생활패턴, 환경, 아기 특성, 개인적 우려 등을 담은 예시로
6. "~해요", "~이에요" 같은 자연스러운 말투로`;

      userPrompt = `**카테고리:** ${categoryName} (${category})
**질문:** ${questionText}

사용자가 이 ${categoryName}를 사기 전에 본인 상황을 설명할 수 있는 예시를 생성해주세요.
상품 단점(세척 어려움, 무거움 등)을 직접 언급하면 안 되고, 사용자의 생활 상황이나 환경을 말해야 합니다.

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;
    } else {
      // 기존 하드필터/밸런스게임용
      systemPrompt = `당신은 육아맘의 마음을 잘 아는 상담사입니다.
현재 질문에 대해 사용자가 입력할 수 있는 예시 상황을 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 실제 육아맘들이 흔히 겪는 구체적인 상황으로
3. 질문과 직접 관련된 맥락이어야 함
4. 첫 번째 예시가 가장 흔한 상황
5. "~해요", "~이에요" 같은 자연스러운 말투로`;

      userPrompt = `**카테고리:** ${categoryName} (${category})
**질문 타입:** ${questionType === 'hard_filter' ? '스펙 선택' : '취향 선택'}
**질문:** ${questionText}

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;
    }

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
