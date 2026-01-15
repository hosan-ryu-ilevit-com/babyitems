/**
 * 다나와 상세페이지에서 고화질 썸네일 URL 크롤링 테스트
 *
 * 현재 PLP(검색 결과)에서 크롤링한 저화질 썸네일을
 * PDP(상세페이지)에서 크롤링한 고화질 썸네일로 업데이트
 *
 * 사용법: npx tsx scripts/test-thumbnail-recrawl.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 요청 딜레이 (ms)
const REQUEST_DELAY = 500;

// 테스트할 pcode (예시)
const TEST_PCODES = ['74805527'];

/**
 * 다나와 상세페이지에서 고화질 썸네일 URL 추출
 */
async function fetchHighQualityThumbnail(pcode: string): Promise<string | null> {
  const url = `https://prod.danawa.com/info/?pcode=${pcode}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      console.error(`[${pcode}] HTTP 에러: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 방법 1: 메인 제품 이미지 (가장 큰 이미지)
    // .photo_w 안의 img 태그에서 src 추출
    let thumbnailUrl: string | null = null;

    // 시도 1: #baseImage (메인 이미지)
    const baseImage = $('#baseImage');
    if (baseImage.length > 0) {
      thumbnailUrl = baseImage.attr('src') || baseImage.attr('data-src') || null;
    }

    // 시도 2: .photo_w 내 img
    if (!thumbnailUrl) {
      const photoImg = $('.photo_w img').first();
      if (photoImg.length > 0) {
        thumbnailUrl = photoImg.attr('src') || photoImg.attr('data-src') || null;
      }
    }

    // 시도 3: 제품 상세 이미지 영역
    if (!thumbnailUrl) {
      const detailImg = $('.thumb_w img, .prod_img img').first();
      if (detailImg.length > 0) {
        thumbnailUrl = detailImg.attr('src') || detailImg.attr('data-src') || null;
      }
    }

    // 시도 4: og:image 메타 태그
    if (!thumbnailUrl) {
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage) {
        thumbnailUrl = ogImage;
      }
    }

    // 시도 5: 모든 이미지 중 prod_img 포함하는 것 찾기
    if (!thumbnailUrl) {
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.includes('prod_img') && src.includes(pcode)) {
          thumbnailUrl = src;
          return false; // break
        }
      });
    }

    if (!thumbnailUrl) {
      console.warn(`[${pcode}] 썸네일 URL을 찾을 수 없음`);
      return null;
    }

    // URL 정규화
    // 1. 프로토콜 추가
    if (thumbnailUrl.startsWith('//')) {
      thumbnailUrl = 'https:' + thumbnailUrl;
    }

    // 2. shrink 파라미터를 500:500으로 변경 (고화질)
    // 기존 _v 파라미터 (캐시버스터) 유지
    const urlObj = new URL(thumbnailUrl);
    const vParam = urlObj.searchParams.get('_v');

    const baseUrl = thumbnailUrl.split('?')[0];
    let highQualityUrl = `${baseUrl}?shrink=500:500`;
    if (vParam) {
      highQualityUrl += `&_v=${vParam}`;
    }

    return highQualityUrl;
  } catch (error) {
    console.error(`[${pcode}] 크롤링 에러:`, error);
    return null;
  }
}

/**
 * Supabase에서 모든 pcode 조회
 */
async function getAllPcodes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('pcode')
    .order('crawled_at', { ascending: false });

  if (error) {
    console.error('pcode 조회 실패:', error);
    return [];
  }

  // 중복 제거
  return [...new Set(data.map(row => row.pcode))];
}

/**
 * 썸네일 URL 업데이트
 */
async function updateThumbnail(pcode: string, thumbnailUrl: string): Promise<boolean> {
  const { error } = await supabase
    .from('knowledge_products_cache')
    .update({ thumbnail: thumbnailUrl })
    .eq('pcode', pcode);

  if (error) {
    console.error(`[${pcode}] 업데이트 실패:`, error);
    return false;
  }

  return true;
}

/**
 * 현재 썸네일 조회
 */
async function getCurrentThumbnail(pcode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('thumbnail, name')
    .eq('pcode', pcode)
    .limit(1)
    .single();

  if (error) {
    console.error(`[${pcode}] 현재 썸네일 조회 실패:`, error);
    return null;
  }

  console.log(`[${pcode}] 제품명: ${data.name}`);
  return data.thumbnail;
}

/**
 * 테스트 실행
 */
async function runTest() {
  console.log('='.repeat(60));
  console.log('다나와 상세페이지 고화질 썸네일 크롤링 테스트');
  console.log('='.repeat(60));

  for (const pcode of TEST_PCODES) {
    console.log(`\n[${pcode}] 처리 중...`);

    // 1. 현재 썸네일 확인
    const currentThumbnail = await getCurrentThumbnail(pcode);
    console.log(`  현재 썸네일: ${currentThumbnail}`);

    // 2. 상세페이지에서 고화질 썸네일 크롤링
    const newThumbnail = await fetchHighQualityThumbnail(pcode);
    console.log(`  새 썸네일: ${newThumbnail}`);

    if (!newThumbnail) {
      console.log(`  ❌ 크롤링 실패`);
      continue;
    }

    // 3. 비교
    if (currentThumbnail === newThumbnail) {
      console.log(`  ⏭️ 동일한 URL - 스킵`);
      continue;
    }

    // 4. 업데이트 (테스트 모드에서는 실제 업데이트 안함)
    console.log(`  🔄 URL 변경 감지:`);
    console.log(`     이전: ${currentThumbnail}`);
    console.log(`     이후: ${newThumbnail}`);

    // 테스트용으로 실제 업데이트는 주석 처리
    // const success = await updateThumbnail(pcode, newThumbnail);
    // console.log(`  ${success ? '✅ 업데이트 완료' : '❌ 업데이트 실패'}`);
    console.log(`  ⚠️ 테스트 모드 - 실제 업데이트 안함`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('테스트 완료');
  console.log('='.repeat(60));
}

/**
 * 전체 업데이트 (실제 실행용)
 */
async function runFullUpdate(dryRun: boolean = true) {
  console.log('='.repeat(60));
  console.log(`다나와 상세페이지 고화질 썸네일 전체 업데이트 ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  // 모든 pcode 조회
  const pcodes = await getAllPcodes();
  console.log(`\n총 ${pcodes.length}개 제품 처리 예정\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < pcodes.length; i++) {
    const pcode = pcodes[i];
    const progress = `[${i + 1}/${pcodes.length}]`;

    // 고화질 썸네일 크롤링
    const newThumbnail = await fetchHighQualityThumbnail(pcode);

    if (!newThumbnail) {
      console.log(`${progress} ${pcode}: ❌ 크롤링 실패`);
      failed++;
      continue;
    }

    if (!dryRun) {
      const success = await updateThumbnail(pcode, newThumbnail);
      if (success) {
        console.log(`${progress} ${pcode}: ✅ 업데이트 완료`);
        updated++;
      } else {
        console.log(`${progress} ${pcode}: ❌ 업데이트 실패`);
        failed++;
      }
    } else {
      console.log(`${progress} ${pcode}: 🔄 ${newThumbnail.substring(0, 60)}...`);
      updated++;
    }

    // 딜레이
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`완료: 업데이트 ${updated}개, 실패 ${failed}개, 스킵 ${skipped}개`);
  console.log('='.repeat(60));
}

/**
 * 간단한 URL 파라미터 변경 (크롤링 없이)
 * shrink=130:130 → shrink=500:500 으로 변경
 * 1000개씩 반복해서 모두 업데이트
 */
async function runSimpleUpdate(dryRun: boolean = true) {
  console.log('='.repeat(60));
  console.log(`썸네일 URL 파라미터 변경 ${dryRun ? '(DRY RUN)' : '(REAL UPDATE)'}`);
  console.log('='.repeat(60));

  let totalUpdated = 0;
  let totalFailed = 0;
  let round = 1;

  while (true) {
    // 1000개씩 조회
    const { data, error } = await supabase
      .from('knowledge_products_cache')
      .select('id, pcode, name, thumbnail')
      .like('thumbnail', '%shrink=130:130%')
      .limit(1000);

    if (error) {
      console.error('조회 실패:', error);
      break;
    }

    if (!data || data.length === 0) {
      console.log('\n더 이상 업데이트할 레코드 없음');
      break;
    }

    console.log(`\n라운드 ${round}: ${data.length}개 처리 중...`);

    if (dryRun) {
      // 샘플 출력
      console.log('샘플 (처음 3개):');
      data.slice(0, 3).forEach(row => {
        const newUrl = row.thumbnail.replace('shrink=130:130', 'shrink=500:500');
        console.log(`  [${row.pcode}] ${row.name}`);
        console.log(`    이전: ...${row.thumbnail.substring(50, 100)}...`);
        console.log(`    이후: ...${newUrl.substring(50, 100)}...`);
      });
      console.log('\n실제 업데이트하려면 --simple --update 옵션 사용');
      break;
    }

    // 실제 업데이트
    for (const row of data) {
      const newUrl = row.thumbnail.replace('shrink=130:130', 'shrink=500:500');

      const { error: updateError } = await supabase
        .from('knowledge_products_cache')
        .update({ thumbnail: newUrl })
        .eq('id', row.id);

      if (updateError) {
        totalFailed++;
      } else {
        totalUpdated++;
      }
    }

    console.log(`  완료 (누적: ${totalUpdated}개, 실패: ${totalFailed}개)`);
    round++;
  }

  if (!dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log(`총 완료: 성공 ${totalUpdated}개, 실패 ${totalFailed}개`);
    console.log('='.repeat(60));
  }
}

// 실행
const args = process.argv.slice(2);
if (args.includes('--simple')) {
  const dryRun = !args.includes('--update');
  runSimpleUpdate(dryRun);
} else if (args.includes('--full')) {
  const dryRun = !args.includes('--update');
  runFullUpdate(dryRun);
} else {
  runTest();
}
