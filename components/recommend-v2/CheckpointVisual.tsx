'use client';

import { motion } from 'framer-motion';
import type { CheckpointData } from '@/types/recommend-v2';

interface CheckpointVisualProps {
  data: CheckpointData;
  isLoading?: boolean;
}

/**
 * 중간 점검 시각화 컴포넌트
 * - GuideCards와 일관된 디자인 언어
 * - 심플한 후보군 수 표시
 */
export function CheckpointVisual({ data, isLoading = false }: CheckpointVisualProps) {
  const { totalProducts, filteredCount } = data;

  // 로딩 중일 때 shimmer 효과
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl border border-blue-100 p-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
          <p className="text-[15px] text-gray-600 animate-pulse">
            선택 분석하는중...
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 메인 카드 - GuideCards 디자인 언어 */}
      <div className="bg-white rounded-2xl border border-blue-100 p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-green-500 font-bold">✓</span>
          <h3 className="font-medium text-gray-900 text-[15px]">조건 분석 완료</h3>
        </div>

        {/* 후보군 수 표시 - 심플하게 */}
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 text-sm">전체</span>
          <span className="text-gray-400 text-lg font-medium">{totalProducts}개</span>
          <span className="text-gray-500 text-sm mx-1">중</span>
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-900 text-2xl font-bold"
          >
            {filteredCount}개
          </motion.span>
          <span className="text-gray-700 text-sm">후보</span>
        </div>

        {/* 프로그레스 바 */}
        <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gray-900 rounded-full"
            initial={{ width: '100%' }}
            animate={{ width: `${(filteredCount / totalProducts) * 100}%` }}
            transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
