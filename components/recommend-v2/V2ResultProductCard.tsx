'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { V2ResultProduct } from '@/types/recommend-v2';

interface V2ResultProductCardProps {
  product: V2ResultProduct;
  rank: number;
  onClick?: () => void;
}

/**
 * V2 추천 결과 제품 카드
 * - 썸네일, 브랜드, 제품명, 가격
 * - 다나와 최저가 배지
 * - 매칭된 하드 필터 조건 태그
 */
export function V2ResultProductCard({
  product,
  rank,
  onClick,
}: V2ResultProductCardProps) {
  const danawaPrice = product.danawaPrice;
  const hasLowestPrice = danawaPrice && danawaPrice.lowest_price && danawaPrice.lowest_price > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      onClick={onClick}
      className={`relative bg-white rounded-2xl border-2 overflow-hidden cursor-pointer hover:shadow-md transition-all ${
        rank === 1
          ? 'border-yellow-400 shadow-lg'
          : rank === 2
          ? 'border-gray-300'
          : 'border-amber-200'
      }`}
    >
      {/* 순위 뱃지 */}
      <div
        className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl font-bold text-sm z-10 ${
          rank === 1
            ? 'bg-yellow-400 text-yellow-900'
            : rank === 2
            ? 'bg-gray-300 text-gray-700'
            : 'bg-amber-600 text-white'
        }`}
      >
        {rank}위
      </div>

      {/* 클릭 어포던스 */}
      <div className="absolute top-3 right-3 text-gray-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* 카드 내용 */}
      <div className="p-4 pt-8">
        <div className="flex gap-3">
          {/* 썸네일 */}
          <div className="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
            {product.thumbnail ? (
              <Image
                src={product.thumbnail}
                alt={product.title}
                width={96}
                height={96}
                className="w-full h-full object-contain p-2"
                quality={85}
                sizes="96px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* 브랜드 */}
            {product.brand && (
              <p className="text-xs text-gray-500 font-medium">
                {product.brand}
              </p>
            )}

            {/* 제품명 */}
            <h4 className="text-sm font-bold text-gray-900 line-clamp-2 mb-1.5 leading-tight">
              {product.title}
            </h4>

            {/* 가격 */}
            <div className="mt-auto">
              {product.price && (
                <p className="text-lg font-bold text-gray-900">
                  {product.price.toLocaleString()}
                  <span className="text-xs text-gray-500 ml-0.5">원</span>
                </p>
              )}

              {/* 다나와 최저가 */}
              {hasLowestPrice && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-red-600 font-medium">최저</span>
                  <span className="text-xs text-red-600 font-bold">
                    {danawaPrice.lowest_price!.toLocaleString()}원
                  </span>
                  {danawaPrice.lowest_mall && (
                    <span className="text-[10px] text-gray-400">
                      ({danawaPrice.lowest_mall})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 매칭된 하드 필터 조건 태그 */}
        {product.matchedHardFilters && product.matchedHardFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {product.matchedHardFilters.map((filter, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium"
              >
                {filter.value}
              </span>
            ))}
          </div>
        )}

        {/* 밸런스 게임 매칭 규칙 태그 (기존) */}
        {product.matchedRules && product.matchedRules.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
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
      </div>
    </motion.div>
  );
}
