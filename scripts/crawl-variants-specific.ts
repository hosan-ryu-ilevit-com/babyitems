/**
 * 특정 카테고리 Variants 크롤링 스크립트
 * 
 * 용도: 기저귀, 물티슈 등 특정 카테고리만 크롤링
 * 사용법: npx tsx scripts/crawl-variants-specific.ts
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
const concurrency = parseInt(args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '4', 10);
const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '50', 10);
const delayMs = parseInt(args.find(arg => arg.startsWith('--delay='))?.split('=')[1] || '800', 10);

// 진행상황 로그 파일
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `variants-crawl-specific-${new Date().toISOString().split('T')[0]}.log`);

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Supabase에 variants 업데이트
 */
async function updateVariantsInDB(updates: Array<{ pcode: string; variants: any[] }>) {
  const errors: string[] = [];
  const toUpdate = updates.filter(u => u.variants.length > 0);

  if (toUpdate.length === 0) {
    return errors;
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
  log('🚀 Starting specific category variants crawl');
  log(`   Target: 기저귀, 아기물티슈, 분유`);
  log(`   Concurrency: ${concurrency}`);
  log(`   Batch size: ${batchSize}`);
  log(`   Delay: ${delayMs}ms`);

  // 1. 특정 카테고리 제품 조회
  log('📊 Fetching products from specific categories...');

  const targetQueries = ['기저귀', '아기물티슈', '분유'];
  
  let allProducts: Array<{ pcode: string; name: string; query: string }> = [];

  for (const query of targetQueries) {
    log(`   Fetching "${query}" products...`);
    
    const { data, error } = await supabase
      .from('knowledge_products_cache')
      .select('pcode, name, query')
      .ilike('query', `%${query}%`)
      .order('pcode', { ascending: true });

    if (error) {
      log(`   ⚠️ Error fetching ${query}: ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      log(`   ✅ Found ${data.length} products for "${query}"`);
    }
  }

  // 중복 제거
  const uniqueProducts = Array.from(
    new Map(allProducts.map(p => [p.pcode, p])).values()
  );

  if (uniqueProducts.length === 0) {
    log('❌ No products found for target categories');
    process.exit(1);
  }

  log(`✅ Total unique products: ${uniqueProducts.length}`);

  // 2. 배치 단위로 크롤링
  const pcodes = uniqueProducts.map(p => p.pcode);
  const batches = [];
  for (let i = 0; i < pcodes.length; i += batchSize) {
    batches.push(pcodes.slice(i, i + batchSize));
  }

  log(`📦 Processing ${batches.length} batches (${batchSize} products per batch)\n`);

  const stats = {
    total: uniqueProducts.length,
    processed: 0,
    success: 0,
    failed: 0,
    variantsFound: 0,
  };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;

    log(`\n📦 [Batch ${batchNum}/${batches.length}] Processing ${batch.length} products...`);

    const startTime = Date.now();
    const results = await crawlVariantsBatch(
      batch,
      concurrency,
      delayMs,
      (current, total, pcode, variants) => {
        if (variants) {
          stats.success++;
          if (variants.length > 0) {
            stats.variantsFound++;
          }
        } else {
          stats.failed++;
        }
        stats.processed++;
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`   ⏱️  Batch completed in ${elapsed}s`);

    // DB 업데이트
    const updates = Array.from(results.entries()).map(([pcode, variants]) => ({
      pcode,
      variants,
    }));
    const withVariants = updates.filter(u => u.variants.length > 0);

    log(`   💾 Updating database (${withVariants.length}/${updates.length} products with variants)...`);
    const dbErrors = await updateVariantsInDB(updates);
    
    if (dbErrors.length > 0) {
      log(`   ⚠️  ${dbErrors.length} DB errors`);
    } else {
      log(`   ✅ Database updated successfully`);
    }

    log(`   ✅ Batch ${batchNum} completed`);
    log(`   📊 Progress: ${stats.processed}/${stats.total} (${((stats.processed / stats.total) * 100).toFixed(1)}%)`);
    log(`   📈 Variants found: ${stats.variantsFound} products`);
    log(`   ❌ Failed: ${stats.failed}`);

    // 배치 간 딜레이
    if (batchIndex < batches.length - 1) {
      const batchDelay = 2000;
      log(`   ⏳ Waiting ${batchDelay}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  // 최종 통계
  log('\n✅ ========== CRAWL COMPLETED ==========');
  log(`   Total products: ${stats.total}`);
  log(`   Processed: ${stats.processed}`);
  log(`   Success: ${stats.success}`);
  log(`   Failed: ${stats.failed}`);
  log(`   Variants found: ${stats.variantsFound} products (${((stats.variantsFound / stats.processed) * 100).toFixed(1)}%)`);
  log('=======================================\n');
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
