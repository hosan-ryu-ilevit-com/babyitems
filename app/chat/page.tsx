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
} from '@/lib/utils/session';
import {
  generateIntroMessage,
  generateAttributeQuestion,
  generateImportanceFeedback,
  generateChat2TransitionMessage,
} from '@/lib/utils/messageTemplates';

// 타이핑 이펙트 컴포넌트
function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 20); // 20ms per character

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete]);

  return <span>{displayedContent}</span>;
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

      const firstQuestion: Message = {
        id: 'q1',
        role: 'assistant',
        content: generateAttributeQuestion(0),
        timestamp: Date.now() + 100,
        phase: 'chat1',
      };

      let updatedSession = changePhase(session, 'chat1');
      updatedSession = addMessage(updatedSession, 'assistant', welcomeMessage.content, 'chat1');
      updatedSession = addMessage(updatedSession, 'assistant', firstQuestion.content, 'chat1');

      saveSession(updatedSession);
      setMessages([welcomeMessage, firstQuestion]);
      setTypingMessageId(firstQuestion.id);

      // 타이핑 완료 후 빠른 응답 버튼 표시
      setTimeout(() => {
        setTypingMessageId(null);
        setShowQuickReplies(true);
      }, firstQuestion.content.length * 20 + 500);
    } else {
      // 기존 세션 복원
      setMessages(session.messages);
      setCurrentAttributeIndex(session.currentAttribute);
      setPhase(session.phase === 'chat2' ? 'chat2' : 'chat1');
      setProgress(calculateProgress(session));
    }
  }, [mounted]);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // 다음 속성 질문
      const nextQuestion = generateAttributeQuestion(nextIndex);
      session = moveToNextAttribute(addMessage(session, 'assistant', nextQuestion, 'chat1'));
      setCurrentAttributeIndex(nextIndex);

      saveSession(session);
      setMessages(session.messages);
      setProgress(calculateProgress(session));

      // 타이핑 효과 후 빠른 응답 버튼 다시 표시
      const lastMessage = session.messages[session.messages.length - 1];
      setTypingMessageId(lastMessage.id);

      setTimeout(() => {
        setTypingMessageId(null);
        setShowQuickReplies(true);
      }, nextQuestion.length * 20 + 500);
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

      setTimeout(() => {
        setTypingMessageId(null);
      }, transitionMessage.length * 20 + 500);
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
      session = addMessage(session, 'assistant', data.message, 'chat1');

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

        setTimeout(() => {
          setTypingMessageId(null);
        }, data.message.length * 20 + 500);
      } else {
        setProgress(calculateProgress(session));

        const newMessage = session.messages[session.messages.length - 1];
        saveSession(session);
        setMessages(session.messages);
        setTypingMessageId(newMessage.id);

        // 다음 속성으로 이동했거나 추가 설명을 했으면 빠른 응답 버튼 표시
        setTimeout(() => {
          setTypingMessageId(null);
          if (data.type === 'next_attribute' || data.type === 'follow_up') {
            setShowQuickReplies(true);
          }
        }, data.message.length * 20 + 500);
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

      setTimeout(() => {
        setTypingMessageId(null);
      }, data.message.length * 20 + 500);
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
            <div className="w-6"></div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">진행률</span>
              <span className="text-xs font-semibold text-blue-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
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
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {typingMessageId === message.id ? (
                    <TypingMessage content={message.content} />
                  ) : (
                    message.content
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
                className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium rounded-full hover:shadow-lg transition-shadow"
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
              className="w-full h-12 mb-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-full shadow-lg"
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
              className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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
