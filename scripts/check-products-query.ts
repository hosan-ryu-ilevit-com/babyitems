import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function check() {
  // knowledge_products_cache의 고유 query 값들 확인
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('query');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const countByQuery: Record<string, number> = {};
  for (const p of data || []) {
    countByQuery[p.query] = (countByQuery[p.query] || 0) + 1;
  }

  console.log('knowledge_products_cache의 query별 제품 수:');
  console.log('============================================');
  for (const [query, count] of Object.entries(countByQuery).sort((a, b) => b[1] - a[1])) {
    console.log(`${query}: ${count}개`);
  }
  console.log('');
  console.log('총 카테고리:', Object.keys(countByQuery).length);
  console.log('총 제품:', Object.values(countByQuery).reduce((a, b) => a + b, 0));
}

check();
