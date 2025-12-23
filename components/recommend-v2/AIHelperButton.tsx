'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { logAIHelperButtonClicked } from '@/lib/logging/clientLogger';

interface AIHelperButtonProps {
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'emphasized'; // default: 연한 배경, emphasized: 진한 배경
  label?: string; // 버튼 레이블 (기본값: "뭘 골라야 할지 모르겠어요")
  // 로깅용 메타데이터
  questionType?: 'hard_filter' | 'balance_game' | 'negative' | 'budget' | 'category_selection';
  questionId?: string;
  questionText?: string;
  category?: string;
  categoryName?: string;
  step?: number;
  hasContext?: boolean;
  onContextRecommend?: () => void;
  onPopularRecommend?: () => void;
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
  label = '뭘 골라야 할지 모르겠어요',
  questionType,
  questionId,
  questionText,
  category,
  categoryName,
  step,
  hasContext = false,
  onContextRecommend,
  onPopularRecommend,
}: AIHelperButtonProps) {
  // Hydration 깜빡임 방지: 클라이언트 마운트 후에만 애니메이션 적용
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    ? 'bg-purple-600 hover:bg-purple-700 border-purple-600'
    : 'bg-purple-50 hover:bg-purple-100 border-purple-100';

  const iconFill = variant === 'emphasized' ? '#E9D5FF' : '#8B5CF6';
  const textColor = variant === 'emphasized' ? 'text-white' : 'text-purple-700';

  return (
    <div className={`w-full flex flex-col items-start gap-2 ${className}`}>
      <motion.button
        initial={isMounted ? { opacity: 0, y: 5 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={handleClick}
        className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all w-full ${baseStyles}`}
      >
        <div className="flex items-center gap-1.5">
          {/* AI 아이콘 (4방향 별) */}
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill={iconFill}>
            <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
          </svg>

          {/* 텍스트 */}
          <span className={`text-xs font-semibold ${textColor}`}>
            {label}
          </span>
        </div>

        {/* 우측 화살표 */}
        <svg className={`w-3.5 h-3.5 shrink-0 ${variant === 'emphasized' ? 'text-purple-200' : 'text-purple-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </motion.button>

      {/* 빠른 추천 버튼들 - 세로 배치 */}
      {((hasContext && onContextRecommend) || onPopularRecommend) && (
        <div className="flex flex-col gap-2 w-full">
          {onPopularRecommend && (
            <motion.button
              initial={isMounted ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => {
                import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                  logButtonClick('recommend-v2', '💜 AI 도움 요청 (인기 제품)');
                });
                onPopularRecommend();
              }}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                </svg>
                <span className="text-xs font-semibold text-gray-600">
                  가장 많은 사람들이 구매하는게 뭔가요?
                </span>
              </div>
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          )}
          {hasContext && onContextRecommend && (
            <motion.button
              initial={isMounted ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              onClick={() => {
                import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                  logButtonClick('recommend-v2', '💜 AI 도움 요청 (컨텍스트 기반)');
                });
                onContextRecommend();
              }}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                </svg>
                <span className="text-xs font-semibold text-gray-600">
                  입력한 내 상황에 맞춰 골라주세요
                </span>
              </div>
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}
