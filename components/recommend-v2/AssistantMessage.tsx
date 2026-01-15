'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AssistantMessageProps {
  content: string;
  typing?: boolean;
  speed?: number;
  className?: string;
  textClassName?: string; // 강조될 텍스트(주로 질문) 스타일
  explanationClassName?: string; // 부가 설명 텍스트 스타일
  suffix?: React.ReactNode;
  onTypingComplete?: () => void;
}

// 스트리밍 텍스트 컴포넌트 (글자가 하나씩 나타남) - export for reuse
export function StreamingText({ 
  content, 
  speed = 10, 
  onComplete, 
  className = '', 
  suffix,
  textClassName = '',
  explanationClassName = ''
}: { 
  content: string; 
  speed?: number; 
  onComplete?: () => void; 
  className?: string; 
  suffix?: React.ReactNode;
  textClassName?: string;
  explanationClassName?: string;
}) {
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
  const formatMarkdown = (currentText: string, fullText: string, suffix?: React.ReactNode) => {
    const lines = currentText.split('\n');
    const fullLines = fullText.split('\n').filter(l => l.trim() !== '');
    const hasMultipleParagraphs = fullLines.length > 1;
    const lastParagraphText = fullLines[fullLines.length - 1];

    return lines.map((line, lineIndex) => {
      const isLastParagraph = line.trim() === lastParagraphText;
      const isExplanation = hasMultipleParagraphs && !isLastParagraph;
      const isLastLine = lineIndex === lines.length - 1;
      
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
        <div key={lineIndex} className={`break-all ${isExplanation ? explanationClassName : textClassName}`}>
          {formattedLine}
          {isLastLine && isDone && suffix}
        </div>
      );
    });
  };

  return <>{formatMarkdown(displayedContent, content, suffix)}</>;
}

/**
 * AI 어시스턴트 메시지 버블
 * - 스트리밍 타이핑 애니메이션 지원 (글자가 하나씩 나타남)
 * - Step 태그 표시 ("1/5", "2/5" 등)
 */
export function AssistantMessage({
  content,
  typing = false,
  speed = 10,
  className = '',
  textClassName = '',
  explanationClassName = '',
  suffix,
  onTypingComplete,
}: AssistantMessageProps) {
  // 마크다운 볼드 처리 (**텍스트** → <strong>)
  const formatMarkdown = (text: string, suffix?: React.ReactNode) => {
    const lines = text.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim() !== '');
    const hasMultipleParagraphs = nonEmptyLines.length > 1;
    const lastParagraphText = nonEmptyLines[nonEmptyLines.length - 1];

    return lines.map((line, lineIndex) => {
      const isLastParagraph = line.trim() === lastParagraphText;
      const isExplanation = hasMultipleParagraphs && !isLastParagraph;
      const isLastLine = lineIndex === lines.length - 1;
      
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
        <div key={lineIndex} className={`break-all ${isExplanation ? (explanationClassName || 'text-base text-gray-800 font-medium') : (textClassName || 'text-base text-gray-800 font-medium')}`}>
          {formattedLine}
          {isLastLine && suffix}
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
        <div className={`py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl leading-[1.4] whitespace-pre-wrap`}>
          {typing ? (
            <StreamingText 
              content={content} 
              speed={speed} 
              onComplete={onTypingComplete} 
              suffix={suffix} 
              textClassName={textClassName}
              explanationClassName={explanationClassName}
            />
          ) : (
            formatMarkdown(content, suffix)
          )}
        </div>
      </div>
    </motion.div>
  );
}
