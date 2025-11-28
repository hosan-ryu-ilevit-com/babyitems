'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewCard from '@/components/ReviewCard';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';
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
  const searchParams = useSearchParams();
  const productId = params.id as string;
  const category = searchParams.get('category');

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'rating_desc' | 'rating_asc'>('rating_desc');
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
    logPageView('product');
  }, []);

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
      setLoading(false);

      // Fetch reviews immediately to calculate average rating
      if (category) {
        fetchReviews();
      }
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
          <div className="flex items-center gap-3">
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
          <div className="text-2xl font-bold text-gray-900 mb-3">
            {productData.product.price.toLocaleString()}원
          </div>

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
                {/* 장점 */}
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

                {/* 단점 */}
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

                {/* 추가 고려사항 */}
                {productData.additionalConsiderations && (
                  <div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      구매 전 참고하세요
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {parseMarkdownBold(productData.additionalConsiderations)}
                    </p>
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
              className="flex-[4] py-3 font-semibold rounded-lg text-sm transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              최저가 보기
            </button>
            <button
              onClick={() => {
                logButtonClick('쿠팡에서 보기', 'product');
                if (productData.product.reviewUrl) {
                  window.open(productData.product.reviewUrl, '_blank');
                }
              }}
              className="flex-[6] py-3 font-semibold rounded-lg text-sm transition-colors bg-blue-600 hover:bg-blue-700 text-white"
            >
              쿠팡에서 보기
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
