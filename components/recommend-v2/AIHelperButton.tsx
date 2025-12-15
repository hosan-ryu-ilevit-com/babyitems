'use client';

import { motion } from 'framer-motion';

interface AIHelperButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * AI 도움받기 트리거 버튼
 * - 선택지 위, 팁 아래에 위치
 * - 보라색 AI 테마 스타일
 */
export function AIHelperButton({ onClick, className = '' }: AIHelperButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 rounded-xl transition-all ${className}`}
    >
      {/* AI 아이콘 (4방향 별) */}
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#8B5CF6">
        <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
      </svg>

      {/* 텍스트 */}
      <span className="text-sm font-medium text-purple-700">
        뭘 골라야 할지 모르겠어요
      </span>

      {/* AI 태그 */}
      <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded">
        AI
      </span>
    </motion.button>
  );
}
