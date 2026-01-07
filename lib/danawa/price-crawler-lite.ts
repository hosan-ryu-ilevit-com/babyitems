/**
 * 다나와 가격 조회 (Lite 버전)
 *
 * Knowledge Agent용 - Fly.io 크롤러 서버 사용
 * - 실시간 Puppeteer 크롤링 (동적 JS 로딩 지원)
 * - DB 캐시 fallback
 */

import { createClient } from '@supabase/supabase-js';
import type { DanawaPriceInfo } from '@/types/danawa';

// Supabase 클라이언트 (캐시 fallback용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fly.io 크롤러 서버 URL
const CRAWLER_SERVER_URL = process.env.CRAWLER_SERVER_URL || 'https://danawa-crawler.fly.dev';

// =====================================================
// Types
// =====================================================

export interface PriceCrawlResult {
  pcode: string;
  success: boolean;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  prices: DanawaPriceInfo[];
  mallCount: number;
  error?: string;
}

interface FlyioPriceResult {
  pcode: string;
  success: boolean;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  mallPrices: Array<{
    mall: string;
    price: number;
    delivery: string;
    seller?: string;
    link?: string;
  }>;
  mallCount: number;
  priceMin: number | null;
  priceMax: number | null;
  error?: string;
}

// =====================================================
// Fly.io 크롤러 호출
// =====================================================

/**
 * Fly.io 크롤러 서버에서 가격 크롤링
 */
async function fetchPricesFromFlyio(pcodes: string[]): Promise<Record<string, FlyioPriceResult>> {
  try {
    const response = await fetch(`${CRAWLER_SERVER_URL}/crawl/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pcodes }),
    });

    if (!response.ok) {
      throw new Error(`Fly.io crawler error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || {};
  } catch (error) {
    console.error('[fetchPricesFromFlyio] Error:', error);
    return {};
  }
}

/**
 * 단일 상품 가격 크롤링 (Fly.io)
 */
async function fetchSinglePriceFromFlyio(pcode: string): Promise<FlyioPriceResult | null> {
  try {
    const response = await fetch(`${CRAWLER_SERVER_URL}/crawl/price/${pcode}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Fly.io crawler error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[fetchSinglePriceFromFlyio] Error for ${pcode}:`, error);
    return null;
  }
}

// =====================================================
// DB 캐시 조회 (Fallback)
// =====================================================

/**
 * DB에서 캐시된 가격 조회
 */
async function fetchPricesFromDb(pcodes: string[]): Promise<Map<string, PriceCrawlResult>> {
  const resultMap = new Map<string, PriceCrawlResult>();

  try {
    const { data, error } = await supabase
      .from('danawa_prices')
      .select('*')
      .in('pcode', pcodes);

    if (error) {
      console.error('[fetchPricesFromDb] DB error:', error.message);
      return resultMap;
    }

    for (const row of data || []) {
      resultMap.set(row.pcode, {
        pcode: row.pcode,
        success: true,
        lowestPrice: row.lowest_price,
        lowestMall: row.lowest_mall,
        lowestDelivery: row.lowest_delivery,
        lowestLink: row.lowest_link,
        prices: row.mall_prices || [],
        mallCount: row.mall_count || 0,
      });
    }
  } catch (error) {
    console.error('[fetchPricesFromDb] Error:', error);
  }

  return resultMap;
}

// =====================================================
// 변환 함수
// =====================================================

/**
 * Fly.io 결과를 PriceCrawlResult로 변환
 */
function convertFlyioResult(flyioResult: FlyioPriceResult): PriceCrawlResult {
  return {
    pcode: flyioResult.pcode,
    success: flyioResult.success,
    lowestPrice: flyioResult.lowestPrice,
    lowestMall: flyioResult.lowestMall,
    lowestDelivery: flyioResult.lowestDelivery,
    lowestLink: flyioResult.lowestLink,
    prices: (flyioResult.mallPrices || []).map(mp => ({
      mall: mp.mall,
      price: mp.price,
      delivery: mp.delivery,
      seller: mp.seller,
      link: mp.link,
    })),
    mallCount: flyioResult.mallCount,
    error: flyioResult.error,
  };
}

// =====================================================
// Public API
// =====================================================

/**
 * 단일 상품 가격 조회
 * 1. Fly.io 크롤러에서 실시간 크롤링 시도
 * 2. 실패 시 DB 캐시에서 조회
 */
export async function fetchPricesLite(pcode: string): Promise<PriceCrawlResult> {
  const emptyResult: PriceCrawlResult = {
    pcode,
    success: false,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    lowestLink: null,
    prices: [],
    mallCount: 0,
  };

  try {
    // 1. Fly.io 크롤러 시도
    console.log(`[fetchPricesLite] Fetching from Fly.io: ${pcode}`);
    const flyioResult = await fetchSinglePriceFromFlyio(pcode);

    if (flyioResult && flyioResult.success) {
      console.log(`[fetchPricesLite] ✅ Fly.io success: ${pcode} - ${flyioResult.lowestPrice?.toLocaleString()}원`);
      return convertFlyioResult(flyioResult);
    }

    // 2. DB 캐시 fallback
    console.log(`[fetchPricesLite] Fly.io failed, trying DB cache: ${pcode}`);
    const dbResults = await fetchPricesFromDb([pcode]);
    const dbResult = dbResults.get(pcode);

    if (dbResult) {
      console.log(`[fetchPricesLite] ✅ DB cache hit: ${pcode}`);
      return dbResult;
    }

    console.log(`[fetchPricesLite] ❌ No price found: ${pcode}`);
    emptyResult.error = 'Price not found';
    return emptyResult;

  } catch (error) {
    console.error(`[fetchPricesLite] Error for ${pcode}:`, error);
    emptyResult.error = error instanceof Error ? error.message : 'Unknown error';
    return emptyResult;
  }
}

// =====================================================
// Batch Processing
// =====================================================

export interface BatchPricesOptions {
  maxPricesPerProduct?: number;
  concurrency?: number;
  delayBetweenChunks?: number;
  timeout?: number;
  onProgress?: (completed: number, total: number, result: PriceCrawlResult) => void;
}

/**
 * 여러 상품 가격 일괄 조회
 * 1. Fly.io 크롤러에서 실시간 크롤링
 * 2. 실패한 항목은 DB 캐시에서 조회
 */
export async function fetchPricesBatchParallel(
  pcodes: string[],
  options: BatchPricesOptions = {}
): Promise<PriceCrawlResult[]> {
  const { onProgress } = options;
  const results: PriceCrawlResult[] = [];
  const total = pcodes.length;

  if (pcodes.length === 0) {
    return results;
  }

  console.log(`[fetchPricesBatch] Starting for ${pcodes.length} products via Fly.io`);

  try {
    // 1. Fly.io 크롤러에서 모든 상품 크롤링
    const flyioResults = await fetchPricesFromFlyio(pcodes);
    const missingPcodes: string[] = [];

    // 결과 처리
    for (let i = 0; i < pcodes.length; i++) {
      const pcode = pcodes[i];
      const flyioResult = flyioResults[pcode];

      if (flyioResult && flyioResult.success) {
        const result = convertFlyioResult(flyioResult);
        results.push(result);
        onProgress?.(i + 1, total, result);
      } else {
        missingPcodes.push(pcode);
        // 일단 빈 결과 추가 (나중에 DB 캐시로 대체)
        results.push({
          pcode,
          success: false,
          lowestPrice: null,
          lowestMall: null,
          lowestDelivery: null,
          lowestLink: null,
          prices: [],
          mallCount: 0,
          error: flyioResult?.error || 'Fly.io crawl failed',
        });
      }
    }

    // 2. 실패한 항목은 DB 캐시에서 조회
    if (missingPcodes.length > 0) {
      console.log(`[fetchPricesBatch] ${missingPcodes.length} products failed, trying DB cache`);
      const dbResults = await fetchPricesFromDb(missingPcodes);

      // results 배열에서 실패한 항목 업데이트
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result.success) {
          const dbResult = dbResults.get(result.pcode);
          if (dbResult) {
            results[i] = dbResult;
            console.log(`[fetchPricesBatch] ✅ DB cache hit: ${result.pcode}`);
          }
        }
        onProgress?.(i + 1, total, results[i]);
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[fetchPricesBatch] Complete: ${successCount}/${total} successful`);

  } catch (error) {
    console.error('[fetchPricesBatch] Error:', error);

    // 에러 시 모든 항목에 대해 빈 결과 반환
    for (const pcode of pcodes) {
      const result: PriceCrawlResult = {
        pcode,
        success: false,
        lowestPrice: null,
        lowestMall: null,
        lowestDelivery: null,
        lowestLink: null,
        prices: [],
        mallCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.push(result);
      onProgress?.(results.length, total, result);
    }
  }

  return results;
}
