'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Recommendation } from '@/types';
import { products } from '@/data/products';
import { logButtonClick } from '@/lib/logging/clientLogger';

interface DetailedComparisonTableProps {
  recommendations: Recommendation[];
  cachedFeatures?: Record<string, string[]>;
  cachedDetails?: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>;
  showRankBadge?: boolean;
  showScore?: boolean;
  anchorProduct?: any; // Tag-based flow에서 앵커 제품 (optional)
  isTagBasedFlow?: boolean; // Tag-based flow 여부
  category?: string; // NEW: Category for spec-based products
  onProductClick?: (rec: Recommendation) => void; // NEW: Product click handler for modal
}

export default function DetailedComparisonTable({
  recommendations,
  cachedFeatures,
  cachedDetails,
  showRankBadge = true,
  showScore = true,
  anchorProduct,
  isTagBasedFlow = false,
  category,
  onProductClick
}: DetailedComparisonTableProps) {
  const searchParams = useSearchParams();
  const fromFavorites = searchParams.get('fromFavorites') === 'true';

  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>>({});
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isSpecsExpanded, setIsSpecsExpanded] = useState(false); // 상세 스펙 펼치기/접기 상태

  // Tag-based flow: 4개 제품 (앵커 + 추천 3개), Normal flow: 추천 3개
  // useMemo로 메모이제이션하여 무한 루프 방지
  const displayProducts = useMemo(() => {
    if (isTagBasedFlow && anchorProduct) {
      const anchorId = String(anchorProduct.productId);
      // 앵커 제품을 Recommendation 형식으로 변환
      const anchorRec: Recommendation = {
        product: {
          id: anchorId,
          title: anchorProduct.모델명,
          brand: anchorProduct.브랜드,
          price: anchorProduct.최저가 || 0,
          reviewUrl: anchorProduct.썸네일 || '',
          thumbnail: anchorProduct.썸네일 || '',
          reviewCount: 0,
          ranking: 0,
          category: 'milk_powder_port',
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
        rank: 4 as 1 | 2 | 3 | 4, // 앵커는 임시로 rank 4 (실제로는 기준 제품)
        finalScore: 0,
        reasoning: '비교 기준 제품',
        selectedTagsEvaluation: [],
        additionalPros: [],
        cons: [],
        anchorComparison: [],
        purchaseTip: [{ text: '비교 기준 제품' }],
        citedReviews: [],
      };

      // 추천 목록에서 앵커 제품 제거 (중복 방지)
      const filteredRecommendations = recommendations
        .filter(rec => rec.product.id !== anchorId)
        .slice(0, 3);

      return [anchorRec, ...filteredRecommendations];
    }
    return recommendations.slice(0, 3);
  }, [isTagBasedFlow, anchorProduct, recommendations]);

  // 상품 선택 상태
  // 처음 2개 제품을 기본으로 선택 (자유롭게 변경 가능)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    if (displayProducts.length >= 2) {
      return [displayProducts[0].product.id, displayProducts[1].product.id];
    }
    return [];
  });

  // Tag-based flow: Use products from specs (no need to look up in products.ts)
  // Normal flow: Try to find in products.ts, but don't fail if not found
  const allProducts = isTagBasedFlow
    ? displayProducts.map(rec => rec.product) // Spec-based products (no coreValues)
    : displayProducts.map(rec => products.find(p => p.id === rec.product.id) || rec.product).filter(Boolean);

  // 선택된 2개 제품만 필터링
  const selectedProducts = allProducts.filter(p => p && selectedProductIds.includes(p.id));
  const selectedRecommendations = displayProducts.filter(rec => selectedProductIds.includes(rec.product.id));

  // 상품 선택 토글 핸들러
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        // 이미 선택된 경우 - 선택 해제 불가 (항상 2개 유지)
        return prev;
      } else {
        // 선택되지 않은 경우 - 가장 오래된 선택 제거하고 새로운 제품 추가
        if (prev.length >= 2) {
          return [...prev.slice(1), productId];
        } else {
          return [...prev, productId];
        }
      }
    });
  };

  // 캐시된 데이터 사용 (부모에서 전달받은 경우)
  useEffect(() => {
    if (cachedDetails && Object.keys(cachedDetails).length > 0) {
      console.log('✅ Using cached details from parent');
      setProductDetails(cachedDetails);
    }
  }, [cachedDetails]);

  // productIds를 메모이제이션하여 불필요한 API 호출 방지
  const productIds = useMemo(
    () => displayProducts.map(rec => rec.product.id),
    [displayProducts]
  );

  useEffect(() => {
    // 이미 캐시된 데이터가 있으면 API 호출 건너뛰기
    if (cachedDetails && Object.keys(cachedDetails).length > 0) {
      console.log('✅ Skipping API calls - using cached data');
      return;
    }

    // Fetch pros/cons from API (캐시 없을 때만)
    const fetchProductDetails = async () => {
      if (cachedDetails && Object.keys(cachedDetails).length > 0) return;

      setIsLoadingComparison(true);
      try {
        console.log('🔄 Fetching comparison data for products:', productIds);
        console.log('   Category:', category || 'not provided');
        console.log('   Is tag-based flow:', isTagBasedFlow);
        const response = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds, category }),
        });

        if (response.ok) {
          const data = await response.json();
          setProductDetails(data.productDetails);
          console.log('✅ Comparison data fetched successfully');
        } else {
          const errorData = await response.json();
          console.error('❌ Failed to fetch comparison data:', response.status, errorData);
        }
      } catch (error) {
        console.error('Failed to fetch product details:', error);
      } finally {
        setIsLoadingComparison(false);
      }
    };

    fetchProductDetails();
  }, [productIds, category, isTagBasedFlow, cachedDetails]);

  if (allProducts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="comparison-table-section space-y-0 mb-8"
    >
      {/* 상품 선택 UI */}
      <div className="bg-white border-b border-gray-200 py-3 px-0">
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          상품 2개 선택
        </h3>
        <div className={`grid gap-3 ${isTagBasedFlow ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {displayProducts.map((rec) => {
            const isSelected = selectedProductIds.includes(rec.product.id);
            const isAnchor = rec.reasoning === '비교 기준 제품';

            return (
              <button
                key={rec.product.id}
                onClick={() => toggleProductSelection(rec.product.id)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : 'bg-gray-50 border-2 border-transparent hover:border-gray-300'
                }`}
              >
                {/* 썸네일 */}
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                  {rec.product.thumbnail && (
                    <Image
                      src={rec.product.thumbnail}
                      alt={rec.product.title}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      quality={85}
                      sizes="64px"
                    />
                  )}
                  {/* 랭킹 배지 또는 앵커 표시 */}
                  {isAnchor ? (
                    <div className="absolute top-0 left-0 px-1.5 py-1.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                      <span className="text-white font-bold text-[9px] leading-none">기준</span>
                    </div>
                  ) : showRankBadge ? (
                    <div className="absolute top-0 left-0 w-5 h-5 bg-gray-900 rounded-tl-lg rounded-tr-none rounded-bl-none rounded-br-sm flex items-center justify-center">
                      <span className="text-white font-bold text-[10px]">
                        {rec.rank}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* 브랜드 + 제품명 - 3줄까지 표시 */}
                <p className="text-xs text-gray-900 font-semibold text-center line-clamp-3 leading-tight">
                  {rec.product.brand && <span className="text-gray-600">{rec.product.brand} </span>}
                  {rec.product.title}
                </p>
              </button>
            );
          })}
        </div>

        {/* 선택 안내 메시지 */}
        {selectedProductIds.length < 2 ? (
          <p className="text-xs text-gray-500 text-center mt-3">
            {selectedProductIds.length === 0
              ? '2개의 상품을 선택해주세요'
              : '1개 더 선택해주세요'}
          </p>
        ) : null}
      </div>

      {/* 비교표 - 2개 선택 시에만 표시 */}
      {selectedProductIds.length === 2 && selectedProducts.length === 2 && (
        <div className="bg-white py-3 px-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-1.5 text-center" colSpan={3}>
                  <div className="flex items-center justify-between gap-4">
                    {/* 왼쪽 제품 썸네일 */}
                    <div className="flex-1 flex justify-center">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                        {selectedRecommendations[0]?.product.thumbnail && (
                          <Image
                            src={selectedRecommendations[0].product.thumbnail}
                            alt={selectedRecommendations[0].product.title}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                            quality={85}
                            sizes="48px"
                          />
                        )}
                        {/* 랭킹 배지 또는 앵커 표시 */}
                        {selectedRecommendations[0]?.reasoning === '비교 기준 제품' ? (
                          <div className="absolute top-0 left-0 px-1.5 py-0.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                            <span className="text-white font-bold text-[9px] leading-none">기준</span>
                          </div>
                        ) : showRankBadge && (
                          <div className="absolute top-0 left-0 w-4 h-4 bg-gray-900 rounded-tl-lg rounded-tr-none rounded-bl-none rounded-br-sm flex items-center justify-center">
                            <span className="text-white font-bold text-[10px]">
                              {selectedRecommendations[0]?.rank}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 중앙 빈 공간 */}
                    <div className="w-16"></div>

                    {/* 오른쪽 제품 썸네일 */}
                    <div className="flex-1 flex justify-center">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                        {selectedRecommendations[1]?.product.thumbnail && (
                          <Image
                            src={selectedRecommendations[1].product.thumbnail}
                            alt={selectedRecommendations[1].product.title}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                            quality={85}
                            sizes="48px"
                          />
                        )}
                        {/* 랭킹 배지 또는 앵커 표시 */}
                        {selectedRecommendations[1]?.reasoning === '비교 기준 제품' ? (
                          <div className="absolute top-0 left-0 px-1.5 py-0.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                            <span className="text-white font-bold text-[9px] leading-none">기준</span>
                          </div>
                        ) : showRankBadge && (
                          <div className="absolute top-0 left-0 w-4 h-4 bg-gray-900 rounded-tl-lg rounded-tr-none rounded-bl-none rounded-br-sm flex items-center justify-center">
                            <span className="text-white font-bold text-[10px]">
                              {selectedRecommendations[1]?.rank}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
          <tbody>
            {/* 브랜드 */}
            <tr className="border-b border-gray-100">
              <td colSpan={3} className="py-2 px-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-700 leading-tight font-semibold">
                      {selectedRecommendations[0]?.product.brand || '-'}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3">
                    브랜드
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-700 leading-tight font-semibold">
                      {selectedRecommendations[1]?.product.brand || '-'}
                    </p>
                  </div>
                </div>
              </td>
            </tr>

            {/* 제품명 */}
            <tr className="border-b border-gray-100">
              <td colSpan={3} className="py-2 px-1.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-900 leading-tight font-semibold">
                      {selectedRecommendations[0]?.product.title}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3 self-center">
                    제품명
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-900 leading-tight font-semibold">
                      {selectedRecommendations[1]?.product.title}
                    </p>
                  </div>
                </div>
              </td>
            </tr>

            {/* 가격 */}
            <tr className="border-b border-gray-100">
              <td colSpan={3} className="py-2 px-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-sm font-bold text-gray-900">
                      {selectedRecommendations[0]?.product.price.toLocaleString()}원
                    </p>
                  </div>
                  <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3">
                    가격
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-sm font-bold text-gray-900">
                      {selectedRecommendations[1]?.product.price.toLocaleString()}원
                    </p>
                  </div>
                </div>
              </td>
            </tr>

            {/* 적합도 */}
            {showScore && (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-2 px-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-sm font-bold" style={{ color: '#009896' }}>
                        {selectedRecommendations[0]?.finalScore}%
                      </p>
                    </div>
                    <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3">
                      적합도
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-sm font-bold" style={{ color: '#009896' }}>
                        {selectedRecommendations[1]?.finalScore}%
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* 상세보기 버튼 - 찜한 상품에서 온 경우 숨기기 */}
            {!fromFavorites && (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-2 px-1.5">
                  <div className="flex items-start justify-between gap-4">
                    {/* 왼쪽 제품 버튼 */}
                    <div className="flex-1">
                      {selectedRecommendations[0]?.reasoning !== '비교 기준 제품' ? (
                        <button
                          onClick={() => {
                            if (onProductClick && selectedRecommendations[0]) {
                              logButtonClick(
                                `비교표 상세보기: ${selectedRecommendations[0].product.title}`,
                                'result'
                              );
                              onProductClick(selectedRecommendations[0]);
                            }
                          }}
                          className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors hover:opacity-90"
                          style={{ backgroundColor: '#0074F3', color: '#FFFFFF' }}
                        >
                          상세보기
                        </button>
                      ) : (
                        <div className="w-full py-2.5 text-xs text-center text-gray-400">
                          기준 제품
                        </div>
                      )}
                    </div>

                    {/* 중앙 빈 공간 */}
                    <div className="w-16"></div>

                    {/* 오른쪽 제품 버튼 */}
                    <div className="flex-1">
                      {selectedRecommendations[1]?.reasoning !== '비교 기준 제품' ? (
                        <button
                          onClick={() => {
                            if (onProductClick && selectedRecommendations[1]) {
                              logButtonClick(
                                `비교표 상세보기: ${selectedRecommendations[1].product.title}`,
                                'result'
                              );
                              onProductClick(selectedRecommendations[1]);
                            }
                          }}
                          className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors hover:opacity-90"
                          style={{ backgroundColor: '#0074F3', color: '#FFFFFF' }}
                        >
                          상세보기
                        </button>
                      ) : (
                        <div className="w-full py-2.5 text-xs text-center text-gray-400">
                          기준 제품
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* 장점 */}
            {isLoadingComparison ? (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-4 px-1.5">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-gray-500">장점 분석 중...</span>
                  </div>
                </td>
              </tr>
            ) : Object.keys(productDetails).length > 0 && (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-2 px-1.5">
                  <div className="flex items-start justify-between gap-4">
                    {/* 왼쪽 제품 */}
                    <div className="flex-1">
                      {(() => {
                        const product = selectedProducts[0];
                        if (!product) return null;
                        const details = productDetails[product.id];
                        return details && details.pros.length > 0 ? (
                          <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#ECFAF3' }}>
                            {details.pros.slice(0, 3).map((pro, idx) => (
                              <div key={idx} className="text-xs leading-snug flex items-start gap-1.5 text-gray-700">
                                <svg
                                  className="shrink-0 mt-0.5"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#22C55E"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{pro}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">-</p>
                        );
                      })()}
                    </div>

                    {/* 중앙 레이블 */}
                    <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3 self-center">
                      장점
                    </div>

                    {/* 오른쪽 제품 */}
                    <div className="flex-1">
                      {(() => {
                        const product = selectedProducts[1];
                        if (!product) return null;
                        const details = productDetails[product.id];
                        return details && details.pros.length > 0 ? (
                          <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#ECFAF3' }}>
                            {details.pros.slice(0, 3).map((pro, idx) => (
                              <div key={idx} className="text-xs leading-snug flex items-start gap-1.5 text-gray-700">
                                <svg
                                  className="shrink-0 mt-0.5"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#22C55E"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{pro}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">-</p>
                        );
                      })()}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* 주의점 */}
            {isLoadingComparison ? (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-4 px-1.5">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-gray-500">주의점 분석 중...</span>
                  </div>
                </td>
              </tr>
            ) : Object.keys(productDetails).length > 0 && (
              <tr className="border-b border-gray-100">
                <td colSpan={3} className="py-2 px-1.5">
                  <div className="flex items-start justify-between gap-4">
                    {/* 왼쪽 제품 */}
                    <div className="flex-1">
                      {(() => {
                        const product = selectedProducts[0];
                        if (!product) return null;
                        const details = productDetails[product.id];
                        return details && details.cons.length > 0 ? (
                          <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#FFF6EC' }}>
                            {details.cons.slice(0, 3).map((con, idx) => (
                              <div key={idx} className="text-xs leading-snug flex items-start gap-1.5 text-gray-700">
                                <svg
                                  className="shrink-0 mt-0.5"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#EF4444"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span>{con}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">-</p>
                        );
                      })()}
                    </div>

                    {/* 중앙 레이블 */}
                    <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3 self-center">
                      주의점
                    </div>

                    {/* 오른쪽 제품 */}
                    <div className="flex-1">
                      {(() => {
                        const product = selectedProducts[1];
                        if (!product) return null;
                        const details = productDetails[product.id];
                        return details && details.cons.length > 0 ? (
                          <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#FFF6EC' }}>
                            {details.cons.slice(0, 3).map((con, idx) => (
                              <div key={idx} className="text-xs leading-snug flex items-start gap-1.5 text-gray-700">
                                <svg
                                  className="shrink-0 mt-0.5"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#EF4444"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span>{con}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">-</p>
                        );
                      })()}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* 한줄 비교 정리 */}
            {!isLoadingComparison && Object.keys(productDetails).length > 0 && selectedProducts.length === 2 && (
              <tr className="border-b border-gray-100 bg-gray-50">
                <td colSpan={3} className="py-3 px-3">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">📊 한줄 비교</h4>
                  <div className="space-y-2.5">
                    {selectedProducts.map((product, index) => {
                      if (!product) return null;
                      const details = productDetails[product.id];
                      if (!details || !details.comparison) return null;

                      return (
                        <div key={product.id} className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white text-xs font-bold shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <p className="text-xs text-gray-700 leading-relaxed flex-1">
                            <span className="font-semibold">{product.brand} {product.title}</span>: {details.comparison}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            )}

            {/* 스펙 비교 - 접을 수 있음 */}
            {!isLoadingComparison && Object.keys(productDetails).length > 0 && (() => {
              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];
              if (!product1 || !product2) return null;

              const specs1 = productDetails[product1.id]?.specs;
              const specs2 = productDetails[product2.id]?.specs;

              if (!specs1 || !specs2) return null;

              // 공통 스펙 키 추출
              const allKeys = new Set([...Object.keys(specs1), ...Object.keys(specs2)]);

              // 제품명/브랜드/색상 등 메타 정보
              const metaKeys = ['브랜드', '모델명', '색상', '컬러'];
              const metaSpecKeys = Array.from(allKeys).filter(key => metaKeys.includes(key));

              // 실제 스펙 정보 (메타 정보와 가격 제외)
              const specKeys = Array.from(allKeys).filter(key => {
                return !metaKeys.includes(key) && key !== '가격';
              }).filter(key => {
                // 양쪽이 모두 없거나 '-'인 경우 제외
                const value1 = specs1[key];
                const value2 = specs2[key];
                const isEmpty1 = !value1 || value1 === '-' || value1 === '';
                const isEmpty2 = !value2 || value2 === '-' || value2 === '';
                return !(isEmpty1 && isEmpty2);
              });

              if (specKeys.length === 0 && metaSpecKeys.length === 0) return null;

              return (
                <>
                  {/* 접기/펼치기 헤더 */}
                  <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setIsSpecsExpanded(!isSpecsExpanded)}>
                    <td colSpan={3} className="py-3 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">상세 스펙</span>
                        <svg
                          className={`w-4 h-4 text-gray-500 transition-transform ${isSpecsExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </td>
                  </tr>

                  {/* 펼쳐진 상태일 때만 표시 (애니메이션 적용) */}
                  <AnimatePresence>
                    {isSpecsExpanded && (
                      <tr className="border-b border-gray-100">
                        <td colSpan={3} className="overflow-hidden">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="py-3 px-3"
                          >
                            {/* 통합 스펙 테이블 (메타 정보 + 상세 스펙) */}
                            {(metaSpecKeys.length > 0 || specKeys.length > 0) && (
                              <table className="w-full text-xs">
                                <tbody>
                                  {/* 메타 정보 */}
                                  {metaSpecKeys.map((key, idx) => {
                                    const value1 = specs1[key] || '-';
                                    const value2 = specs2[key] || '-';
                                    // 양쪽 모두 비어있으면 skip
                                    if ((value1 === '-' || !value1) && (value2 === '-' || !value2)) return null;

                                    return (
                                      <tr key={`meta-${idx}`} className="border-b border-gray-100">
                                        <td className="py-2 px-2 text-left text-gray-700 w-[35%]">{value1}</td>
                                        <td className="py-2 px-2 text-center font-medium text-gray-500 bg-gray-50 w-[30%]">{key}</td>
                                        <td className="py-2 px-2 text-right text-gray-700 w-[35%]">{value2}</td>
                                      </tr>
                                    );
                                  })}

                                  {/* 상세 스펙 */}
                                  {specKeys.map((key, idx) => {
                                    const value1 = specs1[key] || '-';
                                    const value2 = specs2[key] || '-';

                                    return (
                                      <tr key={`spec-${idx}`} className="border-b border-gray-100 last:border-0">
                                        <td className="py-2 px-2 text-left text-gray-700 w-[35%]">{value1}</td>
                                        <td className="py-2 px-2 text-center font-medium text-gray-500 bg-gray-50 w-[30%]">{key}</td>
                                        <td className="py-2 px-2 text-right text-gray-700 w-[35%]">{value2}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </>
              );
            })()}

          </tbody>
        </table>
      </div>
      )}
    </motion.div>
  );
}
