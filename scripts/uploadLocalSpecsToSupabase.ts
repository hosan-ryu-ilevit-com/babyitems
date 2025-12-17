/**
 * 로컬 spec/review 파일을 Supabase에 업로드
 * - data/specs/{category}.json -> enuri_products, enuri_categories
 * - data/reviews/{category}.jsonl -> enuri_reviews
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as readline from 'readline';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface LocalProduct {
  카테고리: string;
  카테고리키: string;
  브랜드: string;
  제품명: string;
  모델명: string;
  최저가: number;
  가격범위: string;
  썸네일: string;
  픽타입: string;
  총점: number;
  순위: number;
  총제품수: number;
  요약: string | null;
  검색어: string;
  productId: number;
  하위카테고리: string;
  특징: string[];
  specs: Record<string, string>;
  attributeScores: Record<string, number>;
  dataSource: string;
}

interface ReviewLine {
  text: string;
  custom_metadata: {
    productId: string;
    category: string;
    rating: number;
  };
}

async function readJsonlFile(filePath: string): Promise<ReviewLine[]> {
  const reviews: ReviewLine[] = [];

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ 리뷰 파일 없음: ${filePath}`);
    return reviews;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        reviews.push(JSON.parse(line));
      } catch (e) {
        // skip invalid lines
      }
    }
  }

  return reviews;
}

async function uploadCategory(categoryKey: string, categoryName: string) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📦 ${categoryName} (${categoryKey}) 업로드 시작`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const specPath = `data/specs/${categoryKey}.json`;
  const reviewPath = `data/reviews/${categoryKey}.jsonl`;
  const now = new Date().toISOString();

  // 1. spec 파일 로드
  if (!fs.existsSync(specPath)) {
    console.log(`  ❌ spec 파일 없음: ${specPath}`);
    return { products: 0, reviews: 0 };
  }

  const products: LocalProduct[] = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  console.log(`  📄 ${products.length}개 제품 로드됨`);

  // 2. review 파일 로드
  const reviews = await readJsonlFile(reviewPath);
  console.log(`  📝 ${reviews.length}개 리뷰 로드됨`);

  // 3. 카테고리 upsert
  const { error: catError } = await supabase
    .from('enuri_categories')
    .upsert({
      category_code: categoryKey,
      category_name: categoryName,
      category_path: `출산/유아동 > ${categoryName}`,
      group_id: null,
      total_product_count: products.length,
      crawled_product_count: products.length,
      crawled_at: now,
    }, { onConflict: 'category_code' });

  if (catError) {
    console.error(`  ❌ 카테고리 저장 실패:`, catError.message);
  } else {
    console.log(`  ✓ 카테고리 저장 완료`);
  }

  // 4. 제품 저장
  const productRows = products.map((p, idx) => ({
    model_no: String(p.productId),
    title: p.모델명,
    brand: p.브랜드 || null,
    price: p.최저가 || null,
    high_price: null,
    category_code: categoryKey,
    rank: p.순위 || idx + 1,
    detail_url: `https://www.enuri.com/detail.jsp?modelno=${p.productId}`,
    thumbnail: p.썸네일 || null,
    image_url: p.썸네일 || null,
    reg_date: null,
    spec_raw: JSON.stringify(p.specs),
    spec: {
      ...p.specs,
      특징: p.특징,
      하위카테고리: p.하위카테고리,
      attributeScores: p.attributeScores,
    },
    filter_attrs: {},
    average_rating: null,
    review_count: reviews.filter(r => r.custom_metadata.productId === String(p.productId)).length,
    danawa_pcode: null,
    crawled_at: now,
  }));

  // 배치로 저장 (50개씩)
  let prodSaved = 0;
  for (let i = 0; i < productRows.length; i += 50) {
    const batch = productRows.slice(i, i + 50);
    const { error: prodError } = await supabase
      .from('enuri_products')
      .upsert(batch, { onConflict: 'model_no' });

    if (prodError) {
      console.error(`  ⚠️ 제품 배치 ${Math.floor(i / 50) + 1} 저장 실패:`, prodError.message);
    } else {
      prodSaved += batch.length;
    }
  }
  console.log(`  ✓ ${prodSaved}개 제품 저장 완료`);

  // 5. 리뷰 저장
  if (reviews.length > 0) {
    const reviewRows = reviews.map((r, idx) => ({
      model_no: r.custom_metadata.productId,
      review_id: `${r.custom_metadata.productId}_${idx}`,
      source: 'enuri',
      rating: r.custom_metadata.rating || 5,
      content: r.text,
      author: null,
      review_date: null,
      images: [],
      helpful_count: 0,
      crawled_at: now,
    }));

    let revSaved = 0;
    for (let i = 0; i < reviewRows.length; i += 50) {
      const batch = reviewRows.slice(i, i + 50);
      const { error: revError } = await supabase
        .from('enuri_reviews')
        .upsert(batch, { onConflict: 'model_no,review_id' });

      if (revError) {
        console.error(`  ⚠️ 리뷰 배치 ${Math.floor(i / 50) + 1} 저장 실패:`, revError.message);
      } else {
        revSaved += batch.length;
      }
    }
    console.log(`  ✓ ${revSaved}개 리뷰 저장 완료`);
  }

  return { products: prodSaved, reviews: reviews.length };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     로컬 Spec/Review 파일 Supabase 업로드                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const categories = [
    { key: 'car_seat', name: '카시트' },
    { key: 'stroller', name: '유모차' },
    { key: 'diaper', name: '기저귀' },
  ];

  const results: Record<string, { products: number; reviews: number }> = {};

  for (const cat of categories) {
    results[cat.key] = await uploadCategory(cat.key, cat.name);
  }

  // 결과 요약
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      업로드 결과 요약                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('카테고리\t\t제품\t\t리뷰');
  console.log('─'.repeat(50));
  for (const cat of categories) {
    const r = results[cat.key];
    console.log(`${cat.name}\t\t${r.products}개\t\t${r.reviews}개`);
  }

  // DB 확인
  console.log('\n📊 Supabase 최종 현황:');
  for (const cat of categories) {
    const { count: prodCount } = await supabase
      .from('enuri_products')
      .select('*', { count: 'exact', head: true })
      .eq('category_code', cat.key);

    const { data: modelNos } = await supabase
      .from('enuri_products')
      .select('model_no')
      .eq('category_code', cat.key);

    let revCount = 0;
    if (modelNos && modelNos.length > 0) {
      const { count } = await supabase
        .from('enuri_reviews')
        .select('*', { count: 'exact', head: true })
        .in('model_no', modelNos.map(m => m.model_no));
      revCount = count || 0;
    }

    console.log(`  ${cat.key}: 제품 ${prodCount}개, 리뷰 ${revCount}개`);
  }

  console.log('\n✅ 업로드 완료!');
}

main().catch(console.error);
