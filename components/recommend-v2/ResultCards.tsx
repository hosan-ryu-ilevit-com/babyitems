'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { ScoredProduct, DanawaPriceData } from '@/types/recommend-v2';
import type { Recommendation } from '@/types';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import ProductDetailModal from '@/components/ProductDetailModal';
import { logButtonClick } from '@/lib/logging/clientLogger';

// Extended product type with LLM recommendation reason
interface RecommendedProduct extends ScoredProduct {
  recommendationReason?: string;
  matchedPreferences?: string[];
}

// V2 조건 충족도 평가 항목 타입
interface ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '개선됨' | '부분개선' | '회피안됨';
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
}

interface ResultCardsProps {
  products: RecommendedProduct[];
  categoryName: string;
  categoryKey?: string;
  selectionReason?: string;  // LLM이 생성한 전체 선정 기준
  userContext?: UserContext;  // 사용자 선택 컨텍스트 (API용)
}

/**
 * 상품이 특정 필터 조건을 만족하는지 확인
 * @param product - 상품 데이터
 * @param filterConditions - 필터 조건 (e.g., { "filter_attrs.제조사별": "삼성" } or { "spec.features": { "contains": "500만" } })
 * @returns 매칭 여부
 */
function checkProductMatchesFilter(
  product: ScoredProduct,
  filterConditions: Record<string, unknown>
): boolean {
  // Empty filter means no specific condition (matches all) - but we filter 'any' values elsewhere
  if (!filterConditions || Object.keys(filterConditions).length === 0) {
    return true;
  }

  // Check each condition
  for (const [path, condition] of Object.entries(filterConditions)) {
    // Get value from product based on path
    let productValue: unknown;

    if (path.startsWith('filter_attrs.')) {
      const attrKey = path.replace('filter_attrs.', '');
      productValue = (product as ScoredProduct & { filter_attrs?: Record<string, unknown> }).filter_attrs?.[attrKey];
    } else if (path.startsWith('spec.')) {
      const specKey = path.replace('spec.', '');
      productValue = product.spec?.[specKey];
    } else if (path === 'brand') {
      productValue = product.brand;
    } else {
      // Direct access
      productValue = (product as unknown as Record<string, unknown>)[path];
    }

    // Check condition type
    if (typeof condition === 'object' && condition !== null) {
      const condObj = condition as { contains?: string; eq?: string | number; gte?: number; lte?: number };

      // Contains check (for arrays like spec.features)
      if (condObj.contains !== undefined) {
        if (Array.isArray(productValue)) {
          const found = productValue.some(v =>
            String(v).toLowerCase().includes(String(condObj.contains).toLowerCase())
          );
          if (!found) return false;
        } else if (typeof productValue === 'string') {
          if (!productValue.toLowerCase().includes(String(condObj.contains).toLowerCase())) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Equality check
      if (condObj.eq !== undefined) {
        if (String(productValue) !== String(condObj.eq)) return false;
      }

      // Numeric comparisons
      if (condObj.gte !== undefined) {
        if (typeof productValue !== 'number' || productValue < condObj.gte) return false;
      }
      if (condObj.lte !== undefined) {
        if (typeof productValue !== 'number' || productValue > condObj.lte) return false;
      }
    } else {
      // Simple equality check
      if (String(productValue) !== String(condition)) return false;
    }
  }

  return true;
}

/**
 * 상품에 매칭되는 하드 필터 값들을 반환
 * @param product - 상품 데이터
 * @param hardFilterAnswers - 사용자가 선택한 필터 값들
 * @param hardFilterDefinitions - 각 필터 값의 조건 정의
 * @returns 매칭되는 필터 값 배열
 */
function getMatchedHardFilters(
  product: ScoredProduct,
  hardFilterAnswers: Record<string, string[]>,
  hardFilterDefinitions: Record<string, Record<string, unknown>>
): string[] {
  const matchedValues: string[] = [];

  // Flatten all selected values
  const allSelectedValues = Object.values(hardFilterAnswers).flat();

  for (const value of allSelectedValues) {
    // Skip 'any' values
    if (value === 'any') continue;

    const filterConditions = hardFilterDefinitions[value];

    // If no conditions defined, or empty conditions, consider it matched
    // (this handles cases like "rotation_no" with empty filter - user preference, not product attribute)
    if (!filterConditions || Object.keys(filterConditions).length === 0) {
      // Empty filter = user preference that doesn't require product matching
      // Don't show these as "matched" - they're not product attributes
      continue;
    }

    // Check if product matches this filter's conditions
    if (checkProductMatchesFilter(product, filterConditions)) {
      matchedValues.push(value);
    }
  }

  return matchedValues;
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

export function ResultCards({ products, categoryName, categoryKey, selectionReason, userContext }: ResultCardsProps) {
  // Danawa price data
  const [danawaData, setDanawaData] = useState<Record<string, DanawaPriceData>>({});
  const [danawaSpecs, setDanawaSpecs] = useState<Record<string, Record<string, string>>>({});
  const [reviewData, setReviewData] = useState<Record<string, { reviewCount: number; averageRating: number }>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);

  // Comparison table states
  const [comparisonFeatures, setComparisonFeatures] = useState<Record<string, string[]>>({});
  const [comparisonDetails, setComparisonDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }>>({});

  // Background LLM analysis states
  const [productAnalysisData, setProductAnalysisData] = useState<Record<string, ProductAnalysisData>>({});
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [isComparisonLoading, setIsComparisonLoading] = useState(true);
  const analysisCalledRef = useRef(false);

  // Product detail modal
  const [selectedProduct, setSelectedProduct] = useState<Recommendation | null>(null);
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

  // 기준제품은 자동 설정하지 않음 - 사용자가 선택하도록 함
  // 또는 카테고리 #1 제품을 별도 API로 가져와서 설정할 수 있음

  // Handle anchor product change
  const handleAnchorChange = (newAnchor: typeof anchorProduct) => {
    if (newAnchor) {
      setAnchorProduct(newAnchor);
      // Clear comparison cache to force refetch
      setComparisonDetails({});
      setComparisonFeatures({});
      logButtonClick(`기준제품_변경완료_${newAnchor.브랜드}_${newAnchor.모델명}`, 'v2-result');
    }
  };

  // Fetch danawa prices
  useEffect(() => {
    if (products.length === 0) return;

    const fetchPrices = async () => {
      try {
        const pcodes = products.map(p => p.pcode);
        const response = await fetch('/api/v2/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcodes }),
        });

        const data = await response.json();
        if (data.success) {
          // 가격 데이터 저장
          const priceMap: Record<string, DanawaPriceData> = {};
          data.data.prices.forEach((price: DanawaPriceData) => {
            priceMap[price.pcode] = price;
          });
          setDanawaData(priceMap);
          console.log(`✅ Loaded danawa prices for ${data.data.prices.length} products`);

          // 스펙 데이터 + 리뷰 데이터 저장
          const specsMap: Record<string, Record<string, string>> = {};
          const reviewMap: Record<string, { reviewCount: number; averageRating: number }> = {};

          data.data.specs?.forEach((item: {
            pcode: string;
            spec: Record<string, unknown>;
            filter_attrs: Record<string, unknown>;
            review_count?: number;
            average_rating?: number;
          }) => {
            // 스펙 데이터
            if (item.spec) {
              const specStrings: Record<string, string> = {};
              Object.entries(item.spec).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                  specStrings[key] = String(value);
                }
              });
              specsMap[item.pcode] = specStrings;
            }

            // 리뷰 데이터
            reviewMap[item.pcode] = {
              reviewCount: item.review_count || 0,
              averageRating: item.average_rating || 0,
            };
          });

          setDanawaSpecs(specsMap);
          setReviewData(reviewMap);
          console.log(`✅ Loaded danawa specs for ${Object.keys(specsMap).length} products`);
          console.log(`✅ Loaded review data for ${Object.keys(reviewMap).length} products`);
        }
      } catch (e) {
        console.error('Failed to fetch danawa prices:', e);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [products]);

  // Background LLM analysis (product analysis + comparison analysis)
  useEffect(() => {
    if (products.length === 0 || !categoryKey || analysisCalledRef.current) return;

    analysisCalledRef.current = true;

    const fetchBackgroundAnalysis = async () => {
      // Prepare product info for API calls
      const productInfos = products.slice(0, 3).map(p => ({
        pcode: p.pcode,
        title: p.title,
        brand: p.brand,
        price: p.price,
        spec: p.spec,
        rank: p.rank,
      }));

      // Call both APIs in parallel
      const [productAnalysisPromise, comparisonAnalysisPromise] = [
        // Product analysis API (additionalPros, cons, purchaseTip)
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
          return { success: false };
        }),

        // Comparison analysis API (pros, cons, comparison for comparison table)
        fetch('/api/v2/comparison-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            products: productInfos,
          }),
        }).then(res => res.json()).catch(err => {
          console.error('[ResultCards] Comparison analysis API error:', err);
          return { success: false };
        }),
      ];

      // Wait for product analysis
      const productAnalysisResult = await productAnalysisPromise;
      if (productAnalysisResult.success && productAnalysisResult.data?.analyses) {
        const analysisMap: Record<string, ProductAnalysisData> = {};
        productAnalysisResult.data.analyses.forEach((analysis: ProductAnalysisData) => {
          analysisMap[analysis.pcode] = analysis;
        });
        setProductAnalysisData(analysisMap);
        console.log(`✅ [ResultCards] Product analysis loaded (${productAnalysisResult.data.generated_by}):`, Object.keys(analysisMap).length, 'products');
      }
      setIsAnalysisLoading(false);

      // Wait for comparison analysis
      const comparisonAnalysisResult = await comparisonAnalysisPromise;
      if (comparisonAnalysisResult.success && comparisonAnalysisResult.data?.productDetails) {
        setComparisonDetails(comparisonAnalysisResult.data.productDetails);
        console.log(`✅ [ResultCards] Comparison analysis loaded (${comparisonAnalysisResult.data.generated_by}):`, Object.keys(comparisonAnalysisResult.data.productDetails).length, 'products');
      }
      setIsComparisonLoading(false);
    };

    fetchBackgroundAnalysis();
  }, [products, categoryKey, userContext]);

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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <h3 className="font-bold text-gray-900 text-lg">
            <StreamingText content="맞춤 추천 완료" speed={30} />
          </h3>
        </div>
        <p className="text-base text-gray-700 font-medium leading-relaxed">
          <StreamingText content={`${categoryName} TOP 제품을 찾았어요!`} speed={20} />
        </p>
      </motion.div>

      {/* 선정 기준 요약 */}
      {selectionReason && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4 p-4 rounded-2xl bg-blue-50"
        >
          <p className="text-sm text-blue-800 font-medium leading-relaxed">
            <StreamingText content={selectionReason} speed={10} />
          </p>
        </motion.div>
      )}

      {/* 제품 카드 목록 - result 페이지 스타일 */}
      {products.map((product, index) => {
        const danawa = danawaData[product.pcode];
        const hasLowestPrice = danawa && danawa.lowest_price && danawa.lowest_price > 0;
        const review = reviewData[product.pcode];
        const hasReview = review && (review.reviewCount > 0 || review.averageRating > 0);

        return (
          <motion.div
            key={product.pcode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.15 }}
            onClick={() => handleProductClick(product, index)}
            className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            {/* 클릭 어포던스 - 우상단 chevron */}
            <div className="absolute top-4 right-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

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
                    priority={index === 0}
                    quality={90}
                    sizes="112px"
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {/* 랭킹 배지 - 좌측 상단 */}
                <div className="absolute top-0 left-0 h-7 px-2 bg-gray-900 rounded-tl-xl rounded-tr-none rounded-bl-none rounded-br-md flex items-center justify-center">
                  <span className="text-white font-semibold text-xs">
                    {index + 1}
                  </span>
                </div>
              </div>

              {/* 제품 상세 정보 */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                {/* 브랜드 */}
                {product.brand && (
                  <div className="text-sm text-gray-500 font-medium mb-0">
                    {product.brand}
                  </div>
                )}
                {/* 제품명 */}
                <h3 className="font-semibold text-gray-900 text-base mb-1 leading-tight line-clamp-2">
                  {product.title}
                </h3>
                {/* 가격 정보 */}
                <div className="space-y-0">
                  {product.price && (
                    <p className="text-lg font-bold text-gray-900">
                      {product.price.toLocaleString()}<span className="text-sm">원</span>
                    </p>
                  )}
                  {/* 다나와 최저가 */}
                  {loadingPrices ? (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                      <span>최저가 확인 중...</span>
                    </div>
                  ) : hasLowestPrice ? (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-red-600 font-medium">최저</span>
                      <span className="text-red-600 font-medium">{danawa.lowest_price!.toLocaleString()}원</span>
                      {danawa.lowest_mall && (
                        <span className="text-gray-400">({danawa.lowest_mall})</span>
                      )}
                    </div>
                  ) : null}
                  {/* 별점 & 리뷰 수 */}
                  {hasReview && (
                    <div className="flex items-center gap-0.5">
                      <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-xs font-semibold text-gray-900">{review.averageRating.toFixed(1)}</span>
                      <span className="text-xs text-gray-500">({review.reviewCount.toLocaleString()})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* LLM 추천 이유 - result 페이지 스타일 */}
            {product.recommendationReason && (
              <div className="mt-3">
                <div className="rounded-xl p-3 bg-[#F3E6FD]">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24">
                      <defs>
                        <linearGradient id={`sparkle-gradient-${product.pcode}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#9325FC" />
                          <stop offset="50%" stopColor="#C750FF" />
                          <stop offset="100%" stopColor="#C878F7" />
                        </linearGradient>
                      </defs>
                      <path fill={`url(#sparkle-gradient-${product.pcode})`} d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                    </svg>
                    <p className="text-sm text-gray-700 leading-normal flex-1">
                      {product.recommendationReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 하드 필터 조건 매칭 - 파란색 박스 (상품별 매칭되는 조건만 표시) */}
            {(() => {
              // Calculate matched filters for this specific product
              const matchedFilters = userContext?.hardFilterAnswers && userContext?.hardFilterDefinitions
                ? getMatchedHardFilters(product, userContext.hardFilterAnswers, userContext.hardFilterDefinitions)
                : [];

              if (matchedFilters.length === 0) return null;

              return (
                <div className="mt-2">
                  <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {matchedFilters.slice(0, 4).map((value, i) => {
                          // Use Korean label from mapping if available
                          const displayLabel = userContext?.hardFilterLabels?.[value] || value;
                          return (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded-full bg-white text-blue-700 font-medium"
                            >
                              {displayLabel}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 매칭된 선호 조건 태그 (밸런스 게임 매칭) - 초록색 박스 */}
            {((product.matchedPreferences && product.matchedPreferences.length > 0) ||
              (product.matchedRules && product.matchedRules.length > 0)) && (
              <div className="mt-2">
                <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {(product.matchedPreferences && product.matchedPreferences.length > 0
                        ? product.matchedPreferences
                        : product.matchedRules || []
                      ).slice(0, 4).map((item, i) => {
                        // Use Korean label from mapping if available
                        const displayName = userContext?.balanceLabels?.[item]
                          || item.replace('체감속성_', '').replace(/_/g, ' ');
                        return (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-full bg-white text-emerald-700 font-medium"
                          >
                            {displayName}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        );
      })}

      {/* 상세 비교표 */}
      {recommendations.length > 0 && (
        <div className="mt-6">
          <DetailedComparisonTable
            recommendations={recommendations}
            cachedFeatures={comparisonFeatures}
            cachedDetails={comparisonDetails}
            showScore={false}
            isTagBasedFlow={true}
            category={categoryKey}
            danawaSpecs={danawaSpecs}
            anchorProduct={anchorProduct}
            onAnchorChange={handleAnchorChange}
            onProductClick={(rec) => {
              logButtonClick(`비교표_상세보기_${rec.product.title}`, 'v2-result');
              setSelectedProduct(rec);
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
        </div>
      )}

      {/* 제품 상세 모달 */}
      {selectedProduct && (
        <ProductDetailModal
          productData={selectedProduct}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedProductDanawa(undefined);
          }}
          category={categoryKey || 'milk_powder_port'}
          danawaData={selectedProductDanawa}
          isAnalysisLoading={isAnalysisLoading}
          selectedConditionsEvaluation={productAnalysisData[selectedProduct.product.id]?.selectedConditionsEvaluation}
        />
      )}
    </motion.div>
  );
}
