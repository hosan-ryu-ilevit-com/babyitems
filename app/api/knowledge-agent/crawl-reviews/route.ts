/**
 * Knowledge Agent - Crawl Reviews API
 *
 * 하드컷팅된 상품들의 리뷰 병렬 크롤링
 * - 최적화된 배치 크롤링 사용
 * - SSE 스트리밍으로 진행상황 전송
 */

import { NextRequest } from 'next/server';
import {
  fetchReviewsBatchParallel,
  type ReviewCrawlResult,
  type ReviewLite,
} from '@/lib/danawa/review-crawler-lite';

export const maxDuration = 60;

interface CrawlReviewsRequest {
  pcodes: string[];
  maxPerProduct?: number;
  concurrency?: number;
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
        const { pcodes, maxPerProduct = 5, concurrency = 8 } = body;

        if (!pcodes || pcodes.length === 0) {
          sendEvent('error', { message: 'No pcodes provided' });
          controller.close();
          return;
        }

        console.log(`\n📝 [CrawlReviews] Starting: ${pcodes.length}개 상품, 상품당 ${maxPerProduct}개 리뷰`);
        const startTime = Date.now();

        sendEvent('start', {
          totalProducts: pcodes.length,
          maxPerProduct,
          concurrency,
        });

        // 병렬 크롤링 (최적화된 옵션 사용)
        const results = await fetchReviewsBatchParallel(pcodes, {
          maxReviewsPerProduct: maxPerProduct,
          concurrency,
          delayBetweenChunks: 200,
          skipMetadata: true,  // 메타데이터 생략으로 속도 향상
          timeout: 5000,
          onProgress: (completed, total, result) => {
            sendEvent('progress', {
              completed,
              total,
              pcode: result.pcode,
              reviewCount: result.reviews.length,
              success: result.success,
            });
          },
        });

        const elapsedMs = Date.now() - startTime;

        // pcode별 리뷰 맵 생성
        const reviewMap: Record<string, ReviewLite[]> = {};
        let totalReviews = 0;
        let successCount = 0;

        for (const result of results) {
          if (result.success) {
            successCount++;
            reviewMap[result.pcode] = result.reviews;
            totalReviews += result.reviews.length;
          }
        }

        // 최종 결과
        sendEvent('complete', {
          success: true,
          totalProducts: pcodes.length,
          successCount,
          totalReviews,
          reviews: reviewMap,
          elapsedMs,
          message: `${successCount}/${pcodes.length} 상품에서 ${totalReviews}개 리뷰 수집 (${(elapsedMs / 1000).toFixed(1)}초)`,
        });

        console.log(`✅ [CrawlReviews] 완료: ${totalReviews}개 리뷰 (${(elapsedMs / 1000).toFixed(1)}초)`);

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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * 간단한 JSON 응답 (스트리밍 없이)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pcodesParam = searchParams.get('pcodes');

  if (!pcodesParam) {
    return new Response(JSON.stringify({ error: 'pcodes parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pcodes = pcodesParam.split(',').filter(p => p.trim());

  try {
    const results = await fetchReviewsBatchParallel(pcodes, {
      maxReviewsPerProduct: 5,
      concurrency: 8,
      skipMetadata: true,
    });

    const reviewMap: Record<string, ReviewLite[]> = {};
    for (const result of results) {
      if (result.success) {
        reviewMap[result.pcode] = result.reviews;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      reviews: reviewMap,
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
