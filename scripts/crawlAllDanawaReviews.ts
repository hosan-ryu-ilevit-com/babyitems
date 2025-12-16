/**
 * 모든 다나와 제품 리뷰 크롤링 스크립트 (최적화 버전)
 *
 * 실행 방법:
 *   npx tsx scripts/crawlAllDanawaReviews.ts                    # 전체 크롤링
 *   npx tsx scripts/crawlAllDanawaReviews.ts --pages 10         # 상품당 최대 10페이지
 *   npx tsx scripts/crawlAllDanawaReviews.ts --delay 2000       # 2초 딜레이
 *   npx tsx scripts/crawlAllDanawaReviews.ts --dry-run          # DB 저장 없이 테스트
 *   npx tsx scripts/crawlAllDanawaReviews.ts --skip-existing    # 이미 리뷰 있는 제품 스킵
 *   npx tsx scripts/crawlAllDanawaReviews.ts --fast             # 빠른 모드 (딜레이 축소)
 *   npx tsx scripts/crawlAllDanawaReviews.ts --concurrency 3    # 병렬 처리 수 (기본 2)
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { fetchDanawaReviews, createBrowser, Review } from '../lib/danawa/review-crawler';
import type { Browser } from 'puppeteer';

// =====================================================
// 환경 설정
// =====================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// CLI 인자 파싱
// =====================================================

interface Options {
  maxPages: number;
  delayMs: number;
  dryRun: boolean;
  skipExisting: boolean;
  fastMode: boolean;
  concurrency: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    maxPages: 5,
    delayMs: 2000,      // 기본값 축소 (4초 → 2초)
    dryRun: false,
    skipExisting: false,
    fastMode: false,
    concurrency: 2,     // 기본 병렬 처리 수
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pages' && args[i + 1]) {
      options.maxPages = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--skip-existing') {
      options.skipExisting = true;
    } else if (args[i] === '--fast') {
      options.fastMode = true;
      options.delayMs = 1000; // fast 모드면 딜레이 더 축소
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = Math.min(Math.max(parseInt(args[i + 1], 10), 1), 5); // 1~5 사이
      i++;
    }
  }

  return options;
}

// =====================================================
// DB 헬퍼 함수
// =====================================================

interface DanawaProduct {
  pcode: string;
  title: string;
  review_count: number | null;
}

async function getAllProducts(): Promise<DanawaProduct[]> {
  const allProducts: DanawaProduct[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  // Supabase 기본 limit이 1000이므로 페이지네이션으로 전체 조회
  while (hasMore) {
    const { data, error } = await supabase
      .from('danawa_products')
      .select('pcode, title, review_count')
      .order('review_count', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (data && data.length > 0) {
      allProducts.push(...data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allProducts;
}

async function getProductsWithReviews(): Promise<Set<string>> {
  const pcodes = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  // 페이지네이션으로 전체 조회
  while (hasMore) {
    const { data, error } = await supabase
      .from('danawa_reviews')
      .select('pcode')
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch existing reviews: ${error.message}`);
    }

    if (data && data.length > 0) {
      data.forEach((row) => pcodes.add(row.pcode));
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return pcodes;
}

interface ReviewInsertData {
  pcode: string;
  source: string;
  rating: number;
  content: string;
  author: string | null;
  review_date: string | null;
  helpful_count: number;
  images: { thumbnail: string; original?: string }[];
  mall_name: string | null;
  external_review_id: string | null;
  crawled_at: string;
}

function parseReviewDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

async function saveReviewsToDb(
  pcode: string,
  reviews: Review[],
  dryRun: boolean
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const stats = { inserted: 0, skipped: 0, errors: 0 };

  if (reviews.length === 0) {
    return stats;
  }

  const crawledAt = new Date().toISOString();

  for (const review of reviews) {
    const reviewData: ReviewInsertData = {
      pcode,
      source: 'danawa',
      rating: review.rating,
      content: review.content,
      author: review.author || null,
      review_date: parseReviewDate(review.date),
      helpful_count: review.helpful || 0,
      images: review.images || [],
      mall_name: review.mallName || null,
      external_review_id: review.reviewId || null,
      crawled_at: crawledAt,
    };

    if (dryRun) {
      stats.inserted++;
      continue;
    }

    try {
      // external_review_id가 있으면 먼저 중복 체크
      if (review.reviewId) {
        const { data: existing } = await supabase
          .from('danawa_reviews')
          .select('id')
          .eq('pcode', pcode)
          .eq('external_review_id', review.reviewId)
          .maybeSingle();

        if (existing) {
          stats.skipped++;
          continue;
        }
      }

      const { error } = await supabase
        .from('danawa_reviews')
        .insert(reviewData);

      if (error) {
        if (error.code === '23505') {
          stats.skipped++;
        } else {
          stats.errors++;
        }
      } else {
        stats.inserted++;
      }
    } catch {
      stats.errors++;
    }
  }

  return stats;
}

async function updateProductReviewStats(
  pcode: string,
  reviewCount: number,
  averageRating: number | null,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    return;
  }

  await supabase
    .from('danawa_products')
    .update({
      review_count: reviewCount,
      average_rating: averageRating,
      updated_at: new Date().toISOString(),
    })
    .eq('pcode', pcode);
}

// =====================================================
// 병렬 처리 워커
// =====================================================

interface WorkerResult {
  success: boolean;
  reviews: number;
  inserted: number;
  skipped: number;
  errors: number;
}

async function processProduct(
  product: DanawaProduct,
  browser: Browser,
  options: Options
): Promise<WorkerResult> {
  try {
    // 리뷰 크롤링 (브라우저 재사용, fastMode 적용)
    const result = await fetchDanawaReviews(
      product.pcode,
      options.maxPages,
      browser,
      options.fastMode
    );

    if (result.success) {
      // DB 저장
      const saveStats = await saveReviewsToDb(product.pcode, result.reviews, options.dryRun);

      // 제품 통계 업데이트
      await updateProductReviewStats(
        product.pcode,
        result.reviewCount,
        result.averageRating,
        options.dryRun
      );

      return {
        success: true,
        reviews: result.reviews.length,
        inserted: saveStats.inserted,
        skipped: saveStats.skipped,
        errors: saveStats.errors,
      };
    } else {
      return { success: false, reviews: 0, inserted: 0, skipped: 0, errors: 0 };
    }
  } catch {
    return { success: false, reviews: 0, inserted: 0, skipped: 0, errors: 0 };
  }
}

// =====================================================
// 메인 실행
// =====================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('🚀 다나와 전체 제품 리뷰 크롤링 (최적화 버전)');
  console.log('========================================\n');

  console.log('⚙️ 설정:');
  console.log(`   - 상품당 최대 페이지: ${options.maxPages}`);
  console.log(`   - 요청 간 딜레이: ${options.delayMs}ms`);
  console.log(`   - 병렬 처리 수: ${options.concurrency}`);
  console.log(`   - Fast Mode: ${options.fastMode}`);
  console.log(`   - Dry Run: ${options.dryRun}`);
  console.log(`   - Skip Existing: ${options.skipExisting}`);

  if (options.dryRun) {
    console.log('\n⚠️ DRY-RUN 모드: DB에 저장하지 않습니다.\n');
  }

  // 1. 모든 제품 조회
  console.log('\n📋 제품 목록 조회...');
  const allProducts = await getAllProducts();
  console.log(`   총 ${allProducts.length}개 제품`);

  // 2. 이미 리뷰가 있는 제품 조회 (옵션)
  let productsToProcess = allProducts;
  if (options.skipExisting) {
    console.log('\n🔍 기존 리뷰 확인...');
    const existingPcodes = await getProductsWithReviews();
    console.log(`   이미 리뷰 있는 제품: ${existingPcodes.size}개`);

    productsToProcess = allProducts.filter(p => !existingPcodes.has(p.pcode));
    console.log(`   크롤링할 제품: ${productsToProcess.length}개`);
  }

  if (productsToProcess.length === 0) {
    console.log('\n✅ 크롤링할 제품이 없습니다.');
    process.exit(0);
  }

  // 3. 브라우저 인스턴스 생성 (병렬 처리 수만큼)
  console.log(`\n🌐 브라우저 ${options.concurrency}개 생성 중...`);
  const browsers: Browser[] = [];
  for (let i = 0; i < options.concurrency; i++) {
    const browser = await createBrowser();
    browsers.push(browser);
    console.log(`   ✅ 브라우저 #${i + 1} 생성 완료`);
  }

  // 4. 크롤링 시작 (병렬 처리)
  console.log('\n📡 크롤링 시작...\n');
  const startTime = Date.now();

  const totalStats = {
    success: 0,
    failed: 0,
    totalReviews: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  let currentIndex = 0;
  const total = productsToProcess.length;

  // 워커 함수: 각 브라우저가 순차적으로 제품을 처리
  async function worker(workerId: number, browser: Browser): Promise<void> {
    while (true) {
      // 다음 처리할 제품 인덱스 가져오기 (atomic하게)
      const idx = currentIndex++;
      if (idx >= total) break;

      const product = productsToProcess[idx];
      const progress = `[${idx + 1}/${total}]`;

      console.log(`🔄 W${workerId} ${progress} ${product.title.substring(0, 30)}...`);

      const result = await processProduct(product, browser, options);

      if (result.success) {
        console.log(`   ✅ W${workerId} ${progress} 크롤링: ${result.reviews}개, 저장: ${result.inserted}개`);
        totalStats.success++;
        totalStats.totalReviews += result.reviews;
        totalStats.totalInserted += result.inserted;
        totalStats.totalSkipped += result.skipped;
        totalStats.totalErrors += result.errors;
      } else {
        console.log(`   ❌ W${workerId} ${progress} 실패`);
        totalStats.failed++;
      }

      // 딜레이 (rate limit 방지)
      if (idx < total - 1) {
        await new Promise(resolve => setTimeout(resolve, options.delayMs));
      }
    }
  }

  // 모든 워커 병렬 실행
  const workerPromises = browsers.map((browser, idx) => worker(idx + 1, browser));
  await Promise.all(workerPromises);

  // 5. 브라우저 종료
  console.log('\n🧹 브라우저 종료 중...');
  for (const browser of browsers) {
    try {
      await browser.close();
    } catch {
      // 무시
    }
  }

  // 6. 최종 결과
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const avgPerProduct = ((Date.now() - startTime) / 1000 / totalStats.success).toFixed(1);

  console.log('\n========================================');
  console.log('📊 최종 결과');
  console.log('========================================');
  console.log(`   - 소요 시간: ${elapsed}분`);
  console.log(`   - 평균 처리 시간: ${avgPerProduct}초/제품`);
  console.log(`   - 성공: ${totalStats.success}개 제품`);
  console.log(`   - 실패: ${totalStats.failed}개 제품`);
  console.log(`   - 총 크롤링 리뷰: ${totalStats.totalReviews}개`);
  console.log(`   - DB 저장: ${totalStats.totalInserted}개`);
  console.log(`   - DB 스킵 (중복): ${totalStats.totalSkipped}개`);
  console.log(`   - DB 오류: ${totalStats.totalErrors}개`);
  console.log('========================================\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ 치명적 오류:', error);
  process.exit(1);
});
