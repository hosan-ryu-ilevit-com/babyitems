'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Category, CATEGORY_NAMES } from '@/lib/data';

interface ProductRecommendation {
  productId: number;
  브랜드: string;
  모델명: string;
  최저가: number | null;
  썸네일: string | null;
  fitScore: number;
  reasoning: string;
  reviewCount: number;
}

function ResultPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;
  const anchorId = searchParams.get('anchorId');

  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [anchorProduct, setAnchorProduct] = useState<any>(null);
  const [error, setError] = useState('');
  const [showAnchorSelector, setShowAnchorSelector] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [displayedProductCount, setDisplayedProductCount] = useState(20); // Lazy loading
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!category || !anchorId) {
      router.push('/categories');
      return;
    }

    loadRecommendations();
  }, [category, anchorId]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError('');

      // Get tag selections from sessionStorage
      const selectionsJson = sessionStorage.getItem('tag_selections');
      if (!selectionsJson) {
        throw new Error('선택 정보를 찾을 수 없습니다');
      }

      const selections = JSON.parse(selectionsJson);

      const response = await fetch('/api/recommend-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          anchorId,
          selectedProsTags: selections.selectedPros,
          selectedConsTags: selections.selectedCons,
          budget: selections.budget,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRecommendations(data.recommendations);
        setAnchorProduct(data.anchorProduct);
      } else {
        setError(data.error || '추천 생성 실패');
      }

      // Load available products for anchor selection (all products with reviews)
      if (category) {
        const productsResponse = await fetch(`/api/anchor-products?category=${category}`);
        const productsData = await productsResponse.json();
        if (productsData.success) {
          setAvailableProducts(productsData.products);
        }
      }
    } catch (err: any) {
      setError(err.message || '추천을 불러오는 중 오류가 발생했습니다');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnchorChange = (newAnchor: any) => {
    setAnchorProduct(newAnchor);
    setShowAnchorSelector(false);
  };

  // Search products with API call (debounced)
  useEffect(() => {
    if (!showAnchorSelector || !category) return;

    const searchProducts = async () => {
      setIsSearching(true);
      try {
        const url = searchKeyword
          ? `/api/anchor-products?category=${category}&search=${encodeURIComponent(searchKeyword)}`
          : `/api/anchor-products?category=${category}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          setAvailableProducts(data.products);
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
  }, [searchKeyword, showAnchorSelector, category]);

  if (!category || !anchorId) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-6"></div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            맞춤 추천을 생성하고 있습니다
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            20개 후보 제품을 분석 중입니다...
          </p>
          <div className="text-xs text-gray-500">
            <p>✓ 예산 범위 필터링</p>
            <p>✓ 인기도 기반 정렬</p>
            <p>✓ AI 정성 평가 진행 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <div className="text-6xl mb-4">😔</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">추천 생성 실패</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/categories')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
          >
            처음부터 다시 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pb-20">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {CATEGORY_NAMES[category]} 맞춤 추천 결과
          </h1>
          <p className="text-sm text-gray-600">
            실제 사용자 리뷰를 분석하여 선택한 제품입니다
          </p>
        </motion.div>

        {/* 4-Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Anchor Product */}
          {anchorProduct && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0 }}
              className="bg-white rounded-xl shadow-md p-4 border-2 border-gray-300 relative"
            >
              <div className="text-xs font-semibold text-gray-500 mb-3 text-center">
                비교 기준 제품
              </div>
              {anchorProduct.썸네일 && (
                <img
                  src={anchorProduct.썸네일}
                  alt={anchorProduct.모델명}
                  className="w-full h-32 object-contain mb-3 bg-gray-50 rounded-lg"
                />
              )}
              <div className="text-xs text-blue-600 font-medium mb-1">
                {anchorProduct.브랜드}
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2">
                {anchorProduct.모델명}
              </h3>
              <div className="text-xs text-gray-600 mb-2">
                {anchorProduct.최저가?.toLocaleString() || '가격 정보 없음'}원
              </div>
              <div className="text-xs text-gray-500 mb-3">
                랭킹 #{anchorProduct.순위}
              </div>

              {/* Change Anchor Button */}
              <button
                onClick={() => setShowAnchorSelector(true)}
                className="w-full py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
              >
                기준 제품 변경
              </button>
            </motion.div>
          )}

          {/* Top 3 Recommendations */}
          {recommendations.map((rec, index) => (
            <motion.div
              key={rec.productId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (index + 1) * 0.1 }}
              className="bg-white rounded-xl shadow-lg p-4 border-2 border-blue-500 relative"
            >
              {/* Rank Badge */}
              <div className="absolute -top-3 -left-3 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                {index + 1}
              </div>

              {rec.썸네일 && (
                <img
                  src={rec.썸네일}
                  alt={rec.모델명}
                  className="w-full h-32 object-contain mb-3 bg-gray-50 rounded-lg"
                />
              )}

              <div className="text-xs text-blue-600 font-medium mb-1">
                {rec.브랜드}
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2">
                {rec.모델명}
              </h3>

              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-bold text-gray-900">
                  {rec.최저가?.toLocaleString() || '가격 정보 없음'}원
                </div>
                <div className="text-xs text-green-600 font-semibold">
                  {rec.fitScore}점
                </div>
              </div>

              <p className="text-xs text-gray-600 mb-3 line-clamp-3">
                {rec.reasoning}
              </p>

              <div className="text-xs text-gray-500">
                리뷰 {rec.reviewCount}개 분석
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex gap-2">
                <button className="flex-1 py-2 px-3 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600">
                  쿠팡에서 보기
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-gray-500"
        >
          <p>💡 Fit Score: 선택한 조건과의 적합도 (0-100점)</p>
          <p className="mt-1">📊 실제 사용자 리뷰 기반 평가</p>
        </motion.div>
      </div>

      {/* Anchor Selector Bottom Sheet */}
      <AnimatePresence>
        {showAnchorSelector && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAnchorSelector(false)}
              className="fixed inset-0 bg-black/50 z-[60]"
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] h-[80vh] flex flex-col overflow-hidden"
              style={{ maxWidth: '480px', margin: '0 auto' }}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900 text-center mb-3">
                  비교 기준 제품 변경
                </h2>
                {/* Search */}
                <input
                  type="text"
                  placeholder="제품명 또는 브랜드 검색..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Product List */}
              <div
                className="flex-1 overflow-y-auto px-4 py-4"
                onScroll={(e) => {
                  const target = e.currentTarget;
                  const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
                  if (scrolledToBottom && displayedProductCount < availableProducts.length) {
                    setDisplayedProductCount(prev => Math.min(prev + 20, availableProducts.length));
                  }
                }}
              >
                {availableProducts.length === 0 && !isSearching && (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-sm">검색 결과가 없습니다</p>
                  </div>
                )}
                <div className="space-y-3">
                  {availableProducts.slice(0, displayedProductCount).map((product) => (
                    <button
                      key={product.productId}
                      onClick={() => handleAnchorChange(product)}
                      className="w-full bg-white border-2 border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                    >
                      <div className="flex items-start gap-3">
                        {product.썸네일 && (
                          <img
                            src={product.썸네일}
                            alt={product.모델명}
                            className="w-20 h-20 object-contain bg-gray-50 rounded-lg flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 font-medium mb-1">
                            {product.브랜드}
                          </div>
                          <h3 className="text-sm font-bold text-gray-900 mb-1 line-clamp-2">
                            {product.모델명}
                          </h3>
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-gray-900">
                              {product.최저가?.toLocaleString() || '가격 정보 없음'}<span className="text-xs">원</span>
                            </p>
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="text-gray-400">
                                랭킹 #{product.순위}
                              </span>
                              {product.reviewCount > 0 && (
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
                    </button>
                  ))}
                  {/* Loading indicator when more products available */}
                  {displayedProductCount < availableProducts.length && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      스크롤하여 더 보기 ({displayedProductCount}/{availableProducts.length})
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200">
                <button
                  onClick={() => setShowAnchorSelector(false)}
                  className="w-full py-3 px-6 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Chat Bottom Sheet (Placeholder for Phase 3) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <div className="max-w-4xl mx-auto">
          <input
            type="text"
            placeholder="다시 추천받고 싶으신가요? (개발 예정)"
            disabled
            className="w-full px-4 py-3 border rounded-lg bg-gray-100 text-gray-500"
          />
        </div>
      </div>
    </div>
  );
}

export default function ResultV2Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <ResultPageContent />
    </Suspense>
  );
}
