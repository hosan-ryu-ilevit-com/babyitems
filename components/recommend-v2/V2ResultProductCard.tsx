'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { V2ResultProduct } from '@/types/recommend-v2';

// 마크다운 볼드 처리
function parseMarkdownBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

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
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      onClick={onClick}
      className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
    >
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
              priority={rank <= 3}
              quality={90}
              sizes="112px"
              fetchPriority="high"
            />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {/* 랭킹 배지 - 좌측 하단 */}
          <div className="absolute bottom-0 left-0 h-7 px-2 bg-gray-900 rounded-tl-none rounded-tr-xl rounded-bl-xl rounded-br-none flex items-center justify-center">
            <span className="text-white font-semibold text-xs">
              {rank}위
            </span>
          </div>
        </div>

        {/* 제품 상세 정보 */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          {/* 제품명 */}
          <h3 className="font-medium text-gray-800 text-sm mb-1 leading-tight line-clamp-2">
            {product.title}
          </h3>
          {/* 브랜드 */}
          {product.brand && (
            <div className="text-[13px] text-gray-500 font-medium mb-0.5">
              {product.brand}
            </div>
          )}
          {/* 별점 & 리뷰 수 - 위로 올림 */}
          {((product.averageRating ?? 0) > 0 || (product.reviewCount ?? 0) > 0) && (
            <div className="flex items-center gap-1 mb-1">
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-xs font-semibold text-gray-900">{(product.averageRating ?? 0).toFixed(1)}</span>
                <span className="text-xs text-gray-500">({(product.reviewCount ?? 0).toLocaleString()})</span>
              </div>
            </div>
          )}
          {/* 가격 정보 - 다나와 최저가 우선 사용 - 맨 아래로 내림 */}
          {(hasLowestPrice || product.price) && (
            <div className="space-y-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[16px] font-bold text-gray-900">
                  {/* 다나와 최저가가 있으면 해당 가격 사용, 없으면 product.price */}
                  <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                  {(hasLowestPrice ? danawaPrice!.lowest_price! : product.price!).toLocaleString()}<span className="text-sm">원</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 자연어 매칭 태그 (파란색) - 사용자 입력 조건 매칭 결과 */}
      {product.naturalLanguageMatches && product.naturalLanguageMatches.length > 0 && (
        <div className="mt-2">
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="url(#ai_blue_gradient)" />
                <defs>
                  <linearGradient id="ai_blue_gradient" x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#60A5FA" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {product.naturalLanguageMatches.slice(0, 4).map((match, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full bg-white text-blue-700 font-medium"
                  >
                    ✓ {match.keyword}{match.specValue ? ` (${match.specValue})` : ''}
                  </span>
                ))}
                {product.naturalLanguageMatches.length > 4 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                    +{product.naturalLanguageMatches.length - 4}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 밸런스 게임 매칭 규칙 태그 (초록색) */}
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
        <div className="mt-4">
          {/* 한줄 평 헤더 */}
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/ic-ai.svg" alt="" width={14} height={14} />
            <span className="text-[16px] font-medium ai-gradient-text">한줄 평</span>
          </div>

          {/* 추천 이유 (인용구 스타일) */}
          <div className="relative pl-3 mb-2 ml-2 mr-1">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full ai-gradient-bg opacity-50" />
            <p className="text-[14px] text-gray-600 leading-[1.4] font-medium">
              {parseMarkdownBold(product.recommendationReason)}
            </p>
          </div>
        </div>
      )}

      {/* 버튼 그룹 */}
      <div className="mt-4 flex gap-2 px-1">
        {/* 리뷰 보기 버튼 */}
        <a
          href={`https://prod.danawa.com/info/?pcode=${product.pcode}#bookmark_cm_opinion`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center gap-1"
        >
          리뷰 보기
        </a>
        {/* 최저가 구매하기 버튼 */}
        <a
          href={`https://prod.danawa.com/info/?pcode=${product.pcode}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors flex items-center justify-center gap-1 bg-black hover:bg-gray-900"
        >
          구매하기 (다나와)
        </a>
      </div>
    </motion.div>
  );
}
