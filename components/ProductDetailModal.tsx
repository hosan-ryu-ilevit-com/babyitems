'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import DanawaReviewTab from '@/components/DanawaReviewTab';
import { logButtonClick, logFavoriteAction, logProductModalPurchaseClick, logReviewTabOpened } from '@/lib/logging/clientLogger';
import { useFavorites } from '@/hooks/useFavorites';
import Toast from '@/components/Toast';
import OptionSelector from '@/components/ui/OptionSelector';
import type { ProductVariant } from '@/types/recommend-v2';

// V2 조건 충족도 평가 타입
interface V2ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
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
  category: string;
  danawaData?: {
    lowestPrice: number;
    lowestMall: string;
    productName: string;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string; mallLogo?: string }>;
  };
  onClose: () => void;
  onReRecommend?: (productId: string, userInput: string) => Promise<void>;
  isAnalysisLoading?: boolean;
  // V2 조건 충족도 평가 (recommend-v2 플로우용)
  selectedConditionsEvaluation?: V2ConditionEvaluation[];
  // 초기 평균 별점 (PLP에서 전달받음)
  initialAverageRating?: number;
  // 제품 옵션/변형 (그룹핑된 제품의 다른 옵션들)
  variants?: ProductVariant[];
  // 옵션 선택 시 콜백
  onVariantSelect?: (variant: ProductVariant) => void;
  // 옵션별 다나와 최저가 (pcode -> lowest_price)
  variantDanawaData?: Record<string, number>;
  // AI 실시간 장단점 분석 관련
  onRealReviewsClick?: () => void;
  isRealReviewsLoading?: boolean;
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

function getMallLogoPath(mallName: string | undefined): string | null {
  if (!mallName) return null;
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

// 원형 프로그레스 바 컴포넌트 (주석처리 - 사용 안 함)
// function CircularProgress({ score, total, color, size = 40 }: { score: number; total: number; color: 'green' | 'blue' | 'rose'; size?: number }) {
//   const percentage = total > 0 ? (score / total) * 100 : 0;
//   const radius = (size - 6) / 2;
//   const circumference = 2 * Math.PI * radius;
//   const strokeDashoffset = circumference - (percentage / 100) * circumference;

//   const colorClasses = {
//     green: { bg: 'text-green-100', fg: 'text-green-500', text: 'text-green-700' },
//     blue: { bg: 'text-blue-100', fg: 'text-blue-500', text: 'text-blue-700' },
//     rose: { bg: 'text-rose-100', fg: 'text-rose-500', text: 'text-rose-700' },
//   };

//   return (
//     <div className="relative" style={{ width: size, height: size }}>
//       <svg width={size} height={size} className="transform -rotate-90">
//         {/* Background circle */}
//         <circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           fill="none"
//           stroke="currentColor"
//           strokeWidth="4"
//           className={colorClasses[color].bg}
//         />
//         {/* Progress circle */}
//         <circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           fill="none"
//           stroke="currentColor"
//           strokeWidth="4"
//           strokeLinecap="round"
//           strokeDasharray={circumference}
//           strokeDashoffset={strokeDashoffset}
//           className={`${colorClasses[color].fg} transition-all duration-500`}
//         />
//       </svg>
//       {/* Score text */}
//       <div className="absolute inset-0 flex items-center justify-center">
//         <span className={`text-[9px] font-bold leading-none ${colorClasses[color].text}`}>
//           {score % 1 === 0 ? Math.round(score) : score.toFixed(1)}/{Math.round(total)}
//         </span>
//       </div>
//     </div>
//   );
// }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ProductDetailModal({ productData, category, danawaData, onClose, onReRecommend, isAnalysisLoading = false, selectedConditionsEvaluation, initialAverageRating, variants, onVariantSelect, variantDanawaData, onRealReviewsClick: _onRealReviewsClick, isRealReviewsLoading: _isRealReviewsLoading = false }: ProductDetailModalProps) {
  const [priceTab, setPriceTab] = useState<'price' | 'danawa_reviews'>('price');
  const [averageRating] = useState<number>(initialAverageRating || 0);
  const [isExiting, setIsExiting] = useState(false);


  // NEW: Chat input for re-recommendation
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Favorites management
  const { toggleFavorite, isFavorite, count } = useFavorites();

  // Toast for favorite notification
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'add' | 'remove'>('add');

  // 가격 비교 토글 상태
  const [showPriceComparison, setShowPriceComparison] = useState(false);

  // 리뷰 탭 영역 ref (스크롤용)
  const reviewTabRef = useRef<HTMLDivElement>(null);

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

  // 리뷰 탭 열기 이벤트 리스너 (PLP에서 "리뷰 모두보기" 클릭 시)
  useEffect(() => {
    const handleOpenReviewTab = () => {
      setPriceTab('danawa_reviews');
      // 약간의 딜레이 후 리뷰 탭으로 스크롤
      setTimeout(() => {
        reviewTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    };

    window.addEventListener('openReviewTab', handleOpenReviewTab);
    return () => {
      window.removeEventListener('openReviewTab', handleOpenReviewTab);
    };
  }, []);

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

          {/* 옵션 선택 (variants가 있을 때만 표시) */}
          {variants && variants.length > 1 && onVariantSelect && (
            <div className="px-4 pt-4">
              <OptionSelector
                variants={variants}
                selectedPcode={productData.product.id}
                onSelect={onVariantSelect}
                danawaLowestPrices={variantDanawaData}
              />
            </div>
          )}

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
          {/* 가격 - 다나와 최저가 우선, 없으면 product.price */}
          <div className="text-2xl font-bold text-gray-900">
            <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
            {(danawaData?.lowestPrice || productData.product.price).toLocaleString()}원
          </div>
        </div>

        {/* 상품정보 | 상품리뷰 탭 (전체 너비) */}
        <div ref={reviewTabRef}>
          <div className="flex">
            <button
              onClick={() => {
                setPriceTab('price');
                logButtonClick('상품정보 탭', 'product-modal');
              }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                priceTab === 'price'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              상품정보
            </button>
            <button
              onClick={() => {
                setPriceTab('danawa_reviews');
                // 기존 로깅 유지
                logButtonClick('상품 리뷰 탭', 'product-modal');
                // 상세 로깅 추가
                logReviewTabOpened(
                  productData.product.id,
                  productData.product.title,
                  'reviews',
                  category,
                  category, // categoryName으로 category 사용
                  productData.product.brand,
                  productData.rank,
                  'product-modal'
                );
              }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                priceTab === 'danawa_reviews'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              상품리뷰
            </button>
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <AnimatePresence mode="wait">
          {priceTab === 'price' ? (
            <motion.div
              key="product-info-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pb-28"
            >
              {/* 가격 비교 */}
              <div className="px-4 py-4">
                {danawaData && danawaData.prices.length > 0 ? (
                  <div className="space-y-2">
                    {/* 기본 3개 표시 */}
                    {danawaData.prices.slice(0, 3).map((priceInfo, index) => (
                      <a
                        key={index}
                        href={priceInfo.link || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          logButtonClick(`${priceInfo.mall} 바로가기`, 'product-modal');
                          logProductModalPurchaseClick(
                            productData.product.id,
                            productData.product.title,
                            priceInfo.mall,
                            priceInfo.price,
                            index === 0,
                            'product-modal'
                          );
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                      >
                        {/* 쇼핑몰 아이콘 */}
                        <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                          {(priceInfo.mallLogo || getMallLogoPath(priceInfo.mall)) ? (
                            <Image
                              src={priceInfo.mallLogo || getMallLogoPath(priceInfo.mall)!}
                              alt={priceInfo.mall || '쇼핑몰'}
                              width={28}
                              height={28}
                              className="object-contain"
                              unoptimized={!!priceInfo.mallLogo}
                            />
                          ) : (
                            <span className="text-xs font-bold text-gray-500">
                              {priceInfo.mall?.slice(0, 2) || '?'}
                            </span>
                          )}
                        </div>

                        {/* 쇼핑몰 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{priceInfo.mall || '알 수 없음'}</span>
                            {priceInfo.delivery && (
                              <span className="text-xs font-medium text-blue-500">{priceInfo.delivery.replace(/[()]/g, '')}</span>
                            )}
                          </div>
                        </div>

                        {/* 가격 + 화살표 */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-m font-bold ${index === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                            {priceInfo.price?.toLocaleString() || 0}원
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
                          {danawaData.prices.slice(3).map((priceInfo, index) => (
                            <a
                              key={index + 3}
                              href={priceInfo.link || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                logButtonClick(`${priceInfo.mall} 바로가기`, 'product-modal');
                                logProductModalPurchaseClick(
                                  productData.product.id,
                                  productData.product.title,
                                  priceInfo.mall,
                                  priceInfo.price,
                                  false,
                                  'product-modal'
                                );
                              }}
                              className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                            >
                              {/* 쇼핑몰 아이콘 */}
                              <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                                {(priceInfo.mallLogo || getMallLogoPath(priceInfo.mall)) ? (
                                  <Image
                                    src={priceInfo.mallLogo || getMallLogoPath(priceInfo.mall)!}
                                    alt={priceInfo.mall || '쇼핑몰'}
                                    width={28}
                                    height={28}
                                    className="object-contain"
                                    unoptimized={!!priceInfo.mallLogo}
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-gray-500">
                                    {priceInfo.mall?.slice(0, 2) || '?'}
                                  </span>
                                )}
                              </div>

                              {/* 쇼핑몰 정보 */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-gray-900">{priceInfo.mall || '알 수 없음'}</span>
                                  {priceInfo.delivery && (
                                    <span className="text-xs font-medium text-blue-500">{priceInfo.delivery.replace(/[()]/g, '')}</span>
                                  )}
                                </div>
                              </div>

                              {/* 가격 + 화살표 */}
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-m font-bold text-gray-900">
                                  {priceInfo.price?.toLocaleString() || 0}원
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
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="text-gray-400 text-sm">가격 정보가 없습니다</div>
                  </div>
                )}
              </div>


              {/* 상품 정보 콘텐츠 */}
              <div className="px-4 py-5 space-y-3">
                {/* 선택하신 기준 충족도 */}
                {productData.selectedTagsEvaluation && productData.selectedTagsEvaluation.length > 0 && (() => {
                  // 장점 태그와 단점 태그 분리
                  const prosTags = productData.selectedTagsEvaluation.filter(tag => tag.tagType === 'pros');
                  const consTags = productData.selectedTagsEvaluation.filter(tag => tag.tagType === 'cons');

                  // 점수 계산: 충족=1.0, 부분충족=0.5, 불충족=0.0
                  // const prosScore = prosTags.reduce((sum, tag) => {
                  //   if (tag.status === '충족') return sum + 1.0;
                  //   if (tag.status === '부분충족') return sum + 0.5;
                  //   return sum;
                  // }, 0);

                  // 점수 계산: 회피됨=1.0, 부분회피=0.5, 회피안됨=0.0
                  // const consScore = consTags.reduce((sum, tag) => {
                  //   if (tag.status === '회피됨') return sum + 1.0;
                  //   if (tag.status === '부분회피') return sum + 0.5;
                  //   return sum;
                  // }, 0);

                  return (
                    <div>
                    
                      <div className="space-y-4">
                        {/* 장점 태그 섹션 */}
                        {prosTags.length > 0 && (
                          <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-base font-bold text-green-900 leading-tight">
                                원하는 장점
                              </h4>
                              {/* <CircularProgress score={prosScore} total={prosTags.length} color="green" /> */}
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
                                      {tagEval.evidence}
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
                                원하는 개선점
                              </h4>
                              {/* <CircularProgress score={consScore} total={consTags.length} color="blue" /> */}
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
                                      {tagEval.evidence}
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

                  // 선호속성: 충족 → 부분충족 → 불충족 순서로 정렬
                  const balanceStatusOrder: Record<string, number> = { '충족': 0, '부분충족': 1, '불충족': 2 };
                  const balanceConditions = selectedConditionsEvaluation
                    .filter(c => c.conditionType === 'balance')
                    .sort((a, b) => (balanceStatusOrder[a.status] ?? 3) - (balanceStatusOrder[b.status] ?? 3));

                  // 피하고 싶은 단점: 회피됨 → 부분회피 → 회피안됨 순서로 정렬
                  const negativeStatusOrder: Record<string, number> = { '회피됨': 0, '부분회피': 1, '회피안됨': 2 };
                  const negativeConditions = selectedConditionsEvaluation
                    .filter(c => c.conditionType === 'negative')
                    .sort((a, b) => (negativeStatusOrder[a.status] ?? 3) - (negativeStatusOrder[b.status] ?? 3));

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
                  // const hardFilterScore = hardFilterConditions.filter(c => c.status === '충족').length;

                  // const balanceScore = balanceConditions.reduce((sum, c) => {
                  //   if (c.status === '충족') return sum + 1.0;
                  //   if (c.status === '부분충족') return sum + 0.5;
                  //   return sum;
                  // }, 0);

                  // const negativeScore = negativeConditions.reduce((sum, c) => {
                  //   if (c.status === '회피됨') return sum + 1.0;
                  //   if (c.status === '부분회피') return sum + 0.5;
                  //   return sum;
                  // }, 0);

                  return (
                    <div className="space-y-4">
                      {/* 필수 조건 (하드 필터) - 태그 기반 표시 */}
                      {hardFilterConditions.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#4E43E1]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                              </svg>
                              <h4 className="text-sm font-bold text-[#4E43E1] leading-tight">
                                필수 조건
                              </h4>
                            </div>
                            {/* <CircularProgress score={hardFilterScore} total={hardFilterConditions.length} color="blue" /> */}
                          </div>
                          <div className="border-t border-gray-200 pt-3">
                            <div className="flex flex-wrap gap-2">
                              {hardFilterConditions.map((cond, i) => {
                                const isSatisfied = cond.status === '충족';
                                return (
                                  <span
                                    key={i}
                                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                      isSatisfied
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-400 opacity-50'
                                    }`}
                                  >
                                    {cond.condition}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 선호 속성 (밸런스 게임) */}
                      {balanceConditions.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#4E43E1]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                              </svg>
                              <h4 className="text-sm font-bold text-[#4E43E1] leading-tight">
                                선호 속성
                              </h4>
                            </div>
                            {/* <CircularProgress score={balanceScore} total={balanceConditions.length} color="green" /> */}
                          </div>
                          <div className="border-t border-gray-200 pt-3">
                            <div className="space-y-4">
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
                                  <div key={i}>
                                    <div className="flex items-start justify-between mb-2 gap-2">
                                      <strong className="text-sm font-bold text-gray-900 max-w-[70%] flex-1" style={{ wordBreak: 'keep-all' }}>
                                        {cond.condition}
                                      </strong>
                                      <span className={`px-2.5 py-1 rounded-md text-sm font-semibold shrink-0 ${badgeColor}`}>
                                        {badgeText}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed">
                                      {parseMarkdownBold(cond.evidence)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 피하고 싶은 단점 */}
                      {negativeConditions.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-[#4E43E1]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                              </svg>
                              <h4 className="text-sm font-bold text-[#4E43E1] leading-tight">
                                피하고 싶은 단점
                              </h4>
                            </div>
                            {/* <CircularProgress score={negativeScore} total={negativeConditions.length} color="green" /> */}
                          </div>
                          <div className="border-t border-gray-200 pt-3">
                            <div className="space-y-4">
                              {negativeConditions.map((cond, i) => {
                                let badgeColor = '';
                                let badgeText = '';

                                if (cond.status === '회피됨') {
                                  badgeColor = 'bg-green-100 text-green-700';
                                  badgeText = '회피됨';
                                } else if (cond.status === '부분회피') {
                                  badgeColor = 'bg-yellow-100 text-yellow-700';
                                  badgeText = '부분회피';
                                } else {
                                  badgeColor = 'bg-red-100 text-red-700';
                                  badgeText = '회피안됨';
                                }

                                return (
                                  <div key={i}>
                                    <div className="flex items-start justify-between mb-2 gap-2">
                                      <strong className="text-sm font-bold text-gray-900 max-w-[70%] flex-1" style={{ wordBreak: 'keep-all' }}>
                                        {cond.condition}
                                      </strong>
                                      <span className={`px-2.5 py-1 rounded-md text-sm font-semibold shrink-0 ${badgeColor}`}>
                                        {badgeText}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed">
                                      {parseMarkdownBold(cond.evidence)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* AI 실시간 장단점 버튼 - 주석처리 */}
                {/* {onRealReviewsClick && (
                  <div className="mt-6">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRealReviewsClick();
                      }}
                      disabled={isRealReviewsLoading}
                      className="w-full py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-medium transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRealReviewsLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          실시간 분석 중...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          실시간 장단점 보기
                        </>
                      )}
                    </button>
                  </div>
                )} */}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="danawa-reviews-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pb-28"
            >
              <DanawaReviewTab pcode={productData.product.id} fullHeight={true} />
            </motion.div>
          )}
        </AnimatePresence>
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
                  setToastType(wasFavorite ? 'remove' : 'add');
                  setShowToast(true);
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
                  const lowestPrice = danawaData?.prices?.[0]?.price;
                  const lowestMall = danawaData?.prices?.[0]?.mall || '쿠팡';

                  // 가격 정보 로깅
                  logProductModalPurchaseClick(
                    productData.product.id,
                    productData.product.title,
                    lowestMall,
                    lowestPrice || productData.product.price,
                    true, // 최저가 버튼이므로 항상 true
                    'product-modal'
                  );

                  if (lowestPriceLink) {
                    window.open(lowestPriceLink, '_blank');
                  } else {
                    window.open(`https://www.coupang.com/vp/products/${productData.product.id}`, '_blank');
                  }
                }}
                className="flex-1 h-14 font-semibold rounded-2xl text-base transition-colors text-white"
                style={{ backgroundColor: '#0084FE' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0070D9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0084FE'}
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
          isVisible={showToast}
          onClose={() => setShowToast(false)}
          duration={2000}
          type={toastType}
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
