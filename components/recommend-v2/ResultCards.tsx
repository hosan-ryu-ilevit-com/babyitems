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

// Product analysis data from LLM
interface ProductAnalysisData {
  pcode: string;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations: number[] }>;
}

// User context for API calls
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
}

interface ResultCardsProps {
  products: RecommendedProduct[];
  categoryName: string;
  conditions?: Array<{ label: string; value: string }>;
  categoryKey?: string;
  selectionReason?: string;  // LLM이 생성한 전체 선정 기준
  generatedBy?: 'llm' | 'fallback';  // 생성 방식
  userContext?: UserContext;  // 사용자 선택 컨텍스트 (API용)
}

/**
 * TOP 3 추천 결과 카드 컴포넌트 (개선 버전)
 * - 하드 필터 조건 태그
 * - 다나와 최저가
 * - 상세 모달
 * - 비교표 + AI 장단점
 * - 백그라운드 LLM 분석 (PDP 모달 + 비교표)
 */
export function ResultCards({ products, categoryName, conditions, categoryKey, selectionReason, generatedBy, userContext }: ResultCardsProps) {
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
      {/* 헤더 */}
      <div className="text-center mb-4">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-4xl"
        >
          🎉
        </motion.span>
        <h3 className="text-lg font-bold text-gray-900 mt-2">
          {categoryName} 추천 TOP 3
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          당신의 조건에 가장 잘 맞는 제품이에요
        </p>
        {/* AI 생성 뱃지 */}
        {generatedBy === 'llm' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100"
          >
            <span className="text-xs">✨</span>
            <span className="text-xs font-medium text-purple-700">AI가 선정한 맞춤 추천</span>
          </motion.div>
        )}
      </div>

      {/* LLM 선정 기준 요약 */}
      {selectionReason && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100"
        >
          <div className="flex items-start gap-2">
            <span className="text-base">🤖</span>
            <p className="text-xs text-blue-800 leading-relaxed">
              {selectionReason}
            </p>
          </div>
        </motion.div>
      )}

      {/* 선택한 조건 태그 */}
      {conditions && conditions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-4"
        >
          <p className="text-xs text-gray-500 mb-2">선택한 조건</p>
          <div className="flex flex-wrap gap-2">
            {conditions.map((cond, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium"
              >
                {cond.value}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* 제품 카드 목록 */}
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
            className={`relative bg-white rounded-2xl border-2 overflow-hidden cursor-pointer hover:shadow-md transition-all ${
              index === 0
                ? 'border-yellow-400 shadow-lg'
                : index === 1
                ? 'border-gray-300'
                : 'border-amber-200'
            }`}
          >
            {/* 순위 뱃지 */}
            <div
              className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl font-bold text-sm z-10 ${
                index === 0
                  ? 'bg-yellow-400 text-yellow-900'
                  : index === 1
                  ? 'bg-gray-300 text-gray-700'
                  : 'bg-amber-600 text-white'
              }`}
            >
              {index + 1}위
            </div>

            {/* 클릭 어포던스 */}
            <div className="absolute top-3 right-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* 카드 내용 */}
            <div className="p-4 pt-8">
              <div className="flex gap-3">
                {/* 썸네일 */}
                <div className="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                  {product.thumbnail ? (
                    <Image
                      src={product.thumbnail}
                      alt={product.title}
                      width={96}
                      height={96}
                      className="w-full h-full object-contain p-2"
                      quality={85}
                      sizes="96px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-0.5">
                    {product.brand && (
                      <p className="text-xs text-gray-500 font-medium">
                        {product.brand}
                      </p>
                    )}
                    {/* 별점 & 리뷰 수 */}
                    {hasReview && (
                      <div className="flex items-center gap-1 text-xs">
                        <svg className="w-3 h-3 text-yellow-400 fill-current" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-gray-600 font-medium">{review.averageRating.toFixed(1)}</span>
                        <span className="text-gray-400">({review.reviewCount.toLocaleString()})</span>
                      </div>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 line-clamp-2 mb-1.5 leading-tight">
                    {product.title}
                  </h4>
                  <div className="mt-auto">
                    {product.price && (
                      <p className="text-lg font-bold text-gray-900">
                        {product.price.toLocaleString()}
                        <span className="text-xs text-gray-500 ml-0.5">원</span>
                      </p>
                    )}

                    {/* 다나와 최저가 */}
                    {loadingPrices ? (
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        <span>최저가 확인 중...</span>
                      </div>
                    ) : hasLowestPrice ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-red-600 font-medium">최저</span>
                        <span className="text-xs text-red-600 font-bold">
                          {danawa.lowest_price!.toLocaleString()}원
                        </span>
                        {danawa.lowest_mall && (
                          <span className="text-[10px] text-gray-400">
                            ({danawa.lowest_mall})
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* 하드 필터 조건 태그 */}
              {conditions && conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                  {conditions.slice(0, 4).map((cond, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium"
                    >
                      {cond.value}
                    </span>
                  ))}
                  {conditions.length > 4 && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                      +{conditions.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* LLM 추천 이유 (있는 경우) */}
              {product.recommendationReason && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5">💡</span>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {product.recommendationReason}
                    </p>
                  </div>
                </div>
              )}

              {/* 밸런스 게임 매칭 규칙 태그 (추천 이유가 없을 때만 표시) */}
              {!product.recommendationReason && product.matchedRules && product.matchedRules.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {product.matchedRules.slice(0, 3).map((rule, i) => {
                    const displayName = rule
                      .replace('체감속성_', '')
                      .replace(/_/g, ' ');

                    return (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                      >
                        {displayName}
                      </span>
                    );
                  })}
                  {product.matchedRules.length > 3 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      +{product.matchedRules.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* 매칭된 선호 항목 태그 */}
              {product.matchedPreferences && product.matchedPreferences.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {product.matchedPreferences.slice(0, 4).map((pref, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700"
                    >
                      {pref}
                    </span>
                  ))}
                </div>
              )}
            </div>
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
        />
      )}
    </motion.div>
  );
}
