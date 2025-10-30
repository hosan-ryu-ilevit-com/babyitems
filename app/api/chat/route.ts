import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message } from '@/types';
import { ASSISTANT_SYSTEM_PROMPT } from '@/data/attributes';

export async function POST(request: NextRequest) {
  try {
    const { messages, phase } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // Gemini API용 메시지 형식으로 변환
    const conversationHistory = messages.map((msg: Message) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Chat 2 단계에서는 추가 컨텍스트 프롬프트
    let systemPrompt = ASSISTANT_SYSTEM_PROMPT;
    if (phase === 'chat2') {
      systemPrompt = `${ASSISTANT_SYSTEM_PROMPT}

현재는 8가지 핵심 항목에 대한 평가가 완료된 상태입니다.
이제 사용자로부터 추가적인 맥락(쌍둥이 육아, 야간 수유 빈도, 예산, 특별한 요구사항 등)을 자연스럽게 이끌어내세요.
사용자가 "충분해요", "이정도면 됐어요" 같은 말을 하면 정중하게 대화를 마무리하세요.`;
    }

    // AI 응답 생성
    const aiResponse = await generateAIResponse(
      systemPrompt,
      conversationHistory
    );

    // Chat 2에서 진행률 계산 (간단한 휴리스틱)
    let accuracy = 0;
    if (phase === 'chat2') {
      // 메시지 개수와 길이로 대략적인 정확도 계산
      const chat2Messages = messages.filter((m: Message) => m.phase === 'chat2');
      const userMessages = chat2Messages.filter((m: Message) => m.role === 'user');
      const totalLength = userMessages.reduce(
        (sum: number, m: Message) => sum + m.content.length,
        0
      );

      // 간단한 계산: 메시지가 많고 길수록 정확도 증가
      accuracy = Math.min(100, userMessages.length * 20 + totalLength / 10);
    }

    return NextResponse.json({
      message: aiResponse,
      accuracy: phase === 'chat2' ? accuracy : 0,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
