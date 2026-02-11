/**
 * 다나와 가격 배치 업데이트 스크립트
 *
 * 용도: 주 1회 실행하여 모든 상품 가격 정보 업데이트
 *
 * 데이터 소스: knowledge_products_cache 테이블 → danawa_prices 테이블
 *
 * 실행 방법:
 *   npx tsx scripts/updateDanawaPrices.ts
 *   npx tsx scripts/updateDanawaPrices.ts --limit 100    # 100개만 테스트
 *   npx tsx scripts/updateDanawaPrices.ts --category 유모차  # 특정 카테고리만 (query 값)
 *   npx tsx scripts/updateDanawaPrices.ts --dry-run      # DB 저장 없이 테스트
 *   npx tsx scripts/updateDanawaPrices.ts --resume       # 미완료 상품만 처리 (이어하기)
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import {
  fetchDanawaPrice,
  fetchDanawaPricesBatchParallel,
  DanawaPriceResult
} from '../lib/danawa/price-crawler';

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
  limit?: number;
  category?: string;
  dryRun: boolean;
  delayMs: number;
  batchSize: number;
  concurrency: number; // 가격 크롤링 동시 처리 수
  resume: boolean;  // 이어하기 모드
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    delayMs: 2000,      // 2초 딜레이 (Rate limit)
    batchSize: 50,      // 50개씩 DB 저장
    concurrency: 1,     // 기본: 순차 처리
    resume: false,      // 이어하기 모드
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--category' && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--delay' && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = Math.max(1, parseInt(args[i + 1], 10));
      i++;
    } else if (args[i] === '--resume') {
      options.resume = true;
    }
  }

  return options;
}

// =====================================================
// 메인 로직
// =====================================================

interface ProductRow {
  pcode: string;
  name: string;
  query: string | null;
}

async function fetchProducts(options: Options): Promise<ProductRow[]> {
  const allProducts: ProductRow[] = [];
  const pageSize = 1000; // Supabase 기본 limit
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('knowledge_products_cache')
      .select('pcode, name, query')
      .order('pcode', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (options.category) {
      query = query.eq('query', options.category);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (data && data.length > 0) {
      allProducts.push(...data);
      page++;
      hasMore = data.length === pageSize; // 다음 페이지가 있는지 확인
    } else {
      hasMore = false;
    }
  }

  // --resume 옵션: 이미 저장된 pcode 제외
  if (options.resume) {
    console.log('🔄 Resume 모드: 이미 저장된 상품 제외 중...');
    const existingPcodes = await fetchExistingPcodes();
    console.log(`   이미 저장된 상품: ${existingPcodes.size}개`);
    
    const filtered = allProducts.filter(p => !existingPcodes.has(p.pcode));
    console.log(`   남은 상품: ${filtered.length}개\n`);
    
    // --limit 옵션이 있으면 잘라서 반환
    if (options.limit && options.limit < filtered.length) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }

  // --limit 옵션이 있으면 잘라서 반환
  if (options.limit && options.limit < allProducts.length) {
    return allProducts.slice(0, options.limit);
  }

  return allProducts;
}

async function fetchExistingPcodes(): Promise<Set<string>> {
  const existingPcodes = new Set<string>();
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('danawa_prices')
      .select('pcode')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Failed to fetch existing pcodes:', error.message);
      break;
    }

    if (data && data.length > 0) {
      data.forEach(row => existingPcodes.add(row.pcode));
      page++;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return existingPcodes;
}

async function savePriceToDb(result: DanawaPriceResult): Promise<boolean> {
  const { error } = await supabase.from('danawa_prices').upsert({
    pcode: result.pcode,
    lowest_price: result.lowestPrice,
    lowest_mall: result.lowestMall,
    lowest_delivery: result.lowestDelivery,
    lowest_link: result.lowestLink,
    mall_prices: result.mallPrices,
    mall_count: result.mallCount,
    price_min: result.priceMin,
    price_max: result.priceMax,
    price_updated_at: result.updatedAt.toISOString(),
  }, {
    onConflict: 'pcode',
  });

  if (error) {
    console.error(`   ❌ DB save failed for ${result.pcode}:`, error.message);
    return false;
  }

  return true;
}

function toUpsertRow(result: DanawaPriceResult) {
  return {
    pcode: result.pcode,
    lowest_price: result.lowestPrice,
    lowest_mall: result.lowestMall,
    lowest_delivery: result.lowestDelivery,
    lowest_link: result.lowestLink,
    mall_prices: result.mallPrices,
    mall_count: result.mallCount,
    price_min: result.priceMin,
    price_max: result.priceMax,
    price_updated_at: result.updatedAt.toISOString(),
  };
}

async function savePricesBatchToDb(results: DanawaPriceResult[], batchSize: number): Promise<{ saved: number; failed: number }> {
  const successResults = results.filter((r) => r.success && r.lowestPrice !== null);
  if (successResults.length === 0) {
    return { saved: 0, failed: 0 };
  }

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < successResults.length; i += batchSize) {
    const chunk = successResults.slice(i, i + batchSize).map(toUpsertRow);
    const { error } = await supabase.from('danawa_prices').upsert(chunk, {
      onConflict: 'pcode',
    });

    if (error) {
      console.error(`   ❌ DB batch save failed (${i + 1}-${i + chunk.length}):`, error.message);
      failed += chunk.length;
    } else {
      saved += chunk.length;
    }
  }

  return { saved, failed };
}

async function updateDanawaPrices(options: Options): Promise<void> {
  console.log('\n========================================');
  console.log('🚀 다나와 가격 배치 업데이트 시작');
  console.log('========================================\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN 모드: DB 저장 없이 테스트\n');
  }

  // 1. 상품 목록 조회
  console.log('📋 상품 목록 조회 중...');
  const products = await fetchProducts(options);
  console.log(`   총 ${products.length}개 상품 발견\n`);

  if (products.length === 0) {
    console.log('✅ 업데이트할 상품이 없습니다.');
    return;
  }

  // 2. 통계 초기화
  const stats = {
    total: products.length,
    success: 0,
    failed: 0,
    noPrice: 0,
    dbSaved: 0,
    dbFailed: 0,
  };

  const startTime = Date.now();

  console.log(`🚦 크롤링 모드: ${options.concurrency > 1 ? `병렬(${options.concurrency})` : '순차(1)'}`);
  const pcodes = products.map((p) => p.pcode);
  const nameByPcode = new Map(products.map((p) => [p.pcode, p.name]));
  const results: DanawaPriceResult[] = options.concurrency > 1
    ? await fetchDanawaPricesBatchParallel(
        pcodes,
        options.concurrency,
        options.delayMs,
        (current, total, result) => {
          if (current % 10 === 0 || current === total) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = current / Math.max(elapsed, 1);
            const remaining = (total - current) / Math.max(rate, 0.01);
            console.log(`   진행: ${current}/${total} ${result.success ? '✅' : '❌'} | 속도: ${rate.toFixed(2)}개/초 | 남은 시간: ${Math.ceil(remaining / 60)}분`);
          }
        }
      )
    : await (async () => {
        const sequentialResults: DanawaPriceResult[] = [];
        for (let i = 0; i < products.length; i++) {
          const product = products[i];
          const progress = `[${i + 1}/${stats.total}]`;
          console.log(`\n${progress} 📦 ${product.name}`);
          console.log(`   pcode: ${product.pcode}`);
          const result = await fetchDanawaPrice(product.pcode);
          sequentialResults.push(result);
          if (result.success && result.lowestPrice) {
            console.log(`   ✅ ${result.lowestPrice.toLocaleString()}원 (${result.lowestMall})`);
            console.log(`   📊 ${result.mallCount}개 쇼핑몰, 가격 범위: ${result.priceMin?.toLocaleString()}~${result.priceMax?.toLocaleString()}원`);
          } else {
            console.log(`   ⚠️ 가격 정보 없음: ${result.error || 'No price found'}`);
          }
          if (i < products.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, options.delayMs));
          }
          if ((i + 1) % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = (i + 1) / Math.max(elapsed, 1);
            const remaining = (stats.total - i - 1) / Math.max(rate, 0.01);
            console.log(`\n   ⏱️ 진행률: ${((i + 1) / stats.total * 100).toFixed(1)}% | 속도: ${rate.toFixed(2)}개/초 | 남은 시간: ${Math.ceil(remaining / 60)}분\n`);
          }
        }
        return sequentialResults;
      })();

  // 4. 결과 집계
  for (const result of results) {
    if (result.success && result.lowestPrice !== null) {
      stats.success++;
    } else if (result.success) {
      stats.noPrice++;
    } else {
      // "가격 정보 없음" 류는 noPrice로 분류, 그 외는 failed
      const err = String(result.error || '');
      if (err.toLowerCase().includes('no price') || err.includes('가격 정보 없음')) {
        stats.noPrice++;
      } else {
        stats.failed++;
      }
      const name = nameByPcode.get(result.pcode);
      if (name) {
        console.log(`   ⚠️ 실패/미검출: ${name} (${result.pcode}) - ${result.error || 'unknown'}`);
      }
    }
  }

  // 5. DB 저장
  if (!options.dryRun) {
    if (options.concurrency > 1) {
      const saveStats = await savePricesBatchToDb(results, options.batchSize);
      stats.dbSaved += saveStats.saved;
      stats.dbFailed += saveStats.failed;
    } else {
      for (const result of results) {
        if (!result.success || result.lowestPrice === null) continue;
        const saved = await savePriceToDb(result);
        if (saved) {
          stats.dbSaved++;
        } else {
          stats.dbFailed++;
        }
      }
    }
  }

  // 4. 최종 통계
  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n========================================');
  console.log('📊 최종 결과');
  console.log('========================================');
  console.log(`총 처리: ${stats.total}개`);
  console.log(`✅ 성공: ${stats.success}개`);
  console.log(`⚠️ 가격 없음: ${stats.noPrice}개`);
  console.log(`❌ 실패: ${stats.failed}개`);
  if (!options.dryRun) {
    console.log(`💾 DB 저장: ${stats.dbSaved}개`);
    console.log(`💥 DB 실패: ${stats.dbFailed}개`);
  }
  console.log(`⏱️ 소요 시간: ${(totalTime / 60).toFixed(1)}분`);
  console.log(`📈 평균 속도: ${(stats.total / totalTime).toFixed(2)}개/초`);
  console.log('========================================\n');
}

// =====================================================
// 실행
// =====================================================

async function main() {
  const options = parseArgs();

  console.log('⚙️ 설정:');
  console.log(`   - Limit: ${options.limit || '없음 (전체)'}`);
  console.log(`   - Category: ${options.category || '없음 (전체)'}`);
  console.log(`   - Dry Run: ${options.dryRun}`);
  console.log(`   - Resume: ${options.resume}`);
  console.log(`   - Delay: ${options.delayMs}ms`);
  console.log(`   - Concurrency: ${options.concurrency}`);
  console.log(`   - Batch Size: ${options.batchSize}`);

  try {
    await updateDanawaPrices(options);
    console.log('✅ 완료!');
    process.exit(0);
  } catch (error) {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  }
}

main();
