import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry } from '@/lib/ai/gemini';
import { PrioritySettings, BudgetRange } from '@/types';
import { PRIORITY_ATTRIBUTES } from '@/data/attributes';

const CONTEXTUAL_QUESTION_PROMPT = `당신은 분유포트 제품 추천 전문가입니다.

**사용자 상황**:
- 중요도 설정: {prioritySettings}
- 예산: {budget}
- 현재 대화 턴: {currentTurn}/5

**이전 대화 내용**:
{conversationHistory}

**중요하게 생각하는 속성들**:
{highPriorityAttributes}

**임무**:
사용자가 분유포트를 선택할 때 **생각하지 못했던 중요한 부분**을 깨닫게 하는 질문을 생성하세요.

**질문 가이드라인**:
1. **대답하기 쉬운 질문**: 예/아니오, 또는 간단한 답변으로 대답할 수 있어야 함
2. **구체적인 상황**: "평소에 분유를 얼마나 자주 타시나요?" 같은 구체적 질문
3. **디테일 뽑기**: 사용자의 일상, 습관, 환경에 대한 세부사항 파악
4. **새로운 관점 제시**: 사용자가 미처 생각하지 못했던 포인트 강조

**턴별 질문 전략**:
- 턴 1-2: 일상적인 사용 패턴 파악 (예: "분유를 주로 어느 시간대에 타시나요?")
- 턴 3-4: 구체적인 상황과 환경 (예: "주방 공간이 넓은 편인가요, 좁은 편인가요?")
- 턴 5: 최종 확인 및 추가 니즈 (예: "혹시 이동하면서 사용하실 계획도 있으신가요?")

**예시 질문**:
- "새벽에 수유하실 때가 많으신가요? 조용한 작동음이 중요할 수 있어요."
- "쌍둥이 육아 중이신가요? 한 번에 많은 양을 준비하시는지 궁금해요."
- "세척을 자주 하시는 편인가요? 분해가 쉬운 제품이 관리하기 편할 거예요."
- "주방 공간이 넉넉하신가요? 작고 심플한 디자인이 필요하실 수도 있어요."

**주의사항**:
- 질문은 1-2문장으로 짧고 명확하게
- 친근하고 공감적인 톤 사용 (30-40대 육아맘 대상)
- 이전 대화에서 이미 물어본 내용은 반복하지 않기
- 너무 전문적이거나 어려운 용어 사용하지 않기

한 가지 질문만 생성해주세요 (JSON 형식 없이 질문 텍스트만):`;

export async function POST(request: NextRequest) {
  try {
    const { prioritySettings, budget, conversationHistory, currentTurn } = await request.json();

    if (!prioritySettings || !budget || currentTurn === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 'high' 우선순위 속성들만 필터링
    const highPriorities = Object.entries(prioritySettings)
      .filter(([_, value]) => value === 'high')
      .map(([key, _]) => {
        const attr = PRIORITY_ATTRIBUTES.find(a => a.key === key);
        return attr ? `- ${attr.name}: ${attr.description}\n  세부사항: ${attr.details.join(', ')}` : '';
      })
      .filter(Boolean)
      .join('\n');

    // 중요도 설정을 텍스트로 변환
    const priorityText = Object.entries(prioritySettings)
      .map(([key, value]) => {
        const attr = PRIORITY_ATTRIBUTES.find(a => a.key === key);
        const levelText = value === 'high' ? '중요함' : value === 'medium' ? '보통' : '중요하지 않음';
        return attr ? `${attr.name}: ${levelText}` : '';
      })
      .filter(Boolean)
      .join(', ');

    // 예산 텍스트로 변환
    const budgetText = typeof budget === 'string' && (budget === '0-50000' || budget === '50000-100000' || budget === '100000-150000' || budget === '150000+')
      ? budget === '0-50000' ? '5만원 이하'
        : budget === '50000-100000' ? '5~10만원'
        : budget === '100000-150000' ? '10~15만원'
        : '15만원 이상'
      : budget;

    // 대화 이력 텍스트로 변환
    const historyText = conversationHistory && conversationHistory.length > 0
      ? conversationHistory
      : '(아직 대화 내용 없음)';

    // 프롬프트 생성
    const prompt = CONTEXTUAL_QUESTION_PROMPT
      .replace('{prioritySettings}', priorityText)
      .replace('{budget}', budgetText)
      .replace('{currentTurn}', currentTurn.toString())
      .replace('{conversationHistory}', historyText)
      .replace('{highPriorityAttributes}', highPriorities || '(중요한 속성 없음)');

    // Gemini API 호출
    const question = await callGeminiWithRetry(async () => {
      const { getModel } = await import('@/lib/ai/gemini');
      const model = getModel(0.7); // 창의적 질문 생성
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // 질문을 깨끗하게 정리 (따옴표, 줄바꿈 등 제거)
    const cleanedQuestion = question.trim().replace(/^["']|["']$/g, '');

    return NextResponse.json({ question: cleanedQuestion });
  } catch (error) {
    console.error('Generate contextual question error:', error);
    return NextResponse.json(
      { error: 'Failed to generate question' },
      { status: 500 }
    );
  }
}
