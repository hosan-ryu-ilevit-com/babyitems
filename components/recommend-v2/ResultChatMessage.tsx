'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ResultChatMessage as ResultChatMessageType } from '@/types/recommend-v2';

interface ResultChatMessageProps {
  message: ResultChatMessageType;
  typing?: boolean;
  speed?: number;
  onTypingComplete?: () => void;
  onReRecommendConfirm?: () => void;
  onReRecommendCancel?: () => void;
  isReRecommending?: boolean;
}

/**
 * 스트리밍 텍스트 (글자가 하나씩 나타남)
 */
function StreamingText({
  content,
  speed = 15,
  onComplete,
}: {
  content: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setDisplayedContent('');
    setCurrentIndex(0);
    setIsDone(false);
  }, [content]);

  useEffect(() => {
    if (!content) return;

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex((prev) => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (currentIndex === content.length && !isDone) {
      setIsDone(true);
      onComplete?.();
    }
  }, [currentIndex, content, speed, onComplete, isDone]);

  return <>{formatMarkdown(displayedContent)}</>;
}

/**
 * 마크다운 포맷팅 (볼드, 테이블)
 */
function formatMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // 테이블 행 처리
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter(Boolean);
      const isHeader = lineIndex > 0 && lines[lineIndex + 1]?.includes('---');
      const isSeparator = line.includes('---');

      if (isSeparator) {
        return null;
      }

      return (
        <div
          key={lineIndex}
          className={`flex text-xs ${isHeader ? 'font-semibold border-b border-gray-200' : ''}`}
        >
          {cells.map((cell, cellIndex) => (
            <span
              key={cellIndex}
              className={`flex-1 px-1 py-0.5 ${cellIndex === 0 ? 'text-gray-500' : ''}`}
            >
              {cell.trim()}
            </span>
          ))}
        </div>
      );
    }

    // 볼드 처리
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={index}>{part}</span>;
    });

    if (line.trim() === '') {
      return <div key={lineIndex} className="h-2" />;
    }

    return (
      <div key={lineIndex} className={lineIndex > 0 ? 'mt-0.5' : ''}>
        {formattedLine}
      </div>
    );
  });
}

/**
 * 결과 페이지 채팅 메시지 컴포넌트
 */
export function ResultChatMessage({
  message,
  typing = false,
  speed = 15,
  onTypingComplete,
  onReRecommendConfirm,
  onReRecommendCancel,
  isReRecommending = false,
}: ResultChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const hasReRecommendData = !!message.reRecommendData;
  const [isActioned, setIsActioned] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 px-1`}
    >
      <div className={`max-w-[90%] ${isUser ? 'w-auto' : 'w-full'}`}>
        {/* 사용자 메시지 (말풍선 유지) */}
        {isUser && (
          <div className="bg-gray-50 text-gray-800 rounded-[20px] px-4 py-3 text-base font-medium leading-[140%]">
            {message.content}
          </div>
        )}

        {/* AI 메시지 (텍스트 기반) */}
        {isAssistant && (
          <div className="w-full">
            <div className="text-base text-gray-800 font-medium leading-[1.6] whitespace-pre-wrap">
              {typing ? (
                <StreamingText content={message.content} speed={speed} onComplete={onTypingComplete} />
              ) : (
                formatMarkdown(message.content)
              )}
            </div>

            {/* 비교표 (있는 경우) */}
            {message.comparisonTable && (
              <div className="mt-4 p-3 bg-white border border-gray-100 rounded-2xl text-gray-700 overflow-x-auto shadow-sm">
                {formatMarkdown(message.comparisonTable)}
              </div>
            )}

            {/* 재추천 확인 카드 (V2 스타일) */}
            {hasReRecommendData && !isActioned && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-5 p-5 bg-[#F9FAFB] rounded-3xl border border-gray-50"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">추천 조건 변경</span>
                  </div>
                  
                  <p className="text-[17px] font-bold text-gray-900 mb-2 leading-snug">
                    "{message.reRecommendData?.description}"
                    <br />
                    <span className="text-gray-500 font-medium">내용으로 다시 추천받으시겠어요?</span>
                  </p>

                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => {
                        setIsActioned(true);
                        onReRecommendConfirm?.();
                      }}
                      disabled={isReRecommending}
                      className={`w-full py-4 px-6 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2 ${
                        isReRecommending
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-[#111827] text-white hover:bg-black active:scale-[0.98]'
                      }`}
                    >
                      {isReRecommending ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          분석 중...
                        </>
                      ) : (
                        '네, 다시 추천해주세요'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsActioned(true);
                        onReRecommendCancel?.();
                      }}
                      disabled={isReRecommending}
                      className="w-full py-3 px-6 rounded-2xl text-sm font-semibold text-gray-500 bg-transparent hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      아니요, 계속 대화할게요
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
