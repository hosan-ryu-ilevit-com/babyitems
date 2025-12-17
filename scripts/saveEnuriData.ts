/**
 * 에누리 데이터 Supabase 저장 스크립트
 * 크롤링된 데이터를 DB에 저장
 */

import { createClient } from '@supabase/supabase-js';
import {
  EnuriCrawlResult,
  EnuriProductRow,
  EnuriReviewRow,
  EnuriPriceRow,
  EnuriCategoryRow,
} from '../types/enuri';

// =====================================================
// Supabase 클라이언트
// =====================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// 저장 함수들
// =====================================================

export async function saveEnuriCategory(category: EnuriCategoryRow): Promise<void> {
  const { error } = await supabase
    .from('enuri_categories')
    .upsert(category, { onConflict: 'category_code' });

  if (error) {
    throw new Error(`Failed to save category: ${error.message}`);
  }
}

export async function saveEnuriProducts(products: EnuriProductRow[]): Promise<void> {
  // 배치로 저장 (100개씩)
  const batchSize = 100;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const { error } = await supabase
      .from('enuri_products')
      .upsert(batch, { onConflict: 'model_no' });

    if (error) {
      throw new Error(`Failed to save products batch ${i / batchSize + 1}: ${error.message}`);
    }
  }
}

export async function saveEnuriReviews(reviews: EnuriReviewRow[]): Promise<void> {
  if (reviews.length === 0) return;

  // 배치로 저장 (100개씩)
  const batchSize = 100;

  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize);
    const { error } = await supabase
      .from('enuri_reviews')
      .upsert(batch, { onConflict: 'model_no,review_id' });

    if (error) {
      console.error(`Failed to save reviews batch ${i / batchSize + 1}: ${error.message}`);
      // 리뷰 저장 실패는 무시하고 계속 진행
    }
  }
}

export async function saveEnuriPrices(prices: EnuriPriceRow[]): Promise<void> {
  if (prices.length === 0) return;

  // 배치로 저장 (100개씩)
  const batchSize = 100;

  for (let i = 0; i < prices.length; i += batchSize) {
    const batch = prices.slice(i, i + batchSize);
    const { error } = await supabase
      .from('enuri_prices')
      .upsert(batch, { onConflict: 'model_no' });

    if (error) {
      throw new Error(`Failed to save prices batch ${i / batchSize + 1}: ${error.message}`);
    }
  }
}

// =====================================================
// 메인 저장 함수
// =====================================================

export async function saveEnuriCrawlResult(result: EnuriCrawlResult): Promise<{
  success: boolean;
  savedProducts: number;
  savedReviews: number;
  savedPrices: number;
  error?: string;
}> {
  const stats = {
    success: false,
    savedProducts: 0,
    savedReviews: 0,
    savedPrices: 0,
  };

  try {
    const now = new Date().toISOString();

    // 1. 카테고리 저장
    console.log('📁 카테고리 저장 중...');
    const categoryRow: EnuriCategoryRow = {
      category_code: result.category.categoryCode,
      category_name: result.category.categoryName,
      category_path: result.category.categoryPath || null,
      group_id: result.category.groupId || null,
      total_product_count: result.category.totalProductCount,
      crawled_product_count: result.category.crawledProductCount,
      crawled_at: now,
    };
    await saveEnuriCategory(categoryRow);
    console.log('   ✓ 카테고리 저장 완료');

    // 2. 제품 저장
    console.log('📦 제품 저장 중...');
    const productRows: EnuriProductRow[] = result.products.map(p => ({
      model_no: p.modelNo,
      title: p.title,
      brand: p.brand,
      price: p.price,
      high_price: p.highPrice,
      category_code: p.categoryCode,
      category_path: (p as any).categoryPath || null,
      features: (p as any).features || null,
      rank: p.rank,
      detail_url: p.detailUrl,
      thumbnail: p.thumbnail,
      image_url: p.imageUrl,
      reg_date: p.regDate,
      spec_raw: p.specRaw,
      spec: p.spec,
      filter_attrs: p.filterAttrs,
      average_rating: p.averageRating,
      review_count: p.reviewCount,
      danawa_pcode: p.danawaPcode || null,
      crawled_at: now,
    }));
    await saveEnuriProducts(productRows);
    stats.savedProducts = productRows.length;
    console.log(`   ✓ ${stats.savedProducts}개 제품 저장 완료`);

    // 3. 리뷰 저장
    console.log('📝 리뷰 저장 중...');
    const reviewRows: EnuriReviewRow[] = [];
    for (const product of result.products) {
      for (const review of product.reviews) {
        reviewRows.push({
          model_no: product.modelNo,
          review_id: review.reviewId,
          source: review.mallName || null,
          rating: review.rating,
          content: review.content,
          author: review.author || null,
          review_date: review.date || null,
          images: review.images,
          helpful_count: 0,
          crawled_at: now,
        });
      }
    }
    await saveEnuriReviews(reviewRows);
    stats.savedReviews = reviewRows.length;
    console.log(`   ✓ ${stats.savedReviews}개 리뷰 저장 완료`);

    // 4. 가격 저장
    console.log('💰 가격 저장 중...');
    const priceRows: EnuriPriceRow[] = result.products
      .filter(p => p.mallPrices.length > 0)
      .map(p => {
        const sorted = [...p.mallPrices].sort((a, b) => a.totalPrice - b.totalPrice);
        const lowest = sorted[0];

        return {
          model_no: p.modelNo,
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
    await saveEnuriPrices(priceRows);
    stats.savedPrices = priceRows.length;
    console.log(`   ✓ ${stats.savedPrices}개 가격 정보 저장 완료`);

    stats.success = true;
    return stats;

  } catch (error) {
    return {
      ...stats,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// JSON 파일에서 로드 후 저장
// =====================================================

import * as fs from 'fs';
import * as path from 'path';

export async function saveFromJsonFile(jsonPath: string): Promise<void> {
  console.log(`📂 JSON 파일 로드: ${jsonPath}`);

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);

  // 카테고리 코드 추출 (categories 배열에서 또는 기본값)
  const categoryCode = data.categoryCode ||
                       data.category?.categoryCode ||
                       data.categories?.[0]?.code?.slice(0, 6) ||
                       '100402';

  const categoryName = data.categoryName ||
                       data.category?.categoryName ||
                       data.categories?.[0]?.name ||
                       '카시트';

  // EnuriCrawlResult 형식으로 변환
  const result: EnuriCrawlResult = {
    category: {
      categoryCode,
      categoryName,
      categoryPath: data.categoryPath || data.category?.categoryPath,
      groupId: data.groupId || data.category?.groupId || 'car_seat',
      totalProductCount: data.products?.length || 0,
      crawledProductCount: data.products?.length || 0,
    },
    products: (data.products || [])
      .filter((p: any) => (p.reviewCount || 0) > 0)  // 리뷰 0개 상품 스킵
      .map((p: any, idx: number) => ({
        modelNo: String(p.modelNo || p.model_no),
        title: p.title || p.name || '',
        brand: p.brand || p.manufacturer || null,
        price: p.price || p.lowPrice || null,
        highPrice: p.highPrice || null,
        categoryCode,
        categoryPath: p.categoryPath || null,              // NEW: 카테고리 경로 (e.g., "카시트/일체형")
        features: p.features || null,                      // NEW: [특징] 배열
        rank: p.rank || idx + 1,
        detailUrl: p.detailUrl || p.url || `https://www.enuri.com/detail.jsp?modelno=${p.modelNo || p.model_no}`,
        thumbnail: p.thumbnail || p.imageUrl || p.image || null,
        imageUrl: p.imageUrl || p.thumbnail || p.image || null,
        regDate: p.regDate || null,
        specRaw: p.specs ? JSON.stringify(p.specs) : (p.specRaw || null),
        spec: p.spec || p.specs || {},
        filterAttrs: p.filterAttrs || {},
        averageRating: p.averageRating || p.ratingValue || null,
        reviewCount: p.reviewCount || 0,
        reviews: (p.reviews || []).map((r: any) => ({
          reviewId: r.reviewId || r.id || `${p.modelNo}_${Math.random().toString(36).slice(2, 10)}`,
          rating: r.rating || 5,
          content: r.content || r.text || '',
          author: r.author || null,
          date: r.date || null,
          images: r.images || [],
          mallName: r.mallName || r.source || null,
        })),
        mallPrices: p.mallPrices || p.prices || [],
      })),
    crawledAt: new Date(data.crawledAt || Date.now()),
    success: true,
  };

  console.log(`\n📊 데이터 요약:`);
  console.log(`   카테고리: ${result.category.categoryName} (${result.category.categoryCode})`);
  console.log(`   제품 수: ${result.products.length}개`);

  const totalReviews = result.products.reduce((sum, p) => sum + (p.reviews?.length || 0), 0);
  const productsWithPrices = result.products.filter(p => (p.mallPrices?.length || 0) > 0).length;
  console.log(`   리뷰: ${totalReviews}개`);
  console.log(`   가격 정보: ${productsWithPrices}개 제품\n`);

  // 저장
  const saveResult = await saveEnuriCrawlResult(result);

  if (saveResult.success) {
    console.log(`\n✅ 저장 완료!`);
    console.log(`   제품: ${saveResult.savedProducts}개`);
    console.log(`   리뷰: ${saveResult.savedReviews}개`);
    console.log(`   가격: ${saveResult.savedPrices}개`);
  } else {
    console.error(`\n❌ 저장 실패: ${saveResult.error}`);
  }
}

// =====================================================
// CLI 실행 (직접 실행 시에만)
// =====================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/saveEnuriData.ts <json-file>

Example:
  npx tsx scripts/saveEnuriData.ts /tmp/enuri_carseat_full.json
`);
    process.exit(1);
  }

  const jsonPath = args[0];

  if (!fs.existsSync(jsonPath)) {
    console.error(`파일을 찾을 수 없습니다: ${jsonPath}`);
    process.exit(1);
  }

  await saveFromJsonFile(jsonPath);
}

// 직접 실행 시에만 main() 호출 (import될 때는 실행 안 함)
const isDirectRun = process.argv[1]?.includes('saveEnuriData');
if (isDirectRun) {
  main().catch(console.error);
}
