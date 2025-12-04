'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { logButtonClick } from '@/lib/logging/clientLogger';

interface Product {
  productId: string;
  모델명: string;
  브랜드: string;
  최저가: number;
  썸네일: string;
  리뷰수?: number;
}

interface AnchorProductChangeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentCategory: string;
  currentAnchorProductId: string;
  onSelectProduct: (product: Product) => void;
}

export default function AnchorProductChangeBottomSheet({
  isOpen,
  onClose,
  currentCategory,
  currentAnchorProductId,
  onSelectProduct,
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
  }, [isOpen, currentCategory]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/anchor-products?category=${currentCategory}&limit=50`);
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
                  <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
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
                          <div className="flex items-center gap-2">
                            {product.최저가 && (
                              <p className="text-sm font-bold text-gray-900">
                                {product.최저가.toLocaleString()}원
                              </p>
                            )}
                            {product.리뷰수 && (
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
