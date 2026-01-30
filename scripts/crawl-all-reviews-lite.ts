/**
 * 전체 제품 리뷰 크롤링 스크립트 (Lite 버전)
 *
 * knowledge_products_cache의 모든 제품에 대해
 * 최대 200개씩 리뷰를 크롤링하여 knowledge_reviews_cache에 저장
 *
 * 사용법:
 *   npx tsx scripts/crawl-all-reviews-lite.ts                    # 전체 크롤링
 *   npx tsx scripts/crawl-all-reviews-lite.ts --limit=100        # 100개 제품만
 *   npx tsx scripts/crawl-all-reviews-lite.ts --skip-existing    # 이미 있는 제품 스킵
 *   npx tsx scripts/crawl-all-reviews-lite.ts --dry-run          # DB 저장 없이 테스트
 *   npx tsx scripts/crawl-all-reviews-lite.ts --max-reviews=100  # 제품당 100개 리뷰
 *   npx tsx scripts/crawl-all-reviews-lite.ts --concurrency=4    # 동시 처리 수
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { fetchReviewsLite, type ReviewLite, type ReviewCrawlResult } from '../lib/danawa/review-crawler-lite';

// ============================================================================
// Supabase 설정
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CLI 옵션 파싱
// ============================================================================

interface Options {
  limit: number;           // 처리할 제품 수 (0 = 전체)
  skipExisting: boolean;   // 이미 리뷰 있는 제품 스킵
  dryRun: boolean;         // DB 저장 없이 테스트
  maxReviews: number;      // 제품당 최대 리뷰 수
  concurrency: number;     // 동시 처리 수
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  return {
    limit: parseInt(getArg('limit') || '0', 10),
    skipExisting: hasFlag('skip-existing'),
    dryRun: hasFlag('dry-run'),
    maxReviews: parseInt(getArg('max-reviews') || '100', 10),
    concurrency: parseInt(getArg('concurrency') || '4', 10),
  };
}

// ============================================================================
// DB 헬퍼 함수
// ============================================================================

interface ProductRow {
  pcode: string;
  name: string;
  review_count: number | null;
}

async function getAllProducts(limit: number): Promise<ProductRow[]> {
  const allProducts: ProductRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const query = supabase
      .from('knowledge_products_cache')
      .select('pcode, name, review_count')
      .order('review_count', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (data && data.length > 0) {
      allProducts.push(...data);
      offset += pageSize;
      hasMore = data.length === pageSize;

      // limit이 지정되어 있고 충분히 가져왔으면 종료
      if (limit > 0 && allProducts.length >= limit) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return limit > 0 ? allProducts.slice(0, limit) : allProducts;
}

async function getExistingPcodes(): Promise<Set<string>> {
  const pcodes = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('knowledge_reviews_cache')
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

async function saveReviews(pcode: string, reviews: ReviewLite[], dryRun: boolean): Promise<number> {
  if (dryRun || reviews.length === 0) {
    return reviews.length;
  }

  // 순수 UPSERT - DELETE 없이 기존 리뷰 보존 + 새 리뷰만 추가
  const batchSize = 50;
  let saved = 0;

  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize).map((r) => ({
      pcode,
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
      .upsert(batch, { onConflict: 'pcode,review_id', ignoreDuplicates: true });

    if (error) {
      console.error(`   ⚠️ 배치 저장 실패 (${pcode}):`, error.message);
    } else {
      saved += batch.length;
    }
  }

  return saved;
}

// ============================================================================
// 메인 크롤링 로직
// ============================================================================

async function main() {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('🚀 전체 리뷰 크롤링 (Lite 버전)');
  console.log('========================================\n');

  console.log('⚙️ 설정:');
  console.log(`   - 제품당 최대 리뷰: ${options.maxReviews}개`);
  console.log(`   - 동시 처리 수: ${options.concurrency}`);
  console.log(`   - 제품 제한: ${options.limit || '전체'}`);
  console.log(`   - 기존 제품 스킵: ${options.skipExisting}`);
  console.log(`   - Dry Run: ${options.dryRun}`);

  if (options.dryRun) {
    console.log('\n⚠️ DRY-RUN 모드: DB에 저장하지 않습니다.\n');
  }

  // 1. 제품 목록 가져오기
  console.log('\n📋 제품 목록 조회...');
  const allProducts = await getAllProducts(options.limit);
  console.log(`   총 ${allProducts.length}개 제품`);

  // 2. 기존 리뷰 있는 제품 확인 (옵션)
  let productsToProcess = allProducts;
  if (options.skipExisting) {
    console.log('\n🔍 기존 리뷰 확인...');
    const existingPcodes = await getExistingPcodes();
    console.log(`   이미 리뷰 있는 제품: ${existingPcodes.size}개`);

    productsToProcess = allProducts.filter(p => !existingPcodes.has(p.pcode));
    console.log(`   크롤링할 제품: ${productsToProcess.length}개`);
  }

  if (productsToProcess.length === 0) {
    console.log('\n✅ 크롤링할 제품이 없습니다.');
    process.exit(0);
  }

  // 3. 크롤링 시작
  console.log('\n📡 크롤링 시작...\n');
  const startTime = Date.now();

  const stats = {
    success: 0,
    failed: 0,
    totalReviews: 0,
    skippedNoReviews: 0,
  };

  // 청크 단위로 병렬 처리
  const total = productsToProcess.length;
  for (let i = 0; i < total; i += options.concurrency) {
    const chunk = productsToProcess.slice(i, i + options.concurrency);

    const results = await Promise.all(
      chunk.map(async (product): Promise<{ product: ProductRow; result: ReviewCrawlResult }> => {
        const result = await fetchReviewsLite(product.pcode, {
          maxReviews: options.maxReviews,
          timeout: 20000,
        });
        return { product, result };
      })
    );

    // 결과 처리 및 저장
    for (const { product, result } of results) {
      const progress = `[${i + results.indexOf({ product, result }) + 1}/${total}]`;

      if (result.success && result.reviews.length > 0) {
        const saved = await saveReviews(product.pcode, result.reviews, options.dryRun);
        console.log(`✅ ${progress} ${product.name.substring(0, 30)}... → ${saved}개 리뷰`);
        stats.success++;
        stats.totalReviews += saved;
      } else if (result.success && result.reviews.length === 0) {
        console.log(`⏭️ ${progress} ${product.name.substring(0, 30)}... → 리뷰 없음`);
        stats.skippedNoReviews++;
      } else {
        console.log(`❌ ${progress} ${product.name.substring(0, 30)}... → 실패`);
        stats.failed++;
      }
    }

    // Rate limit 방지 딜레이
    if (i + options.concurrency < total) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 중간 진행상황 (100개마다)
    if ((i + options.concurrency) % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n📊 진행: ${i + options.concurrency}/${total} (${elapsed}분 경과)\n`);
    }
  }

  // 4. 최종 결과
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const avgPerProduct = ((Date.now() - startTime) / 1000 / stats.success).toFixed(1);

  console.log('\n========================================');
  console.log('📊 최종 결과');
  console.log('========================================');
  console.log(`   - 소요 시간: ${elapsed}분`);
  console.log(`   - 평균 처리 시간: ${avgPerProduct}초/제품`);
  console.log(`   - 성공: ${stats.success}개 제품`);
  console.log(`   - 실패: ${stats.failed}개 제품`);
  console.log(`   - 리뷰 없음: ${stats.skippedNoReviews}개 제품`);
  console.log(`   - 총 리뷰 수집: ${stats.totalReviews}개`);
  console.log('========================================\n');
}

main().catch((error) => {
  console.error('\n❌ 치명적 오류:', error);
  process.exit(1);
});
