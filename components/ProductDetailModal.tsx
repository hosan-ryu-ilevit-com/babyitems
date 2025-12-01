'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewCard from '@/components/ReviewCard';
import { logButtonClick, logFavoriteAction } from '@/lib/logging/clientLogger';
import type { Review } from '@/lib/review';
import { TextWithCitations } from '@/components/ReviewCitationButton';
import { useFavorites } from '@/hooks/useFavorites';
import Toast from '@/components/Toast';

interface ProductDetailModalProps {
  productData: {
    product: {
      id: string;
      title: string;
      brand?: string;
      price: number;
      thumbnail: string;
      reviewUrl?: string;
      reviewCount: number;
    };
    rank: 1 | 2 | 3 | 4;
    finalScore: number;
    reasoning: string;
    selectedTagsEvaluation: Array<{
      userTag: string;
      tagType: 'pros' | 'cons';
      priority: number;
      status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
      evidence: string;
      citations: number[];
      tradeoff?: string;
    }>;
    additionalPros: Array<{ text: string; citations: number[] }>;
    cons: Array<{ text: string; citations: number[] }>;
    purchaseTip?: Array<{ text: string; citations?: number[] }>;
    citedReviews: Array<{ index: number; text: string; rating: number }>;
  };
  productComparisons?: Array<{ text: string }>; // NEW: 다른 추천 제품들과의 비교
  category: string;
  onClose: () => void;
  onReRecommend?: (productId: string, userInput: string) => Promise<void>; // NEW: Callback for re-recommendation
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

// 원형 프로그레스 바 컴포넌트
function CircularProgress({ score, total, color, size = 40 }: { score: number; total: number; color: 'green' | 'blue'; size?: number }) {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    green: { bg: 'text-green-100', fg: 'text-green-500' },
    blue: { bg: 'text-blue-100', fg: 'text-blue-500' },
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className={colorClasses[color].bg}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`${colorClasses[color].fg} transition-all duration-500`}
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[9px] font-bold leading-none ${color === 'green' ? 'text-green-700' : 'text-blue-700'}`}>
          {score % 1 === 0 ? Math.round(score) : score.toFixed(1)}/{Math.round(total)}
        </span>
      </div>
    </div>
  );
}

export default function ProductDetailModal({ productData, productComparisons, category, onClose, onReRecommend }: ProductDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'rating_desc' | 'rating_asc'>('rating_desc');
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [isExiting, setIsExiting] = useState(false);

  // 섹션 접기/펼치기 상태
  const [isAdditionalProsOpen, setIsAdditionalProsOpen] = useState(false);
  const [isConsOpen, setIsConsOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isPurchaseTipOpen, setIsPurchaseTipOpen] = useState(false);

  // NEW: Chat input for re-recommendation
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Favorites management
  const { toggleFavorite, isFavorite, count } = useFavorites();

  // Toast for favorite notification
  const [showToast, setShowToast] = useState(false);

  // Fetch reviews function
  const fetchReviews = useCallback(async () => {
    // Use 'milk_powder_port' as fallback if category is not provided
    const categoryToUse = category || 'milk_powder_port';

    setReviewsLoading(true);
    try {
      const response = await fetch(
        `/api/product-reviews?category=${categoryToUse}&productId=${productData.product.id}&sortBy=${sortBy}`
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
          setAverageRating(Math.round(average * 10) / 10);
        }
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  }, [category, productData.product.id, sortBy]);

  // Fetch reviews on mount
  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    // Save original overflow style
    const originalOverflow = document.body.style.overflow;
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Restore on unmount
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleSortChange = async (newSortBy: 'rating_desc' | 'rating_asc') => {
    setSortBy(newSortBy);
    logButtonClick(`리뷰 정렬: ${newSortBy === 'rating_desc' ? '높은순' : '낮은순'}`, 'product-modal');
    // fetchReviews will be triggered automatically by useEffect when sortBy changes
  };

  const handleClose = () => {
    setIsExiting(true);
    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <motion.div
      initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
      animate={{
        backgroundColor: isExiting ? 'rgba(0, 0, 0, 0)' : (showChatInput ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.08)')
      }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center"
      onClick={showChatInput ? undefined : handleClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: isExiting ? '100%' : 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full max-w-[480px] h-screen flex flex-col bg-white mx-auto"
        style={{
          boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Thumbnail */}
          <div className="relative w-full aspect-square bg-gray-100">
          {/* Background image with optional overlay when chat is shown */}
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

          {/* Black overlay when chat input is shown - removed, will use full modal overlay */}

          {/* NEW: "이 상품 기반으로 재추천" button (bottom-left) */}
          {!showChatInput && onReRecommend && (
            <button
              onClick={() => {
                setShowChatInput(true);
                logButtonClick('이 상품 기반으로 재추천', 'product-modal');
              }}
              className="absolute bottom-4 left-4 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              이 상품 기반으로 재추천
            </button>
          )}

          {/* Favorite button (bottom-right) */}
          {!showChatInput && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const wasFavorite = isFavorite(productData.product.id);
                toggleFavorite(productData.product.id);

                // Log favorite action
                const action = wasFavorite ? 'removed' : 'added';
                const newCount = wasFavorite ? count - 1 : count + 1;
                logFavoriteAction(action, productData.product.id, productData.product.title, newCount);
                logButtonClick(wasFavorite ? '찜 취소' : '찜하기', 'product-modal');

                // Show toast only when adding to favorites (not removing)
                if (!wasFavorite) {
                  setShowToast(true);
                }
              }}
              className="absolute bottom-4 right-4 w-10 h-10 flex items-center justify-center rounded-full transition-all"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={isFavorite(productData.product.id) ? '#FF6B6B' : 'none'}
                stroke={isFavorite(productData.product.id) ? '#FF6B6B' : '#FFFFFF'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          )}
        </div>

        {/* Product Info */}
        <div className="px-4 py-4 border-b border-gray-100">
          {/* Brand and Rating Row */}
          <div className="flex items-center justify-between mb-1">
            {productData.product.brand && (
              <div className="text-sm text-gray-500">{productData.product.brand}</div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center">
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
          <h2 className="text-lg font-bold text-gray-900 mb-3 leading-snug">
            {productData.product.title}
          </h2>
          <div className="text-2xl font-bold text-gray-900">
            {productData.product.price.toLocaleString()}원
          </div>
        </div>

        {/* Recommendation Reasoning Container */}
        <div className="px-4 pt-4">
          <div className="bg-linear-to-br from-green-50 to-blue-50 rounded-2xl px-4 py-3 flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 shrink-0" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="ai-gradient-pdp" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5855ff" />
                  <stop offset="50%" stopColor="#71c4fd" />
                  <stop offset="100%" stopColor="#5cdcdc" />
                </linearGradient>
              </defs>
              <path fill="url(#ai-gradient-pdp)" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <p className="text-sm text-gray-700 leading-relaxed flex-1">
              {parseMarkdownBold(productData.reasoning)}
            </p>
          </div>
        </div>

          {/* Tabs */}
          <div className="sticky top-0 bg-white border-b border-gray-200 flex z-10">
          <button
            onClick={() => {
              setActiveTab('description');
              logButtonClick('설명 탭', 'product-modal');
            }}
            className={`flex-1 py-3 font-semibold transition-colors relative ${
              activeTab === 'description'
                ? 'text-gray-900'
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
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"
              />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('reviews');
              logButtonClick('리뷰 탭', 'product-modal');
            }}
            className={`flex-1 py-3 font-semibold transition-colors relative ${
              activeTab === 'reviews'
                ? 'text-gray-900'
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
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"
              />
            )}
          </button>
        </div>

          {/* Tab Content */}
          <div className="pb-20">
          <AnimatePresence mode="wait">
            {activeTab === 'description' ? (
              <motion.div
                key="description"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-5 space-y-3"
              >
                {/* 선택하신 기준 충족도 */}
                {productData.selectedTagsEvaluation && productData.selectedTagsEvaluation.length > 0 && (() => {
                  // 장점 태그와 단점 태그 분리
                  const prosTags = productData.selectedTagsEvaluation.filter(tag => tag.tagType === 'pros');
                  const consTags = productData.selectedTagsEvaluation.filter(tag => tag.tagType === 'cons');

                  // 점수 계산: 충족=1.0, 부분충족=0.5, 불충족=0.0
                  const prosScore = prosTags.reduce((sum, tag) => {
                    if (tag.status === '충족') return sum + 1.0;
                    if (tag.status === '부분충족') return sum + 0.5;
                    return sum;
                  }, 0);

                  // 점수 계산: 회피됨=1.0, 부분회피=0.5, 회피안됨=0.0
                  const consScore = consTags.reduce((sum, tag) => {
                    if (tag.status === '회피됨') return sum + 1.0;
                    if (tag.status === '부분회피') return sum + 0.5;
                    return sum;
                  }, 0);

                  return (
                    <div>
                    
                      <div className="space-y-4">
                        {/* 장점 태그 섹션 */}
                        {prosTags.length > 0 && (
                          <div className="bg-green-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-base font-bold text-green-900 leading-tight">
                                원하는<br />장점
                              </h4>
                              <CircularProgress score={prosScore} total={prosTags.length} color="green" />
                            </div>
                            <div className="space-y-3">
                              {prosTags.map((tagEval, i) => {
                                let badgeColor = '';
                                let badgeText = '';

                                if (tagEval.status === '충족') {
                                  badgeColor = 'bg-green-100 text-green-700';
                                  badgeText = '충족';
                                } else if (tagEval.status === '부분충족') {
                                  badgeColor = 'bg-yellow-100 text-yellow-700';
                                  badgeText = '부분충족';
                                } else if (tagEval.status === '불충족') {
                                  badgeColor = 'bg-red-100 text-red-700';
                                  badgeText = '불충족';
                                }

                                return (
                                  <div key={i} className="bg-white rounded-lg p-3">
                                    <div className="flex items-start gap-2 mb-2">
                                      <strong className="text-sm font-bold text-gray-900 flex-1">
                                        {parseMarkdownBold(tagEval.userTag)}
                                      </strong>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeColor}`}>
                                        {badgeText}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed mb-1">
                                      <TextWithCitations
                                        text={tagEval.evidence}
                                        citations={tagEval.citations}
                                        citedReviews={productData.citedReviews}
                                        onCitationClick={() => {}}
                                      />
                                    </p>
                                    {tagEval.tradeoff && (
                                      <p className="text-xs text-gray-600 leading-relaxed bg-gray-100 rounded p-2 mt-2">
                                        {parseMarkdownBold(tagEval.tradeoff)}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 단점 태그 섹션 */}
                        {consTags.length > 0 && (
                          <div className="bg-blue-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-base font-bold text-blue-900 leading-tight">
                                원하는<br />개선점
                              </h4>
                              <CircularProgress score={consScore} total={consTags.length} color="blue" />
                            </div>
                            <div className="space-y-3">
                              {consTags.map((tagEval, i) => {
                                let badgeColor = '';
                                let badgeText = '';

                                if (tagEval.status === '회피됨') {
                                  badgeColor = 'bg-green-100 text-green-700';
                                  badgeText = '회피됨';
                                } else if (tagEval.status === '부분회피') {
                                  badgeColor = 'bg-yellow-100 text-yellow-700';
                                  badgeText = '부분회피';
                                } else if (tagEval.status === '회피안됨') {
                                  badgeColor = 'bg-red-100 text-red-700';
                                  badgeText = '회피안됨';
                                }

                                return (
                                  <div key={i} className="bg-white rounded-lg p-3">
                                    <div className="flex items-start gap-2 mb-2">
                                      <strong className="text-sm font-bold text-gray-900 flex-1">
                                        {parseMarkdownBold(tagEval.userTag)}
                                      </strong>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeColor}`}>
                                        {badgeText}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed mb-1">
                                      <TextWithCitations
                                        text={tagEval.evidence}
                                        citations={tagEval.citations}
                                        citedReviews={productData.citedReviews}
                                        onCitationClick={() => {}}
                                      />
                                    </p>
                                    {tagEval.tradeoff && (
                                      <p className="text-xs text-gray-600 leading-relaxed bg-gray-100 rounded p-2 mt-2">
                                        {parseMarkdownBold(tagEval.tradeoff)}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 추가 장점 */}
                {productData.additionalPros && productData.additionalPros.length > 0 && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => setIsAdditionalProsOpen(!isAdditionalProsOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">추가로 이런 점도 좋아요</h3>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isAdditionalProsOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {isAdditionalProsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <ul className="space-y-2">
                              {productData.additionalPros.map((pro, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                                  <span className="leading-relaxed">
                                    <TextWithCitations
                                      text={pro.text}
                                      citations={pro.citations}
                                      citedReviews={productData.citedReviews}
                                      onCitationClick={() => {}}
                                    />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 주의점 */}
                {productData.cons && productData.cons.length > 0 && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => setIsConsOpen(!isConsOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">이런 점은 주의하세요</h3>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isConsOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {isConsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <ul className="space-y-2">
                              {productData.cons.map((con, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                                  <span className="leading-relaxed">
                                    <TextWithCitations
                                      text={con.text}
                                      citations={con.citations}
                                      citedReviews={productData.citedReviews}
                                      onCitationClick={() => {}}
                                    />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 다른 제품과의 비교 */}
                {productComparisons && productComparisons.length > 0 && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => setIsComparisonOpen(!isComparisonOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L5 10.274zm10 0l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L15 10.274z" clipRule="evenodd" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">추천된 다른 상품과 비교해보세요</h3>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isComparisonOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {isComparisonOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <ul className="space-y-2">
                              {productComparisons.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                                  <span className="leading-relaxed">
                                    {parseMarkdownBold(item.text)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 구매 팁 (선택적) */}
                {productData.purchaseTip && productData.purchaseTip.length > 0 && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => setIsPurchaseTipOpen(!isPurchaseTipOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">구매 전 확인하세요</h3>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isPurchaseTipOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {isPurchaseTipOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <ul className="space-y-2">
                              {productData.purchaseTip.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                                  <span className="leading-relaxed">
                                    <TextWithCitations
                                      text={item.text}
                                      citations={item.citations || []}
                                      citedReviews={productData.citedReviews}
                                      onCitationClick={() => {}}
                                    />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
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
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      별점 높은순
                    </button>
                    <button
                      onClick={() => handleSortChange('rating_asc')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        sortBy === 'rating_asc'
                          ? 'bg-gray-900 text-white'
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
        </div>

        {/* Floating Action Buttons */}
        {!showChatInput && (
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 px-4 py-3 z-30">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  logButtonClick('최저가 보기', 'product-modal');
                  window.open(
                    `https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(productData.product.title)}&sort=priceASC`,
                    '_blank'
                  );
                }}
                className="flex-[4] h-14 font-semibold rounded-2xl text-base transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                최저가 보기
              </button>
              <button
                onClick={() => {
                  logButtonClick('쿠팡에서 보기', 'product-modal');
                  window.open(`https://www.coupang.com/vp/products/${productData.product.id}`, '_blank');
                }}
                className="flex-[6] h-14 font-semibold rounded-2xl text-base transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              >
                쿠팡에서 보기
              </button>
            </div>
          </div>
        )}

        {/* NEW: Chat Input Bar (keyboard-aware positioning) */}
        <AnimatePresence>
          {showChatInput && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 px-4 py-4 shadow-lg z-[60]"
              style={{ bottom: 'max(env(safe-area-inset-bottom), 0px)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => {
                    setShowChatInput(false);
                    setChatInput('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isProcessing}
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="text-sm font-semibold text-gray-700 flex-1">
                  이 제품 기준으로 어떤 제품을 찾고 싶으신가요?
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isProcessing && chatInput.trim()) {
                      handleReRecommend();
                    }
                  }}
                  placeholder="예: 더 저렴한 걸로, 조용한 제품으로"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  autoFocus
                  disabled={isProcessing}
                />
                <button
                  onClick={handleReRecommend}
                  disabled={!chatInput.trim() || isProcessing}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  전송
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast notification */}
        <Toast
          message="메인 홈에서 찜한 상품들을 확인하실 수 있어요!"
          isVisible={showToast}
          onClose={() => setShowToast(false)}
          duration={2000}
        />
      </motion.div>
    </motion.div>
  );

  // Handler for re-recommendation
  async function handleReRecommend() {
    if (!chatInput.trim() || !onReRecommend) return;

    setIsProcessing(true);

    try {
      // Call parent handler - will close modal and open bottom sheet
      await onReRecommend(productData.product.id, chatInput);
      // Parent will handle everything (close modal, open bottom sheet, etc.)
    } catch (error) {
      console.error('Re-recommendation failed:', error);
      alert('추천 실패. 다시 시도해주세요.');
      setIsProcessing(false);
    }
  }
}
