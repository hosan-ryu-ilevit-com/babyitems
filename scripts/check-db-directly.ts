/**
 * Supabase DB에서 직접 전체 쿼리 조회
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
  console.log('Supabase에서 전체 쿼리 조회 중...\n');

  // 모든 고유 쿼리 조회
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('query, crawled_at')
    .order('query');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  // 고유 쿼리만 추출
  const uniqueQueries = new Map<string, { crawled_at: string; count: number }>();

  for (const row of data || []) {
    if (uniqueQueries.has(row.query)) {
      const existing = uniqueQueries.get(row.query)!;
      existing.count++;
      // 더 최근 crawled_at 유지
      if (row.crawled_at > existing.crawled_at) {
        existing.crawled_at = row.crawled_at;
      }
    } else {
      uniqueQueries.set(row.query, {
        crawled_at: row.crawled_at,
        count: 1
      });
    }
  }

  console.log(`총 ${uniqueQueries.size}개 카테고리에 데이터가 있습니다.\n`);

  // 알파벳 순으로 정렬하여 출력
  const sorted = Array.from(uniqueQueries.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  sorted.forEach(([query, info], i) => {
    console.log(`${i + 1}. ${query} (제품 ${info.count}개, 마지막 크롤링: ${info.crawled_at})`);
  });
}

checkDB().catch(console.error);
