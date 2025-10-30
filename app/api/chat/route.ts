import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, ImportanceLevel } from '@/types';
import { ASSISTANT_SYSTEM_PROMPT, CORE_ATTRIBUTES } from '@/data/attributes';
import { analyzeUserIntent, generateDetailedExplanation } from '@/lib/ai/intentAnalyzer';
import {
  generateAttributeQuestion,
  generateImportanceFeedback,
  generateChat2TransitionMessage,
} from '@/lib/utils/messageTemplates';

export async function POST(request: NextRequest) {
  try {
    const { messages, phase, currentAttributeIndex } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // Chat1 단계: 대화형 속성 평가
    if (phase === 'chat1') {
      const lastUserMessage = messages.filter((m: Message) => m.role === 'user').pop();

      if (!lastUserMessage) {
        return NextResponse.json(
          { error: 'No user message found' },
          { status: 400 }
        );
      }

      const currentAttribute = CORE_ATTRIBUTES[currentAttributeIndex];

      // 사용자 의도 분석 (세부 항목 정보 포함)
      const intent = await analyzeUserIntent(
        lastUserMessage.content,
        currentAttribute.name,
        currentAttribute.details
      );

      // 의도에 따라 다른 응답 생성
      if (intent.type === 'follow_up_question') {
        // 추가 질문 → 더 자세한 설명 제공
        const explanation = await generateDetailedExplanation(
          currentAttribute.name,
          currentAttribute.description,
          currentAttribute.details,
          lastUserMessage.content
        );

        return NextResponse.json({
          message: `${explanation}\n\n${currentAttribute.name}은(는) 회원님께 얼마나 중요하신가요?`,
          type: 'follow_up',
          requiresImportance: true,
        });
      } else if (intent.type === 'importance_response') {
        // 중요도 답변 → 피드백 + 다음 속성으로 전환
        const importance = intent.importance as ImportanceLevel;
        const feedbackMessage = generateImportanceFeedback(
          currentAttribute.name,
          importance,
          true,
          lastUserMessage.content
        );

        const nextIndex = currentAttributeIndex + 1;

        if (nextIndex < CORE_ATTRIBUTES.length) {
          // 피드백 + 다음 속성 질문 (여러 버블로 분리)
          const nextQuestionParts = generateAttributeQuestion(nextIndex);
          const messages = [feedbackMessage, ...nextQuestionParts];

          return NextResponse.json({
            messages, // 배열로 반환
            type: 'next_attribute',
            importance,
            nextAttributeIndex: nextIndex,
          });
        } else {
          // 모든 속성 완료 → Chat2로 전환
          const transitionMessage = generateChat2TransitionMessage();
          const messages = [feedbackMessage, transitionMessage];

          return NextResponse.json({
            messages, // 배열로 반환
            type: 'transition_to_chat2',
            importance,
          });
        }
      } else {
        // off_topic → 원래 주제로 유도
        return NextResponse.json({
          message: `${currentAttribute.name}에 대해 여쭤보고 있어요. 이 부분이 회원님께 얼마나 중요하신지 알려주시면 더 정확한 추천을 해드릴 수 있습니다.`,
          type: 'redirect',
        });
      }
    }

    // Chat2 단계: 추가 컨텍스트 수집
    if (phase === 'chat2') {
      // Gemini API용 메시지 형식으로 변환
      const conversationHistory = messages.map((msg: Message) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const systemPrompt = `${ASSISTANT_SYSTEM_PROMPT}

현재는 7가지 핵심 항목에 대한 평가가 완료된 상태입니다.
이제 사용자로부터 추가적인 맥락(쌍둥이 육아, 야간 수유 빈도, 예산, 특별한 요구사항 등)을 자연스럽게 이끌어내세요.
사용자가 "충분해요", "이정도면 됐어요" 같은 말을 하면 정중하게 대화를 마무리하세요.`;

      // AI 응답 생성
      const aiResponse = await generateAIResponse(
        systemPrompt,
        conversationHistory
      );

      // Chat 2에서 진행률 계산 (간단한 휴리스틱)
      const chat2Messages = messages.filter((m: Message) => m.phase === 'chat2');
      const userMessages = chat2Messages.filter((m: Message) => m.role === 'user');
      const totalLength = userMessages.reduce(
        (sum: number, m: Message) => sum + m.content.length,
        0
      );

      // 간단한 계산: 메시지가 많고 길수록 정확도 증가
      const accuracy = Math.min(100, userMessages.length * 20 + totalLength / 10);

      return NextResponse.json({
        message: aiResponse,
        accuracy,
      });
    }

    return NextResponse.json(
      { error: 'Invalid phase' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
