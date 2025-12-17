#!/usr/bin/env npx tsx
/**
 * 리뷰가 부족한 제품 확인
 * - review_count > 50인데 실제 저장된 리뷰가 50개 이하인 제품들
 *
 * 실행: npx tsx scripts/checkIncompleteReviews.ts
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
  console.log('\n📊 리뷰가 부족한 제품 확인 중...\n');

  // 1. review_count > 50인 제품들 조회
  const { data: products, error } = await supabase
    .from('danawa_products')
    .select('pcode, title, review_count')
    .gt('review_count', 50)
    .order('review_count', { ascending: false });

  if (error) {
    console.error('❌ 제품 조회 실패:', error.message);
    return;
  }

  console.log(`📦 review_count > 50인 제품: ${products?.length}개\n`);

  // 2. 각 제품별 실제 저장된 리뷰 수 확인
  const incompleteProducts: Array<{
    pcode: string;
    title: string;
    expected: number;
    actual: number;
    missing: number;
  }> = [];

  for (const product of products || []) {
    const { count } = await supabase
      .from('danawa_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('pcode', product.pcode);

    const actual = count || 0;
    const expected = product.review_count || 0;

    // 실제 저장된 리뷰가 예상의 80% 미만이거나 50개 이하인 경우
    if (actual < expected * 0.8 || (expected > 50 && actual <= 50)) {
      incompleteProducts.push({
        pcode: product.pcode,
        title: product.title?.substring(0, 40) || '',
        expected,
        actual,
        missing: expected - actual,
      });
    }
  }

  // 3. 결과 출력
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 리뷰가 부족한 제품 목록 (50개 이상 리뷰 제품 중)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 부족한 리뷰 수 기준 정렬
  incompleteProducts.sort((a, b) => b.missing - a.missing);

  let totalMissing = 0;
  for (const p of incompleteProducts) {
    const pct = ((p.actual / p.expected) * 100).toFixed(0);
    console.log(`${p.pcode}: ${p.actual}/${p.expected}개 (${pct}%) - 부족: ${p.missing}개`);
    console.log(`  └ ${p.title}`);
    totalMissing += p.missing;
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 요약`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  - 리뷰 부족 제품 수: ${incompleteProducts.length}개`);
  console.log(`  - 총 부족 리뷰 수: ${totalMissing.toLocaleString()}개`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // JSON으로 저장 (추가 크롤링용)
  const outputPath = '/tmp/incomplete_reviews.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(incompleteProducts, null, 2));
  console.log(`💾 부족 제품 목록 저장: ${outputPath}\n`);
}

check().catch(console.error);
