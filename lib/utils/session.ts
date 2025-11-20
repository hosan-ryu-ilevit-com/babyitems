import { SessionState, Message, AttributeAssessment, ImportanceLevel, PrioritySettings, BudgetRange } from '@/types';
import { PRIORITY_ATTRIBUTES } from '@/data/attributes';

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
    try {
      const sessionStr = JSON.stringify(session);
      sessionStorage.setItem(SESSION_KEY, sessionStr);
    } catch (e) {
      // Quota exceeded or circular reference errors
      if (e instanceof Error) {
        if (e.name === 'QuotaExceededError') {
          console.error('❌ SessionStorage quota exceeded. Clearing old session...');
          // Try to clear and save minimal session (phone 보존)
          try {
            sessionStorage.removeItem(SESSION_KEY);
            const minimalSession = createInitialSession();
            // phone 필드 보존
            if (session.phone) {
              minimalSession.phone = session.phone;
            }
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(minimalSession));
          } catch (retryError) {
            console.error('❌ Failed to save even minimal session:', retryError);
          }
        } else {
          console.error('❌ Failed to save session:', e.message);
        }
      }
    }
  }
};

// 세션 불러오기
export const loadSession = (): SessionState => {
  let existingPhone: string | undefined;

  if (typeof window !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // phone 필드 보존 (에러 발생 시 사용)
          if (parsed && typeof parsed === 'object' && parsed.phone) {
            existingPhone = parsed.phone;
          }
          // Basic validation
          if (parsed && typeof parsed === 'object') {
            return parsed as SessionState;
          }
        } catch (parseError) {
          console.error('❌ Failed to parse session (corrupted data). Creating new session...');
          // Clear corrupted session
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (storageError) {
      console.error('❌ SessionStorage access failed:', storageError);
    }
  }

  // 초기 세션 생성 시 phone 보존
  const initialSession = createInitialSession();
  if (existingPhone) {
    initialSession.phone = existingPhone;
  }
  return initialSession;
};

// 세션 초기화
export const clearSession = (): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
  }
};

// 메시지 추가 (메타데이터 포함)
export const addMessage = (
  session: SessionState,
  role: 'user' | 'assistant',
  content: string,
  phase?: 'chat1' | 'chat2',
  options?: {
    isImportanceQuestion?: boolean;
    isConfirmation?: boolean;
    details?: string[];
    attributeKey?: string;
    conversationId?: string;
    turnNumber?: number;
    isTransitionPrompt?: boolean;
    showDetailButton?: boolean;
  }
): SessionState => {
  const newMessage: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
    phase,
    ...(options?.isImportanceQuestion && { isImportanceQuestion: true }),
    ...(options?.isConfirmation && { isConfirmation: true }),
    ...(options?.details && { details: options.details }),
    ...(options?.attributeKey && { attributeKey: options.attributeKey as keyof import('@/types').CoreValues }),
    ...(options?.conversationId && { conversationId: options.conversationId }),
    ...(options?.turnNumber && { turnNumber: options.turnNumber }),
    ...(options?.isTransitionPrompt && { isTransitionPrompt: true }),
    ...(options?.showDetailButton && { showDetailButton: true }),
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
  // Chat2 단계: 항상 100%
  if (session.phase === 'chat2') {
    return 100;
  }

  // Priority 플로우: 질문할 속성 개수 기준으로 계산
  if (session.prioritySettings && isPriorityComplete(session.prioritySettings)) {
    const attributesToAsk = getAttributesToAsk(session);

    // 질문할 속성이 없으면 100% (모두 'low'인 경우)
    if (attributesToAsk.length === 0) {
      return 100;
    }

    // 질문할 속성 중 완료된 개수 계산
    const completedCount = attributesToAsk.filter(
      key => session.attributeAssessments[key as keyof AttributeAssessment] !== null
    ).length;

    return Math.min(100, (completedCount / attributesToAsk.length) * 100);
  }

  // 기존 플로우 (DEPRECATED): 7개 전체 속성 기준
  const relevantAssessments = [
    session.attributeAssessments.temperatureControl,
    session.attributeAssessments.hygiene,
    session.attributeAssessments.material,
    session.attributeAssessments.usability,
    session.attributeAssessments.portability,
    session.attributeAssessments.priceValue,
    session.attributeAssessments.additionalFeatures,
  ];

  const completedAttributes = relevantAssessments.filter((v) => v !== null).length;
  const structuredProgress = (completedAttributes / 7) * 100;

  return Math.min(100, structuredProgress);
};

// ===== Priority 관련 헬퍼 함수 =====

// Priority 설정 저장
export const savePrioritySettings = (
  session: SessionState,
  settings: PrioritySettings
): SessionState => {
  return {
    ...session,
    prioritySettings: settings,
  };
};

// Priority 설정에서 중요도가 'high'인 속성만 필터링
export const getHighPriorityAttributes = (session: SessionState): string[] => {
  if (!session.prioritySettings) return [];

  return Object.entries(session.prioritySettings)
    .filter(([, level]) => level === 'high')
    .map(([key]) => key);
};

// Priority 설정에서 중요도가 'medium'인 속성만 필터링
export const getMediumPriorityAttributes = (session: SessionState): string[] => {
  if (!session.prioritySettings) return [];

  return Object.entries(session.prioritySettings)
    .filter(([, level]) => level === 'medium')
    .map(([key]) => key);
};

// 채팅에서 질문할 속성 목록 가져오기
// 1순위: 'high' 속성, 2순위: 'medium' 속성, 3순위: 빈 배열
export const getAttributesToAsk = (session: SessionState): string[] => {
  const highPriority = getHighPriorityAttributes(session);
  if (highPriority.length > 0) return highPriority;

  const mediumPriority = getMediumPriorityAttributes(session);
  if (mediumPriority.length > 0) return mediumPriority;

  return []; // 모두 'low'인 경우 스킵
};

// 예산 저장
export const saveBudget = (
  session: SessionState,
  budget: BudgetRange
): SessionState => {
  return {
    ...session,
    budget,
  };
};

// 바로 추천받기 플래그 설정
export const setQuickRecommendation = (
  session: SessionState,
  isQuick: boolean
): SessionState => {
  return {
    ...session,
    isQuickRecommendation: isQuick,
  };
};

// Priority 설정 완료 여부 확인 (6개 모두 선택)
export const isPriorityComplete = (settings: PrioritySettings): boolean => {
  const requiredKeys = PRIORITY_ATTRIBUTES.map(attr => attr.key);
  return requiredKeys.every(key => settings[key as keyof PrioritySettings] !== undefined);
};

// 특정 속성에 대한 대화 히스토리 추출 (메타데이터 기반)
export const getAttributeConversationHistory = (
  session: SessionState,
  attributeKey: string,
  conversationId: string
): Message[] => {
  return session.messages.filter(
    msg => msg.attributeKey === attributeKey && msg.conversationId === conversationId
  );
};

// 특정 속성에 대한 대화 히스토리를 텍스트로 변환
export const formatConversationHistory = (messages: Message[]): string => {
  return messages
    .map(msg => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
    .join('\n');
};
