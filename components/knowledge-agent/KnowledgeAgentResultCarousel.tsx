'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { logKAExternalLinkClicked, logKAProductModalOpened } from '@/lib/logging/clientLogger';

interface Product {
  pcode: string;
  name?: string;
  title?: string;
  brand?: string | null;
  price?: number | null;
  thumbnail?: string | null;
  rating?: number | null;
  averageRating?: number | null;
  reviewCount?: number | null;
  recommendReason?: string;
  recommendationReason?: string;
  id?: string;
  danawaPrice?: {
    lowest_price?: number;
    lowest_mall?: string;
  };
}

interface KnowledgeAgentResultCarouselProps {
  products: Product[];
  categoryKey: string;
  categoryName?: string;
  onProductClick: (product: any, tab?: 'price' | 'danawa_reviews') => void;
}

// 선택된 카드/인디케이터 색상 (챗 인풋 바와 동일한 blue 계열)
const selectedBorderColor = '#60a5fa'; // blue-400
const selectedShadow = '0 4px 20px rgba(59, 130, 246, 0.15)'; // blue-500 그림자
const indicatorColor = '#3b82f6'; // blue-500

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

function ResultCard({
  product,
  rank,
  categoryKey,
  onProductClick,
  isSelected,
}: {
  product: Product;
  rank: number;
  categoryKey: string;
  onProductClick: (product: any, tab?: 'price' | 'danawa_reviews') => void;
  isSelected: boolean;
}) {
  const title = product.name || product.title || '';
  const danawaPrice = product.danawaPrice;
  const hasLowestPrice = danawaPrice && danawaPrice.lowest_price && danawaPrice.lowest_price > 0;
  const price = hasLowestPrice ? danawaPrice!.lowest_price! : product.price;
  const rating = product.rating || product.averageRating || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className="h-full bg-white rounded-2xl p-4 cursor-pointer hover:bg-gray-50 transition-all duration-200 flex flex-col border-2"
      style={{
        borderColor: isSelected ? selectedBorderColor : '#e5e7eb', // gray-200
        boxShadow: isSelected ? selectedShadow : undefined,
      }}
      onClick={() => onProductClick(product, 'price')}
    >
      {/* 제품 정보 - 기존 레이아웃 유지 */}
      <div className="flex gap-3 mb-0">
        {/* 제품 썸네일 */}
        <div className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
          {product.thumbnail ? (
            <Image
              src={product.thumbnail}
              alt={title}
              width={112}
              height={112}
              className="w-full h-full object-cover"
              priority={rank <= 3}
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
          {/* 랭킹 배지 - 좌측 하단 (기존 스타일) */}
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
            {title}
          </h3>
          {/* 브랜드 */}
          {product.brand && (
            <div className="text-[13px] text-gray-500 font-medium mb-0.5">
              {product.brand}
            </div>
          )}
          {/* 별점 & 리뷰 수 */}
          {(rating > 0 || (product.reviewCount ?? 0) > 0) && (
            <div className="flex items-center gap-1 mb-1">
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-xs font-semibold text-gray-900">{rating.toFixed(1)}</span>
                <span className="text-xs text-gray-500">({(product.reviewCount ?? 0).toLocaleString()})</span>
              </div>
            </div>
          )}
          {/* 가격 정보 */}
          {price && price > 0 && (
            <div className="flex items-center gap-1.5">
              <p className="text-[16px] font-bold text-gray-900">
                <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                {price.toLocaleString()}<span className="text-sm">원</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 버튼 - 항상 하단 고정 */}
      <div className="mt-auto pt-4 space-y-2">
        <div className="flex gap-2">
          {/* 리뷰 보기 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const pcode = product.pcode || product.id;
              const url = `https://prod.danawa.com/info/?pcode=${pcode}#bookmark_cm_opinion`;
              logKAExternalLinkClicked(categoryKey, pcode || '', title, '다나와 리뷰', url);
              onProductClick(product, 'danawa_reviews');
            }}
            className="flex-1 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
          >
            리뷰 보기
          </button>
          {/* 구매하기 */}
          <a
            href={`https://prod.danawa.com/info/?pcode=${product.pcode || product.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              const pcode = product.pcode || product.id;
              logKAExternalLinkClicked(categoryKey, pcode || '', title, '다나와 구매', (e.currentTarget as HTMLAnchorElement).href);
            }}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-black hover:bg-gray-900 rounded-xl transition-colors text-center"
          >
            구매하기
          </a>
        </div>
        {/* 상세보기 · 최저가비교 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const pcode = product.pcode || product.id;
            logKAProductModalOpened(categoryKey, pcode || '', title);
            onProductClick(product, 'price');
          }}
          className="w-full py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          상세보기 · 최저가비교
        </button>
      </div>
    </motion.div>
  );
}

export function KnowledgeAgentResultCarousel({
  products,
  categoryKey,
  onProductClick,
}: KnowledgeAgentResultCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0); // 항상 1위(0번)가 초기 선택
  const displayProducts = products.slice(0, 5); // 5개까지 표시

  // 데스크탑 드래그 스크롤 상태
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftStart, setScrollLeftStart] = useState(0);

  // 스크롤 위치에 따라 activeIndex 업데이트
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const cardWidth = 300 + 12; // 카드 너비 + gap
      const index = Math.round(scrollLeft / cardWidth);
      setActiveIndex(Math.min(index, displayProducts.length - 1));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [displayProducts.length]);

  // 데스크탑 마우스 드래그 스크롤
  const handleMouseDown = (e: React.MouseEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    setIsDragging(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeftStart(container.scrollLeft);
    container.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const container = scrollRef.current;
    if (!container) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeftStart - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    const container = scrollRef.current;
    if (container) container.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      const container = scrollRef.current;
      if (container) container.style.cursor = 'grab';
    }
  };

  // dot 클릭 시 해당 카드로 스크롤
  const scrollToIndex = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;

    const cardWidth = 300 + 12;
    container.scrollTo({
      left: cardWidth * index,
      behavior: 'smooth',
    });
  };

  return (
    <div className="space-y-3">
      {/* 가로 스크롤 컨테이너 - 패딩 영역까지 확장 + 데스크탑 드래그 스크롤 */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4"
        style={{ scrollSnapType: 'x mandatory', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-stretch gap-3 px-4 pb-2" style={{ width: 'max-content', minWidth: '100%' }}>
          {displayProducts.map((product, i) => (
            <div key={product.pcode || product.id || i} className="snap-center w-[300px]">
              <ResultCard
                product={product}
                rank={i + 1}
                categoryKey={categoryKey}
                onProductClick={onProductClick}
                isSelected={i === activeIndex}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 숫자 인디케이터 + 좌우 버튼 */}
      {displayProducts.length > 1 && (
        <div className="flex justify-center items-center gap-3">
          {/* 이전 버튼 */}
          <button
            onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              activeIndex === 0
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            aria-label="이전 제품"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* 숫자 표시 */}
          <div className="flex items-center gap-1 text-sm">
            <span className="font-bold text-gray-900">{activeIndex + 1}</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">{displayProducts.length}</span>
          </div>

          {/* 다음 버튼 */}
          <button
            onClick={() => scrollToIndex(Math.min(displayProducts.length - 1, activeIndex + 1))}
            disabled={activeIndex === displayProducts.length - 1}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              activeIndex === displayProducts.length - 1
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            aria-label="다음 제품"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
