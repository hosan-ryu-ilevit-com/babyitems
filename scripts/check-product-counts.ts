import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('\n========================================');
  console.log('📊 danawa_products 테이블 통계');
  console.log('========================================\n');

  // 전체 제품 수
  const { count: totalCount, error: e1 } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true });

  console.log(`전체 제품 수: ${totalCount?.toLocaleString()}개`);

  // rank가 있는 제품 수
  const { count: rankedCount, error: e2 } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true })
    .not('rank', 'is', null);

  console.log(`rank가 있는 제품: ${rankedCount?.toLocaleString()}개`);

  // rank가 없는 제품 수
  const { count: noRankCount, error: e3 } = await supabase
    .from('danawa_products')
    .select('*', { count: 'exact', head: true })
    .is('rank', null);

  console.log(`rank가 없는 제품: ${noRankCount?.toLocaleString()}개\n`);

  // 페이징 테스트
  console.log('========================================');
  console.log('🔍 페이징 테스트 (rank 정렬)');
  console.log('========================================\n');

  const pageSize = 1000;
  let totalFetched = 0;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('danawa_products')
      .select('pcode')
      .order('rank', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error(`페이지 ${page} 조회 실패:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    totalFetched += data.length;
    console.log(`페이지 ${page + 1}: ${data.length}개 (누적: ${totalFetched.toLocaleString()}개)`);
    page++;

    if (data.length < pageSize) {
      break;
    }
  }

  console.log(`\n최종 조회된 제품: ${totalFetched.toLocaleString()}개`);
  console.log('========================================\n');
}

check();
