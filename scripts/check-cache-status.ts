import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  // count만 조회 (빠름)
  const { count: productCount } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true });

  const { count: reviewCount } = await supabase
    .from('knowledge_reviews_cache')
    .select('*', { count: 'exact', head: true });

  const { count: priceCount } = await supabase
    .from('knowledge_prices_cache')
    .select('*', { count: 'exact', head: true });

  // 고유 쿼리 목록 (RPC로 distinct)
  const { data: distinctQueries } = await supabase.rpc('get_distinct_queries');

  // fallback: 일반 쿼리로 시도
  let uniqueQueries: string[] = [];
  if (distinctQueries && Array.isArray(distinctQueries)) {
    uniqueQueries = distinctQueries.map((d: { query: string }) => d.query);
  } else {
    // RPC 실패시 그룹별 조회
    const allQueries: string[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('knowledge_products_cache')
        .select('query')
        .range(offset, offset + batchSize - 1);
      if (!data || data.length === 0) break;
      allQueries.push(...data.map(d => d.query));
      offset += batchSize;
      if (data.length < batchSize) break;
    }
    uniqueQueries = [...new Set(allQueries)];
  }

  console.log('=== 캐시 현황 ===');
  console.log(`제품 캐시: ${productCount || 0}개 (${uniqueQueries.length}개 카테고리)`);
  console.log(`리뷰 캐시: ${reviewCount || 0}개`);
  console.log(`가격 캐시: ${priceCount || 0}개`);

  // 카테고리 목록 출력
  console.log('\n=== 캐시된 카테고리 ===');
  const sortedQueries = uniqueQueries.sort((a, b) => a.localeCompare(b));
  for (const query of sortedQueries.slice(0, 30)) {
    console.log(`  - ${query}`);
  }
  if (sortedQueries.length > 30) {
    console.log(`  ... 그 외 ${sortedQueries.length - 30}개 카테고리`);
  }
}

check();
