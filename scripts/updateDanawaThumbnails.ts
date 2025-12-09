/**
 * 다나와 제품 썸네일 URL 업데이트 스크립트
 *
 * 새 JSON 파일에서 기존 pcode와 동일한 제품의 thumbnail만 업데이트
 *
 * 실행: npx tsx scripts/updateDanawaThumbnails.ts
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

const OLD_FILE = path.join(__dirname, '../danawaproduct_1208/danawa_products_20251208_114030.json');
const NEW_FILE = path.join(__dirname, '../danawaproduct_1208/danawa_products_20251209_025019.json');

// Supabase 설정
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =====================================================
// 타입 정의
// =====================================================

interface DanawaProduct {
  pcode: string;
  title: string;
  thumbnail?: string;
  [key: string]: unknown;
}

// 썸네일 URL 정리 (버전 파라미터 제거)
function cleanThumbnailUrl(url: string): string {
  // &_v=20250415105129 같은 버전 파라미터 제거
  return url.replace(/&_v=\d+$/, '');
}

// =====================================================
// 메인 로직
// =====================================================

async function main() {
  console.log('🚀 다나와 썸네일 URL 업데이트 시작\n');

  // 1. JSON 파일 로드
  console.log('📂 JSON 파일 로드 중...');
  const oldProducts: DanawaProduct[] = JSON.parse(fs.readFileSync(OLD_FILE, 'utf-8'));
  const newProducts: DanawaProduct[] = JSON.parse(fs.readFileSync(NEW_FILE, 'utf-8'));

  console.log(`   기존 파일: ${oldProducts.length}개 제품`);
  console.log(`   새 파일: ${newProducts.length}개 제품`);

  // 2. 기존 파일의 pcode를 Set으로
  const oldPcodes = new Set(oldProducts.map(p => p.pcode));
  const newMap = new Map(newProducts.map(p => [p.pcode, p]));

  // 3. 공통 pcode 중 새 파일에 썸네일이 있는 것 전부 (정리된 URL로 업데이트)
  const updates: { pcode: string; thumbnail: string; title: string }[] = [];

  for (const oldProduct of oldProducts) {
    const newProduct = newMap.get(oldProduct.pcode);
    if (newProduct && newProduct.thumbnail) {
      updates.push({
        pcode: oldProduct.pcode,
        thumbnail: cleanThumbnailUrl(newProduct.thumbnail),
        title: newProduct.title,
      });
    }
  }

  console.log(`   공통 pcode: ${updates.length}개`);
  console.log(`   샘플 URL (정리 후): ${updates[0]?.thumbnail}`)

  console.log(`\n📊 업데이트 대상: ${updates.length}개 제품`);

  if (updates.length === 0) {
    console.log('✅ 업데이트할 썸네일이 없습니다.');
    return;
  }

  // 4. Supabase 업데이트 (배치로)
  console.log('\n🔄 Supabase 업데이트 중...');

  const BATCH_SIZE = 50;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // 각 제품 개별 업데이트 (upsert로 thumbnail만 업데이트)
    for (const item of batch) {
      const { error } = await supabase
        .from('danawa_products')
        .update({ thumbnail: item.thumbnail })
        .eq('pcode', item.pcode);

      if (error) {
        console.error(`\n❌ ${item.pcode} 업데이트 실패:`, error.message);
        errors++;
      } else {
        updated++;
      }
    }

    process.stdout.write(`\r   진행: ${updated + errors}/${updates.length} (성공: ${updated}, 실패: ${errors})`);
  }

  console.log(`\n\n✨ 완료!`);
  console.log(`   - 성공: ${updated}개`);
  console.log(`   - 실패: ${errors}개`);

  // 5. 검증
  console.log('\n🔍 검증 중...');
  const { count: nullThumbnailCount } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail', null);

  console.log(`   - 썸네일 없는 제품 수: ${nullThumbnailCount}개`);
}

main().catch(console.error);
