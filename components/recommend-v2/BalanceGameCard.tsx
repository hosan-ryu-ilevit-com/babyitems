'use client';

import { motion } from 'framer-motion';
import type { BalanceGameData } from '@/types/recommend-v2';

interface BalanceGameCardProps {
  data: BalanceGameData;
  onSelectA: () => void;
  onSelectB: () => void;
  onSkip: () => void;
}

/**
 * 밸런스 게임 A vs B 카드 컴포넌트
 * - 두 가지 선택지 중 하나 선택
 * - 스킵 가능
 */
export function BalanceGameCard({
  data,
  onSelectA,
  onSelectB,
  onSkip,
}: BalanceGameCardProps) {
  const { question, currentIndex, totalCount } = data;

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-bold">
          Q{currentIndex + 1}. 취향 선택
        </span>
        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      {/* 질문 제목 */}
      <h3 className="text-base font-bold text-gray-900 text-center leading-snug">
        {question.title}
      </h3>

      {/* A vs B 선택 */}
      <div className="space-y-3">
        {/* Option A */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onSelectA}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 text-left hover:border-blue-400 hover:from-blue-100 hover:to-blue-150 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
              A
            </span>
            <span className="text-sm font-medium text-gray-800 leading-snug">
              {question.option_A.text}
            </span>
          </div>
        </motion.button>

        {/* VS 구분선 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-xs font-bold">VS</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Option B */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onSelectB}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 text-left hover:border-purple-400 hover:from-purple-100 hover:to-purple-150 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-purple-500 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
              B
            </span>
            <span className="text-sm font-medium text-gray-800 leading-snug">
              {question.option_B.text}
            </span>
          </div>
        </motion.button>
      </div>

      {/* 스킵 버튼 */}
      <div className="text-center pt-1">
        <button
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          건너뛰기
        </button>
      </div>
    </motion.div>
  );
}
