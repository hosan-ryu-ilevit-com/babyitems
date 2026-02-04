import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n=== DB 제품 데이터 확인 ===\n');

  // 1. 총 제품 수
  const { count: totalProducts } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ 총 제품 수: ${totalProducts}개\n`);

  // 2. query 필드의 고유값 확인 (전체 조회 - 페이지네이션)
  let allQueries = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: products } = await supabase
      .from('knowledge_products_cache')
      .select('query')
      .range(offset, offset + pageSize - 1);

    if (!products || products.length === 0) break;

    products.forEach(p => allQueries.add(p.query));
    offset += pageSize;

    if (products.length < pageSize) break;
  }

  console.log(`✅ 고유 query 값: ${allQueries.size}개\n`);
  console.log(`샘플 query 값들:`);
  Array.from(allQueries).slice(0, 20).forEach(q => console.log(`  - ${q}`));

  if (allQueries.size > 20) {
    console.log(`  ... (외 ${allQueries.size - 20}개)\n`);
  }
}

main();
