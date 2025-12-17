#!/usr/bin/env npx tsx
/**
 * 리뷰 크롤링 진행 상황 확인
 * 실행: npx tsx scripts/checkCrawlProgress.ts
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
  // 1. 50개 이상 리뷰 제품 목록
  const { data: over50Products } = await supabase
    .from('danawa_products')
    .select('pcode')
    .gt('review_count', 50);

  const over50Pcodes = over50Products?.map(p => p.pcode) || [];

  // 2. 200개+ 완료된 제품 수 (병렬 쿼리로 빠르게)
  const batchSize = 50;
  let completed = 0;

  for (let i = 0; i < over50Pcodes.length; i += batchSize) {
    const batch = over50Pcodes.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(pcode =>
        supabase
          .from('danawa_reviews')
          .select('*', { count: 'exact', head: true })
          .eq('pcode', pcode)
      )
    );
    completed += results.filter(r => (r.count || 0) >= 200).length;
  }

  // 3. 총 리뷰 수
  const { count: totalReviews } = await supabase
    .from('danawa_reviews')
    .select('*', { count: 'exact', head: true });

  // 4. 마지막 크롤링 시간
  const { data: recent } = await supabase
    .from('danawa_reviews')
    .select('crawled_at')
    .order('crawled_at', { ascending: false })
    .limit(1);

  const lastCrawl = recent?.[0]?.crawled_at ? new Date(recent[0].crawled_at) : null;
  const diffSec = lastCrawl ? Math.floor((Date.now() - lastCrawl.getTime()) / 1000) : -1;

  // 출력
  console.log(`\n📊 50개+ 리뷰 제품: ${over50Pcodes.length}개`);
  console.log(`✅ 200개+ 완료: ${completed}개`);
  console.log(`📝 총 리뷰: ${totalReviews?.toLocaleString()}개`);
  console.log(diffSec >= 0 && diffSec < 60 ? `🔄 진행 중 (${diffSec}초 전)` : `⚠️ 멈춤 (${diffSec}초 전)`);
  console.log('');
}

check().catch(console.error);
