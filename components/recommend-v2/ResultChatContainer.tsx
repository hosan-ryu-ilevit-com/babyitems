'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  ResultChatApiRequest,
  ResultChatApiResponse,
  V2ResultProduct,
} from '@/types/recommend-v2';
import { logResultChatMessage } from '@/lib/logging/clientLogger';

interface ResultChatContainerProps {
  products: V2ResultProduct[];
  categoryKey: string;
  categoryName: string;
  existingConditions: {
    hardFilterAnswers: Record<string, string>;
    balanceSelections: string[];
    negativeSelections: string[];
    budget: { min: number; max: number };
  };
  // 부모에게 메시지 추가 요청
  onUserMessage: (content: string) => void;
  onAssistantMessage: (content: string, typing?: boolean, reRecommendData?: { description: string; naturalLanguageCondition: string }) => void;
  onLoadingChange?: (loading: boolean) => void;
  // 채팅 히스토리 (API 요청에 사용)
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  hideHelpBubble?: boolean;
}

/**
 * 결과 페이지 채팅 입력 컨테이너
 * - 입력창만 렌더링 (다시 추천 버튼은 별도 플로팅)
 * - 메시지는 부모 컴포넌트의 메시지 시스템에 통합
 */
export function ResultChatContainer({
  products,
  categoryKey,
  categoryName,
  existingConditions,
  onUserMessage,
  onAssistantMessage,
  onLoadingChange,
  chatHistory = [],
  hideHelpBubble = false,
}: ResultChatContainerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showHelpBubble, setShowHelpBubble] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 상호작용 시 말풍선 숨김
  const handleInteraction = () => {
    if (showHelpBubble) {
      setShowHelpBubble(false);
    }
  };

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      // h-12 (48px)가 기본, 대략 3줄 정도면 120px
      const newHeight = Math.max(48, Math.min(scrollHeight, 120));
      textarea.style.height = `${newHeight}px`;
    }
  };

  // 입력값이 변경될 때마다 높이 조절
  useEffect(() => {
    adjustHeight();
  }, [inputValue]);

  // 메시지 전송
  const handleSend = async (content: string) => {
    handleInteraction();
    if (!content.trim() || isLoading) return;

    // 1. 사용자 메시지 추가 (부모에게 전달)
    onUserMessage(content);
    setIsLoading(true);
    onLoadingChange?.(true);
    setInputValue(''); // 입력창 초기화

    try {
      // 2. API 호출
      const request: ResultChatApiRequest = {
        message: content,
        categoryKey,
        products: products.map((p) => ({
          pcode: p.pcode,
          title: p.title,
          brand: p.brand,
          price: p.price,
          spec: p.spec,
          totalScore: p.totalScore,
          matchedRules: p.matchedRules || [],
          recommendationReason: p.recommendationReason,
        })),
        existingConditions,
        chatHistory: [
          ...chatHistory,
          { role: 'user' as const, content },
        ],
      };

      const response = await fetch('/api/v2/result-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const result: ResultChatApiResponse = await response.json();

      // 3. AI 응답 추가 (부모에게 전달)
      if (result.success && result.data) {
        // 로깅: 결과 페이지 채팅 메시지
        logResultChatMessage(
          categoryKey,
          categoryName,
          content,
          result.data.content,
          [...chatHistory, { role: 'user' as const, content }, { role: 'assistant' as const, content: result.data.content }],
          result.data.type === 're-recommendation' ? 're-recommendation' : 'answer'
        );

        onAssistantMessage(
          result.data.content,
          true,
          result.data.type === 're-recommendation' ? result.data.parsedCondition : undefined
        );
      } else {
        onAssistantMessage(result.error || '죄송해요, 잠시 후 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('Chat error:', error);
      onAssistantMessage('네트워크 오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="w-full relative">
      {/* 플로팅 말풍선 (무엇이든 물어보세요) */}
      <AnimatePresence>
        {showHelpBubble && !hideHelpBubble && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: 1, 
              y: [0, -6, 0] 
            }}
            exit={{ opacity: 0, y: 10 }}
            transition={{
              y: {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              },
              opacity: { duration: 0.3 }
            }}
            className="absolute left-0 bottom-full mb-2.5 z-20"
          >
            <div className="relative">
              <div className="relative z-10 px-3 py-1.5 bg-violet-50 rounded-2xl text-[13px] font-semibold text-violet-600 flex items-center gap-1.5 border border-violet-200">
                <span className="text-[15px] leading-none">💬</span>
                <span>무엇이든 물어보세요</span>
                
                {/* Tail - moved inside for cleaner overlap */}
                <div className="absolute left-6 bottom-[-6.5px] w-3 h-3 bg-violet-50 border-r border-b border-violet-200 transform rotate-45 -z-10"></div>
                {/* Border Cover - hides the main bubble's border at the tail connection */}
                <div className="absolute left-[22px] bottom-[-1px] w-4 h-[2px] bg-violet-50 z-20"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 채팅 입력창 */}
      <div className="relative overflow-hidden rounded-[20px] border border-gray-200 flex items-end">
        {/* Radial Gradient Background (Ellipse 464) */}
        <div 
          className="absolute pointer-events-none"
          style={{
            width: '358px',
            height: '176px',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%) translateY(-20px)',
            background: 'radial-gradient(50% 50% at 50% 50%, rgba(217, 233, 255, 0.65) 0%, rgba(217, 233, 255, 0) 100%)',
            zIndex: 0
          }}
        />
        
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="추천 결과에 대해 궁금한게 있으신가요?"
          className="relative z-10 w-full min-h-[48px] max-h-[120px] py-[13px] pl-4 pr-12 rounded-[20px] bg-white/70 backdrop-blur-md text-base text-gray-800 placeholder:text-gray-400 placeholder:font-medium focus:outline-none transition-all resize-none overflow-y-auto"
          onFocus={handleInteraction}
          onClick={handleInteraction}
          onKeyDown={(e) => {
            handleInteraction();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (inputValue.trim()) {
                handleSend(inputValue.trim());
              }
            }
          }}
          disabled={isLoading}
          rows={1}
        />
        <button
          onClick={() => {
            handleInteraction();
            if (inputValue.trim()) {
              handleSend(inputValue.trim());
            }
          }}
          disabled={isLoading}
          className="absolute right-1.5 bottom-2 w-8 h-8 z-20 flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
        >
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <img src="/icons/sendreal.png" alt="send" className="w-full h-full object-contain" />
          )}
        </button>
      </div>
    </div>
  );
}
