'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface RefineContextRequest {
  inputs: string[]; // 지금까지 입력한 모든 자연어 입력들
}

interface RefineContextResponse {
  refinedText: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RefineContextRequest = await request.json();
    const { inputs } = body;

    console.log('🔍 [refine-context API] Received:', {
      inputsCount: inputs?.length || 0,
      inputs: inputs,
    });

    if (!inputs || inputs.length === 0) {
      console.log('❌ [refine-context API] No inputs provided');
      return NextResponse.json(
        { error: '입력된 내용이 없습니다.' },
        { status: 400 }
      );
    }

    // 입력들을 하나로 합치기
    const combinedInputs = inputs.join('\n- ');

    const systemPrompt = `당신은 육아맘의 입력을 자연스럽게 정제하는 전문가입니다.
사용자가 여러 단계에서 선택하고 입력한 정보들을 하나의 자연스러운 문장 또는 짧은 단락으로 통합해주세요.

**입력 형식:**
- 선택한 옵션: "질문 → 선택한 답변" 형식 (예: "어떤 용도로 사용하시나요? → 실내용, 실외용")
- 자연어 입력: 사용자가 직접 입력한 상황 설명 (예: "쌍둥이라 수유가 힘들어요")

**중요 규칙:**
1. 중복된 내용은 제거하세요 (예: "가장 많은 사람들이 구매하는게 뭔가요"가 여러 번 나오면 제거)
2. 선택한 옵션의 질문은 생략하고 답변만 자연스럽게 포함시키세요
3. 핵심 정보만 유지하세요 (아기 개월 수, 육아 환경, 현재 고민, 우선순위, 선택한 조건 등)
4. 자연스러운 한국어로 작성하세요
5. 2-4문장으로 간결하게 정리하세요
6. "~해요", "~이에요" 같은 자연스러운 말투 유지
7. 너무 일반적인 표현("가장 많은 사람들이 구매하는게 뭔가요" 등)은 제거하고 구체적인 상황만 남기세요
8. 선택한 조건과 자연어 입력을 자연스럽게 연결하세요

**예시 1:**
입력:
- 어떤 용도로 사용하시나요? → 실내용, 실외용
- 가격 vs 품질 → 품질이 좋은 제품
- 쌍둥이라 자주 사용해요
- 맞벌이라 시간이 부족해요

출력:
"쌍둥이를 키우고 있고 맞벌이라 시간이 부족해요. 실내와 실외 모두 사용하려고 하고, 품질이 좋은 제품을 선호해요."

**예시 2:**
입력:
- 6개월 아기를 키우고 다음주에 이사를 가려고 해요
- 사용 빈도는? → 매일 사용
- 휴대성 vs 기능성 → 휴대성이 좋은 제품
- 외출이 잦아요

출력:
"6개월 아기를 키우고 있고 다음주에 이사를 가려고 해요. 외출이 잦아서 매일 사용할 예정이고, 휴대성이 좋은 제품을 선호해요."

**예시 3:**
입력:
- 가장 많은 사람들이 구매하는게 뭔가요
- 연령대는? → 신생아용
- 쌍둥이라 수유가 힘들어요

출력:
"신생아 쌍둥이를 키우고 있고 수유가 힘들어요."`;

    const userPrompt = `다음 입력들을 자연스럽게 통합해주세요:

- ${combinedInputs}

**응답 형식 (JSON):**
{
  "refinedText": "정제된 문장"
}`;

    const model = getModel(0.3); // 낮은 temperature로 일관성 있는 정제

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<RefineContextResponse>(response);

    console.log('✅ [refine-context API] Refined result:', {
      originalCount: inputs.length,
      refinedText: parsed.refinedText,
    });

    // 정제된 텍스트가 비어있거나 너무 짧으면 원본 반환
    if (!parsed.refinedText || parsed.refinedText.trim().length < 5) {
      const fallbackText = inputs.filter(input =>
        input !== '가장 많은 사람들이 구매하는게 뭔가요'
      ).join('. ');
      console.log('⚠️ [refine-context API] Using fallback:', fallbackText);
      return NextResponse.json({
        refinedText: fallbackText
      });
    }

    return NextResponse.json({ refinedText: parsed.refinedText });

  } catch (error) {
    console.error('Refine context error:', error);
    // 에러 시 원본을 단순히 합쳐서 반환
    const { inputs } = await request.json().catch(() => ({ inputs: [] }));
    return NextResponse.json({
      refinedText: inputs.filter((input: string) =>
        input !== '가장 많은 사람들이 구매하는게 뭔가요'
      ).join('. ')
    });
  }
}
