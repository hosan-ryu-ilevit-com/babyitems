'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Recommendation } from '@/types';

interface RecommendationPreviewProps {
  recommendations: Recommendation[];
  onClick?: () => void;
  changes?: {
    added: string[];     // 새로 추가된 상품 ID
    removed: string[];   // 제거된 상품 ID
    unchanged: string[]; // 유지된 상품 ID
    description?: string; // 변경사항 설명 (AI 생성)
  };
  showChanges?: boolean;
}

export function RecommendationPreview({
  recommendations,
  onClick,
  changes,
  showChanges = false
}: RecommendationPreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 border-2 ${
        onClick ? 'cursor-pointer hover:border-blue-300 transition-colors' : 'border-gray-200'
      }`}
      style={onClick ? { borderColor: '#E5F1FF' } : {}}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">
          {showChanges ? '새 추천 결과' : '현재 추천 결과'}
        </h3>
        {onClick && (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* 변경사항 설명 */}
      {showChanges && changes?.description && (
        <div className="mb-3 p-2.5 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700 leading-relaxed">
            {changes.description}
          </p>
        </div>
      )}

      {/* 상품 리스트 */}
      <div className="space-y-2">
        {recommendations.slice(0, 3).map((rec) => {
          const isNew = changes?.added.includes(rec.product.id);
          const isRemoved = changes?.removed.includes(rec.product.id);

          return (
            <div
              key={rec.product.id}
              className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                isNew ? 'bg-emerald-50' : isRemoved ? 'bg-red-50' : 'bg-gray-50'
              }`}
            >
              {/* 순위 배지 */}
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: rec.rank === 1 ? '#0084FE' : rec.rank === 2 ? '#4A9EFF' : '#7BB5FF' }}
              >
                {rec.rank}
              </div>

              {/* 썸네일 */}
              <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 bg-gray-100">
                {rec.product.thumbnail ? (
                  <Image
                    src={rec.product.thumbnail}
                    alt={rec.product.title}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    quality={75}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200" />
                )}
              </div>

              {/* 상품 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 line-clamp-1 leading-tight">
                  {rec.product.title}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {rec.product.price.toLocaleString()}원
                </p>
              </div>

              {/* 변경 뱃지 */}
              {showChanges && isNew && (
                <span className="flex-shrink-0 px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded-full">
                  NEW
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 클릭 안내 */}
      {onClick && (
        <p className="mt-3 text-center text-xs text-gray-500">
          탭하여 결과 페이지로 이동
        </p>
      )}
    </motion.div>
  );
}
