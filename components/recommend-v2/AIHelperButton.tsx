'use client';

import { motion } from 'framer-motion';
import { logAIHelperButtonClicked } from '@/lib/logging/clientLogger';

interface AIHelperButtonProps {
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'emphasized'; // default: 연한 배경, emphasized: 진한 배경
  // 로깅용 메타데이터
  questionType?: 'hard_filter' | 'balance_game' | 'negative' | 'budget' | 'category_selection';
  questionId?: string;
  questionText?: string;
  category?: string;
  categoryName?: string;
  step?: number;
}

/**
 * AI 도움받기 트리거 버튼
 * - 선택지 위, 팁 아래에 위치
 * - 보라색 AI 테마 스타일
 */
export function AIHelperButton({
  onClick,
  className = '',
  variant = 'default',
  questionType,
  questionId,
  questionText,
  category,
  categoryName,
  step,
}: AIHelperButtonProps) {
  const handleClick = () => {
    // 로깅 (메타데이터가 있을 때는 상세 로깅, 없을 때는 기본 버튼 클릭 로깅)
    if (questionType && questionId && questionText && category && categoryName) {
      logAIHelperButtonClicked(
        questionType,
        questionId,
        questionText,
        category,
        categoryName,
        step
      );
    } else {
      // 기본 로깅 (props 없이 사용된 경우)
      import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
        logButtonClick('recommend-v2', '💜 AI 도움 요청 (메타데이터 없음)');
      });
    }

    // 원래 onClick 호출
    onClick();
  };

  // variant에 따른 스타일 설정
  const baseStyles = variant === 'emphasized'
    ? 'bg-purple-600 hover:bg-purple-700 border-purple-600 hover:border-purple-700'
    : 'bg-purple-50 hover:bg-purple-100 border-purple-300 hover:border-purple-400';

  const iconFill = variant === 'emphasized' ? '#E9D5FF' : '#8B5CF6';
  const textColor = variant === 'emphasized' ? 'text-white' : 'text-purple-700';

  return (
    <motion.button
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      onClick={handleClick}
      className={`w-full flex items-center justify-center gap-2 px-3 py-3 border rounded-xl transition-all ${baseStyles} ${className}`}
    >
      {/* AI 아이콘 (4방향 별) */}
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={iconFill}>
        <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
      </svg>

      {/* 텍스트 */}
      <span className={`text-sm font-semibold ${textColor}`}>
        뭘 골라야 할지 모르겠어요
      </span>


    </motion.button>
  );
}
