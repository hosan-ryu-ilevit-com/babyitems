'use client';

/**
 * 제품 구성 옵션 비교 컴포넌트
 *
 * 용도: 기저귀, 물티슈 등 다양한 팩 구성 옵션을 비교하는 접을 수 있는 테이블
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronDown, FaExternalLinkAlt, FaAward, FaBox } from 'react-icons/fa';
import type { ProductVariant } from '@/types/danawa';

interface ProductVariantsComparisonProps {
  variants: ProductVariant[];
  className?: string;
}

export default function ProductVariantsComparison({
  variants,
  className = '',
}: ProductVariantsComparisonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!variants || variants.length === 0) {
    return null;
  }

  // 최저 단가 찾기
  const lowestUnitPriceVariant = variants.reduce((lowest, current) => {
    if (!current.unitPrice || !lowest.unitPrice) return lowest;

    const currentPrice = parseFloat(current.unitPrice.replace(/[^\d.]/g, ''));
    const lowestPrice = parseFloat(lowest.unitPrice.replace(/[^\d.]/g, ''));

    return currentPrice < lowestPrice ? current : lowest;
  });

  // 가격 범위 계산
  const prices = variants.map(v => v.price).filter((p): p is number => p !== null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // 단가 범위 계산
  const unitPrices = variants
    .map(v => v.unitPrice)
    .filter((p): p is string => p !== null)
    .map(p => parseFloat(p.replace(/[^\d.]/g, '')));
  const minUnitPrice = Math.min(...unitPrices);
  const maxUnitPrice = Math.max(...unitPrices);

  return (
    <div className={`border border-neutral-200 rounded-xl overflow-hidden bg-white ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FaBox className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-neutral-900">
            다른 구성 {variants.length}가지
          </span>
          <span className="text-sm text-neutral-500">
            (단가 비교)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!isExpanded && (
            <div className="text-sm text-neutral-600">
              {variants[0].quantity} ~ {variants[variants.length - 1].quantity}
              {' · '}
              단가: {Math.round(minUnitPrice)}원 ~ {Math.round(maxUnitPrice)}원
            </div>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <FaChevronDown className="w-5 h-5 text-neutral-400" />
          </motion.div>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-200">
              {variants.map((variant, index) => {
                const isLowestUnitPrice = variant.pcode === lowestUnitPriceVariant.pcode;
                const isCurrent = variant.isActive;

                return (
                  <motion.div
                    key={variant.pcode}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`
                      px-4 py-3.5 border-b border-neutral-100 last:border-b-0
                      hover:bg-neutral-50 transition-colors
                      ${isCurrent ? 'bg-blue-50' : ''}
                      ${isLowestUnitPrice && !isCurrent ? 'bg-amber-50' : ''}
                    `}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: Quantity + Badges */}
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-base font-semibold text-neutral-900">
                          {variant.quantity}
                        </span>

                        {isCurrent && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded">
                            현재 상품
                          </span>
                        )}

                        {isLowestUnitPrice && (
                          <div className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                            <FaAward className="w-3 h-3" />
                            <span>최저단가</span>
                          </div>
                        )}

                        {variant.rank && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                            {variant.rank}
                          </span>
                        )}
                      </div>

                      {/* Middle: Prices */}
                      <div className="flex items-baseline gap-3 flex-1">
                        <div className="text-right">
                          <div className="text-lg font-bold text-neutral-900">
                            {variant.price?.toLocaleString()}원
                          </div>
                          {variant.unitPrice && (
                            <div className="text-sm text-neutral-600">
                              {variant.unitPrice}
                            </div>
                          )}
                        </div>

                        {variant.mallCount !== null && (
                          <div className="text-sm text-neutral-500">
                            {variant.mallCount}몰
                          </div>
                        )}
                      </div>

                      {/* Right: Link */}
                      <a
                        href={variant.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          flex items-center gap-1.5 px-3 py-1.5
                          text-sm font-medium text-blue-600
                          hover:bg-blue-100 rounded-lg transition-colors
                        "
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>다나와</span>
                        <FaExternalLinkAlt className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer Info */}
            <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200">
              <p className="text-xs text-neutral-600">
                💡 다나와 링크를 클릭하면 해당 구성의 상세 정보를 확인할 수 있습니다.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
