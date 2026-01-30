#!/usr/bin/env npx tsx
/**
 * Product Info 수동 인덱싱용 데이터 추출 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/export-product-data.ts
 *   npx tsx scripts/indexing/manual/export-product-data.ts --only-missing  # product_info 없는 상품만
 *
 * 출력:
 *   scripts/indexing/manual/output/products-data.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { parseQuestionsMarkdown, parsedQuestionsToTodos } from '../../../lib/indexing/markdown-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface CategoryProductData {
  categoryName: string;
  questions: {
    id: string;
    question: string;
    options: { value: string; label: string }[];
  }[];
  products: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specSummary: string;
    hasProductInfo: boolean;
  }[];
  stats: {
    total: number;
    withProductInfo: number;
    withoutProductInfo: number;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const onlyMissing = args.includes('--only-missing');

  console.log('🚀 Product Info 인덱싱용 데이터 추출 시작...\n');

  // 1. 카테고리 목록 조회 (custom_questions가 있는 것만)
  const { data: categories, error: catError } = await supabase
    .from('knowledge_categories')
    .select('query, custom_questions')
    .eq('is_active', true)
    .not('custom_questions', 'is', null)
    .order('query');

  if (catError) throw new Error(`카테고리 조회 실패: ${catError.message}`);

  console.log(`📋 총 ${categories?.length || 0}개 카테고리 발견\n`);

  const allData: CategoryProductData[] = [];
  let totalProducts = 0;
  let totalMissing = 0;

  for (const cat of categories || []) {
    const categoryName = cat.query;

    // 2. 맞춤질문 파싱
    const { questions: parsed } = parseQuestionsMarkdown(cat.custom_questions);
    const questions = parsed.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options.map(o => ({ value: o.value, label: o.label })),
    }));

    // 3. 상품 데이터 조회
    const { data: products } = await supabase
      .from('knowledge_products_cache')
      .select('pcode, name, brand, price, spec_summary, product_info')
      .eq('query', categoryName)
      .order('rank', { ascending: true });

    const productList = (products || []).map(p => ({
      pcode: p.pcode,
      name: p.name,
      brand: p.brand,
      price: p.price,
      specSummary: p.spec_summary || '',
      hasProductInfo: !!p.product_info,
    }));

    const withInfo = productList.filter(p => p.hasProductInfo).length;
    const withoutInfo = productList.filter(p => !p.hasProductInfo).length;

    totalProducts += productList.length;
    totalMissing += withoutInfo;

    // onlyMissing이면 product_info 없는 상품만 필터
    const filteredProducts = onlyMissing
      ? productList.filter(p => !p.hasProductInfo)
      : productList;

    if (filteredProducts.length > 0 || !onlyMissing) {
      allData.push({
        categoryName,
        questions,
        products: filteredProducts,
        stats: {
          total: productList.length,
          withProductInfo: withInfo,
          withoutProductInfo: withoutInfo,
        },
      });
    }

    const status = withoutInfo > 0 ? '⏳' : '✅';
    console.log(`${status} ${categoryName}: ${productList.length}개 (인덱싱 필요: ${withoutInfo}개)`);
  }

  // 4. 파일 저장
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'products-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2), 'utf-8');

  // 5. 요약 출력
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 추출 완료!');
  console.log(`${'='.repeat(60)}`);
  console.log(`저장 위치: ${outputPath}\n`);
  console.log(`총 상품: ${totalProducts}개`);
  console.log(`인덱싱 완료: ${totalProducts - totalMissing}개`);
  console.log(`인덱싱 필요: ${totalMissing}개`);

  if (onlyMissing) {
    console.log(`\n📁 인덱싱 필요한 카테고리: ${allData.length}개`);
  }
}

main().catch(console.error);
