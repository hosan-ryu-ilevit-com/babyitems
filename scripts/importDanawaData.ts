/**
 * 다나와 데이터 Supabase Import 스크립트
 * 
 * 실행: npx tsx scripts/importDanawaData.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env.local 파일 로드
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// =====================================================
// 설정
// =====================================================

const DATA_DIR = path.join(__dirname, '../danawaproduct_1208');

// Supabase 설정 (환경변수 또는 직접 입력)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // service_role 키 필요

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  console.log('   환경변수를 설정하거나 스크립트에 직접 입력하세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =====================================================
// 카테고리 그룹 매핑 정의
// =====================================================

interface CategoryGroupDef {
  id: string;
  name: string;
  display_order: number;
  category_codes: string[];
}

const CATEGORY_GROUPS: CategoryGroupDef[] = [
  // 통합 카테고리 (여러 다나와 카테고리 묶음)
  {
    id: 'stroller',
    name: '유모차',
    display_order: 1,
    category_codes: ['16349193', '16349368', '16349195', '16349196'],
  },
  {
    id: 'car_seat',
    name: '카시트',
    display_order: 2,
    category_codes: ['16349200', '16349201', '16349202', '16353763'],
  },
  {
    id: 'diaper',
    name: '기저귀',
    display_order: 3,
    category_codes: ['16349108', '16349109', '16349110', '16356038', '16356040', '16356042'],
  },
  // 단일 카테고리
  {
    id: 'baby_bottle',
    name: '젖병',
    display_order: 4,
    category_codes: ['16349219'],
  },
  {
    id: 'wet_tissue',
    name: '아기물티슈',
    display_order: 5,
    category_codes: ['16349119'],
  },
  {
    id: 'formula',
    name: '분유',
    display_order: 6,
    category_codes: ['16249091'],
  },
  {
    id: 'formula_maker',
    name: '분유제조기',
    display_order: 7,
    category_codes: ['16349381'],
  },
  {
    id: 'nipple',
    name: '젖꼭지/노리개',
    display_order: 8,
    category_codes: ['16349351'],
  },
  {
    id: 'baby_bed',
    name: '유아침대',
    display_order: 9,
    category_codes: ['16338152'],
  },
  {
    id: 'formula_pot',
    name: '분유포트',
    display_order: 10,
    category_codes: ['16330960'],
  },
  {
    id: 'baby_chair',
    name: '유아의자',
    display_order: 11,
    category_codes: ['16338153'],
  },
  {
    id: 'high_chair',
    name: '유아식탁의자',
    display_order: 12,
    category_codes: ['16338154'],
  },
  {
    id: 'baby_sofa',
    name: '유아소파',
    display_order: 13,
    category_codes: ['16338155'],
  },
  {
    id: 'baby_desk',
    name: '유아책상',
    display_order: 14,
    category_codes: ['16338156'],
  },
  {
    id: 'baby_monitor',
    name: '베이비모니터',
    display_order: 15,
    category_codes: ['11427546'],
  },
  {
    id: 'thermometer',
    name: '체온계',
    display_order: 16,
    category_codes: ['17325941'],
  },
  {
    id: 'nasal_aspirator',
    name: '코흡입기',
    display_order: 17,
    category_codes: ['16349248'],
  },
];

// category_code → group_id 매핑 생성
const categoryToGroup: Record<string, string> = {};
CATEGORY_GROUPS.forEach(group => {
  group.category_codes.forEach(code => {
    categoryToGroup[code] = group.id;
  });
});

// =====================================================
// 데이터 로드
// =====================================================

function loadJsonFile<T>(filename: string): T {
  const files = fs.readdirSync(DATA_DIR);
  const targetFile = files.find(f => f.includes(filename));
  
  if (!targetFile) {
    throw new Error(`파일을 찾을 수 없습니다: ${filename}`);
  }
  
  const filePath = path.join(DATA_DIR, targetFile);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

// =====================================================
// Import 함수들
// =====================================================

async function importCategoryGroups(): Promise<void> {
  console.log('\n📁 카테고리 그룹 import 중...');
  
  const groupsData = CATEGORY_GROUPS.map(g => ({
    id: g.id,
    name: g.name,
    display_order: g.display_order,
    is_active: true,
  }));
  
  const { error } = await supabase
    .from('danawa_category_groups')
    .upsert(groupsData, { onConflict: 'id' });
  
  if (error) {
    console.error('❌ 카테고리 그룹 import 실패:', error);
    throw error;
  }
  
  console.log(`✅ 카테고리 그룹 ${groupsData.length}개 완료`);
}

async function importCategories(): Promise<void> {
  console.log('\n📁 카테고리 import 중...');
  
  interface RawCategory {
    category_code: string;
    category_name: string;
    total_product_count: number;
    crawled_product_count: number;
    crawled_at: string;
  }
  
  const rawCategories = loadJsonFile<RawCategory[]>('categories');
  
  const categoriesData = rawCategories.map(cat => ({
    category_code: cat.category_code,
    category_name: cat.category_name,
    group_id: categoryToGroup[cat.category_code] || null,
    total_product_count: cat.total_product_count,
    crawled_product_count: cat.crawled_product_count,
    crawled_at: cat.crawled_at,
  }));
  
  const { error } = await supabase
    .from('danawa_categories')
    .upsert(categoriesData, { onConflict: 'category_code' });
  
  if (error) {
    console.error('❌ 카테고리 import 실패:', error);
    throw error;
  }
  
  console.log(`✅ 카테고리 ${categoriesData.length}개 완료`);
}

async function importFilters(): Promise<void> {
  console.log('\n📁 필터 import 중...');
  
  interface RawFilter {
    category_code: string;
    filter_name: string;
    options: string[];
    option_count: number;
    crawled_at: string;
  }
  
  const rawFilters = loadJsonFile<RawFilter[]>('filters');
  
  // 기존 필터 삭제 후 새로 삽입 (upsert가 복잡해서)
  const { error: deleteError } = await supabase
    .from('danawa_filters')
    .delete()
    .neq('id', 0); // 모든 행 삭제
  
  if (deleteError) {
    console.error('⚠️ 기존 필터 삭제 실패 (무시하고 진행):', deleteError);
  }
  
  // 배치로 삽입 (100개씩)
  const BATCH_SIZE = 100;
  let inserted = 0;
  
  for (let i = 0; i < rawFilters.length; i += BATCH_SIZE) {
    const batch = rawFilters.slice(i, i + BATCH_SIZE).map(f => ({
      category_code: f.category_code,
      filter_name: f.filter_name,
      options: f.options,
      option_count: f.option_count,
      crawled_at: f.crawled_at,
    }));
    
    const { error } = await supabase
      .from('danawa_filters')
      .insert(batch);
    
    if (error) {
      console.error(`❌ 필터 배치 ${i}~${i + batch.length} 실패:`, error);
      throw error;
    }
    
    inserted += batch.length;
    process.stdout.write(`\r   진행: ${inserted}/${rawFilters.length}`);
  }
  
  console.log(`\n✅ 필터 ${inserted}개 완료`);
}

async function importProducts(): Promise<void> {
  console.log('\n📁 제품 import 중...');
  
  interface RawProduct {
    pcode: string;
    title: string;
    brand?: string;
    price?: number;
    category_code: string;
    rank?: number;
    detail_url?: string;
    thumbnail?: string;
    reg_date?: string;
    spec_raw?: string;
    spec?: Record<string, unknown>;
    filter_attrs?: Record<string, unknown>;
    crawled_at?: string;
  }
  
  const rawProducts = loadJsonFile<RawProduct[]>('products');
  
  // 배치로 upsert (100개씩)
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < rawProducts.length; i += BATCH_SIZE) {
    const batch = rawProducts.slice(i, i + BATCH_SIZE).map(p => ({
      pcode: p.pcode,
      title: p.title,
      brand: p.brand || null,
      price: p.price || null,
      category_code: p.category_code,
      rank: p.rank || null,
      detail_url: p.detail_url || null,
      thumbnail: p.thumbnail || null,
      reg_date: p.reg_date || null,
      spec_raw: p.spec_raw || null,
      spec: p.spec || {},
      filter_attrs: p.filter_attrs || {},
      crawled_at: p.crawled_at || null,
      // 미래용 필드는 null
      average_rating: null,
      review_count: 0,
      coupang_pcode: null,
    }));
    
    const { error } = await supabase
      .from('danawa_products')
      .upsert(batch, { onConflict: 'pcode' });
    
    if (error) {
      console.error(`\n❌ 제품 배치 ${i}~${i + batch.length} 실패:`, error);
      errors++;
      // 에러나도 계속 진행
    } else {
      inserted += batch.length;
    }
    
    process.stdout.write(`\r   진행: ${inserted}/${rawProducts.length} (에러: ${errors})`);
  }
  
  console.log(`\n✅ 제품 ${inserted}개 완료 (에러: ${errors})`);
}

// =====================================================
// 메인 실행
// =====================================================

async function main() {
  console.log('🚀 다나와 데이터 Supabase Import 시작');
  console.log(`   데이터 경로: ${DATA_DIR}`);
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // 순서대로 import (FK 의존성)
    await importCategoryGroups();
    await importCategories();
    await importFilters();
    await importProducts();
    
    console.log('\n✨ 모든 데이터 import 완료!');
    
    // 통계 출력
    const { count: groupCount } = await supabase
      .from('danawa_category_groups')
      .select('*', { count: 'exact', head: true });
    
    const { count: catCount } = await supabase
      .from('danawa_categories')
      .select('*', { count: 'exact', head: true });
    
    const { count: filterCount } = await supabase
      .from('danawa_filters')
      .select('*', { count: 'exact', head: true });
    
    const { count: productCount } = await supabase
      .from('danawa_products')
      .select('*', { count: 'exact', head: true });
    
    console.log('\n📊 최종 통계:');
    console.log(`   - 카테고리 그룹: ${groupCount}개`);
    console.log(`   - 카테고리: ${catCount}개`);
    console.log(`   - 필터: ${filterCount}개`);
    console.log(`   - 제품: ${productCount}개`);
    
  } catch (error) {
    console.error('\n💥 Import 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
