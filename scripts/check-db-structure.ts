import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('\n=== DB 테이블 구조 확인 ===\n');

  // 1. knowledge_categories 테이블
  const { data: cat1 } = await supabase
    .from('knowledge_categories')
    .select('*')
    .limit(2);

  console.log('knowledge_categories 테이블:');
  if (cat1 && cat1.length > 0) {
    console.log('컬럼:', Object.keys(cat1[0]));
    console.log('샘플:', cat1[0]);
  }

  // 2. danawa_products 테이블
  const { data: prod1 } = await supabase
    .from('danawa_products')
    .select('*')
    .limit(1);

  console.log('\ndanawa_products 테이블:');
  if (prod1 && prod1.length > 0) {
    console.log('컬럼:', Object.keys(prod1[0]));
    console.log('샘플 (일부):', {
      pcode: prod1[0].pcode,
      name: prod1[0].name,
      brand: prod1[0].brand,
      price: prod1[0].price,
      // query 관련 컬럼 찾기
      ...Object.keys(prod1[0])
        .filter(k => k.includes('query') || k.includes('category') || k.includes('search'))
        .reduce((acc, k) => ({ ...acc, [k]: prod1[0][k] }), {})
    });
  }
}

main();
