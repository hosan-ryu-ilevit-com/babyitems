'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AssistantMessageProps {
  content: string;
  typing?: boolean;
  speed?: number;
  className?: string;
  onTypingComplete?: () => void;
}

// 스트리밍 텍스트 컴포넌트 (글자가 하나씩 나타남) - export for reuse
export function StreamingText({ content, speed = 20, onComplete, className = '' }: { content: string; speed?: number; onComplete?: () => void; className?: string }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // content가 변경되면 초기화
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
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (currentIndex === content.length && !isDone) {
      setIsDone(true);
      if (onComplete) {
        onComplete();
      }
    }
  }, [currentIndex, content, speed, onComplete, isDone]);

  // 마크다운 볼드 처리
  const formatMarkdown = (text: string) => {
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return (
            <strong key={index} className="font-bold">
              {boldText}
            </strong>
          );
        }
        return <span key={index}>{part}</span>;
      });

      // 빈 줄이면 더 큰 간격 부여 (문단 구분)
      if (line.trim() === '') {
        return <div key={lineIndex} className="h-4" />;
      }

      return (
        <div key={lineIndex} className={`break-all ${lineIndex > 0 ? 'mt-0.5' : ''}`}>
          {formattedLine}
        </div>
      );
    });
  };

  return <>{formatMarkdown(displayedContent)}</>;
}

/**
 * AI 어시스턴트 메시지 버블
 * - 스트리밍 타이핑 애니메이션 지원 (글자가 하나씩 나타남)
 * - Step 태그 표시 ("1/5", "2/5" 등)
 */
export function AssistantMessage({
  content,
  typing = false,
  speed = 20,
  className = '',
  onTypingComplete,
}: AssistantMessageProps) {
  // 마크다운 볼드 처리 (**텍스트** → <strong>)
  const formatMarkdown = (text: string) => {
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return (
            <strong key={index} className="font-bold">
              {boldText}
            </strong>
          );
        }
        return <span key={index}>{part}</span>;
      });

      // 빈 줄이면 더 큰 간격 부여 (문단 구분)
      if (line.trim() === '') {
        return <div key={lineIndex} className="h-4" />;
      }

      return (
        <div key={lineIndex} className={`break-all ${lineIndex > 0 ? 'mt-0.5' : ''}`}>
          {formattedLine}
        </div>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`w-full ${className}`}
    >
      {/* 메시지 버블 */}
      <div className="w-full flex justify-start">
        <div className="py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl text-base text-gray-800 font-medium leading-[1.4] whitespace-pre-wrap">
          {typing ? (
            <StreamingText content={content} speed={speed} onComplete={onTypingComplete} />
          ) : (
            formatMarkdown(content)
          )}
        </div>
      </div>
    </motion.div>
  );
}
