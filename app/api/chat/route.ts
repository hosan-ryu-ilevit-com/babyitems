import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, PrioritySettings } from '@/types';
import { ASSISTANT_CHAT2_PROMPT } from '@/data/attributes';

/**
 * Priority 설정을 자연스러운 한국어로 요약
 * @param settings - Priority 설정
 * @param phase0Context - 추가 요청사항 (선택적)
 */
function generatePrioritySummary(settings: PrioritySettings, phase0Context?: string): string {
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

  // phase0Context가 있으면 추가
  if (phase0Context && phase0Context.trim()) {
    if (summary) summary += '\n\n';
    summary += `말씀하신 **"${phase0Context}"** 같은 특별한 상황도 함께 고려할게요!`;
  }

  return summary;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, phase, action, attributeName, phase0Context, attributeDetails, conversationHistory, currentTurn, prioritySettings } = body;

    // Priority 요약 메시지 생성
    if (action === 'generate_priority_summary' && prioritySettings) {
      const summary = generatePrioritySummary(prioritySettings, phase0Context);
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

        // 최대 5턴 제한 (강제 전환)
        if (currentTurn >= 5) {
          return NextResponse.json({
            message: `${attributeName}에 대해 충분히 파악했습니다! 다음 기준으로 넘어갈게요.`,
            shouldTransition: true,
            forceTransition: true, // 강제 전환 플래그
          });
        }

        const prompt = `당신은 분유포트 추천 전문가 AI입니다. 분유포트를 처음으로 구매하는 사용자의 **${attributeName}**에 대한 니즈를 파악하기 위해 대화하고 있습니다.

## 사용자의 초기 상황 (Phase 0 컨텍스트):
${phase0Context || '(정보 없음)'}

## ${attributeName}의 세부 사항:
${attributeDetails?.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n') || ''}

## 지금까지의 대화 히스토리:
${conversationHistory || '(첫 대화)'}

## 현재 대화 턴: ${currentTurn}/5 (최대 5턴)

---

## 대화 구조 (최대 5턴, 3턴 권장):
- **턴 1-2**: 세부사항을 기초로 한 구체적 상황 파악 질문
- **턴 3 이상**: 사용자 답변에 공감 후 **반드시 전환 제안 포함**
- **턴 4-5**: 사용자가 더 말하고 싶어하는 경우만

## 응답 가이드:
- **톤**: 친근하고 공감하는 육아용품 구매자를 대상으로 하는 상담사 스타일. 유저는 분유포트를 '처음으로' 구매하는 것으로 간주. 따라서 관련 지식이 없기에, 어려운 개념을 사용하거나 물어봐서는 안되며 친절하게 가이드 해야 함. 사용자가 답하기 까다로운 질문 (아기에게 분유를 타실 때 몇 도의 물을 사용하시나요?) 같은 것을 바로 하면 안되며, 필요하다면 맥락이나 예시를 충분히 설명한 이후에 진행해야 함.
- **길이**: 정확히 2문장 (턴 1-2) 또는 2-3문장 (턴 3+, 전환 제안 포함)
- **구조**: (공감/반응 + 정보/팁) → 구체적 질문 (턴 1-2) / 전환 제안 (턴 3+)
- **필수**: 항상 질문으로 끝나야 함 (? 로 종료)

## **절대 금지 사항**:
❌ "파악했습니다", "확인했습니다", "충분히 알게 되었습니다" 같은 내적 프로세스 표현
❌ "이 정보를 바탕으로", "분석 결과" 같은 AI 사고 과정 노출
❌ 전문 용어 (예: "냉각 속도", "열효율" 등) - 쉬운 표현 사용
❌ 턴 3 이상에서 전환 제안 없이 계속 질문만 하기

## 턴별 응답 방식:

### **턴 1-2** (정보 수집):
{
  "message": "[사용자 답변 공감] + [실용적 팁]. [구체적 질문]?",
  "shouldTransition": false
}

예시:
{
  "message": "빨리 끓여서 식히는 기능이 중요하시군요! 제품마다 온도 조절 방식이 다른데, 혹시 분유를 탈 때 주로 어떤 시간대에 사용하시나요?",
  "shouldTransition": false
}

### **턴 3 이상** (전환 제안 필수):
{
  "message": "[사용자 답변 공감] + [간단한 팁]. ${attributeName}에 대해서는 잘 알게 됐어요! 혹시 더 궁금한 점 있으시면 말씀해 주시고, 괜찮으시면 다음으로 넘어가도 될까요?",
  "shouldTransition": true
}

**좋은 예시** (턴 3):
{
  "message": "새벽 수유 시 빠른 준비가 정말 중요하시겠어요! 끓이는 시간이 짧은 제품이 딱 맞을 것 같아요. 온도 조절/유지 성능에 대해서는 잘 알게 됐어요! 혹시 더 궁금한 점 있으시면 말씀해 주시고, 괜찮으시면 다음으로 넘어가도 될까요?",
  "shouldTransition": true
}

**나쁜 예시** (내적 프로세스 노출):
{
  "message": "사용자님께서 빠른 기능을 중요하게 생각하시는 것을 확인했으니, 충분히 파악된 것 같습니다!",
  "shouldTransition": true
}
→ ❌ "확인했으니", "파악된 것 같습니다" 같은 내부 사고 표현 금지

## **핵심 규칙**:
1. 턴 1-2: shouldTransition = false
2. 턴 3+: shouldTransition = true (전환 제안 반드시 포함)
3. 턴 5: 자동 강제 전환
4. 내적 프로세스 절대 금지
5. 자연스럽고 공감적인 톤 유지
6. 쉬운 표현 사용

**JSON 형식으로만 응답하세요.**`;

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

    // ==========================================
    // DEPRECATED: 기존 플로우 액션들 (Priority 도입으로 사용 안 함)
    // - reassess_importance: Follow-up 답변 기반 중요도 재평가
    // - generate_followup: Phase 0 맥락 기반 follow-up 질문 생성
    //
    // Priority 플로우에서는 'generate_attribute_conversation' 사용
    // ==========================================

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // ==========================================
    // DEPRECATED: 기존 Chat1 플로우 (Priority 도입으로 사용 안 함)
    // Priority 페이지에서 중요도를 먼저 설정하므로,
    // 이 분기는 더 이상 실행되지 않습니다.
    // ==========================================

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
