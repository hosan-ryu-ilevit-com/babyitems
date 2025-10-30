'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Message, ImportanceLevel } from '@/types';
import { CORE_ATTRIBUTES } from '@/data/attributes';
import {
  loadSession,
  saveSession,
  addMessage,
  updateAttributeAssessment,
  moveToNextAttribute,
  changePhase,
  calculateProgress,
  isStructuredPhaseComplete,
  clearSession,
} from '@/lib/utils/session';
import {
  generateIntroMessage,
  generateAttributeQuestion,
  generateImportanceFeedback,
  generateChat2TransitionMessage,
} from '@/lib/utils/messageTemplates';

// 마크다운 볼드 처리 함수
function formatMarkdown(text: string) {
  // **텍스트** → <strong>텍스트</strong>
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
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
        // 타이핑 중에 스크롤 업데이트
        if (onUpdate) {
          onUpdate();
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
  const [progress, setProgress] = useState(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hydration 에러 방지: 클라이언트에서만 렌더링
  useEffect(() => {
    setMounted(true);
  }, []);

  // 초기 세션 로드 및 첫 메시지
  useEffect(() => {
    if (!mounted) return;

    const session = loadSession();

    if (session.messages.length === 0) {
      // 첫 방문: 환영 메시지 및 첫 질문 (고정된 템플릿)
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: generateIntroMessage(),
        timestamp: Date.now(),
        phase: 'chat1',
      };

      // 첫 번째 질문을 여러 버블로 나누기
      const firstQuestionParts = generateAttributeQuestion(0);

      let updatedSession = changePhase(session, 'chat1');
      updatedSession = addMessage(updatedSession, 'assistant', welcomeMessage.content, 'chat1');

      // 각 파트를 별도의 메시지로 추가
      firstQuestionParts.forEach((part) => {
        updatedSession = addMessage(updatedSession, 'assistant', part, 'chat1');
      });

      saveSession(updatedSession);
      setMessages(updatedSession.messages);

      // 마지막 메시지에만 타이핑 효과 적용
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
      setTypingMessageId(lastMessage.id);
    } else {
      // 기존 세션 복원
      setMessages(session.messages);
      setCurrentAttributeIndex(session.currentAttribute);
      setPhase(session.phase === 'chat2' ? 'chat2' : 'chat1');
      setProgress(calculateProgress(session));
    }
  }, [mounted]);

  // 자동 스크롤 함수
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 메시지 변경 시 자동 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 타이핑 중에도 스크롤 (추가 보험)
  useEffect(() => {
    if (typingMessageId) {
      const interval = setInterval(scrollToBottom, 100);
      return () => clearInterval(interval);
    }
  }, [typingMessageId]);

  // 빠른 응답 버튼 클릭 핸들러 (LLM 없이 즉시 처리)
  const handleQuickReply = async (importance: ImportanceLevel) => {
    setShowQuickReplies(false);

    let session = loadSession();
    const attribute = CORE_ATTRIBUTES[currentAttributeIndex];

    // 사용자 선택 메시지
    const userMessage = importance === '매우 중요' ? '매우 중요합니다' : importance === '중요' ? '중요합니다' : '보통입니다';
    session = addMessage(session, 'user', userMessage, 'chat1');
    setMessages(session.messages);

    // 중요도 업데이트
    session = updateAttributeAssessment(session, attribute.key as any, importance);

    // 피드백 메시지 생성
    const feedbackMessage = generateImportanceFeedback(attribute.name, importance, false);
    session = addMessage(session, 'assistant', feedbackMessage, 'chat1');

    const nextIndex = currentAttributeIndex + 1;

    if (nextIndex < CORE_ATTRIBUTES.length) {
      // 다음 속성 질문을 여러 버블로 나누기
      const nextQuestionParts = generateAttributeQuestion(nextIndex);

      // 각 파트를 별도의 메시지로 추가
      nextQuestionParts.forEach((part) => {
        session = addMessage(session, 'assistant', part, 'chat1');
      });

      session = moveToNextAttribute(session);
      setCurrentAttributeIndex(nextIndex);

      saveSession(session);
      setMessages(session.messages);
      setProgress(calculateProgress(session));

      // 마지막 메시지에만 타이핑 효과 적용
      const lastMessage = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMessage.id);
    } else {
      // 모든 속성 완료 → Chat2로 전환
      const transitionMessage = generateChat2TransitionMessage();
      session = changePhase(addMessage(session, 'assistant', transitionMessage, 'chat2'), 'chat2');

      saveSession(session);
      setMessages(session.messages);
      setPhase('chat2');
      setProgress(80);

      const lastMessage = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMessage.id);
    }
  };

  // Chat1 메시지 전송 (대화형)
  const handleChat1Message = async (userInput: string) => {
    setShowQuickReplies(false);
    let session = loadSession();
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

      // 응답이 배열인 경우 (여러 버블)와 단일 메시지인 경우 처리
      if (data.messages && Array.isArray(data.messages)) {
        // 여러 메시지를 순차적으로 추가
        data.messages.forEach((msg: string) => {
          session = addMessage(session, 'assistant', msg, 'chat1');
        });
      } else if (data.message) {
        // 단일 메시지
        session = addMessage(session, 'assistant', data.message, 'chat1');
      }

      // 중요도가 파악되었으면 업데이트
      if (data.importance) {
        const attribute = CORE_ATTRIBUTES[currentAttributeIndex];
        session = updateAttributeAssessment(
          session,
          attribute.key as any,
          data.importance
        );
      }

      // 다음 속성으로 이동
      if (data.nextAttributeIndex !== undefined) {
        session = moveToNextAttribute(session);
        setCurrentAttributeIndex(data.nextAttributeIndex);
      }

      // Chat2로 전환
      if (data.type === 'transition_to_chat2') {
        session = changePhase(session, 'chat2');
        setPhase('chat2');
        setProgress(80);

        const newMessage = session.messages[session.messages.length - 1];
        saveSession(session);
        setMessages(session.messages);
        setTypingMessageId(newMessage.id);
      } else {
        setProgress(calculateProgress(session));

        const newMessage = session.messages[session.messages.length - 1];
        saveSession(session);
        setMessages(session.messages);
        setTypingMessageId(newMessage.id);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      session = addMessage(session, 'assistant', '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.', 'chat1');
      setMessages(session.messages);
    } finally {
      setIsLoading(false);
    }
  };

  // Chat2 메시지 전송
  const handleChat2Message = async (userInput: string) => {
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

      // 진행률 업데이트
      if (data.accuracy) {
        setProgress(Math.min(100, 80 + (data.accuracy * 0.2)));
      }

      saveSession(session);
      setMessages(session.messages);
      setTypingMessageId(newMessage.id);
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
            <h1 className="text-base font-semibold text-gray-900">추천 받기</h1>
            <button
              onClick={() => {
                if (window.confirm('대화 내역을 초기화하고 처음부터 다시 시작하시겠습니까?')) {
                  clearSession();
                  window.location.reload();
                }
              }}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              다시 시작
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">진행률</span>
              <span className="text-xs font-semibold text-blue-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-600"
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
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {typingMessageId === message.id ? (
                    <TypingMessage
                      content={message.content}
                      onUpdate={scrollToBottom}
                      onComplete={() => {
                        setTypingMessageId(null);
                        // Chat1 phase에서 assistant 메시지가 완료되면 빠른 응답 버튼 표시
                        if (phase === 'chat1' && message.role === 'assistant') {
                          setShowQuickReplies(true);
                        }
                      }}
                    />
                  ) : (
                    formatMarkdown(message.content)
                  )}
                </div>
              </motion.div>
            ))}

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
          {/* 빠른 응답 버튼 (Chat1에서만) */}
          {phase === 'chat1' && showQuickReplies && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-3 overflow-x-auto"
            >
              <button
                onClick={() => handleQuickReply('매우 중요')}
                className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors"
              >
                매우 중요
              </button>
              <button
                onClick={() => handleQuickReply('중요')}
                className="flex-shrink-0 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-full hover:bg-blue-100 transition-colors"
              >
                중요함
              </button>
              <button
                onClick={() => handleQuickReply('보통')}
                className="flex-shrink-0 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
              >
                보통
              </button>
            </motion.div>
          )}

          {/* 추천 받기 버튼 (Chat2) */}
          {phase === 'chat2' && progress >= 80 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGetRecommendation}
              className="w-full h-12 mb-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full shadow-lg transition-colors"
            >
              추천 받기 ✨
            </motion.button>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={phase === 'chat1' ? '답변을 입력해주세요' : '추가로 고려할 사항을 알려주세요'}
              disabled={isLoading}
              className="flex-1 h-12 px-4 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
