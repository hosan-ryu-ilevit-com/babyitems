/**
 * Knowledge Agent - Supabase 캐시 조회 유틸리티
 *
 * knowledge_products_cache, knowledge_reviews_cache, knowledge_prices_cache
 * 테이블에서 미리 저장된 데이터를 조회합니다.
 */

import { createClient } from '@supabase/supabase-js';
import type { DanawaSearchListItem } from '@/lib/danawa/search-crawler';
import type { ReviewLite } from '@/lib/danawa/review-crawler-lite';

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// Types
// ============================================================================

export interface CachedProduct {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  reviewCount: number;
  rating: number | null;
  specSummary: string;
  productUrl: string;
  rank: number;
  crawledAt: string;
}

export interface CachedReview {
  pcode: string;
  reviewId: string;
  rating: number;
  content: string;
  author: string | null;
  date: string | null;
  mallName: string | null;
  imageUrls: string[] | null;  // 포토 리뷰 이미지 URL
}

export interface CachedPrice {
  pcode: string;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  mallPrices: Array<{
    mall: string;
    price: number;
    delivery: string;
    link?: string;
  }>;
  mallCount: number;
}

export interface ProductCacheResult {
  hit: boolean;
  products: DanawaSearchListItem[];
  cachedAt: string | null;
  source: 'cache' | 'crawl';
}

export interface ReviewCacheResult {
  hit: boolean;
  reviews: Record<string, ReviewLite[]>;
  totalReviews: number;
  source: 'cache' | 'crawl';
}

export interface PriceCacheResult {
  hit: boolean;
  prices: Record<string, CachedPrice>;
  source: 'cache' | 'crawl';
}

// ============================================================================
// 제품 캐시 조회
// ============================================================================

/**
 * 검색 쿼리로 캐시된 제품 목록 조회
 * @param query 검색 키워드
 * @param limit 최대 개수 (기본: 120)
 * @returns 캐시된 제품 목록 (없으면 빈 배열)
 */
export async function getProductsFromCache(
  query: string,
  limit: number = 120
): Promise<ProductCacheResult> {
  try {
    const { data, error } = await supabase
      .from('knowledge_products_cache')
      .select('*')
      .eq('query', query)
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn(`[KnowledgeCache] 제품 캐시 조회 실패:`, error.message);
      return { hit: false, products: [], cachedAt: null, source: 'crawl' };
    }

    if (!data || data.length === 0) {
      console.log(`[KnowledgeCache] 제품 캐시 MISS: "${query}"`);
      return { hit: false, products: [], cachedAt: null, source: 'crawl' };
    }

    // DB 데이터를 DanawaSearchListItem 형식으로 변환
    const products: DanawaSearchListItem[] = data.map(row => ({
      pcode: row.pcode,
      name: row.name,
      brand: row.brand,
      price: row.price,
      thumbnail: row.thumbnail,
      reviewCount: row.review_count || 0,
      rating: row.rating,
      specSummary: row.spec_summary || '',
      productUrl: row.product_url || `https://prod.danawa.com/info/?pcode=${row.pcode}`,
    }));

    const cachedAt = data[0]?.crawled_at || null;
    console.log(`[KnowledgeCache] 제품 캐시 HIT: "${query}" - ${products.length}개 (${cachedAt})`);

    return { hit: true, products, cachedAt, source: 'cache' };
  } catch (error) {
    console.error(`[KnowledgeCache] 제품 캐시 조회 에러:`, error);
    return { hit: false, products: [], cachedAt: null, source: 'crawl' };
  }
}

// ============================================================================
// 리뷰 캐시 조회
// ============================================================================

/**
 * 여러 pcode의 리뷰를 캐시에서 조회
 * @param pcodes 제품 코드 배열
 * @returns pcode별 리뷰 맵
 */
export async function getReviewsFromCache(
  pcodes: string[]
): Promise<ReviewCacheResult> {
  if (pcodes.length === 0) {
    return { hit: false, reviews: {}, totalReviews: 0, source: 'crawl' };
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_reviews_cache')
      .select('*')
      .in('pcode', pcodes);

    if (error) {
      console.warn(`[KnowledgeCache] 리뷰 캐시 조회 실패:`, error.message);
      return { hit: false, reviews: {}, totalReviews: 0, source: 'crawl' };
    }

    if (!data || data.length === 0) {
      console.log(`[KnowledgeCache] 리뷰 캐시 MISS: ${pcodes.length}개 pcode`);
      return { hit: false, reviews: {}, totalReviews: 0, source: 'crawl' };
    }

    // pcode별로 그룹핑
    const reviewMap: Record<string, ReviewLite[]> = {};
    for (const row of data) {
      if (!reviewMap[row.pcode]) {
        reviewMap[row.pcode] = [];
      }
      // image_urls 처리: JSONB 배열 -> string[]
      const imageUrls = row.image_urls && Array.isArray(row.image_urls) && row.image_urls.length > 0
        ? row.image_urls as string[]
        : undefined;

      reviewMap[row.pcode].push({
        reviewId: row.review_id,
        rating: row.rating,
        content: row.content,
        author: row.author || undefined,
        date: row.review_date || undefined,
        mallName: row.mall_name || undefined,
        imageUrls,
      });
    }

    const cachedPcodes = Object.keys(reviewMap);
    const totalReviews = data.length;

    // 일부만 캐시에 있어도 hit으로 처리 (나머지는 crawl)
    const hitRatio = cachedPcodes.length / pcodes.length;
    const hit = hitRatio >= 0.5; // 50% 이상 캐시 히트면 캐시 사용

    console.log(`[KnowledgeCache] 리뷰 캐시 ${hit ? 'HIT' : 'PARTIAL'}: ${cachedPcodes.length}/${pcodes.length}개 pcode, ${totalReviews}개 리뷰`);

    return { hit, reviews: reviewMap, totalReviews, source: hit ? 'cache' : 'crawl' };
  } catch (error) {
    console.error(`[KnowledgeCache] 리뷰 캐시 조회 에러:`, error);
    return { hit: false, reviews: {}, totalReviews: 0, source: 'crawl' };
  }
}

// ============================================================================
// 가격 캐시 조회
// ============================================================================

/**
 * 여러 pcode의 가격을 캐시에서 조회
 * @param pcodes 제품 코드 배열
 * @returns pcode별 가격 맵
 */
export async function getPricesFromCache(
  pcodes: string[]
): Promise<PriceCacheResult> {
  if (pcodes.length === 0) {
    return { hit: false, prices: {}, source: 'crawl' };
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_prices_cache')
      .select('*')
      .in('pcode', pcodes);

    if (error) {
      console.warn(`[KnowledgeCache] 가격 캐시 조회 실패:`, error.message);
      return { hit: false, prices: {}, source: 'crawl' };
    }

    if (!data || data.length === 0) {
      console.log(`[KnowledgeCache] 가격 캐시 MISS: ${pcodes.length}개 pcode`);
      return { hit: false, prices: {}, source: 'crawl' };
    }

    // pcode별 맵 생성
    const priceMap: Record<string, CachedPrice> = {};
    for (const row of data) {
      priceMap[row.pcode] = {
        pcode: row.pcode,
        lowestPrice: row.lowest_price,
        lowestMall: row.lowest_mall,
        lowestDelivery: row.lowest_delivery,
        lowestLink: row.lowest_link,
        mallPrices: row.mall_prices || [],
        mallCount: row.mall_count || 0,
      };
    }

    const cachedCount = Object.keys(priceMap).length;
    const hitRatio = cachedCount / pcodes.length;
    const hit = hitRatio >= 0.5;

    console.log(`[KnowledgeCache] 가격 캐시 ${hit ? 'HIT' : 'PARTIAL'}: ${cachedCount}/${pcodes.length}개`);

    return { hit, prices: priceMap, source: hit ? 'cache' : 'crawl' };
  } catch (error) {
    console.error(`[KnowledgeCache] 가격 캐시 조회 에러:`, error);
    return { hit: false, prices: {}, source: 'crawl' };
  }
}

// ============================================================================
// 캐시 신선도 확인
// ============================================================================

/**
 * 캐시가 유효한지 (N일 이내) 확인
 * @param cachedAt 캐시 저장 시점
 * @param maxAgeDays 최대 허용 일수 (기본: 3일)
 */
export function isCacheFresh(cachedAt: string | null, maxAgeDays: number = 3): boolean {
  if (!cachedAt) return false;

  const cachedDate = new Date(cachedAt);
  const now = new Date();
  const diffMs = now.getTime() - cachedDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays <= maxAgeDays;
}

// ============================================================================
// 캐시 통계
// ============================================================================

/**
 * 캐시 통계 조회
 */
export async function getCacheStats(): Promise<{
  queries: string[];
  totalProducts: number;
  totalReviews: number;
  totalPrices: number;
}> {
  try {
    // 쿼리 목록
    const { data: queryData } = await supabase
      .from('knowledge_products_cache')
      .select('query')
      .order('crawled_at', { ascending: false });

    const queries = [...new Set((queryData || []).map(r => r.query))];

    // 카운트
    const { count: productCount } = await supabase
      .from('knowledge_products_cache')
      .select('*', { count: 'exact', head: true });

    const { count: reviewCount } = await supabase
      .from('knowledge_reviews_cache')
      .select('*', { count: 'exact', head: true });

    const { count: priceCount } = await supabase
      .from('knowledge_prices_cache')
      .select('*', { count: 'exact', head: true });

    return {
      queries,
      totalProducts: productCount || 0,
      totalReviews: reviewCount || 0,
      totalPrices: priceCount || 0,
    };
  } catch (error) {
    console.error(`[KnowledgeCache] 통계 조회 에러:`, error);
    return { queries: [], totalProducts: 0, totalReviews: 0, totalPrices: 0 };
  }
}
