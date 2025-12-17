'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SourceInfo {
  title: string;
  uri: string;
  siteName: string;
  favicon: string;
  ogImage?: string;
}

export interface RealReviewsData {
  content: string;
  sources: SourceInfo[];
  elapsed: number;
  lowQuality: boolean;
  timestamp?: number;
}

interface UseRealReviewsCacheResult {
  data: Record<string, RealReviewsData>;
  loading: Record<string, boolean>;
  fetchReviews: (product: {
    pcode: string;
    title: string;
    brand?: string;
  }) => Promise<RealReviewsData | null>;
  refetch: (product: {
    pcode: string;
    title: string;
    brand?: string;
  }) => Promise<RealReviewsData | null>;
  prefetch: (products: Array<{
    pcode: string;
    title: string;
    brand?: string;
  }>) => void;
  clearCache: (pcode: string) => void;
  getCached: (pcode: string) => RealReviewsData | null;
  isLoading: (pcode: string) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_PREFIX = 'v2_real_reviews';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24시간

// ============================================================================
// Helper Functions
// ============================================================================

function getCacheKey(pcode: string): string {
  return `${CACHE_PREFIX}_${pcode}`;
}

function loadFromStorage(pcode: string): RealReviewsData | null {
  try {
    const cached = sessionStorage.getItem(getCacheKey(pcode));
    if (!cached) return null;

    const parsed = JSON.parse(cached) as RealReviewsData;

    // 캐시 유효성 검사 (24시간)
    if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
      return parsed;
    }

    // 만료된 캐시 삭제
    sessionStorage.removeItem(getCacheKey(pcode));
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(pcode: string, data: RealReviewsData): void {
  try {
    sessionStorage.setItem(getCacheKey(pcode), JSON.stringify(data));
  } catch (e) {
    console.warn('[RealReviewsCache] Save error:', e);
  }
}

function removeFromStorage(pcode: string): void {
  try {
    sessionStorage.removeItem(getCacheKey(pcode));
  } catch (e) {
    console.warn('[RealReviewsCache] Remove error:', e);
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useRealReviewsCache(): UseRealReviewsCacheResult {
  const [data, setData] = useState<Record<string, RealReviewsData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // 이미 fetch 중인 pcode 추적 (중복 요청 방지)
  const fetchingRef = useRef<Set<string>>(new Set());
  const prefetchedRef = useRef<Set<string>>(new Set());

  // 마운트 시 sessionStorage에서 캐시 복원
  useEffect(() => {
    // Note: 실제 복원은 getCached에서 lazy하게 처리
  }, []);

  /**
   * 캐시된 데이터 조회 (state → sessionStorage 순서)
   */
  const getCached = useCallback((pcode: string): RealReviewsData | null => {
    // 1. state에서 확인
    if (data[pcode]) {
      return data[pcode];
    }

    // 2. sessionStorage에서 확인
    const cached = loadFromStorage(pcode);
    if (cached) {
      // state에 복원
      setData(prev => ({ ...prev, [pcode]: cached }));
      return cached;
    }

    return null;
  }, [data]);

  /**
   * 로딩 상태 확인
   */
  const isLoading = useCallback((pcode: string): boolean => {
    return loading[pcode] || false;
  }, [loading]);

  /**
   * 리뷰 데이터 fetch
   */
  const fetchReviews = useCallback(async (product: {
    pcode: string;
    title: string;
    brand?: string;
  }): Promise<RealReviewsData | null> => {
    const { pcode, title, brand } = product;

    // 이미 로딩 중이면 스킵
    if (fetchingRef.current.has(pcode)) {
      console.log(`[RealReviewsCache] Already fetching: ${pcode}`);
      return null;
    }

    // 캐시 확인
    const cached = getCached(pcode);
    if (cached) {
      console.log(`[RealReviewsCache] Cache hit: ${title.slice(0, 20)}...`);
      return cached;
    }

    // fetch 시작
    fetchingRef.current.add(pcode);
    setLoading(prev => ({ ...prev, [pcode]: true }));

    try {
      const response = await fetch('/api/v2/real-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productTitle: title, brand, pcode }),
      });

      const result = await response.json();

      if (result.success) {
        const dataWithTimestamp: RealReviewsData = {
          ...result.data,
          timestamp: Date.now(),
        };

        // state 업데이트
        setData(prev => ({ ...prev, [pcode]: dataWithTimestamp }));

        // sessionStorage에 저장
        saveToStorage(pcode, dataWithTimestamp);

        console.log(`[RealReviewsCache] Fetched: ${title.slice(0, 20)}... (${result.data.elapsed}ms)`);
        return dataWithTimestamp;
      } else {
        console.error('[RealReviewsCache] API error:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[RealReviewsCache] Fetch error:', error);
      return null;
    } finally {
      fetchingRef.current.delete(pcode);
      setLoading(prev => ({ ...prev, [pcode]: false }));
    }
  }, [getCached]);

  /**
   * 캐시 삭제 (특정 pcode)
   */
  const clearCache = useCallback((pcode: string): void => {
    // state에서 제거
    setData(prev => {
      const newData = { ...prev };
      delete newData[pcode];
      return newData;
    });

    // sessionStorage에서 제거
    removeFromStorage(pcode);

    // prefetch 기록에서도 제거 (재요청 가능하도록)
    prefetchedRef.current.delete(pcode);

    console.log(`[RealReviewsCache] Cleared: ${pcode}`);
  }, []);

  /**
   * 강제 리페치 (캐시 무시)
   */
  const refetch = useCallback(async (product: {
    pcode: string;
    title: string;
    brand?: string;
  }): Promise<RealReviewsData | null> => {
    const { pcode } = product;

    // 기존 캐시 삭제
    clearCache(pcode);

    // 새로 fetch
    return fetchReviews(product);
  }, [clearCache, fetchReviews]);

  /**
   * 여러 제품 prefetch (백그라운드)
   */
  const prefetch = useCallback((products: Array<{
    pcode: string;
    title: string;
    brand?: string;
  }>) => {
    products.forEach(product => {
      // 이미 prefetch 했거나 캐시가 있으면 스킵
      if (prefetchedRef.current.has(product.pcode)) return;
      if (getCached(product.pcode)) return;

      prefetchedRef.current.add(product.pcode);

      // 백그라운드에서 fetch (결과 무시)
      fetchReviews(product).catch(() => {
        // prefetch 실패는 무시
      });
    });
  }, [fetchReviews, getCached]);

  return {
    data,
    loading,
    fetchReviews,
    refetch,
    prefetch,
    clearCache,
    getCached,
    isLoading,
  };
}
