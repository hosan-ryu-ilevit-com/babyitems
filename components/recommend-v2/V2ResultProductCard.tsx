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
 * V2 추천 결과 제품 카드 (심플 버전)
 * - result 페이지 디자인 기반
 * - 깔끔한 레이아웃: 썸네일 좌측, 정보 우측
 * - 랭킹 배지는 썸네일 내부 좌상단
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
      className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
    >
      {/* 클릭 어포던스 - 우상단 chevron */}
      <div className="absolute top-4 right-3 text-gray-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* 제품 정보 */}
      <div className="flex gap-3 mb-0">
        {/* 제품 썸네일 */}
        <div className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
          {product.thumbnail ? (
            <Image
              src={product.thumbnail}
              alt={product.title}
              width={112}
              height={112}
              className="w-full h-full object-cover"
              priority={rank === 1}
              quality={90}
              sizes="112px"
            />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {/* 랭킹 배지 - 좌측 상단 */}
          <div className="absolute top-0 left-0 h-7 px-2 bg-gray-900 rounded-tl-xl rounded-tr-none rounded-bl-none rounded-br-md flex items-center justify-center">
            <span className="text-white font-semibold text-xs">
              {rank}
            </span>
          </div>
        </div>

        {/* 제품 상세 정보 */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          {/* 브랜드 */}
          {product.brand && (
            <div className="text-sm text-gray-500 font-medium mb-0">
              {product.brand}
            </div>
          )}
          {/* 제품명 */}
          <h3 className="font-semibold text-gray-900 text-base mb-1 leading-tight line-clamp-2">
            {product.title}
          </h3>
          {/* 가격 정보 */}
          <div className="space-y-0">
            {product.price && (
              <p className="text-lg font-bold text-gray-900">
                {product.price.toLocaleString()}<span className="text-sm">원</span>
              </p>
            )}
            {/* 다나와 최저가 */}
            {hasLowestPrice && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-red-600 font-medium">최저</span>
                <span className="text-red-600 font-medium">{danawaPrice.lowest_price!.toLocaleString()}원</span>
                {danawaPrice.lowest_mall && (
                  <span className="text-gray-400">({danawaPrice.lowest_mall})</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 선택 조건 매칭 태그 */}
      {product.matchedHardFilters && product.matchedHardFilters.length > 0 && (
        <div className="mt-3">
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {product.matchedHardFilters.map((filter, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full bg-white text-blue-700 font-medium"
                  >
                    {filter.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 밸런스 게임 매칭 규칙 태그 */}
      {product.matchedRules && product.matchedRules.length > 0 && (
        <div className="mt-2">
          <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="sparkle-gradient-v2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#34D399" />
                  </linearGradient>
                </defs>
                <path fill="url(#sparkle-gradient-v2)" d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
              </svg>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {product.matchedRules.slice(0, 4).map((rule, i) => {
                  // "체감속성_손목보호_가벼움" → "손목보호 가벼움"
                  const displayName = rule
                    .replace('체감속성_', '')
                    .replace(/_/g, ' ');

                  return (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full bg-white text-emerald-700 font-medium"
                    >
                      {displayName}
                    </span>
                  );
                })}
                {product.matchedRules.length > 4 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                    +{product.matchedRules.length - 4}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 추천 이유 (recommendationReason이 있는 경우) */}
      {product.recommendationReason && (
        <div className="mt-3">
          <div className="rounded-xl p-3 bg-[#F3E6FD]">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="sparkle-gradient-purple" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9325FC" />
                    <stop offset="50%" stopColor="#C750FF" />
                    <stop offset="100%" stopColor="#C878F7" />
                  </linearGradient>
                </defs>
                <path fill="url(#sparkle-gradient-purple)" d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
              </svg>
              <p className="text-sm text-gray-700 leading-normal flex-1">
                {product.recommendationReason}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
