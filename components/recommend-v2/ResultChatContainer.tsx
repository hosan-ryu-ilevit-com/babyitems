'use client';

import { useState, useRef, useEffect } from 'react';
import type {
  ResultChatApiRequest,
  ResultChatApiResponse,
  V2ResultProduct,
} from '@/types/recommend-v2';
import { logResultChatMessage, logKAChatMessage } from '@/lib/logging/clientLogger';

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
  flowType?: 'v2' | 'ka';
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
  flowType = 'v2',
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
        categoryName,
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
        if (flowType === 'ka') {
          logKAChatMessage(categoryKey, content, result.data.content);
        } else {
          logResultChatMessage(
            categoryKey,
            categoryName,
            content,
            result.data.content,
            [...chatHistory, { role: 'user' as const, content }, { role: 'assistant' as const, content: result.data.content }],
            result.data.type === 're-recommendation' ? 're-recommendation' : 'answer'
          );
        }

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
      {/* 채팅 입력창 */}
      <div className="relative flex items-end group">
        <div
          className="relative w-full flex items-end overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            borderRadius: '20px',
            boxShadow: '0px 5px 15px 0px rgba(21, 21, 21, 0.04)',
            border: '1px solid #e2e2e7',
          }}
        >
          {/* 그라데이션 ellipse */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: '100%',
              height: '176px',
              left: 0,
              top: '-16px',
              transform: 'translateY(-50%)',
              background: 'radial-gradient(50% 50% at 50% 50%, rgba(217, 233, 255, 0.40) 0%, rgba(217, 233, 255, 0.00) 100%)',
              zIndex: 0,
            }}
          />
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="추천 결과에 대해 궁금한게 있으신가요?"
            className="relative z-10 w-full min-h-[56px] max-h-[160px] py-[15px] pl-5 pr-14 bg-transparent text-[16px] leading-[1.4] tracking-[-0.2px] text-[#71737c] placeholder:text-[#71737c] focus:outline-none transition-all resize-none overflow-y-auto whitespace-pre-line selection:bg-[#d1e3ff] selection:text-[#374151] caret-[#71737c]"
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
            disabled={isLoading || !inputValue.trim()}
            className={`absolute right-3 bottom-3 z-30 flex-shrink-0 transition-all duration-200 ${inputValue.trim() ? '' : 'opacity-50'} disabled:opacity-50 active:scale-95`}
          >
            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <img src="/icons/sendreal.png" alt="send" className="w-8 h-8 object-contain" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
