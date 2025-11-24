'use client';

import { useEffect, useState } from 'react';

export interface TagStats {
  tag: string;
  clickCount: number;
  isPopular: boolean;
}

export interface TagStatsData {
  pros: TagStats[];
  cons: TagStats[];
  lastUpdated: string;
}

/**
 * 태그 통계를 가져오는 훅
 * - 페이지 로드 시 최신 통계를 가져옵니다
 * - localStorage에 1시간 동안 캐싱합니다
 */
export function useTagStats() {
  const [tagStats, setTagStats] = useState<TagStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTagStats = async () => {
      try {
        // 캐시 확인 (1시간 TTL)
        const cached = localStorage.getItem('tag_stats_cache');
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          const oneHour = 60 * 60 * 1000;

          if (age < oneHour) {
            console.log('✅ Using cached tag stats');
            setTagStats(data);
            setIsLoading(false);
            return;
          }
        }

        // 캐시 없거나 만료됨 - API 호출
        console.log('🔄 Fetching fresh tag stats...');
        const response = await fetch('/api/tag-stats');

        if (!response.ok) {
          throw new Error(`Failed to fetch tag stats: ${response.status}`);
        }

        const data: TagStatsData = await response.json();

        // 캐싱
        localStorage.setItem('tag_stats_cache', JSON.stringify({
          data,
          timestamp: Date.now()
        }));

        setTagStats(data);
      } catch (err) {
        console.error('Failed to fetch tag stats:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // 에러 시 빈 데이터 반환
        setTagStats({
          pros: [],
          cons: [],
          lastUpdated: new Date().toISOString()
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTagStats();
  }, []);

  /**
   * 특정 태그가 인기 태그인지 확인
   */
  const isPopularTag = (tag: string, type: 'pros' | 'cons'): boolean => {
    if (!tagStats) return false;
    const stats = tagStats[type];
    return stats.some(s => s.tag === tag && s.isPopular);
  };

  /**
   * 태그 배열을 인기도 순으로 정렬
   */
  const sortByPopularity = (tags: string[], type: 'pros' | 'cons'): string[] => {
    if (!tagStats) return tags;

    return [...tags].sort((a, b) => {
      const aPopular = isPopularTag(a, type);
      const bPopular = isPopularTag(b, type);

      // 인기 태그를 먼저
      if (aPopular && !bPopular) return -1;
      if (!aPopular && bPopular) return 1;

      // 둘 다 인기거나 둘 다 비인기면 원래 순서 유지
      return 0;
    });
  };

  return {
    tagStats,
    isLoading,
    error,
    isPopularTag,
    sortByPopularity
  };
}
