/**
 * Enuri DB 상태 확인 스크립트
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
  console.log('=== Supabase Enuri DB 현황 ===\n');

  // Products
  const { count: productCount } = await supabase
    .from('enuri_products')
    .select('*', { count: 'exact', head: true });
  console.log(`enuri_products: ${productCount}개`);

  // Reviews
  const { count: reviewCount } = await supabase
    .from('enuri_reviews')
    .select('*', { count: 'exact', head: true });
  console.log(`enuri_reviews: ${reviewCount}개`);

  // Reviews with images
  const { data: allReviews } = await supabase
    .from('enuri_reviews')
    .select('id, images');

  const reviewsWithImages = allReviews?.filter(r =>
    r.images && Array.isArray(r.images) && r.images.length > 0
  );
  console.log(`이미지 있는 리뷰: ${reviewsWithImages?.length || 0}개`);

  // Prices
  const { count: priceCount } = await supabase
    .from('enuri_prices')
    .select('*', { count: 'exact', head: true });
  console.log(`enuri_prices: ${priceCount}개`);

  // Categories
  const { count: categoryCount } = await supabase
    .from('enuri_categories')
    .select('*', { count: 'exact', head: true });
  console.log(`enuri_categories: ${categoryCount}개`);

  // Sample products
  console.log('\n=== 제품 샘플 (상위 5개) ===');
  const { data: sampleProducts } = await supabase
    .from('enuri_products')
    .select('model_no, title, review_count, price')
    .order('review_count', { ascending: false })
    .limit(5);

  sampleProducts?.forEach((p, i) => {
    console.log(`[${i+1}] ${p.title?.slice(0, 40)}...`);
    console.log(`    model_no: ${p.model_no}, reviews: ${p.review_count}, price: ${p.price?.toLocaleString()}원`);
  });

  // Sample reviews
  console.log('\n=== 리뷰 샘플 (상위 3개) ===');
  const { data: sampleReviews } = await supabase
    .from('enuri_reviews')
    .select('model_no, rating, content, images')
    .limit(3);

  sampleReviews?.forEach((r, i) => {
    console.log(`[${i+1}] model_no: ${r.model_no}, rating: ${r.rating}`);
    console.log(`    content: ${r.content?.slice(0, 50)}...`);
    console.log(`    images: ${JSON.stringify(r.images)}`);
  });

  // Sample prices
  console.log('\n=== 가격 샘플 (상위 3개) ===');
  const { data: samplePrices } = await supabase
    .from('enuri_prices')
    .select('model_no, lowest_price, lowest_mall, mall_count')
    .limit(3);

  if (samplePrices && samplePrices.length > 0) {
    samplePrices.forEach((p, i) => {
      console.log(`[${i+1}] model_no: ${p.model_no}`);
      console.log(`    최저가: ${p.lowest_price?.toLocaleString()}원 (${p.lowest_mall})`);
      console.log(`    판매처: ${p.mall_count}곳`);
    });
  } else {
    console.log('(가격 데이터 없음)');
  }
}

checkDB().catch(console.error);
