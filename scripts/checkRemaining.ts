import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // 페이지네이션으로 리뷰된 pcode 전부 가져오기
  const reviewedSet = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from('danawa_reviews')
      .select('pcode')
      .range(offset, offset + pageSize - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => reviewedSet.add(r.pcode));
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  console.log(`리뷰 있는 pcode: ${reviewedSet.size}개`);

  // 전체 제품도 페이지네이션
  const allProducts: any[] = [];
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('danawa_products')
      .select('pcode, title, review_count')
      .range(offset, offset + pageSize - 1);
    if (error) { console.error('Error:', error); break; }
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  // 리뷰 수로 정렬
  allProducts.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
  console.log(`전체 제품: ${allProducts.length}개`);

  const notReviewed = allProducts.filter(p => !reviewedSet.has(p.pcode));

  console.log(`\n남은 제품: ${notReviewed.length}개`);
  console.log('\n남은 제품 샘플 (리뷰 많은 순):');
  notReviewed.slice(0, 10).forEach((p, i) => {
    console.log(`${i+1}. ${p.title.substring(0, 50)}... (리뷰: ${p.review_count || 0}개) [pcode: ${p.pcode}]`);
  });

  // 리뷰가 0인 제품 수
  const zeroReview = notReviewed.filter(p => !p.review_count || p.review_count === 0);
  console.log(`\n리뷰 0개인 제품: ${zeroReview.length}개`);
  console.log(`리뷰 있는데 미크롤링: ${notReviewed.length - zeroReview.length}개`);
}

check();
