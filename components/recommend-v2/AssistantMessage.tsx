'use client';

import { motion } from 'framer-motion';

interface AssistantMessageProps {
  content: string;
  typing?: boolean;
  stepTag?: string;
  className?: string;
}

/**
 * AI 어시스턴트 메시지 버블
 * - 타이핑 애니메이션 지원
 * - Step 태그 표시 ("1/5", "2/5" 등)
 */
export function AssistantMessage({
  content,
  typing = false,
  stepTag,
  className = '',
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`w-full ${className}`}
    >
      {/* Step 태그 */}
      {stepTag && (
        <div className="inline-block px-2.5 py-1 bg-gray-100 text-blue-600 rounded-lg text-xs font-bold mb-2">
          {stepTag}
        </div>
      )}

      {/* 메시지 버블 */}
      <div className="w-full flex justify-start">
        <div
          className={`px-1 py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-base ${
            typing ? 'shimmer-text' : 'text-gray-900'
          }`}
        >
          {typing ? content : formatMarkdown(content)}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * shimmer-text 애니메이션을 위한 CSS (global.css에 추가 필요)
 *
 * .shimmer-text {
 *   background: linear-gradient(90deg, #666 25%, #999 50%, #666 75%);
 *   background-size: 200% 100%;
 *   -webkit-background-clip: text;
 *   -webkit-text-fill-color: transparent;
 *   animation: shimmer 1.5s infinite;
 * }
 *
 * @keyframes shimmer {
 *   0% { background-position: 200% 0; }
 *   100% { background-position: -200% 0; }
 * }
 */
