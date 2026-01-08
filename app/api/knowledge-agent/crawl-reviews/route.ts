/**
 * Knowledge Agent - Crawl Reviews & Prices API
 *
 * Top3 상품의 리뷰 + 가격 병렬 크롤링
 * - 리뷰: review-crawler-lite 사용
 * - 가격: price-crawler-lite 사용
 * - SSE 스트리밍으로 진행상황 전송
 * - Supabase 캐시 우선 조회
 */

import { NextRequest } from 'next/server';
import {
  fetchReviewsBatchParallel,
  type ReviewLite,
} from '@/lib/danawa/review-crawler-lite';
import {
  fetchPricesBatchParallel,
  type PriceCrawlResult,
} from '@/lib/danawa/price-crawler-lite';
import type { DanawaPriceInfo } from '@/types/danawa';
import { getReviewsFromCache, getPricesFromCache } from '@/lib/knowledge-agent/supabase-cache';

export const maxDuration = 60;

interface CrawlReviewsRequest {
  pcodes: string[];
  maxPerProduct?: number;
  concurrency?: number;
  includePrices?: boolean;  // 가격 크롤링 포함 여부 (기본: true)
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const body: CrawlReviewsRequest = await request.json();
        const { pcodes, maxPerProduct = 5, concurrency = 8, includePrices = true } = body;

        if (!pcodes || pcodes.length === 0) {
          sendEvent('error', { message: 'No pcodes provided' });
          controller.close();
          return;
        }

        console.log(`\n📝 [CrawlReviews] Starting: ${pcodes.length}개 상품, 상품당 ${maxPerProduct}개 리뷰${includePrices ? ' + 가격' : ''}`);
        const startTime = Date.now();

        sendEvent('start', {
          totalProducts: pcodes.length,
          maxPerProduct,
          concurrency,
          includePrices,
        });

        // ====================================================================
        // 1. Supabase 캐시 우선 조회 (리뷰 + 가격)
        // ====================================================================
        const [reviewCache, priceCache] = await Promise.all([
          getReviewsFromCache(pcodes),
          includePrices ? getPricesFromCache(pcodes) : Promise.resolve({ hit: false, prices: {}, source: 'crawl' as const }),
        ]);

        // 캐시에서 충분히 데이터를 가져온 경우 바로 반환
        if (reviewCache.hit && reviewCache.totalReviews > 0) {
          console.log(`📝 [CrawlReviews] Supabase 캐시 HIT - 리뷰: ${reviewCache.totalReviews}개`);

          // 리뷰 캐시 결과 전송
          sendEvent('reviews_complete', {
            reviews: reviewCache.reviews,
            totalReviews: reviewCache.totalReviews,
            successCount: Object.keys(reviewCache.reviews).length,
            source: 'cache',
          });

          // 가격 캐시도 있으면 같이 전송
          if (priceCache.hit && Object.keys(priceCache.prices).length > 0) {
            console.log(`💰 [CrawlReviews] Supabase 가격 캐시 HIT - ${Object.keys(priceCache.prices).length}개`);

            const priceMap: Record<string, {
              lowestPrice: number | null;
              lowestMall: string | null;
              lowestDelivery: string | null;
              lowestLink: string | null;
              prices: DanawaPriceInfo[];
            }> = {};

            for (const [pcode, priceData] of Object.entries(priceCache.prices)) {
              priceMap[pcode] = {
                lowestPrice: priceData.lowestPrice,
                lowestMall: priceData.lowestMall,
                lowestDelivery: priceData.lowestDelivery,
                lowestLink: priceData.lowestLink,
                prices: priceData.mallPrices as DanawaPriceInfo[],
              };
            }

            const elapsedMs = Date.now() - startTime;
            sendEvent('complete', {
              success: true,
              totalProducts: pcodes.length,
              reviewSuccessCount: Object.keys(reviewCache.reviews).length,
              priceSuccessCount: Object.keys(priceMap).length,
              totalReviews: reviewCache.totalReviews,
              reviews: reviewCache.reviews,
              prices: priceMap,
              elapsedMs,
              source: 'cache',
              message: `캐시에서 ${Object.keys(reviewCache.reviews).length}개 상품 리뷰, ${Object.keys(priceMap).length}개 가격 조회 (${(elapsedMs / 1000).toFixed(1)}초)`,
            });

            console.log(`✅ [CrawlReviews] 캐시 완료: ${reviewCache.totalReviews}개 리뷰, ${Object.keys(priceMap).length}개 가격 (${(elapsedMs / 1000).toFixed(1)}초)`);
            controller.close();
            return;
          }
        }

        // ====================================================================
        // 2. 캐시 미스 - 실시간 크롤링
        // ====================================================================
        console.log(`📝 [CrawlReviews] 캐시 미스, 실시간 크롤링 시작...`);

        // 리뷰 + 가격 병렬 크롤링 (리뷰 완료 시 즉시 이벤트 전송)
        let reviewsCompleted = 0;
        let pricesCompleted = 0;

        // 리뷰 크롤링 Promise (완료 시 즉시 reviews_complete 이벤트 전송)
        const reviewPromise = fetchReviewsBatchParallel(pcodes, {
          maxReviewsPerProduct: maxPerProduct,
          concurrency,
          delayBetweenChunks: 200,
          skipMetadata: true,
          timeout: 5000,
          onProgress: (completed, total, result) => {
            reviewsCompleted = completed;
            sendEvent('progress', {
              type: 'reviews',
              completed,
              total,
              pcode: result.pcode,
              reviewCount: result.reviews.length,
              success: result.success,
            });
          },
        }).then(results => {
          // 리뷰 완료 즉시 reviews_complete 이벤트 전송
          const reviewMap: Record<string, ReviewLite[]> = {};
          let totalReviews = 0;
          for (const result of results) {
            if (result.success) {
              reviewMap[result.pcode] = result.reviews;
              totalReviews += result.reviews.length;
            }
          }
          console.log(`📝 [CrawlReviews] 리뷰 완료 즉시 전송: ${Object.keys(reviewMap).length}개 상품, ${totalReviews}개 리뷰`);
          sendEvent('reviews_complete', {
            reviews: reviewMap,
            totalReviews,
            successCount: Object.keys(reviewMap).length,
          });
          return results;
        });

        // 가격 크롤링 Promise
        const pricePromise = includePrices
          ? fetchPricesBatchParallel(pcodes, {
              maxPricesPerProduct: 10,
              concurrency: 4,
              delayBetweenChunks: 300,
              timeout: 10000,
              onProgress: (completed, total, result) => {
                pricesCompleted = completed;
                sendEvent('progress', {
                  type: 'prices',
                  completed,
                  total,
                  pcode: result.pcode,
                  priceCount: result.prices.length,
                  lowestPrice: result.lowestPrice,
                  success: result.success,
                });
              },
            })
          : Promise.resolve([]);

        const [reviewResults, priceResults] = await Promise.all([reviewPromise, pricePromise]);

        const elapsedMs = Date.now() - startTime;

        // pcode별 리뷰 맵 생성
        const reviewMap: Record<string, ReviewLite[]> = {};
        let totalReviews = 0;
        let reviewSuccessCount = 0;

        for (const result of reviewResults) {
          if (result.success) {
            reviewSuccessCount++;
            reviewMap[result.pcode] = result.reviews;
            totalReviews += result.reviews.length;
          }
        }

        // pcode별 가격 맵 생성
        const priceMap: Record<string, {
          lowestPrice: number | null;
          lowestMall: string | null;
          lowestDelivery: string | null;
          lowestLink: string | null;
          prices: DanawaPriceInfo[];
        }> = {};
        let priceSuccessCount = 0;

        for (const result of priceResults) {
          if (result.success) {
            priceSuccessCount++;
            priceMap[result.pcode] = {
              lowestPrice: result.lowestPrice,
              lowestMall: result.lowestMall,
              lowestDelivery: result.lowestDelivery,
              lowestLink: result.lowestLink,
              prices: result.prices,
            };
          }
        }

        // 최종 결과
        sendEvent('complete', {
          success: true,
          totalProducts: pcodes.length,
          reviewSuccessCount,
          priceSuccessCount,
          totalReviews,
          reviews: reviewMap,
          prices: priceMap,
          elapsedMs,
          message: `${reviewSuccessCount}/${pcodes.length} 상품 리뷰, ${priceSuccessCount}/${pcodes.length} 상품 가격 수집 (${(elapsedMs / 1000).toFixed(1)}초)`,
        });

        console.log(`✅ [CrawlReviews] 완료: ${totalReviews}개 리뷰, ${priceSuccessCount}개 가격 (${(elapsedMs / 1000).toFixed(1)}초)`);

      } catch (error) {
        console.error('[CrawlReviews] Error:', error);
        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Vercel/Nginx 버퍼링 비활성화
    },
  });
}

/**
 * 간단한 JSON 응답 (스트리밍 없이)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pcodesParam = searchParams.get('pcodes');
  const includePrices = searchParams.get('includePrices') !== 'false';

  if (!pcodesParam) {
    return new Response(JSON.stringify({ error: 'pcodes parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pcodes = pcodesParam.split(',').filter(p => p.trim());

  try {
    const [reviewResults, priceResults] = await Promise.all([
      fetchReviewsBatchParallel(pcodes, {
        maxReviewsPerProduct: 5,
        concurrency: 8,
        skipMetadata: true,
      }),
      includePrices
        ? fetchPricesBatchParallel(pcodes, {
            maxPricesPerProduct: 10,
            concurrency: 4,
          })
        : Promise.resolve([]),
    ]);

    const reviewMap: Record<string, ReviewLite[]> = {};
    for (const result of reviewResults) {
      if (result.success) {
        reviewMap[result.pcode] = result.reviews;
      }
    }

    const priceMap: Record<string, {
      lowestPrice: number | null;
      lowestMall: string | null;
      prices: DanawaPriceInfo[];
    }> = {};
    for (const result of priceResults) {
      if (result.success) {
        priceMap[result.pcode] = {
          lowestPrice: result.lowestPrice,
          lowestMall: result.lowestMall,
          prices: result.prices,
        };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      reviews: reviewMap,
      prices: priceMap,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
