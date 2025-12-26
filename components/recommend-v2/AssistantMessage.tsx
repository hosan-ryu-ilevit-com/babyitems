'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AssistantMessageProps {
  content: string;
  typing?: boolean;
  className?: string;
  onTypingComplete?: () => void;
}

// 스트리밍 텍스트 컴포넌트 (글자가 하나씩 나타남)
function StreamingText({ content, speed = 15, onComplete }: { content: string; speed?: number; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!content) return;

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (currentIndex === content.length && onComplete) {
      // 타이핑 완료 시 콜백 호출
      onComplete();
    }
  }, [currentIndex, content, speed, onComplete]);

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

      return (
        <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : ''}>
          {formattedLine}
        </div>
      );
    });
  };

  return <span className="whitespace-pre-wrap">{formatMarkdown(displayedContent)}</span>;
}

/**
 * AI 어시스턴트 메시지 버블
 * - 스트리밍 타이핑 애니메이션 지원 (글자가 하나씩 나타남)
 * - Step 태그 표시 ("1/5", "2/5" 등)
 */
export function AssistantMessage({
  content,
  typing = false,
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

      return (
        <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : ''}>
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
        <div className="px-1 py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl text-base text-gray-900 font-medium leading-[1.4]">
          {typing ? (
            <StreamingText content={content} speed={15} onComplete={onTypingComplete} />
          ) : (
            formatMarkdown(content)
          )}
        </div>
      </div>
    </motion.div>
  );
}
