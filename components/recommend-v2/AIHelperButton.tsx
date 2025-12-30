'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatCircleDots, TrendUp } from '@phosphor-icons/react';
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
  disabled?: boolean;
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
  disabled = false,
}: AIHelperButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false); // 토글 상태

  const handleClick = () => {
    if (disabled) return;
    // 토글 기능 추가: 버튼 클릭 시 확장/축소
    if (onContextRecommend || onPopularRecommend) {
      setIsExpanded(!isExpanded);

      // 로깅 (확장될 때만)
      if (!isExpanded) {
        import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
          logButtonClick('recommend-v2', '💚 AI 도움 요청 (옵션 열기)');
        });
      }
    } else {
      // 옵션이 없는 경우 기존 동작 (바로 바텀시트 열기 등)
      onClick();
    }
  };

  return (
    <div className={`w-full flex flex-col items-start gap-2 relative ${className}`}>
      {/* 배경 딤 처리 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsExpanded(false)}
            className="fixed inset-0 bg-black/50 z-[90]"
          />
        )}
      </AnimatePresence>

      {/* 메인 버튼 - 심플한 디자인 */}
      <motion.button
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.2 }}
        onClick={handleClick}
        disabled={disabled}
        className={`flex items-center justify-center h-[50px] rounded-xl ai-gradient-border w-full bg-white relative ${
          isExpanded ? 'z-[100]' : 'z-auto'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2">
          <img src="/icons/ic-ai.svg" alt="" className="w-4 h-4" />
          <span className="text-[16px] font-bold text-[#6366F1]">
            {label}
          </span>
        </div>
      </motion.button>

      {/* 펼침 상태 - 하위 옵션들 */}
      <AnimatePresence>
        {isExpanded && ((hasContext && onContextRecommend) || onPopularRecommend) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="w-full overflow-hidden z-[100] relative"
          >
            <div className="flex flex-col gap-2 w-full">
              {/* AI에게 직접 물어보기 */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
                  setIsExpanded(false);
                }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-purple-50 border border-purple-100 text-left"
              >
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <ChatCircleDots size={18} weight="fill" className="text-purple-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-gray-800">AI에게 내 상황 설명하기</span>
                  <span className="text-[12px] text-gray-500">직접 말하고 딱 맞는 선택지 추천받기</span>
                </div>
              </motion.button>

              {/* 가장 많은 사람들이 구매하는게 뭔가요? */}
              {onPopularRecommend && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => {
                    import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                      logButtonClick('recommend-v2', '💚 AI 도움 요청 (인기 제품)');
                    });
                    onPopularRecommend();
                    setIsExpanded(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 text-left"
                >
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <TrendUp size={18} weight="bold" className="text-gray-300" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-gray-800">가장 많은 사람이 구매한 선택지 보기</span>
                    <span className="text-[12px] text-gray-500">인기 있는 선택지 추천받기</span>
                  </div>
                </motion.button>
              )}

              {/* 입력한 내 상황에 맞춰 골라주세요 */}
              {hasContext && onContextRecommend && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => {
                    import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                      logButtonClick('recommend-v2', '💚 AI 도움 요청 (컨텍스트 기반)');
                    });
                    onContextRecommend();
                    setIsExpanded(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 text-left"
                >
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <img src="/icons/ic-ai.svg" alt="" className="w-5 h-5 opacity-50" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-gray-800">내 상황에 맞춰 추천받기</span>
                    <span className="text-[12px] text-gray-500">지금까지 입력한 정보로 AI에게 추천받기</span>
                  </div>
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
