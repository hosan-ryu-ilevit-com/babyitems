/**
 * Knowledge Agent - Supabase 캐시 조회 유틸리티
 *
 * knowledge_products_cache, knowledge_reviews_cache, knowledge_prices_cache
 * 테이블에서 미리 저장된 데이터를 조회합니다.
 */

import { createClient } from '@supabase/supabase-js';
import type { DanawaSearchListItem, DanawaFilterSection } from '@/lib/danawa/search-crawler';
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
  variants?: Array<{
    pcode: string;
    quantity: string;
    price: number | null;
    unitPrice: string | null;
    mallCount: number | null;
    rank?: string | null;
    isActive: boolean;
    productUrl: string;
  }> | null;
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

    // ✅ 디버그: DB에서 rank 값 확인
    console.log(`[SupabaseCache] DB rank 샘플 (처음 3개):`, data.slice(0, 3).map(r => ({ pcode: r.pcode, rank: r.rank })));

    const normalizeRank = (rank: unknown): number | null => {
      if (typeof rank === 'number' && Number.isFinite(rank)) return rank;
      if (typeof rank === 'string') {
        const parsed = parseInt(rank.replace(/[^\d]/g, ''), 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

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
      danawaRank: normalizeRank(row.rank),
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

    // 캐시에 데이터가 하나라도 있으면 hit으로 처리 (크롤링 방지)
    const hit = cachedPcodes.length > 0;

    console.log(`[KnowledgeCache] 리뷰 캐시 ${hit ? 'HIT' : 'MISS'}: ${cachedPcodes.length}/${pcodes.length}개 pcode, ${totalReviews}개 리뷰`);

    return { hit, reviews: reviewMap, totalReviews, source: 'cache' };
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

    const priceMap: Record<string, CachedPrice> = {};
    for (const row of data) {
      // mall_prices JSONB 처리
      const mallPrices = row.mall_prices && Array.isArray(row.mall_prices)
        ? row.mall_prices
        : [];

      priceMap[row.pcode] = {
        pcode: row.pcode,
        lowestPrice: row.lowest_price,
        lowestMall: row.lowest_mall,
        lowestDelivery: row.lowest_delivery,
        lowestLink: row.lowest_link,
        mallPrices: mallPrices,
        mallCount: row.mall_count || 0,
      };
    }

    console.log(`[KnowledgeCache] 가격 캐시 HIT: ${Object.keys(priceMap).length}/${pcodes.length}개 pcode`);

    return { hit: true, prices: priceMap, source: 'cache' };
  } catch (error) {
    console.error(`[KnowledgeCache] 가격 캐시 조회 에러:`, error);
    return { hit: false, prices: {}, source: 'crawl' };
  }
}

// ============================================================================
// 필터 캐시 조회
// ============================================================================

export interface FilterCacheResult {
  hit: boolean;
  filters: DanawaFilterSection[];
  cachedAt: string | null;
}

/**
 * 검색 쿼리로 캐시된 필터 목록 조회
 * @param query 검색 키워드
 * @returns 캐시된 필터 목록 (없으면 빈 배열)
 */
export async function getFiltersFromCache(
  query: string
): Promise<FilterCacheResult> {
  try {
    const { data, error } = await supabase
      .from('knowledge_filters_cache')
      .select('*')
      .eq('query', query)
      .single();

    if (error) {
      // PGRST116 = single row not found (정상적인 캐시 미스)
      if (error.code !== 'PGRST116') {
        console.warn(`[KnowledgeCache] 필터 캐시 조회 실패:`, error.message);
      }
      return { hit: false, filters: [], cachedAt: null };
    }

    if (!data || !data.filters) {
      console.log(`[KnowledgeCache] 필터 캐시 MISS: "${query}"`);
      return { hit: false, filters: [], cachedAt: null };
    }

    const filters = data.filters as DanawaFilterSection[];
    const cachedAt = data.crawled_at || null;
    console.log(`[KnowledgeCache] 필터 캐시 HIT: "${query}" - ${filters.length}개 섹션 (${cachedAt})`);

    return { hit: true, filters, cachedAt };
  } catch (error) {
    console.error(`[KnowledgeCache] 필터 캐시 조회 에러:`, error);
    return { hit: false, filters: [], cachedAt: null };
  }
}
