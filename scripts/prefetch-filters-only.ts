/**
 * 필터만 크롤링하여 Supabase에 저장하는 스크립트
 *
 * 기존 캐시된 카테고리에 대해 필터 정보만 추가 크롤링
 *
 * 사용법:
 *   npx tsx scripts/prefetch-filters-only.ts --all
 *   npx tsx scripts/prefetch-filters-only.ts --query="가습기"
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import type { DanawaFilterSection } from '../lib/danawa/search-crawler';

// Supabase 클라이언트
let supabase: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null;

function getSupabase() {
  if (!supabase) {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// 크롤러 동적 import
async function getCrawler() {
  const searchModule = await import('../lib/danawa/search-crawler-lite');
  return searchModule.crawlDanawaSearchListLite;
}

// 기본 카테고리 목록 (prefetch-knowledge-cache.ts와 동일)
const DEFAULT_QUERIES = [
  // === 출산/육아용품 ===
  '휴대용 유모차', '디럭스 유모차', '절충형 유모차', '트라이크 유모차',
  '신생아용 카시트', '유아용 카시트', '주니어용 카시트',
  '아기띠', '힙시트',
  '젖병', '젖병소독기', '쪽쪽이', '분유포트', '분유제조기', '보틀워머', '젖병솔', '유축기', '수유패드',
  '기저귀', '아기물티슈', '분유', '이유식', '유아간식',
  '빨대컵', '이유식기', '유아수저세트', '턱받이', '치발기', '이유식조리기', '하이체어',
  '아기욕조', '콧물흡입기', '체온계', '유아치약', '유아칫솔', '유아변기', '손톱깎이', '유아세제',
  '유아침대', '유아의자', '유아소파', '유아책상',
  '아기체육관', '바운서', '점퍼루', '보행기', '모빌',
  '블록장난감', '로봇장난감', '소꿉놀이', '인형', '킥보드', '놀이방매트',

  // === 생활/주방가전 ===
  '모니터', '4K모니터', '무선마우스', '기계식키보드', '노트북거치대', '웹캠',
  '에어프라이어', '전기밥솥', '전자레인지', '식기세척기', '음식물처리기', '전기포트', '커피머신', '믹서기',
  '가습기', '공기청정기', '제습기', '에어컨', '선풍기', '전기히터',
  '로봇청소기', '무선청소기', '물걸레청소기', '침구청소기',
  '세탁기', '건조기', '올인원 세탁건조기', '의류관리기', '스팀다리미',
  '헤어드라이어', '고데기', '전동칫솔', '체중계', '전기면도기', '안마의자',
];

interface FilterResult {
  query: string;
  filterCount: number;
  success: boolean;
  error?: string;
}

async function crawlFiltersOnly(query: string): Promise<FilterResult> {
  const crawlDanawaSearchListLite = await getCrawler();
  const db = getSupabase();

  console.log(`\n🏷️ [${query}] 필터 크롤링 중...`);

  try {
    // 제품 1개만 크롤링 (필터만 필요하므로)
    const searchResult = await crawlDanawaSearchListLite(
      { query, limit: 1 }
    );

    const filters: DanawaFilterSection[] = searchResult.filters || [];

    if (filters.length === 0) {
      console.log(`   ⚠️ 필터 없음`);
      return { query, filterCount: 0, success: true };
    }

    // DB 저장
    const filterData = {
      query,
      filters: filters,
      crawled_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('knowledge_filters_cache')
      .upsert(filterData, { onConflict: 'query' });

    if (error) {
      console.error(`   ❌ 저장 실패:`, error.message);
      return { query, filterCount: filters.length, success: false, error: error.message };
    }

    console.log(`   ✅ ${filters.length}개 필터 섹션 저장`);
    return { query, filterCount: filters.length, success: true };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error(`   ❌ 크롤링 실패:`, msg);
    return { query, filterCount: 0, success: false, error: msg };
  }
}

async function main() {
  const args = process.argv.slice(2);

  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const queryArg = getArg('query');
  const runAll = hasFlag('all');

  if (!queryArg && !runAll) {
    console.log(`
필터만 크롤링하는 스크립트

사용법:
  npx tsx scripts/prefetch-filters-only.ts --all
  npx tsx scripts/prefetch-filters-only.ts --query="가습기"
`);
    process.exit(0);
  }

  const queries = runAll ? DEFAULT_QUERIES : [queryArg!];

  console.log(`\n${'#'.repeat(50)}`);
  console.log(`#  필터 캐시 프리페치`);
  console.log(`#  대상: ${queries.length}개 카테고리`);
  console.log(`${'#'.repeat(50)}`);

  const results: FilterResult[] = [];
  const startTime = Date.now();

  for (const query of queries) {
    const result = await crawlFiltersOnly(query);
    results.push(result);

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 500));
  }

  // 요약
  const elapsed = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const totalFilters = results.reduce((sum, r) => sum + r.filterCount, 0);
  const errors = results.filter(r => !r.success);

  console.log(`\n${'#'.repeat(50)}`);
  console.log(`#  완료!`);
  console.log(`${'#'.repeat(50)}`);
  console.log(`\n📊 결과:`);
  console.log(`   성공: ${successCount}/${queries.length}개`);
  console.log(`   총 필터 섹션: ${totalFilters}개`);
  console.log(`   소요 시간: ${(elapsed / 1000).toFixed(1)}초`);

  if (errors.length > 0) {
    console.log(`\n⚠️ 실패 목록:`);
    for (const e of errors) {
      console.log(`   - ${e.query}: ${e.error}`);
    }
  }
}

main().catch(console.error);
