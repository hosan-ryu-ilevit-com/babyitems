/**
 * 분유제조기 검색 크롤링 데이터 Supabase 업로드
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     분유제조기 데이터 Supabase 업로드                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 1. JSON 파일 로드
  const jsonPath = '/tmp/enuri_search_분유제조기.json';
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ JSON 파일을 찾을 수 없습니다:', jsonPath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);

  console.log(`📊 데이터 요약:`);
  console.log(`   검색어: ${data.keyword}`);
  console.log(`   제품 수: ${data.products.length}개`);
  console.log(`   총 리뷰: ${data.summary.totalReviews}개`);
  console.log(`   총 가격 정보: ${data.summary.totalPrices}개\n`);

  const categoryCode = 'formula_maker';
  const categoryName = '분유제조기';
  const now = new Date().toISOString();

  // 2. 카테고리 upsert
  console.log('📁 카테고리 저장 중...');
  const { error: catError } = await supabase
    .from('enuri_categories')
    .upsert({
      category_code: categoryCode,
      category_name: categoryName,
      category_path: '출산/유아동 > 분유제조기',
      group_id: null,
      total_product_count: data.products.length,
      crawled_product_count: data.products.length,
      crawled_at: now,
    }, { onConflict: 'category_code' });

  if (catError) {
    console.error('❌ 카테고리 저장 실패:', catError.message);
  } else {
    console.log('   ✓ 카테고리 저장 완료');
  }

  // 3. 제품 저장
  console.log('📦 제품 저장 중...');
  const productRows = data.products.map((p: any, idx: number) => ({
    model_no: String(p.modelNo),
    title: p.title,
    brand: p.brand || null,
    price: p.lowPrice || null,
    high_price: p.highPrice || null,
    category_code: categoryCode,
    rank: idx + 1,
    detail_url: p.detailUrl,
    thumbnail: p.imageUrl || null,
    image_url: p.imageUrl || null,
    reg_date: null,
    spec_raw: p.description || null,
    spec: p.specs || {},
    filter_attrs: {},
    average_rating: p.ratingValue || null,
    review_count: p.reviewCount || 0,
    danawa_pcode: null,
    crawled_at: now,
  }));

  const { error: prodError } = await supabase
    .from('enuri_products')
    .upsert(productRows, { onConflict: 'model_no' });

  if (prodError) {
    console.error('❌ 제품 저장 실패:', prodError.message);
  } else {
    console.log(`   ✓ ${productRows.length}개 제품 저장 완료`);
  }

  // 4. 리뷰 저장
  console.log('📝 리뷰 저장 중...');
  const reviewRows: any[] = [];
  for (const product of data.products) {
    for (const review of (product.reviews || [])) {
      reviewRows.push({
        model_no: String(product.modelNo),
        review_id: review.reviewId,
        source: review.mallName || null,
        rating: review.rating || 5,
        content: review.content || '',
        author: review.author || null,
        review_date: review.date || null,
        images: review.images || [],
        helpful_count: 0,
        crawled_at: now,
      });
    }
  }

  if (reviewRows.length > 0) {
    // 배치로 저장 (50개씩)
    for (let i = 0; i < reviewRows.length; i += 50) {
      const batch = reviewRows.slice(i, i + 50);
      const { error: revError } = await supabase
        .from('enuri_reviews')
        .upsert(batch, { onConflict: 'model_no,review_id' });

      if (revError) {
        console.error(`   ⚠️ 리뷰 배치 ${Math.floor(i / 50) + 1} 저장 실패:`, revError.message);
      }
    }
    console.log(`   ✓ ${reviewRows.length}개 리뷰 저장 완료`);
  }

  // 5. 가격 저장
  console.log('💰 가격 저장 중...');
  const priceRows = data.products
    .filter((p: any) => p.mallPrices && p.mallPrices.length > 0)
    .map((p: any) => {
      const sorted = [...p.mallPrices].sort((a: any, b: any) => a.totalPrice - b.totalPrice);
      const lowest = sorted[0];

      return {
        model_no: String(p.modelNo),
        lowest_price: lowest?.price || null,
        lowest_mall: lowest?.mallName || null,
        lowest_delivery: lowest?.deliveryFee === 0 ? '무료' : `${lowest?.deliveryFee?.toLocaleString()}원`,
        lowest_link: lowest?.productUrl || null,
        mall_prices: p.mallPrices,
        mall_count: p.mallPrices.length,
        price_min: sorted[0]?.price || null,
        price_max: sorted[sorted.length - 1]?.price || null,
        price_updated_at: now,
      };
    });

  if (priceRows.length > 0) {
    const { error: priceError } = await supabase
      .from('enuri_prices')
      .upsert(priceRows, { onConflict: 'model_no' });

    if (priceError) {
      console.error('❌ 가격 저장 실패:', priceError.message);
    } else {
      console.log(`   ✓ ${priceRows.length}개 가격 정보 저장 완료`);
    }
  }

  // 6. 결과 확인
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 저장 결과 확인');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const { count: prodCount } = await supabase
    .from('enuri_products')
    .select('*', { count: 'exact', head: true })
    .eq('category_code', categoryCode);

  const { count: revCount } = await supabase
    .from('enuri_reviews')
    .select('*', { count: 'exact', head: true })
    .in('model_no', productRows.map((p: any) => p.model_no));

  const { count: priceCount } = await supabase
    .from('enuri_prices')
    .select('*', { count: 'exact', head: true })
    .in('model_no', productRows.map((p: any) => p.model_no));

  console.log(`   enuri_products: ${prodCount}개`);
  console.log(`   enuri_reviews: ${revCount}개`);
  console.log(`   enuri_prices: ${priceCount}개`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      ✅ 업로드 완료                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
