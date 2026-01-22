/**
 * 모든 제품의 Variants 배치 크롤링 스크립트
 *
 * 용도: knowledge_products_cache의 모든 제품에 대해 variants만 크롤링하여 업데이트
 * 사용법: npx tsx scripts/crawl-all-variants.ts [--concurrency 4] [--batch-size 100]
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { crawlVariantsBatch } from '../lib/danawa/variants-crawler';

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CLI 인자 파싱
const args = process.argv.slice(2);
const concurrency = parseInt(args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '10', 10);
const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '200', 10);
const delayMs = parseInt(args.find(arg => arg.startsWith('--delay='))?.split('=')[1] || '300', 10);

// 진행상황 로그 파일
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `variants-crawl-${new Date().toISOString().split('T')[0]}.log`);
const progressFile = path.join(logDir, 'variants-crawl-progress.json');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// 진행상황 저장
interface Progress {
  totalProducts: number;
  processedProducts: number;
  successCount: number;
  failCount: number;
  variantsFoundCount: number;
  lastProcessedPcode: string | null;
  startedAt: string;
  lastUpdatedAt: string;
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

function loadProgress(): Progress | null {
  try {
    if (fs.existsSync(progressFile)) {
      return JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Supabase에 variants 업데이트
 * variants가 없으면 DB 업데이트 스킵 (성능 최적화)
 */
async function updateVariantsInDB(updates: Array<{ pcode: string; variants: any[] }>) {
  const errors: string[] = [];
  const toUpdate = updates.filter(u => u.variants.length > 0); // 0개는 스킵

  if (toUpdate.length === 0) {
    return errors; // 업데이트할 것이 없으면 바로 리턴
  }

  for (const { pcode, variants } of toUpdate) {
    try {
      const { error } = await supabase
        .from('knowledge_products_cache')
        .update({ variants })
        .eq('pcode', pcode);

      if (error) {
        errors.push(`${pcode}: ${error.message}`);
      }
    } catch (err) {
      errors.push(`${pcode}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return errors;
}

/**
 * 메인 함수
 */
async function main() {
  log('🚀 Starting variants batch crawl');
  log(`   Concurrency: ${concurrency}`);
  log(`   Batch size: ${batchSize}`);
  log(`   Delay: ${delayMs}ms`);

  // 1. 모든 pcode 조회 (페이지네이션)
  log('📊 Fetching all pcodes from knowledge_products_cache...');

  let allProducts: Array<{ pcode: string }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: batch, error: fetchError } = await supabase
      .from('knowledge_products_cache')
      .select('pcode')
      .order('pcode', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (fetchError) {
      log(`❌ Failed to fetch pcodes: ${fetchError.message}`);
      process.exit(1);
    }

    if (!batch || batch.length === 0) {
      break; // 더 이상 데이터 없음
    }

    allProducts = allProducts.concat(batch);
    log(`   Fetched ${allProducts.length} products so far...`);

    if (batch.length < pageSize) {
      break; // 마지막 페이지
    }

    offset += pageSize;
  }

  if (allProducts.length === 0) {
    log('❌ No products found in database');
    process.exit(1);
  }

  const products = allProducts;

  // 중복 제거
  const uniquePcodes = Array.from(new Set(products.map(p => p.pcode)));
  log(`✅ Found ${uniquePcodes.length} unique products`);

  // 진행상황 로드 (재시작 지원)
  const existingProgress = loadProgress();
  let startIndex = 0;

  if (existingProgress && existingProgress.lastProcessedPcode) {
    const lastIndex = uniquePcodes.indexOf(existingProgress.lastProcessedPcode);
    if (lastIndex >= 0) {
      startIndex = lastIndex + 1;
      log(`🔄 Resuming from pcode ${existingProgress.lastProcessedPcode} (index ${startIndex})`);
    }
  }

  const pcodes = uniquePcodes.slice(startIndex);
  const totalProducts = uniquePcodes.length;

  const progress: Progress = {
    totalProducts,
    processedProducts: existingProgress?.processedProducts || 0,
    successCount: existingProgress?.successCount || 0,
    failCount: existingProgress?.failCount || 0,
    variantsFoundCount: existingProgress?.variantsFoundCount || 0,
    lastProcessedPcode: existingProgress?.lastProcessedPcode || null,
    startedAt: existingProgress?.startedAt || new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };

  // 2. 배치 단위로 크롤링
  const batches = [];
  for (let i = 0; i < pcodes.length; i += batchSize) {
    batches.push(pcodes.slice(i, i + batchSize));
  }

  log(`📦 Processing ${batches.length} batches (${batchSize} products per batch)`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;

    log(`\n📦 [Batch ${batchNum}/${batches.length}] Processing ${batch.length} products...`);

    // 크롤링
    const startTime = Date.now();
    const results = await crawlVariantsBatch(
      batch,
      concurrency,
      delayMs,
      (current, total, pcode, variants) => {
        if (variants) {
          progress.successCount++;
          if (variants.length > 0) {
            progress.variantsFoundCount++;
          }
        } else {
          progress.failCount++;
        }
        progress.processedProducts++;
        progress.lastProcessedPcode = pcode;
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`   ⏱️  Batch completed in ${elapsed}s`);

    // DB 업데이트 (variants 있는 것만)
    const updates = Array.from(results.entries()).map(([pcode, variants]) => ({
      pcode,
      variants,
    }));
    const withVariants = updates.filter(u => u.variants.length > 0);

    log(`   💾 Updating database (${withVariants.length}/${updates.length} products with variants)...`);
    const dbErrors = await updateVariantsInDB(updates);
    if (dbErrors.length > 0) {
      log(`   ⚠️  ${dbErrors.length} DB errors:`);
      dbErrors.forEach(err => log(`      ${err}`));
    } else {
      log(`   ✅ Database updated successfully`);
    }

    // 진행상황 저장
    progress.lastUpdatedAt = new Date().toISOString();
    saveProgress(progress);

    log(`   ✅ Batch ${batchNum} completed`);
    log(`   📊 Progress: ${progress.processedProducts}/${totalProducts} (${((progress.processedProducts / totalProducts) * 100).toFixed(1)}%)`);
    log(`   📈 Variants found: ${progress.variantsFoundCount} products`);
    log(`   ❌ Failed: ${progress.failCount}`);

    // 배치 간 딜레이 (서버 부하 방지)
    if (batchIndex < batches.length - 1) {
      const batchDelay = 2000;
      log(`   ⏳ Waiting ${batchDelay}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  // 최종 통계
  log('\n✅ ========== CRAWL COMPLETED ==========');
  log(`   Total products: ${totalProducts}`);
  log(`   Processed: ${progress.processedProducts}`);
  log(`   Success: ${progress.successCount}`);
  log(`   Failed: ${progress.failCount}`);
  log(`   Variants found: ${progress.variantsFoundCount} products (${((progress.variantsFoundCount / progress.processedProducts) * 100).toFixed(1)}%)`);
  log(`   Started at: ${progress.startedAt}`);
  log(`   Completed at: ${new Date().toISOString()}`);
  log('=======================================\n');

  // 진행상황 파일 삭제 (완료)
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
}

// 실행
main()
  .then(() => {
    log('👋 Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    log(`❌ Script failed: ${error instanceof Error ? error.message : error}`);
    console.error(error);
    process.exit(1);
  });
