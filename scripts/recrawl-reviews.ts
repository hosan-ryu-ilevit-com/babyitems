/**
 * 리뷰 재크롤링 스크립트
 *
 * DB에 저장된 모든 pcode 상품들에 대해 리뷰를 다시 크롤링합니다.
 * 포토리뷰 이미지 URL도 새로운 로직으로 추출됩니다.
 *
 * 사용법:
 *   npx tsx scripts/recrawl-reviews.ts
 *   npx tsx scripts/recrawl-reviews.ts --reviews-per=100
 *   npx tsx scripts/recrawl-reviews.ts --dry-run
 *   npx tsx scripts/recrawl-reviews.ts --query="하이체어"  # 특정 쿼리만
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { fetchReviewsBatchParallel, type ReviewLite, type ReviewCrawlResult } from '../lib/danawa/review-crawler-lite';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface RecrawlOptions {
  reviewsPerProduct: number;
  dryRun: boolean;
  query?: string;  // 특정 쿼리만 처리
  concurrency: number;
}

async function recrawlReviews(options: RecrawlOptions) {
  const { reviewsPerProduct, dryRun, query, concurrency } = options;

  console.log('\n' + '='.repeat(60));
  console.log('🔄 리뷰 재크롤링 시작');
  console.log('='.repeat(60));
  console.log(`   리뷰/제품: ${reviewsPerProduct}개`);
  console.log(`   동시 처리: ${concurrency}개`);
  if (query) console.log(`   대상 쿼리: "${query}"`);
  if (dryRun) console.log(`   ⚠️  DRY-RUN 모드 (DB 저장 안함)`);
  console.log('');

  // 1. DB에서 모든 unique pcode 가져오기
  console.log('📂 [Step 1] DB에서 pcode 목록 조회 중...');

  let queryBuilder = supabase
    .from('knowledge_products_cache')
    .select('pcode, query, name')
    .order('query');

  if (query) {
    queryBuilder = queryBuilder.eq('query', query);
  }

  const { data: products, error: productsError } = await queryBuilder;

  if (productsError) {
    console.error('❌ DB 조회 실패:', productsError.message);
    return;
  }

  if (!products || products.length === 0) {
    console.log('⚠️  DB에 저장된 제품이 없습니다.');
    return;
  }

  // unique pcode 추출
  const uniquePcodes = [...new Set(products.map(p => p.pcode))];
  console.log(`   총 제품 수: ${products.length}개`);
  console.log(`   고유 pcode: ${uniquePcodes.length}개`);

  // 쿼리별 통계
  const queryStats = products.reduce((acc, p) => {
    acc[p.query] = (acc[p.query] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`   쿼리 수: ${Object.keys(queryStats).length}개`);

  // 2. 기존 리뷰 통계 조회
  console.log('\n📊 [Step 2] 기존 리뷰 통계 조회 중...');

  const { data: existingStats, error: statsError } = await supabase
    .from('knowledge_reviews_cache')
    .select('pcode, image_urls')
    .in('pcode', uniquePcodes);

  if (!statsError && existingStats) {
    const existingReviewCount = existingStats.length;
    const existingPhotoCount = existingStats.filter(r => r.image_urls && r.image_urls.length > 0).length;
    console.log(`   기존 리뷰: ${existingReviewCount}개`);
    console.log(`   기존 포토 리뷰: ${existingPhotoCount}개 (${(existingPhotoCount / existingReviewCount * 100).toFixed(1)}%)`);
  }

  // 3. 리뷰 크롤링
  console.log(`\n📝 [Step 3] 리뷰 크롤링 시작 (${uniquePcodes.length}개 제품)...`);
  const startTime = Date.now();

  let totalReviews = 0;
  let totalPhotoReviews = 0;
  let totalImages = 0;
  let successCount = 0;
  let failCount = 0;

  // 배치 처리 (concurrency개씩)
  const batchSize = concurrency;
  const totalBatches = Math.ceil(uniquePcodes.length / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchPcodes = uniquePcodes.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);
    const batchNum = batchIdx + 1;

    console.log(`\n   📦 배치 ${batchNum}/${totalBatches} (${batchPcodes.length}개 제품)`);

    const results = await fetchReviewsBatchParallel(batchPcodes, {
      maxReviewsPerProduct: reviewsPerProduct,
      concurrency: Math.min(8, batchPcodes.length),
      delayBetweenChunks: 200,
      skipMetadata: false,
      timeout: 15000,
    });

    // 결과 처리 및 DB 저장
    for (const result of results) {
      if (!result.success) {
        failCount++;
        continue;
      }

      successCount++;
      const photoReviews = result.reviews.filter(r => r.imageUrls && r.imageUrls.length > 0);
      const imageCount = photoReviews.reduce((sum, r) => sum + (r.imageUrls?.length || 0), 0);

      totalReviews += result.reviews.length;
      totalPhotoReviews += photoReviews.length;
      totalImages += imageCount;

      // DB 저장
      if (!dryRun && result.reviews.length > 0) {
        const reviewBatch = result.reviews.map((r: ReviewLite) => ({
          pcode: result.pcode,
          review_id: r.reviewId,
          rating: r.rating,
          content: r.content,
          author: r.author || null,
          review_date: r.date || null,
          mall_name: r.mallName || null,
          image_urls: r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls : null,
          crawled_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('knowledge_reviews_cache')
          .upsert(reviewBatch, { onConflict: 'pcode,review_id' });

        if (error) {
          console.error(`      ⚠️ [${result.pcode}] DB 저장 실패:`, error.message);
        }
      }
    }

    // 배치 통계
    const batchPhotoCount = results.reduce((sum, r) => {
      if (!r.success) return sum;
      return sum + r.reviews.filter(rv => rv.imageUrls && rv.imageUrls.length > 0).length;
    }, 0);
    console.log(`      ✅ 리뷰 ${results.reduce((s, r) => s + r.reviews.length, 0)}개, 포토 ${batchPhotoCount}개`);

    // Rate limit 방지
    if (batchIdx < totalBatches - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 4. 결과 요약
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log('✅ 리뷰 재크롤링 완료');
  console.log('='.repeat(60));
  console.log(`   처리 제품: ${successCount}/${uniquePcodes.length}개 성공`);
  console.log(`   총 리뷰: ${totalReviews}개`);
  console.log(`   📸 포토 리뷰: ${totalPhotoReviews}개 (${(totalPhotoReviews / totalReviews * 100).toFixed(1)}%)`);
  console.log(`   총 이미지: ${totalImages}개`);
  console.log(`   소요 시간: ${elapsed.toFixed(1)}초`);
  if (dryRun) console.log(`   ⚠️  DRY-RUN 모드 (DB 저장되지 않음)`);
  console.log('');
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const reviewsPerProduct = parseInt(getArg('reviews-per') || '100', 10);
  const dryRun = hasFlag('dry-run');
  const query = getArg('query');
  const concurrency = parseInt(getArg('concurrency') || '10', 10);

  if (hasFlag('help')) {
    console.log(`
리뷰 재크롤링 스크립트

사용법:
  npx tsx scripts/recrawl-reviews.ts [옵션]

옵션:
  --reviews-per=<N>    제품당 크롤링할 리뷰 수 (기본: 100)
  --concurrency=<N>    동시 처리 제품 수 (기본: 10)
  --query=<키워드>      특정 쿼리의 제품만 처리
  --dry-run            DB 저장 없이 테스트
  --help               도움말 출력

예시:
  npx tsx scripts/recrawl-reviews.ts
  npx tsx scripts/recrawl-reviews.ts --reviews-per=200
  npx tsx scripts/recrawl-reviews.ts --query="하이체어"
  npx tsx scripts/recrawl-reviews.ts --dry-run
`);
    return;
  }

  await recrawlReviews({
    reviewsPerProduct,
    dryRun,
    query,
    concurrency,
  });
}

main().catch(console.error);
