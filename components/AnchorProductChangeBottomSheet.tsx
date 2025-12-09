'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { logButtonClick } from '@/lib/logging/clientLogger';
import { LoadingSpinner } from './LoadingSpinner';

interface Product {
  productId: string;
  모델명: string;
  브랜드: string;
  최저가: number;
  썸네일: string;
  리뷰수?: number;
  평균평점?: number;
  순위?: number;
}

interface AnchorProductChangeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentCategory: string;
  currentAnchorProductId: string;
  onSelectProduct: (product: Product) => void;
  useV2Api?: boolean; // v2 Supabase API 사용 여부
}

export default function AnchorProductChangeBottomSheet({
  isOpen,
  onClose,
  currentCategory,
  currentAnchorProductId,
  onSelectProduct,
  useV2Api = false,
}: AnchorProductChangeBottomSheetProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 제품 목록 로드
  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentCategory, useV2Api]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // v2 API 또는 기존 API 호출
      const apiUrl = useV2Api
        ? `/api/v2/anchor-products?categoryKey=${currentCategory}&limit=50`
        : `/api/anchor-products?category=${currentCategory}&limit=50`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 검색 필터링
  const filteredProducts = products.filter(product => {
    const searchLower = searchQuery.toLowerCase();
    return (
      product.모델명.toLowerCase().includes(searchLower) ||
      product.브랜드.toLowerCase().includes(searchLower)
    );
  });

  const handleSelectProduct = (product: Product) => {
    logButtonClick(`기준제품_변경_${product.브랜드}_${product.모델명}`, 'compare');
    onSelectProduct(product);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-3xl z-50 flex flex-col"
            style={{ height: '80vh' }}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-900">기준제품 변경하기</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="제품명 또는 브랜드 검색"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-300 focus:outline-none focus:border-blue-500 text-sm"
                />
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Product List */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <LoadingSpinner size="sm" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                  <p className="text-sm">검색 결과가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => {
                    const isCurrentAnchor = product.productId === currentAnchorProductId;

                    return (
                      <button
                        key={product.productId}
                        onClick={() => handleSelectProduct(product)}
                        disabled={isCurrentAnchor}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          isCurrentAnchor
                            ? 'bg-blue-50 border-2 border-blue-500 cursor-not-allowed opacity-75'
                            : 'bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {/* 썸네일 */}
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                          {product.썸네일 && (
                            <Image
                              src={product.썸네일}
                              alt={product.모델명}
                              width={64}
                              height={64}
                              className="w-full h-full object-cover"
                              quality={85}
                            />
                          )}
                          {/* 순위 배지 */}
                          {product.순위 && !isCurrentAnchor && (
                            <div className="absolute top-0 left-0 w-5 h-5 bg-gray-900 rounded-tl-lg rounded-br-md flex items-center justify-center">
                              <span className="text-white font-bold text-[10px]">{product.순위}</span>
                            </div>
                          )}
                          {isCurrentAnchor && (
                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* 제품 정보 */}
                        <div className="flex-1 text-left">
                          <p className="text-xs text-gray-600 mb-0.5">{product.브랜드}</p>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">
                            {product.모델명}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {product.최저가 > 0 && (
                              <p className="text-sm font-bold text-gray-900">
                                {product.최저가.toLocaleString()}원
                              </p>
                            )}
                            {product.평균평점 != null && product.평균평점 > 0 && (
                              <div className="flex items-center gap-0.5">
                                <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                <span className="text-xs text-gray-600 font-medium">{product.평균평점.toFixed(1)}</span>
                              </div>
                            )}
                            {product.리뷰수 != null && product.리뷰수 > 0 && (
                              <p className="text-xs text-gray-500">
                                리뷰 {product.리뷰수.toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 현재 선택 표시 */}
                        {isCurrentAnchor && (
                          <div className="text-xs font-semibold text-blue-600">
                            현재 선택
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
