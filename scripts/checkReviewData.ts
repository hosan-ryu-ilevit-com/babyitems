#!/usr/bin/env npx tsx
/**
 * 리뷰 데이터 품질 확인
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
  // 최근 저장된 리뷰 샘플 5개
  const { data: reviews } = await supabase
    .from('danawa_reviews')
    .select('*')
    .order('crawled_at', { ascending: false })
    .limit(5);

  console.log('\n📝 최근 저장된 리뷰 샘플:');
  reviews?.forEach((r, i) => {
    console.log(`\n[${i+1}] pcode: ${r.pcode}`);
    console.log(`    별점: ${r.rating}`);
    console.log(`    내용: ${r.content?.substring(0, 50)}...`);
    console.log(`    작성자: ${r.author || '(없음)'}`);
    console.log(`    날짜: ${r.review_date || '(없음)'}`);
    console.log(`    쇼핑몰: ${r.mall_name || '(없음)'}`);
    console.log(`    이미지: ${r.images?.length || 0}개`);
    console.log(`    external_review_id: ${r.external_review_id}`);
  });

  // 이미지 있는 리뷰 수
  const { count: withImages } = await supabase
    .from('danawa_reviews')
    .select('*', { count: 'exact', head: true })
    .not('images', 'eq', '[]');

  // 쇼핑몰 정보 있는 리뷰 수
  const { count: withMall } = await supabase
    .from('danawa_reviews')
    .select('*', { count: 'exact', head: true })
    .not('mall_name', 'is', null);

  // 총 리뷰 수
  const { count: total } = await supabase
    .from('danawa_reviews')
    .select('*', { count: 'exact', head: true });

  console.log('\n📊 통계:');
  console.log(`   총 리뷰: ${total}개`);
  console.log(`   이미지 있는 리뷰: ${withImages}개`);
  console.log(`   쇼핑몰 정보 있는 리뷰: ${withMall}개`);
}

check().catch(console.error);
