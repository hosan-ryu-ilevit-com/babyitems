'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewCard from '@/components/ReviewCard';
import { logPageView, logButtonClick, logFavoriteAction } from '@/lib/logging/clientLogger';
import { useFavorites } from '@/hooks/useFavorites';
import { products } from '@/data/products';
import type { Review } from '@/lib/review';

interface ProductData {
  product: {
    id: string;
    title: string;
    brand?: string;
    price: number;
    thumbnail: string;
    reviewUrl?: string;
    reviewCount: number;
  };
  rank: 1 | 2 | 3;
  finalScore: number;
  personalizedReason: {
    strengths: string[];
    weaknesses: string[];
  };
  comparison: string[];
  additionalConsiderations: string;
}

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

export default function ProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'rating_desc' | 'rating_asc'>('rating_desc');
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [isExiting, setIsExiting] = useState(false);
  const [comparativeAnalysis, setComparativeAnalysis] = useState<any>(null);
  const { toggleFavorite, isFavorite, count } = useFavorites();

  // 다나와 가격 정보 state
  const [danawaData, setDanawaData] = useState<{
    lowestPrice: number | null;
    lowestMall: string | null;
    productName: string | null;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
    loading: boolean;
  }>({
    lowestPrice: null,
    lowestMall: null,
    productName: null,
    prices: [],
    loading: false,
  });
  const [showPriceComparison, setShowPriceComparison] = useState(false);

  // Get category from products data instead of URL params
  const product = products.find(p => p.id === productId);
  const category = product?.category;

  useEffect(() => {
    setMounted(true);
    logPageView('product');
  }, []);

  // Handle favorite toggle
  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!productData) return;

    const wasFavorite = isFavorite(productData.product.id);
    toggleFavorite(productData.product.id);

    const action = wasFavorite ? 'removed' : 'added';
    const newCount = wasFavorite ? count - 1 : count + 1;
    logFavoriteAction(action, productData.product.id, productData.product.title, newCount);
  };

  // Fetch reviews function with useCallback
  const fetchReviews = useCallback(async () => {
    if (!category) return;

    setReviewsLoading(true);
    try {
      const response = await fetch(
        `/api/product-reviews?category=${category}&productId=${productId}&sortBy=${sortBy}`
      );
      const data = await response.json();

      if (data.success) {
        setReviews(data.reviews);

        // Calculate average rating
        if (data.reviews.length > 0) {
          const total = data.reviews.reduce(
            (sum: number, review: Review) => sum + review.custom_metadata.rating,
            0
          );
          const average = total / data.reviews.length;
          setAverageRating(Math.round(average * 10) / 10); // Round to 1 decimal place
        }
      } else {
        console.error('Failed to fetch reviews:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  }, [category, productId, sortBy]);

  useEffect(() => {
    if (!mounted) return;

    // Load product data from sessionStorage
    const storedProduct = sessionStorage.getItem('selected_product');
    if (storedProduct) {
      const data = JSON.parse(storedProduct) as ProductData;
      setProductData(data);

      // Load comparative analysis from sessionStorage
      const storedAnalysis = sessionStorage.getItem('comparative_analysis');
      if (storedAnalysis) {
        const analysis = JSON.parse(storedAnalysis);
        setComparativeAnalysis(analysis);
        console.log('✅ Loaded comparative analysis for PDP:', analysis);
      }

      setLoading(false);

      // Fetch reviews immediately to calculate average rating
      if (category) {
        fetchReviews();
      }

      // 다나와 가격 정보 백그라운드 로딩
      // 브랜드 + 제목 (띄어쓰기 기준 최대 5개 단어)
      // 제목에 이미 브랜드가 포함되어 있으면 중복 방지
      let titleForQuery = data.product.title;
      if (data.product.brand && data.product.title.toLowerCase().startsWith(data.product.brand.toLowerCase())) {
        titleForQuery = data.product.title.substring(data.product.brand.length).trim();
      }
      const titleWords = titleForQuery.split(' ').slice(0, 5).join(' ');
      const query = data.product.brand ? `${data.product.brand} ${titleWords}` : titleWords;
      console.log(`🔍 [Danawa Query] ${data.product.title} → "${query}"`);
      setDanawaData(prev => ({ ...prev, loading: true }));

      fetch('/api/danawa/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
        .then(res => res.json())
        .then(apiData => {
          if (apiData.success && apiData.data) {
            setDanawaData({
              lowestPrice: apiData.data.lowestPrice,
              lowestMall: apiData.data.lowestMall,
              productName: apiData.data.name,
              prices: apiData.data.prices || [],
              loading: false,
            });
            console.log(`✅ Danawa data fetched for PDP: ${apiData.data.lowestPrice?.toLocaleString()}원`);
          } else {
            setDanawaData(prev => ({ ...prev, loading: false }));
            console.warn('⚠️ Failed to fetch Danawa data for PDP');
          }
        })
        .catch(error => {
          console.error('Failed to fetch Danawa data:', error);
          setDanawaData(prev => ({ ...prev, loading: false }));
        });
    } else {
      // Fallback: redirect to result page if no data
      router.push('/result');
    }
  }, [mounted, router, category, fetchReviews]);

  const handleSortChange = async (newSortBy: 'rating_desc' | 'rating_asc') => {
    setSortBy(newSortBy);
    logButtonClick(`리뷰 정렬: ${newSortBy === 'rating_desc' ? '높은순' : '낮은순'}`, 'product');

    if (!category) return;

    setReviewsLoading(true);
    try {
      const response = await fetch(
        `/api/product-reviews?category=${category}&productId=${productId}&sortBy=${newSortBy}`
      );
      const data = await response.json();

      if (data.success) {
        setReviews(data.reviews);

        // Calculate average rating
        if (data.reviews.length > 0) {
          const total = data.reviews.reduce(
            (sum: number, review: Review) => sum + review.custom_metadata.rating,
            0
          );
          const average = total / data.reviews.length;
          setAverageRating(Math.round(average * 10) / 10); // Round to 1 decimal place
        }
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  if (!mounted || loading || !productData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
      animate={{
        backgroundColor: isExiting ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.08)'
      }}
      transition={{ duration: 0.25 }}
      className="flex min-h-screen items-center justify-center"
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: isExiting ? '100%' : 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full max-w-[480px] min-h-screen flex flex-col bg-white"
        style={{
          boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.1)'
        }}
        onAnimationComplete={() => {
          if (isExiting) {
            sessionStorage.removeItem('selected_product');
            sessionStorage.removeItem('result_referrer_url');
            window.history.back();
          }
        }}
      >
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                logButtonClick('뒤로가기', 'product');
                setIsExiting(true);
              }}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Favorite Heart Button */}
            {productData && (
              <button
                onClick={handleFavoriteToggle}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="찜하기"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill={isFavorite(productData.product.id) ? '#FF6B6B' : 'none'}
                  stroke="#FF6B6B"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Thumbnail - Full Width Square */}
        <div className="relative w-full aspect-square bg-gray-100">
          {productData.product.thumbnail ? (
            <Image
              src={productData.product.thumbnail}
              alt={productData.product.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="px-4 py-4 border-b border-gray-100">
          {/* Brand */}
          {productData.product.brand && (
            <div className="text-sm text-gray-500 mb-1">{productData.product.brand}</div>
          )}

          {/* Title */}
          <h2 className="text-lg font-bold text-gray-900 mb-3 leading-snug">
            {productData.product.title}
          </h2>

          {/* Price */}
          <div className="text-2xl font-bold text-gray-900 mb-2">
            {productData.product.price.toLocaleString()}원
          </div>

          {/* 다나와 최저가 배지 */}
          {danawaData.loading ? (
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
              <span>최저가 확인 중...</span>
            </div>
          ) : danawaData.lowestPrice && danawaData.lowestPrice > 0 ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-sm rounded-full mb-3 font-medium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">최저 {danawaData.lowestPrice.toLocaleString()}원</span>
              <span className="text-red-600">({danawaData.lowestMall})</span>
            </div>
          ) : (
            <div className="mb-3" />
          )}

          {/* Rating & Reviews */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${star <= Math.floor(averageRating) ? 'text-yellow-400' : 'text-gray-300'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {averageRating > 0 ? averageRating.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-gray-500">({productData.product.reviewCount.toLocaleString()})</span>
          </div>
        </div>

        {/* Recommendation Reasoning Container */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-y border-blue-100 px-4 py-4">
          <div className="flex items-start gap-2 mb-2">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">AI 추천 이유</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {productData.personalizedReason.strengths.length > 0
                  ? parseMarkdownBold(productData.personalizedReason.strengths[0])
                  : '고객님의 선택 기준에 맞는 제품입니다.'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-gray-500">맞춤 점수</div>
              <div className="text-lg font-bold text-blue-600">{productData.finalScore}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-[57px] bg-white border-b border-gray-200 flex z-10">
          <button
            onClick={() => {
              setActiveTab('description');
              logButtonClick('설명 탭', 'product');
            }}
            className={`flex-1 py-3 font-semibold transition-colors relative ${
              activeTab === 'description'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            설명
            {activeTab === 'description' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
              />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('reviews');
              logButtonClick('리뷰 탭', 'product');
            }}
            className={`flex-1 py-3 font-semibold transition-colors relative ${
              activeTab === 'reviews'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            리뷰 ({productData.product.reviewCount})
            {activeTab === 'reviews' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
              />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <AnimatePresence mode="wait">
            {activeTab === 'description' ? (
              <motion.div
                key="description"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-5 space-y-6"
              >
                {/* 1. Overall Summary */}
                {comparativeAnalysis?.rankComparison && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                      </svg>
                      종합 평가
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {parseMarkdownBold(
                        comparativeAnalysis.rankComparison[`rank${productData.rank}` as 'rank1' | 'rank2' | 'rank3']?.overallSummary || ''
                      )}
                    </p>
                  </div>
                )}

                {/* 2. 장점 (통합) */}
                {productData.personalizedReason.strengths.length > 0 && (
                  <div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      이런 점이 좋아요
                    </h3>
                    <ul className="space-y-3">
                      {productData.personalizedReason.strengths.map((strength, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0" />
                          <span className="leading-relaxed">{parseMarkdownBold(strength)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. 단점 (통합) */}
                {productData.personalizedReason.weaknesses.length > 0 && (
                  <div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      이런 점은 주의하세요
                    </h3>
                    <ul className="space-y-3">
                      {productData.personalizedReason.weaknesses.map((weakness, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                          <span className="leading-relaxed">{parseMarkdownBold(weakness)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 4. 비교 (통합) */}
                {comparativeAnalysis?.rankComparison && (() => {
                  const rankKey = `rank${productData.rank}` as 'rank1' | 'rank2' | 'rank3';
                  const rankData = comparativeAnalysis.rankComparison[rankKey];
                  return rankData && (
                    <div>
                      <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        상세 비교
                      </h3>
                      <div className="space-y-4">
                        {/* Key Strengths */}
                        {rankData.keyStrengths && (
                          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                            <h4 className="text-sm font-bold text-green-800 mb-2">핵심 강점</h4>
                            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(rankData.keyStrengths)}</p>
                          </div>
                        )}

                        {/* Key Weaknesses */}
                        {rankData.keyWeaknesses && (
                          <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                            <h4 className="text-sm font-bold text-amber-800 mb-2">핵심 약점</h4>
                            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(rankData.keyWeaknesses)}</p>
                          </div>
                        )}

                        {/* Comparisons with other ranks */}
                        {(rankData.vsRank1 || rankData.vsRank2 || rankData.vsRank3) && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <h4 className="text-sm font-bold text-gray-800 mb-2">다른 제품과 비교</h4>
                            <div className="space-y-2">
                              {rankData.vsRank1 && (
                                <div className="text-sm text-gray-700">
                                  <span className="font-semibold">vs 1위:</span> {parseMarkdownBold(rankData.vsRank1)}
                                </div>
                              )}
                              {rankData.vsRank2 && (
                                <div className="text-sm text-gray-700">
                                  <span className="font-semibold">vs 2위:</span> {parseMarkdownBold(rankData.vsRank2)}
                                </div>
                              )}
                              {rankData.vsRank3 && (
                                <div className="text-sm text-gray-700">
                                  <span className="font-semibold">vs 3위:</span> {parseMarkdownBold(rankData.vsRank3)}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* vs Anchor */}
                        {rankData.vsAnchor && (
                          <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                            <h4 className="text-sm font-bold text-indigo-800 mb-2">기준 제품과 비교</h4>
                            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(rankData.vsAnchor)}</p>
                          </div>
                        )}

                        {/* Best For */}
                        {rankData.bestFor && (
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                            <h4 className="text-sm font-bold text-blue-800 mb-2">이런 분께 추천해요</h4>
                            <p className="text-sm text-gray-700 leading-relaxed">{parseMarkdownBold(rankData.bestFor)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 5. 구매 조언 */}
                {productData.additionalConsiderations && (
                  <div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      구매 조언
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {parseMarkdownBold(productData.additionalConsiderations)}
                    </p>
                  </div>
                )}

                {/* 6. 상황별 추천 */}
                {comparativeAnalysis?.useCaseRecommendations && comparativeAnalysis.useCaseRecommendations.length > 0 && (
                  <div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      상황별 추천
                    </h3>
                    <div className="space-y-3">
                      {comparativeAnalysis.useCaseRecommendations.map((useCase: any, i: number) => (
                        <div key={i} className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                          <h4 className="text-sm font-bold text-teal-900 mb-1">{useCase.useCase}</h4>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2">
                            <span className="font-semibold">추천: </span>
                            {useCase.recommended}
                          </p>
                          <p className="text-xs text-teal-700">{useCase.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. 가격 비교 */}
                {!danawaData.loading && danawaData.prices.length > 0 && (
                  <div>
                    <button
                      onClick={() => {
                        setShowPriceComparison(!showPriceComparison);
                        logButtonClick(showPriceComparison ? '가격 비교 닫기' : '가격 비교 열기', 'product');
                      }}
                      className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:from-blue-100 hover:to-indigo-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                        </svg>
                        <div className="text-left">
                          <h3 className="text-base font-bold text-gray-900">가격 비교 ({danawaData.prices.length}개 쇼핑몰)</h3>
                          <p className="text-xs text-gray-600 line-clamp-1">{danawaData.productName || '다나와에서 제공하는 실시간 가격 정보'}</p>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-600 transition-transform ${showPriceComparison ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* 가격 비교 리스트 (토글) */}
                    <AnimatePresence>
                      {showPriceComparison && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 bg-white rounded-xl border border-gray-200">
                            {danawaData.prices.slice(0, 10).map((priceInfo, index) => (
                              <div
                                key={index}
                                className={`flex items-center justify-between p-4 ${
                                  index !== danawaData.prices.slice(0, 10).length - 1 ? 'border-b border-gray-100' : ''
                                }`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-gray-900">{priceInfo.mall}</span>
                                    {index === 0 && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">
                                        최저가
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">{priceInfo.delivery}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-lg font-bold text-gray-900">
                                    {priceInfo.price.toLocaleString()}원
                                  </span>
                                  {priceInfo.link && (
                                    <a
                                      href={priceInfo.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => logButtonClick(`${priceInfo.mall} 바로가기`, 'product')}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      바로가기
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {danawaData.prices.length > 10 && (
                            <p className="text-xs text-gray-500 text-center mt-2">
                              + {danawaData.prices.length - 10}개 쇼핑몰 더보기
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="reviews"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Sort Filter */}
                <div className="bg-white border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSortChange('rating_desc')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        sortBy === 'rating_desc'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      별점 높은순
                    </button>
                    <button
                      onClick={() => handleSortChange('rating_asc')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        sortBy === 'rating_asc'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      별점 낮은순
                    </button>
                  </div>
                </div>

                {/* Reviews List */}
                {reviewsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-gray-500">리뷰를 불러오는 중...</div>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="text-4xl mb-3">📝</div>
                    <div className="text-gray-500 text-sm">아직 리뷰가 없습니다</div>
                  </div>
                ) : (
                  <div>
                    {reviews.map((review, index) => (
                      <ReviewCard
                        key={index}
                        text={review.text}
                        rating={review.custom_metadata.rating}
                        nickname={`user${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating Action Buttons */}
        {productData && (
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 px-4 py-3 z-30">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  logButtonClick('최저가 보기', 'product');
                  window.open(
                    `https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(productData.product.title)}&sort=priceASC`,
                    '_blank'
                  );
                }}
                className="flex-1 py-3 font-semibold rounded-lg text-sm transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                최저가 보기
              </button>
              <button
                onClick={() => {
                  logButtonClick('쿠팡에서 보기', 'product');
                  window.open(`https://www.coupang.com/vp/products/${productData.product.id}`, '_blank');
                }}
                className="flex-[1.5] py-3 font-semibold rounded-lg text-sm transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              >
                쿠팡에서 보기
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
