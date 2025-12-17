/**
 * 리뷰가 부족한 제품들에 대해 추가 리뷰 크롤링
 *
 * 실행 방법:
 *   npx tsx scripts/crawlMoreReviews.ts                    # 기본 실행 (제품당 최대 500개)
 *   npx tsx scripts/crawlMoreReviews.ts --max-reviews 1000 # 제품당 최대 1000개
 *   npx tsx scripts/crawlMoreReviews.ts --limit 10         # 상위 10개 제품만
 *   npx tsx scripts/crawlMoreReviews.ts --dry-run          # DB 저장 없이 테스트
 *   npx tsx scripts/crawlMoreReviews.ts --fast             # 빠른 모드 (딜레이 축소)
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';

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
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// CLI 인자 파싱
// =====================================================

interface Options {
  maxReviewsPerProduct: number;
  productLimit: number;
  delayMs: number;
  dryRun: boolean;
  fastMode: boolean;
  concurrency: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    maxReviewsPerProduct: 500,  // 제품당 최대 리뷰 수
    productLimit: 0,            // 0 = 무제한
    delayMs: 3000,
    dryRun: false,
    fastMode: false,
    concurrency: 2,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-reviews' && args[i + 1]) {
      options.maxReviewsPerProduct = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.productLimit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--fast') {
      options.fastMode = true;
      options.delayMs = 1500;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = Math.min(Math.max(parseInt(args[i + 1], 10), 1), 5);
      i++;
    }
  }

  return options;
}

// =====================================================
// DB 헬퍼 함수
// =====================================================

interface IncompleteProduct {
  pcode: string;
  title: string;
  expected: number;
  actual: number;
  missing: number;
}

async function loadIncompleteProducts(): Promise<IncompleteProduct[]> {
  const filePath = '/tmp/incomplete_reviews.json';
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  }

  console.log('⚠️ /tmp/incomplete_reviews.json 파일이 없습니다.');
  console.log('   먼저 npx tsx scripts/checkIncompleteReviews.ts 를 실행하세요.');
  process.exit(1);
}

async function getExistingReviewIds(pcode: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('danawa_reviews')
      .select('external_review_id')
      .eq('pcode', pcode)
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      data.forEach(row => {
        if (row.external_review_id) {
          ids.add(row.external_review_id);
        }
      });
      offset += pageSize;
      hasMore = data.length === pageSize;
    }
  }

  return ids;
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
  existingIds: Set<string>,
  dryRun: boolean
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const stats = { inserted: 0, skipped: 0, errors: 0 };

  if (reviews.length === 0) {
    return stats;
  }

  const crawledAt = new Date().toISOString();

  for (const review of reviews) {
    // 이미 존재하는 리뷰 스킵
    if (review.reviewId && existingIds.has(review.reviewId)) {
      stats.skipped++;
      continue;
    }

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

// =====================================================
// 메인 크롤링 로직
// =====================================================

async function processProduct(
  product: IncompleteProduct,
  browser: Browser,
  options: Options,
  existingIds: Set<string>
): Promise<{ success: boolean; newReviews: number; inserted: number }> {
  // 필요한 페이지 수 계산
  const targetReviews = Math.min(product.expected, options.maxReviewsPerProduct);
  const maxPages = Math.ceil(targetReviews / 10) + 5; // 여유분 추가

  console.log(`  📄 목표: ${targetReviews}개, 최대 ${maxPages}페이지 크롤링`);

  try {
    const result = await fetchDanawaReviews(
      product.pcode,
      maxPages,
      browser,
      options.fastMode
    );

    if (!result.success) {
      return { success: false, newReviews: 0, inserted: 0 };
    }

    // 새로운 리뷰만 필터링
    const newReviews = result.reviews.filter(r =>
      r.reviewId && !existingIds.has(r.reviewId)
    );

    console.log(`  📝 크롤링: ${result.reviews.length}개, 신규: ${newReviews.length}개`);

    // DB 저장
    const saveStats = await saveReviewsToDb(
      product.pcode,
      newReviews,
      existingIds,
      options.dryRun
    );

    return {
      success: true,
      newReviews: newReviews.length,
      inserted: saveStats.inserted,
    };
  } catch (error) {
    console.error(`  ❌ 오류:`, error);
    return { success: false, newReviews: 0, inserted: 0 };
  }
}

// =====================================================
// 메인 실행
// =====================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('🚀 리뷰 추가 크롤링 (부족한 제품 대상)');
  console.log('========================================\n');

  console.log('⚙️ 설정:');
  console.log(`   - 제품당 최대 리뷰: ${options.maxReviewsPerProduct}개`);
  console.log(`   - 제품 수 제한: ${options.productLimit || '무제한'}`);
  console.log(`   - 요청 간 딜레이: ${options.delayMs}ms`);
  console.log(`   - 병렬 처리 수: ${options.concurrency}`);
  console.log(`   - Fast Mode: ${options.fastMode}`);
  console.log(`   - Dry Run: ${options.dryRun}`);

  if (options.dryRun) {
    console.log('\n⚠️ DRY-RUN 모드: DB에 저장하지 않습니다.\n');
  }

  // 1. 부족한 제품 목록 로드
  console.log('\n📋 부족한 제품 목록 로드...');
  let products = await loadIncompleteProducts();

  if (options.productLimit > 0) {
    products = products.slice(0, options.productLimit);
  }

  console.log(`   총 ${products.length}개 제품 처리 예정`);

  const totalMissing = products.reduce((sum, p) => sum + p.missing, 0);
  console.log(`   총 부족 리뷰: ${totalMissing.toLocaleString()}개`);

  // 2. 브라우저 생성
  console.log(`\n🌐 브라우저 ${options.concurrency}개 생성 중...`);
  const browsers: Browser[] = [];
  for (let i = 0; i < options.concurrency; i++) {
    const browser = await createBrowser();
    browsers.push(browser);
    console.log(`   ✅ 브라우저 #${i + 1} 생성 완료`);
  }

  // 3. 크롤링 시작
  console.log('\n📡 크롤링 시작...\n');
  const startTime = Date.now();

  const totalStats = {
    success: 0,
    failed: 0,
    totalNewReviews: 0,
    totalInserted: 0,
  };

  let currentIndex = 0;
  const total = products.length;

  // 워커 함수
  async function worker(workerId: number, browser: Browser): Promise<void> {
    while (true) {
      const idx = currentIndex++;
      if (idx >= total) break;

      const product = products[idx];
      const progress = `[${idx + 1}/${total}]`;

      console.log(`\n🔄 W${workerId} ${progress} ${product.title.substring(0, 35)}...`);
      console.log(`  📊 현재: ${product.actual}개 / 목표: ${product.expected}개`);

      // 기존 리뷰 ID 가져오기
      const existingIds = await getExistingReviewIds(product.pcode);
      console.log(`  💾 DB 기존 리뷰: ${existingIds.size}개`);

      const result = await processProduct(product, browser, options, existingIds);

      if (result.success) {
        console.log(`  ✅ W${workerId} ${progress} 완료: 신규 ${result.newReviews}개, 저장 ${result.inserted}개`);
        totalStats.success++;
        totalStats.totalNewReviews += result.newReviews;
        totalStats.totalInserted += result.inserted;
      } else {
        console.log(`  ❌ W${workerId} ${progress} 실패`);
        totalStats.failed++;
      }

      // 딜레이
      if (idx < total - 1) {
        await new Promise(resolve => setTimeout(resolve, options.delayMs));
      }
    }
  }

  // 모든 워커 병렬 실행
  const workerPromises = browsers.map((browser, idx) => worker(idx + 1, browser));
  await Promise.all(workerPromises);

  // 4. 브라우저 종료
  console.log('\n🧹 브라우저 종료 중...');
  for (const browser of browsers) {
    try {
      await browser.close();
    } catch {
      // 무시
    }
  }

  // 5. 최종 결과
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n========================================');
  console.log('📊 최종 결과');
  console.log('========================================');
  console.log(`   - 소요 시간: ${elapsed}분`);
  console.log(`   - 성공: ${totalStats.success}개 제품`);
  console.log(`   - 실패: ${totalStats.failed}개 제품`);
  console.log(`   - 총 신규 리뷰: ${totalStats.totalNewReviews.toLocaleString()}개`);
  console.log(`   - DB 저장: ${totalStats.totalInserted.toLocaleString()}개`);
  console.log('========================================\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ 치명적 오류:', error);
  process.exit(1);
});
