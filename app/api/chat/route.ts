import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, ImportanceLevel, PrioritySettings } from '@/types';
import { ASSISTANT_CHAT2_PROMPT, CORE_ATTRIBUTES } from '@/data/attributes';
import { analyzeUserIntent, generateDetailedExplanation } from '@/lib/ai/intentAnalyzer';
import {
  createFollowUpPrompt,
  createReassessmentPrompt,
  generateVeryImportantFollowUp,
} from '@/lib/utils/messageTemplates';
import { assessContextRelevance } from '@/lib/utils/contextRelevance';

/**
 * Priority 설정을 자연스러운 한국어로 요약
 */
function generatePrioritySummary(settings: PrioritySettings): string {
  const attributeNames: { [key: string]: string } = {
    temperatureControl: '온도 조절/유지 성능',
    hygiene: '위생/세척 편의성',
    material: '소재 안전성',
    usability: '사용 편의성',
    portability: '휴대성',
    additionalFeatures: '부가 기능'
  };

  const highPriority = Object.entries(settings)
    .filter(([, level]) => level === 'high')
    .map(([key]) => attributeNames[key] || key);

  const mediumPriority = Object.entries(settings)
    .filter(([, level]) => level === 'medium')
    .map(([key]) => attributeNames[key] || key);

  let summary = '';

  if (highPriority.length > 0) {
    summary += `특히 **${highPriority.join(', ')}**을(를) 중요하게 생각하시는군요!`;
  }

  if (mediumPriority.length > 0) {
    if (summary) summary += '\n';
    summary += `그리고 ${mediumPriority.join(', ')}도 적당히 고려하시고 싶으시고요.`;
  }

  return summary;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, phase, currentAttributeIndex, action, attributeName, phase0Context, importance, attributeDetails, followUpQuestion, userAnswer, initialImportance, prioritySettings, conversationHistory } = body;

    // Priority 요약 메시지 생성
    if (action === 'generate_priority_summary' && prioritySettings) {
      const summary = generatePrioritySummary(prioritySettings);
      return NextResponse.json({ summary });
    }

    // 자연어 예산 파싱
    if (action === 'parse_budget') {
      try {
        const { userInput } = body;

        const prompt = `사용자가 입력한 예산 정보를 분석하여 BudgetRange로 변환하세요.

사용자 입력: "${userInput}"

BudgetRange 옵션:
- "0-50000": 5만원 이하
- "50000-100000": 5~10만원
- "100000-150000": 10~15만원
- "150000+": 15만원 이상
- null: 예산 제한 없음 (사용자가 "상관없어요", "제한없어요" 등으로 표현한 경우)

예시:
- "7만원" → "50000-100000"
- "5만원 이하" → "0-50000"
- "10만원 정도" → "100000-150000"
- "5~8만원" → "50000-100000"
- "15만원 이상" → "150000+"
- "상관없어요" → null
- "제한 없어요" → null

JSON 형식으로 답변하세요:
{
  "budget": "0-50000" 또는 "50000-100000" 또는 "100000-150000" 또는 "150000+" 또는 null
}`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ budget: parsed.budget });
        }

        return NextResponse.json({ budget: null });
      } catch (error) {
        console.error('Failed to parse budget:', error);
        return NextResponse.json({ budget: null });
      }
    }

    // Priority 플로우: 전환 의도 분석
    if (action === 'analyze_transition_intent') {
      try {
        const { userMessage } = body;

        const prompt = `사용자가 다음 속성으로 넘어가고 싶은지 의도를 분석하세요.

사용자 메시지: "${userMessage}"

이 메시지가 "다음으로 넘어가겠다"는 긍정적 의사를 표현하는지 판단하세요.

예시:
- "네" / "예" / "넵" / "응" → YES
- "좋아요" / "그래요" / "오케이" → YES
- "넘어가요" / "다음으로" / "넘어갑시다" → YES
- "아니요" / "좀 더 얘기하고 싶어요" → NO
- "잘 모르겠어요" / "질문 있어요" → NO

JSON 형식으로 답변하세요:
{
  "shouldTransition": true 또는 false
}`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ shouldTransition: parsed.shouldTransition || false });
        }

        return NextResponse.json({ shouldTransition: false });
      } catch (error) {
        console.error('Failed to analyze transition intent:', error);
        return NextResponse.json({ shouldTransition: false });
      }
    }

    // Priority 플로우: 속성별 자유 대화 모드
    if (action === 'generate_attribute_conversation' && attributeName) {
      try {
        const { currentTurn } = body;

        const prompt = `당신은 분유포트 추천 전문가 AI입니다. 사용자의 **${attributeName}**에 대한 니즈를 파악하기 위해 대화하고 있습니다.

## 사용자의 초기 상황 (Phase 0 컨텍스트):
${phase0Context || '(정보 없음)'}

## ${attributeName}의 세부 사항:
${attributeDetails?.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n') || ''}

## 지금까지의 대화 히스토리:
${conversationHistory || '(첫 대화)'}

## 현재 대화 턴: ${currentTurn}/3

---

## 대화 구조 (3턴 고정):
- **턴 1**: 첫 번째 디테일 질문 (구체적 상황 파악)
- **턴 2**: 답변에 대한 반응 + 두 번째 디테일 질문 (추가 상황 파악)
- **턴 3**: 답변에 대한 반응 + 종합 정리 + "넘어가도 괜찮을까요?"

## 응답 가이드:
- **톤**: 친근하고 공감하는 30-40대 육아 맘 상담사 스타일
- **길이**: 정확히 2문장
- **구조**: (공감/반응 + 정보/팁) → 구체적 질문
- **필수**: 항상 질문으로 끝나야 함 (? 로 종료)

## 턴별 응답 방식:
### 턴 1 또는 2:
{
  "message": "공감/반응 + 디테일 질문",
  "shouldTransition": false
}

### 턴 3 (마지막):
{
  "message": "답변 반응 + 종합 정리. ${attributeName}에 대해 충분히 파악했습니다! 혹시 더 말씀하실 게 있으시면 지금 알려주세요. 아니면 다음 기준으로 넘어가도 괜찮을까요?",
  "shouldTransition": true
}

**중요**:
- 턴 1, 2는 shouldTransition: false
- 턴 3은 반드시 shouldTransition: true
- 턴 3의 message는 반드시 "~파악했습니다! 혹시 더 말씀하실 게 있으시면~ 넘어가도 괜찮을까요?" 형식으로 끝나야 함`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        // JSON 파싱
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            message: parsed.message || aiResponse.trim(),
            shouldTransition: parsed.shouldTransition || false,
            transitionMessage: parsed.transitionMessage || null,
          });
        }

        return NextResponse.json({
          message: aiResponse.trim(),
          shouldTransition: false,
          transitionMessage: null,
        });
      } catch (error) {
        console.error('Failed to generate attribute conversation:', error);
        return NextResponse.json(
          { error: 'Failed to generate conversation response' },
          { status: 500 }
        );
      }
    }

    // follow-up 답변 기반 중요도 재평가
    if (action === 'reassess_importance' && attributeName && followUpQuestion && userAnswer && initialImportance) {
      try {
        const prompt = createReassessmentPrompt(attributeName, initialImportance, followUpQuestion, userAnswer, attributeDetails);
        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        // JSON 파싱
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const reassessment = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            action: reassessment.action,
            newImportance: reassessment.newImportance,
            reason: reassessment.reason,
          });
        }

        // 파싱 실패 시 유지
        return NextResponse.json({
          action: 'maintain',
          newImportance: initialImportance,
          reason: '재평가 실패',
        });
      } catch (error) {
        console.error('Failed to reassess importance:', error);
        // 에러 시 초기값 유지
        return NextResponse.json({
          action: 'maintain',
          newImportance: initialImportance,
          reason: '재평가 오류',
        });
      }
    }

    // follow-up 질문 생성 (모든 중요도에 대해, 맥락 없어도 진행)
    if (action === 'generate_followup' && attributeName) {
      try {
        // 1. 연관도 판단 (LLM 기반)
        const relevance = await assessContextRelevance(phase0Context || '', attributeName);

        // 2. 연관도 기반 프롬프트 생성
        const prompt = createFollowUpPrompt(attributeName, phase0Context || '', relevance, importance, attributeDetails);

        // 3. AI 응답 생성
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

        // 항상 AI 기반 follow-up 질문 생성 (맥락 없어도 진행)
        let followUpQuestion = '';
        try {
          // 1. 연관도 판단 (LLM 기반)
          const relevance = await assessContextRelevance(phase0Context || '', currentAttribute.name);

          // 2. 연관도 기반 프롬프트 생성
          const followUpPrompt = createFollowUpPrompt(
            currentAttribute.name,
            phase0Context || '', // 맥락 없어도 빈 문자열로 전달
            relevance,
            importance,
            currentAttribute.details
          );

          // 3. AI 응답 생성
          followUpQuestion = await generateAIResponse(followUpPrompt, [
            {
              role: 'user',
              parts: [{ text: followUpPrompt }],
            },
          ]);
        } catch (error) {
          console.error('Failed to generate follow-up:', error);
          // 에러 시 fallback: 속성 세부사항 기반 질문
          followUpQuestion = generateVeryImportantFollowUp(currentAttribute.name, currentAttribute.details);
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
