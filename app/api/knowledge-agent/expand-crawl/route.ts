/**
 * Knowledge Agent - Expand Crawl API
 *
 * 질문 완료 후 120개 상품 크롤링
 * - 기존 40개 pcode 제외
 * - SSE 스트리밍으로 진행상황 전송
 */

import { NextRequest } from 'next/server';
import { crawlDanawaSearchListLite } from '@/lib/danawa/search-crawler-lite';
import type { DanawaSearchListItem } from '@/lib/danawa/search-crawler';

export const maxDuration = 60;

interface ExpandCrawlRequest {
  categoryName: string;
  existingPcodes: string[];
  limit?: number;
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
        const body: ExpandCrawlRequest = await request.json();
        const { categoryName, existingPcodes = [], limit = 120 } = body;

        if (!categoryName) {
          sendEvent('error', { message: 'categoryName is required' });
          controller.close();
          return;
        }

        console.log(`\n🚀 [Expand-Crawl] Starting: "${categoryName}", limit: ${limit}, existing: ${existingPcodes.length}`);
        const startTime = Date.now();

        sendEvent('start', {
          categoryName,
          targetLimit: limit,
          existingCount: existingPcodes.length,
        });

        // 기존 pcode Set으로 변환 (빠른 조회)
        const existingSet = new Set(existingPcodes);
        const newProducts: DanawaSearchListItem[] = [];
        let crawledCount = 0;

        // 120개 크롤링 (limit 파라미터 사용)
        const response = await crawlDanawaSearchListLite(
          {
            query: categoryName,
            limit,
            sort: 'saveDESC',
          },
          (product, index) => {
            crawledCount++;

            // 기존 pcode 제외
            if (!existingSet.has(product.pcode)) {
              newProducts.push(product);

              // 10개마다 진행상황 전송
              if (newProducts.length % 10 === 0) {
                sendEvent('progress', {
                  crawledCount,
                  newCount: newProducts.length,
                  latestProduct: {
                    pcode: product.pcode,
                    name: product.name.substring(0, 50),
                    price: product.price,
                  },
                });
              }
            }
          }
        );

        const elapsedMs = Date.now() - startTime;

        // 필터 정보도 전송
        if (response.filters && response.filters.length > 0) {
          sendEvent('filters', {
            filters: response.filters,
            count: response.filters.length,
          });
        }

        // 최종 결과
        sendEvent('complete', {
          success: true,
          totalCrawled: crawledCount,
          newProducts: newProducts.length,
          products: newProducts,
          searchUrl: response.searchUrl,
          elapsedMs,
          message: `${newProducts.length}개 신규 상품 발견 (${(elapsedMs / 1000).toFixed(1)}초)`,
        });

        console.log(`✅ [Expand-Crawl] 완료: ${newProducts.length}개 신규 상품 (${(elapsedMs / 1000).toFixed(1)}초)`);

      } catch (error) {
        console.error('[Expand-Crawl] Error:', error);
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
