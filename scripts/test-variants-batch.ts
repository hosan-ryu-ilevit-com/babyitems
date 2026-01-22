/**
 * Variants 배치 크롤링 테스트 스크립트
 *
 * 용도: 소규모 샘플로 variants 크롤링 테스트
 * 사용법: npx tsx scripts/test-variants-batch.ts [count]
 */

import * as dotenv from 'dotenv';
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

async function main() {
  const count = parseInt(process.argv[2] || '10', 10);

  console.log(`\n🧪 [Test] Testing variants batch crawl with ${count} products\n`);

  // 랜덤 샘플 조회
  console.log('📊 Fetching random sample from database...');
  const { data: products, error } = await supabase
    .from('knowledge_products_cache')
    .select('pcode, name')
    .limit(count);

  if (error || !products || products.length === 0) {
    console.error('❌ Failed to fetch products:', error);
    process.exit(1);
  }

  console.log(`✅ Fetched ${products.length} products\n`);

  // 크롤링
  const pcodes = products.map(p => p.pcode);
  const nameMap = new Map(products.map(p => [p.pcode, p.name]));

  console.log('🚀 Starting batch crawl...\n');
  const results = await crawlVariantsBatch(
    pcodes,
    2, // concurrency
    500, // delay
    (current, total, pcode, variants) => {
      const name = nameMap.get(pcode) || 'Unknown';
      if (variants && variants.length > 0) {
        console.log(`   ✅ [${current}/${total}] ${pcode} (${name}): ${variants.length} variants`);
      } else if (variants) {
        console.log(`   ⚪ [${current}/${total}] ${pcode} (${name}): No variants`);
      } else {
        console.log(`   ❌ [${current}/${total}] ${pcode} (${name}): Failed`);
      }
    }
  );

  // 통계
  console.log(`\n📊 Results:\n`);
  const withVariants = Array.from(results.values()).filter(v => v.length > 0);
  console.log(`   Total processed: ${results.size}`);
  console.log(`   With variants: ${withVariants.length}`);
  console.log(`   Without variants: ${results.size - withVariants.length}`);

  // 상세 출력
  console.log(`\n📦 Detailed Results:\n`);
  for (const [pcode, variants] of results.entries()) {
    const name = nameMap.get(pcode) || 'Unknown';
    if (variants.length > 0) {
      console.log(`${pcode} (${name.substring(0, 40)}...):`);
      variants.forEach((v, i) => {
        console.log(`  [${i + 1}] ${v.quantity}${v.isActive ? ' ⭐' : ''} - ${v.price?.toLocaleString()}원 (${v.unitPrice})`);
      });
      console.log('');
    }
  }

  // DB 업데이트 (선택적)
  const shouldUpdate = process.argv.includes('--update-db');
  if (shouldUpdate) {
    console.log('\n💾 Updating database...');
    let updateCount = 0;
    for (const [pcode, variants] of results.entries()) {
      const { error: updateError } = await supabase
        .from('knowledge_products_cache')
        .update({ variants: variants.length > 0 ? variants : null })
        .eq('pcode', pcode);

      if (updateError) {
        console.error(`   ❌ Failed to update ${pcode}:`, updateError.message);
      } else {
        updateCount++;
      }
    }
    console.log(`✅ Updated ${updateCount}/${results.size} products in database`);
  } else {
    console.log('\n💡 To update database, run with --update-db flag');
  }
}

main()
  .then(() => {
    console.log('\n✅ Test completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
