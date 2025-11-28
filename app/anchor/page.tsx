'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { Category, CATEGORY_NAMES, ProductWithReviews } from '@/lib/data';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';
import { logButtonClick } from '@/lib/logging/clientLogger';

function AnchorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;

  const [products, setProducts] = useState<ProductWithReviews[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithReviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProductList, setShowProductList] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [displayedProductCount, setDisplayedProductCount] = useState(20); // Lazy loading
  const [isSearching, setIsSearching] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    if (!category) {
      router.push('/categories');
      return;
    }

    loadProducts();
  }, [category]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      // Remove limit - load all products with reviews
      const response = await fetch(`/api/anchor-products?category=${category}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.products);
        // Auto-select the top product
        if (data.products.length > 0) {
          setSelectedProduct(data.products[0]);
        }
        // Auto-open guide after loading
        setTimeout(() => setIsGuideOpen(true), 500);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedProduct) return;

    // 브랜드와 제품명을 안전하게 결합 (fallback 포함)
    const brand = selectedProduct.브랜드 || '';
    const productName = selectedProduct.제품명 || '';
    const fullProductName = `${brand} ${productName}`.trim() || selectedProduct.productId || '제품';
    const productTitle = encodeURIComponent(fullProductName);

    router.push(`/tags?category=${category}&anchorId=${selectedProduct.productId}&productTitle=${productTitle}`);
  };

  // Search products with API call (debounced)
  useEffect(() => {
    if (!showProductList || !category) return;

    const searchProducts = async () => {
      setIsSearching(true);
      try {
        const url = searchKeyword
          ? `/api/anchor-products?category=${category}&search=${encodeURIComponent(searchKeyword)}`
          : `/api/anchor-products?category=${category}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          setProducts(data.products);
          setDisplayedProductCount(20); // Reset to initial load count
        }
      } catch (error) {
        console.error('Failed to search products:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchProducts, 300); // Debounce 300ms
    return () => clearTimeout(timeoutId);
  }, [searchKeyword, showProductList, category]);

  if (!category) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => router.push('/categories')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <CaretLeft size={24} weight="bold" />
              </button>
              <div className="absolute left-1/2 -translate-x-1/2">
                <h1 className="text-lg font-bold text-gray-900">
                  기준 제품 선택
                </h1>
              </div>
              <div className="w-6" /> {/* Spacer for alignment */}
            </div>
           
          </div>
          {/* Progress Bar */}
          <div className="w-full h-1 bg-gray-200">
            <div
              className="h-full bg-[#0084FE] transition-all duration-300"
              style={{ width: selectedProduct ? '50%' : '25%' }}
            />
          </div>
        </header>

        {/* Main Content - Scrollable */}
        <main className="flex-1 px-4 py-6 overflow-y-auto">
          {/* Selected Product Card */}
          {selectedProduct && !showProductList && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl border border-gray-200 p-4 mb-6"
            >
              <div className="flex items-start gap-4">
                {selectedProduct.썸네일 && (
                  <div className="w-24 h-24 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={selectedProduct.썸네일}
                      alt={selectedProduct.모델명}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  {/* 브랜드 */}
                  <div className="text-xs text-gray-500 font-medium mb-0.5">
                    {selectedProduct.브랜드}
                  </div>
                  {/* 제품명 */}
                  <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-2 leading-tight">
                    {selectedProduct.모델명}
                  </h3>
                  {/* 가격 & 리뷰수 */}
                  <div className="space-y-0.5">
                    {selectedProduct.최저가 && (
                      <p className="text-base font-bold text-gray-900">
                        {selectedProduct.최저가.toLocaleString()}<span className="text-sm">원</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-gray-400">
                        랭킹 #{selectedProduct.순위}
                      </span>
                      {selectedProduct.reviewCount && selectedProduct.reviewCount > 0 && (
                        <span className="text-gray-600 font-medium flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                          </svg>
                          리뷰 {selectedProduct.reviewCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowProductList(true)}
                className="mt-4 w-full py-3 px-4 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-all"
              >
                다른 제품으로 변경하기
              </button>
            </motion.div>
          )}

          {/* Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-center"
          >
            <p className="text-lg font-bold text-gray-700">인기 제품의 리뷰를 분석해서</p>
            <p className="text-lg font-bold text-gray-700 mb-6">맞춤형 추천에 활용할게요</p>

            {/* Guide Button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              onClick={() => {
                logButtonClick(`${CATEGORY_NAMES[category]} 1분 가이드 열기`, 'anchor');
                setIsGuideOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors mt-20"
            >
              <span>⚡️ {CATEGORY_NAMES[category]} 1분 구매 가이드</span>
            </motion.button>
          </motion.div>
        </main>

        {/* Bottom Floating Button */}
        {selectedProduct && !showProductList && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40" style={{ maxWidth: '480px', margin: '0 auto' }}>
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirm}
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <span>이 제품으로 추천 받기</span>
             
            </motion.button>
          </div>
        )}

        {/* Product List Modal */}
        <AnimatePresence>
          {showProductList && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
              onClick={() => setShowProductList(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="bg-white rounded-t-3xl w-full max-w-[480px] max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 border-b">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">제품 선택</h3>
                    <button
                      onClick={() => setShowProductList(false)}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="브랜드나 모델명으로 검색..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 text-base"
                  />
                </div>

                <div
                  className="overflow-y-auto max-h-[calc(85vh-140px)] p-4"
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
                    if (scrolledToBottom && displayedProductCount < products.length) {
                      setDisplayedProductCount(prev => Math.min(prev + 20, products.length));
                    }
                  }}
                >
                  {products.length === 0 && !isSearching && (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-sm">검색 결과가 없습니다</p>
                    </div>
                  )}

                  {products.slice(0, displayedProductCount).map((product) => (
                    <motion.button
                      key={product.productId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => {
                        setSelectedProduct(product);
                        setShowProductList(false);
                        setSearchKeyword('');
                      }}
                      className={`w-full p-4 mb-3 rounded-xl border-2 text-left transition-all ${
                        selectedProduct?.productId === product.productId
                          ? 'border-[#0084FE] bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {product.썸네일 && (
                          <div className="w-20 h-20 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={product.썸네일}
                              alt={product.모델명}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 font-medium mb-0.5">
                            {product.브랜드}
                          </div>
                          <h4 className="font-bold text-sm text-gray-900 mb-1 line-clamp-2 leading-tight">
                            {product.모델명}
                          </h4>
                          <div className="space-y-0.5">
                            {product.최저가 && (
                              <p className="text-sm font-bold text-gray-900">
                                {product.최저가.toLocaleString()}<span className="text-xs">원</span>
                              </p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="text-gray-400">
                                랭킹 #{product.순위}
                              </span>
                              {product.reviewCount && product.reviewCount > 0 && (
                                <span className="text-gray-600 font-medium flex items-center gap-1">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                                  </svg>
                                  리뷰 {product.reviewCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}

                  {/* Loading indicator when more products available */}
                  {displayedProductCount < products.length && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      스크롤하여 더 보기 ({displayedProductCount}/{products.length})
                    </div>
                  )}

                  {products.length === 0 && searchKeyword && (
                    <div className="text-center py-12 text-gray-500">
                      <div className="text-4xl mb-3">🔍</div>
                      <p className="text-sm">검색 결과가 없습니다</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Guide Bottom Sheet */}
      <GuideBottomSheet
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        category={category}
      />
    </div>
  );
}

export default function AnchorPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0084FE] mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      </div>
    }>
      <AnchorPageContent />
    </Suspense>
  );
}
