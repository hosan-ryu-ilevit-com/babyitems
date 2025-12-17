/**
 * Supabase enuri_products를 로컬 spec 파일로 내보내기
 * - average_rating, review_count, 가격 정보 포함
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EnuriProduct {
  model_no: string;
  title: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  rank: number | null;
  average_rating: number | null;
  review_count: number | null;
  spec: Record<string, unknown>;
  category_code: string;
  category_path: string | null;
}

interface EnuriPrice {
  model_no: string;
  lowest_price: number | null;
  lowest_mall: string | null;
  lowest_link: string | null;
  mall_prices: unknown[];
}

async function exportCategory(categoryCode: string, categoryKey: string) {
  console.log(`\n[${categoryKey}] 내보내기 시작...`);

  // 1. 제품 조회
  const { data: products, error } = await supabase
    .from('enuri_products')
    .select('model_no, title, brand, price, thumbnail, rank, average_rating, review_count, spec, category_code, category_path')
    .eq('category_code', categoryCode)
    .order('rank', { ascending: true });

  if (error) {
    console.error(`  Error: ${error.message}`);
    return;
  }

  if (!products || products.length === 0) {
    console.log(`  제품 없음`);
    return;
  }

  console.log(`  ${products.length}개 제품 발견`);

  // 2. 가격 정보 조회
  const modelNos = products.map(p => p.model_no);
  const { data: prices } = await supabase
    .from('enuri_prices')
    .select('model_no, lowest_price, lowest_mall, lowest_link, mall_prices')
    .in('model_no', modelNos);

  const priceMap = new Map<string, EnuriPrice>();
  prices?.forEach(p => priceMap.set(p.model_no, p));

  // 3. 로컬 spec 형식으로 변환
  const localFormat = products.map((p, idx) => {
    const priceInfo = priceMap.get(p.model_no);
    return {
      productId: p.model_no,
      브랜드: p.brand || '',
      모델명: p.title,
      최저가: priceInfo?.lowest_price || p.price,
      최저가몰: priceInfo?.lowest_mall || null,
      최저가링크: priceInfo?.lowest_link || null,
      썸네일: p.thumbnail,
      순위: p.rank || idx + 1,
      총점: p.average_rating ? Math.round(p.average_rating * 20) : null, // 5점 만점 → 100점 만점
      평균별점: p.average_rating,
      리뷰수: p.review_count || 0,
      하위카테고리: categoryKey,
      specs: p.spec || {},
      filter_attrs: {},
      dataSource: 'enuri',
    };
  });

  // 4. 파일 저장
  const specPath = path.join(process.cwd(), 'data', 'specs', `${categoryKey}.json`);
  fs.writeFileSync(specPath, JSON.stringify(localFormat, null, 2));
  console.log(`  ✅ ${specPath} 저장 완료 (${localFormat.length}개)`);

  return localFormat.length;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     에누리 데이터 로컬 spec 파일 내보내기                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 카테고리 매핑 (category_code → categoryKey)
  const categories = [
    { code: 'formula_maker', key: 'formula_maker' },
    // 기저귀/유모차/카시트는 category_path 기반으로 별도 처리 필요
  ];

  for (const cat of categories) {
    await exportCategory(cat.code, cat.key);
  }

  // 기저귀/유모차/카시트는 category_path 기반
  await exportByCategoryPath('%기저귀%', 'diaper');
  await exportByCategoryPath('%유모차%', 'stroller');
  await exportByCategoryPath('%카시트%', 'car_seat');

  console.log('\n완료!');
}

async function exportByCategoryPath(pathPattern: string, categoryKey: string) {
  console.log(`\n[${categoryKey}] 내보내기 시작... (category_path: ${pathPattern})`);

  const { data: products, error } = await supabase
    .from('enuri_products')
    .select('model_no, title, brand, price, thumbnail, rank, average_rating, review_count, spec, category_code, category_path')
    .ilike('category_path', pathPattern)
    .order('rank', { ascending: true });

  if (error) {
    console.error(`  Error: ${error.message}`);
    return;
  }

  if (!products || products.length === 0) {
    console.log(`  제품 없음`);
    return;
  }

  console.log(`  ${products.length}개 제품 발견`);

  // 가격 정보 조회
  const modelNos = products.map(p => p.model_no);
  const { data: prices } = await supabase
    .from('enuri_prices')
    .select('model_no, lowest_price, lowest_mall, lowest_link, mall_prices')
    .in('model_no', modelNos);

  const priceMap = new Map<string, EnuriPrice>();
  prices?.forEach(p => priceMap.set(p.model_no, p));
  console.log(`  가격 정보: ${prices?.length || 0}개`);

  // 로컬 spec 형식으로 변환
  const localFormat = products.map((p, idx) => {
    const priceInfo = priceMap.get(p.model_no);
    return {
      productId: p.model_no,
      브랜드: p.brand || '',
      모델명: p.title,
      최저가: priceInfo?.lowest_price || p.price,
      최저가몰: priceInfo?.lowest_mall || null,
      최저가링크: priceInfo?.lowest_link || null,
      썸네일: p.thumbnail,
      순위: p.rank || idx + 1,
      총점: p.average_rating ? Math.round(p.average_rating * 20) : null,
      평균별점: p.average_rating,
      리뷰수: p.review_count || 0,
      하위카테고리: p.category_path || categoryKey,
      specs: p.spec || {},
      filter_attrs: {},
      dataSource: 'enuri',
    };
  });

  // 파일 저장
  const specPath = path.join(process.cwd(), 'data', 'specs', `${categoryKey}.json`);
  fs.writeFileSync(specPath, JSON.stringify(localFormat, null, 2));
  console.log(`  ✅ ${specPath} 저장 완료 (${localFormat.length}개)`);
}

main().catch(console.error);
