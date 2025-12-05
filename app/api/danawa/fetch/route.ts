/**
 * 다나와 통합 API 엔드포인트
 *
 * POST /api/danawa/fetch
 * - Input: { query: string, forceRefresh?: boolean }
 * - Output: DanawaIntegratedResponse
 *
 * 프로세스:
 * 1. 검색 query → 다나와 상품 코드 찾기
 * 2. 캐시 확인 (forceRefresh가 false인 경우)
 * 3. 캐시 히트 시 반환
 * 4. 캐시 미스 시 크롤링 + 캐시 저장 + 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import type { DanawaIntegratedRequest, DanawaIntegratedResponse } from '@/types/danawa';
import { searchDanawaProduct, crawlDanawaProduct } from '@/lib/danawa/crawler';
import { getCachedDanawaData, saveDanawaDataToCache } from '@/lib/danawa/cache';

/**
 * Retry wrapper with exponential backoff
 * - Max 3 retries
 * - Delays: 1s, 2s, 4s
 * - Only retries on timeout errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 [Retry] ${operationName} - Attempt ${attempt}/${maxRetries}`);
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if it's a timeout error
      const isTimeout =
        error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('Navigation timeout') ||
          error.message.includes('waiting for selector') ||
          error.message.includes('Timeout'));

      if (!isTimeout || attempt === maxRetries) {
        // Don't retry if not a timeout or if we've exhausted retries
        if (isTimeout && attempt === maxRetries) {
          console.error(`❌ [Retry] ${operationName} - All ${maxRetries} attempts failed (timeout)`);
        }
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`⏳ [Retry] ${operationName} - Timeout detected, waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DanawaIntegratedRequest;
    const { query, forceRefresh = false } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Query parameter is required and must be a string',
        } as DanawaIntegratedResponse,
        { status: 400 }
      );
    }

    console.log(`\n🔍 [Danawa API] Fetching product: "${query}" (forceRefresh: ${forceRefresh})`);

    // Step 1: 다나와 검색 - 상품 코드 찾기 (with retry)
    const productCode = await retryWithBackoff(
      () => searchDanawaProduct(query),
      `Search Product "${query}"`,
      3
    );

    if (!productCode) {
      console.error(`❌ No product found for query: "${query}"`);
      return NextResponse.json(
        {
          success: false,
          error: `No product found for query: "${query}"`,
        } as DanawaIntegratedResponse,
        { status: 404 }
      );
    }

    console.log(`✅ Found product code: ${productCode}`);

    // Step 2: 캐시 확인 (forceRefresh가 false인 경우)
    if (!forceRefresh) {
      const cachedData = await getCachedDanawaData(productCode);
      if (cachedData) {
        console.log(`💨 Returning cached data for: ${productCode}`);
        return NextResponse.json({
          success: true,
          data: cachedData,
          cached: true,
        } as DanawaIntegratedResponse);
      }
    } else {
      console.log(`🔄 Forcing refresh, skipping cache...`);
    }

    // Step 3: 캐시 미스 → 크롤링 (with retry)
    console.log(`🕷️ Crawling product: ${productCode}...`);
    const productData = await retryWithBackoff(
      () => crawlDanawaProduct(productCode),
      `Crawl Product ${productCode}`,
      3
    );

    if (!productData) {
      console.error(`❌ Crawling returned null for product code: ${productCode}`);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to crawl product: ${productCode}`,
        } as DanawaIntegratedResponse,
        { status: 500 }
      );
    }

    console.log(`\n📦 [API Response] Preparing response...`);
    console.log(`   Product name: ${productData.name}`);
    console.log(`   Lowest price: ${productData.lowestPrice}`);
    console.log(`   Lowest mall: ${productData.lowestMall}`);
    console.log(`   Prices array length: ${productData.prices.length}`);

    // Step 4: 캐시에 저장
    await saveDanawaDataToCache(productData);

    // Step 5: 반환
    console.log(`✅ Successfully fetched and cached: ${productData.name} (${productData.lowestPrice}원)`);
    return NextResponse.json({
      success: true,
      data: productData,
      cached: false,
    } as DanawaIntegratedResponse);
  } catch (error) {
    console.error('[Danawa API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as DanawaIntegratedResponse,
      { status: 500 }
    );
  }
}
