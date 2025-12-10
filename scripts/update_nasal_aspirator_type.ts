/**
 * 코흡입기 제품의 spec.타입 필드 업데이트
 * - 수동식 제품: 제목에 "뺑코", "뻥코", "실리콘", "수동", "팜컵" 포함
 * - 전동식 제품: 제목에 "전동", "HNA", "노시부" 포함 또는 나머지
 *
 * 실행: npx tsx scripts/update_nasal_aspirator_type.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// 수동식 키워드 (제목에 포함되면 수동식)
const MANUAL_KEYWORDS = ['뺑코', '뻥코', '실리콘 콧물', '수동', '팜컵'];

// 전동식 키워드 (제목에 포함되면 전동식)
const ELECTRIC_KEYWORDS = ['전동', 'HNA-', '노시부', '휴비딕', '코크린', '노스클린'];

// 제외할 제품 (소모품, 필터, 책 등)
const EXCLUDE_KEYWORDS = ['필터', '소모품', '연결구', '리필', '책', '도서', '봉투', '잠금', '밴드', '약병', '봉투', '디스펜서', '면봉', '손톱'];

function isManualProduct(title: string): boolean {
  return MANUAL_KEYWORDS.some(kw => title.includes(kw));
}

function isElectricProduct(title: string): boolean {
  return ELECTRIC_KEYWORDS.some(kw => title.includes(kw));
}

function isExcluded(title: string): boolean {
  return EXCLUDE_KEYWORDS.some(kw => title.includes(kw));
}

async function main() {
  console.log('🔍 코흡입기 제품 타입 필드 업데이트 중...\n');

  // 1. 코흡입기 카테고리 제품 전체 조회
  const { data: products, error } = await supabase
    .from('danawa_products')
    .select('pcode, title, spec')
    .eq('category_code', '16349248')
    .order('rank', { ascending: true });

  if (error) {
    console.error('❌ 조회 실패:', error.message);
    return;
  }

  const productList = products || [];
  console.log(`📦 총 ${productList.length}개 제품 조회됨\n`);

  // 2. 제품 분류
  const manualProducts: typeof productList = [];
  const electricProducts: typeof productList = [];
  const excludedProducts: typeof productList = [];
  const unknownProducts: typeof productList = [];

  for (const product of productList) {
    if (isExcluded(product.title)) {
      excludedProducts.push(product);
    } else if (isManualProduct(product.title)) {
      manualProducts.push(product);
    } else if (isElectricProduct(product.title)) {
      electricProducts.push(product);
    } else {
      unknownProducts.push(product);
    }
  }

  console.log('=== 분류 결과 ===');
  console.log(`수동식: ${manualProducts.length}개`);
  console.log(`전동식: ${electricProducts.length}개`);
  console.log(`제외됨: ${excludedProducts.length}개`);
  console.log(`미분류: ${unknownProducts.length}개\n`);

  // 3. 수동식 제품 업데이트
  console.log('=== 수동식 제품 업데이트 ===\n');
  for (const product of manualProducts) {
    const currentSpec = (product.spec as Record<string, unknown>) || {};
    const newSpec = { ...currentSpec, '타입': '수동' };

    const { error: updateError } = await supabase
      .from('danawa_products')
      .update({ spec: newSpec })
      .eq('pcode', product.pcode);

    if (updateError) {
      console.log(`❌ [${product.pcode}] 실패: ${updateError.message}`);
    } else {
      console.log(`✅ [수동] ${product.title.substring(0, 50)}`);
    }
  }

  // 4. 전동식 제품 업데이트
  console.log('\n=== 전동식 제품 업데이트 ===\n');
  for (const product of electricProducts) {
    const currentSpec = (product.spec as Record<string, unknown>) || {};
    const newSpec = { ...currentSpec, '타입': '무선' };  // 대부분 무선이므로

    const { error: updateError } = await supabase
      .from('danawa_products')
      .update({ spec: newSpec })
      .eq('pcode', product.pcode);

    if (updateError) {
      console.log(`❌ [${product.pcode}] 실패: ${updateError.message}`);
    } else {
      console.log(`✅ [전동/무선] ${product.title.substring(0, 50)}`);
    }
  }

  // 5. 미분류 제품 표시
  if (unknownProducts.length > 0) {
    console.log('\n=== 미분류 제품 (확인 필요) ===\n');
    for (const product of unknownProducts) {
      console.log(`❓ [${product.pcode}] ${product.title.substring(0, 50)}`);
    }
  }

  console.log('\n✨ 완료!');
}

main().catch(console.error);
