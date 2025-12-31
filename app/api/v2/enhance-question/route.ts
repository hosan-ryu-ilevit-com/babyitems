/**
 * 단일 하드필터 질문을 이전 선택 정보를 바탕으로 동적 생성
 * POST /api/v2/enhance-question
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModel, parseJSONResponse, isGeminiAvailable, callGeminiWithRetry } from '@/lib/ai/gemini';

interface EnhanceQuestionRequest {
  categoryName: string;
  questionId: string;
  originalQuestion: string;
  options: string[];  // 선택지 레이블 배열
}

interface EnhanceQuestionResponse {
  success: boolean;
  question?: string;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<EnhanceQuestionResponse>> {
  try {
    const body: EnhanceQuestionRequest = await request.json();
    const { categoryName, originalQuestion, options } = body;

    if (!isGeminiAvailable()) {
      return NextResponse.json({ success: true, question: originalQuestion });
    }

    const model = getModel(0.3);

    const prompt = `당신은 ${categoryName} 구매를 도와주는 친절한 상담사입니다.

📋 지금 만들 질문:
- 원본: "${originalQuestion}"
- 선택지: [${options.join(', ')}]

🎯 규칙:
1. 보통 **1문장** (15~30자), 필요시 최대 **2문장** (40자 이내)
2. **~하시나요?**, **~좋으세요?**, **~있으세요?** 형태의 부드러운 말투
3. 전문용어는 풀어서 설명
4. 선택지를 보면 바로 이해되도록 맥락 제공

📤 응답 (JSON):
{"question": "생성된 질문 텍스트"}

JSON만 응답. 마크다운 없이.`;

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    }, 2, 300);

    const parsed = parseJSONResponse<{ question: string }>(result);

    if (!parsed.question) {
      return NextResponse.json({ success: true, question: originalQuestion });
    }

    console.log(`[enhance-question] "${originalQuestion}" → "${parsed.question}"`);

    return NextResponse.json({
      success: true,
      question: parsed.question,
    });

  } catch (error) {
    console.error('[enhance-question] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to enhance question',
    }, { status: 500 });
  }
}
