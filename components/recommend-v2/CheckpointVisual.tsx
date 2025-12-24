'use client';

import { useState, useEffect } from 'react';
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
  const [isShrinkComplete, setIsShrinkComplete] = useState(false);
  const finalPercent = (filteredCount / totalProducts) * 100;

  // 프로그레스 바 줄어드는 애니메이션 완료 후 색상 변경 (delay 0.3s + duration 0.8s = 1.1s 후)
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setIsShrinkComplete(true);
      }, 1150); // 애니메이션 완료 직후
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // 로딩 중일 때 shimmer 효과
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl border border-blue-100 p-5"
      >
        <p className="text-base font-medium shimmer-text">
          조건을 분석하는 중입니다...
        </p>
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
          <h3 className="font-medium text-[15px] text-gray-900">
            조건 분석 완료
          </h3>
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

        {/* 프로그레스 바 - 100%에서 시작해서 오른쪽에서 왼쪽으로 줄어듦, 완료 후 초록색으로 페이드 */}
        <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: '100%', backgroundColor: '#5F0080' }}
            animate={{
              width: `${finalPercent}%`,
              backgroundColor: isShrinkComplete ? '#22c55e' : '#5F0080',
            }}
            transition={{
              width: { delay: 0.3, duration: 0.8, ease: 'easeInOut' },
              backgroundColor: { duration: 0.4, ease: 'easeOut' },
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
