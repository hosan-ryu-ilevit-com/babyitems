#!/usr/bin/env npx tsx
/**
 * 리뷰 크롤링 진행 상황 확인
 * 실행: npx tsx scripts/checkReviewProgress.ts
 */

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
  // 총 제품 수
  const { count: totalProducts } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true });

  // 총 리뷰 수
  const { count: totalReviews } = await supabase
    .from('danawa_reviews')
    .select('*', { count: 'exact', head: true });

  // 리뷰 있는 제품 수 (danawa_products에서 review_count > 0인 제품)
  // 크롤링 시 review_count가 업데이트되므로 이게 더 정확함
  const { count: productsWithReviewCount } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true })
    .gt('review_count', 0);

  // 실제 리뷰가 저장된 제품 수 (페이지네이션으로 전체 조회)
  const uniquePcodes = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('danawa_reviews')
      .select('pcode')
      .range(offset, offset + pageSize - 1);

    if (data && data.length > 0) {
      data.forEach(r => uniquePcodes.add(r.pcode));
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  const productsWithReviews = uniquePcodes.size;

  const progress = ((productsWithReviews / (totalProducts || 1)) * 100).toFixed(1);

  console.log('\n📊 리뷰 크롤링 진행 상황');
  console.log('========================');
  console.log(`✅ 리뷰 저장된 제품: ${productsWithReviews} / ${totalProducts}개 (${progress}%)`);
  console.log(`📋 리뷰 있는 제품 (DB): ${productsWithReviewCount}개`);
  console.log(`📝 총 리뷰 수: ${totalReviews?.toLocaleString()}개`);
  console.log(`⏳ 남은 제품: ${(totalProducts || 0) - productsWithReviews}개`);
  console.log('========================\n');
}

check().catch(console.error);
