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
  let questionType: GenerateExamplesRequest['questionType'] = 'hard_filter';

  try {
    const body: GenerateExamplesRequest = await request.json();
    questionType = body.questionType;
    const { questionText, category, categoryName } = body;

    let systemPrompt: string;
    let userPrompt: string;

    if (questionType === 'category_selection') {
      // 카테고리 선택용 예시 생성 - 2개 생성 (고정 1개 + API 2개 = 총 3개)
      systemPrompt = `당신은 꼼꼼한 소비자의 마음을 잘 아는 쇼핑 상담사입니다.
제품을 찾는 사용자가 본인 상황을 설명할 수 있는 예시를 2개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 다양한 구매 상황을 커버 (첫 구매, 교체/업그레이드, 생활 패턴, 사용 환경 등)
3. 예시들이 서로 겹치지 않도록 다양한 상황으로
4. 좋은 예시: "처음 사는 거라 잘 몰라요", "기존 제품이 고장났어요", "맞벌이라 시간이 부족해요", "공간이 좁은 편이에요"
5. "~해요", "~이에요" 같은 자연스러운 말투로
6. 카테고리를 직접 언급하지 말고, 상황만 설명`;

      userPrompt = `사용자가 제품을 찾을 때 본인 상황을 설명할 수 있는 예시 2개를 생성해주세요.
다양한 구매 상황(첫 구매, 교체, 생활 패턴, 사용 환경, 예산 등)을 커버해주세요.

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2"]
}`;
    } else if (questionType === 'negative_filter') {
      // 단점 필터용 예시 생성 - 상품 단점이 아닌 사용자 상황/우려 기반
      systemPrompt = `당신은 꼼꼼한 소비자의 마음을 잘 아는 쇼핑 상담사입니다.
"피할 단점"을 선택하는 질문에서, 사용자가 입력할 수 있는 본인의 상황이나 우려를 예시로 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 상품의 단점을 직접 말하면 안 됨 (예: "세척이 복잡해요" ❌)
3. 구매 전이므로 사용자는 상품을 써보지 않았음 - 본인의 상황/환경/우려만 말할 수 있음
4. 좋은 예시: "맞벌이라 시간이 부족해요", "외출이 잦아요", "공간이 좁아요", "소음에 민감해요"
5. 사용자의 생활패턴, 환경, 개인적 우려 등을 담은 예시로
6. "~해요", "~이에요" 같은 자연스러운 말투로`;

      userPrompt = `**카테고리:** ${categoryName} (${category})
**질문:** ${questionText}

사용자가 이 ${categoryName}을(를) 사기 전에 본인 상황을 설명할 수 있는 예시를 생성해주세요.
상품 단점(세척 어려움, 무거움 등)을 직접 언급하면 안 되고, 사용자의 생활 상황이나 환경을 말해야 합니다.

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;
    } else {
      // 기존 하드필터/밸런스게임용
      systemPrompt = `당신은 꼼꼼한 소비자의 마음을 잘 아는 쇼핑 상담사입니다.
현재 질문에 대해 사용자가 입력할 수 있는 예시 상황을 3개 생성해주세요.

**중요 규칙:**
1. 각 예시는 15-25자 내외로 짧고 자연스럽게
2. 실제 소비자들이 흔히 겪는 구체적인 상황으로
3. 질문과 직접 관련된 맥락이어야 함. 그러나 질문의 예시(제품 구매조건, 스펙)를 직접 언급하지 않고, 사용자의 상황/우려를 말해야 함.
5. "~해요", "~이에요" 같은 자연스러운 말투로`;

      userPrompt = `**카테고리:** ${categoryName} (${category})
**질문 타입:** ${questionType === 'hard_filter' ? '스펙 선택' : '밸런스 게임'}
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

    // category_selection은 2개 (고정 1개는 프론트에서 추가), 나머지는 3개
    const targetCount = questionType === 'category_selection' ? 2 : 3;

    // 예시가 목표 개수 미만이면 기본 예시로 채움
    const defaultExamples = questionType === 'category_selection'
      ? [
          '처음 사는 거라 잘 몰라요',
          '맞벌이라 시간이 부족해요',
        ]
      : [
          '자주 사용할 것 같아요',
          '맞벌이라 시간이 부족해요',
          '소음에 민감한 편이에요',
        ];

    while (parsed.examples.length < targetCount) {
      parsed.examples.push(defaultExamples[parsed.examples.length % defaultExamples.length]);
    }

    return NextResponse.json({ examples: parsed.examples.slice(0, targetCount) });

  } catch (error) {
    console.error('Generate examples error:', error);
    // 에러 시 기본 예시 반환 - questionType에 따라 다른 개수
    const fallbackExamples = questionType === 'category_selection'
      ? [
          '처음 사는 거라 잘 몰라요',
          '맞벌이라 시간이 부족해요',
        ]
      : [
          '자주 사용할 것 같아요',
          '맞벌이라 시간이 부족해요',
          '소음에 민감한 편이에요',
        ];
    return NextResponse.json({ examples: fallbackExamples });
  }
}
