'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { ScoredProduct, ProductVariant } from '@/types/recommend-v2';
import type { Recommendation } from '@/types';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import ProductDetailModal from '@/components/ProductDetailModal';
import { logButtonClick, logV2ProductModalOpened, logFavoriteAction } from '@/lib/logging/clientLogger';
import { useFavorites } from '@/hooks/useFavorites';
import { useDanawaPrices } from '@/hooks/useDanawaPrices';
import Toast from '@/components/Toast';

// SessionStorage 키 prefix (비교표 분석 데이터 캐싱용)
// NOTE: 카테고리별로 별도 캐시를 유지하기 위해 categoryKey를 포함한 키 사용
const V2_COMPARISON_CACHE_PREFIX = 'v2_comparison_analysis';
const V2_PRODUCT_ANALYSIS_CACHE_PREFIX = 'v2_product_analysis';

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
  onModalOpenChange?: (isOpen: boolean) => void;  // 상품 모달 열림/닫힘 상태 콜백
  onViewFavorites?: () => void;  // 찜 목록 모달로 열기 위한 콜백
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

export function ResultCards({ products, categoryName, categoryKey, selectionReason, userContext, onModalOpenChange, onViewFavorites }: ResultCardsProps) {
  // Favorites management
  const { toggleFavorite, isFavorite, count: favoritesCount } = useFavorites();
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'add' | 'remove'>('add');

  // Danawa price/spec/review data (공통 훅 사용)
  const pcodes = useMemo(() => products.map(p => p.pcode), [products]);
  const { danawaData, danawaSpecs, reviewData } = useDanawaPrices(pcodes);

  // Comparison table states
  // NOTE: setComparisonFeatures 비활성화 - 기준제품 기능 비활성화로 미사용
  const [comparisonFeatures] = useState<Record<string, string[]>>({});
  const [comparisonDetails, setComparisonDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, unknown> | null }>>({});

  // Background LLM analysis states
  const [productAnalysisData, setProductAnalysisData] = useState<Record<string, ProductAnalysisData>>({});
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [isComparisonLoading, setIsComparisonLoading] = useState(true);
  const analysisCalledRef = useRef(false);

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

  // 카테고리 또는 제품이 변경되면 refs 리셋
  useEffect(() => {
    const currentCacheKey = getCacheKey;
    if (prevCacheKeyRef.current !== null && prevCacheKeyRef.current !== currentCacheKey) {
      // 캐시 키가 변경됨 → refs 리셋
      console.log('🔄 [ResultCards] Cache key changed, resetting refs:', prevCacheKeyRef.current, '→', currentCacheKey);
      analysisCalledRef.current = false;
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
    let cachedProductAnalysis: Record<string, ProductAnalysisData> | null = null;

    try {
      // 카테고리별 캐시 키 사용 (다른 카테고리 캐시와 충돌 방지)
      const comparisonStorageKey = `${V2_COMPARISON_CACHE_PREFIX}_${cacheKey}`;
      const comparisonCache = sessionStorage.getItem(comparisonStorageKey);
      if (comparisonCache) {
        const parsed = JSON.parse(comparisonCache);
        if (parsed.data) {
          cachedComparison = parsed.data;
          console.log('✅ [ResultCards] Comparison analysis loaded from cache:', comparisonStorageKey);
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
          const data = typedResult.data as { productDetails: Record<string, { pros: string[]; cons: string[]; comparison: string }>; generated_by: string };
          if (data?.productDetails) {
            setComparisonDetails(data.productDetails);

            // SessionStorage에 캐싱 (카테고리별 별도 키 사용)
            try {
              const comparisonStorageKey = `${V2_COMPARISON_CACHE_PREFIX}_${cacheKey}`;
              sessionStorage.setItem(comparisonStorageKey, JSON.stringify({
                data: data.productDetails,
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

  // Fetch comparison data for anchor product (if not in Top 3)
  useEffect(() => {
    if (!anchorProduct || !categoryKey) return;

    const anchorId = String(anchorProduct.productId);

    // 앵커가 Top 3에 포함되어 있으면 이미 comparison 데이터가 있음
    const isAnchorInTop3 = products.slice(0, 3).some(p => p.pcode === anchorId);
    if (isAnchorInTop3) return;

    // 이미 comparison 데이터가 있으면 skip
    if (comparisonDetails[anchorId]) return;

    console.log('📌 [ResultCards] Fetching comparison data for anchor product:', anchorId);

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
      }
    };

    fetchAnchorComparison();
  }, [anchorProduct, categoryKey, products, comparisonDetails]);

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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <h3 className="font-bold text-gray-900 text-lg">
            <StreamingText content="맞춤 추천 완료" speed={30} />
          </h3>
        </div>
        <p className="text-base text-gray-700 font-medium leading-[1.4]">
          <StreamingText content={`${categoryName} TOP 제품을 찾았어요!`} speed={20} />
        </p>
      </motion.div>

      {/* 선정 기준 요약 */}
      {selectionReason && (
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
          className="mb-4 p-4 rounded-2xl bg-blue-50"
        >
          <p className="text-sm text-blue-800 font-medium leading-[1.4]">
            {selectionReason}
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
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 + index * 0.4, duration: 0.5, ease: 'easeOut' }}
            onClick={() => handleProductClick(product, index)}
            className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            {/* 찜하기 버튼 - 우상단 */}
            <button
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
            </button>

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
                  {product.optionCount && product.optionCount > 1 && product.priceRange?.min && product.priceRange?.max ? (
                    <>
                      <p className="text-lg font-bold text-gray-900">
                        <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                        {product.priceRange.min.toLocaleString()}<span className="text-sm">원</span>
                        <span className="text-gray-400 mx-1">~</span>
                        {product.priceRange.max.toLocaleString()}<span className="text-sm">원</span>
                      </p>
                      {hasLowestPrice && danawa.mall_prices && danawa.mall_prices.length > 0 && (
                        <span className="inline-flex items-center text-xs font-medium text-red-500">
                          가격비교 ({danawa.mall_prices.length})
                          <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-lg font-bold text-gray-900 flex items-baseline gap-1.5">
                      {/* 다나와 최저가가 있으면 해당 가격 사용, 없으면 product.price */}
                      <span>
                        <span className="text-sm font-bold text-gray-900 mr-1">최저</span>
                        {(hasLowestPrice ? danawa.lowest_price! : (product.lowestPrice || product.price || 0)).toLocaleString()}
                        <span className="text-sm">원</span>
                      </span>
                      {hasLowestPrice && danawa.mall_prices && danawa.mall_prices.length > 0 && (
                        <span className="inline-flex items-center text-xs font-semibold text-red-500">
                          가격비교 ({danawa.mall_prices.length})
                          <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      )}
                    </p>
                  )}
                  {/* 최저가 로딩 UI 제거 - Supabase 캐시로 빠르게 로드됨 */}
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

            {/* 합쳐진 특징 태그 (LLM 정제 태그 우선, 없으면 fallback) */}
            {(() => {
              // 1. refinedTags가 있으면 우선 사용 (LLM이 정제한 태그)
              if (product.refinedTags && product.refinedTags.length > 0) {
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {product.refinedTags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded-xl bg-gray-100 text-gray-600 font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                );
              }

              // 2. Fallback: 기존 로직 (하드필터 + 밸런스 조건 매핑)
              const matchedFilters = userContext?.hardFilterAnswers && userContext?.hardFilterDefinitions
                ? getMatchedHardFilters(product, userContext.hardFilterAnswers, userContext.hardFilterDefinitions)
                : [];

              const balanceTags = product.matchedRules || [];
              const allLabels = new Set<string>();

              matchedFilters.forEach(value => {
                const displayLabel = userContext?.hardFilterLabels?.[value];
                if (displayLabel) {
                  allLabels.add(displayLabel);
                }
              });

              balanceTags.forEach(item => {
                const displayName = userContext?.balanceLabels?.[item];
                if (displayName) {
                  allLabels.add(displayName);
                }
              });

              const combinedTags = Array.from(allLabels);

              if (combinedTags.length === 0) return null;

              return (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {combinedTags.map((label, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded-xl bg-gray-100 text-gray-600 font-semibold"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              );
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
                      {product.recommendationReason}
                    </p>
                  </div>
                </div>
                {/* 상세 분석 보기 버튼 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProductClick(product, index);
                    logButtonClick('상세분석보기_PLP', 'v2-result');
                  }}
                  className="mt-2 w-full py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors flex items-center justify-center gap-1"
                >
                  상세 분석 보기
                  <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
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
          transition={{ delay: 2.6, duration: 0.5, ease: 'easeOut' }}
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

      {/* Toast notification for favorites */}
      <Toast
        isVisible={showToast}
        onClose={() => setShowToast(false)}
        duration={2000}
        type={toastType}
        onViewFavorites={onViewFavorites}
      />
    </motion.div>
  );
}
