'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DanawaPriceData } from '@/types/recommend-v2';

interface DanawaSpecs {
  [pcode: string]: Record<string, string>;
}

interface ReviewData {
  [pcode: string]: {
    reviewCount: number;
    averageRating: number;
  };
}

interface UseDanawaPricesResult {
  danawaData: Record<string, DanawaPriceData>;
  danawaSpecs: DanawaSpecs;
  reviewData: ReviewData;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Danawa 가격/스펙/리뷰 데이터를 조회하는 공통 훅
 * - ResultCards.tsx와 result/page.tsx에서 공통으로 사용
 * - API: /api/v2/result
 */
export function useDanawaPrices(pcodes: string[]): UseDanawaPricesResult {
  const [danawaData, setDanawaData] = useState<Record<string, DanawaPriceData>>({});
  const [danawaSpecs, setDanawaSpecs] = useState<DanawaSpecs>({});
  const [reviewData, setReviewData] = useState<ReviewData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 배열 참조 비교 대신 값 비교를 위해 JSON.stringify 사용
  const pcodesKey = useMemo(() => {
    const sortedPcodes = [...pcodes].sort();
    return sortedPcodes.join(',');
  }, [pcodes]);

  // 중복 fetch 방지용 ref
  const lastFetchedKeyRef = useRef<string>('');

  const fetchPrices = useCallback(async (pcodesToFetch: string[]) => {
    if (pcodesToFetch.length === 0) {
      console.log('⏭️ [useDanawaPrices] Skipping fetch - no pcodes');
      return;
    }

    setIsLoading(true);
    setError(null);

    console.log(`🔄 [useDanawaPrices] Fetching data for ${pcodesToFetch.length} products:`, pcodesToFetch);

    try {
      const response = await fetch('/api/v2/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pcodes: pcodesToFetch }),
      });

      const data = await response.json();
      console.log('📊 [useDanawaPrices] API response:', { success: data.success, pricesCount: data.data?.prices?.length, specsCount: data.data?.specs?.length });

      if (data.success) {
        // 가격 데이터 매핑
        const priceMap: Record<string, DanawaPriceData> = {};
        data.data.prices?.forEach((price: DanawaPriceData) => {
          priceMap[price.pcode] = price;
        });
        setDanawaData(priceMap);
        console.log(`✅ [useDanawaPrices] Loaded prices for ${Object.keys(priceMap).length} products`);

        // 스펙 + 리뷰 데이터 매핑
        const specsMap: DanawaSpecs = {};
        const reviewMap: ReviewData = {};
        const pcodesNeedingRating: string[] = [];

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

          // 평균별점이 없고 리뷰가 있는 제품 추적
          if ((!item.average_rating || item.average_rating === 0) && item.review_count && item.review_count > 0) {
            pcodesNeedingRating.push(item.pcode);
          }
        });

        setDanawaSpecs(specsMap);
        setReviewData(reviewMap);
        console.log(`✅ [useDanawaPrices] Loaded specs for ${Object.keys(specsMap).length} products`);
        console.log(`✅ [useDanawaPrices] Loaded reviews for ${Object.keys(reviewMap).length} products`);

        // 평균별점이 없는 제품 실시간 계산 (백그라운드)
        if (pcodesNeedingRating.length > 0) {
          console.log(`🔄 [useDanawaPrices] Calculating ratings for ${pcodesNeedingRating.length} products`);
          fetch('/api/v2/calculate-rating', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pcodes: pcodesNeedingRating }),
          })
            .then(res => res.json())
            .then(ratingData => {
              if (ratingData.success && ratingData.data) {
                // 계산된 평균별점으로 reviewData 업데이트
                const updatedReviewMap = { ...reviewMap };
                ratingData.data.forEach((item: { pcode: string; average_rating: number | null; review_count: number }) => {
                  if (item.average_rating && item.average_rating > 0) {
                    updatedReviewMap[item.pcode] = {
                      reviewCount: item.review_count || updatedReviewMap[item.pcode]?.reviewCount || 0,
                      averageRating: item.average_rating,
                    };
                  }
                });
                setReviewData(updatedReviewMap);
                console.log(`✅ [useDanawaPrices] Updated ratings for ${ratingData.data.filter((r: { source: string }) => r.source === 'calculated').length} products`);
              }
            })
            .catch(err => {
              console.warn('[useDanawaPrices] Rating calculation failed:', err);
            });
        }
      } else {
        console.error('❌ [useDanawaPrices] API returned success: false', data);
        setError('Failed to load price data');
      }
    } catch (e) {
      console.error('❌ [useDanawaPrices] Failed to fetch:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // pcodesKey (값 기반) 변경 시 자동 fetch
  useEffect(() => {
    if (!pcodesKey || pcodesKey === lastFetchedKeyRef.current) {
      if (pcodesKey === lastFetchedKeyRef.current && pcodesKey) {
        console.log('⏭️ [useDanawaPrices] Skipping duplicate fetch for:', pcodesKey);
      }
      return;
    }

    lastFetchedKeyRef.current = pcodesKey;
    fetchPrices(pcodes);
  }, [pcodesKey, pcodes, fetchPrices]);

  // refetch 함수 (수동 호출용)
  const refetch = useCallback(async () => {
    lastFetchedKeyRef.current = ''; // Reset to allow refetch
    await fetchPrices(pcodes);
  }, [fetchPrices, pcodes]);

  return {
    danawaData,
    danawaSpecs,
    reviewData,
    isLoading,
    error,
    refetch,
  };
}
