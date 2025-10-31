import { SessionState, Message, AttributeAssessment, ImportanceLevel } from '@/types';

const SESSION_KEY = 'babyitem_session';

// 초기 세션 상태
export const createInitialSession = (): SessionState => ({
  phase: 'home',
  messages: [],
  attributeAssessments: {
    temperatureControl: null,
    hygiene: null,
    material: null,
    usability: null,
    portability: null,
    priceValue: null,
    durability: null,
    additionalFeatures: null,
  },
  currentAttribute: 0,
  additionalContext: [],
  accuracy: 0,
});

// 세션 저장
export const saveSession = (session: SessionState): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
};

// 세션 불러오기
export const loadSession = (): SessionState => {
  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }
  }
  return createInitialSession();
};

// 세션 초기화
export const clearSession = (): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
  }
};

// 메시지 추가
export const addMessage = (
  session: SessionState,
  role: 'user' | 'assistant',
  content: string,
  phase?: 'chat1' | 'chat2',
  options?: { isImportanceQuestion?: boolean; isConfirmation?: boolean }
): SessionState => {
  const newMessage: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
    phase,
    ...(options?.isImportanceQuestion && { isImportanceQuestion: true }),
    ...(options?.isConfirmation && { isConfirmation: true }),
  };

  return {
    ...session,
    messages: [...session.messages, newMessage],
  };
};

// 속성 평가 업데이트
export const updateAttributeAssessment = (
  session: SessionState,
  attribute: keyof AttributeAssessment,
  value: ImportanceLevel
): SessionState => {
  return {
    ...session,
    attributeAssessments: {
      ...session.attributeAssessments,
      [attribute]: value,
    },
  };
};

// 다음 속성으로 이동
export const moveToNextAttribute = (session: SessionState): SessionState => {
  return {
    ...session,
    currentAttribute: session.currentAttribute + 1,
  };
};

// Phase 변경
export const changePhase = (
  session: SessionState,
  phase: SessionState['phase']
): SessionState => {
  return {
    ...session,
    phase,
  };
};

// 추가 맥락 추가
export const addAdditionalContext = (
  session: SessionState,
  context: string
): SessionState => {
  return {
    ...session,
    additionalContext: [...session.additionalContext, context],
  };
};

// 정확도 업데이트
export const updateAccuracy = (session: SessionState, accuracy: number): SessionState => {
  return {
    ...session,
    accuracy: Math.min(100, Math.max(0, accuracy)),
  };
};

// 구조화된 질문 단계가 완료되었는지 확인
export const isStructuredPhaseComplete = (session: SessionState): boolean => {
  const assessments = Object.values(session.attributeAssessments);
  return assessments.every((value) => value !== null);
};

// 진행률 계산 (0-100)
export const calculateProgress = (session: SessionState): number => {
  // Structured phase: 0-100% (7 questions)
  const totalAttributes = 7; // CORE_ATTRIBUTES.length
  const completedAttributes = Object.values(session.attributeAssessments).filter(
    (v) => v !== null
  ).length;
  const structuredProgress = (completedAttributes / totalAttributes) * 100;

  // Open phase: stays at 100%
  if (session.phase === 'chat2') {
    return 100;
  }

  return Math.min(100, structuredProgress);
};
