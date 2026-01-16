/**
 * knowledge_products_cache 테이블의 이미지 URL 수정 스크립트
 * shrink=130:130 → shrink=500:500
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateImages() {
  console.log('🔍 130:130 이미지 URL 검색 중...\n');

  // 130:130이 포함된 레코드 조회
  const { data: rows, error: selectError } = await supabase
    .from('knowledge_products_cache')
    .select('id, query, thumbnail')
    .like('thumbnail', '%shrink=130:130%');

  if (selectError) {
    console.error('Error selecting:', selectError);
    return;
  }

  console.log(`📦 발견된 레코드: ${rows?.length || 0}개\n`);

  if (!rows || rows.length === 0) {
    console.log('✅ 업데이트할 데이터가 없습니다.');
    return;
  }

  // 각 레코드 업데이트
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const newThumbnail = row.thumbnail.replace('shrink=130:130', 'shrink=500:500');

    const { error } = await supabase
      .from('knowledge_products_cache')
      .update({ thumbnail: newThumbnail })
      .eq('id', row.id);

    if (error) {
      console.error(`❌ Update failed for id ${row.id}:`, error.message);
      failed++;
    } else {
      updated++;
      console.log(`✅ [${updated}] ${row.query} - id: ${row.id}`);
    }
  }

  console.log('\n========================================');
  console.log(`✅ 업데이트 완료: ${updated}개`);
  console.log(`❌ 실패: ${failed}개`);
  console.log('========================================\n');
}

updateImages().then(() => process.exit(0));
