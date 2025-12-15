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

  // 리뷰 있는 제품 수 (distinct pcode)
  const { data: pcodeData } = await supabase
    .from('danawa_reviews')
    .select('pcode');

  const uniquePcodes = new Set(pcodeData?.map(r => r.pcode) || []);
  const productsWithReviews = uniquePcodes.size;

  const progress = ((productsWithReviews / (totalProducts || 1)) * 100).toFixed(1);

  console.log('\n📊 리뷰 크롤링 진행 상황');
  console.log('========================');
  console.log(`✅ 리뷰 있는 제품: ${productsWithReviews} / ${totalProducts}개 (${progress}%)`);
  console.log(`📝 총 리뷰 수: ${totalReviews?.toLocaleString()}개`);
  console.log(`⏳ 남은 제품: ${(totalProducts || 0) - productsWithReviews}개`);
  console.log('========================\n');
}

check().catch(console.error);
