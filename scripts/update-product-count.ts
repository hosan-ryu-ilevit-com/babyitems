import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface Category {
  query: string;
  product_count: number;
}

async function main() {
  console.log('📊 카테고리별 제품 수 확인 및 업데이트\n');

  // 1. knowledge_products_cache에서 카테고리(query)별 제품 수 집계
  // Supabase 기본 limit 1000개 → 페이지네이션으로 전체 조회
  const countByQuery: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: products, error: productError } = await supabase
      .from('knowledge_products_cache')
      .select('query')
      .range(offset, offset + pageSize - 1);

    if (productError) {
      console.error('제품 조회 실패:', productError);
      return;
    }

    if (!products || products.length === 0) break;

    for (const p of products) {
      countByQuery[p.query] = (countByQuery[p.query] || 0) + 1;
    }

    console.log(`  조회 중... ${offset + products.length}개`);

    if (products.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`\n총 ${Object.values(countByQuery).reduce((a, b) => a + b, 0)}개 제품 조회 완료\n`);

  // 2. knowledge_categories 테이블 조회
  const { data: categories, error: catError } = await supabase
    .from('knowledge_categories')
    .select('query, product_count');

  if (catError) {
    console.error('카테고리 조회 실패:', catError);
    return;
  }

  console.log('카테고리별 실제 제품 수 vs product_count:');
  console.log('========================================');

  const updates: { query: string; actual: number; stored: number }[] = [];

  for (const cat of (categories as Category[]) || []) {
    // query 컬럼으로 매칭 (knowledge_products_cache.query와 동일)
    const actual = countByQuery[cat.query] || 0;
    const stored = cat.product_count || 0;
    const status = actual === stored ? '✅' : '❌';
    console.log(`${status} ${cat.query}: 실제=${actual}, DB=${stored}`);

    if (actual !== stored) {
      updates.push({
        query: cat.query,
        actual,
        stored
      });
    }
  }

  console.log(`\n업데이트 필요: ${updates.length}개`);

  if (updates.length === 0) {
    console.log('✅ 모든 카테고리의 product_count가 정확합니다.');
    return;
  }

  // 3. 업데이트 실행
  console.log('\n📝 product_count 업데이트 중...');

  for (const u of updates) {
    const { error: updateError } = await supabase
      .from('knowledge_categories')
      .update({ product_count: u.actual })
      .eq('query', u.query);

    if (updateError) {
      console.error(`  ❌ ${u.query} 업데이트 실패:`, updateError);
    } else {
      console.log(`  ✅ ${u.query}: ${u.stored} → ${u.actual}`);
    }
  }

  console.log('\n✅ 업데이트 완료!');
}

main();
