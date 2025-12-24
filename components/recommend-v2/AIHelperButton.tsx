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

  // variant에 따른 스타일 설정
  const baseStyles = variant === 'emphasized'
    ? 'bg-purple-600 hover:bg-purple-700 border-purple-600'
    : 'bg-purple-50 hover:bg-purple-100 border-purple-100';

  const iconFill = variant === 'emphasized' ? '#E9D5FF' : '#8B5CF6';
  const textColor = variant === 'emphasized' ? 'text-white' : 'text-purple-700';

  return (
    <div className={`w-full flex flex-col items-start gap-2 ${className}`}>
      {/* 
        [접힘 상태]
        - 아이콘 + "AI에게 물어보기" 텍스트만 심플하게 표시
        - 클릭 시 펼쳐짐 (isExpanded true)
      */}
      <motion.button
        initial={isMounted ? { opacity: 0, y: 5 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={handleClick}
        className={`relative flex items-center justify-between px-4 py-3 rounded-xl border transition-all w-full shadow-sm hover:shadow-md group overflow-hidden ${
          variant === 'emphasized'
            ? 'bg-linear-to-r from-purple-600 to-indigo-600 border-transparent text-white'
            : 'bg-white border-purple-100 hover:border-purple-300'
        }`}
      >
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
          variant === 'emphasized' ? 'bg-white/10' : 'bg-purple-50/50'
        }`} />

        <div className="flex items-center gap-2.5 relative z-10">
          {/* AI 아이콘 (캐릭터 느낌) */}
          <div className={`p-1.5 rounded-lg ${
            variant === 'emphasized' ? 'bg-white/20' : 'bg-purple-50'
          }`}>
            <span className="text-lg leading-none">🧞‍♂️</span>
          </div>

          <div className="flex flex-col items-start">
            <span className={`text-[13px] font-bold leading-none ${
              variant === 'emphasized' ? 'text-white' : 'text-purple-700'
            }`}>
              뭘 골라야 할지 모르겠어요
            </span>
          </div>
        </div>

        {/* 우측 화살표 - 토글 상태 표시 */}
        <div className={`p-1 rounded-full ${
          variant === 'emphasized' ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-purple-100 group-hover:text-purple-600'
        } transition-colors relative z-10`}>
          <motion.svg 
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="w-4 h-4" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </motion.button>

      {/* 
        [펼침 상태] - 빠른 추천 옵션들이 아래로 슬라이드 다운됨 
        - isExpanded가 true일 때만 렌더링/표시
      */}
      <AnimatePresence>
        {isExpanded && ((hasContext && onContextRecommend) || onPopularRecommend) && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-2 w-full pt-1 pb-1">
              {/* 질문하기 버튼 (가장 먼저 노출) */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                onClick={() => {
                  // 로깅 및 바텀시트 열기
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
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-purple-50 border border-purple-200 hover:bg-purple-100/50 hover:shadow-sm transition-all text-left"
              >
                <div className="p-1.5 rounded-lg bg-white shrink-0">
                  <span className="text-lg leading-none">💬</span>
                </div>
                <span className="text-xs font-bold text-purple-900">AI에게 직접 물어보기</span>
              </motion.button>

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
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-gray-200 hover:border-purple-200 hover:bg-purple-50/30 hover:shadow-sm transition-all text-left"
                >
                  <div className="p-1.5 rounded-lg bg-orange-50 shrink-0">
                    <span className="text-lg leading-none">🔥</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">가장 많은 사람들이 구매하는게 뭔가요?</span>
                </motion.button>
              )}
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
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-gray-200 hover:border-purple-200 hover:bg-purple-50/30 hover:shadow-sm transition-all text-left"
                >
                  <div className="p-1.5 rounded-lg bg-purple-50 shrink-0">
                    <span className="text-lg leading-none">✨</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800">입력한 내 상황에 맞춰 골라주세요</span>
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
