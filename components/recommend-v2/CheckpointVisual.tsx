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
  const finalPercent = totalProducts > 0 ? (filteredCount / totalProducts) * 100 : 0;

  // 로딩 중일 때 shimmer 효과
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="py-4"
      >
        <div className="h-10 bg-gray-50 rounded-xl shimmer" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="py-4 px-1"
    >
      <div className="flex items-center gap-1.5 mb-3">
        {/* n개 후보 선정 */}
        <div className="flex items-center gap-1">
          <motion.span 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="text-green-600 text-[16px] font-semibold"
          >
            ✓
          </motion.span>
          <div className="flex items-center">
            <span className="text-green-600 text-[16px] font-semibold">{filteredCount}개</span>
            <span className="text-green-600 text-[16px] font-semibold ml-0.5 whitespace-nowrap">후보 선정</span>
          </div>
        </div>

        {/* 전체 N개 중 n개 선정 완료 */}
        <div className="bg-gray-50 rounded-[20px] h-[28px] px-3 flex items-center whitespace-nowrap">
          <span className="text-gray-500 text-[14px] font-medium">
            전체 {totalProducts}개 중 {filteredCount}개 선정 완료
          </span>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full origin-left"
          initial={{ width: '100%', backgroundColor: '#000000' }}
          animate={{
            width: `${finalPercent}%`,
            backgroundColor: '#16a34a',
          }}
          transition={{
            width: { delay: 0.3, duration: 1.2, ease: [0.32, 0, 0.67, 0] },
            backgroundColor: { delay: 0.9, duration: 0.6, ease: "linear" }
          }}
        />
      </div>
    </motion.div>
  );
}
