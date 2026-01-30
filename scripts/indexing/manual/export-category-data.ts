#!/usr/bin/env npx tsx
/**
 * AI Studio 수동 작업용 데이터 추출 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/export-category-data.ts
 *
 * 출력:
 *   scripts/indexing/manual/output/categories-data.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface CategoryData {
  categoryName: string;
  hasCustomQuestions: boolean;
  products: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specSummary: string;
    reviewCount: number;
    rating: number | null;
  }[];
  reviews: {
    rating: number;
    content: string;
  }[];
  priceStats: {
    min: number;
    max: number;
    avg: number;
  };
  topBrands: string[];
}

async function main() {
  console.log('🚀 카테고리 데이터 추출 시작...\n');

  // 1. 카테고리 목록 조회
  const { data: categories, error: catError } = await supabase
    .from('knowledge_categories')
    .select('query, custom_questions')
    .eq('is_active', true)
    .order('query');

  if (catError) throw new Error(`카테고리 조회 실패: ${catError.message}`);

  console.log(`📋 총 ${categories?.length || 0}개 카테고리 발견\n`);

  const allData: CategoryData[] = [];

  for (const cat of categories || []) {
    const categoryName = cat.query;
    console.log(`📁 ${categoryName} 처리 중...`);

    // 2. 상품 데이터 조회
    const { data: products } = await supabase
      .from('knowledge_products_cache')
      .select('pcode, name, brand, price, spec_summary, review_count, rating')
      .eq('query', categoryName)
      .order('rank', { ascending: true })
      .limit(50);

    const productList = products || [];

    // 3. 리뷰 데이터 조회
    const pcodes = productList.map(p => p.pcode);
    const { data: reviews } = await supabase
      .from('knowledge_reviews_cache')
      .select('rating, content')
      .in('pcode', pcodes)
      .limit(500);

    const reviewList = reviews || [];

    // 4. 가격 통계
    const prices = productList.map(p => p.price).filter((p): p is number => p !== null && p > 0);
    const priceStats = {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    };

    // 5. 주요 브랜드
    const brandCounts = new Map<string, number>();
    productList.forEach(p => {
      if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);
    });
    const topBrands = [...brandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    allData.push({
      categoryName,
      hasCustomQuestions: !!cat.custom_questions,
      products: productList.map(p => ({
        pcode: p.pcode,
        name: p.name,
        brand: p.brand,
        price: p.price,
        specSummary: p.spec_summary,
        reviewCount: p.review_count,
        rating: p.rating,
      })),
      reviews: reviewList.map(r => ({
        rating: r.rating,
        content: r.content,
      })),
      priceStats,
      topBrands,
    });

    console.log(`   ✅ 상품 ${productList.length}개, 리뷰 ${reviewList.length}개`);
  }

  // 6. 파일 저장
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'categories-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2), 'utf-8');

  // 7. 요약 출력
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 추출 완료!\n');
  console.log(`저장 위치: ${outputPath}\n`);

  const needsProcessing = allData.filter(c => !c.hasCustomQuestions);
  const alreadyDone = allData.filter(c => c.hasCustomQuestions);

  console.log(`✅ 이미 맞춤질문 있음: ${alreadyDone.length}개`);
  alreadyDone.forEach(c => console.log(`   - ${c.categoryName}`));

  console.log(`\n⏳ 맞춤질문 생성 필요: ${needsProcessing.length}개`);
  needsProcessing.forEach(c => console.log(`   - ${c.categoryName} (상품 ${c.products.length}개)`));

  console.log(`\n${'='.repeat(60)}`);
}

main().catch(console.error);
