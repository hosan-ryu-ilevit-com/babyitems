'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [isExpanded, setIsExpanded] = useState(false); // 토글 상태

  // Hydration 깜빡임 방지: 클라이언트 마운트 후에만 애니메이션 적용
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleClick = () => {
    // 토글 기능 추가: 버튼 클릭 시 확장/축소
    if (onContextRecommend || onPopularRecommend) {
      setIsExpanded(!isExpanded);

      // 로깅 (확장될 때만)
      if (!isExpanded) {
        import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
          logButtonClick('recommend-v2', '💜 AI 도움 요청 (옵션 열기)');
        });
      }
    } else {
      // 옵션이 없는 경우 기존 동작 (바로 바텀시트 열기 등)
      onClick();
    }
  };

  return (
    <div className={`w-full flex flex-col items-start gap-2 ${className}`}>
      {/* 메인 버튼 - 심플한 디자인 */}
      <motion.button
        initial={isMounted ? { opacity: 0, y: 5 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={handleClick}
        className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all w-full ${
          variant === 'emphasized'
            ? 'bg-purple-100 border-purple-200 hover:bg-purple-150'
            : 'bg-purple-50 border-purple-100 hover:bg-purple-100'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* 물음표 원 아이콘 */}
          {/* <svg className="w-4 h-4 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="17" r="0.5" fill="currentColor" />
          </svg> */}
           <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-700">
            AI
          </span>
          <span className="text-[13px] font-semibold text-purple-700">
            뭘 골라야 할지 모르겠어요
          </span>
         
        </div>

        {/* 우측 화살표 */}
        <motion.svg
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-purple-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </motion.svg>
      </motion.button>

      {/* 펼침 상태 - 하위 옵션들 */}
      <AnimatePresence>
        {isExpanded && ((hasContext && onContextRecommend) || onPopularRecommend) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full overflow-hidden"
          >
            <div className="flex flex-col gap-2 w-full">
              {/* AI에게 직접 물어보기 */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                onClick={() => {
                  if (questionType && questionId && questionText && category && categoryName) {
                    logAIHelperButtonClicked(
                      questionType,
                      questionId,
                      questionText,
                      category,
                      categoryName,
                      step
                    );
                  }
                  onClick();
                }}
                className="flex items-center gap-2 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-all"
              >
                <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z" />
          </svg>
                <span className="text-[13px] font-medium text-gray-700">AI에게 내 상황 말하고 추천받기</span>
              </motion.button>

              {/* 가장 많은 사람들이 구매하는게 뭔가요? */}
              {onPopularRecommend && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  onClick={() => {
                    import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                      logButtonClick('recommend-v2', '💜 AI 도움 요청 (인기 제품)');
                    });
                    onPopularRecommend();
                  }}
                  className="flex items-center gap-2 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-all"
                >
                  <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  <span className="text-[13px] font-medium text-gray-700">가장 많은 사람들이 구매하는게 뭔가요?</span>
                </motion.button>
              )}

              {/* 입력한 내 상황에 맞춰 골라주세요 */}
              {hasContext && onContextRecommend && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  onClick={() => {
                    import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                      logButtonClick('recommend-v2', '💜 AI 도움 요청 (컨텍스트 기반)');
                    });
                    onContextRecommend();
                  }}
                  className="flex items-center gap-2 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-all"
                >
                  <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  <span className="text-[13px] font-medium text-gray-700">지금까지 입력된 내 상황에 맞춰 골라주세요</span>
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
