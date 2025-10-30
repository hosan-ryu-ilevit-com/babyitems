'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [currentAttributeIndex, setCurrentAttributeIndex] = useState(0);
  const [phase, setPhase] = useState<'chat1' | 'chat2'>('chat1');
  const [progress, setProgress] = useState(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomSheetHeightRef = useRef(0);

  // Hydration 에러 방지: 클라이언트에서만 렌더링
  useEffect(() => {
    setMounted(true);
  }, []);

  // 초기 세션 로드 및 첫 메시지
  useEffect(() => {
    if (!mounted) return;

    const session = loadSession();

    if (session.messages.length === 0) {
      // 첫 방문: 환영 메시지 및 첫 질문
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: '안녕하세요! 딱 맞는 분유포트를 찾아드릴게요 😊\n\n몇 가지 질문을 통해 회원님께 가장 적합한 제품을 추천해드리겠습니다.',
        timestamp: Date.now(),
        phase: 'chat1',
      };

      const firstAttribute = CORE_ATTRIBUTES[0];
      const firstQuestion: Message = {
        id: 'q1',
        role: 'assistant',
        content: `먼저, **${firstAttribute.name}**에 대해 여쭤볼게요.\n\n${firstAttribute.description}\n\n회원님께는 이 기능이 얼마나 중요하신가요?`,
        timestamp: Date.now() + 100,
        phase: 'chat1',
      };

      let updatedSession = changePhase(session, 'chat1');
      updatedSession = addMessage(updatedSession, 'assistant', welcomeMessage.content, 'chat1');
      updatedSession = addMessage(updatedSession, 'assistant', firstQuestion.content, 'chat1');

      saveSession(updatedSession);
      setMessages([welcomeMessage, firstQuestion]);
      setTypingMessageId(firstQuestion.id);

      // 타이핑 완료 후 바텀시트 표시
      setTimeout(() => {
        setShowBottomSheet(true);
        setTypingMessageId(null);
      }, firstQuestion.content.length * 20 + 500);
    } else {
      // 기존 세션 복원
      setMessages(session.messages);
      setCurrentAttributeIndex(session.currentAttribute);
      setPhase(session.phase === 'chat2' ? 'chat2' : 'chat1');
      setProgress(calculateProgress(session));

      // 구조화된 질문 중이면 바텀시트 표시
      if (session.phase === 'chat1' && !isStructuredPhaseComplete(session)) {
        setShowBottomSheet(true);
      }
    }
  }, [mounted]);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showBottomSheet]);

  // 바텀시트 선택 핸들러
  const handleImportanceSelect = async (importance: ImportanceLevel) => {
    let session = loadSession();
    const attribute = CORE_ATTRIBUTES[currentAttributeIndex];

    // 사용자 선택을 채팅 메시지로 표시
    const emoji = importance === '매우 중요' ? '⭐⭐⭐' : importance === '중요' ? '⭐⭐' : '⭐';
    const userMessage = `${attribute.name}은 **${importance}**해요 ${emoji}`;

    session = updateAttributeAssessment(
      addMessage(session, 'user', userMessage, 'chat1'),
      attribute.key as any,
      importance
    );

    setMessages(session.messages);
    setShowBottomSheet(false);

    // 다음 속성으로 이동
    const nextIndex = currentAttributeIndex + 1;

    if (nextIndex < CORE_ATTRIBUTES.length) {
      // 다음 질문
      setIsLoading(true);

      setTimeout(() => {
        const nextAttribute = CORE_ATTRIBUTES[nextIndex];
        const nextQuestion = `좋아요! 다음으로 **${nextAttribute.name}**에 대해 여쭤볼게요.\n\n${nextAttribute.description}\n\n이 부분은 회원님께 얼마나 중요하신가요?`;

        session = moveToNextAttribute(
          addMessage(session, 'assistant', nextQuestion, 'chat1')
        );

        const newMessage = session.messages[session.messages.length - 1];
        saveSession(session);
        setMessages(session.messages);
        setCurrentAttributeIndex(nextIndex);
        setIsLoading(false);
        setProgress(calculateProgress(session));
        setTypingMessageId(newMessage.id);

        // 타이핑 완료 후 바텀시트 표시
        setTimeout(() => {
          setShowBottomSheet(true);
          setTypingMessageId(null);
        }, nextQuestion.length * 20 + 500);
      }, 800);
    } else {
      // 구조화된 질문 완료 → Chat 2 단계로 전환
      setIsLoading(true);

      setTimeout(() => {
        const transitionMessage = '모든 핵심 항목에 대한 답변 감사합니다! 😊\n\n혹시 추가로 고려하시는 사항이 있으신가요? 예를 들어 쌍둥이 육아, 야간 수유 빈도, 예산 등 무엇이든 편하게 말씀해주세요.';

        session = changePhase(
          addMessage(session, 'assistant', transitionMessage, 'chat2'),
          'chat2'
        );

        const newMessage = session.messages[session.messages.length - 1];
        saveSession(session);
        setMessages(session.messages);
        setPhase('chat2');
        setIsLoading(false);
        setProgress(80);
        setTypingMessageId(newMessage.id);

        setTimeout(() => {
          setTypingMessageId(null);
        }, transitionMessage.length * 20 + 500);
      }, 1000);
    }
  };

  // 자유 대화 메시지 전송
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input.trim();
    setInput('');

    let session = loadSession();
    session = addMessage(session, 'user', userInput, phase);
    setMessages(session.messages);
    saveSession(session);

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          phase,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error('API request failed');
      }

      const data = await response.json();

      session = loadSession();
      session = addMessage(session, 'assistant', data.message, phase);

      const newMessage = session.messages[session.messages.length - 1];

      // 진행률 업데이트 (Chat 2에서만)
      if (phase === 'chat2' && data.accuracy) {
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

      // 에러 메시지
      session = addMessage(session, 'assistant', '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.', phase);
      setMessages(session.messages);
    } finally {
      setIsLoading(false);
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
            paddingBottom: showBottomSheet ? '400px' : '140px',
            transition: 'padding-bottom 0.3s ease-out'
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
              placeholder={phase === 'chat1' ? '궁금한 점을 물어보세요' : '추가로 고려할 사항을 알려주세요'}
              disabled={isLoading || showBottomSheet}
              className="flex-1 h-12 px-4 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading || showBottomSheet}
              className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom Sheet for Importance Selection - 그림자 없이 화면 위로 밀어올림 */}
        <AnimatePresence>
          {showBottomSheet && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 z-30 px-6 py-6"
              style={{ maxWidth: '480px', margin: '0 auto' }}
              ref={(el) => {
                if (el) {
                  bottomSheetHeightRef.current = el.offsetHeight;
                }
              }}
            >
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

              <h3 className="text-base font-bold text-gray-900 mb-1 text-center">
                중요도를 선택해주세요
              </h3>
              <p className="text-sm text-gray-500 mb-4 text-center">
                {CORE_ATTRIBUTES[currentAttributeIndex]?.name}
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => handleImportanceSelect('매우 중요')}
                  className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-2xl hover:shadow-lg transition-shadow text-sm"
                >
                  ⭐⭐⭐ 매우 중요해요
                </button>
                <button
                  onClick={() => handleImportanceSelect('중요')}
                  className="w-full h-12 bg-blue-50 text-blue-700 font-semibold rounded-2xl hover:bg-blue-100 transition-colors text-sm"
                >
                  ⭐⭐ 중요해요
                </button>
                <button
                  onClick={() => handleImportanceSelect('보통')}
                  className="w-full h-12 bg-gray-100 text-gray-700 font-semibold rounded-2xl hover:bg-gray-200 transition-colors text-sm"
                >
                  ⭐ 보통이에요
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
