'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { ScoredProduct, ProductVariant, AnalysisTimeline } from '@/types/recommend-v2';
import type { Recommendation } from '@/types';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import ProductDetailModal from '@/components/ProductDetailModal';
import { logButtonClick, logV2ProductModalOpened, /* logFavoriteAction, */ logV2RecommendationReceived, logProductModalPurchaseClick } from '@/lib/logging/clientLogger';
// import { useFavorites } from '@/hooks/useFavorites'; // 찜하기 기능 비활성화
import { useDanawaPrices } from '@/hooks/useDanawaPrices';
import { useRealReviewsCache } from '@/hooks/useRealReviewsCache';
import { RealReviewsContent } from './RealReviewsContent';
import { AnalysisTimeline as AnalysisTimelineComponent } from './AnalysisTimeline';
// import Toast from '@/components/Toast'; // 찜하기 기능 비활성화

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

// SessionStorage 키 prefix (비교표 분석 데이터 캐싱용)
// NOTE: 카테고리별로 별도 캐시를 유지하기 위해 categoryKey를 포함한 키 사용
const V2_COMPARISON_CACHE_PREFIX = 'v2_comparison_analysis';
const V2_PRODUCT_ANALYSIS_CACHE_PREFIX = 'v2_product_analysis';
const V2_REVIEW_INSIGHTS_CACHE_PREFIX = 'v2_review_insights';

// 리뷰 키워드 인사이트 타입
interface ReviewInsight {
  criteriaId: string;
  criteriaName: string;
  totalMentions: number;
  positiveRatio: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  topSample: string | null;
  reviewMetadata?: {
    author: string | null;
    review_date: string | null;
    helpful_count: number;
    rating: number;
    originalIndex: number;
  };
}

interface ProductReviewInsights {
  reviewCount: number;
  insights: ReviewInsight[];
}

// LLM 평가 결과 타입 (현재 미사용 - reviewInsights 시스템으로 대체됨)
// interface SelectedTagEvaluation {
//   userTag: string;
//   tagType: 'pros' | 'cons';
//   priority: number;
//   status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
//   evidence: string;
//   citations: number[];
//   tradeoff?: string;
// }


// criteriaId별 하이라이트 키워드 (리뷰에서 해당 키워드를 강조 - fallback용)
const CRITERIA_KEYWORDS: Record<string, string[]> = {
  // formula_maker
  cleaning_frequency: ['세척', '청소', '깔때기', '분유통', '위생', '귀찮', '번거'],
  accuracy: ['농도', '용량', '정확', '오차', '일정'],
  noise: ['소음', '시끄럽', '조용', '새벽', '소리'],
  durability_parts: ['깔때기', '플라스틱', '마모', '파손', '고장', '교체', '내구'],
  ease_of_use: ['조립', '뻑뻑', '힘듦', '어려움', '사용법', '설정', '버튼'],
  
  // stroller
  actual_folding_and_unfolding_ease: ['폴딩', '접이', '펼치', '한손', '요령', '접기'],
  actual_seat_angle_and_comfort: ['시트', '등받이', '각도', '90도', '착석', '편안'],
  durability_of_materials: ['손잡이', '안전바', '마감', '재질', '내구'],
  actual_weight_vs_perceived_weight: ['무게', '무겁', '가볍', '들기', '휴대'],
  maneuverability_on_various_terrains: ['요철', '턱', '핸들링', '주행', '바퀴'],
  
  // car_seat
  ease_of_seatbelt_buckling: ['버클', '채결', '안전벨트', '잠금'],
  isofix_installation_stability: ['아이소픽스', 'ISOFIX', '설치', '장착', '고정'],
  fabric_breathability: ['통풍', '땀', '시원', '메쉬', '쿨링'],
  
  // baby_bottle
  ease_of_cleaning: ['세척', '씻기', '분해', '깨끗'],
  nipple_acceptance: ['젖꼭지', '물림', '거부', '적응'],
  anti_colic_performance: ['배앓이', '공기', '가스', '소화'],
  
  // milk_powder_port
  temperature_accuracy: ['온도', '정확', '보온', '유지'],
  heating_speed: ['가열', '끓이', '빠르'],
  
  // nasal_aspirator
  suction_power_control: ['흡입', '세기', '조절'],
  child_acceptance: ['거부', '무섭', '울음'],
  
  // thermometer
  accuracy_reliability: ['정확', '오차', '체온', '신뢰'],
};

// LLM 하이라이팅 결과 파싱 (마크다운 볼드 → 하이라이트 스타일)
function parseHighlightedReview(text: string, sentiment: 'positive' | 'neutral' | 'negative'): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  // sentiment에 따라 형광펜 색상 결정
  const highlightClass = sentiment === 'positive'
    ? 'bg-green-100/60 text-green-900'
    : sentiment === 'negative'
    ? 'bg-red-100/60 text-red-900'
    : 'bg-yellow-100/60 text-gray-900';

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const highlightedText = part.slice(2, -2);
      return (
        <span key={index} className={`${highlightClass} px-0.5 rounded-sm`}>
          {highlightedText}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// 리뷰 텍스트에서 키워드를 하이라이트하는 함수 (fallback용)
function highlightKeywords(text: string, criteriaId: string): React.ReactNode {
  const keywords = CRITERIA_KEYWORDS[criteriaId] || [];
  if (keywords.length === 0) return text;

  // 키워드를 정규식 패턴으로 변환 (대소문자 무시)
  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some(k => part.toLowerCase().includes(k.toLowerCase()));
    return isKeyword ? (
      <strong key={index} className="text-amber-900 font-bold">{part}</strong>
    ) : (
      <span key={index}>{part}</span>
    );
  });
}

// ReviewCard 컴포넌트 (리뷰 하이라이트 카드)
function ReviewCard({ insight }: { insight: ReviewInsight }) {
  // 날짜 포맷팅 (상대 시간)
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 1) return '오늘';
      if (diffDays < 7) return `${diffDays}일 전`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
      return `${Math.floor(diffDays / 365)}년 전`;
    } catch {
      return null;
    }
  };

  // 별점 렌더링 (별 1개 + 숫자)
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0">
        <svg
          className="w-3 h-3 text-yellow-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span className="text-[10px] font-semibold text-gray-900">{rating}</span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 transition-colors">
      {/* 상단: 체감속성 태그 */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold mb-2 ${
          insight.sentiment === 'positive'
            ? 'bg-green-100 text-green-700'
            : insight.sentiment === 'negative'
            ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-700'
        }`}
      >
        {insight.sentiment === 'positive' ? '👍' : insight.sentiment === 'negative' ? '👎' : '💬'}
        {' '}{insight.criteriaName}
      </span>

      {/* 별점/닉네임/날짜 한 줄 (메타데이터 있을 때만) */}
      {insight.reviewMetadata && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-gray-500">
          {/* 별점 */}
          {renderStars(insight.reviewMetadata.rating)}

          {/* 구분자 */}
          <span className="text-gray-300">•</span>

          {/* 닉네임 (있으면) */}
          {insight.reviewMetadata.author && (
            <>
              <span className="text-gray-400">{insight.reviewMetadata.author}</span>
              <span className="text-gray-300">•</span>
            </>
          )}

          {/* 날짜 */}
          {insight.reviewMetadata.review_date && (
            <span className="text-gray-400">
              {formatDate(insight.reviewMetadata.review_date)}
            </span>
          )}
        </div>
      )}

      {/* 발췌문 */}
      <p className="text-xs text-gray-700 leading-relaxed">
        {parseHighlightedReview(insight.topSample || '', insight.sentiment)}
      </p>
    </div>
  );
}

// Extended product type with LLM recommendation reason + variants
interface RecommendedProduct extends ScoredProduct {
  recommendationReason?: string;
  matchedPreferences?: string[];
  // LLM 정제된 태그 (refine-tags API 결과)
  refinedTags?: string[];
  // 옵션/변형 정보 (그룹핑)
  variants?: ProductVariant[];
  optionCount?: number;
  priceRange?: {
    min: number | null;
    max: number | null;
  };
}

// V2 조건 충족도 평가 항목 타입
interface ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
  evidence: string;
  tradeoff?: string;
}

// Product analysis data from LLM
interface ProductAnalysisData {
  pcode: string;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations: number[] }>;
  selectedConditionsEvaluation?: ConditionEvaluation[];  // V2 조건 충족도 평가
}

// User context for API calls
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
  // Rule key / value → Korean label mappings (for display)
  balanceLabels?: Record<string, string>;
  negativeLabels?: Record<string, string>;
  hardFilterLabels?: Record<string, string>;
  // Filter conditions for product-specific matching
  hardFilterDefinitions?: Record<string, Record<string, unknown>>;
  // Hard filter questions config (for filtering review_priorities type)
  hardFilterConfig?: {
    questions: Array<{
      id: string;
      type: 'single' | 'multi' | 'review_priorities';
      question: string;
      options: Array<{ id: string; text: string; [key: string]: unknown }>;
    }>;
  };
  // Budget range
  budget?: { min: number; max: number };
}

interface ResultCardsProps {
  products: RecommendedProduct[];
  categoryName: string;
  categoryKey?: string;
  selectionReason?: string;  // LLM이 생성한 전체 선정 기준
  userContext?: UserContext;  // 사용자 선택 컨텍스트 (API용)
  onModalOpenChange?: (isOpen: boolean) => void;  // 상품 모달 열림/닫힘 상태 콜백
  onViewFavorites?: () => void;  // 찜 목록 모달로 열기 위한 콜백
  onRestrictToBudget?: () => void;  // 예산 내 제품만 보기 재추천 콜백
  analysisTimeline?: AnalysisTimeline;  // 분석 타임라인 (AI 분석 과정)
}

/**
 * TOP 3 추천 결과 카드 컴포넌트 (개선 버전)
 * - 상품별 매칭된 선호 항목 태그
 * - 다나와 최저가
 * - 상세 모달
 * - 비교표 + AI 장단점
 * - 백그라운드 LLM 분석 (PDP 모달 + 비교표)
 */
// 스트리밍 텍스트 컴포넌트 (글자가 하나씩 나타남)
function StreamingText({ content, speed = 15, onComplete }: { content: string; speed?: number; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!content) {
      if (onComplete) onComplete();
      return;
    }

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, speed, onComplete]);

  return <span className="whitespace-pre-wrap">{displayedContent}</span>;
}

export function ResultCards({ products, categoryName, categoryKey, selectionReason, userContext, onModalOpenChange, onViewFavorites, onRestrictToBudget, analysisTimeline }: ResultCardsProps) {
  // Favorites management (비활성화)
  // const { toggleFavorite, isFavorite, count: favoritesCount } = useFavorites();
  // const [showToast, setShowToast] = useState(false);
  // const [toastType, setToastType] = useState<'add' | 'remove'>('add');

  // 예산 내 제품만 보기 버튼 클릭 상태 (한 번 클릭하면 숨김)
  const [budgetButtonClicked, setBudgetButtonClicked] = useState(false);

  // 제품 목록이 변경되면 버튼 상태 리셋 (다른 추천 결과 or 다른 카테고리)
  const productKey = useMemo(() =>
    products.map(p => p.pcode).sort().join(','),
    [products]
  );

  useEffect(() => {
    // 제품 목록이 변경되면 버튼 클릭 상태 초기화
    setBudgetButtonClicked(false);
  }, [productKey]);

  // Danawa price/spec/review data (공통 훅 사용)
  // variant pcodes도 포함하여 옵션 드롭다운에서 다나와 최저가 표시 가능하게 함
  const pcodes = useMemo(() => {
    const mainPcodes = products.map(p => p.pcode);
    const variantPcodes = products.flatMap(p =>
      (p as RecommendedProduct).variants?.map(v => v.pcode) || []
    );
    return [...new Set([...mainPcodes, ...variantPcodes])];
  }, [products]);
  const { danawaData, danawaSpecs, reviewData } = useDanawaPrices(pcodes);

  // 옵션 드롭다운용 다나와 최저가 매핑 (pcode -> lowest_price)
  const variantDanawaLowestPrices = useMemo(() => {
    const mapping: Record<string, number> = {};
    for (const [pcode, data] of Object.entries(danawaData)) {
      if (data?.lowest_price && data.lowest_price > 0) {
        mapping[pcode] = data.lowest_price;
      }
    }
    return mapping;
  }, [danawaData]);

  // Comparison table states
  // NOTE: setComparisonFeatures 비활성화 - 기준제품 기능 비활성화로 미사용
  const [comparisonFeatures] = useState<Record<string, string[]>>({});
  const [comparisonDetails, setComparisonDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }>>({});
  const [normalizedSpecs, setNormalizedSpecs] = useState<Array<{ key: string; values: Record<string, string | null> }>>([]);

  // Background LLM analysis states
  const [productAnalysisData, setProductAnalysisData] = useState<Record<string, ProductAnalysisData>>({});
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [isComparisonLoading, setIsComparisonLoading] = useState(true);
  const analysisCalledRef = useRef(false);

  // Real reviews (Gemini Grounding) - 캐시 훅 사용
  const {
    data: realReviewsData,
    fetchReviews: fetchRealReviews,
    refetch: refetchRealReviews,
    prefetch: prefetchRealReviews,
    isLoading: isReviewsLoading,
  } = useRealReviewsCache();
  const [showRealReviewsModal, setShowRealReviewsModal] = useState(false);
  const [selectedRealReviewPcode, setSelectedRealReviewPcode] = useState<string | null>(null);

  // Product detail modal
  const [selectedProduct, setSelectedProduct] = useState<Recommendation | null>(null);
  const [selectedProductVariants, setSelectedProductVariants] = useState<ProductVariant[]>([]);
  const [selectedProductDanawa, setSelectedProductDanawa] = useState<{
    lowestPrice: number;
    lowestMall: string;
    productName: string;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
  } | undefined>(undefined);

  // Anchor product for comparison (별도 기준제품 - TOP 3와 별개)
  const [anchorProduct, setAnchorProduct] = useState<{
    productId: string;
    브랜드: string;
    모델명: string;
    최저가: number | null;
    썸네일: string | null;
  } | null>(null);
  const anchorFetchedRef = useRef(false);
  const preloadedImagesRef = useRef<Set<string>>(new Set());

  // 리뷰 키워드 인사이트 상태 (체감속성 기반)
  const [reviewInsights, setReviewInsights] = useState<Record<string, ProductReviewInsights>>({});
  const [isReviewInsightsLoading, setIsReviewInsightsLoading] = useState(false);
  const reviewInsightsFetchedRef = useRef(false);

  // LLM 하이라이팅은 이제 /api/v2/review-keywords에서 topSample에 포함되어 반환됨

  // PDP용 이미지 Preload (PLP → PDP 전환 시 로딩 최적화)
  useEffect(() => {
    if (products.length === 0) return;

    const addedLinks: HTMLLinkElement[] = [];

    // TOP 3 제품의 원본 이미지를 미리 로드
    products.slice(0, 3).forEach(product => {
      if (product.thumbnail && !preloadedImagesRef.current.has(product.thumbnail)) {
        preloadedImagesRef.current.add(product.thumbnail);

        // 방법 1: link preload (브라우저 우선순위 높음)
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = product.thumbnail;
        document.head.appendChild(link);
        addedLinks.push(link);

        // 방법 2: Image 객체로 캐시에 로드 (fallback)
        const img = new window.Image();
        img.src = product.thumbnail;
      }
    });

    // Cleanup: 컴포넌트 언마운트 시 preload link 제거
    return () => {
      addedLinks.forEach(link => link.remove());
    };
  }, [products]);

  // 리뷰 키워드 인사이트 fetch (체감속성 기반)
  useEffect(() => {
    if (!categoryKey || products.length === 0 || reviewInsightsFetchedRef.current) return;

    // 체감속성(review_priorities 타입)만 필터링하고 criteriaId와 레이블 추출
    const selectedCriteria: Array<{ id: string; label: string }> = [];
    console.log('🔍 [ReviewInsights] hardFilterConfig:', userContext?.hardFilterConfig);
    console.log('🔍 [ReviewInsights] hardFilterAnswers:', userContext?.hardFilterAnswers);

    if (userContext?.hardFilterAnswers && userContext?.hardFilterConfig?.questions) {
      // review_priorities 타입 질문만 필터링
      const reviewPriorityQuestions = userContext.hardFilterConfig.questions.filter(
        q => q.type === 'review_priorities'
      );

      console.log('🔍 [ReviewInsights] reviewPriorityQuestions:', reviewPriorityQuestions.map(q => q.id));

      for (const question of reviewPriorityQuestions) {
        const selectedValues = userContext.hardFilterAnswers[question.id];
        if (selectedValues && selectedValues.length > 0) {
          for (const value of selectedValues) {
            const label = userContext.hardFilterLabels?.[value] || value;
            console.log(`🔍 [ReviewInsights] Question ${question.id}, Value "${value}" → label: "${label}"`);
            selectedCriteria.push({ id: value, label });
          }
        }
      }
    }

    console.log('🔍 [ReviewInsights] selectedCriteria:', selectedCriteria);

    // 선택된 체감속성이 없으면 fetch 안 함
    if (selectedCriteria.length === 0) {
      console.log('⚠️ [ReviewInsights] No review_priorities selected, skipping fetch');
      return;
    }

    reviewInsightsFetchedRef.current = true;

    const fetchReviewInsights = async () => {
      setIsReviewInsightsLoading(true);
      try {
        const pcodeList = products.slice(0, 3).map(p => p.pcode);
        const criteriaIds = selectedCriteria.map(c => c.id).sort();

        // 캐시 키 생성 (categoryKey + pcodes + criteriaIds)
        const cacheKey = `${V2_REVIEW_INSIGHTS_CACHE_PREFIX}_${categoryKey}_${pcodeList.sort().join('_')}_${criteriaIds.join('_')}`;

        // 캐시 확인
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.data) {
              setReviewInsights(parsed.data);
              setIsReviewInsightsLoading(false);
              console.log('✅ [ReviewInsights] Loaded from cache:', cacheKey);
              return;
            }
          }
        } catch (e) {
          console.warn('[ReviewInsights] Failed to load from cache:', e);
        }

        console.log('🔄 [ReviewInsights] Fetching from API for', categoryKey, pcodeList, 'criteria:', selectedCriteria);

        const response = await fetch('/api/v2/review-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            pcodes: pcodeList,
            criteria: selectedCriteria, // { id, label } 배열
          }),
        });

        const result = await response.json();
        console.log('📦 [ReviewInsights] API response:', result);

        if (result.success && result.data && Object.keys(result.data).length > 0) {
          setReviewInsights(result.data);

          // 캐시에 저장
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: result.data,
              timestamp: Date.now(),
            }));
            console.log('💾 [ReviewInsights] Saved to cache:', cacheKey);
          } catch (e) {
            console.warn('[ReviewInsights] Failed to save to cache:', e);
          }

          console.log('✅ [ResultCards] Review insights loaded (LLM-based):', Object.keys(result.data).length, 'products');
          
          // 🆕 어드민용 리뷰 하이라이트 로깅 (reviewInsights를 highlightedReviews 형식으로 변환)
          try {
            const highlightedReviews = products.slice(0, 3).map((product, index) => {
              const productInsights = result.data[product.pcode];
              if (!productInsights?.insights || productInsights.insights.length === 0) {
                return null;
              }
              return {
                pcode: product.pcode,
                productTitle: product.title,
                rank: index + 1,
                reviews: productInsights.insights.slice(0, 3).map((insight: { criteriaId: string; criteriaName: string; topSample: string | null }) => ({
                  criteriaId: insight.criteriaId,
                  criteriaName: insight.criteriaName,
                  originalText: insight.topSample || '',
                  excerpt: insight.topSample || '',
                })),
              };
            }).filter(Boolean) as Array<{
              pcode: string;
              productTitle: string;
              rank: number;
              reviews: Array<{ criteriaId: string; criteriaName: string; originalText: string; excerpt: string }>;
            }>;

            if (highlightedReviews.length > 0 && categoryKey) {
              logV2RecommendationReceived(
                categoryKey,
                categoryName,
                products.slice(0, 3).map((p, i) => ({
                  pcode: p.pcode,
                  title: p.title,
                  brand: p.brand || undefined,
                  rank: i + 1,
                  price: p.price || undefined,
                  score: p.totalScore,
                  tags: p.matchedRules,
                  reason: (p as { recommendationReason?: string }).recommendationReason,
                })),
                undefined, // selectionReason은 이미 로깅됨
                0,
                undefined,
                highlightedReviews
              );
              console.log('✅ [ReviewInsights] Logged highlightedReviews for admin:', highlightedReviews.length, 'products');
            }
          } catch (logError) {
            console.warn('[ReviewInsights] Failed to log highlightedReviews:', logError);
          }
        } else {
          console.log('⚠️ [ReviewInsights] No data returned or empty');
        }
      } catch (error) {
        console.error('[ResultCards] Failed to fetch review insights:', error);
      } finally {
        setIsReviewInsightsLoading(false);
      }
    };

    fetchReviewInsights();
  }, [categoryKey, products, userContext?.hardFilterAnswers]);

  // 디폴트 기준제품 자동 설정 (rank 1위 상품)
  useEffect(() => {
    if (!categoryKey || anchorProduct || anchorFetchedRef.current) return;

    const fetchDefaultAnchor = async () => {
      anchorFetchedRef.current = true;
      try {
        const response = await fetch(`/api/v2/anchor-products?categoryKey=${categoryKey}&limit=1`);
        const data = await response.json();

        if (data.success && data.products && data.products.length > 0) {
          const topProduct = data.products[0];
          setAnchorProduct({
            productId: topProduct.productId,
            브랜드: topProduct.브랜드,
            모델명: topProduct.모델명,
            최저가: topProduct.최저가,
            썸네일: topProduct.썸네일,
          });
          console.log('✅ [ResultCards] Default anchor set:', topProduct.브랜드, topProduct.모델명);
        }
      } catch (error) {
        console.error('[ResultCards] Failed to fetch default anchor:', error);
      }
    };

    fetchDefaultAnchor();
  }, [categoryKey, anchorProduct]);

  // NOTE: 기준제품 기능 임시 비활성화 (버그 많음)
  // Handle anchor product change
  // const handleAnchorChange = (newAnchor: typeof anchorProduct) => {
  //   if (newAnchor) {
  //     setAnchorProduct(newAnchor);
  //     // 새 앵커 제품 데이터만 제거 (기존 TOP 3 데이터는 유지)
  //     const newAnchorId = String(newAnchor.productId);
  //     setComparisonDetails(prev => {
  //       const updated = { ...prev };
  //       delete updated[newAnchorId];
  //       return updated;
  //     });
  //     setComparisonFeatures(prev => {
  //       const updated = { ...prev };
  //       delete updated[newAnchorId];
  //       return updated;
  //     });
  //     logButtonClick(`기준제품_변경완료_${newAnchor.브랜드}_${newAnchor.모델명}`, 'v2-result');
  //   }
  // };

  // NOTE: Danawa prices/specs/review는 useDanawaPrices 훅에서 자동 로드

  // 캐시 키 생성 함수 (메모이제이션)
  const getCacheKey = useMemo(() => {
    if (products.length === 0 || !categoryKey) return null;
    const productIds = products.slice(0, 3).map(p => p.pcode).sort().join('_');
    return `${categoryKey}_${productIds}`;
  }, [products, categoryKey]);

  // 이전 캐시키 저장 (카테고리/제품 변경 감지용)
  const prevCacheKeyRef = useRef<string | null>(null);
  // anchor comparison API 호출 중복 방지용 ref
  const anchorComparisonCalledRef = useRef<string | null>(null);

  // 카테고리 또는 제품이 변경되면 refs 리셋
  useEffect(() => {
    const currentCacheKey = getCacheKey;
    if (prevCacheKeyRef.current !== null && prevCacheKeyRef.current !== currentCacheKey) {
      // 캐시 키가 변경됨 → refs 리셋
      console.log('🔄 [ResultCards] Cache key changed, resetting refs:', prevCacheKeyRef.current, '→', currentCacheKey);
      analysisCalledRef.current = false;
      anchorComparisonCalledRef.current = null;  // anchor comparison ref도 리셋
      // 상태도 리셋
      setProductAnalysisData({});
      setComparisonDetails({});
      setIsAnalysisLoading(true);
      setIsComparisonLoading(true);
    }
    prevCacheKeyRef.current = currentCacheKey;
  }, [getCacheKey]);

  // Background LLM analysis (product analysis + comparison analysis) with sessionStorage caching
  useEffect(() => {
    // getCacheKey가 null이면 products.length === 0 || !categoryKey 중 하나
    if (!getCacheKey || analysisCalledRef.current) return;

    const cacheKey = getCacheKey;

    // 캐시 확인 (매번 체크 - sessionStorage 읽기는 동기적이고 빠름)
    // NOTE: cacheCheckedRef 제거 - React StrictMode/re-render 시 캐시 스킵 버그 수정
    let cachedComparison: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }> | null = null;
    let cachedNormalizedSpecs: Array<{ key: string; values: Record<string, string | null> }> | null = null;
    let cachedProductAnalysis: Record<string, ProductAnalysisData> | null = null;

    try {
      // 카테고리별 캐시 키 사용 (다른 카테고리 캐시와 충돌 방지)
      const comparisonStorageKey = `${V2_COMPARISON_CACHE_PREFIX}_${cacheKey}`;
      const comparisonCache = sessionStorage.getItem(comparisonStorageKey);
      if (comparisonCache) {
        const parsed = JSON.parse(comparisonCache);
        if (parsed.data) {
          cachedComparison = parsed.data;
          cachedNormalizedSpecs = parsed.normalizedSpecs || null;
          console.log('✅ [ResultCards] Comparison analysis loaded from cache:', comparisonStorageKey);
          if (cachedNormalizedSpecs) {
            console.log(`🎯 [ResultCards] Normalized specs loaded from cache: ${cachedNormalizedSpecs.length} rows`);
          }
        }
      }

      const productAnalysisStorageKey = `${V2_PRODUCT_ANALYSIS_CACHE_PREFIX}_${cacheKey}`;
      const productAnalysisCache = sessionStorage.getItem(productAnalysisStorageKey);
      if (productAnalysisCache) {
        const parsed = JSON.parse(productAnalysisCache);
        if (parsed.data) {
          cachedProductAnalysis = parsed.data;
          console.log('✅ [ResultCards] Product analysis loaded from cache:', productAnalysisStorageKey);
        }
      }
    } catch (e) {
      console.warn('[ResultCards] Failed to load from cache:', e);
    }

    // 둘 다 캐시가 있으면 API 호출 스킵
    if (cachedComparison && cachedProductAnalysis) {
      setComparisonDetails(cachedComparison);
      if (cachedNormalizedSpecs) {
        setNormalizedSpecs(cachedNormalizedSpecs);
      }
      setProductAnalysisData(cachedProductAnalysis);
      setIsComparisonLoading(false);
      setIsAnalysisLoading(false);
      analysisCalledRef.current = true;
      console.log('💾 [ResultCards] Both analyses loaded from cache, skipping API');
      return;
    }

    // NOTE: analysisCalledRef.current는 fetchBackgroundAnalysis 내부에서 설정
    // setTimeout이 cleanup되면 API가 호출되지 않으므로, ref는 실제 실행 시에만 true로 설정

    const fetchBackgroundAnalysis = async () => {
      // API 실제 호출 시점에 ref 설정 (cleanup으로 인한 미호출 방지)
      analysisCalledRef.current = true;
      console.log('🔄 [ResultCards] Fetching analysis from API (cache miss)');
      // Prepare product info for API calls (spec + filter_attrs 포함)
      const productInfos = products.slice(0, 3).map(p => ({
        pcode: p.pcode,
        title: p.title,
        brand: p.brand,
        price: p.price,
        spec: p.spec,
        filter_attrs: (p as ScoredProduct & { filter_attrs?: Record<string, unknown> }).filter_attrs,
        rank: p.rank,
      }));

      // Call APIs only for missing data
      const promises: Promise<unknown>[] = [];

      // Product analysis API (if not cached)
      if (!cachedProductAnalysis) {
        promises.push(
          fetch('/api/v2/product-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey,
              products: productInfos,
              userContext: userContext || {},
            }),
          }).then(res => res.json()).catch(err => {
            console.error('[ResultCards] Product analysis API error:', err);
            return { success: false, type: 'product' };
          }).then(result => ({ ...result, type: 'product' }))
        );
      } else {
        // 캐시된 데이터 사용
        setProductAnalysisData(cachedProductAnalysis);
        setIsAnalysisLoading(false);
      }

      // Comparison analysis API (if not cached)
      if (!cachedComparison) {
        promises.push(
          fetch('/api/v2/comparison-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey,
              products: productInfos,
            }),
          }).then(res => res.json()).catch(err => {
            console.error('[ResultCards] Comparison analysis API error:', err);
            return { success: false, type: 'comparison' };
          }).then(result => ({ ...result, type: 'comparison' }))
        );
      } else {
        // 캐시된 데이터 사용
        setComparisonDetails(cachedComparison);
        setIsComparisonLoading(false);
      }

      if (promises.length === 0) return;

      // Wait for all APIs
      const results = await Promise.all(promises);

      for (const result of results) {
        const typedResult = result as { success: boolean; type: string; data?: unknown };

        if (typedResult.type === 'product' && typedResult.success) {
          const data = typedResult.data as { analyses: ProductAnalysisData[]; generated_by: string };
          if (data?.analyses) {
            const analysisMap: Record<string, ProductAnalysisData> = {};
            data.analyses.forEach((analysis: ProductAnalysisData) => {
              analysisMap[analysis.pcode] = analysis;
            });
            setProductAnalysisData(analysisMap);

            // SessionStorage에 캐싱 (카테고리별 별도 키 사용)
            try {
              const productAnalysisStorageKey = `${V2_PRODUCT_ANALYSIS_CACHE_PREFIX}_${cacheKey}`;
              sessionStorage.setItem(productAnalysisStorageKey, JSON.stringify({
                data: analysisMap,
                timestamp: Date.now(),
              }));
              console.log('💾 [ResultCards] Product analysis saved to cache:', productAnalysisStorageKey);
            } catch (e) {
              console.warn('[ResultCards] Failed to cache product analysis:', e);
            }

            console.log(`✅ [ResultCards] Product analysis loaded (${data.generated_by}):`, Object.keys(analysisMap).length, 'products');
          }
          setIsAnalysisLoading(false);
        }

        if (typedResult.type === 'comparison' && typedResult.success) {
          const data = typedResult.data as {
            productDetails: Record<string, { pros: string[]; cons: string[]; comparison: string }>;
            normalizedSpecs?: Array<{ key: string; values: Record<string, string | null> }>;
            generated_by: string;
          };
          if (data?.productDetails) {
            setComparisonDetails(data.productDetails);

            // normalizedSpecs가 있으면 저장
            if (data.normalizedSpecs && data.normalizedSpecs.length > 0) {
              setNormalizedSpecs(data.normalizedSpecs);
              console.log(`🎯 [ResultCards] Normalized specs loaded: ${data.normalizedSpecs.length} rows`);
            }

            // SessionStorage에 캐싱 (카테고리별 별도 키 사용)
            try {
              const comparisonStorageKey = `${V2_COMPARISON_CACHE_PREFIX}_${cacheKey}`;
              sessionStorage.setItem(comparisonStorageKey, JSON.stringify({
                data: data.productDetails,
                normalizedSpecs: data.normalizedSpecs || [],
                timestamp: Date.now(),
              }));
              console.log('💾 [ResultCards] Comparison analysis saved to cache:', comparisonStorageKey);
            } catch (e) {
              console.warn('[ResultCards] Failed to cache comparison analysis:', e);
            }

            console.log(`✅ [ResultCards] Comparison analysis loaded (${data.generated_by}):`, Object.keys(data.productDetails).length, 'products');
          }
          setIsComparisonLoading(false);
        }
      }

      // API 호출 후에도 결과가 없으면 로딩 상태 해제
      setIsAnalysisLoading(false);
      setIsComparisonLoading(false);
    };

    // 추천 완료 즉시 백그라운드 분석 시작 (지연 없음)
    // (캐시가 있으면 이미 위에서 return되었으므로 API 호출 시에만 실행됨)
    fetchBackgroundAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCacheKey, userContext]);

  // Prefetch real-reviews for TOP 3 products (background)
  const realReviewsPrefetchedRef = useRef(false);
  useEffect(() => {
    if (products.length === 0 || realReviewsPrefetchedRef.current) return;
    realReviewsPrefetchedRef.current = true;

    console.log('🔄 [ResultCards] Prefetching real-reviews for TOP 3...');
    prefetchRealReviews(
      products.slice(0, 3).map(p => ({
        pcode: p.pcode,
        title: p.title,
        brand: p.brand || undefined,
      }))
    );
  }, [products, prefetchRealReviews]);

  // Fetch comparison data for anchor product (if not in Top 3)
  useEffect(() => {
    if (!anchorProduct || !categoryKey) return;

    const anchorId = String(anchorProduct.productId);

    // 앵커가 Top 3에 포함되어 있으면 이미 comparison 데이터가 있음
    const isAnchorInTop3 = products.slice(0, 3).some(p => p.pcode === anchorId);
    if (isAnchorInTop3) return;

    // 이미 이 앵커에 대해 API 호출했으면 skip (ref 기반 중복 방지)
    if (anchorComparisonCalledRef.current === anchorId) return;

    console.log('📌 [ResultCards] Fetching comparison data for anchor product:', anchorId);
    anchorComparisonCalledRef.current = anchorId;

    const fetchAnchorComparison = async () => {
      try {
        // 비교를 위해 Top 3 중 하나와 함께 요청
        const top3Ids = products.slice(0, 3).map(p => p.pcode);
        const compareIds = [anchorId, ...top3Ids.slice(0, 1)];

        const response = await fetch('/api/v2/comparison-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            productIds: compareIds,
          }),
        });

        const result = await response.json();
        if (result.success && result.data?.productDetails) {
          // 앵커 데이터만 추가 (기존 데이터 유지)
          setComparisonDetails(prev => ({
            ...prev,
            ...result.data.productDetails,
          }));
          console.log('✅ [ResultCards] Anchor comparison loaded:', anchorId);
        }
      } catch (error) {
        console.error('[ResultCards] Failed to fetch anchor comparison:', error);
        // 실패 시 다시 시도할 수 있도록 ref 리셋
        anchorComparisonCalledRef.current = null;
      }
    };

    fetchAnchorComparison();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorProduct, categoryKey, products]);  // comparisonDetails 제거!

  // Convert ScoredProduct to Recommendation for DetailedComparisonTable
  // Include analysis data from background LLM calls
  const recommendations: Recommendation[] = useMemo(() => {
    return products.map((p, index) => {
      const analysis = productAnalysisData[p.pcode];
      return {
        product: {
          id: p.pcode,
          title: p.title,
          brand: p.brand || undefined,
          price: p.price || 0,
          reviewUrl: '',
          thumbnail: p.thumbnail || '',
          reviewCount: reviewData[p.pcode]?.reviewCount || 0,
          ranking: index + 1,
          category: 'milk_powder_port' as const,
          coreValues: {
            temperatureControl: 0,
            hygiene: 0,
            material: 0,
            usability: 0,
            portability: 0,
            priceValue: 0,
            durability: 0,
            additionalFeatures: 0,
          },
        },
        rank: (index + 1) as 1 | 2 | 3,
        finalScore: p.totalScore,
        reasoning: (p as RecommendedProduct).recommendationReason || '',
        selectedTagsEvaluation: [],
        additionalPros: analysis?.additionalPros || [],
        cons: analysis?.cons || [],
        anchorComparison: [],
        purchaseTip: analysis?.purchaseTip || [],
        citedReviews: [],
      };
    });
  }, [products, productAnalysisData, reviewData]);

  // Handle product click
  const handleProductClick = (product: ScoredProduct, index: number) => {
    logButtonClick(`제품카드_클릭_${product.brand}_${product.title}`, 'v2-result');

    // V2 specific logging
    if (categoryKey) {
      logV2ProductModalOpened(
        categoryKey,
        categoryName,
        product.pcode,
        product.title,
        product.brand || undefined,
        index + 1
      );
    }

    // Get analysis data for this product
    const analysis = productAnalysisData[product.pcode];

    // Convert to Recommendation for modal (include analysis data)
    const rec: Recommendation = {
      product: {
        id: product.pcode,
        title: product.title,
        brand: product.brand || undefined,
        price: product.price || 0,
        reviewUrl: '',
        thumbnail: product.thumbnail || '',
        reviewCount: reviewData[product.pcode]?.reviewCount || 0,
        ranking: index + 1,
        category: (categoryKey || 'milk_powder_port') as 'milk_powder_port',
        coreValues: {
          temperatureControl: 0,
          hygiene: 0,
          material: 0,
          usability: 0,
          portability: 0,
          priceValue: 0,
          durability: 0,
          additionalFeatures: 0,
        },
      },
      rank: (index + 1) as 1 | 2 | 3,
      finalScore: product.totalScore,
      reasoning: (product as RecommendedProduct).recommendationReason || '',
      selectedTagsEvaluation: [],
      additionalPros: analysis?.additionalPros || [],
      cons: analysis?.cons || [],
      anchorComparison: [],
      purchaseTip: analysis?.purchaseTip || [],
      citedReviews: [],
    };
    setSelectedProduct(rec);
    // variants 정보 저장 (RecommendedProduct에서 가져옴)
    const recommendedProduct = product as RecommendedProduct;
    setSelectedProductVariants(recommendedProduct.variants || []);
    onModalOpenChange?.(true);

    // Convert DanawaPriceData to modal format
    const danawa = danawaData[product.pcode];
    if (danawa && danawa.lowest_price) {
      setSelectedProductDanawa({
        lowestPrice: danawa.lowest_price,
        lowestMall: danawa.lowest_mall || '',
        productName: product.title,
        prices: (danawa.mall_prices || []).map(mp => ({
          mall: mp.mall,
          price: mp.price,
          delivery: mp.delivery,
          link: mp.link,
        })),
      });
    } else {
      setSelectedProductDanawa(undefined);
    }
  };

  // DEBUG: 썸네일 상태 확인 로그
  console.log('📸 [ResultCards] products thumbnail check:', products.map(p => ({
    pcode: p.pcode,
    title: p.title?.slice(0, 30),
    thumbnail: p.thumbnail,
    hasThumbnail: !!p.thumbnail,
  })));

  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">추천 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* 헤더 - 강조된 완료 메시지 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl p-2 mt-10 mb-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <h3 className="font-bold text-gray-900 text-lg">
            <StreamingText content="맞춤 추천 완료" speed={30} />
          </h3>
        </div>

      </motion.div>

      {/* AI 분석 타임라인 토글 */}
      {analysisTimeline && (
        <AnalysisTimelineComponent timeline={analysisTimeline} />
      )}

      {/* 제품 카드 목록 - result 페이지 스타일 */}
      {products.map((product, index) => {
        const danawa = danawaData[product.pcode];
        const hasLowestPrice = danawa && danawa.lowest_price && danawa.lowest_price > 0;
        // 리뷰 데이터: API 응답 우선, 없으면 product 필드에서 fallback
        const review = reviewData[product.pcode] || {
          reviewCount: product.reviewCount || 0,
          averageRating: product.averageRating || 0,
        };
        const hasReview = review.reviewCount > 0 || review.averageRating > 0;

        return (
          <motion.div
            key={product.pcode}
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.4, duration: 0.5, ease: 'easeOut' }}
            onClick={() => handleProductClick(product, index)}
            className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            {/* 찜하기 버튼 - 우상단 (비활성화) */}
            {/* <button
              onClick={(e) => {
                e.stopPropagation();
                const wasFavorite = isFavorite(product.pcode);
                toggleFavorite(product.pcode);
                const action = wasFavorite ? 'removed' : 'added';
                const newCount = wasFavorite ? favoritesCount - 1 : favoritesCount + 1;
                logFavoriteAction(action, product.pcode, product.title, newCount);
                logButtonClick(wasFavorite ? '찜취소_PLP' : '찜하기_PLP', 'v2-result');
                setToastType(wasFavorite ? 'remove' : 'add');
                setShowToast(true);
              }}
              className="absolute top-4 right-3 p-1 z-10"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isFavorite(product.pcode) ? '#FF6B6B' : '#D1D5DB'}
                stroke="none"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button> */}

            {/* 제품 정보 */}
            <div className="flex gap-3 mb-0">
              {/* 제품 썸네일 */}
              <div className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
                {product.thumbnail ? (
                  <Image
                    src={product.thumbnail}
                    alt={product.title}
                    width={112}
                    height={112}
                    className="w-full h-full object-cover"
                    priority={index < 3}
                    quality={90}
                    sizes="112px"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {/* 랭킹 배지 - 좌측 하단 */}
                <div className="absolute bottom-0 left-0 h-7 px-2 bg-gray-900 rounded-tl-none rounded-tr-xl rounded-bl-xl rounded-br-none flex items-center justify-center">
                  <span className="text-white font-semibold text-xs">
                    {index + 1}위
                  </span>
                </div>
              </div>

              {/* 제품 상세 정보 */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                {/* 브랜드 + 옵션 태그 */}
                <div className="flex items-center gap-2 mb-0">
                  {product.brand && (
                    <span className="text-sm text-gray-500 font-medium">
                      {product.brand}
                    </span>
                  )}
                  {/* 옵션 태그 (2개 이상일 때만 표시) */}
                  {product.optionCount && product.optionCount > 1 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-600 rounded">
                      옵션 {product.optionCount}개
                    </span>
                  )}
                </div>
                {/* 제품명 */}
                <h3 className="font-semibold text-gray-900 text-base mb-1 leading-tight line-clamp-2">
                  {product.title}
                </h3>
                {/* 가격 정보 - 다나와 최저가 우선 사용 */}
                <div className="space-y-0">
                  {/* 옵션이 여러 개면 가격 범위, 아니면 단일 가격 */}
                  {(() => {
                    // 옵션이 여러 개인 경우 다나와 최저가 기반으로 가격 범위 재계산
                    const recommendedProduct = product as RecommendedProduct;
                    if (recommendedProduct.optionCount && recommendedProduct.optionCount > 1 && recommendedProduct.variants) {
                      const prices = recommendedProduct.variants
                        .map(v => variantDanawaLowestPrices[v.pcode] || v.price)
                        .filter((p): p is number => p !== null && p > 0);

                      if (prices.length > 0) {
                        const minPrice = Math.min(...prices);
                        const maxPrice = Math.max(...prices);

                        return (
                          <>
                            <p className="text-lg font-bold text-gray-900">
                              <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                              {minPrice.toLocaleString()}<span className="text-sm">원</span>
                              <span className="text-gray-400 mx-1">~</span>
                              {maxPrice.toLocaleString()}<span className="text-sm">원</span>
                            </p>
                          </>
                        );
                      }
                    }
                    return null;
                  })() || (
                    <p className="text-lg font-bold text-gray-900 flex items-baseline gap-1.5">
                      {/* 다나와 최저가가 있으면 해당 가격 사용, 없으면 product.price */}
                      <span>
                        <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                        {(hasLowestPrice ? danawa.lowest_price! : (product.lowestPrice || product.price || 0)).toLocaleString()}
                        <span className="text-sm">원</span>
                      </span>
                    </p>
                  )}
                  {/* 최저가 로딩 UI 제거 - Supabase 캐시로 빠르게 로드됨 */}
                  {/* 별점 & 리뷰 수 & 가격비교 */}
                  {hasReview && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-xs font-semibold text-gray-900">{review.averageRating.toFixed(1)}</span>
                        <span className="text-xs text-gray-500">({review.reviewCount.toLocaleString()})</span>
                      </div>
                      {/* 가격비교 판매처 개수 */}
                      {danawa?.mall_prices && danawa.mall_prices.length > 0 && (
                        <span className="text-xs">
                                                    <span className="text-gray-300"> | </span>

                          <span className="text-gray-800">가격비교 </span>
                          <span className="text-gray-500">({danawa.mall_prices.length})</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 예산 비교 뱃지 - AI 추천이유 위에 배치 */}
            {(() => {
              const effectivePrice = (hasLowestPrice ? danawa.lowest_price! : (product.lowestPrice || product.price || 0));
              const budgetMin = userContext?.budget?.min || 0;
              const budgetMax = userContext?.budget?.max || 0;

              if (!effectivePrice || !budgetMin || !budgetMax) return null;

              // max 초과: "예산보다 비싸지만" (주황색)
              if (effectivePrice > budgetMax) {
                const percentDiff = Math.round((effectivePrice - budgetMax) / budgetMax * 100);
                if (percentDiff >= 5) {
                  return (
                    <div className="mt-3 px-3 py-2 bg-orange-50 rounded-lg w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-orange-600">📈</span>
                        <span className="text-xs text-orange-700 font-medium">
                          예산보다 {percentDiff}% 비싸지만, 선택 조건에 가장 적합해요.
                        </span>
                      </div>
                    </div>
                  );
                }
              }

              // min 미만: "예산보다 저렴하면서" (초록색)
              if (effectivePrice < budgetMin) {
                const percentDiff = Math.round((budgetMin - effectivePrice) / budgetMin * 100);
                if (percentDiff >= 10) {
                  return (
                    <div className="mt-3 px-3 py-2 bg-green-50 rounded-lg w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">📉</span>
                        <span className="text-xs text-green-700 font-medium">
                          예산보다 {percentDiff}% 저렴하면서, 선택 조건에 가장 적합해요.
                        </span>
                      </div>
                    </div>
                  );
                }
              }

              // min~max 범위 내: 배지 표시 안 함
              return null;
            })()}

            {/* LLM 추천 이유 */}
            {product.recommendationReason && (
              <div className="mt-2">
                <div className="rounded-xl p-3 bg-[#E8E6FD] border border-[#D6D3FC]">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="#4E43E1">
                      <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                    </svg>
                    <p className="text-sm text-[#4E43E1] leading-normal font-medium flex-1">
                      {parseMarkdownBold(product.recommendationReason)}
                    </p>
                  </div>
                </div>

                {/* 리뷰 기반 인사이트 (체감속성 기반) - 로딩 또는 데이터 */}
                {(isReviewInsightsLoading || (reviewInsights[product.pcode]?.insights && reviewInsights[product.pcode].insights.length > 0)) && (
                  <div className="mt-2 space-y-2">
                    {/* 로딩 스켈레톤 */}
                    {isReviewInsightsLoading ? (
                      <div className="bg-white rounded-lg p-3 border border-gray-200 animate-pulse">
                        {/* 태그 스켈레톤 */}
                        <div className="h-5 w-20 bg-gray-200/50 rounded-md mb-2"></div>
                        {/* 메타데이터 스켈레톤 */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="h-3 w-12 bg-gray-200/50 rounded"></div>
                          <div className="h-3 w-16 bg-gray-200/50 rounded"></div>
                        </div>
                        {/* 텍스트 스켈레톤 */}
                        <div className="space-y-1.5">
                          <div className="h-3 bg-gray-200/50 rounded w-full"></div>
                          <div className="h-3 bg-gray-200/50 rounded w-4/5"></div>
                        </div>
                      </div>
                    ) : (
                      /* 리뷰 인사이트 표시 */
                      <>
                        {reviewInsights[product.pcode].insights.slice(0, 3).map((insight, i) => (
                          <div
                            key={i}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              // PDP 열기 + 리뷰 탭으로 이동
                              handleProductClick(product, index);
                              // 약간의 딜레이 후 리뷰 탭 선택 이벤트 발생
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openReviewTab'));
                              }, 100);
                              logButtonClick('리뷰하이라이트_클릭', 'v2-result');
                            }}
                          >
                            <ReviewCard insight={insight} />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* 버튼 그룹 */}
                <div className="mt-2 flex gap-2">
                  {/* 상세 분석 보기 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProductClick(product, index);
                      logButtonClick('상세분석보기_PLP', 'v2-result');
                    }}
                    className="flex-1 py-2.5 text-sm font-medium text-[#0074F3] bg-[#E5F1FF] hover:bg-[#D6E8FF] rounded-xl transition-colors flex items-center justify-center gap-1"
                  >
                    상세 분석 보기
                   
                  </button>
                  {/* 최저가 구매하기 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      logButtonClick('최저가로 구매하기_PLP', 'v2-result');
                      // 다나와 최저가 링크가 있으면 사용, 없으면 쿠팡 링크로 fallback
                      const lowestPriceLink = danawa?.mall_prices?.[0]?.link;
                      const lowestPrice = danawa?.mall_prices?.[0]?.price;
                      const lowestMall = danawa?.mall_prices?.[0]?.mall || '쿠팡';

                      // 가격 정보 로깅
                      logProductModalPurchaseClick(
                        product.pcode,
                        product.title,
                        lowestMall,
                        lowestPrice || product.price || 0,
                        true, // 최저가 버튼이므로 항상 true
                        'v2-result'
                      );

                      if (lowestPriceLink) {
                        window.open(lowestPriceLink, '_blank');
                      } else {
                        window.open(`https://www.coupang.com/vp/products/${product.pcode}`, '_blank');
                      }
                    }}
                    className="flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-colors flex items-center justify-center gap-1"
                    style={{ backgroundColor: '#0084FE' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0070D9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0084FE'}
                  >
                    최저가 구매하기
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        );
      })}

      {/* 상세 비교표 */}
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8, duration: 0.5, ease: 'easeOut' }}
          className="mt-6"
        >
          <DetailedComparisonTable
            recommendations={recommendations}
            cachedFeatures={comparisonFeatures}
            cachedDetails={comparisonDetails}
            showScore={false}
            isTagBasedFlow={true}
            category={categoryKey}
            danawaSpecs={danawaSpecs}
            normalizedSpecs={normalizedSpecs}
            // NOTE: 기준제품 기능 임시 비활성화 (버그 많음)
            // anchorProduct={anchorProduct}
            // onAnchorChange={handleAnchorChange}
            onProductClick={(rec) => {
              logButtonClick(`비교표_상세보기_${rec.product.title}`, 'v2-result');
              setSelectedProduct(rec);
              onModalOpenChange?.(true);
              // Convert DanawaPriceData to modal format for clicked product
              const danawa = danawaData[rec.product.id];
              if (danawa && danawa.lowest_price) {
                setSelectedProductDanawa({
                  lowestPrice: danawa.lowest_price,
                  lowestMall: danawa.lowest_mall || '',
                  productName: rec.product.title,
                  prices: (danawa.mall_prices || []).map(mp => ({
                    mall: mp.mall,
                    price: mp.price,
                    delivery: mp.delivery,
                    link: mp.link,
                  })),
                });
              } else {
                setSelectedProductDanawa(undefined);
              }
            }}
          />
        </motion.div>
      )}

      {/* 제품 상세 모달 */}
      {selectedProduct && (() => {
        // 동적으로 분석 데이터 주입 (캐시 로딩 후에도 최신 데이터 표시)
        const analysis = productAnalysisData[selectedProduct.product.id];
        const dynamicProductData = {
          ...selectedProduct,
          additionalPros: analysis?.additionalPros || selectedProduct.additionalPros,
          cons: analysis?.cons || selectedProduct.cons,
          purchaseTip: analysis?.purchaseTip || selectedProduct.purchaseTip,
        };
        return (
        <ProductDetailModal
          productData={dynamicProductData}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedProductVariants([]);
            setSelectedProductDanawa(undefined);
            onModalOpenChange?.(false);
          }}
          category={categoryKey || 'milk_powder_port'}
          danawaData={selectedProductDanawa}
          isAnalysisLoading={isAnalysisLoading}
          selectedConditionsEvaluation={productAnalysisData[selectedProduct.product.id]?.selectedConditionsEvaluation}
          initialAverageRating={reviewData[selectedProduct.product.id]?.averageRating}
          variants={selectedProductVariants}
          variantDanawaData={variantDanawaLowestPrices}
          onRealReviewsClick={() => {
            const pcode = selectedProduct.product.id;
            setSelectedRealReviewPcode(pcode);
            setShowRealReviewsModal(true);
            onModalOpenChange?.(true);
            if (!realReviewsData[pcode]) {
              fetchRealReviews({
                pcode,
                title: selectedProduct.product.title,
                brand: selectedProduct.product.brand || undefined,
              });
            }
          }}
          isRealReviewsLoading={isReviewsLoading(selectedProduct.product.id)}
          onVariantSelect={async (variant) => {
            // 새 옵션 선택 시 해당 제품의 가격 정보 조회
            console.log('[ResultCards] onVariantSelect called:', variant);
            logButtonClick(`옵션변경_${variant.optionLabel}`, 'product-modal');

            // 다나와 가격 정보 조회
            try {
              console.log('[ResultCards] Fetching price for pcode:', variant.pcode);
              const res = await fetch('/api/v2/products-by-ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pcodes: [variant.pcode] }),
              });
              const data = await res.json();
              console.log('[ResultCards] API response:', data);

              if (data.success && data.products?.length > 0) {
                const newProduct = data.products[0];
                // API 응답 필드명 확인 (danawaPrice 또는 danawa_price)
                const newDanawa = newProduct.danawaPrice || newProduct.danawa_price;
                console.log('[ResultCards] Updating product info:', newProduct);
                console.log('[ResultCards] newDanawa:', newDanawa);

                // 제품 정보 업데이트
                setSelectedProduct(prev => {
                  console.log('[ResultCards] setSelectedProduct prev:', prev?.product.id, '-> new:', variant.pcode);
                  return prev ? {
                    ...prev,
                    product: {
                      ...prev.product,
                      id: variant.pcode,
                      title: variant.title,
                      price: variant.price || prev.product.price,
                    }
                  } : null;
                });

                // 다나와 가격 정보 업데이트
                if (newDanawa?.lowest_price) {
                  console.log('[ResultCards] Updating danawa price:', newDanawa);
                  setSelectedProductDanawa({
                    lowestPrice: newDanawa.lowest_price,
                    lowestMall: newDanawa.lowest_mall || '',
                    productName: variant.title,
                    prices: (newDanawa.mall_prices || []).map((mp: { mall: string; price: number; delivery: string; link?: string }) => ({
                      mall: mp.mall,
                      price: mp.price,
                      delivery: mp.delivery || '',
                      link: mp.link,
                    })),
                  });
                } else {
                  console.log('[ResultCards] No danawa price found, clearing danawa data');
                  // 다나와 가격 없으면 기존 데이터 유지하거나 클리어
                  setSelectedProductDanawa(undefined);
                }
              } else {
                console.log('[ResultCards] API returned no data or failed:', data);
              }
            } catch (error) {
              console.error('[ResultCards] Failed to fetch variant price:', error);
            }
          }}
        />
        );
      })()}

      {/* 예산 내 제품만 보기 플로팅 버튼 (다시 추천받기 버튼 위에 위치) */}
      {(() => {
        if (!onRestrictToBudget || !userContext?.budget?.min || !userContext?.budget?.max) return null;

        // 이미 클릭했으면 숨김
        if (budgetButtonClicked) return null;

        // Top 3 중 예산 범위(min~max) 밖의 제품이 있는지 확인 (다나와 최저가 우선 사용)
        const budgetCheckResults = products.map(p => {
          const danawa = danawaData[p.pcode];
          const hasLowestPrice = danawa && danawa.lowest_price && danawa.lowest_price > 0;
          const effectivePrice = hasLowestPrice ? danawa.lowest_price! : (p.lowestPrice || p.price || 0);
          const isOutOfBudget = effectivePrice > 0 && (effectivePrice < userContext.budget!.min || effectivePrice > userContext.budget!.max);

          return {
            title: `${p.brand || ''} ${p.title.substring(0, 20)}...`,
            danawaPrice: danawa?.lowest_price,
            lowestPrice: p.lowestPrice,
            price: p.price,
            effectivePrice,
            budgetMin: userContext.budget!.min,
            budgetMax: userContext.budget!.max,
            isOutOfBudget,
          };
        });

        const hasOutOfBudget = budgetCheckResults.some(r => r.isOutOfBudget);

        // 디버깅 로그 (제품별 가격 확인)
        console.log('[버튼 표시 로직] 예산 범위:', userContext.budget.min.toLocaleString(), '~', userContext.budget.max.toLocaleString(), '원');
        console.log('[버튼 표시 로직] 제품별 가격:', budgetCheckResults);
        console.log('[버튼 표시 로직] 범위 밖 제품 있음?', hasOutOfBudget, '→  버튼', hasOutOfBudget ? '표시' : '숨김');

        // 예산 범위 밖 제품이 없으면 버튼 숨김
        if (!hasOutOfBudget) return null;

        return (
          <button
            onClick={() => {
              logButtonClick('예산 내 제품만 보기');
              setBudgetButtonClicked(true);  // 클릭 후 버튼 숨김
              onRestrictToBudget();
            }}
            className="fixed bottom-24 right-4 z-[105] px-5 py-3 bg-black rounded-full font-semibold text-white transition-all active:scale-[0.95] flex items-center gap-2"
            style={{ maxWidth: 'calc(480px - 2rem)' }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            <span className="text-sm whitespace-nowrap">예산 내 제품만 보기</span>
          </button>
        );
      })()}

      {/* Real Reviews Bottom Sheet Modal (Gemini Grounding) */}
      <AnimatePresence>
        {showRealReviewsModal && selectedRealReviewPcode && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowRealReviewsModal(false);
                onModalOpenChange?.(false);
              }}
              className="fixed inset-0 bg-black/50 z-[60]"
            />
            {/* Modal Content */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] max-h-[85vh] overflow-hidden flex flex-col"
              style={{ maxWidth: '480px', margin: '0 auto' }}
            >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Purple Sparkle Icon */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#7C3AED" />
                </svg>
                <h3 className="text-lg font-bold text-gray-900">실시간 장단점</h3>
                {realReviewsData[selectedRealReviewPcode]?.lowQuality && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                    검색 결과 부족
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Refresh Button (디버깅용) */}
                <button
                  onClick={() => {
                    const product = products.find(p => p.pcode === selectedRealReviewPcode);
                    if (product) {
                      refetchRealReviews({
                        pcode: product.pcode,
                        title: product.title,
                        brand: product.brand || undefined,
                      });
                    }
                  }}
                  disabled={isReviewsLoading(selectedRealReviewPcode || '')}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="새로고침"
                >
                  <svg
                    className={`w-5 h-5 ${isReviewsLoading(selectedRealReviewPcode || '') ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowRealReviewsModal(false);
                    onModalOpenChange?.(false);
                  }}
                  className="p-2 -mr-2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(85vh - 60px)' }}>
              {realReviewsData[selectedRealReviewPcode] ? (
                <RealReviewsContent
                  data={realReviewsData[selectedRealReviewPcode]}
                  isLoading={isReviewsLoading(selectedRealReviewPcode)}
                />
              ) : isReviewsLoading(selectedRealReviewPcode) ? (
                <RealReviewsContent
                  data={{ content: '', sources: [], elapsed: 0, lowQuality: false }}
                  isLoading={true}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  데이터를 불러올 수 없습니다.
                </div>
              )}
            </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast notification for favorites (비활성화) */}
      {/* <Toast
        isVisible={showToast}
        onClose={() => setShowToast(false)}
        duration={2000}
        type={toastType}
        onViewFavorites={onViewFavorites}
      /> */}
    </motion.div>
  );
}
