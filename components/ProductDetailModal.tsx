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

// V2 조건 충족도 평가 타입
interface V2ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '개선됨' | '부분개선' | '회피안됨';
  evidence: string;
  tradeoff?: string;
  questionId?: string;  // 하드필터 질문 ID (같은 질문 내 옵션 그룹화용)
}

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
      status: '충족' | '부분충족' | '불충족' | '개선됨' | '부분개선' | '회피안됨';
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
  danawaData?: {
    lowestPrice: number;
    lowestMall: string;
    productName: string;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
  }; // NEW: Danawa price data from Result page
  onClose: () => void;
  onReRecommend?: (productId: string, userInput: string) => Promise<void>; // NEW: Callback for re-recommendation
  isAnalysisLoading?: boolean; // NEW: 백그라운드 분석 로딩 상태
  // V2 조건 충족도 평가 (recommend-v2 플로우용)
  selectedConditionsEvaluation?: V2ConditionEvaluation[];
  // 초기 평균 별점 (PLP에서 전달받음)
  initialAverageRating?: number;
}

// 쇼핑몰 이름 → 로고 파일 매핑
const MALL_LOGO_MAP: Record<string, string> = {
  'G마켓': 'gmarket',
  '지마켓': 'gmarket',
  '옥션': 'auction',
  '쿠팡': 'coupang',
  '11번가': '11',
  '네이버': 'naver',
  '네이버쇼핑': 'naver',
  'SSG': 'ssg',
  'SSG닷컴': 'ssg',
  '쓱닷컴': 'ssg',
  '롯데ON': 'lotteon',
  '롯데온': 'lotteon',
  '이마트': 'emart',
  '이마트몰': 'emart',
  '하이마트': 'himart',
  '현대Hmall': 'hmall',
  'Hmall': 'hmall',
  '오늘의집': 'bucketplace',
  'LG전자': 'lg',
  'LG': 'lg',
  '삼성전자': 'samsung',
  '삼성': 'samsung',
  '신세계몰': 'shinsegaemall',
  'NS홈쇼핑': 'nsmall',
  'NS몰': 'nsmall',
  'SK스토아': 'skstoa',
  '홈쇼핑': 'homeshopping',
};

function getMallLogoPath(mallName: string): string | null {
  // 정확한 매칭 먼저 시도
  if (MALL_LOGO_MAP[mallName]) {
    return `/icons/malls/name=${MALL_LOGO_MAP[mallName]}.png`;
  }
  // 부분 매칭 시도
  for (const [key, value] of Object.entries(MALL_LOGO_MAP)) {
    if (mallName.includes(key) || key.includes(mallName)) {
      return `/icons/malls/name=${value}.png`;
    }
  }
  return null;
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
function CircularProgress({ score, total, color, size = 40 }: { score: number; total: number; color: 'green' | 'blue' | 'rose'; size?: number }) {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    green: { bg: 'text-green-100', fg: 'text-green-500', text: 'text-green-700' },
    blue: { bg: 'text-blue-100', fg: 'text-blue-500', text: 'text-blue-700' },
    rose: { bg: 'text-rose-100', fg: 'text-rose-500', text: 'text-rose-700' },
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
        <span className={`text-[9px] font-bold leading-none ${colorClasses[color].text}`}>
          {score % 1 === 0 ? Math.round(score) : score.toFixed(1)}/{Math.round(total)}
        </span>
      </div>
    </div>
  );
}

export default function ProductDetailModal({ productData, productComparisons, category, danawaData, onClose, onReRecommend, isAnalysisLoading = false, selectedConditionsEvaluation, initialAverageRating }: ProductDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'rating_desc' | 'rating_asc'>('rating_desc');
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState<number>(initialAverageRating || 0);
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

  // 가격 비교 토글 상태
  const [showPriceComparison, setShowPriceComparison] = useState(false);

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
        <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
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
          <div className="px-4 pt-4">
            <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden">
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

            </div>
          </div>

        {/* Product Info */}
        <div className="px-4 py-4 border-b border-gray-100">
          {/* Brand and Rating Row */}
          <div className="flex items-center justify-between mb-1">
            {productData.product.brand && (
              <div className="text-sm text-gray-500">{productData.product.brand}</div>
            )}
            {/* 평균별점 또는 리뷰개수가 있을 때만 표시 */}
            {(averageRating > 0 || productData.product.reviewCount > 0) && (
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-semibold text-gray-900">
                  {averageRating > 0 ? averageRating.toFixed(1) : '—'}
                </span>
                <span className="text-sm text-gray-500">({productData.product.reviewCount.toLocaleString()})</span>
              </div>
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-3 leading-snug">
            {productData.product.title}
          </h2>
          <div className="text-2xl font-bold text-gray-900 mb-2">
            {productData.product.price.toLocaleString()}원
          </div>
          

          {/* 가격 비교 */}
          {danawaData && danawaData.prices.length > 0 && (
            <div className="space-y-2">
              {/* 기본 3개 표시 */}
              {danawaData.prices.slice(0, 3).map((priceInfo, index) => (
                <a
                  key={index}
                  href={priceInfo.link || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logButtonClick(`${priceInfo.mall} 바로가기`, 'product-modal')}
                  className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                >
                  {/* 쇼핑몰 아이콘 */}
                  <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {getMallLogoPath(priceInfo.mall) ? (
                      <Image
                        src={getMallLogoPath(priceInfo.mall)!}
                        alt={priceInfo.mall}
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    ) : (
                      <span className="text-xs font-bold text-gray-500">
                        {priceInfo.mall.slice(0, 2)}
                      </span>
                    )}
                  </div>

                  {/* 쇼핑몰 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{priceInfo.mall}</span>
                      <span className="text-xs font-medium text-blue-500">{priceInfo.delivery.replace(/[()]/g, '')}</span>
                    </div>
                  </div>

                  {/* 가격 + 화살표 */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-m font-bold ${index === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                      {priceInfo.price.toLocaleString()}원
                    </span>
                    <div className="w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </a>
              ))}

              {/* 추가 판매처 (애니메이션) */}
              <AnimatePresence initial={false}>
                {showPriceComparison && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="space-y-2 overflow-hidden"
                  >
                    {danawaData.prices.slice(3, 10).map((priceInfo, index) => (
                      <a
                        key={index + 3}
                        href={priceInfo.link || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => logButtonClick(`${priceInfo.mall} 바로가기`, 'product-modal')}
                        className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                      >
                        {/* 쇼핑몰 아이콘 */}
                        <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                          {getMallLogoPath(priceInfo.mall) ? (
                            <Image
                              src={getMallLogoPath(priceInfo.mall)!}
                              alt={priceInfo.mall}
                              width={28}
                              height={28}
                              className="object-contain"
                            />
                          ) : (
                            <span className="text-xs font-bold text-gray-500">
                              {priceInfo.mall.slice(0, 2)}
                            </span>
                          )}
                        </div>

                        {/* 쇼핑몰 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{priceInfo.mall}</span>
                            <span className="text-xs font-medium text-blue-500">{priceInfo.delivery.replace(/[()]/g, '')}</span>
                          </div>
                        </div>

                        {/* 가격 + 화살표 */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-m font-bold text-gray-900">
                            {priceInfo.price.toLocaleString()}원
                          </span>
                          <div className="w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center">
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 판매처 더보기 버튼 */}
              {danawaData.prices.length > 3 && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => {
                      setShowPriceComparison(!showPriceComparison);
                      logButtonClick(showPriceComparison ? '판매처 접기' : '판매처 더보기', 'product-modal');
                    }}
                    className="px-5 py-2 bg-black/60 rounded-full text-sm font-medium text-white hover:bg-gray-600 transition-colors"
                  >
                    {showPriceComparison ? '판매처 접기' : '판매처 더보기'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recommendation Reasoning Container */}
        <div className="px-4 pt-4">
          <div className="bg-[#F3E6FD] rounded-2xl px-4 py-3 flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 shrink-0" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="sparkle-gradient-pdp" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9325FC" />
                  <stop offset="50%" stopColor="#C750FF" />
                  <stop offset="100%" stopColor="#C878F7" />
                </linearGradient>
              </defs>
              <path fill="url(#sparkle-gradient-pdp)" d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
            </svg>
            <p className="text-sm text-gray-700 leading-normal flex-1">
              {parseMarkdownBold(productData.reasoning)}
            </p>
          </div>
        </div>

         
          {/* Tab Content */}
          <div className="pb-28">
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

                  // 점수 계산: 개선됨=1.0, 부분개선=0.5, 회피안됨=0.0
                  const consScore = consTags.reduce((sum, tag) => {
                    if (tag.status === '개선됨') return sum + 1.0;
                    if (tag.status === '부분개선') return sum + 0.5;
                    return sum;
                  }, 0);

                  return (
                    <div>
                    
                      <div className="space-y-4">
                        {/* 장점 태그 섹션 */}
                        {prosTags.length > 0 && (
                          <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
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
                                  <div key={i} className="pb-3 border-b border-gray-200 last:border-b-0 last:pb-0">
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
                                      <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 mt-2">
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
                          <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-base font-bold text-blue-900 leading-tight">
                                원하는<br />개선점
                              </h4>
                              <CircularProgress score={consScore} total={consTags.length} color="blue" />
                            </div>
                            <div className="space-y-3">
                              {consTags.map((tagEval, i) => {
                                let badgeColor = '';
                                let badgeText = '';

                                if (tagEval.status === '개선됨') {
                                  badgeColor = 'bg-green-100 text-green-700';
                                  badgeText = '개선됨';
                                } else if (tagEval.status === '부분개선') {
                                  badgeColor = 'bg-yellow-100 text-yellow-700';
                                  badgeText = '부분개선';
                                } else if (tagEval.status === '회피안됨') {
                                  badgeColor = 'bg-red-100 text-red-700';
                                  badgeText = '회피안됨';
                                }

                                return (
                                  <div key={i} className="pb-3 border-b border-gray-200 last:border-b-0 last:pb-0">
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
                                      <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 mt-2">
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

                {/* V2 조건 충족도 평가 (recommend-v2 플로우용) - 로딩 중이거나 데이터가 있을 때 표시 */}
                {(isAnalysisLoading || (selectedConditionsEvaluation && selectedConditionsEvaluation.length > 0)) && (() => {
                  // 로딩 중이면 로딩 인디케이터 표시
                  if (isAnalysisLoading && (!selectedConditionsEvaluation || selectedConditionsEvaluation.length === 0)) {
                    return (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                          <span className="text-sm text-gray-600 font-medium">조건 충족도 분석 중...</span>
                        </div>
                      </div>
                    );
                  }

                  if (!selectedConditionsEvaluation || selectedConditionsEvaluation.length === 0) {
                    return null;
                  }
                  // 조건 타입별 분리
                  const hardFilterConditionsRaw = selectedConditionsEvaluation.filter(c => c.conditionType === 'hardFilter');
                  const balanceConditions = selectedConditionsEvaluation.filter(c => c.conditionType === 'balance');
                  const negativeConditions = selectedConditionsEvaluation.filter(c => c.conditionType === 'negative');

                  // 하드 필터: 같은 questionId를 가진 조건들 중 충족된 것만 표시
                  // (OR 조건이므로 하나라도 충족하면 나머지 불충족은 표시 안 함)
                  const hardFilterConditions = (() => {
                    // questionId가 없는 조건들은 그대로 유지
                    const withoutQuestionId = hardFilterConditionsRaw.filter(c => !c.questionId);

                    // questionId가 있는 조건들을 그룹화
                    const groupedByQuestion = new Map<string, typeof hardFilterConditionsRaw>();
                    hardFilterConditionsRaw
                      .filter(c => c.questionId)
                      .forEach(c => {
                        const group = groupedByQuestion.get(c.questionId!) || [];
                        group.push(c);
                        groupedByQuestion.set(c.questionId!, group);
                      });

                    // 각 그룹에서 조건 선택: 충족된 것이 있으면 그것만, 없으면 가장 좋은 상태 하나만
                    const fromGroups: typeof hardFilterConditionsRaw = [];
                    groupedByQuestion.forEach(group => {
                      const satisfied = group.filter(c => c.status === '충족');
                      if (satisfied.length > 0) {
                        // 충족된 것만 표시 (불충족은 표시 안 함)
                        fromGroups.push(...satisfied);
                      } else {
                        // 충족된 게 없으면 부분충족이나 불충족 중 하나만 표시
                        const partial = group.filter(c => c.status === '부분충족');
                        if (partial.length > 0) {
                          fromGroups.push(partial[0]);
                        } else {
                          fromGroups.push(group[0]);
                        }
                      }
                    });

                    return [...withoutQuestionId, ...fromGroups];
                  })();

                  // 점수 계산
                  const hardFilterScore = hardFilterConditions.reduce((sum, c) => {
                    if (c.status === '충족') return sum + 1.0;
                    if (c.status === '부분충족') return sum + 0.5;
                    return sum;
                  }, 0);

                  const balanceScore = balanceConditions.reduce((sum, c) => {
                    if (c.status === '충족') return sum + 1.0;
                    if (c.status === '부분충족') return sum + 0.5;
                    return sum;
                  }, 0);

                  const negativeScore = negativeConditions.reduce((sum, c) => {
                    if (c.status === '개선됨') return sum + 1.0;
                    if (c.status === '부분개선') return sum + 0.5;
                    return sum;
                  }, 0);

                  return (
                    <div className="space-y-4">
                      {/* 필수 조건 (하드 필터) */}
                      {hardFilterConditions.length > 0 && (
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-base font-bold text-blue-900 leading-tight">
                              필수<br />조건
                            </h4>
                            <CircularProgress score={hardFilterScore} total={hardFilterConditions.length} color="blue" />
                          </div>
                          <div className="space-y-3">
                            {hardFilterConditions.map((cond, i) => {
                              let badgeColor = '';
                              let badgeText = '';

                              if (cond.status === '충족') {
                                badgeColor = 'bg-green-100 text-green-700';
                                badgeText = '충족';
                              } else if (cond.status === '부분충족') {
                                badgeColor = 'bg-yellow-100 text-yellow-700';
                                badgeText = '부분충족';
                              } else {
                                badgeColor = 'bg-red-100 text-red-700';
                                badgeText = '불충족';
                              }

                              return (
                                <div key={i} className="pb-3 border-b border-blue-100 last:border-b-0 last:pb-0">
                                  <div className="flex items-start gap-2 mb-2">
                                    <strong className="text-sm font-bold text-gray-900 flex-1">
                                      {cond.condition}
                                    </strong>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeColor}`}>
                                      {badgeText}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {parseMarkdownBold(cond.evidence)}
                                  </p>
                                  {cond.tradeoff && (
                                    <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 mt-2">
                                      {parseMarkdownBold(cond.tradeoff)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 선호 속성 (밸런스 게임) */}
                      {balanceConditions.length > 0 && (
                        <div className="bg-emerald-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-base font-bold text-emerald-900 leading-tight">
                              선호<br />속성
                            </h4>
                            <CircularProgress score={balanceScore} total={balanceConditions.length} color="green" />
                          </div>
                          <div className="space-y-3">
                            {balanceConditions.map((cond, i) => {
                              let badgeColor = '';
                              let badgeText = '';

                              if (cond.status === '충족') {
                                badgeColor = 'bg-green-100 text-green-700';
                                badgeText = '충족';
                              } else if (cond.status === '부분충족') {
                                badgeColor = 'bg-yellow-100 text-yellow-700';
                                badgeText = '부분충족';
                              } else {
                                badgeColor = 'bg-red-100 text-red-700';
                                badgeText = '불충족';
                              }

                              return (
                                <div key={i} className="pb-3 border-b border-emerald-100 last:border-b-0 last:pb-0">
                                  <div className="flex items-start gap-2 mb-2">
                                    <strong className="text-sm font-bold text-gray-900 flex-1">
                                      {cond.condition}
                                    </strong>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeColor}`}>
                                      {badgeText}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {parseMarkdownBold(cond.evidence)}
                                  </p>
                                  {cond.tradeoff && (
                                    <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 mt-2">
                                      {parseMarkdownBold(cond.tradeoff)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 피하고 싶은 단점 */}
                      {negativeConditions.length > 0 && (
                        <div className="bg-rose-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-base font-bold text-rose-900 leading-tight">
                              피하고 싶은<br />단점
                            </h4>
                            <CircularProgress score={negativeScore} total={negativeConditions.length} color="rose" />
                          </div>
                          <div className="space-y-3">
                            {negativeConditions.map((cond, i) => {
                              let badgeColor = '';
                              let badgeText = '';

                              if (cond.status === '개선됨') {
                                badgeColor = 'bg-green-100 text-green-700';
                                badgeText = '개선됨';
                              } else if (cond.status === '부분개선') {
                                badgeColor = 'bg-yellow-100 text-yellow-700';
                                badgeText = '부분개선';
                              } else {
                                badgeColor = 'bg-red-100 text-red-700';
                                badgeText = '회피안됨';
                              }

                              return (
                                <div key={i} className="pb-3 border-b border-rose-100 last:border-b-0 last:pb-0">
                                  <div className="flex items-start gap-2 mb-2">
                                    <strong className="text-sm font-bold text-gray-900 flex-1">
                                      {cond.condition}
                                    </strong>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeColor}`}>
                                      {badgeText}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {parseMarkdownBold(cond.evidence)}
                                  </p>
                                  {cond.tradeoff && (
                                    <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 mt-2">
                                      {parseMarkdownBold(cond.tradeoff)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 추가 장점 - 로딩 중이거나 데이터가 있을 때 표시 */}
                {(isAnalysisLoading || (productData.additionalPros && productData.additionalPros.length > 0)) && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => !isAnalysisLoading && setIsAdditionalProsOpen(!isAdditionalProsOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">추가로 이런 점도 좋아요</h3>
                        {isAnalysisLoading && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin ml-2"></div>
                        )}
                      </div>
                      {!isAnalysisLoading && (
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isAdditionalProsOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
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

                {/* 주의점 - 로딩 중이거나 데이터가 있을 때 표시 */}
                {(isAnalysisLoading || (productData.cons && productData.cons.length > 0)) && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => !isAnalysisLoading && setIsConsOpen(!isConsOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">이런 점은 주의하세요</h3>
                        {isAnalysisLoading && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin ml-2"></div>
                        )}
                      </div>
                      {!isAnalysisLoading && (
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isConsOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
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

                {/* 구매 팁 (선택적) - 로딩 중이거나 데이터가 있을 때 표시 */}
                {(isAnalysisLoading || (productData.purchaseTip && productData.purchaseTip.length > 0)) && (
                  <div className="bg-gray-50 rounded-lg">
                    <button
                      onClick={() => !isAnalysisLoading && setIsPurchaseTipOpen(!isPurchaseTipOpen)}
                      className="w-full py-4 px-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                        </svg>
                        <h3 className="text-base font-bold text-gray-900">구매 전 확인하세요</h3>
                        {isAnalysisLoading && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-yellow-500 rounded-full animate-spin ml-2"></div>
                        )}
                      </div>
                      {!isAnalysisLoading && (
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isPurchaseTipOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    <AnimatePresence>
                      {isPurchaseTipOpen && productData.purchaseTip && productData.purchaseTip.length > 0 && (
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
              {/* 찜하기 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const wasFavorite = isFavorite(productData.product.id);
                  toggleFavorite(productData.product.id);
                  const action = wasFavorite ? 'removed' : 'added';
                  const newCount = wasFavorite ? count - 1 : count + 1;
                  logFavoriteAction(action, productData.product.id, productData.product.title, newCount);
                  logButtonClick(wasFavorite ? '찜 취소' : '찜하기', 'product-modal');
                  if (!wasFavorite) {
                    setShowToast(true);
                  }
                }}
                className="w-14 h-14 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill={isFavorite(productData.product.id) ? '#FF6B6B' : 'none'}
                  stroke={isFavorite(productData.product.id) ? '#FF6B6B' : '#6B7280'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
              {/* 최저가로 구매하기 버튼 */}
              <button
                onClick={() => {
                  logButtonClick('최저가로 구매하기', 'product-modal');
                  // 다나와 최저가 링크가 있으면 사용, 없으면 쿠팡 링크로 fallback
                  const lowestPriceLink = danawaData?.prices?.[0]?.link;
                  if (lowestPriceLink) {
                    window.open(lowestPriceLink, '_blank');
                  } else {
                    window.open(`https://www.coupang.com/vp/products/${productData.product.id}`, '_blank');
                  }
                }}
                className="flex-1 h-14 font-semibold rounded-2xl text-base transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              >
                최저가로 구매하기
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
          duration={3000}
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
