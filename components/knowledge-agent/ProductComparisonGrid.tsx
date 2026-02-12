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
  rank?: number; // 원본 추천 순위 (1~5)
  danawaRank?: number | null; // 다나와 인기순위
}

interface ProductComparisonGridProps {
  products: KnowledgeProduct[];
  categoryKey: string;
  categoryName?: string;
  filterTags?: FilterTag[];
  onProductClick?: (product: any, tab?: 'price' | 'danawa_reviews', scrollToPrice?: boolean) => void;
  totalQuestionsCount?: number; // 매칭도 계산용
}

// 제외할 스펙 키
const EXCLUDE_SPEC_KEYS = ['브랜드', '모델명', '상품명', '제품명', '제조사', '가격', '썸네일', 'thumbnail'];

// 매칭도 계산 함수
function calculateMatchRate(
  tagScores: ProductTagScores | undefined,
  totalQuestionsCount: number
): number | undefined {
  if (!tagScores || Object.keys(tagScores).length === 0) return undefined;

  const denominator = totalQuestionsCount > 0 ? totalQuestionsCount : 7;
  const fulfilledCount = Object.values(tagScores).reduce((acc, curr) => {
    if (curr.score === 'full') return acc + 1;
    if (curr.score === 'partial') return acc + 0.5;
    return acc;
  }, 0);

  const rawRate = Math.round((fulfilledCount / denominator) * 100);
  if (rawRate >= 100) return 100;
  return Math.min(99, Math.round(rawRate * 1.2));
}

export function ProductComparisonGrid({
  products,
  categoryKey,
  categoryName,
  filterTags = [],
  onProductClick,
  totalQuestionsCount = 7,
}: ProductComparisonGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [prosConsProgress, setProsConsProgress] = useState(0);
  const prosConsLoadedRef = useRef(false);

  // 최대 5개 제품까지 표시 + 조건 충족도 기준 정렬 (✓ 많은 순 → ✗ 많은 순)
  const displayProducts = useMemo(() => {
    const sliced = products.slice(0, 5);
    if (filterTags.length === 0) return sliced;

    return [...sliced].sort((a, b) => {
      const scoreOf = (p: KnowledgeProduct) => {
        let s = 0;
        for (const tag of filterTags) {
          const v = p.tagScores?.[tag.id]?.score;
          if (v === 'full') s += 1;
          else if (v === 'partial') s += 0.5;
          else s -= 1; // null / undefined → ✗
        }
        return s;
      };
      return scoreOf(b) - scoreOf(a);
    });
  }, [products, filterTags]);

  // 장단점 데이터가 있는지 확인
  const hasProsConsData = useMemo(() => {
    return displayProducts.some(p =>
      (p.prosFromReviews && p.prosFromReviews.length > 0) ||
      (p.consFromReviews && p.consFromReviews.length > 0)
    );
  }, [displayProducts]);

  // 장단점 로딩 프로그레스 (11초에 99%까지, 데이터 로드 시 즉시 100%)
  useEffect(() => {
    // 데이터가 로드되면 ref 업데이트
    if (hasProsConsData) {
      prosConsLoadedRef.current = true;
    }

    // 11초에 걸쳐 0 -> 99% 진행 (110ms마다 1% 증가)
    const interval = setInterval(() => {
      setProsConsProgress(prev => {
        // 데이터 로드됨 - 즉시 100%
        if (prosConsLoadedRef.current) return 100;
        if (prev >= 99) return 99; // 99%에서 멈춤
        return prev + 1;
      });
    }, 110);

    return () => clearInterval(interval);
  }, [hasProsConsData]);

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
    // 표시 중인 상품들의 값이 모두 비어있으면 해당 스펙 row는 숨김
    const isEmptySpecValue = (v: any) =>
      v === null ||
      v === undefined ||
      v === '' ||
      v === '-' ||
      v === '정보없음' ||
      String(v).toLowerCase() === 'null';

    return Array.from(keys).filter((key) =>
      displayProducts.some((product) => !isEmptySpecValue(product.specs?.[key]))
    );
  }, [displayProducts]);

  // 빈 값 체크
  const isEmpty = (v: any) =>
    v === null || v === undefined || v === '' || v === '-' || v === '정보없음' || String(v).toLowerCase() === 'null';

  // **키워드** 에서 키워드만 추출
  const extractKeyword = (text: string): string => {
    const match = text.match(/\*\*(.*?)\*\*/);
    return match ? match[1] : text;
  };

  // evidence 내 **강조** 구문을 실제 bold 텍스트로 렌더링
  const renderBoldText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={`b-${idx}`}>{part.slice(2, -2)}</strong>;
      }
      return <span key={`t-${idx}`}>{part}</span>;
    });
  };


  if (displayProducts.length < 2) return null;

  // 컬럼 너비: 약 2.3개 보이게 (컨테이너 480px 기준 ~200px)
  const columnWidth = 'clamp(165px, 43vw, 210px)';
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
          {displayProducts.map((product, index) => {
            const rank = product.rank || (index + 1); // 원본 순위 우선, 없으면 현재 index
            const matchRate = calculateMatchRate(product.tagScores, totalQuestionsCount);

            return (
            <div
              key={product.pcode}
              className="shrink-0 px-2 flex flex-col"
              style={{ width: columnWidth, scrollSnapAlign: 'start' }}
            >
              {/* 이미지 - 회색 배경 없이, 이미지 자체에 곡률 */}
              <div
                className="relative w-full aspect-square mb-2 block"
                aria-hidden="true"
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

                {/* 순위 + 매칭도 뱃지 (썸네일 안 왼쪽 위) */}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <div className={`px-2.5 py-1.5 rounded-full flex items-center justify-center ${
                    rank === 1 && matchRate !== undefined && matchRate >= 90 ? 'bg-blue-500/90' : 'bg-gray-900/75'
                  }`}>
                    <span className="text-white font-semibold text-[11px] leading-none">
                      추천 {rank}위
                    </span>
                  </div>
                </div>
              </div>

              {/* 제품명 - flex-grow로 공간 채움 */}
              <p className="text-[13px] font-medium text-gray-800 line-clamp-3 leading-tight mb-1 flex-grow">
                {product.name}
              </p>

              {/* 가격 + 버튼: mt-auto로 하단 고정 */}
              <div className="mt-auto">
                {/* 가격 */}
                <p className="text-[15px] font-bold text-gray-900 mb-1">
                  {isEmpty(product.price)
                    ? '가격 문의'
                    : `최저 ${product.price!.toLocaleString()}원`
                  }
                </p>

                {/* 인기순위 */}
                {(() => {
                  const rawDanawaRank = product.danawaRank ?? product.raw?.danawaRank;
                  const danawaRank = typeof rawDanawaRank === 'string'
                    ? parseInt(rawDanawaRank.replace(/[^\d]/g, ''), 10)
                    : rawDanawaRank;
                  const hasDanawaRank = typeof danawaRank === 'number' && Number.isFinite(danawaRank) && danawaRank > 0;

                  return hasDanawaRank ? (
                    <p className="text-[12px] text-gray-400 font-medium mb-4">
                      {categoryName} 인기순위 <span className="font-semibold text-gray-500">{danawaRank}위</span>
                    </p>
                  ) : <div className="mb-4" />;
                })()}

                {/* 버튼 그룹 */}
                <div className="space-y-1.5">
                    {/* 최저가 비교하기 버튼 */}
                  <button
                    type="button"
                    onClick={() => onProductClick?.(product.raw ?? product, 'price', true)}
                    className="block w-full py-2 bg-[#1e2329] hover:bg-black text-white rounded-md text-center transition-colors"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[13px] font-semibold">최저가 비교하기</span>
                     
                    </div>
                  </button>

                  {/* 자세히 보기 버튼 */}
                  <button
                    type="button"
                    onClick={() => onProductClick?.(product.raw ?? product)}
                    className="block w-full py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-medium rounded-md text-center transition-colors border border-gray-200"
                  >
                    자세히 보기
                  </button>

                
                 
                </div>
              </div>
            </div>
          );
          })}
        </div>

        {/* 별점 + 장단점 섹션 */}
        <div className="mt-3 pt-2">
          <div className="px-4 mt-4 mb-2 flex items-center gap-4">
            <h4 className="text-[22px] font-bold text-gray-900">AI 리뷰 요약</h4>
            {!hasProsConsData && (
              <span className="text-[12px] text-gray-400">
                상세 정보/리뷰 분석 중 <span className="text-blue-500 font-medium">{prosConsProgress}%</span>
              </span>
            )}
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
                <div className="flex items-center gap-1 mb-1">
                  <Star size={22} weight="fill" className="text-yellow-400" />
                  <span className="text-[22px] font-bold text-gray-700">
                    {product.rating?.toFixed(1) || '—'}
                  </span>
                  <span className="text-[16px] text-gray-400">
                    ({product.reviewCount?.toLocaleString() || 0})
                  </span>
                </div>

                {/* 리뷰 모두보기 버튼 */}
                <button
                  type="button"
                  onClick={() => onProductClick?.(product.raw ?? product, 'danawa_reviews')}
                  className="text-[14px] text-blue-500 hover:text-blue-600 font-medium mb-3 mt-2 flex items-center gap-0.5 transition-colors"
                >
                  리뷰 모두보기
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* 장점 - 키워드 칩 */}
                {(product.prosFromReviews && product.prosFromReviews.length > 0) && (
                  <div className="mb-2">
                    <div className="flex flex-wrap gap-1">
                      {product.prosFromReviews.slice(0, 4).map((pro, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-[12px] text-green-700 font-medium"
                        >
                          <span className="w-1 h-1 rounded-full bg-green-400 shrink-0" />
                          {extractKeyword(pro)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 단점 - 키워드 칩 */}
                {(product.consFromReviews && product.consFromReviews.length > 0) && (
                  <div>
                    <div className="flex flex-wrap gap-1">
                      {product.consFromReviews.slice(0, 2).map((con, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-[12px] text-red-500 font-medium"
                        >
                          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                          {extractKeyword(con)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(!product.prosFromReviews?.length && !product.consFromReviews?.length) && (
                  <div className="space-y-1.5">
                    {/* 스켈레톤 UI */}
                    <div className="flex items-center gap-1">
                      <span className="shrink-0 w-1 h-1 rounded-full bg-green-200" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="shrink-0 w-1 h-1 rounded-full bg-green-200" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="shrink-0 w-1 h-1 rounded-full bg-red-200" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 사용자 조건 충족도 섹션 */}
        {filterTags.length > 0 && (
          <div className="mt-5">
            {[...filterTags].sort((a, b) => {
              // ✓ 많은 조건이 위로, ✗ 많은 조건이 아래로
              const tagScore = (tag: FilterTag) =>
                displayProducts.reduce((sum, p) => {
                  const s = p.tagScores?.[tag.id]?.score;
                  return sum + (s === 'full' ? 1 : s === 'partial' ? 0.5 : -1);
                }, 0);
              return tagScore(b) - tagScore(a);
            }).map((tag) => {
              // 모든 제품이 미충족(X)인 경우 해당 row 숨김
              const allProductsNotMet = displayProducts.every((product) => {
                const score = product.tagScores?.[tag.id]?.score;
                return score === null || !score;
              });

              if (allProductsNotMet) return null;

              return (
              <div key={tag.id}>
                {/* 태그 라벨 (키) */}
                <div className="px-4 pt-5 pb-1 mt-4">
                  <h4 className="text-[22px] font-bold text-gray-900">{tag.label}</h4>
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

                    return (
                      <div
                        key={evidenceKey}
                        className="shrink-0 px-2"
                        style={{ width: columnWidth }}
                      >
                        {/* 충족도 아이콘 */}
                        <div className="flex items-center gap-1 mb-1">
                          {score === 'full' && (
                            <span className="text-blue-500 font-bold text-[24px]" title="충족">✓</span>
                          )}
                          {score === 'partial' && (
                            <span className="text-yellow-500 font-bold text-[24px]" title="부분 충족">△</span>
                          )}
                          {(score === null || !score) && (
                            <span className="text-red-400 font-bold text-[26px]" title="미충족">✗</span>
                          )}
                        </div>

                        {/* Evidence (상세 설명) - 있는 경우에만, 항상 펼쳐진 상태 */}
                        {evidence && score !== null && (
                          <div className="mt-1">
                            <p className="text-[13px] text-gray-600 leading-snug">
                              {renderBoldText(evidence)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        )}

        {/* 스펙 비교 섹션 */}
        {allSpecKeys.length > 0 && (
          <div className="mt-5">
            {allSpecKeys.map((specKey) => (
              <div key={specKey}>
                {/* 섹션 헤더 */}
                <div className="px-4 pt-5 pb-1 mt-4">
                  <h4 className="text-[22px] font-bold text-gray-900">{specKey}</h4>
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

        {/* 최저가 구매하기 하단 버튼 row */}
        <div className="flex items-start mt-8 pb-8 px-2" style={{ width: totalWidth }}>
          {displayProducts.map((product) => (
            <div
              key={`footer-buy-${product.pcode}`}
              className="shrink-0 px-2"
              style={{ width: columnWidth }}
            >
              {/* 버튼 그룹 */}
              <div className="space-y-1.5">
                {/* 자세히 보기 버튼 */}
                <button
                  type="button"
                  onClick={() => onProductClick?.(product.raw ?? product)}
                  className="block w-full py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-medium rounded-md text-center transition-colors border border-gray-200"
                >
                  자세히 보기
                </button>

               
 {/* 최저가 비교하기 버튼 */}
                  <button
                    type="button"
                    onClick={() => onProductClick?.(product.raw ?? product, 'price', true)}
                    className="block w-full py-2 bg-[#1e2329] hover:bg-black text-white rounded-md text-center transition-colors"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[13px] font-semibold">최저가 비교하기</span>
                     
                    </div>
                  </button>
              </div>
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
