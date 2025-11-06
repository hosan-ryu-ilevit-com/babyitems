/**
 * 채팅 페이지 헬퍼 함수들
 * - Priority 플로우 전용
 * - 중복 코드 제거 및 일관성 확보
 */

import { SessionState, Message } from '@/types';
import { CORE_ATTRIBUTES } from '@/data/attributes';
import {
  loadSession,
  saveSession,
  addMessage,
  updateAttributeAssessment,
  getAttributeConversationHistory,
  formatConversationHistory,
  isPriorityComplete,
} from './session';
import { generateVeryImportantFollowUp } from './messageTemplates';

/**
 * 다음 'high' 속성 찾기
 */
export function getNextHighAttribute(
  session: SessionState,
  currentAttrKey: string
): { nextAttr: typeof CORE_ATTRIBUTES[0] | null; nextIndex: number; allComplete: boolean } {
  const highPriorityKeys = Object.entries(session.prioritySettings || {})
    .filter(([, level]) => level === 'high')
    .map(([key]) => key);

  const currentIndex = highPriorityKeys.indexOf(currentAttrKey);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= highPriorityKeys.length) {
    return { nextAttr: null, nextIndex: -1, allComplete: true };
  }

  const nextAttrKey = highPriorityKeys[nextIndex];
  const nextAttr = CORE_ATTRIBUTES.find(attr => attr.key === nextAttrKey);
  const nextAttrIndexInCore = CORE_ATTRIBUTES.findIndex(attr => attr.key === nextAttrKey);

  return {
    nextAttr: nextAttr || null,
    nextIndex: nextAttrIndexInCore,
    allComplete: false,
  };
}

/**
 * 속성별 대화 시작
 * - 메타데이터 포함한 메시지 추가
 * - API 호출
 * - 상태 업데이트
 */
export async function startAttributeConversation(
  session: SessionState,
  attribute: typeof CORE_ATTRIBUTES[0],
  attributeIndex: number,
  setters: {
    setMessages: (msgs: Message[]) => void;
    setTypingMessageId: (id: string | null) => void;
    setCurrentAttributeIndex: (idx: number) => void;
    setInAttributeConversation: (val: boolean) => void;
    setAttributeConversationTurn: (turn: number) => void;
    setShowFollowUpSkip: (val: boolean) => void;
    setIsLoading: (val: boolean) => void;
  }
): Promise<void> {
  const { setMessages, setTypingMessageId, setCurrentAttributeIndex, setInAttributeConversation, setAttributeConversationTurn, setShowFollowUpSkip, setIsLoading } = setters;

  // conversationId 생성 (속성키_타임스탬프)
  const conversationId = `${attribute.key}_${Date.now()}`;

  // 중요도 저장
  session = updateAttributeAssessment(
    session,
    attribute.key as keyof import('@/types').CoreValues,
    '중요함'
  );
  saveSession(session);

  // 속성 인트로 메시지
  const attrIntroMsg = `중요하다고 해주신 **${attribute.name}**에 대해 더 자세히 여쭤볼게요.`;
  session = loadSession();
  session = addMessage(session, 'assistant', attrIntroMsg, 'chat1', {
    attributeKey: attribute.key,
    conversationId,
    turnNumber: 0, // 인트로는 턴 0
    showDetailButton: true, // '자세히 보기' 버튼 표시
  });
  setMessages([...session.messages]);
  saveSession(session);

  const attrIntroMessage = session.messages[session.messages.length - 1];
  setTypingMessageId(attrIntroMessage.id);

  await new Promise((resolve) => setTimeout(resolve, attrIntroMsg.length * 10 + 300));
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 첫 번째 질문 생성
  setIsLoading(true);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_attribute_conversation',
        attributeName: attribute.name,
        attributeDetails: attribute.details,
        conversationHistory: '', // 첫 대화
        phase0Context: session.phase0Context || '',
        currentTurn: 1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const followUpQuestion = data.message || generateVeryImportantFollowUp(attribute.name, attribute.details);

      session = loadSession();
      session = addMessage(session, 'assistant', followUpQuestion, 'chat1', {
        attributeKey: attribute.key,
        conversationId,
        turnNumber: 1,
      });
      setMessages([...session.messages]);
      saveSession(session);

      const lastMsg = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMsg.id);

      await new Promise((resolve) => setTimeout(resolve, followUpQuestion.length * 10 + 300));

      setTypingMessageId(null);
      setCurrentAttributeIndex(attributeIndex);
      setInAttributeConversation(true);
      setAttributeConversationTurn(1); // 턴 1부터 시작
      setShowFollowUpSkip(true);
    }
  } catch (error) {
    console.error('Failed to start attribute conversation:', error);
  }
  setIsLoading(false);
}

/**
 * 모든 'high' 속성 완료 후 추천 버튼 표시
 */
export async function showFinalRecommendButton(
  session: SessionState,
  setters: {
    setMessages: (msgs: Message[]) => void;
    setTypingMessageId: (id: string | null) => void;
    setShowRecommendButton: (val: boolean) => void;
  }
): Promise<void> {
  const { setMessages, setTypingMessageId, setShowRecommendButton } = setters;

  const finalMsg = '네, 잘 알겠습니다! 말씀해주신 내용을 바탕으로 최적의 제품을 찾아드릴게요. 아래 버튼을 눌러 추천을 받아보세요!';
  session = addMessage(session, 'assistant', finalMsg, 'chat1');
  setMessages([...session.messages]);
  saveSession(session);

  const msg = session.messages[session.messages.length - 1];
  setTypingMessageId(msg.id);

  await new Promise((resolve) => setTimeout(resolve, finalMsg.length * 10 + 300));
  setTypingMessageId(null);
  setShowRecommendButton(true);
}

/**
 * 대화 히스토리 안전하게 추출 (메타데이터 기반)
 */
export function extractConversationHistory(
  session: SessionState,
  attributeKey: string,
  conversationId: string
): string {
  const messages = getAttributeConversationHistory(session, attributeKey, conversationId);

  // 턴 번호가 1 이상인 메시지만 (인트로 제외)
  const conversationMessages = messages.filter(msg =>
    msg.turnNumber && msg.turnNumber >= 1
  );

  return formatConversationHistory(conversationMessages);
}

/**
 * 현재 conversationId 가져오기 (최근 메시지에서 추출)
 */
export function getCurrentConversationId(
  session: SessionState,
  attributeKey: string
): string | null {
  // 역순으로 순회하여 최근 conversationId 찾기
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i];
    if (msg.attributeKey === attributeKey && msg.conversationId) {
      return msg.conversationId;
    }
  }
  return null;
}
