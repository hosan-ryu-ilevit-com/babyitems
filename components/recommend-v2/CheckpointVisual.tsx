'use client';

import { motion } from 'framer-motion';
import type { CheckpointData } from '@/types/recommend-v2';

interface CheckpointVisualProps {
  data: CheckpointData;
}

/**
 * 중간 점검 시각화 컴포넌트
 * - 후보군 압축 시각화 (150개 → 42개)
 * - 조건 요약 태그
 */
export function CheckpointVisual({ data }: CheckpointVisualProps) {
  const { totalProducts, filteredCount, conditions } = data;
  const filterRate = Math.round(
    ((totalProducts - filteredCount) / totalProducts) * 100
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* 메인 카드 */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">✅</span>
          <h3 className="font-bold text-gray-900 text-sm">조건 분석 완료</h3>
        </div>

        {/* 조건 태그 */}
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {conditions.map((condition, index) => (
              <span
                key={index}
                className="px-2.5 py-1 bg-white rounded-full text-xs text-emerald-700 border border-emerald-200"
              >
                #{condition.value}
              </span>
            ))}
          </div>
        )}

        {/* 후보군 압축 시각화 */}
        <div className="bg-white rounded-xl p-4">
          {/* 숫자 비교 */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-300 line-through">
                {totalProducts}
              </p>
              <p className="text-xs text-gray-400">전체 상품</p>
            </div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring' }}
              className="text-xl text-emerald-500"
            >
              →
            </motion.div>

            <div className="text-center">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-2xl font-bold text-emerald-600"
              >
                {filteredCount}
              </motion.p>
              <p className="text-xs text-gray-500">후보군</p>
            </div>
          </div>

          {/* 진행바 */}
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: `${100 - filterRate}%` }}
              transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
              className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full"
            />
          </div>

          {/* 필터율 */}
          <p className="text-xs text-gray-500 text-center mt-2">
            {filterRate}% 제외됨
          </p>
        </div>
      </div>
    </motion.div>
  );
}
