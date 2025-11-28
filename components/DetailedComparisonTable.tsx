'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Recommendation } from '@/types';
import { products } from '@/data/products';
import { logComparisonProductAction } from '@/lib/logging/clientLogger';

interface DetailedComparisonTableProps {
  recommendations: Recommendation[];
  cachedFeatures?: Record<string, string[]>;
  cachedDetails?: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>;
  showRankBadge?: boolean;
  showScore?: boolean;
  anchorProduct?: any; // Tag-based flow에서 앵커 제품 (optional)
  isTagBasedFlow?: boolean; // Tag-based flow 여부
  category?: string; // NEW: Category for spec-based products
}

export default function DetailedComparisonTable({
  recommendations,
  cachedFeatures,
  cachedDetails,
  showRankBadge = true,
  showScore = true,
  anchorProduct,
  isTagBasedFlow = false,
  category
}: DetailedComparisonTableProps) {
  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>>({});
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isSpecsExpanded, setIsSpecsExpanded] = useState(false); // 상세 스펙 펼치기/접기 상태

  // Tag-based flow: 4개 제품 (앵커 + 추천 3개), Normal flow: 추천 3개
  // useMemo로 메모이제이션하여 무한 루프 방지
  const displayProducts = useMemo(() => {
    if (isTagBasedFlow && anchorProduct) {
      const anchorId = String(anchorProduct.productId);
      // 앵커 제품을 Recommendation 형식으로 변환
      const anchorRec = {
        product: {
          id: anchorId,
          title: anchorProduct.모델명,
          brand: anchorProduct.브랜드,
          price: anchorProduct.최저가 || 0,
          reviewUrl: anchorProduct.썸네일 || '',
          thumbnail: anchorProduct.썸네일 || '',
          reviewCount: 0,
        },
        rank: 0 as const, // 앵커는 rank 0으로 표시
        finalScore: 0,
        personalizedReason: { strengths: [], weaknesses: [] },
        comparison: [],
        additionalConsiderations: '비교 기준 제품',
      };

      // 추천 목록에서 앵커 제품 제거 (중복 방지)
      const filteredRecommendations = recommendations
        .filter(rec => rec.product.id !== anchorId)
        .slice(0, 3);

      return [anchorRec, ...filteredRecommendations];
    }
    return recommendations.slice(0, 3);
  }, [isTagBasedFlow, anchorProduct, recommendations]);

  // 상품 선택 상태 (정확히 2개만 선택 가능) - 디폴트: 처음 2개
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
        // 이미 선택된 경우 - 선택 해제
        return prev.filter((id) => id !== productId);
      } else {
        // 선택되지 않은 경우
        if (prev.length >= 2) {
          // 이미 2개 선택됨 - 첫 번째 선택 제거 후 새로운 것 추가
          return [...prev.slice(1), productId];
        } else {
          // 2개 미만 - 추가
          return [...prev, productId];
        }
      }
    });
  };

  // Absolute evaluation color system
  const getColorForScore = (value: number): string => {
    if (value >= 8) return '#49CDCB'; // Excellent (8-10): cyan
    if (value >= 5) return '#F9B73B'; // Good (5-7): yellow
    return '#F15850'; // Poor (4 or less): red
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
      className="comparison-table-section space-y-4 mb-8"
    >
      {/* 상품 선택 UI */}
      <div className="bg-white rounded-2xl p-3">
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          상품 2개 선택
        </h3>
        <div className={`grid gap-3 ${isTagBasedFlow ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {displayProducts.map((rec) => {
            const isSelected = selectedProductIds.includes(rec.product.id);
            const isAnchor = rec.rank === 0;
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
        {selectedProductIds.length < 2 && (
          <p className="text-xs text-gray-500 text-center mt-3">
            {selectedProductIds.length === 0
              ? '2개의 상품을 선택해주세요'
              : '1개 더 선택해주세요'}
          </p>
        )}
      </div>

      {/* 비교표 - 2개 선택 시에만 표시 */}
      {selectedProductIds.length === 2 && selectedProducts.length === 2 && (
        <div className="bg-white rounded-2xl p-1">
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
                        {selectedRecommendations[0]?.rank === 0 ? (
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
                        {selectedRecommendations[1]?.rank === 0 ? (
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

            {/* 쿠팡에서 보기 + 최저가 보기 + 이 상품 질문하기 버튼 */}
            <tr className="border-b border-gray-100">
              <td colSpan={3} className="py-2 px-1.5">
                <div className="flex items-start justify-between gap-4">
                  {/* 왼쪽 제품 버튼 */}
                  <div className="flex-1 space-y-1.5">
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          selectedRecommendations[0]?.product.id,
                          selectedRecommendations[0]?.product.title,
                          selectedProductIds
                        );
                        window.open(selectedRecommendations[0]?.product.reviewUrl, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          selectedRecommendations[0]?.product.id,
                          selectedRecommendations[0]?.product.title,
                          selectedProductIds
                        );
                        window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(selectedRecommendations[0]?.product.title || '')}&sort=priceASC`, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      최저가 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'product_chat_clicked',
                          selectedRecommendations[0]?.product.id,
                          selectedRecommendations[0]?.product.title,
                          selectedProductIds
                        );
                        window.location.href = `/product-chat?productId=${selectedRecommendations[0]?.product.id}&from=/result`;
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg transition-colors hover:opacity-90 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                    >
                      <span>질문하기</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 text-white" style={{ background: 'linear-gradient(135deg, #5855ff, #71c4fd, #5cdcdc)' }}>
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        <span>AI</span>
                      </span>
                    </button>
                  </div>

                  {/* 중앙 빈 공간 */}
                  <div className="w-16"></div>

                  {/* 오른쪽 제품 버튼 */}
                  <div className="flex-1 space-y-1.5">
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          selectedRecommendations[1]?.product.id,
                          selectedRecommendations[1]?.product.title,
                          selectedProductIds
                        );
                        window.open(selectedRecommendations[1]?.product.reviewUrl, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      쿠팡에서 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'coupang_clicked',
                          selectedRecommendations[1]?.product.id,
                          selectedRecommendations[1]?.product.title,
                          selectedProductIds
                        );
                        window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(selectedRecommendations[1]?.product.title || '')}&sort=priceASC`, '_blank');
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                    >
                      최저가 보기
                    </button>
                    <button
                      onClick={() => {
                        logComparisonProductAction(
                          'result',
                          'product_chat_clicked',
                          selectedRecommendations[1]?.product.id,
                          selectedRecommendations[1]?.product.title,
                          selectedProductIds
                        );
                        window.location.href = `/product-chat?productId=${selectedRecommendations[1]?.product.id}&from=/result`;
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg transition-colors hover:opacity-90 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: '#E5F1FF', color: '#0074F3' }}
                    >
                      <span>질문하기</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 text-white" style={{ background: 'linear-gradient(135deg, #5855ff, #71c4fd, #5cdcdc)' }}>
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        <span>AI</span>
                      </span>
                    </button>
                  </div>
                </div>
              </td>
            </tr>

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
                  <h4 className="text-sm font-bold text-gray-900 mb-3">📊 한줄 비교 정리</h4>
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

            {/* 스펙 비교 - Tag-based flow에서만 표시, 접을 수 있음 */}
            {isTagBasedFlow && !isLoadingComparison && Object.keys(productDetails).length > 0 && (() => {
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

            {/* 속성 점수들 - 좌우 대칭 배치 (coreValues가 있는 경우만) */}
            {!isTagBasedFlow && selectedProducts.length === 2 && selectedProducts[0] && selectedProducts[1] &&
             selectedProducts[0].coreValues && selectedProducts[1].coreValues && (() => {
              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];

              const attributes: Array<{ key: keyof typeof product1.coreValues; label: string }> = [
                { key: 'temperatureControl', label: '온도 조절/유지' },
                { key: 'hygiene', label: '위생/세척' },
                { key: 'material', label: '소재/안전성' },
                { key: 'usability', label: '사용 편의성' },
                { key: 'portability', label: '휴대성' },
                { key: 'priceValue', label: '가격 대비 가치' },
                { key: 'additionalFeatures', label: '부가 기능/디자인' },
              ];

              return attributes.map((attr) => {
                const value1 = product1.coreValues[attr.key];
                const value2 = product2.coreValues[attr.key];
                const color1 = getColorForScore(value1);
                const color2 = getColorForScore(value2);

                return (
                  <tr key={attr.key} className="border-b border-gray-100">
                    <td colSpan={3} className="py-2 px-1.5">
                      <div className="flex items-center justify-between gap-4">
                        {/* 왼쪽 제품 - 왼쪽 정렬 */}
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-bold whitespace-nowrap" style={{ color: color1 }}>
                            {value1}/10
                          </span>
                          <div className="flex-1 max-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value1 / 10) * 100}%`, backgroundColor: color1 }}
                            />
                          </div>
                        </div>

                        {/* 중앙 속성명 */}
                        <div className="text-xs font-medium text-gray-500 text-center whitespace-nowrap px-3">
                          {attr.label}
                        </div>

                        {/* 오른쪽 제품 - 오른쪽 정렬 */}
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <div className="flex-1 max-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${(value2 / 10) * 100}%`, backgroundColor: color2 }}
                            />
                          </div>
                          <span className="text-xs font-bold whitespace-nowrap" style={{ color: color2 }}>
                            {value2}/10
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
      )}
    </motion.div>
  );
}
