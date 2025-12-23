'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface GenerateContextExamplesRequest {
  category: string;
  categoryName: string;
}

interface GenerateContextExamplesResponse {
  examples: string[];
}

// 카테고리별 객관적 조건 힌트
const CATEGORY_CONDITION_HINTS: Record<string, string> = {
  milk_powder_port: '아기 월령, 수유 횟수, 밤수유 여부',
  baby_bottle: '아기 월령, 수유 방식(모유/분유), 수유량',
  car_seat: '아기 월령/체중, 차량 종류(세단/SUV/소형차), 장거리 이동 여부',
  stroller: '아기 월령, 주 사용 환경(아파트/주택/도심), 대중교통 이용 여부',
  diaper: '아기 월령/체중, 활동량, 피부 민감도',
  high_chair: '아기 월령, 식탁 높이, 공간 크기',
  thermometer: '아기 월령, 측정 빈도, 이전 사용 경험',
  baby_wipes: '아기 월령, 피부 타입, 사용 용도(기저귀/손입)',
  formula: '아기 월령, 소화력, 알레르기 여부',
  pacifier: '아기 월령, 수유 방식, 잠버릇',
  baby_bed: '아기 월령, 방 크기, 부모 침대 높이',
  baby_sofa: '아기 월령, 사용 공간, 형제 유무',
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateContextExamplesRequest = await request.json();
    const { category, categoryName } = body;

    const conditionHints = CATEGORY_CONDITION_HINTS[category] || '아기 월령, 사용 환경, 생활 패턴';

    const systemPrompt = `당신은 육아 전문 상담사입니다.

${categoryName}을 구매하려는 부모가 **자신의 상황을 설명하는 문장** 4개를 생성해주세요.

## 중요 규칙:
1. **객관적 사실/상황**만 (주관적 선호 X)
2. 각 예시는 10-20자로 짧게
3. 다음과 같은 정보 포함: ${conditionHints}
4. **평서문으로 작성** (질문 형태 X)
5. "~이에요", "~해요" 말투로

## 좋은 예시 (평서문):
- "아이는 3개월이에요"
- "세단 차량이에요"
- "밤에 3번 정도 수유해요"
- "아파트 5층에 살아요"

## 나쁜 예시:
- "아기는 몇 개월이에요?" ❌ (질문 형태)
- "편한 게 좋아요" ❌ (주관적 선호)`;

    const userPrompt = `**카테고리:** ${categoryName} (${category})

사용자가 "${categoryName}"을 찾으면서 자신의 상황을 설명하는 **평서문** 4개를 생성하세요.
(질문 형태 X, "~이에요/~해요" 형태의 문장)

**응답 형식 (JSON):**
{
  "examples": ["아이는 3개월이에요", "밤에 3번 수유해요", ...]
}`;

    const model = getModel(0.6);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<GenerateContextExamplesResponse>(response);

    // 카테고리별 기본 예시
    const defaultExamples: Record<string, string[]> = {
      milk_powder_port: [
        '아이는 3개월이에요',
        '밤에 3번 정도 수유해요',
        '하루 8회 정도 수유해요',
        '신생아예요',
      ],
      car_seat: [
        '아이는 6개월이에요',
        'SUV 차량이에요',
        '주말마다 장거리 이동해요',
        '뒷좌석이 좁은 편이에요',
      ],
      stroller: [
        '아이는 4개월이에요',
        '엘리베이터 없는 5층이에요',
        '대중교통을 자주 이용해요',
        '차에 싣고 다닐 예정이에요',
      ],
    };

    const fallbackExamples = defaultExamples[category] || [
      '아이는 3개월이에요',
      '첫째 아이예요',
      '맞벌이 가정이에요',
      '공간이 넓지 않아요',
    ];

    const examples = parsed.examples || [];
    while (examples.length < 4) {
      examples.push(fallbackExamples[examples.length] || fallbackExamples[0]);
    }

    console.log('🎯 Generated context examples for', categoryName, ':', examples);

    return NextResponse.json({ examples: examples.slice(0, 4) });

  } catch (error) {
    console.error('Generate context examples error:', error);
    return NextResponse.json({
      examples: [
        '아이는 3개월이에요',
        '첫째 아이예요',
        '맞벌이 가정이에요',
        '공간이 넓지 않아요',
      ],
    });
  }
}
