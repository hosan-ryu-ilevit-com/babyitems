'use client';

import { useState, useRef } from 'react';
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
}: ResultChatContainerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 메시지 전송
  const handleSend = async (content: string) => {
    if (!content.trim() || isLoading) return;

    // 1. 사용자 메시지 추가 (부모에게 전달)
    onUserMessage(content);
    setIsLoading(true);
    onLoadingChange?.(true);

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
    <div className="w-full">
      {/* 채팅 입력창 */}
      <div className="relative overflow-hidden rounded-[20px] border border-gray-200">
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
        
        <input
          ref={inputRef}
          type="text"
          placeholder="추천 결과에 대해 궁금한게 있으신가요?"
          className="relative z-10 w-full h-12 pl-4 pr-12 rounded-[20px] bg-white/50 backdrop-blur-md text-base text-gray-800 placeholder:text-gray-400 placeholder:font-medium focus:outline-none transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const input = e.currentTarget;
              if (input.value.trim()) {
                handleSend(input.value.trim());
                input.value = '';
              }
            }
          }}
          disabled={isLoading}
        />
        <button
          onClick={() => {
            const input = inputRef.current;
            if (input?.value.trim()) {
              handleSend(input.value.trim());
              input.value = '';
            }
          }}
          disabled={isLoading}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 z-20 flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
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
