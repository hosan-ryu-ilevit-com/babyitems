'use client';

import { motion } from 'framer-motion';
import type { ScoredProduct } from '@/types/recommend-v2';

interface ResultCardsProps {
  products: ScoredProduct[];
  categoryName: string;
}

/**
 * TOP 3 추천 결과 카드 컴포넌트
 */
export function ResultCards({ products, categoryName }: ResultCardsProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">추천 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="text-center mb-4">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-4xl"
        >
          🎉
        </motion.span>
        <h3 className="text-lg font-bold text-gray-900 mt-2">
          {categoryName} 추천 TOP 3
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          당신의 조건에 가장 잘 맞는 제품이에요
        </p>
      </div>

      {/* 제품 카드 목록 */}
      {products.map((product, index) => (
        <motion.div
          key={product.pcode}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + index * 0.15 }}
          className={`relative bg-white rounded-2xl border-2 overflow-hidden ${
            index === 0
              ? 'border-yellow-400 shadow-lg'
              : index === 1
              ? 'border-gray-300'
              : 'border-amber-200'
          }`}
        >
          {/* 순위 뱃지 */}
          <div
            className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl font-bold text-sm ${
              index === 0
                ? 'bg-yellow-400 text-yellow-900'
                : index === 1
                ? 'bg-gray-300 text-gray-700'
                : 'bg-amber-600 text-white'
            }`}
          >
            {index + 1}위
          </div>

          {/* 카드 내용 */}
          <div className="p-4 pt-8">
            <div className="flex gap-3">
              {/* 썸네일 */}
              {product.thumbnail && (
                <div className="w-20 h-20 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                  <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="w-full h-full object-contain p-2"
                  />
                </div>
              )}

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                {product.brand && (
                  <p className="text-xs text-gray-500 font-medium">
                    {product.brand}
                  </p>
                )}
                <h4 className="text-sm font-bold text-gray-900 line-clamp-2 mb-1">
                  {product.title}
                </h4>
                {product.price && (
                  <p className="text-base font-bold text-gray-900">
                    {product.price.toLocaleString()}
                    <span className="text-xs text-gray-500 ml-0.5">원</span>
                  </p>
                )}
              </div>
            </div>

            {/* 매칭된 규칙 태그 */}
            {product.matchedRules.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                {product.matchedRules.slice(0, 3).map((rule, i) => {
                  // "체감속성_손목보호_가벼움" → "손목보호 가벼움"
                  const displayName = rule
                    .replace('체감속성_', '')
                    .replace(/_/g, ' ');

                  return (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                    >
                      {displayName}
                    </span>
                  );
                })}
                {product.matchedRules.length > 3 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    +{product.matchedRules.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* 점수 (개발용, 나중에 제거 가능) */}
            {/* <div className="mt-2 text-xs text-gray-400">
              점수: {product.totalScore}점
            </div> */}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
