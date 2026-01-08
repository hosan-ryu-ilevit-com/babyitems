/**
 * Knowledge Agent 캐시 프리페치 스크립트
 *
 * 특정 키워드에 대해 제품, 리뷰, 가격 정보를 미리 크롤링하여
 * Supabase에 저장합니다. 3일에 한 번 수동 실행.
 *
 * 사용법:
 *   npx tsx scripts/prefetch-knowledge-cache.ts --query="가습기"
 *   npx tsx scripts/prefetch-knowledge-cache.ts --all
 *   npx tsx scripts/prefetch-knowledge-cache.ts --query="에어프라이어" --products=120 --reviews-top=20
 *
 * 옵션:
 *   --query: 검색 키워드 (단일)
 *   --all: 모든 기본 카테고리 실행
 *   --products: 크롤링할 제품 수 (기본: 120)
 *   --reviews-top: 리뷰를 가져올 상위 제품 수 (기본: 30)
 *   --reviews-per: 제품당 리뷰 수 (기본: 5)
 *   --skip-reviews: 리뷰 크롤링 건너뛰기
 *   --skip-prices: 가격 크롤링 건너뛰기
 *   --dry-run: DB 저장 없이 크롤링만 테스트
 */

// 환경변수를 가장 먼저 로드
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// 타입만 정적 import (런타임에 영향 없음)
import type { ReviewLite } from '../lib/danawa/review-crawler-lite';
import type { DanawaSearchListItem } from '../lib/danawa/search-crawler';
import type { DanawaPriceResult } from '../lib/danawa/price-crawler';

// Supabase는 지연 초기화
let supabase: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null;

function getSupabase() {
  if (!supabase) {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// 크롤러도 동적 import로 지연 로드
async function getCrawlers() {
  const [searchModule, reviewModule, priceModule] = await Promise.all([
    import('../lib/danawa/search-crawler-lite'),
    import('../lib/danawa/review-crawler-lite'),
    import('../lib/danawa/price-crawler'),  // 로컬 Puppeteer 사용 (Fly.io 대신)
  ]);
  return {
    crawlDanawaSearchListLite: searchModule.crawlDanawaSearchListLite,
    fetchReviewsBatchParallel: reviewModule.fetchReviewsBatchParallel,
    fetchDanawaPricesBatch: priceModule.fetchDanawaPricesBatch,  // 순차 처리 (fallback)
    fetchDanawaPricesBatchParallel: priceModule.fetchDanawaPricesBatchParallel,  // 병렬 처리 (기본)
  };
}

// ============================================================================
// 기본 카테고리 목록 (--all 옵션 사용 시)
// knowledge-agent/page.tsx의 CATEGORIES_DATA에서 추출
// ============================================================================

const DEFAULT_QUERIES = [
  // === 출산/육아용품 ===
  // 외출용품
  '휴대용 유모차', '디럭스 유모차', '절충형 유모차', '트라이크 유모차',
  '신생아용 카시트', '유아용 카시트', '주니어용 카시트',
  '아기띠', '힙시트',
  // 젖병/수유용품
  '젖병', '젖병소독기', '쪽쪽이', '분유포트', '분유제조기', '보틀워머', '젖병솔', '유축기', '수유패드',
  // 기저귀/위생
  '기저귀', '아기물티슈', '분유', '이유식', '유아간식',
  // 이유식용품
  '빨대컵', '이유식기', '유아수저세트', '턱받이', '치발기', '이유식조리기', '하이체어',
  // 건강/목욕용품
  '아기욕조', '콧물흡입기', '체온계', '유아치약', '유아칫솔', '유아변기', '손톱깎이', '유아세제',
  // 유아 가구
  '유아침대', '유아의자', '유아소파', '유아책상',
  // 신생아/영유아 완구
  '아기체육관', '바운서', '점퍼루', '보행기', '모빌',
  // 인기 완구/교구
  '블록장난감', '로봇장난감', '소꿉놀이', '인형', '킥보드', '놀이방매트',

  // === 생활/주방가전 ===
  // PC/주변기기
  '모니터', '4K모니터', '무선마우스', '기계식키보드', '노트북거치대', '웹캠',
  // 주방가전
  '에어프라이어', '전기밥솥', '전자레인지', '식기세척기', '음식물처리기', '전기포트', '커피머신', '믹서기',
  // 계절/환경가전
  '가습기', '공기청정기', '제습기', '에어컨', '선풍기', '전기히터',
  // 청소가전
  '로봇청소기', '무선청소기', '물걸레청소기', '침구청소기',
  // 세탁/건조가전
  '세탁기', '건조기', '올인원 세탁건조기', '의류관리기', '스팀다리미',
  // 이미용/건강가전
  '헤어드라이어', '고데기', '전동칫솔', '체중계', '전기면도기', '안마의자',
];

// 총 약 82개 카테고리

// ============================================================================
// Types
// ============================================================================

interface PrefetchOptions {
  query: string;
  productLimit: number;
  reviewsTopN: number;
  reviewsPerProduct: number;
  skipProducts: boolean;  // DB 캐시에서 제품 로드 (크롤링 스킵)
  skipReviews: boolean;
  skipPrices: boolean;
  dryRun: boolean;
}

interface PrefetchResult {
  query: string;
  productsCount: number;
  reviewsCount: number;
  pricesCount: number;
  elapsed: number;
  errors: string[];
}

// ============================================================================
// 메인 프리페치 함수
// ============================================================================

async function prefetchQuery(options: PrefetchOptions): Promise<PrefetchResult> {
  const { query, productLimit, reviewsTopN, reviewsPerProduct, skipProducts, skipReviews, skipPrices, dryRun } = options;
  const startTime = Date.now();
  const errors: string[] = [];

  // 크롤러 동적 로드
  const crawlers = await getCrawlers();
  const db = getSupabase();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [Prefetch] 시작: "${query}"`);
  console.log(`   제품: ${productLimit}개, 리뷰 대상: 상위 ${reviewsTopN}개 x ${reviewsPerProduct}개`);
  if (skipProducts) console.log(`   📂 제품은 DB 캐시에서 로드`);
  console.log(`${'='.repeat(60)}`);

  // -------------------------------------------------------------------------
  // 1. 제품 메타데이터 (크롤링 또는 DB 캐시에서 로드)
  // -------------------------------------------------------------------------
  let products: DanawaSearchListItem[] = [];

  if (skipProducts) {
    // DB 캐시에서 제품 로드
    console.log(`\n📂 [Step 1] DB 캐시에서 제품 로드 중...`);
    try {
      const { data, error } = await db
        .from('knowledge_products_cache')
        .select('*')
        .eq('query', query)
        .order('rank', { ascending: true })
        .limit(productLimit);

      if (error) throw new Error(error.message);

      if (data && data.length > 0) {
        products = data.map((row: { pcode: string; name: string; brand: string | null; price: number | null; thumbnail: string | null; review_count: number; rating: number | null; spec_summary: string; product_url: string }) => ({
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
        console.log(`   ✅ ${products.length}개 제품 캐시 로드 완료`);
      } else {
        console.log(`   ⚠️ DB 캐시에 "${query}" 데이터가 없습니다.`);
        return { query, productsCount: 0, reviewsCount: 0, pricesCount: 0, elapsed: Date.now() - startTime, errors };
      }
    } catch (error) {
      const msg = `제품 캐시 로드 실패: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
      return { query, productsCount: 0, reviewsCount: 0, pricesCount: 0, elapsed: Date.now() - startTime, errors };
    }
  } else {
    // 실시간 크롤링
    console.log(`\n📦 [Step 1] 제품 크롤링 중...`);
    try {
      const searchResult = await crawlers.crawlDanawaSearchListLite(
        { query, limit: productLimit },
        (product: DanawaSearchListItem, index: number) => {
          if (index % 20 === 0) {
            console.log(`   진행: ${index + 1}/${productLimit}`);
          }
        }
      );
      products = searchResult.items;
      console.log(`   ✅ ${products.length}개 제품 크롤링 완료`);
    } catch (error) {
      const msg = `제품 크롤링 실패: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
      return { query, productsCount: 0, reviewsCount: 0, pricesCount: 0, elapsed: Date.now() - startTime, errors };
    }
  }

  if (products.length === 0) {
    console.log(`   ⚠️ 제품이 없습니다.`);
    return { query, productsCount: 0, reviewsCount: 0, pricesCount: 0, elapsed: Date.now() - startTime, errors };
  }

  // -------------------------------------------------------------------------
  // 2. DB 저장 - 제품 (skipProducts일 때는 스킵)
  // -------------------------------------------------------------------------
  if (!dryRun && !skipProducts) {
    console.log(`\n💾 [Step 2] 제품 DB 저장 중...`);
    try {
      // 기존 데이터 삭제 (upsert 대신 clean insert)
      await db
        .from('knowledge_products_cache')
        .delete()
        .eq('query', query);

      // 배치 insert (50개씩)
      const batchSize = 50;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize).map((p, idx) => ({
          query,
          pcode: p.pcode,
          name: p.name,
          brand: p.brand,
          price: p.price,
          thumbnail: p.thumbnail,
          review_count: p.reviewCount,
          rating: p.rating,
          spec_summary: p.specSummary,
          product_url: p.productUrl,
          rank: i + idx + 1,
          crawled_at: new Date().toISOString(),
        }));

        const { error } = await db
          .from('knowledge_products_cache')
          .insert(batch);

        if (error) {
          console.error(`   ⚠️ 배치 ${i}-${i + batch.length} 저장 실패:`, error.message);
          errors.push(`제품 저장 실패: ${error.message}`);
        }
      }
      console.log(`   ✅ ${products.length}개 제품 저장 완료`);
    } catch (error) {
      const msg = `제품 DB 저장 실패: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // 3. 리뷰 크롤링 (상위 N개 제품)
  // -------------------------------------------------------------------------
  let totalReviews = 0;
  const topPcodes = products.slice(0, reviewsTopN).map(p => p.pcode);

  if (!skipReviews && topPcodes.length > 0) {
    console.log(`\n📝 [Step 3] 리뷰 크롤링 중... (${topPcodes.length}개 제품)`);
    try {
      const reviewResults = await crawlers.fetchReviewsBatchParallel(topPcodes, {
        maxReviewsPerProduct: reviewsPerProduct,
        concurrency: 8,
        delayBetweenChunks: 200,
        skipMetadata: true,
        timeout: 8000,
        onProgress: (completed, total) => {
          if (completed % 10 === 0 || completed === total) {
            console.log(`   진행: ${completed}/${total}`);
          }
        },
      });

      // DB 저장
      if (!dryRun) {
        console.log(`\n💾 [Step 3-1] 리뷰 DB 저장 중...`);

        // 기존 리뷰 삭제
        await db
          .from('knowledge_reviews_cache')
          .delete()
          .in('pcode', topPcodes);

        for (const result of reviewResults) {
          if (!result.success || result.reviews.length === 0) continue;

          const reviewBatch = result.reviews.map((r: ReviewLite) => ({
            pcode: result.pcode,
            review_id: r.reviewId,
            rating: r.rating,
            content: r.content,
            author: r.author || null,
            review_date: r.date || null,
            mall_name: r.mallName || null,
            image_urls: r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls : null,  // 포토 리뷰 이미지 URL
            crawled_at: new Date().toISOString(),
          }));

          const { error } = await db
            .from('knowledge_reviews_cache')
            .upsert(reviewBatch, { onConflict: 'pcode,review_id' });

          if (error) {
            console.error(`   ⚠️ 리뷰 저장 실패 (${result.pcode}):`, error.message);
          } else {
            totalReviews += reviewBatch.length;
          }
        }
        console.log(`   ✅ ${totalReviews}개 리뷰 저장 완료`);
      } else {
        totalReviews = reviewResults.reduce((sum, r) => sum + (r.success ? r.reviews.length : 0), 0);
        console.log(`   ✅ ${totalReviews}개 리뷰 크롤링 완료 (dry-run)`);
      }
    } catch (error) {
      const msg = `리뷰 크롤링 실패: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // 4. 가격 크롤링 (전체 제품) - 로컬 Puppeteer 사용
  // -------------------------------------------------------------------------
  let totalPrices = 0;
  // 다나와 pcode만 필터링 (숫자로만 이루어진 것만 - TH201_, TP40F_ 등 타사 pcode 제외)
  const allPcodes = products
    .map(p => p.pcode)
    .filter(pcode => /^\d+$/.test(pcode));

  const skippedCount = products.length - allPcodes.length;

  if (!skipPrices && allPcodes.length > 0) {
    console.log(`\n💰 [Step 4] 가격 크롤링 중... (${allPcodes.length}개 다나와 제품, 순차 Puppeteer)`);
    if (skippedCount > 0) {
      console.log(`   ⚠️ ${skippedCount}개 타사 pcode 스킵 (다나와 외 제품)`);
    }
    try {
      // 로컬 Puppeteer 순차 배치 크롤링 (최적화된 딜레이)
      const priceResults: DanawaPriceResult[] = await crawlers.fetchDanawaPricesBatch(
        allPcodes,
        500,   // delayMs: 0.5초 간격 (최적화됨)
        (current: number, total: number, result: DanawaPriceResult) => {
          if (current % 10 === 0 || current === total) {
            console.log(`   진행: ${current}/${total} ${result.success ? '✅' : '❌'}`);
          }
        }
      );

      // DB 저장
      if (!dryRun) {
        console.log(`\n💾 [Step 4-1] 가격 DB 저장 중...`);

        for (const result of priceResults) {
          if (!result.success) continue;

          const priceData = {
            pcode: result.pcode,
            lowest_price: result.lowestPrice,
            lowest_mall: result.lowestMall,
            lowest_delivery: result.lowestDelivery,
            lowest_link: result.lowestLink,
            mall_prices: result.mallPrices,  // 로컬 크롤러는 mallPrices 사용
            mall_count: result.mallPrices.length,
            crawled_at: new Date().toISOString(),
          };

          const { error } = await db
            .from('knowledge_prices_cache')
            .upsert(priceData, { onConflict: 'pcode' });

          if (error) {
            console.error(`   ⚠️ 가격 저장 실패 (${result.pcode}):`, error.message);
          } else {
            totalPrices++;
          }
        }
        console.log(`   ✅ ${totalPrices}개 가격 저장 완료`);
      } else {
        totalPrices = priceResults.filter(r => r.success).length;
        console.log(`   ✅ ${totalPrices}개 가격 크롤링 완료 (dry-run)`);
      }
    } catch (error) {
      const msg = `가격 크롤링 실패: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
    }
  }

  // -------------------------------------------------------------------------
  // 결과 요약
  // -------------------------------------------------------------------------
  const elapsed = Date.now() - startTime;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ [Prefetch 완료] "${query}"`);
  console.log(`   제품: ${products.length}개`);
  console.log(`   리뷰: ${totalReviews}개`);
  console.log(`   가격: ${totalPrices}개`);
  console.log(`   소요 시간: ${(elapsed / 1000).toFixed(1)}초`);
  if (errors.length > 0) {
    console.log(`   ⚠️ 에러: ${errors.length}개`);
  }
  console.log(`${'='.repeat(60)}`);

  return {
    query,
    productsCount: products.length,
    reviewsCount: totalReviews,
    pricesCount: totalPrices,
    elapsed,
    errors,
  };
}

// ============================================================================
// CLI 실행
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // 옵션 파싱
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const queryArg = getArg('query');
  const runAll = hasFlag('all');
  const productLimit = parseInt(getArg('products') || '120', 10);
  const reviewsTopN = parseInt(getArg('reviews-top') || '10', 10);  // 상위 10개 제품 리뷰
  const reviewsPerProduct = parseInt(getArg('reviews-per') || '5', 10);  // 제품당 5개 = 총 50개 리뷰
  const skipProducts = hasFlag('skip-products');  // DB 캐시에서 제품 로드
  const skipReviews = hasFlag('skip-reviews');
  const skipPrices = hasFlag('skip-prices');
  const dryRun = hasFlag('dry-run');

  // 사용법 출력
  if (!queryArg && !runAll) {
    console.log(`
Knowledge Agent 캐시 프리페치 스크립트

사용법:
  npx tsx scripts/prefetch-knowledge-cache.ts --query="가습기"
  npx tsx scripts/prefetch-knowledge-cache.ts --all
  npx tsx scripts/prefetch-knowledge-cache.ts --query="에어프라이어" --products=120 --reviews-top=20

옵션:
  --query=<키워드>     검색 키워드 (단일)
  --all                모든 기본 카테고리 실행
  --products=<N>       크롤링할 제품 수 (기본: 120)
  --reviews-top=<N>    리뷰를 가져올 상위 제품 수 (기본: 10)
  --reviews-per=<N>    제품당 리뷰 수 (기본: 5)
  --skip-products      제품 크롤링 스킵 (DB 캐시 사용)
  --skip-reviews       리뷰 크롤링 건너뛰기
  --skip-prices        가격 크롤링 건너뛰기
  --dry-run            DB 저장 없이 크롤링만 테스트

기본 카테고리 목록:
${DEFAULT_QUERIES.map(q => `  - ${q}`).join('\n')}
`);
    process.exit(0);
  }

  // 실행할 쿼리 목록
  const queries = runAll ? DEFAULT_QUERIES : [queryArg!];

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`#  Knowledge Cache Prefetch`);
  console.log(`#  쿼리: ${queries.length}개`);
  console.log(`#  제품: ${productLimit}개, 리뷰 대상: ${reviewsTopN}개 x ${reviewsPerProduct}개`);
  console.log(`#  옵션: ${skipProducts ? 'skip-products ' : ''}${skipReviews ? 'skip-reviews ' : ''}${skipPrices ? 'skip-prices ' : ''}${dryRun ? 'dry-run' : ''}`);
  console.log(`${'#'.repeat(60)}`);

  const results: PrefetchResult[] = [];
  const totalStart = Date.now();

  for (const query of queries) {
    const result = await prefetchQuery({
      query,
      productLimit,
      reviewsTopN,
      reviewsPerProduct,
      skipProducts,
      skipReviews,
      skipPrices,
      dryRun,
    });
    results.push(result);

    // 다음 쿼리 전 잠시 대기 (rate limit 방지)
    if (queries.length > 1) {
      console.log(`\n⏳ 다음 쿼리 전 3초 대기...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // -------------------------------------------------------------------------
  // 최종 요약
  // -------------------------------------------------------------------------
  const totalElapsed = Date.now() - totalStart;
  const totalProducts = results.reduce((sum, r) => sum + r.productsCount, 0);
  const totalReviews = results.reduce((sum, r) => sum + r.reviewsCount, 0);
  const totalPrices = results.reduce((sum, r) => sum + r.pricesCount, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`#  PREFETCH 완료 - 최종 요약`);
  console.log(`${'#'.repeat(60)}`);
  console.log(`\n📊 결과:`);
  console.log(`   쿼리 수: ${results.length}개`);
  console.log(`   총 제품: ${totalProducts}개`);
  console.log(`   총 리뷰: ${totalReviews}개`);
  console.log(`   총 가격: ${totalPrices}개`);
  console.log(`   총 소요 시간: ${(totalElapsed / 1000 / 60).toFixed(1)}분`);

  if (totalErrors > 0) {
    console.log(`\n⚠️ 에러 발생: ${totalErrors}건`);
    for (const r of results) {
      if (r.errors.length > 0) {
        console.log(`   [${r.query}] ${r.errors.join(', ')}`);
      }
    }
  }

  console.log(`\n✅ 완료!`);
}

main().catch(console.error);
