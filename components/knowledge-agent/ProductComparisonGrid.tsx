'use client';

/**
 * 쿠팡 스타일 비교표 컴포넌트
 *
 * - 2.8개 제품이 한눈에 보이는 가로 스크롤
 * - 상품 헤더 + 장단점 + 스펙 비교
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Star } from '@phosphor-icons/react/dist/ssr';
import { logKnowledgeAgentComparisonView, logKAComparisonPurchaseClick } from '@/lib/logging/clientLogger';
import type { FilterTag, ProductTagScores } from '@/lib/knowledge-agent/types';

interface KnowledgeProduct {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  raw?: any;
  rating?: number | null;
  reviewCount?: number | null;
  specs?: Record<string, string>;
  prosFromReviews?: string[];
  consFromReviews?: string[];
  oneLiner?: string;
  productUrl?: string;
  tagScores?: ProductTagScores;
}

interface ProductComparisonGridProps {
  products: KnowledgeProduct[];
  categoryKey: string;
  categoryName?: string;
  filterTags?: FilterTag[];
  onProductClick?: (product: any) => void;
}

// 제외할 스펙 키
const EXCLUDE_SPEC_KEYS = ['브랜드', '모델명', '상품명', '제품명', '제조사', '가격', '썸네일', 'thumbnail'];

export function ProductComparisonGrid({
  products,
  categoryKey,
  categoryName,
  filterTags = [],
  onProductClick,
}: ProductComparisonGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [expandedEvidences, setExpandedEvidences] = useState<Set<string>>(new Set());

  // 최대 5개 제품까지 표시
  const displayProducts = useMemo(() => products.slice(0, 5), [products]);

  // 로깅
  useEffect(() => {
    if (displayProducts.length >= 2) {
      logKnowledgeAgentComparisonView(
        categoryKey,
        categoryName || '',
        displayProducts.map(p => p.pcode)
      );
    }
  }, [displayProducts, categoryKey, categoryName]);

  // 첫 로드 시 스크롤 힌트
  useEffect(() => {
    if (!hasScrolled && scrollContainerRef.current && displayProducts.length >= 2) {
      const container = scrollContainerRef.current;
      setTimeout(() => {
        container.scrollTo({ left: 40, behavior: 'smooth' });
        setTimeout(() => {
          container.scrollTo({ left: 0, behavior: 'smooth' });
          setHasScrolled(true);
        }, 300);
      }, 500);
    }
  }, [hasScrolled, displayProducts.length]);

  // 모든 스펙 키 수집
  const allSpecKeys = useMemo(() => {
    const keys = new Set<string>();
    displayProducts.forEach(p => {
      if (p.specs) {
        Object.keys(p.specs).forEach(k => {
          if (!EXCLUDE_SPEC_KEYS.includes(k)) {
            keys.add(k);
          }
        });
      }
    });
    return Array.from(keys);
  }, [displayProducts]);

  // 빈 값 체크
  const isEmpty = (v: any) =>
    v === null || v === undefined || v === '' || v === '-' || v === '정보없음' || String(v).toLowerCase() === 'null';

  // **...** 를 <strong>...</strong> 으로 변환
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  if (displayProducts.length < 2) return null;

  // 컬럼 너비: 약 2.8개 보이게 (컨테이너 480px 기준 ~170px)
  const columnWidth = 'clamp(140px, 36vw, 165px)';
  const totalWidth = `calc(${columnWidth} * ${displayProducts.length} + 24px)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="-mx-4" // 좌우 패딩 무시
    >
      {/* 스크롤 컨테이너 */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto scrollbar-hide px-4"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* 상품 헤더 영역 */}
        <div className="flex items-stretch px-2" style={{ width: totalWidth }}>
          {displayProducts.map((product) => (
            <div
              key={product.pcode}
              className="shrink-0 px-2 flex flex-col"
              style={{ width: columnWidth, scrollSnapAlign: 'start' }}
            >
              {/* 이미지 - 회색 배경 없이, 이미지 자체에 곡률 */}
              <button
                type="button"
                onClick={() => onProductClick?.(product.raw ?? product)}
                className="relative w-full aspect-square mb-2 cursor-pointer block"
                aria-label={`${product.name} 상세 보기`}
              >
                {product.thumbnail ? (
                  <Image
                    src={product.thumbnail}
                    alt={product.name}
                    fill
                    className="object-contain rounded-md"
                    sizes="(max-width: 768px) 36vw, 220px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 rounded-md bg-gray-50">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </button>

              {/* 제품명 - flex-grow로 공간 채움 */}
              <p className="text-[13px] font-medium text-gray-800 line-clamp-3 leading-tight mb-1 flex-grow">
                {product.name}
              </p>

              {/* 가격 + 버튼: mt-auto로 하단 고정 */}
              <div className="mt-auto">
                {/* 가격 */}
                <p className="text-[15px] font-bold text-gray-900 mb-2">
                  {isEmpty(product.price)
                    ? '가격 문의'
                    : `${product.price!.toLocaleString()}원`
                  }
                </p>

                {/* 최저가 구매하기 버튼 */}
                <a
                  href={product.productUrl || `https://prod.danawa.com/info/?pcode=${product.pcode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    logKAComparisonPurchaseClick(
                      categoryKey,
                      categoryName || '',
                      product.pcode,
                      product.name,
                      product.price,
                      product.productUrl || `https://prod.danawa.com/info/?pcode=${product.pcode}`,
                      'header'
                    );
                  }}
                  className="block w-full py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-[13px] font-medium rounded-md text-center transition-colors"
                >
                  최저가 구매하기
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* 별점 + 장단점 섹션 */}
        <div className="mt-3 pt-2">
          <div className="px-4 mb-2">
            <h4 className="text-[14px] font-semibold text-gray-600">장단점 요약</h4>
          </div>

          {/* 디바이더 - 장단점 헤더 아래에 */}
          <div style={{ width: totalWidth }}>
            <div className="border-t border-gray-200 mx-4" />
          </div>

          <div className="flex items-start mt-3 px-2" style={{ width: totalWidth }}>
            {displayProducts.map((product) => (
              <div
                key={`review-${product.pcode}`}
                className="shrink-0 px-2"
                style={{ width: columnWidth }}
              >
                {/* 별점 + 리뷰 수 - 노란별 1개만 */}
                <div className="flex items-center gap-1 mb-2">
                  <Star size={14} weight="fill" className="text-yellow-400" />
                  <span className="text-[14px] font-bold text-gray-700">
                    {product.rating?.toFixed(1) || '—'}
                  </span>
                  <span className="text-[13px] text-gray-400">
                    ({product.reviewCount?.toLocaleString() || 0})
                  </span>
                </div>

                {/* 장점 - full 표시 */}
                {(product.prosFromReviews && product.prosFromReviews.length > 0) && (
                  <div className="mb-2">
                    <div className="space-y-1">
                      {product.prosFromReviews.slice(0, 3).map((pro, idx) => (
                        <div key={idx} className="flex items-start gap-1 text-[12px] text-gray-700 leading-snug">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-green-400" />
                          <span>{renderFormattedText(pro)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 단점 - full 표시 */}
                {(product.consFromReviews && product.consFromReviews.length > 0) && (
                  <div>
                    <div className="space-y-1">
                      {product.consFromReviews.slice(0, 2).map((con, idx) => (
                        <div key={idx} className="flex items-start gap-1 text-[12px] text-gray-500 leading-snug">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-red-400" />
                          <span>{renderFormattedText(con)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!product.prosFromReviews?.length && !product.consFromReviews?.length) && (
                  <p className="text-[12px] text-gray-400">리뷰 분석 중</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 스펙 비교 섹션 */}
        {allSpecKeys.length > 0 && (
          <div className="mt-5">
            {allSpecKeys.map((specKey) => (
              <div key={specKey}>
                {/* 섹션 헤더 */}
                <div className="px-4 pt-5 pb-1">
                  <h4 className="text-[14px] font-bold text-gray-900">{specKey}</h4>
                </div>

                {/* 디바이더 - 스펙 키 아래에 - 전체 너비만큼 */}
                <div style={{ width: totalWidth }}>
                  <div className="border-t border-gray-200 mx-4" />
                </div>

                {/* 각 제품별 스펙 값 */}
                <div className="flex items-start py-2.5 px-2" style={{ width: totalWidth }}>
                  {displayProducts.map((product) => {
                    const value = product.specs?.[specKey];

                    return (
                      <div
                        key={`${specKey}-${product.pcode}`}
                        className="shrink-0 px-2"
                        style={{ width: columnWidth }}
                      >
                        <p className={`text-[14px] font-medium leading-snug ${isEmpty(value) ? 'text-gray-400' : 'text-gray-800'}`}>
                          {isEmpty(value) ? '-' : value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 사용자 조건 충족도 섹션 */}
        {filterTags.length > 0 && (
          <div className="mt-5">
           
           
            {filterTags.map((tag) => (
              <div key={tag.id}>
                {/* 태그 라벨 (키) */}
                <div className="px-4 pt-5 pb-1">
                  <h4 className="text-[14px] font-bold text-gray-900">{tag.label}</h4>
                </div>

                {/* 디바이더 */}
                <div style={{ width: totalWidth }}>
                  <div className="border-t border-gray-200 mx-4" />
                </div>

                {/* 각 제품별 충족도 */}
                <div className="flex items-start py-2.5 px-2" style={{ width: totalWidth }}>
                  {displayProducts.map((product) => {
                    const tagScore = product.tagScores?.[tag.id];
                    const score = tagScore?.score;
                    const evidence = tagScore?.evidence;
                    const evidenceKey = `${tag.id}-${product.pcode}`;
                    const isExpanded = expandedEvidences.has(evidenceKey);

                    // evidence가 3줄(약 50-60자)을 넘는지 확인
                    const needsExpand = evidence && evidence.length > 50;

                    return (
                      <div
                        key={evidenceKey}
                        className="shrink-0 px-2"
                        style={{ width: columnWidth }}
                      >
                        {/* 충족도 아이콘 */}
                        <div className="flex items-center gap-1 mb-1">
                          {score === 'full' && (
                            <span className="text-green-500 font-bold text-[15px]" title="충족">✓</span>
                          )}
                          {score === 'partial' && (
                            <span className="text-yellow-500 font-bold text-[15px]" title="부분 충족">△</span>
                          )}
                          {(score === null || !score) && (
                            <span className="text-red-400 font-bold text-[15px]" title="미충족">✗</span>
                          )}
                        </div>

                        {/* Evidence (상세 설명) - 있는 경우에만 */}
                        {evidence && score !== null && (
                          <div>
                            <p className={`text-[11px] text-gray-600 leading-tight ${!isExpanded && 'line-clamp-3'}`}>
                              {evidence}
                            </p>
                            {needsExpand && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedEvidences(prev => {
                                    const next = new Set(prev);
                                    if (isExpanded) {
                                      next.delete(evidenceKey);
                                    } else {
                                      next.add(evidenceKey);
                                    }
                                    return next;
                                  });
                                }}
                                className="text-[11px] text-blue-500 hover:text-blue-600 mt-0.5 underline"
                              >
                                {isExpanded ? '접기' : '펼치기'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 최저가 구매하기 하단 버튼 row */}
        <div className="flex items-start mt-8 pb-8 px-2" style={{ width: totalWidth }}>
          {displayProducts.map((product) => (
            <div
              key={`footer-buy-${product.pcode}`}
              className="shrink-0 px-2"
              style={{ width: columnWidth }}
            >
              <a
                href={product.productUrl || `https://prod.danawa.com/info/?pcode=${product.pcode}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  logKAComparisonPurchaseClick(
                    categoryKey,
                    categoryName || '',
                    product.pcode,
                    product.name,
                    product.price,
                    product.productUrl || `https://prod.danawa.com/info/?pcode=${product.pcode}`,
                    'footer'
                  );
                }}
                className="block w-full py-2 bg-gray-800 hover:bg-gray-900 text-white text-[14px] font-bold rounded-md text-center transition-colors shadow-sm"
              >
                최저가 구매하기
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* CSS for hiding scrollbar */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </motion.div>
  );
}
