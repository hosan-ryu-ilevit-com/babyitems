'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import DanawaReviewTab from '@/components/DanawaReviewTab';
import { logButtonClick, logFavoriteAction, logProductModalPurchaseClick, logReviewTabOpened } from '@/lib/logging/clientLogger';
import { useFavorites } from '@/hooks/useFavorites';
import Toast from '@/components/Toast';
import OptionSelector from '@/components/ui/OptionSelector';
import type { ProductVariant } from '@/types/recommend-v2';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';

// 실시간 가격 크롤링 결과 타입
interface LivePriceData {
  loading: boolean;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  prices: Array<{ mall: string; price: number; delivery: string; link?: string; mallLogo?: string }>;
  error?: string;
}

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
  // 내 상황과의 적합성 (initialContext가 있을 때만)
  initialContext?: string;  // 사용자가 처음 입력한 자연어 상황
  contextMatchData?: {
    explanation: string;      // "밤수유가 잦다고 하셨는데, 이 제품은 저소음 35dB로 아기를 깨우지 않아요"
    matchedPoints: string[];  // ["저소음", "급속 가열", "야간 조명"]
  };
  scrollToSellers?: boolean;
  initialTab?: 'price' | 'danawa_reviews';
  // 미리 크롤링된 리뷰 (knowledge-agent 플로우에서 사용)
    preloadedReviews?: Array<{
      content: string;
      rating: number;
      author?: string;
      date?: string;
      mallName?: string;
      images?: string[];
    }>;
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
export default function ProductDetailModal({ productData, category, danawaData, onClose, onReRecommend, isAnalysisLoading = false, selectedConditionsEvaluation, initialAverageRating, variants, onVariantSelect, variantDanawaData, onRealReviewsClick: _onRealReviewsClick, isRealReviewsLoading: _isRealReviewsLoading = false, initialContext, contextMatchData, scrollToSellers = false, initialTab = 'price', preloadedReviews }: ProductDetailModalProps) {
  const [priceTab, setPriceTab] = useState<'price' | 'danawa_reviews'>(initialTab);
  const [averageRating] = useState<number>(initialAverageRating || 0);
  const [isExiting, setIsExiting] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const sellersRef = useRef<HTMLDivElement>(null);


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

  // 실시간 가격 크롤링 상태
  const [livePrice, setLivePrice] = useState<LivePriceData>({
    loading: false,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    prices: [],
  });

  // 실시간 가격 fetch 함수
  const fetchLivePrices = useCallback(async (pcode: string) => {
    setLivePrice(prev => ({ ...prev, loading: true, error: undefined }));

    try {
      const res = await fetch(`/api/knowledge-agent/prices?pcode=${pcode}`);
      const data = await res.json();

      if (data.success) {
        setLivePrice({
          loading: false,
          lowestPrice: data.lowestPrice,
          lowestMall: data.lowestMall,
          lowestDelivery: data.lowestDelivery,
          prices: (data.mallPrices || []).map((mp: { mall: string; price: number; delivery: string; link?: string }) => ({
            mall: mp.mall,
            price: mp.price,
            delivery: mp.delivery,
            link: mp.link,
          })),
        });
      } else {
        setLivePrice(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Failed to fetch prices',
        }));
      }
    } catch (error) {
      setLivePrice(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Network error',
      }));
    }
  }, []);

  // danawaData가 없고 pcode가 숫자형일 때 실시간 크롤링
  useEffect(() => {
    const pcode = productData.product.id;
    // lowestPrice 또는 prices가 있으면 danawaData 있는 것으로 간주
    const hasDanawaData = danawaData && (danawaData.prices?.length > 0 || danawaData.lowestPrice);

    // danawaData가 없고, pcode가 숫자형(다나와 코드)일 때만 실시간 크롤링
    if (!hasDanawaData && pcode && /^\d+$/.test(pcode)) {
      fetchLivePrices(pcode);
    }
  }, [productData.product.id, danawaData, fetchLivePrices]);

  // 실제 사용할 가격 데이터 (danawaData 우선, 없으면 livePrice)
  const effectivePriceData = (() => {
    // danawaData에 prices 또는 lowestPrice가 있으면 사용
    if (danawaData && (danawaData.prices?.length > 0 || danawaData.lowestPrice)) {
      // prices가 비어있지만 lowestPrice가 있으면 합성 price 엔트리 생성
      const prices = danawaData.prices?.length > 0
        ? danawaData.prices
        : danawaData.lowestPrice
          ? [{ mall: danawaData.lowestMall || '최저가', price: danawaData.lowestPrice, delivery: '' }]
          : [];
      return { ...danawaData, prices };
    }
    // livePrice 사용
    if (livePrice.prices.length > 0) {
      return {
        lowestPrice: livePrice.lowestPrice || productData.product.price,
        lowestMall: livePrice.lowestMall || '',
        productName: productData.product.title,
        prices: livePrice.prices,
      };
    }
    return null;
  })();

  // 리뷰 정렬 상태 (preloadedReviews용)
  const [reviewSortOrder, setReviewSortOrder] = useState<'newest' | 'high' | 'low'>('newest');
  const [isSortBottomSheetOpen, setIsSortBottomSheetOpen] = useState(false);
  const [expandedReviewIds, setExpandedReviewIds] = useState<Set<number>>(new Set());
  const [showPhotoReviewsOnly, setShowPhotoReviewsOnly] = useState(false);
  const [displayedReviewsCount, setDisplayedReviewsCount] = useState(30); // 리뷰 lazy loading
  const [showBlogReview, setShowBlogReview] = useState(false); // 블로그 후기 바텀시트
  const [blogHasNavigated, setBlogHasNavigated] = useState(false); // 블로그 내부 네비게이션 추적
  const blogIframeRef = useRef<HTMLIFrameElement>(null);
  const blogInitialLoadRef = useRef(true);
  const loadMoreReviewsRef = useRef<HTMLDivElement>(null);

  // PDP 상단 이미지 캐러셀 상태
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isCarouselTransitioning, setIsCarouselTransitioning] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // 캐러셀 이미지 배열 생성 (제품 썸네일 + 리뷰 이미지 최대 10장)
  const carouselImages = useMemo(() => {
    const images: string[] = [];

    // 1. 제품 썸네일
    if (productData.product.thumbnail) {
      images.push(productData.product.thumbnail);
    }

    // 2. 리뷰 이미지 추가 (최대 9장, 총 10장까지)
    if (preloadedReviews) {
      for (const review of preloadedReviews) {
        if (review.images && review.images.length > 0) {
          for (const img of review.images) {
            if (images.length >= 10) break;
            if (!images.includes(img)) {
              images.push(img);
            }
          }
        }
        if (images.length >= 10) break;
      }
    }

    return images;
  }, [productData.product.thumbnail, preloadedReviews]);

  const imageCount = carouselImages.length;
  const hasMultipleImages = imageCount > 1;

  // 무한 루프용 확장 배열: [마지막] + [원본들] + [첫번째]
  const extendedCarouselImages = useMemo(() => {
    if (!hasMultipleImages) return carouselImages;
    return [carouselImages[imageCount - 1], ...carouselImages, carouselImages[0]];
  }, [carouselImages, imageCount, hasMultipleImages]);

  // 초기 스크롤 위치 설정 (첫 번째 실제 이미지로)
  useEffect(() => {
    if (hasMultipleImages && carouselRef.current) {
      const width = carouselRef.current.offsetWidth;
      carouselRef.current.scrollLeft = width;
    }
  }, [hasMultipleImages]);

  // 리뷰 무한 스크롤 (Intersection Observer)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && preloadedReviews) {
          setDisplayedReviewsCount(prev => {
            const filtered = showPhotoReviewsOnly
              ? preloadedReviews.filter(r => r.images && r.images.length > 0)
              : preloadedReviews;
            return Math.min(prev + 20, filtered.length);
          });
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreReviewsRef.current) {
      observer.observe(loadMoreReviewsRef.current);
    }

    return () => observer.disconnect();
  }, [preloadedReviews, showPhotoReviewsOnly]);

  // 필터 변경 시 표시 개수 초기화
  useEffect(() => {
    setDisplayedReviewsCount(30);
  }, [showPhotoReviewsOnly, reviewSortOrder]);

  // 캐러셀 스크롤 핸들러 (무한 루프 처리)
  const handleCarouselScroll = useCallback(() => {
    if (!carouselRef.current || !hasMultipleImages || isCarouselTransitioning) return;

    const scrollLeft = carouselRef.current.scrollLeft;
    const width = carouselRef.current.offsetWidth;
    const scrollIndex = Math.round(scrollLeft / width);

    // 무한 루프 처리: 클론 위치에 도달하면 실제 위치로 점프
    if (scrollIndex === 0) {
      // 맨 앞 클론(마지막 이미지) → 실제 마지막 이미지로 점프
      setIsCarouselTransitioning(true);
      setTimeout(() => {
        if (carouselRef.current) {
          carouselRef.current.scrollTo({
            left: width * imageCount,
            behavior: 'instant',
          });
        }
        setCarouselIndex(imageCount - 1);
        setIsCarouselTransitioning(false);
      }, 50);
    } else if (scrollIndex === imageCount + 1) {
      // 맨 뒤 클론(첫 번째 이미지) → 실제 첫 번째 이미지로 점프
      setIsCarouselTransitioning(true);
      setTimeout(() => {
        if (carouselRef.current) {
          carouselRef.current.scrollTo({
            left: width,
            behavior: 'instant',
          });
        }
        setCarouselIndex(0);
        setIsCarouselTransitioning(false);
      }, 50);
    } else {
      // 일반 스크롤: 실제 인덱스 업데이트
      const realIndex = scrollIndex - 1;
      if (realIndex >= 0 && realIndex < imageCount && realIndex !== carouselIndex) {
        setCarouselIndex(realIndex);
      }
    }
  }, [hasMultipleImages, imageCount, carouselIndex, isCarouselTransitioning]);

  // 스크롤 종료 감지 (scrollend 이벤트)
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || !hasMultipleImages) return;

    const handleScrollEnd = () => {
      handleCarouselScroll();
    };

    carousel.addEventListener('scrollend', handleScrollEnd);
    return () => carousel.removeEventListener('scrollend', handleScrollEnd);
  }, [hasMultipleImages, handleCarouselScroll]);

  // 리뷰 이미지 확대 뷰어 상태
  const [imageViewer, setImageViewer] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
  }>({ isOpen: false, images: [], currentIndex: 0 });

  const openImageViewer = (images: string[], index: number) => {
    setImageViewer({ isOpen: true, images, currentIndex: index });
  };

  const closeImageViewer = () => {
    setImageViewer({ isOpen: false, images: [], currentIndex: 0 });
  };

  const goToPrevImage = () => {
    setImageViewer(prev => ({
      ...prev,
      currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1
    }));
  };

  const goToNextImage = () => {
    setImageViewer(prev => ({
      ...prev,
      currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0
    }));
  };

  const toggleReviewExpand = (idx: number) => {
    setExpandedReviewIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const sortLabels = {
    newest: '최신순',
    high: '별점 높은순',
    low: '별점 낮은순'
  };

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

  // 초기 탭이 리뷰인 경우 스크롤
  useEffect(() => {
    if (initialTab === 'danawa_reviews') {
      setTimeout(() => {
        reviewTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500); // 모달 애니메이션 고려하여 충분한 딜레이
    }
  }, [initialTab]);

  // 최저가 구매하기 자동 스크롤 및 하이라이트 효과
  useEffect(() => {
    if (scrollToSellers && danawaData && danawaData.prices.length > 0) {
      // 탭을 '가격' 탭으로 보장
      setPriceTab('price');
      
      // 모달 애니메이션 완료 후 스크롤
      const timer = setTimeout(() => {
        if (sellersRef.current) {
          sellersRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setShowHighlight(true);
          
          // 1.5초 후 하이라이트 제거
          const highlightTimer = setTimeout(() => {
            setShowHighlight(false);
          }, 1500);
          
          return () => clearTimeout(highlightTimer);
        }
      }, 400);
      
      return () => clearTimeout(timer);
    }
  }, [scrollToSellers, danawaData]);

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
        backgroundColor: isExiting 
          ? 'rgba(0, 0, 0, 0)' 
          : (showHighlight ? 'rgba(0, 0, 0, 0.85)' : (showChatInput ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)'))
      }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[120] flex min-h-screen justify-center backdrop-blur-[1px]"
      onClick={showChatInput ? undefined : handleClose}
    >
      <motion.div
      initial={{ x: '100%' }}
      animate={{ x: isExiting ? '100%' : 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="relative w-full max-w-[480px] h-[100dvh] flex flex-col bg-white overflow-hidden shadow-2xl"
      style={{
        boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.1)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 모달 내부 강조용 딤 처리 (헤더/썸네일 등 포함 전체 영역) */}
      <AnimatePresence>
        {showHighlight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 z-[45] pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
          <div className="flex items-center">
            <button
              onClick={handleClose}
              className="p-1 -ml-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Thumbnail - knowledge-agent(preloadedReviews)일 때는 PDP 스타일 */}
          {preloadedReviews && preloadedReviews.length > 0 ? (
            <div className="px-4 pt-4 pb-5 border-b border-gray-100">
              {/* 이미지 캐러셀 (무한 루프) */}
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden">
                {carouselImages.length > 0 ? (
                  <>
                    {/* 스크롤 캐러셀 */}
                    <div
                      ref={carouselRef}
                      className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {extendedCarouselImages.map((img, idx) => {
                        const isClone = hasMultipleImages && (idx === 0 || idx === extendedCarouselImages.length - 1);
                        return (
                          <div
                            key={`${idx}-${img}`}
                            className="w-full h-full shrink-0 snap-center bg-gray-100"
                            style={{ scrollSnapStop: 'always' }}
                          >
                            <img
                              src={img}
                              alt={productData.product.title}
                              className="w-full h-full object-cover"
                              loading={isClone ? 'eager' : (idx <= 2 ? 'eager' : 'lazy')}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* 페이지 인디케이터 (2장 이상일 때만) */}
                    {hasMultipleImages && (
                      <div
                        className="absolute top-3 right-3 px-2 py-[2px] h-[22px] rounded-[20px] backdrop-blur-[10px] flex items-center"
                        style={{ backgroundColor: 'rgba(25, 29, 40, 0.5)' }}
                      >
                        <span className="text-white text-[12px] font-medium">
                          {carouselIndex + 1}/{imageCount}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  {productData.product.brand && (
                    <span className="text-[16px] font-medium text-gray-500">
                      {productData.product.brand}
                    </span>
                  )}

                  {(averageRating > 0 || productData.product.reviewCount > 0) && (
                    <button
                      onClick={() => {
                        setPriceTab('danawa_reviews');
                        setTimeout(() => {
                          reviewTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 150);
                        logButtonClick('브랜드_리뷰정보_클릭', 'product-modal');
                      }}
                      className="flex items-center gap-1"
                    >
                      <div className="shrink-0">
                        <Image src="/icons/ic-star.png" alt="" width={18} height={18} className="object-contain" />
                      </div>
                      <span className="text-[14px] font-semibold text-gray-800">
                        {averageRating > 0 ? averageRating.toFixed(1) : '—'}
                      </span>
                      <span className="text-[13px] font-medium text-gray-400 underline decoration-gray-400">
                        리뷰 {productData.product.reviewCount.toLocaleString()}개
                      </span>
                    </button>
                  )}
                </div>

                <h2 className="text-[16px] font-medium text-gray-800 leading-snug">
                  {productData.product.title}
                </h2>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-[18px] font-bold text-black">
                    {livePrice.loading ? (
                      <span className="text-gray-400">...</span>
                    ) : (
                      <>{(effectivePriceData?.lowestPrice || productData.product.price).toLocaleString()}원</>
                    )}
                  </div>

                  {effectivePriceData?.lowestMall && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-[20px]">
                      {(() => {
                        const priceInfo = danawaData?.prices.find(p => p.mall === effectivePriceData.lowestMall);
                        const mallLogo = priceInfo?.mallLogo || getMallLogoPath(effectivePriceData.lowestMall);

                        return mallLogo && (
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-100 bg-white flex items-center justify-center shrink-0">
                            <img
                              src={mallLogo}
                              alt={effectivePriceData.lowestMall}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        );
                      })()}
                      <span className="text-[14px] font-medium text-gray-700">
                        {effectivePriceData.lowestMall}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // 기존 스타일: 큰 썸네일
            <>
              <div className="px-4 pt-4">
                <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden">
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

                  {/* NEW: "이 상품 기반으로 재추천" button (bottom-left) */}
                  {!showChatInput && onReRecommend && (
                    <button
                      onClick={() => {
                        setShowChatInput(true);
                        logButtonClick('이 상품 기반으로 재추천', 'product-modal');
                      }}
                      className="absolute bottom-4 left-4 px-4 py-2.5 bg-white border border-purple-200 text-purple-700 text-sm font-semibold rounded-lg shadow-sm hover:bg-purple-50 transition-all flex items-center gap-2"
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
              <div className="px-4 pt-5 pb-6 border-b border-gray-100">
                {/* 브랜드 & 별점/리뷰 Row */}
                <div className="flex items-center justify-between mb-1">
                  {productData.product.brand ? (
                    <span className="text-base font-medium text-gray-500">
                      {productData.product.brand}
                    </span>
                  ) : (
                    <div />
                  )}
                  
                  {(averageRating > 0 || productData.product.reviewCount > 0) && (
                    <button
                      onClick={() => {
                        setPriceTab('danawa_reviews');
                        setTimeout(() => {
                          reviewTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 150);
                        logButtonClick('브랜드_리뷰정보_클릭', 'product-modal');
                      }}
                      className="flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-bold text-gray-900">
                        {averageRating > 0 ? averageRating.toFixed(1) : '—'}
                      </span>
                      <span className="text-sm text-gray-400 underline decoration-gray-400">
                        리뷰 {productData.product.reviewCount.toLocaleString()}개
                      </span>
                    </button>
                  )}
                </div>

                {/* 제품 타이틀 */}
                <h2 className="text-base font-medium text-gray-800 mb-4 leading-snug">
                  {productData.product.title}
                </h2>

                {/* 가격 & 최저가 몰 Row */}
                <div className="flex items-center justify-between">
                  <div className="text-[18px] font-bold text-gray-900">
                    {(danawaData?.lowestPrice || productData.product.price).toLocaleString()}원
                  </div>

                  {danawaData?.lowestMall && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-[20px]">
                      {(() => {
                        const priceInfo = danawaData.prices.find(p => p.mall === danawaData.lowestMall);
                        const mallLogo = priceInfo?.mallLogo || getMallLogoPath(danawaData.lowestMall);

                        return mallLogo && (
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-100 bg-white flex items-center justify-center shrink-0">
                            <img 
                              src={mallLogo} 
                              alt={danawaData.lowestMall}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        );
                      })()}
                      <span className="text-[14px] font-medium text-gray-700">
                        {danawaData.lowestMall}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        {/* 상품정보 | 상품리뷰 탭 (전체 너비) */}
        <div className="h-[10px] bg-gray-50 border-y border-gray-100" />
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
              className="relative"
            >
              {/* 가격 비교 */}
              <div 
                ref={sellersRef}
                className={`relative px-4 py-4 transition-all duration-500 ${
                  showHighlight 
                    ? 'z-[50] bg-white rounded-2xl mx-2 ring-2 ring-purple-500 ring-inset mt-2 shadow-md' 
                    : 'z-10'
                }`}
              >
                {/* 하이라이트 효과 레이어 (보라색 반짝임) */}
                <AnimatePresence>
                  {showHighlight && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.2, 0, 0.2, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.5, times: [0, 0.2, 0.5, 0.8, 1] }}
                      className="absolute inset-0 bg-purple-100/30 rounded-2xl z-0 pointer-events-none"
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10">
                 

                  {effectivePriceData && effectivePriceData.prices.length > 0 ? (
                  <div className="space-y-2">
                    {/* 기본 3개 표시 */}
                    {effectivePriceData.prices.slice(0, 3).map((priceInfo, index) => (
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
                        <div className="flex items-center gap-2 shrink-0">
                          {index === 0 && (
                            <span className="text-[13px] font-medium text-red-500">최대 할인</span>
                          )}
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
                          {effectivePriceData.prices.slice(3).map((priceInfo, index) => (
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
                    {effectivePriceData.prices.length > 3 && (
                      <div className="flex justify-center pt-2">
                        <button
                          onClick={() => {
                            setShowPriceComparison(!showPriceComparison);
                            logButtonClick(showPriceComparison ? '접기' : '더보기', 'product-modal');
                          }}
                          className="px-5 py-2 bg-black/60 rounded-full text-sm font-medium text-white hover:bg-gray-600 transition-colors"
                        >
                          {showPriceComparison ? '접기' : '더보기'}
                        </button>
                      </div>
                    )}
                  </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="text-gray-400 text-sm">가격 정보가 아직 업데이트 되지 않았어요. 아래 구매하기 버튼을 눌러 확인해보세요!</div>
                    </div>
                  )}
                </div>
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

                  // 피할 단점: 회피됨 → 부분회피 → 회피안됨 순서로 정렬
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

                  // 추천 이유 문장 리스트 생성
                  const recommendationSentences = [];
                  
                  // 1. 내 상황과의 적합성 설명 (있다면 첫 번째로)
                  if (initialContext && contextMatchData && contextMatchData.explanation) {
                    recommendationSentences.push(contextMatchData.explanation);
                  }
                  
                  // 2. 충족된 하드 필터들
                  hardFilterConditions.forEach(cond => {
                    if (cond.status === '충족') {
                      recommendationSentences.push(cond.evidence || cond.condition);
                    }
                  });

                  return (
                    <div className="space-y-4">
                      {/* 필수 조건 (하드 필터) - 문장 리스트 형태로 변경 */}
                      {recommendationSentences.length > 0 && (
                        <div className="-mt-6 -mx-4">
                          <div className="h-[10px] bg-gray-50 border-y border-gray-100" />
                          <div 
                            className="pt-4 px-4 pb-2" 
                            style={{ 
                              background: 'linear-gradient(180deg, #F3F0FF 0%, #FFFFFF 100%)' 
                            }}
                          >
                            <div className="flex items-center gap-2 mb-5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/ic-ai.svg" alt="" width={14} height={14} />
                              <h4 className="text-[16px] font-semibold text-[#6344FF] leading-tight">
                                왜 추천했나요?
                              </h4>
                            </div>
                            <div className="space-y-[6px] mb-2">
                              {recommendationSentences.map((sentence, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                  <span className="text-[14px] text-gray-800 shrink-0 mt-0.5">✔</span>
                                  <p className="text-[14px] font-medium text-gray-800 leading-snug">
                                    {parseMarkdownBold(sentence)}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <div className="h-px bg-gray-100 mt-2 mb-0" />
                          </div>
                        </div>
                      )}

                      {/* 주요 포인트 (선호 속성 + 피할 단점) */}
                      {(balanceConditions.length > 0 || negativeConditions.length > 0) && (
                        <div className="mt-8 space-y-4">
                          <div className="flex items-center gap-2 mb-2">
                             <span className="text-[#6344FF] text-lg">✦</span>
                             <h4 className="text-[16px] font-bold text-[#6344FF] leading-tight">
                               주요 포인트
                             </h4>
                          </div>

                          {/* 선호 속성 */}
                          {balanceConditions.length > 0 && (
                            <div className="bg-gray-50 rounded-xl p-5">
                              <h5 className="text-[15px] font-bold text-gray-900 mb-5">선호속성</h5>
                              <div className="space-y-8">
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

                                  const colonIdx = cond.condition.indexOf(':');
                                  const hasColon = colonIdx > 0 && colonIdx < cond.condition.length - 1;
                                  const questionPart = hasColon ? cond.condition.slice(0, colonIdx) : '선호 조건';
                                  const answerPart = hasColon ? cond.condition.slice(colonIdx + 1).trim() : cond.condition;

                                  return (
                                    <div key={i} className="flex flex-col gap-3">
                                      <div className="space-y-1">
                                        <div className="text-[15px] text-gray-600">
                                          <span className="font-semibold mr-1">Q.</span>
                                          {questionPart}
                                        </div>
                                        <div className="text-[15px] text-gray-900 font-bold">
                                          <span className="font-semibold mr-1 text-gray-600">A.</span>
                                          {answerPart}
                                        </div>
                                      </div>
                                      
                                      <div className="bg-gray-100 rounded-[12px] p-4">
                                        <div className="mb-2">
                                          <span className={`px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
                                            {badgeText}
                                          </span>
                                        </div>
                                        <p className="text-[14px] font-medium text-gray-700 leading-[1.55]">
                                          {parseMarkdownBold(cond.evidence)}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 피할 단점 */}
                          {negativeConditions.length > 0 && (
                            <div className="bg-gray-50 rounded-xl p-5">
                              <h5 className="text-[15px] font-bold text-gray-900 mb-5">피할 단점</h5>
                              <div className="space-y-8">
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

                                  const colonIdx = cond.condition.indexOf(':');
                                  const hasColon = colonIdx > 0 && colonIdx < cond.condition.length - 1;
                                  const questionPart = hasColon ? cond.condition.slice(0, colonIdx) : '피해야 할 점';
                                  const answerPart = hasColon ? cond.condition.slice(colonIdx + 1).trim() : cond.condition;

                                  return (
                                    <div key={i} className="flex flex-col gap-3">
                                      <div className="space-y-1">
                                        <div className="text-[15px] text-gray-600">
                                          <span className="font-semibold mr-1">Q.</span>
                                          {questionPart}
                                        </div>
                                        <div className="text-[15px] text-gray-900 font-bold">
                                          <span className="font-semibold mr-1 text-gray-600">A.</span>
                                          {answerPart}
                                        </div>
                                      </div>
                                      
                                      <div className="bg-gray-100 rounded-[12px] p-4">
                                        <div className="mb-2">
                                          <span className={`px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
                                            {badgeText}
                                          </span>
                                        </div>
                                        <p className="text-[14px] font-medium text-gray-700 leading-[1.55]">
                                          {parseMarkdownBold(cond.evidence)}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
            >
              {/* 미리 크롤링된 리뷰가 있으면 직접 표시, 없으면 DanawaReviewTab */}
              {preloadedReviews && preloadedReviews.length > 0 ? (
                (() => {
                  // 평균 별점: 메타데이터 우선, 없으면 계산
                  const calculatedAvg = preloadedReviews.reduce((sum, r) => sum + r.rating, 0) / preloadedReviews.length;
                  const avgRating = initialAverageRating ?? calculatedAvg;
                  
                  // 리뷰 개수: 메타데이터 우선, 없으면 현재 로드된 리뷰 수
                  const displayReviewCount = productData.product.reviewCount || preloadedReviews.length;
                  
                  // 별점 분포 계산 (현재 로드된 리뷰 기준)
                  const ratingDistribution = preloadedReviews.reduce((acc, review) => {
                    const rating = Math.round(review.rating);
                    if (rating >= 1 && rating <= 5) {
                      acc[rating] = (acc[rating] || 0) + 1;
                    }
                    return acc;
                  }, {} as Record<number, number>);
                  
                  const maxCount = Math.max(...Object.values(ratingDistribution), 1);
                  const totalReviews = preloadedReviews.length || 1;
                  
                  // 날짜 파싱 함수 (최신순 정렬용)
                  const parseDate = (dateStr: string | undefined): number => {
                    if (!dateStr) return 0;
                    const nums = dateStr.match(/\d+/g);
                    if (!nums || nums.length < 3) return 0;
                    const [rawY, m, d] = nums.map(Number);
                    const y = rawY < 100 ? rawY + 2000 : rawY;
                    return new Date(y, m - 1, d).getTime();
                  };

                  // 날짜 포맷팅 함수 (YY.MM.DD)
                  const formatDate = (dateStr: string | undefined): string => {
                    if (!dateStr) return '';
                    const nums = dateStr.match(/\d+/g);
                    if (!nums || nums.length < 3) return dateStr;
                    let [y, m, d] = nums;
                    const yy = y.length === 4 ? y.slice(2) : y;
                    const mm = m.padStart(2, '0');
                    const dd = d.padStart(2, '0');
                    return `${yy}.${mm}.${dd}`;
                  };

                  // 포토 리뷰 개수 확인
                  const photoReviewCount = preloadedReviews.filter(r => r.images && r.images.length > 0).length;
                  const hasPhotoReviews = photoReviewCount > 0;

                  // 정렬 및 필터링된 리뷰
                  const sortedReviews = [...preloadedReviews]
                    .filter(r => !showPhotoReviewsOnly || (r.images && r.images.length > 0))
                    .sort((a, b) => {
                      if (reviewSortOrder === 'newest') {
                        return parseDate(b.date) - parseDate(a.date);
                      }
                      if (reviewSortOrder === 'high') {
                        return b.rating - a.rating;
                      }
                      return a.rating - b.rating;
                    });

                  return (
                    <div className="pb-4 relative">
                      {/* 리뷰 요약 - 새 디자인 */}
                      <div className="px-4 pt-5 pb-0 flex items-center justify-between">
                        <h3 className="text-[18px] font-semibold text-gray-900">상품 리뷰</h3>
                        <div className="flex items-center gap-1">
                          <Image src="/icons/ic-star.png" alt="" width={18} height={18} />
                          <span className="text-[16px] font-semibold text-gray-800">{avgRating.toFixed(1)}</span>
                          <span className="text-[16px] font-semibold text-gray-800 ml-0.5">({displayReviewCount})</span>
                        </div>
                      </div>

                      {/* 필터 뱃지 */}
                      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
                        <button
                          onClick={() => setIsSortBottomSheetOpen(true)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {sortLabels[reviewSortOrder]}
                          <CaretDown size={14} />
                        </button>

                        {/* 포토 리뷰 토글 - 포토 리뷰가 있을 때만 표시 */}
                        {hasPhotoReviews && (
                          <button
                            onClick={() => setShowPhotoReviewsOnly(prev => !prev)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                              showPhotoReviewsOnly
                                ? 'bg-gray-800 text-white'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            포토 리뷰만 보기
                            {showPhotoReviewsOnly}
                          </button>
                        )}
                        {/* 블로그 후기 버튼 */}
                        <button
                          onClick={() => setShowBlogReview(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          <Image
                            src="/icons/malls/name=naver.png"
                            alt="네이버"
                            width={16}
                            height={16}
                            className="rounded-full object-cover"
                          />
                          블로그 리뷰
                        </button>
                      </div>

                      {/* 리뷰 목록 */}
                      <div className="px-4 divide-y divide-gray-200">
                        {sortedReviews.slice(0, displayedReviewsCount).map((review, idx) => (
                          <div key={idx} className="py-4">
                            {/* Row 1: Profile, Nickname, Mall */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-[22px] h-[22px] rounded-full bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                                <Image src="/icons/ic-user.png" alt="" width={22} height={22} className="object-contain" />
                              </div>
                              <span className="text-[14px] font-semibold text-gray-800 truncate">
                                {review.author || '*'.repeat(3 + (idx % 6))}
                              </span>
                              {review.mallName && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[12px] font-medium rounded-[6px] shrink-0">
                                  {review.mallName}
                                </span>
                              )}
                            </div>

                            {/* Row 2: Stars, Date */}
                            <div className="flex items-center gap-2 mb-3">
                              <div className="flex gap-0">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <Image 
                                    key={star} 
                                    src={star <= review.rating ? "/icons/ic-star.png" : "/icons/ic-star-gray.svg"} 
                                    alt="" 
                                    width={18} 
                                    height={18} 
                                    className="object-contain" 
                                  />
                                ))}
                              </div>
                              {review.date && <span className="text-[12px] font-medium text-gray-400">{formatDate(review.date)}</span>}
                            </div>

                            {/* Row 3: Photos */}
                            {review.images && review.images.length > 0 && (
                              <div className="flex gap-2.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                                {review.images.map((img, i) => (
                                  <div
                                    key={i}
                                    className="relative w-[110px] h-[110px] rounded-xl overflow-hidden shrink-0 border border-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => openImageViewer(review.images!, i)}
                                  >
                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                    {/* 여러 장일 때 개수 표시 (첫 번째 이미지에만) */}
                                    {i === 0 && review.images!.length > 1 && (
                                      <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded">
                                        1/{review.images!.length}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Row 4: Content */}
                            <div className="relative">
                              <p className={`text-[14px] font-medium text-gray-800 leading-[1.4] ${!expandedReviewIds.has(idx) ? 'line-clamp-3' : ''}`}>
                                {review.content}
                              </p>
                              {review.content.length > 120 && (
                                <button 
                                  onClick={() => toggleReviewExpand(idx)}
                                  className="mt-2 text-[14px] font-medium text-blue-500 hover:text-blue-600 transition-colors"
                                >
                                  {expandedReviewIds.has(idx) ? '접기' : '더보기'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 무한 스크롤 트리거 */}
                      {sortedReviews.length > displayedReviewsCount && (
                        <div ref={loadMoreReviewsRef} className="py-4 text-center">
                          <span className="text-[12px] text-gray-400">
                            스크롤하여 더 보기 ({displayedReviewsCount}/{sortedReviews.length})
                          </span>
                        </div>
                      )}

                      {/* 정렬 바텀시트 */}
                      <AnimatePresence>
                        {isSortBottomSheetOpen && (
                          <>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setIsSortBottomSheetOpen(false)}
                              className="fixed inset-0 bg-black/40 z-[100]"
                            />
                            <motion.div
                              initial={{ y: '100%' }}
                              animate={{ y: 0 }}
                              exit={{ y: '100%' }}
                              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                              className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-[12px] z-[101] px-4 pt-[34px] pb-8 h-[285px]"
                            >
                              <div className="flex flex-col gap-6">
                                {(['newest', 'high', 'low'] as const).map((order) => (
                                  <button
                                    key={order}
                                    onClick={() => {
                                      setReviewSortOrder(order);
                                      setIsSortBottomSheetOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between px-2 text-[16px] transition-colors"
                                  >
                                    <span className={reviewSortOrder === order ? 'text-gray-800 font-semibold' : 'text-gray-400 font-medium'}>
                                      {sortLabels[order]}
                                    </span>
                                    {reviewSortOrder === order && (
                                      <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()
              ) : (
                <DanawaReviewTab pcode={productData.product.id} fullHeight={true} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* Floating Action Buttons */}
        {!showChatInput && (
          <div className="shrink-0 w-full bg-white border-t border-gray-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-30">
            <div className="flex gap-2">
              {/* 찜하기 버튼 - 숨김 처리 */}
              {/* <button
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
              </button> */}
              {/* 최저가로 구매하기 버튼 */}
              <button
                onClick={() => {
                  logButtonClick('최저가로 구매하기', 'product-modal');
                  // pcode 기반 다나와 상품 페이지로 이동 (가격 정보 업데이트 여부 상관없이)
                  const pcode = productData.product.id;
                  const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
                  const lowestPrice = danawaData?.prices?.[0]?.price;
                  const lowestMall = danawaData?.prices?.[0]?.mall || '다나와';

                  // 가격 정보 로깅
                  logProductModalPurchaseClick(
                    productData.product.id,
                    productData.product.title,
                    lowestMall,
                    lowestPrice || productData.product.price,
                    true, // 최저가 버튼이므로 항상 true
                    'product-modal'
                  );

                  window.open(url, '_blank');
                }}
                className="flex-1 h-14 font-semibold rounded-2xl text-base transition-colors text-white bg-black hover:bg-gray-900"
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
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
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

      {/* 리뷰 이미지 확대 뷰어 */}
      <AnimatePresence>
        {imageViewer.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation(); // PDP 모달 닫힘 방지
              closeImageViewer();
            }}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeImageViewer();
              }}
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* 이미지 카운터 */}
            {imageViewer.images.length > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-[14px] font-medium">
                {imageViewer.currentIndex + 1} / {imageViewer.images.length}
              </div>
            )}

            {/* 이전 버튼 */}
            {imageViewer.images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevImage(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white/60 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            {/* 메인 이미지 */}
            <motion.div
              key={imageViewer.currentIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="max-w-[90vw] max-h-[85vh] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imageViewer.images[imageViewer.currentIndex]}
                alt=""
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </motion.div>

            {/* 다음 버튼 */}
            {imageViewer.images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goToNextImage(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white/60 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}

            {/* 하단 썸네일 (3장 이상일 때) */}
            {imageViewer.images.length > 2 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {imageViewer.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setImageViewer(prev => ({ ...prev, currentIndex: i })); }}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                      i === imageViewer.currentIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-75'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 블로그 후기 바텀시트 */}
      <AnimatePresence>
        {showBlogReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={() => setShowBlogReview(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] h-[95vh] bg-white rounded-t-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold text-gray-900">블로그 리뷰</span>
                </div>
                <button
                  onClick={() => setShowBlogReview(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 블로그 검색 iframe */}
              <iframe
                ref={blogIframeRef}
                src={`https://m.blog.naver.com/SectionPostSearch.naver?orderType=sim&searchValue=${encodeURIComponent(productData.product.title || '')}`}
                className="w-full h-[calc(95vh-52px)]"
                style={{ border: 'none' }}
                title="네이버 블로그 검색"
                onLoad={() => {
                  if (blogInitialLoadRef.current) {
                    blogInitialLoadRef.current = false;
                  } else {
                    setBlogHasNavigated(true);
                  }
                }}
              />

              {/* 뒤로가기 플로팅 버튼 */}
              <button
                onClick={() => {
                  if (blogHasNavigated && blogIframeRef.current) {
                    // 리스트 화면으로 복귀
                    const searchUrl = `https://m.blog.naver.com/SectionPostSearch.naver?orderType=sim&searchValue=${encodeURIComponent(productData.product.title || '')}`;
                    blogIframeRef.current.src = searchUrl;
                    setBlogHasNavigated(false);
                    blogInitialLoadRef.current = true;
                  } else {
                    // 바텀시트 닫기
                    setShowBlogReview(false);
                    setBlogHasNavigated(false);
                    blogInitialLoadRef.current = true;
                  }
                }}
                className="absolute bottom-12 left-4 w-12 h-12 bg-black/70 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-black/80 transition-colors z-20"
                aria-label="뒤로가기"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
