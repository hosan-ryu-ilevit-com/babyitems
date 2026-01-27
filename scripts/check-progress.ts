/**
 * 크롤링 진행 상황 확인 스크립트
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  '블록장난감', '로봇장난감', '소꿉놀이', '인형', '유아동 킥보드', '놀이방매트',

  // === 생활/주방가전 ===
  '모니터', '4K모니터', '무선마우스', '기계식키보드', '노트북거치대', '웹캠',
  '에어프라이어', '전기밥솥', '전자레인지', '식기세척기', '음식물처리기', '전기포트', '커피머신', '믹서기',
  '가습기', '공기청정기', '제습기', '에어컨', '선풍기', '전기히터',
  '로봇청소기', '무선청소기', '물걸레청소기', '침구청소기',
  '세탁기', '건조기', '올인원 세탁건조기', '의류관리기', '스팀다리미',
  '헤어드라이어', '고데기', '전동칫솔', '체중계', '전기면도기', '안마의자',
];

async function checkProgress() {
  console.log('크롤링 진행 상황 확인 중...\n');

  // 완료된 쿼리 조회
  const { data: completedQueries, error } = await supabase
    .from('knowledge_products_cache')
    .select('query, crawled_at')
    .order('query');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  const completedSet = new Set(completedQueries?.map((r: { query: string }) => r.query) || []);
  const completed = DEFAULT_QUERIES.filter(q => completedSet.has(q));
  const remaining = DEFAULT_QUERIES.filter(q => !completedSet.has(q));

  console.log(`✅ 완료됨: ${completed.length}/${DEFAULT_QUERIES.length}개`);
  console.log(`⏳ 남은 것: ${remaining.length}개\n`);

  if (completed.length > 0) {
    console.log('완료된 카테고리:');
    completed.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  }

  if (remaining.length > 0) {
    console.log('\n남은 카테고리:');
    remaining.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

    console.log('\n다음 명령어로 resume:');
    console.log(`npx tsx scripts/prefetch-knowledge-cache.ts --query="${remaining[0]}" --products=120 --reviews-top=120 --reviews-per=500`);
    console.log('\n또는 남은 카테고리 전체:');
    console.log('(스크립트를 수정하여 remaining 배열만 실행)');
  } else {
    console.log('\n모든 카테고리 크롤링 완료!');
  }
}

checkProgress().catch(console.error);
