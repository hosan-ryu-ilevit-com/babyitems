import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, ImportanceLevel } from '@/types';
import { ASSISTANT_CHAT2_PROMPT, CORE_ATTRIBUTES } from '@/data/attributes';
import { analyzeUserIntent, generateDetailedExplanation } from '@/lib/ai/intentAnalyzer';
import {
  generateAttributeQuestion,
  generateImportanceFeedback,
  generateChat2TransitionMessage,
  createFollowUpPrompt,
} from '@/lib/utils/messageTemplates';

export async function POST(request: NextRequest) {
  try {
    const { messages, phase, currentAttributeIndex, action, attributeName, phase0Context, importance, attributeDetails } = await request.json();

    // follow-up 질문 생성 (모든 중요도에 대해, 맥락 없어도 진행)
    if (action === 'generate_followup' && attributeName) {
      try {
        // phase0Context가 비어있거나 '없어요'여도 AI가 속성 세부사항 기반으로 질문 생성
        const prompt = createFollowUpPrompt(attributeName, phase0Context || '', importance, attributeDetails);
        const followUpQuestion = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        return NextResponse.json({
          message: followUpQuestion.trim(),
        });
      } catch (error) {
        console.error('Failed to generate follow-up:', error);
        return NextResponse.json(
          { error: 'Failed to generate follow-up question' },
          { status: 500 }
        );
      }
    }

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
            ? `\n\n**중요함**: ${currentAttribute.importanceExamples.important}\n**보통**: ${currentAttribute.importanceExamples.normal}\n**중요하지 않음**: ${currentAttribute.importanceExamples.notImportant}`
            : ''
        }`;

        return NextResponse.json({
          messages: [explanation, importanceQuestion],
          type: 'follow_up',
          requiresImportance: true,
        });
      } else if (intent.type === 'importance_response') {
        // 중요도 답변 → follow-up 질문 생성 (버튼 방식과 동일)
        const importance = intent.importance as ImportanceLevel;

        // follow-up 질문 생성을 위해 phase0Context 가져오기
        const sessionMessages = messages as Message[];
        let phase0Context = '';

        // Phase 0 맥락 찾기 (두 번째 user 메시지가 Phase 0 응답)
        const userMessages = sessionMessages.filter((m: Message) => m.role === 'user');
        if (userMessages.length >= 1) {
          phase0Context = userMessages[0].content;
        }

        // Phase 0 맥락이 있으면 AI 기반 follow-up, 없으면 기본 질문
        let followUpQuestion = '';
        if (phase0Context && phase0Context.trim() !== '' && phase0Context !== '없어요') {
          try {
            const followUpPrompt = createFollowUpPrompt(
              currentAttribute.name,
              phase0Context,
              importance,
              currentAttribute.details
            );
            followUpQuestion = await generateAIResponse(followUpPrompt, [
              {
                role: 'user',
                parts: [{ text: followUpPrompt }],
              },
            ]);
          } catch (error) {
            console.error('Failed to generate follow-up:', error);
            followUpQuestion = `${currentAttribute.name}이(가) 중요하시군요! 구체적으로 어떤 상황에서 특히 중요하신가요?`;
          }
        } else {
          followUpQuestion = `${currentAttribute.name}이(가) 중요하시군요! 구체적으로 어떤 상황에서 특히 중요하신가요?`;
        }

        return NextResponse.json({
          type: 'natural_language_followup',
          importance,
          followUpQuestion: followUpQuestion.trim(),
        });
      } else {
        // off_topic → 원래 주제로 유도 + 중요도 질문 다시 표시
        const redirectMessage = `지금은 ${currentAttribute.name}에 대해 여쭤보고 있어요. 이 부분이 고객님께 얼마나 중요하신지 알려주셔야 더 정확한 추천을 해드릴 수 있어요!`;

        // 중요도 질문 (마지막 파트만 - 중요도 질문)
        const importanceQuestion = `고객님께서는 **'${currentAttribute.name}'**에 대해 어느 정도 중요하게 생각하시나요?${
          currentAttribute.importanceExamples
            ? `\n\n**중요함**: ${currentAttribute.importanceExamples.important}\n**보통**: ${currentAttribute.importanceExamples.normal}\n**중요하지 않음**: ${currentAttribute.importanceExamples.notImportant}`
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
