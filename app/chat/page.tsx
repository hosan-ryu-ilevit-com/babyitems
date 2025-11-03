'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Message, ImportanceLevel, SessionState } from '@/types';
import { CORE_ATTRIBUTES } from '@/data/attributes';
import {
  loadSession,
  saveSession,
  addMessage,
  updateAttributeAssessment,
  moveToNextAttribute,
  changePhase,
  calculateProgress,
  clearSession,
} from '@/lib/utils/session';
import {
  generateIntroMessage,
  generateWarmupQuestion,
  generateAttributeQuestion,
  generateImportanceFeedback,
  generateChat2TransitionMessage,
  generateChat2ReadyMessage,
  generateVeryImportantFollowUp,
} from '@/lib/utils/messageTemplates';

// 마크다운 볼드 및 리스트 처리 함수
function formatMarkdown(text: string) {
  // 줄 단위로 분리
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // 리스트 아이템 감지: "- " 또는 "* " 또는 "• "로 시작
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
      // **텍스트** → <strong>텍스트</strong> 처리
      const parts = content.split(/(\*\*.*?\*\*)/g);
      const formattedContent = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index} className="font-bold">{boldText}</strong>;
        }
        return <span key={index}>{part}</span>;
      });

      return (
        <div key={lineIndex} className="flex items-start gap-2 my-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-200 mt-2 shrink-0" />
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }

    // 일반 텍스트 (볼드 처리)
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <strong key={index} className="font-bold">{boldText}</strong>;
      }
      return <span key={index}>{part}</span>;
    });

    return <div key={lineIndex}>{formattedLine}</div>;
  });
}

// 타이핑 이펙트 컴포넌트
function TypingMessage({ content, onComplete, onUpdate }: { content: string; onComplete?: () => void; onUpdate?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
        // DOM 업데이트 후 스크롤 (React 렌더링 완료 대기)
        if (onUpdate) {
          requestAnimationFrame(() => {
            onUpdate();
          });
        }
      }, 10); // 10ms per character (더 빠르게)

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete, onUpdate]);

  return <span>{formatMarkdown(displayedContent)}</span>;
}

export default function ChatPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAttributeIndex, setCurrentAttributeIndex] = useState(0);
  const [phase, setPhase] = useState<'chat1' | 'chat2'>('chat1');
  const [isPhase0Complete, setIsPhase0Complete] = useState(false); // Phase 0 워밍업 완료 여부
  const [progress, setProgress] = useState(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showPhase0QuickReply, setShowPhase0QuickReply] = useState(false); // Phase 0 "건너뛰기" 버튼
  const [showFollowUpSkip, setShowFollowUpSkip] = useState(false); // Follow-up "넘어가기" 버튼
  const [showChat2QuickReply, setShowChat2QuickReply] = useState(false);
  const [showRecommendButton, setShowRecommendButton] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<{ [messageId: string]: boolean }>({});
  const [showToggleButtons, setShowToggleButtons] = useState<{ [messageId: string]: boolean }>({});
  const [waitingForFollowUpResponse, setWaitingForFollowUpResponse] = useState(false); // "매우 중요" follow-up 응답 대기 중
  const [lastFollowUpQuestion, setLastFollowUpQuestion] = useState<string>(''); // 마지막 follow-up 질문 저장
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydration 에러 방지: 클라이언트에서만 렌더링
  useEffect(() => {
    setMounted(true);
  }, []);

  // 메시지를 순차적으로 추가하는 함수
  const addMessagesSequentially = async (
    session: SessionState,
    messageParts: Array<{ text: string; details?: string[]; isImportanceQuestion?: boolean }> | string[],
    phase: 'chat1' | 'chat2'
  ): Promise<SessionState> => {
    let updatedSession = session;

    for (let i = 0; i < messageParts.length; i++) {
      const messagePart = messageParts[i];
      const isLastPart = i === messageParts.length - 1;

      // 새로운 형식 지원
      const content = typeof messagePart === 'string' ? messagePart : messagePart.text;
      const details = typeof messagePart === 'object' ? messagePart.details : undefined;
      const isImportanceQuestion = typeof messagePart === 'object' ? messagePart.isImportanceQuestion : isLastPart;

      updatedSession = addMessage(
        updatedSession,
        'assistant',
        content,
        phase,
        { isImportanceQuestion, details }
      );

      // 즉시 UI 업데이트
      setMessages([...updatedSession.messages]);
      saveSession(updatedSession);

      // 마지막 메시지에 타이핑 효과 적용
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
      setTypingMessageId(lastMessage.id);

      // 타이핑이 끝날 때까지 대기 (약 10ms * 문자 수 + 여유시간)
      await new Promise((resolve) => {
        const typingDuration = content.length * 10 + 300;
        setTimeout(resolve, typingDuration);
      });

      // 타이핑 완료 후 다음 메시지 전에 약간의 딜레이
      if (!isLastPart) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return updatedSession;
  };

  // 초기 세션 로드 및 첫 메시지
  useEffect(() => {
    if (!mounted) return;

    const session = loadSession();

    if (session.messages.length === 0) {
      // 첫 방문: 환영 메시지 및 Phase 0 워밍업 질문
      const initializeChat = async () => {
        let updatedSession = changePhase(session, 'chat1');
        updatedSession = addMessage(updatedSession, 'assistant', generateIntroMessage(), 'chat1');
        setMessages([...updatedSession.messages]);
        saveSession(updatedSession);

        // 첫 메시지 타이핑 효과
        const firstMessage = updatedSession.messages[0];
        setTypingMessageId(firstMessage.id);

        // 타이핑 완료 대기
        await new Promise((resolve) => {
          const typingDuration = generateIntroMessage().length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        // 딜레이 후 Phase 0 워밍업 질문
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Phase 0 워밍업 질문 추가
        const warmupQuestion = generateWarmupQuestion();
        updatedSession = addMessage(updatedSession, 'assistant', warmupQuestion, 'chat1');
        setMessages([...updatedSession.messages]);
        saveSession(updatedSession);

        // 워밍업 질문 타이핑 효과
        const warmupMessage = updatedSession.messages[updatedSession.messages.length - 1];
        setTypingMessageId(warmupMessage.id);

        // 타이핑 완료 대기
        await new Promise((resolve) => {
          const typingDuration = warmupQuestion.length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        // 타이핑 완료 후 Phase 0 건너뛰기 버튼 표시
        setTypingMessageId(null);
        setShowPhase0QuickReply(true);
      };

      initializeChat();
    } else {
      // 기존 세션 복원
      setMessages(session.messages);
      setCurrentAttributeIndex(session.currentAttribute);
      setPhase(session.phase === 'chat2' ? 'chat2' : 'chat1');
      setProgress(calculateProgress(session));

      // Phase 0 완료 여부 확인
      if (session.phase0Context) {
        setIsPhase0Complete(true);
      }

      // 마지막 메시지가 중요도 질문이면 빠른 응답 버튼 표시
      const lastMessage = session.messages[session.messages.length - 1];
      if (session.phase === 'chat1' && lastMessage?.role === 'assistant' && lastMessage?.isImportanceQuestion) {
        setShowQuickReplies(true);
      }

      // 기존 메시지 중 디테일이 있는 메시지들의 토글 버튼 표시
      const toggleStates: { [messageId: string]: boolean } = {};
      session.messages.forEach((msg) => {
        if (msg.details && msg.details.length > 0) {
          toggleStates[msg.id] = true;
        }
      });
      setShowToggleButtons(toggleStates);
    }
  }, [mounted]);

  // 자동 스크롤 함수 (모바일 최적화)
  const scrollToBottom = () => {
    // requestAnimationFrame으로 DOM 업데이트 후 실행 보장
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  };

  // 메시지 변경 시 자동 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 타이핑 중에도 스크롤 (추가 보험)
  useEffect(() => {
    if (typingMessageId) {
      const interval = setInterval(scrollToBottom, 50); // 100ms → 50ms (더 빠른 반응)
      return () => clearInterval(interval);
    }
  }, [typingMessageId]);

  // 모바일 viewport 높이 변화 감지 (키보드 올라올 때)
  useEffect(() => {
    const handleResize = () => {
      scrollToBottom();
    };

    window.addEventListener('resize', handleResize);
    // visualViewport API 지원 시 사용 (모바일 최적화)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Phase 0 건너뛰기 핸들러
  const handlePhase0Skip = async () => {
    setShowPhase0QuickReply(false);

    let session = loadSession();

    // Phase 0를 '없어요'로 저장 (건너뜀 표시)
    session.phase0Context = '없어요';

    // 사용자 메시지 추가
    session = addMessage(session, 'user', '없어요', 'chat1');
    setMessages(session.messages);
    saveSession(session);

    // 짧은 딜레이
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Phase 0 완료 메시지 (정보 업데이트됨 없이 바로 넘어감)
    const transitionMsg = '알겠습니다! 그럼 이제 구체적으로 여쭤볼게요.';
    session = addMessage(session, 'assistant', transitionMsg, 'chat1');
    setMessages([...session.messages]);
    saveSession(session);

    const transMsg = session.messages[session.messages.length - 1];
    setTypingMessageId(transMsg.id);

    await new Promise((resolve) => {
      const typingDuration = transitionMsg.length * 10 + 300;
      setTimeout(resolve, typingDuration);
    });

    // 딜레이 후 첫 속성 질문 시작
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 첫 번째 속성 질문
    const firstQuestionParts = generateAttributeQuestion(0);
    session = await addMessagesSequentially(session, firstQuestionParts, 'chat1');

    saveSession(session);
    setMessages([...session.messages]);
    setIsPhase0Complete(true);

    // 마지막 메시지 완료 후 빠른 응답 버튼 표시
    setTypingMessageId(null);
    setShowQuickReplies(true);
  };

  // 빠른 응답 버튼 클릭 핸들러 (LLM 없이 즉시 처리)
  const handleQuickReply = async (importance: ImportanceLevel) => {
    setShowQuickReplies(false);

    let session = loadSession();
    const attribute = CORE_ATTRIBUTES[currentAttributeIndex];

    // 사용자 선택 메시지
    const userMessage = importance === '중요함' ? '중요합니다' : importance === '보통' ? '보통입니다' : '중요하지 않습니다';
    session = addMessage(session, 'user', userMessage, 'chat1');
    setMessages([...session.messages]);
    saveSession(session);

    // 짧은 딜레이
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 중요도 업데이트 (세션에만 저장, 확인 메시지는 나중에)
    session = updateAttributeAssessment(session, attribute.key as keyof import('@/types').CoreValues, importance);
    saveSession(session);

    // 모든 선택에 대해 Phase 0 맥락 기반 follow-up 질문 (맥락 없어도 AI 호출)
    const phase0Context = session.phase0Context || ''; // undefined면 빈 문자열

    // 항상 AI를 통해 질문 생성 (맥락이 비어있어도 속성 세부사항 기반으로 생성)
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          phase: 'chat1',
          action: 'generate_followup',
          attributeName: attribute.name,
          phase0Context: phase0Context, // 빈 문자열이어도 전달
          importance: importance,
          attributeDetails: attribute.details,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const followUpQuestion = data.message || generateVeryImportantFollowUp(attribute.name, attribute.details);

        session = loadSession();
        session = addMessage(session, 'assistant', followUpQuestion, 'chat1');
        setMessages([...session.messages]);
        saveSession(session);

        const lastMsg = session.messages[session.messages.length - 1];
        setTypingMessageId(lastMsg.id);

        await new Promise((resolve) => {
          const typingDuration = followUpQuestion.length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        setTypingMessageId(null);
        setWaitingForFollowUpResponse(true);
        setShowFollowUpSkip(true);
        setLastFollowUpQuestion(followUpQuestion); // 질문 저장
        setIsLoading(false);
        return;
      }
    } catch (error) {
      console.error('Failed to generate follow-up:', error);
      // 에러 시 fallback 질문 사용
      const followUpQuestion = generateVeryImportantFollowUp(attribute.name, attribute.details);
      session = addMessage(session, 'assistant', followUpQuestion, 'chat1');
      setMessages([...session.messages]);
      saveSession(session);

      const lastMsg = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMsg.id);

      await new Promise((resolve) => {
        const typingDuration = followUpQuestion.length * 10 + 300;
        setTimeout(resolve, typingDuration);
      });

      setTypingMessageId(null);
      setWaitingForFollowUpResponse(true);
      setShowFollowUpSkip(true);
      setLastFollowUpQuestion(followUpQuestion); // 질문 저장
    }
    setIsLoading(false);
  };

  // Follow-up 넘어가기 핸들러
  const handleFollowUpSkip = async () => {
    setShowFollowUpSkip(false);
    setWaitingForFollowUpResponse(false);

    let session = loadSession();

    // 사용자 메시지 추가
    session = addMessage(session, 'user', '다음 질문으로 넘어갈게요', 'chat1');
    setMessages(session.messages);
    saveSession(session);

    // 짧은 딜레이
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 확인 메시지
    const attribute = CORE_ATTRIBUTES[currentAttributeIndex];
    const importance = session.attributeAssessments[attribute.key as keyof import('@/types').CoreValues];
    const feedbackMessage = generateImportanceFeedback(attribute.name, importance!);

    session = addMessage(session, 'assistant', feedbackMessage, 'chat1', { isConfirmation: true });
    setMessages([...session.messages]);
    saveSession(session);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 다음 속성으로 이동
    const nextIndex = currentAttributeIndex + 1;

    if (nextIndex < CORE_ATTRIBUTES.length) {
      const nextQuestionParts = generateAttributeQuestion(nextIndex);
      session = await addMessagesSequentially(session, nextQuestionParts, 'chat1');

      session = moveToNextAttribute(session);
      setCurrentAttributeIndex(nextIndex);

      saveSession(session);
      setMessages([...session.messages]);
      setProgress(calculateProgress(session));

      setTypingMessageId(null);
      setShowQuickReplies(true);
    } else {
      // 모든 속성 완료 → Chat2로 전환
      const transitionMessage = generateChat2TransitionMessage();
      session = changePhase(addMessage(session, 'assistant', transitionMessage, 'chat2'), 'chat2');

      saveSession(session);
      setMessages([...session.messages]);
      setPhase('chat2');
      setProgress(100);

      const lastMessage = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMessage.id);

      setTimeout(() => {
        setTypingMessageId(null);
        setShowChat2QuickReply(true);
      }, transitionMessage.length * 10 + 300);
    }
  };

  // Chat1 메시지 전송 (대화형)
  const handleChat1Message = async (userInput: string) => {
    setShowQuickReplies(false);
    setShowPhase0QuickReply(false); // Phase 0 버튼도 숨김
    setShowFollowUpSkip(false); // Follow-up 버튼도 숨김
    let session = loadSession();

    // Phase 0 워밍업 응답 처리 (phase0Context가 undefined인 경우에만)
    if (session.phase0Context === undefined) {
      // Phase 0 맥락 저장
      session.phase0Context = userInput;
      session = addMessage(session, 'user', userInput, 'chat1');
      setMessages(session.messages);
      saveSession(session);

      // 짧은 딜레이
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 확인 메시지 (초록색 체크)
      const confirmMsg = '정보 업데이트됨';
      session = addMessage(session, 'assistant', confirmMsg, 'chat1', { isConfirmation: true });
      setMessages([...session.messages]);
      saveSession(session);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Phase 0 완료 메시지
      const transitionMsg = '알겠습니다! 그럼 이제 구체적으로 여쭤볼게요.';
      session = addMessage(session, 'assistant', transitionMsg, 'chat1');
      setMessages([...session.messages]);
      saveSession(session);

      const transMsg = session.messages[session.messages.length - 1];
      setTypingMessageId(transMsg.id);

      await new Promise((resolve) => {
        const typingDuration = transitionMsg.length * 10 + 300;
        setTimeout(resolve, typingDuration);
      });

      // 딜레이 후 첫 속성 질문 시작
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 첫 번째 속성 질문
      const firstQuestionParts = generateAttributeQuestion(0);
      session = await addMessagesSequentially(session, firstQuestionParts, 'chat1');

      saveSession(session);
      setMessages([...session.messages]);
      setIsPhase0Complete(true);

      // 마지막 메시지 완료 후 빠른 응답 버튼 표시
      setTypingMessageId(null);
      setShowQuickReplies(true);
      return;
    }

    // follow-up 응답 처리
    if (waitingForFollowUpResponse) {
      session = addMessage(session, 'user', userInput, 'chat1');
      setMessages(session.messages);
      saveSession(session);

      setWaitingForFollowUpResponse(false);
      setIsLoading(true);

      const attribute = CORE_ATTRIBUTES[currentAttributeIndex];
      const initialImportance = session.attributeAssessments[attribute.key as keyof import('@/types').CoreValues];

      // AI를 통한 중요도 재평가
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reassess_importance',
            attributeName: attribute.name,
            followUpQuestion: lastFollowUpQuestion,
            userAnswer: userInput,
            initialImportance: initialImportance,
            attributeDetails: attribute.details,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const { action: reassessAction, newImportance, reason } = data;

          // 중요도가 변경되었으면 업데이트
          if (reassessAction !== 'maintain' && newImportance !== initialImportance) {
            session = loadSession();
            session = updateAttributeAssessment(
              session,
              attribute.key as keyof import('@/types').CoreValues,
              newImportance as ImportanceLevel
            );
            saveSession(session);
            console.log(`중요도 재평가: ${initialImportance} → ${newImportance} (이유: ${reason})`);
          }
        }
      } catch (error) {
        console.error('Failed to reassess importance:', error);
        // 에러 시 초기 중요도 유지
      }

      setIsLoading(false);

      // 짧은 딜레이
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 확인 메시지 표시 (재평가 후 최종 중요도)
      session = loadSession();
      const finalImportance = session.attributeAssessments[attribute.key as keyof import('@/types').CoreValues];
      const feedbackMessage = generateImportanceFeedback(attribute.name, finalImportance!);

      session = addMessage(session, 'assistant', feedbackMessage, 'chat1', { isConfirmation: true });
      setMessages([...session.messages]);
      saveSession(session);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 다음 속성으로 이동
      const nextIndex = currentAttributeIndex + 1;

      if (nextIndex < CORE_ATTRIBUTES.length) {
        const nextQuestionParts = generateAttributeQuestion(nextIndex);
        session = await addMessagesSequentially(session, nextQuestionParts, 'chat1');

        session = moveToNextAttribute(session);
        setCurrentAttributeIndex(nextIndex);

        saveSession(session);
        setMessages([...session.messages]);
        setProgress(calculateProgress(session));

        setTypingMessageId(null);
        setShowQuickReplies(true);
      } else {
        // 모든 속성 완료 → Chat2로 전환
        const transitionMessage = generateChat2TransitionMessage();
        session = changePhase(addMessage(session, 'assistant', transitionMessage, 'chat2'), 'chat2');

        saveSession(session);
        setMessages([...session.messages]);
        setPhase('chat2');
        setProgress(100);

        const lastMessage = session.messages[session.messages.length - 1];
        setTypingMessageId(lastMessage.id);

        setTimeout(() => {
          setTypingMessageId(null);
          setShowChat2QuickReply(true);
        }, transitionMessage.length * 10 + 300);
      }
      return;
    }

    // 일반 Chat1 메시지 (기존 로직)
    session = addMessage(session, 'user', userInput, 'chat1');
    setMessages(session.messages);
    saveSession(session);

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          phase: 'chat1',
          currentAttributeIndex,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();

      session = loadSession();

      // 자연어로 중요도 판단된 경우 (버튼과 동일하게 처리)
      if (data.type === 'natural_language_followup') {
        const attribute = CORE_ATTRIBUTES[currentAttributeIndex];
        const importance = data.importance;

        // 중요도 업데이트
        session = updateAttributeAssessment(
          session,
          attribute.key as keyof import('@/types').CoreValues,
          importance
        );
        saveSession(session);

        // 짧은 딜레이
        await new Promise((resolve) => setTimeout(resolve, 500));

        // follow-up 질문 추가
        session = addMessage(session, 'assistant', data.followUpQuestion, 'chat1');
        setMessages([...session.messages]);
        saveSession(session);

        const lastMsg = session.messages[session.messages.length - 1];
        setTypingMessageId(lastMsg.id);

        await new Promise((resolve) => {
          const typingDuration = data.followUpQuestion.length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        setTypingMessageId(null);
        setWaitingForFollowUpResponse(true);
        setShowFollowUpSkip(true); // "넘어가기" 버튼 표시
        setIsLoading(false);
        return;
      }

      // 중요도가 파악되었으면 업데이트
      if (data.importance) {
        const attribute = CORE_ATTRIBUTES[currentAttributeIndex];
        session = updateAttributeAssessment(
          session,
          attribute.key as keyof import('@/types').CoreValues,
          data.importance
        );
      }

      // 다음 속성으로 이동
      if (data.nextAttributeIndex !== undefined) {
        session = moveToNextAttribute(session);
        setCurrentAttributeIndex(data.nextAttributeIndex);
      }

      // importance_response 타입인 경우 (확인 메시지 + 다음 질문)
      if (data.type === 'next_attribute' && data.confirmationMessage) {
        // 확인 메시지 추가
        session = addMessage(session, 'assistant', data.confirmationMessage, 'chat1', { isConfirmation: true });
        setMessages([...session.messages]);
        saveSession(session);

        // 확인 메시지 표시 후 딜레이
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 다음 질문들을 순차적으로 추가
        if (data.messages && Array.isArray(data.messages)) {
          session = await addMessagesSequentially(session, data.messages, 'chat1');
        }

        setProgress(calculateProgress(session));
        saveSession(session);
        setMessages([...session.messages]);

        // 마지막 메시지 완료 후 빠른 응답 버튼 표시
        setTypingMessageId(null);
        setShowQuickReplies(true);
      }
      // Chat2로 전환
      else if (data.type === 'transition_to_chat2' && data.confirmationMessage) {
        // 확인 메시지 추가
        session = addMessage(session, 'assistant', data.confirmationMessage, 'chat1', { isConfirmation: true });
        setMessages([...session.messages]);
        saveSession(session);

        // 확인 메시지 표시 후 딜레이
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 전환 메시지 추가
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          session = addMessage(session, 'assistant', data.messages[0], 'chat2');
        }

        session = changePhase(session, 'chat2');
        setPhase('chat2');
        setProgress(100);

        saveSession(session);
        setMessages([...session.messages]);

        const lastMessage = session.messages[session.messages.length - 1];
        setTypingMessageId(lastMessage.id);

        // 타이핑 완료 후 Chat2 빠른 응답 버튼 표시
        setTimeout(() => {
          setTypingMessageId(null);
          setShowChat2QuickReply(true);
        }, (data.messages && data.messages[0] ? data.messages[0].length : 0) * 10 + 300);
      }
      // redirect 타입 (off_topic 처리 후 중요도 질문 다시 표시)
      else if (data.type === 'redirect' || data.type === 'follow_up') {
        // 첫 번째 메시지 (설명 또는 리다이렉트) 추가 (일반 회색 말풍선)
        session = addMessage(session, 'assistant', data.messages[0], 'chat1');
        setMessages([...session.messages]);
        saveSession(session);

        // 첫 번째 메시지 타이핑 효과
        const firstMsg = session.messages[session.messages.length - 1];
        setTypingMessageId(firstMsg.id);

        // 타이핑 완료 대기
        await new Promise((resolve) => {
          const typingDuration = data.messages[0].length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        // 딜레이 후 중요도 질문 표시
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 중요도 질문 추가 (하늘색 배경)
        session = addMessage(session, 'assistant', data.messages[1], 'chat1', { isImportanceQuestion: true });
        setMessages([...session.messages]);
        saveSession(session);

        // 중요도 질문 타이핑 효과
        const questionMsg = session.messages[session.messages.length - 1];
        setTypingMessageId(questionMsg.id);

        // 타이핑 완료 대기
        await new Promise((resolve) => {
          const typingDuration = data.messages[1].length * 10 + 300;
          setTimeout(resolve, typingDuration);
        });

        // 타이핑 완료 후 버튼 표시
        setTypingMessageId(null);
        setShowQuickReplies(true);
      }
      // 일반 응답 (단일 메시지나 여러 메시지)
      else {
        if (data.messages && Array.isArray(data.messages)) {
          // 여러 메시지를 순차적으로 추가
          session = await addMessagesSequentially(session, data.messages, 'chat1');
        } else if (data.message) {
          // 단일 메시지
          session = addMessage(session, 'assistant', data.message, 'chat1');
          setMessages([...session.messages]);
          saveSession(session);

          const lastMessage = session.messages[session.messages.length - 1];
          setTypingMessageId(lastMessage.id);
        }

        setProgress(calculateProgress(session));
        saveSession(session);
        setMessages([...session.messages]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      session = addMessage(session, 'assistant', '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.', 'chat1');
      setMessages(session.messages);
    } finally {
      setIsLoading(false);
    }
  };

  // Chat2 빠른 응답 버튼 핸들러
  const handleChat2QuickReply = async () => {
    setShowChat2QuickReply(false);

    let session = loadSession();

    // 사용자 선택 메시지
    session = addMessage(session, 'user', '없어요', 'chat2');
    setMessages([...session.messages]);
    saveSession(session);

    // 짧은 딜레이
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 추천 준비 완료 메시지
    const readyMessage = generateChat2ReadyMessage();
    session = addMessage(session, 'assistant', readyMessage, 'chat2');
    setMessages([...session.messages]);
    saveSession(session);

    // 타이핑 효과
    const lastMessage = session.messages[session.messages.length - 1];
    setTypingMessageId(lastMessage.id);

    // 타이핑 완료 후 추천 받기 버튼 표시
    setTimeout(() => {
      setTypingMessageId(null);
      setShowRecommendButton(true);
    }, readyMessage.length * 10 + 300);
  };

  // Chat2 메시지 전송
  const handleChat2Message = async (userInput: string) => {
    setShowChat2QuickReply(false);

    let session = loadSession();
    session = addMessage(session, 'user', userInput, 'chat2');
    setMessages(session.messages);
    saveSession(session);

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          phase: 'chat2',
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();

      session = loadSession();
      session = addMessage(session, 'assistant', data.message, 'chat2');

      const newMessage = session.messages[session.messages.length - 1];

      // Chat2 단계에서는 항상 100% 유지
      setProgress(100);

      saveSession(session);
      setMessages(session.messages);
      setTypingMessageId(newMessage.id);

      // 응답 완료 후 추천 받기 버튼 표시
      setTimeout(() => {
        setTypingMessageId(null);
        setShowRecommendButton(true);
      }, data.message.length * 10 + 300);
    } catch (error) {
      console.error('Failed to send message:', error);
      session = addMessage(session, 'assistant', '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.', 'chat2');
      setMessages(session.messages);
    } finally {
      setIsLoading(false);
    }
  };

  // 통합 메시지 전송
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input.trim();
    setInput('');

    if (phase === 'chat1') {
      await handleChat1Message(userInput);
    } else if (phase === 'chat2') {
      await handleChat2Message(userInput);
    }
  };

  // 추천 받기
  const handleGetRecommendation = () => {
    // result 페이지로 이동 (API 호출은 result 페이지에서)
    router.push('/result');
  };

  // SSR 방지
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (window.confirm('대화 내역을 초기화하고 처음부터 다시 시작하시겠습니까?')) {
                  clearSession();
                  window.location.reload();
                }
              }}
              className="text-sm text-gray-600 hover:text-gray-900 font-semibold"
            >
              처음부터
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">
                {progress >= 100 ? '추천 받을 수 있어요!' : '진행률'}
              </span>
              <span className="text-xs font-semibold text-gray-700">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-linear-to-r from-gray-900 to-gray-700"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </header>

        {/* Messages */}
        <main
          className="flex-1 overflow-y-auto px-4 py-6"
          style={{
            paddingBottom: '140px',
          }}
        >
          <div className="space-y-4">
            {messages.map((message, index) => {
              // 확인 메시지는 특별한 스타일로 표시
              if (message.isConfirmation) {
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flex justify-center items-center py-2"
                  >
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                      <span>{message.content}</span>
                    </div>
                  </motion.div>
                );
              }

              // 첫 번째 인트로 메시지는 특별한 스타일 (배경 없음, 100% 너비, 프로필 이미지)
              const isIntroMessage = index === 0 && message.role === 'assistant';

              if (isIntroMessage) {
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full px-4"
                  >
                    {/* 프로필 이미지 - 왼쪽 위 */}
                    <div className="mb-3">
                      <div className="w-10 h-10 rounded-full border border-gray-200 overflow-hidden bg-white">
                        <Image
                          src="/images/192x192.png"
                          alt="쇼핑 비서"
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>

                    {/* 메시지 내용 */}
                    <div className="w-full py-1 whitespace-pre-wrap text-gray-900">
                      {typingMessageId === message.id ? (
                        <TypingMessage
                          content={message.content}
                          onUpdate={scrollToBottom}
                          onComplete={() => setTypingMessageId(null)}
                        />
                      ) : (
                        formatMarkdown(message.content)
                      )}
                    </div>

                    {/* 하단 디바이더 */}
                    <div className="mt-4 mb-2 border-t border-gray-200 opacity-50" />
                  </motion.div>
                );
              }

              // 어시스턴트 메시지 (user 제외)
              if (message.role === 'assistant') {
                const hasDetails = message.details && message.details.length > 0;
                const isExpanded = expandedDetails[message.id] || false;

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex justify-start"
                  >
                    <div
                      className={`px-4 py-3 whitespace-pre-wrap ${
                        message.isImportanceQuestion
                          ? 'bg-linear-to-b from-blue-50 to-blue-50 text-gray-900 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
                          : 'text-gray-900 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
                      }`}
                    >
                      {typingMessageId === message.id ? (
                        <TypingMessage
                          content={message.content}
                          onUpdate={scrollToBottom}
                          onComplete={() => {
                            setTypingMessageId(null);
                            // Chat1 phase에서 중요도 질문이 완료되면 빠른 응답 버튼 표시
                            if (phase === 'chat1' && message.role === 'assistant' && message.isImportanceQuestion) {
                              setShowQuickReplies(true);
                            }
                            // 디테일이 있는 메시지의 타이핑이 끝나면 토글 버튼 표시
                            if (hasDetails) {
                              setShowToggleButtons((prev) => ({
                                ...prev,
                                [message.id]: true,
                              }));
                            }
                          }}
                        />
                      ) : (
                        formatMarkdown(message.content)
                      )}

                      {/* 속성 디테일 토글 버튼 */}
                      {hasDetails && (typingMessageId !== message.id && showToggleButtons[message.id]) && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          className="mt-3"
                        >
                          <button
                            onClick={() => {
                              setExpandedDetails((prev) => ({
                                ...prev,
                                [message.id]: !prev[message.id],
                              }));
                              // 토글 후 스크롤 (확장 시)
                              if (!isExpanded) {
                                setTimeout(scrollToBottom, 100);
                              }
                            }}
                            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            <motion.span
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="inline-block"
                            >
                              ▶
                            </motion.span>
                            <span className="font-medium">자세히 보기</span>
                          </button>

                          {/* 디테일 리스트 (토글 가능) */}
                          <motion.div
                            initial={false}
                            animate={{
                              height: isExpanded ? 'auto' : 0,
                              opacity: isExpanded ? 1 : 0,
                              marginTop: isExpanded ? 12 : 0,
                            }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            style={{ overflow: 'hidden' }}
                            className="pl-4 border-l-2 border-gray-300"
                          >
                            {message.details?.map((detail, idx) => (
                              <div key={idx} className="flex items-start gap-2 my-1.5">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                                <span className="flex-1 text-sm text-gray-700">{detail}</span>
                              </div>
                            ))}

                            {/* AI 설명 요청 버튼 */}
                            
                          </motion.div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              }

              // 사용자 메시지
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full flex justify-end"
                >
                  <div className="max-w-[90%] px-4 py-3 whitespace-pre-wrap bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl">
                    {formatMarkdown(message.content)}
                  </div>
                </motion.div>
              );
            })}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-gray-100 px-4 py-3 rounded-2xl">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Bottom Input Area - Fixed */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-10" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {/* Phase 0 건너뛰기 버튼 */}
          {phase === 'chat1' && showPhase0QuickReply && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide"
            >
              <button
                onClick={handlePhase0Skip}
                className="shrink-0 px-4 py-2 bg-blue-200 text-gray-900 text-sm font-medium rounded-full hover:bg-blue-300 transition-colors"
              >
                없어요
              </button>
            </motion.div>
          )}

          {/* Follow-up 넘어가기 버튼 */}
          {phase === 'chat1' && showFollowUpSkip && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide"
            >
              <button
                onClick={handleFollowUpSkip}
                className="shrink-0 px-4 py-2 bg-blue-200 text-gray-900 text-sm font-medium rounded-full hover:bg-blue-300 transition-colors"
              >
                넘어가기
              </button>
            </motion.div>
          )}

          {/* 빠른 응답 버튼 (Chat1에서만) */}
          {phase === 'chat1' && showQuickReplies && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide"
            >
              <button
                onClick={() => handleQuickReply('중요함')}
                className="shrink-0 px-4 py-2 bg-blue-200 text-gray-900 text-sm font-medium rounded-full hover:bg-blue-300 transition-colors"
              >
                중요함
              </button>
              <button
                onClick={() => handleQuickReply('보통')}
                className="shrink-0 px-4 py-2 bg-blue-50 text-gray-900 text-sm font-medium rounded-full hover:bg-blue-100 transition-colors"
              >
                보통
              </button>
              <button
                onClick={() => handleQuickReply('중요하지 않음')}
                className="shrink-0 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
              >
                중요하지 않음
              </button>
              <button
                onClick={() => {
                  inputRef.current?.focus();
                  inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
                className="shrink-0 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-full hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                직접 입력
              </button>
            </motion.div>
          )}

          {/* Chat2 빠른 응답 버튼 */}
          {phase === 'chat2' && showChat2QuickReply && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide"
            >
              <button
                onClick={handleChat2QuickReply}
                className="shrink-0 px-4 py-2 bg-blue-200 text-gray-900 text-sm font-medium rounded-full hover:bg-blue-300 transition-colors"
              >
                없어요
              </button>
            </motion.div>
          )}

          {/* 추천 받기 버튼 (Chat2) */}
          {phase === 'chat2' && showRecommendButton && !isLoading && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGetRecommendation}
              className="w-full h-12 mb-3 bg-linear-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white font-semibold rounded-full shadow-lg transition-all"
            >
              추천 받기
            </motion.button>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={phase === 'chat1' ? '대화하듯 편하게 물어보세요' : '더 고려할 점이 있으신가요?'}
              disabled={isLoading}
              rows={1}
              className="flex-1 min-h-[48px] max-h-[120px] px-4 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none overflow-y-auto scrollbar-hide text-gray-900"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 bg-linear-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
