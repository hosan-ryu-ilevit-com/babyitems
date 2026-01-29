import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('\n========================================');
  console.log('📊 knowledge_products_cache 테이블 통계');
  console.log('========================================\n');

  // 전체 제품 수
  const { count: totalCount, error: e1 } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`전체 제품 수: ${totalCount?.toLocaleString()}개`);

  // 카테고리별 분포
  console.log('\n========================================');
  console.log('📊 카테고리별 제품 수');
  console.log('========================================\n');

  const { data: categoryData, error: e2 } = await supabase
    .from('knowledge_products_cache')
    .select('category_key');

  if (!e2 && categoryData) {
    const categoryMap = new Map<string, number>();
    categoryData.forEach(p => {
      const key = p.category_key || 'unknown';
      categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
    });

    Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, count]) => {
        console.log(`${key}: ${count}개`);
      });
  }

  // pcode가 있는지 확인
  console.log('\n========================================');
  console.log('📊 pcode 통계');
  console.log('========================================\n');

  const { count: withPcode, error: e3 } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true })
    .not('pcode', 'is', null);

  console.log(`pcode가 있는 제품: ${withPcode?.toLocaleString()}개`);

  const { count: noPcode, error: e4 } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true })
    .is('pcode', null);

  console.log(`pcode가 없는 제품: ${noPcode?.toLocaleString()}개\n`);

  console.log('========================================\n');
}

check();
