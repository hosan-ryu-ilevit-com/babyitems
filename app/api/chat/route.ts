import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, ImportanceLevel } from '@/types';
import { ASSISTANT_CHAT2_PROMPT, CORE_ATTRIBUTES } from '@/data/attributes';
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

        // 중요도 질문 (하늘색 배경용)
        const importanceQuestion = `고객님께서는 **'${currentAttribute.name}'**에 대해 어느 정도 중요하게 생각하시나요?${
          currentAttribute.importanceExamples
            ? `\n\n**매우 중요**: ${currentAttribute.importanceExamples.veryImportant}\n**중요함**: ${currentAttribute.importanceExamples.important}\n**보통**: ${currentAttribute.importanceExamples.normal}`
            : ''
        }`;

        return NextResponse.json({
          messages: [explanation, importanceQuestion],
          type: 'follow_up',
          requiresImportance: true,
        });
      } else if (intent.type === 'importance_response') {
        // 중요도 답변 → 피드백 + 다음 속성으로 전환
        const importance = intent.importance as ImportanceLevel;
        const feedbackMessage = generateImportanceFeedback(
          currentAttribute.name,
          importance
        );

        const nextIndex = currentAttributeIndex + 1;

        if (nextIndex < CORE_ATTRIBUTES.length) {
          // 피드백은 확인 메시지로 처리, 다음 속성 질문은 별도로 분리
          const nextQuestionParts = generateAttributeQuestion(nextIndex);

          return NextResponse.json({
            confirmationMessage: feedbackMessage, // 확인 메시지로 표시
            messages: nextQuestionParts, // 다음 질문들
            type: 'next_attribute',
            importance,
            nextAttributeIndex: nextIndex,
          });
        } else {
          // 모든 속성 완료 → Chat2로 전환
          const transitionMessage = generateChat2TransitionMessage();

          return NextResponse.json({
            confirmationMessage: feedbackMessage, // 확인 메시지로 표시
            messages: [transitionMessage], // 전환 메시지
            type: 'transition_to_chat2',
            importance,
          });
        }
      } else {
        // off_topic → 원래 주제로 유도 + 중요도 질문 다시 표시
        const redirectMessage = `${currentAttribute.name}에 대해 여쭤보고 있어요. 이 부분이 회원님께 얼마나 중요하신지 알려주시면 더 정확한 추천을 해드릴 수 있습니다.`;

        // 중요도 질문 (마지막 파트만 - 중요도 질문)
        const importanceQuestion = `고객님께서는 **'${currentAttribute.name}'**에 대해 어느 정도 중요하게 생각하시나요?${
          currentAttribute.importanceExamples
            ? `\n\n**매우 중요**: ${currentAttribute.importanceExamples.veryImportant}\n**중요함**: ${currentAttribute.importanceExamples.important}\n**보통**: ${currentAttribute.importanceExamples.normal}`
            : ''
        }`;

        return NextResponse.json({
          messages: [redirectMessage, importanceQuestion],
          type: 'redirect',
          requiresImportance: true,
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

      const systemPrompt = ASSISTANT_CHAT2_PROMPT;

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
