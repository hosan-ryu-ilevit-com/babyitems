#!/usr/bin/env npx tsx
/**
 * 리뷰 크롤링 테스트 스크립트
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { fetchDanawaReviews } from '../lib/danawa/review-crawler';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  // 리뷰 많은 제품 테스트 (팸퍼스)
  const pcode = '68369570';
  console.log('🧪 테스트: pcode', pcode);

  const result = await fetchDanawaReviews(pcode, 5);
  console.log('\n📊 크롤링 결과:');
  console.log('  - 메타 리뷰 수:', result.reviewCount);
  console.log('  - 크롤링 수:', result.reviews.length);

  // reviewId 확인
  console.log('\n📝 reviewId 샘플 (처음 5개):');
  result.reviews.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.reviewId} - ${r.content.substring(0, 30)}...`);
  });

  // 중복 reviewId 확인
  const ids = result.reviews.map(r => r.reviewId);
  const uniqueIds = new Set(ids);
  console.log('\n🔍 중복 체크:');
  console.log('  - 전체 리뷰:', ids.length);
  console.log('  - 고유 ID:', uniqueIds.size);

  if (ids.length === uniqueIds.size) {
    console.log('  ✅ 중복 없음!');
  } else {
    console.log('  ❌ 중복 발견:', ids.length - uniqueIds.size, '개');
  }

  // DB에 저장 테스트
  console.log('\n💾 DB 저장 테스트...');
  let inserted = 0, skipped = 0;

  for (const review of result.reviews) {
    const dateMatch = review.date?.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    const reviewDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

    const { error } = await supabase
      .from('danawa_reviews')
      .insert({
        pcode,
        source: 'danawa',
        rating: review.rating,
        content: review.content,
        author: review.author || null,
        review_date: reviewDate,
        helpful_count: review.helpful || 0,
        images: review.images || [],
        mall_name: review.mallName || null,
        external_review_id: review.reviewId || null,
        crawled_at: new Date().toISOString()
      });

    if (error) {
      if (error.code === '23505') skipped++;
      else console.error('  에러:', error.message);
    } else {
      inserted++;
    }
  }

  console.log('  - 저장:', inserted);
  console.log('  - 스킵(중복):', skipped);

  console.log('\n✅ 테스트 완료!');
}

test().catch(console.error);
