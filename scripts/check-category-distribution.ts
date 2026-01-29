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
  console.log('📊 카테고리별 제품 수');
  console.log('========================================\n');

  const { data, error } = await supabase
    .from('danawa_products')
    .select('category_code, category_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const categoryMap = new Map();
  data!.forEach(p => {
    const key = p.category_code || 'unknown';
    const name = p.category_name || 'Unknown';
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { name, count: 0 });
    }
    categoryMap.get(key).count++;
  });

  let total = 0;
  Array.from(categoryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([code, info]) => {
      console.log(`${info.name} (${code}): ${info.count}개`);
      total += info.count;
    });

  console.log(`\n========================================`);
  console.log(`총 ${total}개 제품`);
  console.log(`========================================\n`);
}

check();
