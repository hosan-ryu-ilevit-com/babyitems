'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { Category, CATEGORY_NAMES, ProductWithReviews } from '@/lib/data';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';

function AnchorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;

  const [products, setProducts] = useState<ProductWithReviews[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithReviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProductList, setShowProductList] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
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
      const response = await fetch(`/api/anchor-products?category=${category}&limit=10`);
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
    router.push(`/tags?category=${category}&anchorId=${selectedProduct.productId}`);
  };

  const filteredProducts = searchKeyword
    ? products.filter(p =>
        `${p.브랜드} ${p.모델명}`.toLowerCase().includes(searchKeyword.toLowerCase())
      )
    : products;

  if (!category) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0084FE] mb-4"></div>
            <p className="text-gray-600">제품 정보를 불러오는 중...</p>
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
                onClick={() => router.push('/')}
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
            <p className="text-xs text-gray-500 text-center">
              가장 인기 있는 제품을 기준으로 추천해드립니다
            </p>
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
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 mb-6"
            >
              <div className="flex items-start gap-4">
                {selectedProduct.썸네일 && (
                  <div className="w-28 h-28 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden">
                    <img
                      src={selectedProduct.썸네일}
                      alt={selectedProduct.모델명}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="inline-block px-2 py-0.5 bg-blue-50 text-[#0084FE] rounded-md text-xs font-bold mb-2">
                    {selectedProduct.브랜드}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2 line-clamp-2">
                    {selectedProduct.모델명}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <span className="px-2 py-1 bg-gray-100 rounded-md font-medium">
                      랭킹 #{selectedProduct.순위}
                    </span>
                    {selectedProduct.총점 && (
                      <span className="px-2 py-1 bg-gray-100 rounded-md font-medium">
                        ⭐ {selectedProduct.총점.toFixed(1)}
                      </span>
                    )}
                    {selectedProduct.최저가 && (
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">
                        {selectedProduct.최저가.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowProductList(true)}
                className="mt-4 w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
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
            className="mt-6 text-center text-sm text-gray-500"
          >
            <p>💡 선택한 제품의 장단점을 분석하여</p>
            <p>맞춤형 추천을 제공합니다</p>
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
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <span>이 제품으로 추천 받기</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
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
              className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
              onClick={() => setShowProductList(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
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

                <div className="overflow-y-auto max-h-[calc(85vh-140px)] p-4">
                  {filteredProducts.map((product) => (
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
                          <div className="w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                            <img
                              src={product.썸네일}
                              alt={product.모델명}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="inline-block px-2 py-0.5 bg-blue-50 text-[#0084FE] rounded text-xs font-bold mb-1">
                            {product.브랜드}
                          </div>
                          <h4 className="font-semibold text-sm text-gray-900 mb-1.5 line-clamp-2">
                            {product.모델명}
                          </h4>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 bg-gray-100 rounded-md font-medium text-gray-600">
                              #{product.순위}
                            </span>
                            {product.최저가 && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-bold">
                                {product.최저가.toLocaleString()}원
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}

                  {filteredProducts.length === 0 && (
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
