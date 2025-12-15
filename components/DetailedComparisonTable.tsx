'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Recommendation } from '@/types';
import { products } from '@/data/products';
import { logButtonClick, logComparisonDetailViewClick } from '@/lib/logging/clientLogger';
import AnchorProductChangeBottomSheet from './AnchorProductChangeBottomSheet';

// 정규화된 스펙 row 타입 (API 응답과 동일)
interface NormalizedSpecRow {
  key: string;  // 정규화된 스펙 이름 (예: "용량", "재질")
  values: Record<string, string | null>;  // pcode -> value 매핑
}

interface DetailedComparisonTableProps {
  recommendations: Recommendation[];
  cachedFeatures?: Record<string, string[]>;
  cachedDetails?: Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>;
  showScore?: boolean;
  anchorProduct?: any; // Tag-based flow에서 앵커 제품 (optional)
  isTagBasedFlow?: boolean; // Tag-based flow 여부
  category?: string; // NEW: Category for spec-based products
  onProductClick?: (rec: Recommendation) => void; // NEW: Product click handler for modal
  onAnchorChange?: (newAnchorProduct: any) => void; // NEW: Anchor product change handler
  danawaSpecs?: Record<string, Record<string, string>>; // NEW: Danawa specs data
  normalizedSpecs?: NormalizedSpecRow[]; // NEW: 정규화된 스펙 비교표 데이터
}

export default function DetailedComparisonTable({
  recommendations,
  cachedFeatures,
  cachedDetails,
  showScore = true,
  anchorProduct,
  isTagBasedFlow = false,
  category,
  onProductClick,
  onAnchorChange,
  danawaSpecs = {},
  normalizedSpecs = []
}: DetailedComparisonTableProps) {
  const searchParams = useSearchParams();
  const fromFavorites = searchParams.get('fromFavorites') === 'true';

  const [productDetails, setProductDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string; specs?: Record<string, any> | null }>>({});
  const [loadingProductIds, setLoadingProductIds] = useState<Set<string>>(new Set()); // 로딩 중인 제품 ID들
  const [isChangeAnchorOpen, setIsChangeAnchorOpen] = useState(false); // 기준제품 변경 바텀시트

  // productDetails를 ref로도 추적 (useEffect에서 의존성 없이 참조하기 위함)
  const productDetailsRef = useRef(productDetails);
  productDetailsRef.current = productDetails;

  // API 호출 중복 방지를 위한 ref
  const fetchingRef = useRef(false);
  // 이미 fetch한 productIds 추적 (재호출 방지)
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // 전체 로딩 상태 (하위 호환용)
  const isLoadingComparison = loadingProductIds.size > 0;

  // v2 flow 초기 로딩 상태 (cachedDetails 대기 중)
  const isWaitingForCache = isTagBasedFlow &&
    Object.keys(productDetails).length === 0 &&
    (!cachedDetails || Object.keys(cachedDetails).length === 0);

  // Log danawaSpecs prop received
  useEffect(() => {
    console.log(`🎁 [PROPS RECEIVED] DetailedComparisonTable received danawaSpecs:`, {
      productIds: Object.keys(danawaSpecs),
      specsPerProduct: Object.fromEntries(
        Object.entries(danawaSpecs).map(([id, specs]) => [id, Object.keys(specs).length])
      ),
      fullData: danawaSpecs
    });
  }, [danawaSpecs]);

  // Tag-based flow: 4개 제품 (앵커 + 추천 3개), Normal flow: 추천 3개
  // 단, 앵커 제품이 Top 3에 포함된 경우 앵커를 숨김 (중복 방지)
  // useMemo로 메모이제이션하여 무한 루프 방지
  const displayProducts = useMemo(() => {
    if (isTagBasedFlow && anchorProduct) {
      const anchorId = String(anchorProduct.productId);

      // 앵커 제품이 Top 3에 포함되어 있는지 확인
      const isAnchorInTop3 = recommendations.some(rec => rec.product.id === anchorId);

      if (isAnchorInTop3) {
        // 앵커가 Top 3에 포함됨 → 해당 제품에 기준 표시 추가 (중복 카드 생성 안 함)
        console.log('🎯 Anchor product is in Top 3 - marking as anchor in recommendations');
        return recommendations.slice(0, 3).map(rec => {
          if (rec.product.id === anchorId) {
            return {
              ...rec,
              reasoning: '비교 기준 제품', // 기준 배지 표시를 위해 reasoning 변경
            };
          }
          return rec;
        });
      }

      // 앵커가 Top 3에 없음 → 기존 로직 (앵커 + 추천 3개)
      console.log('📌 Anchor product not in Top 3 - showing anchor as reference');
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

  // 앵커 제품이 변경될 때 선택 상태 업데이트
  useEffect(() => {
    if (displayProducts.length >= 2) {
      const currentDisplayIds = displayProducts.map(p => p.product.id);

      // 현재 선택된 ID들이 새로운 displayProducts에 유효한지 확인
      const validSelectedIds = selectedProductIds.filter(id => currentDisplayIds.includes(id));

      // 유효하지 않은 선택이거나 2개 미만이면 자동으로 처음 2개 선택
      if (validSelectedIds.length < 2) {
        const newSelection = [displayProducts[0].product.id, displayProducts[1].product.id];
        setSelectedProductIds(newSelection);
        console.log('🔄 Product selection updated (auto):', newSelection);
      }
    }
  }, [displayProducts, selectedProductIds]);

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
        // 제품 선택 로깅
        const selectedProduct = displayProducts.find(rec => rec.product.id === productId);
        if (selectedProduct) {
          logButtonClick(
            `비교표_제품선택_${selectedProduct.product.brand}_${selectedProduct.product.title}`,
            'compare'
          );
        }

        if (prev.length >= 2) {
          return [...prev.slice(1), productId];
        } else {
          return [...prev, productId];
        }
      }
    });
  };

  // 캐시된 데이터 사용 (부모에서 전달받은 경우)
  // cachedDetails가 업데이트되면 productDetails를 동기화하고 fetchedIdsRef도 업데이트
  useEffect(() => {
    if (cachedDetails && Object.keys(cachedDetails).length > 0) {
      const cachedIds = Object.keys(cachedDetails);
      console.log('✅ Using cached details from parent:', cachedIds.length, 'products');

      // productDetails 업데이트 (기존 데이터와 병합)
      setProductDetails(prev => ({
        ...prev,
        ...cachedDetails,
      }));

      // fetchedIdsRef 업데이트 (중복 API 호출 방지)
      cachedIds.forEach(id => fetchedIdsRef.current.add(id));

      // 로딩 상태 해제
      setLoadingProductIds(new Set());
    }
  }, [cachedDetails]);

  // productIds를 메모이제이션하여 불필요한 API 호출 방지
  const productIds = useMemo(
    () => displayProducts.map(rec => rec.product.id),
    [displayProducts]
  );

  // v2 API로 통일 - /api/v2/comparison-analysis 사용
  // 앵커 제품이 TOP 3에 없으면 해당 제품만 별도로 API 호출
  useEffect(() => {
    // 이미 fetch 중이면 skip
    if (fetchingRef.current) {
      console.log('⏭️ [comparison] Already fetching, skipping...');
      return;
    }

    // v1 flow: /api/v2/comparison-analysis로 통일 (productIds로 요청)
    if (!isTagBasedFlow) {
      // 이미 모든 제품 데이터를 가져왔으면 skip
      const allFetched = productIds.every(id => fetchedIdsRef.current.has(id));
      if (allFetched && Object.keys(productDetailsRef.current).length > 0) {
        console.log('✅ [v1 flow] All products already fetched, skipping API call');
        return;
      }

      const fetchProductDetails = async () => {
        fetchingRef.current = true;
        setLoadingProductIds(new Set(productIds)); // 모든 제품 로딩 시작
        try {
          console.log('🔄 Fetching comparison data for products (v1 flow → v2 API):', productIds);
          const response = await fetch('/api/v2/comparison-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey: category || 'milk_powder_port',
              productIds,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.productDetails) {
              setProductDetails(data.data.productDetails);
              // fetch 완료된 ID 기록
              productIds.forEach(id => fetchedIdsRef.current.add(id));
              console.log('✅ Comparison data fetched successfully (v2 API)');
            }
          } else {
            const errorData = await response.json();
            console.error('❌ Failed to fetch comparison data:', response.status, errorData);
          }
        } catch (error) {
          console.error('Failed to fetch product details:', error);
        } finally {
          setLoadingProductIds(new Set()); // 로딩 완료
          fetchingRef.current = false;
        }
      };
      fetchProductDetails();
      return;
    }

    // v2 flow: ResultCards에서 이미 API를 호출하므로 cachedDetails를 우선 사용
    // cachedDetails가 비어있으면 ResultCards의 API 호출을 기다림 (초기 로딩 상태)
    const cachedIds = cachedDetails ? Object.keys(cachedDetails) : [];
    const existingIds = Object.keys(productDetailsRef.current);
    const alreadyFetchedIds = Array.from(fetchedIdsRef.current);
    const allAvailableIds = new Set([...cachedIds, ...existingIds, ...alreadyFetchedIds]);

    // Top 3 제품 ID (ResultCards에서 호출하는 제품들)
    const top3Ids = productIds.slice(0, 3);
    const missingProductIds = productIds.filter(id => !allAvailableIds.has(id));

    console.log('🔍 [v2 flow] Checking comparison data:', {
      productIds,
      cachedIds: cachedIds.length,
      existingIds: existingIds.length,
      alreadyFetchedIds: alreadyFetchedIds.length,
      missingProductIds
    });

    // 모든 제품이 캐시나 내부 상태에 있으면 사용
    if (missingProductIds.length === 0) {
      console.log('✅ Using cached/existing comparison data');
      setLoadingProductIds(new Set()); // 로딩 완료
      return;
    }

    // Top 3 제품은 ResultCards에서 API 호출 중이므로 기다림 (중복 호출 방지)
    // 단, 앵커 제품 등 추가 제품만 직접 호출
    const top3Missing = missingProductIds.filter(id => top3Ids.includes(id));
    if (top3Missing.length > 0 && cachedIds.length === 0 && alreadyFetchedIds.length === 0) {
      console.log('⏳ [v2 flow] Waiting for ResultCards to fetch Top 3 comparison data...');
      // ResultCards의 API 호출을 기다림 (cachedDetails가 업데이트되면 다시 체크됨)
      return;
    }

    // 누락된 제품만 API 호출
    const fetchComparisonData = async () => {
      fetchingRef.current = true;
      // 실제로 없는 제품만 fetch
      const idsToFetch = missingProductIds;
      console.log('📌 Fetching comparison data for missing products:', { idsToFetch });

      if (idsToFetch.length === 0) {
        setLoadingProductIds(new Set()); // 로딩 완료
        fetchingRef.current = false;
        return;
      }

      // 로딩 중인 제품 ID만 설정 (누락된 제품만)
      setLoadingProductIds(new Set(idsToFetch));
      try {
        // 비교를 위해 최소 2개 필요 - 부분 요청 시 기존 캐시 제품 1개 추가
        let compareIds = idsToFetch;
        if (idsToFetch.length === 1 && cachedIds.length > 0) {
          compareIds = [...idsToFetch, cachedIds[0]];
        }

        if (compareIds.length >= 1) {
          // v2 API 사용 - productIds로 요청하면 Supabase에서 조회
          const response = await fetch('/api/v2/comparison-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey: category,
              productIds: compareIds,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.productDetails) {
              // 기존 캐시 + 새로 가져온 데이터 병합
              setProductDetails(prev => ({
                ...prev,
                ...data.data.productDetails,
              }));
              // fetch 완료된 ID 기록
              compareIds.forEach(id => fetchedIdsRef.current.add(id));
              console.log('✅ Comparison data fetched (v2 API):', Object.keys(data.data.productDetails));
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch comparison data:', error);
      } finally {
        setLoadingProductIds(new Set()); // 로딩 완료
        fetchingRef.current = false;
      }
    };

    fetchComparisonData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds, category, isTagBasedFlow]); // cachedDetails 의존성 제거 - 별도 useEffect에서 동기화

  if (allProducts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="comparison-table-section space-y-0 mb-8"
    >
      {/* 상품 선택 UI */}
      <div className="bg-white py-3 px-0">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {isTagBasedFlow && anchorProduct ? '추천 제품 비교' : '상세 비교표'}
        </h3>
        <p className="text-xs text-gray-500 mb-3">2개를 선택해서 비교해보세요</p>
        <div className={`grid gap-3 ${displayProducts.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
                  {/* 앵커 표시 (랭킹 뱃지 제거) */}
                  {isAnchor && (
                    <div className="absolute top-0 left-0 px-1.5 py-1.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                      <span className="text-white font-bold text-[9px] leading-none">기준</span>
                    </div>
                  )}
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
                        {/* 앵커 표시 (랭킹 뱃지 제거) */}
                        {selectedRecommendations[0]?.reasoning === '비교 기준 제품' && (
                          <div className="absolute top-0 left-0 px-1.5 py-0.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                            <span className="text-white font-bold text-[9px] leading-none">기준</span>
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
                        {/* 앵커 표시 (랭킹 뱃지 제거) */}
                        {selectedRecommendations[1]?.reasoning === '비교 기준 제품' && (
                          <div className="absolute top-0 left-0 px-1.5 py-0.5 rounded-tl-lg rounded-br-md flex items-center justify-center" style={{ backgroundColor: '#0074F3' }}>
                            <span className="text-white font-bold text-[9px] leading-none">기준</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
          <tbody>
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
                              logComparisonDetailViewClick(
                                selectedRecommendations[0].product.id,
                                selectedRecommendations[0].product.title,
                                selectedRecommendations[0].product.brand,
                                selectedRecommendations[0].rank,
                                'compare'
                              );
                              onProductClick(selectedRecommendations[0]);
                            }
                          }}
                          className="w-full py-2.5 text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                        >
                          상세보기
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            logButtonClick('기준제품_변경하기_버튼_클릭', 'compare');
                            setIsChangeAnchorOpen(true);
                          }}
                          className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors"
                          style={{ backgroundColor: '#F0F7FF', color: '#0074F3' }}
                        >
                          기준제품 변경하기
                        </button>
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
                              logComparisonDetailViewClick(
                                selectedRecommendations[1].product.id,
                                selectedRecommendations[1].product.title,
                                selectedRecommendations[1].product.brand,
                                selectedRecommendations[1].rank,
                                'compare'
                              );
                              onProductClick(selectedRecommendations[1]);
                            }
                          }}
                          className="w-full py-2.5 text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                        >
                          상세보기
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            logButtonClick('기준제품_변경하기_버튼_클릭', 'compare');
                            setIsChangeAnchorOpen(true);
                          }}
                          className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors"
                          style={{ backgroundColor: '#F0F7FF', color: '#0074F3' }}
                        >
                          기준제품 변경하기
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* 브랜드 */}
            <tr className="border-b border-gray-100">
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-xs text-gray-700 leading-tight font-semibold">
                  {selectedRecommendations[0]?.product.brand || '-'}
                </p>
              </td>
              <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                브랜드
              </td>
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-xs text-gray-700 leading-tight font-semibold">
                  {selectedRecommendations[1]?.product.brand || '-'}
                </p>
              </td>
            </tr>

            {/* 제품명 */}
            <tr className="border-b border-gray-100">
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-xs text-gray-900 leading-tight font-semibold">
                  {selectedRecommendations[0]?.product.title}
                </p>
              </td>
              <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                제품명
              </td>
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-xs text-gray-900 leading-tight font-semibold">
                  {selectedRecommendations[1]?.product.title}
                </p>
              </td>
            </tr>

            {/* 가격 */}
            <tr className="border-b border-gray-100">
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-sm font-bold text-gray-900">
                  {selectedRecommendations[0]?.product.price.toLocaleString()}원
                </p>
              </td>
              <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                가격
              </td>
              <td className="py-2 px-2 text-center w-[40%]">
                <p className="text-sm font-bold text-gray-900">
                  {selectedRecommendations[1]?.product.price.toLocaleString()}원
                </p>
              </td>
            </tr>

            {/* 적합도 */}
            {showScore && (
              <tr className="border-b border-gray-100">
                <td className="py-2 px-2 text-center w-[40%]">
                  <p className="text-sm font-bold" style={{ color: '#009896' }}>
                    {selectedRecommendations[0]?.finalScore}%
                  </p>
                </td>
                <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                  적합도
                </td>
                <td className="py-2 px-2 text-center w-[40%]">
                  <p className="text-sm font-bold" style={{ color: '#009896' }}>
                    {selectedRecommendations[1]?.finalScore}%
                  </p>
                </td>
              </tr>
            )}

            {/* 장점 - 로딩 중이거나 둘 다 빈 배열이 아닐 때만 표시 */}
            {(() => {
              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];
              const details1 = product1 ? productDetails[product1.id] : null;
              const details2 = product2 ? productDetails[product2.id] : null;
              const isLoading1 = product1 && (loadingProductIds.has(product1.id) || isWaitingForCache);
              const isLoading2 = product2 && (loadingProductIds.has(product2.id) || isWaitingForCache);
              const hasPros1 = details1?.pros && details1.pros.length > 0;
              const hasPros2 = details2?.pros && details2.pros.length > 0;

              // 로딩 중이거나, 둘 중 하나라도 장점이 있으면 표시
              const shouldShow = isLoading1 || isLoading2 || hasPros1 || hasPros2;
              if (!shouldShow) return null;

              return (
                <tr className="border-b border-gray-100">
                  {/* 왼쪽 제품 */}
                  <td className="py-2 px-2 align-top w-[40%]">
                    {isLoading1 ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-xs text-gray-500">분석 중...</span>
                      </div>
                    ) : hasPros1 ? (
                      <div className="space-y-1.5">
                        {details1!.pros.slice(0, 3).map((pro, idx) => (
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
                      <p className="text-xs text-gray-400">-</p>
                    )}
                  </td>

                  {/* 중앙 레이블 */}
                  <td className="py-2 px-2 text-center align-top text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                    장점
                  </td>

                  {/* 오른쪽 제품 */}
                  <td className="py-2 px-2 align-top w-[40%]">
                    {isLoading2 ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-xs text-gray-500">분석 중...</span>
                      </div>
                    ) : hasPros2 ? (
                      <div className="space-y-1.5">
                        {details2!.pros.slice(0, 3).map((pro, idx) => (
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
                      <p className="text-xs text-gray-400">-</p>
                    )}
                  </td>
                </tr>
              );
            })()}

            {/* 주의점 - 로딩 중이거나 둘 다 빈 배열이 아닐 때만 표시 */}
            {(() => {
              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];
              const details1 = product1 ? productDetails[product1.id] : null;
              const details2 = product2 ? productDetails[product2.id] : null;
              const isLoading1 = product1 && (loadingProductIds.has(product1.id) || isWaitingForCache);
              const isLoading2 = product2 && (loadingProductIds.has(product2.id) || isWaitingForCache);
              const hasCons1 = details1?.cons && details1.cons.length > 0;
              const hasCons2 = details2?.cons && details2.cons.length > 0;

              // 로딩 중이거나, 둘 중 하나라도 주의점이 있으면 표시
              const shouldShow = isLoading1 || isLoading2 || hasCons1 || hasCons2;
              if (!shouldShow) return null;

              return (
                <tr className="border-b border-gray-100">
                  {/* 왼쪽 제품 */}
                  <td className="py-2 px-2 align-top w-[40%]">
                    {isLoading1 ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin"></div>
                        <span className="text-xs text-gray-500">분석 중...</span>
                      </div>
                    ) : hasCons1 ? (
                      <div className="space-y-1.5">
                        {details1!.cons.slice(0, 3).map((con, idx) => (
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
                      <p className="text-xs text-gray-400">-</p>
                    )}
                  </td>

                  {/* 중앙 레이블 */}
                  <td className="py-2 px-2 text-center align-top text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                    주의점
                  </td>

                  {/* 오른쪽 제품 */}
                  <td className="py-2 px-2 align-top w-[40%]">
                    {isLoading2 ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin"></div>
                        <span className="text-xs text-gray-500">분석 중...</span>
                      </div>
                    ) : hasCons2 ? (
                      <div className="space-y-1.5">
                        {details2!.cons.slice(0, 3).map((con, idx) => (
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
                      <p className="text-xs text-gray-400">-</p>
                    )}
                  </td>
                </tr>
              );
            })()}

            {/* 스펙 비교 */}
            {/* normalizedSpecs 또는 danawaSpecs/productDetails가 있으면 스펙 섹션 표시 */}
            {!isLoadingComparison && (normalizedSpecs.length > 0 || Object.keys(productDetails).length > 0 || Object.keys(danawaSpecs).length > 0) && (() => {
              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];
              if (!product1 || !product2) return null;

              // normalizedSpecs가 있으면 해당 데이터 사용 (LLM이 정규화한 스펙)
              if (normalizedSpecs.length > 0) {
                console.log(`🎯 [NORMALIZED SPECS] Using ${normalizedSpecs.length} normalized spec rows`);

                // 선택된 두 제품에 대한 값만 필터링
                const filteredSpecs = normalizedSpecs.filter(row => {
                  const val1 = row.values[product1.id];
                  const val2 = row.values[product2.id];
                  // 양쪽 모두 null이거나 빈 값이면 제외
                  const isEmpty1 = !val1 || val1 === '-' || val1 === '';
                  const isEmpty2 = !val2 || val2 === '-' || val2 === '';
                  return !(isEmpty1 && isEmpty2);
                });

                if (filteredSpecs.length === 0) return null;

                return (
                  <>
                    {filteredSpecs.map((row, idx) => {
                      const rawVal1 = row.values[product1.id];
                      const rawVal2 = row.values[product2.id];

                      // null, "null", undefined, 빈문자열 처리
                      const isEmpty = (v: string | null | undefined) =>
                        v === null || v === undefined || v === '' || v === 'null' || v === '-';

                      const isEmpty1 = isEmpty(rawVal1);
                      const isEmpty2 = isEmpty(rawVal2);

                      // 양쪽 다 비어있으면 row 숨김
                      if (isEmpty1 && isEmpty2) return null;

                      const value1 = isEmpty1 ? '정보없음' : rawVal1!;
                      const value2 = isEmpty2 ? '정보없음' : rawVal2!;

                      return (
                        <tr key={`normalized-${idx}`} className="border-b border-gray-100">
                          <td className={`py-2 px-2 text-center text-xs w-[40%] ${isEmpty1 ? 'text-gray-400' : 'text-gray-700'}`}>{value1}</td>
                          <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">{row.key}</td>
                          <td className={`py-2 px-2 text-center text-xs w-[40%] ${isEmpty2 ? 'text-gray-400' : 'text-gray-700'}`}>{value2}</td>
                        </tr>
                      );
                    })}
                  </>
                );
              }

              // Fallback: 기존 방식 (normalizedSpecs가 없는 경우)
              // 기존 스펙과 다나와 스펙 병합 (다나와 스펙 우선)
              const baseSpecs1 = productDetails[product1.id]?.specs || {};
              const baseSpecs2 = productDetails[product2.id]?.specs || {};
              const danawaSpecs1 = danawaSpecs[product1.id] || {};
              const danawaSpecs2 = danawaSpecs[product2.id] || {};

              console.log(`🔀 [FALLBACK] Using legacy spec merge for ${product1.id}, ${product2.id}`);

              // 다나와 스펙이 있으면 우선 사용, 없으면 기존 스펙 사용
              const specs1 = { ...baseSpecs1, ...danawaSpecs1 };
              const specs2 = { ...baseSpecs2, ...danawaSpecs2 };

              // 스펙이 하나도 없으면 표시 안 함
              if (Object.keys(specs1).length === 0 && Object.keys(specs2).length === 0) return null;

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

              if (specKeys.length === 0 && metaSpecKeys.length === 0) {
                console.log(`⚠️ [RENDER] No specs to display - both specKeys and metaSpecKeys are empty`);
                return null;
              }

              return (
                <>
                  {/* 상세 스펙 항상 표시 */}
                  <tr className="border-b border-gray-100">
                    <td colSpan={3} className="py-3 px-3">
                            {/* 통합 스펙 테이블 (메타 정보 + 상세 스펙) */}
                            {(metaSpecKeys.length > 0 || specKeys.length > 0) && (
                              <table className="w-full text-xs">
                                <tbody>
                                  {/* 메타 정보 */}
                                  {metaSpecKeys.map((key, idx) => {
                                    const rawVal1 = specs1[key];
                                    const rawVal2 = specs2[key];
                                    const value1 = rawVal1 != null ? String(rawVal1) : '-';
                                    const value2 = rawVal2 != null ? String(rawVal2) : '-';
                                    // 양쪽 모두 비어있으면 skip
                                    if ((value1 === '-' || !value1) && (value2 === '-' || !value2)) return null;

                                    return (
                                      <tr key={`meta-${idx}`} className="border-b border-gray-100">
                                        <td className="py-2 px-2 text-left text-gray-700 w-[40%]">{value1}</td>
                                        <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">{key}</td>
                                        <td className="py-2 px-2 text-right text-gray-700 w-[40%]">{value2}</td>
                                      </tr>
                                    );
                                  })}

                                  {/* 상세 스펙 - 콤마로 구분된 값은 개별 row로 분리 */}
                                  {specKeys.flatMap((key, idx) => {
                                    // 값을 문자열로 변환 (number, object 등 처리)
                                    const rawValue1 = specs1[key];
                                    const rawValue2 = specs2[key];
                                    const value1 = rawValue1 != null ? String(rawValue1) : '-';
                                    const value2 = rawValue2 != null ? String(rawValue2) : '-';

                                    // 콤마로 구분된 값 감지 (특징, 부가기능 등)
                                    const isFeatureList = (val: string) => {
                                      if (!val || val === '-' || typeof val !== 'string') return false;
                                      // 콤마가 3개 이상이면 분리 (크기 정보가 포함되어 있어도 분리)
                                      const commaCount = (val.match(/,/g) || []).length;
                                      return commaCount >= 3;
                                    };

                                    const shouldSplit = isFeatureList(value1) || isFeatureList(value2);

                                    if (shouldSplit) {
                                      // 콤마로 분리하여 개별 row 생성
                                      const items1 = value1 !== '-' ? String(value1).split(',').map((s: string) => s.trim()).filter(Boolean) : [];
                                      const items2 = value2 !== '-' ? String(value2).split(',').map((s: string) => s.trim()).filter(Boolean) : [];
                                      const maxLen = Math.max(items1.length, items2.length);

                                      return Array.from({ length: maxLen }).map((_, i) => (
                                        <tr key={`spec-${idx}-${i}`} className="border-b border-gray-100 last:border-0">
                                          <td className="py-1.5 px-2 text-left text-gray-700 w-[40%]">
                                            {items1[i] ? (
                                              <span className="inline-flex items-center">
                                                {items1[i].includes(':') ? items1[i] : (
                                                  <>
                                                    <svg className="w-3 h-3 mr-1 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    {items1[i]}
                                                  </>
                                                )}
                                              </span>
                                            ) : '-'}
                                          </td>
                                          <td className="py-1.5 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">
                                            {i === 0 ? key : ''}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-gray-700 w-[40%]">
                                            {items2[i] ? (
                                              <span className="inline-flex items-center justify-end">
                                                {items2[i].includes(':') ? items2[i] : (
                                                  <>
                                                    {items2[i]}
                                                    <svg className="w-3 h-3 ml-1 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                  </>
                                                )}
                                              </span>
                                            ) : '-'}
                                          </td>
                                        </tr>
                                      ));
                                    }

                                    // 일반 스펙 (분리하지 않음)
                                    return (
                                      <tr key={`spec-${idx}`} className="border-b border-gray-100 last:border-0">
                                        <td className="py-2 px-2 text-left text-gray-700 w-[40%]">{value1}</td>
                                        <td className="py-2 px-2 text-center text-xs font-medium text-gray-500 bg-gray-50 w-[20%]">{key}</td>
                                        <td className="py-2 px-2 text-right text-gray-700 w-[40%]">{value2}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                    </td>
                  </tr>
                </>
              );
            })()}

            {/* 한줄 비교 정리 - 맨 아래 배치, 둘 다 비어있으면 숨김 */}
            {(() => {
              // 로딩 중이면 표시하지 않음
              if (isLoadingComparison || isWaitingForCache) return null;
              if (selectedProducts.length !== 2) return null;

              const product1 = selectedProducts[0];
              const product2 = selectedProducts[1];
              const details1 = product1 ? productDetails[product1.id] : null;
              const details2 = product2 ? productDetails[product2.id] : null;
              const hasComparison1 = details1?.comparison && details1.comparison.trim().length > 0;
              const hasComparison2 = details2?.comparison && details2.comparison.trim().length > 0;

              // 둘 다 비어있으면 숨김
              if (!hasComparison1 && !hasComparison2) return null;

              return (
                <tr className="bg-gray-50">
                  <td colSpan={3} className="py-3 px-3 rounded-b-xl">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">📊 한줄 비교</h4>
                    <div className="space-y-2.5">
                      {selectedProducts.map((product, index) => {
                        if (!product) return null;
                        const details = productDetails[product.id];
                        if (!details || !details.comparison || details.comparison.trim().length === 0) return null;

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
              );
            })()}

          </tbody>
        </table>
      </div>
      )}

      {/* 기준제품 변경 바텀시트 */}
      {isTagBasedFlow && category && (
        <AnchorProductChangeBottomSheet
          isOpen={isChangeAnchorOpen}
          onClose={() => setIsChangeAnchorOpen(false)}
          currentCategory={category}
          currentAnchorProductId={anchorProduct?.productId || ''}
          onSelectProduct={(newProduct) => {
            if (onAnchorChange) {
              const newAnchorId = String(newProduct.productId);
              // 새 앵커 제품 ID만 로딩 상태로 설정
              setLoadingProductIds(new Set([newAnchorId]));
              // 기존 비교 데이터에서 새 앵커 제품만 제거 (다른 제품 데이터는 유지)
              setProductDetails(prev => {
                const updated = { ...prev };
                delete updated[newAnchorId];
                return updated;
              });
              onAnchorChange(newProduct);
            }
          }}
          useV2Api={isTagBasedFlow}
        />
      )}
    </motion.div>
  );
}
