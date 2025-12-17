/**
 * 에누리 제품의 filter_attrs 생성 스크립트
 * - category_path와 spec에서 필터 속성 추출
 * - Supabase enuri_products 테이블 업데이트
 * - 로컬 spec 파일도 업데이트
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

// 카테고리별 filter_attrs 추출 함수
interface EnuriProduct {
  model_no: string;
  title: string;
  brand?: string;
  spec: Record<string, unknown>;
  category_path: string;
}

function extractDiaperFilterAttrs(product: EnuriProduct): Record<string, string> {
  const attrs: Record<string, string> = {};
  const categoryPath = product.category_path || '';

  // 형태: 밴드형/팬티형
  if (categoryPath.includes('밴드형')) {
    attrs['형태'] = '밴드형';
  } else if (categoryPath.includes('팬티형')) {
    attrs['형태'] = '팬티형';
  }

  // 단계: 0~8단계
  const stageMatch = categoryPath.match(/(\d)단계/);
  if (stageMatch) {
    attrs['단계'] = `${stageMatch[1]}단계`;
  }

  // 성별: 공용/남아/여아
  if (categoryPath.includes('공용')) {
    attrs['성별'] = '공용';
  } else if (categoryPath.includes('남아')) {
    attrs['성별'] = '남아';
  } else if (categoryPath.includes('여아')) {
    attrs['성별'] = '여아';
  }

  return attrs;
}

function extractStrollerFilterAttrs(product: EnuriProduct): Record<string, string> {
  const attrs: Record<string, string> = {};
  const spec = product.spec || {};

  // 출시년도
  const releaseYear = spec['출시년도'] as string;
  if (releaseYear) {
    attrs['출시년도'] = releaseYear;
  }

  // 브랜드 (title에서 추출 또는 brand 필드)
  if (product.brand) {
    attrs['브랜드'] = product.brand;
  } else {
    // title에서 첫 번째 단어를 브랜드로 추정
    const brandMatch = product.title?.match(/^([^\s]+)/);
    if (brandMatch) {
      attrs['브랜드'] = brandMatch[1];
    }
  }

  return attrs;
}

function extractFormulaMakerFilterAttrs(product: EnuriProduct): Record<string, string> {
  const attrs: Record<string, string> = {};

  // 브랜드
  if (product.brand) {
    attrs['브랜드'] = product.brand;
  } else {
    const brandMatch = product.title?.match(/^([^\s]+)/);
    if (brandMatch) {
      attrs['브랜드'] = brandMatch[1];
    }
  }

  return attrs;
}

function extractCarSeatFilterAttrs(product: EnuriProduct): Record<string, string> {
  const attrs: Record<string, string> = {};
  const spec = product.spec || {};

  // 허용무게
  const weight = spec['허용무게'] as string;
  if (weight) {
    attrs['허용무게'] = weight;
  }

  // 벨트타입 (안전벨트 형태 필드에서 추출)
  const beltType = spec['안전벨트 형태'] as string;
  if (beltType) {
    if (beltType.includes('5점식')) {
      attrs['벨트타입'] = '5점식벨트';
    } else if (beltType.includes('3점식')) {
      attrs['벨트타입'] = '3점식벨트';
    }
  }

  // Fallback: spec.특징 배열에서 추출
  if (!attrs['벨트타입']) {
    const features = spec['특징'] as string[] | undefined;
    if (features && Array.isArray(features)) {
      if (features.some(f => f.includes('5점식'))) {
        attrs['벨트타입'] = '5점식벨트';
      } else if (features.some(f => f.includes('3점식'))) {
        attrs['벨트타입'] = '3점식벨트';
      }
    }
  }

  // 브랜드
  if (product.brand) {
    attrs['브랜드'] = product.brand;
  } else {
    const brandMatch = product.title?.match(/^([^\s]+)/);
    if (brandMatch) {
      attrs['브랜드'] = brandMatch[1];
    }
  }

  return attrs;
}

async function updateSupabaseProducts() {
  console.log('=== Supabase enuri_products filter_attrs 업데이트 ===\n');

  // 각 카테고리별로 처리
  const categories = [
    { path: '%기저귀%', extractor: extractDiaperFilterAttrs, name: '기저귀' },
    { path: '%유모차%', extractor: extractStrollerFilterAttrs, name: '유모차' },
    { path: '%카시트%', extractor: extractCarSeatFilterAttrs, name: '카시트' },
  ];

  for (const category of categories) {
    console.log(`\n[${category.name}] 처리 중...`);

    const { data: products, error } = await supabase
      .from('enuri_products')
      .select('model_no, title, brand, spec, category_path')
      .ilike('category_path', category.path);

    if (error) {
      console.error(`Error fetching ${category.name}:`, error.message);
      continue;
    }

    if (!products || products.length === 0) {
      console.log(`${category.name} 제품 없음`);
      continue;
    }

    console.log(`${products.length}개 제품 발견`);

    let updated = 0;
    for (const product of products) {
      const filterAttrs = category.extractor(product as EnuriProduct);

      if (Object.keys(filterAttrs).length > 0) {
        const { error: updateError } = await supabase
          .from('enuri_products')
          .update({ filter_attrs: filterAttrs })
          .eq('model_no', product.model_no);

        if (updateError) {
          console.error(`Error updating ${product.model_no}:`, updateError.message);
        } else {
          updated++;
        }
      }
    }

    console.log(`${updated}개 업데이트 완료`);
  }
}

async function updateLocalSpecFiles() {
  console.log('\n\n=== 로컬 spec 파일 filter_attrs 업데이트 ===\n');

  const specDir = path.join(process.cwd(), 'data', 'specs');

  const categoryMappings: Record<string, (p: EnuriProduct) => Record<string, string>> = {
    'diaper.json': extractDiaperFilterAttrs,
    'stroller.json': extractStrollerFilterAttrs,
    'car_seat.json': extractCarSeatFilterAttrs,
    'formula_maker.json': extractFormulaMakerFilterAttrs,
  };

  for (const [filename, extractor] of Object.entries(categoryMappings)) {
    const filePath = path.join(specDir, filename);

    if (!fs.existsSync(filePath)) {
      console.log(`${filename} 파일 없음, 스킵`);
      continue;
    }

    console.log(`[${filename}] 처리 중...`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let updated = 0;

    for (const product of data) {
      // 로컬 파일 구조 매핑
      const mapped: EnuriProduct = {
        model_no: String(product.productId),
        title: product.모델명 || '',
        brand: product.브랜드,
        spec: product.specs || {},
        category_path: product.하위카테고리 || '',
      };

      // category_path가 없으면 하위카테고리 사용
      if (!mapped.category_path && product['하위카테고리']) {
        mapped.category_path = product['하위카테고리'];
      }

      const filterAttrs = extractor(mapped);

      if (Object.keys(filterAttrs).length > 0) {
        product.filter_attrs = filterAttrs;
        updated++;
      }
    }

    // 파일 저장
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`${updated}개 제품에 filter_attrs 추가, 파일 저장 완료`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'both';

  console.log('에누리 filter_attrs 생성 스크립트');
  console.log('사용법: npx tsx scripts/populate-enuri-filter-attrs.ts [supabase|local|both]');
  console.log(`모드: ${mode}\n`);

  if (mode === 'supabase' || mode === 'both') {
    await updateSupabaseProducts();
  }

  if (mode === 'local' || mode === 'both') {
    await updateLocalSpecFiles();
  }

  console.log('\n완료!');
}

main().catch(console.error);
