/**
 * 에누리 리뷰 사진 + 필터 API 분석 스크립트
 */

import * as cheerio from 'cheerio';

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// 1. 리뷰 JSON-LD 전체 구조 분석
async function analyzeReviewStructure(modelNo: string) {
  console.log('\n=== 1. 리뷰 JSON-LD 구조 분석 ===\n');

  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
  console.log(`URL: ${url}\n`);

  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript) {
    const productData = JSON.parse(seoScript);

    console.log('📦 Product 기본 정보:');
    console.log(`   - name: ${productData.name}`);
    console.log(`   - description: ${productData.description?.slice(0, 100)}...`);

    if (productData.review && productData.review.length > 0) {
      console.log(`\n📝 리뷰 개수: ${productData.review.length}개`);
      console.log('\n첫 번째 리뷰 전체 구조:');
      console.log(JSON.stringify(productData.review[0], null, 2));

      // 모든 리뷰의 키 확인
      const allKeys = new Set<string>();
      productData.review.forEach((r: any) => {
        Object.keys(r).forEach(k => allKeys.add(k));
      });
      console.log(`\n리뷰 객체의 모든 키: ${[...allKeys].join(', ')}`);

      // 이미지 관련 필드 찾기
      console.log('\n🖼️ 이미지 관련 필드 검색:');
      productData.review.forEach((r: any, i: number) => {
        const hasImage = r.image || r.images || r.photo || r.photos || r.reviewImage || r.attachments;
        if (hasImage) {
          console.log(`   리뷰 ${i + 1}: 이미지 발견!`, hasImage);
        }
      });
    }
  }

  // HTML에서 리뷰 이미지 찾기
  console.log('\n🔍 HTML에서 리뷰 이미지 검색:');
  const reviewImages: string[] = [];
  $('img[src*="review"], img[class*="review"], .review img, .user-review img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) reviewImages.push(src);
  });
  console.log(`   발견된 리뷰 이미지: ${reviewImages.length}개`);
  if (reviewImages.length > 0) {
    reviewImages.slice(0, 5).forEach(img => console.log(`   - ${img}`));
  }
}

// 2. 필터 API 분석
async function analyzeFilterAPI(categoryCode: string) {
  console.log('\n\n=== 2. 필터 API 분석 ===\n');

  // 에누리 필터 API 엔드포인트 시도
  const possibleAPIs = [
    `https://www.enuri.com/api/filter?cate=${categoryCode}`,
    `https://www.enuri.com/list/filter.jsp?cate=${categoryCode}`,
    `https://www.enuri.com/api/v1/category/${categoryCode}/filters`,
    `https://www.enuri.com/ajax/getFilter.jsp?cate=${categoryCode}`,
  ];

  for (const apiUrl of possibleAPIs) {
    console.log(`시도: ${apiUrl}`);
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (response.ok) {
        const text = await response.text();
        console.log(`   ✅ 성공! 응답 길이: ${text.length}`);
        console.log(`   응답 미리보기: ${text.slice(0, 500)}`);
      } else {
        console.log(`   ❌ HTTP ${response.status}`);
      }
    } catch (e: any) {
      console.log(`   ❌ 실패: ${e.message}`);
    }
  }

  // HTML에서 필터 데이터 추출 시도
  console.log('\n📄 HTML에서 필터 데이터 추출 시도:');
  const listUrl = `https://www.enuri.com/list.jsp?cate=${categoryCode}&tabType=1`;
  const html = await fetchPage(listUrl);
  const $ = cheerio.load(html);

  // JavaScript 변수에서 필터 데이터 찾기
  const scripts = $('script').text();

  // attrList, filterList 등 변수 찾기
  const patterns = [
    /var\s+attrList\s*=\s*(\[[\s\S]*?\]);/,
    /var\s+filterList\s*=\s*(\[[\s\S]*?\]);/,
    /var\s+brandAttrList\s*=\s*(\[[\s\S]*?\]);/,
    /"attrList"\s*:\s*(\[[\s\S]*?\])/,
    /filterData\s*=\s*(\{[\s\S]*?\});/,
  ];

  for (const pattern of patterns) {
    const match = scripts.match(pattern);
    if (match) {
      console.log(`\n✅ 패턴 발견: ${pattern.source.slice(0, 30)}...`);
      console.log(`   데이터 미리보기: ${match[1].slice(0, 300)}...`);
    }
  }

  // filter-area 클래스 분석
  console.log('\n📋 필터 영역 HTML 구조:');
  $('.filter-wrap, .attr-wrap, [class*="filter"]').each((i, el) => {
    if (i >= 3) return;
    const className = $(el).attr('class');
    const html = $(el).html()?.slice(0, 200);
    console.log(`\n   [${className}]`);
    console.log(`   ${html}...`);
  });
}

// 3. 리뷰 페이지 AJAX 분석
async function analyzeReviewAjax(modelNo: string) {
  console.log('\n\n=== 3. 리뷰 AJAX API 분석 ===\n');

  // 에누리 리뷰 AJAX 엔드포인트 시도
  const reviewAPIs = [
    `https://www.enuri.com/review/getReviewList.jsp?modelno=${modelNo}`,
    `https://www.enuri.com/api/review?modelno=${modelNo}`,
    `https://www.enuri.com/ajax/review.jsp?modelno=${modelNo}`,
    `https://www.enuri.com/knowcom/list_498A.jsp?modelno=${modelNo}&page=1`,
  ];

  for (const apiUrl of reviewAPIs) {
    console.log(`시도: ${apiUrl}`);
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json, text/html',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://www.enuri.com/detail.jsp?modelno=${modelNo}`,
        },
      });
      if (response.ok) {
        const text = await response.text();
        console.log(`   ✅ 성공! 응답 길이: ${text.length}`);

        // 이미지 URL 찾기
        const imgMatches = text.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|gif|webp)/gi);
        if (imgMatches && imgMatches.length > 0) {
          console.log(`   🖼️ 이미지 URL ${imgMatches.length}개 발견:`);
          imgMatches.slice(0, 5).forEach(img => console.log(`      - ${img}`));
        }

        console.log(`   응답 미리보기: ${text.slice(0, 500)}`);
      } else {
        console.log(`   ❌ HTTP ${response.status}`);
      }
    } catch (e: any) {
      console.log(`   ❌ 실패: ${e.message}`);
    }
  }
}

// 메인 실행
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     에누리 리뷰 사진 + 필터 API 분석                      ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // 리뷰 많은 카시트 상품으로 테스트
  const testModelNo = '46256330'; // 순성 빌리 (리뷰 1352개)
  const testCategoryCode = '10040201'; // 일체형 카시트

  await analyzeReviewStructure(testModelNo);
  await analyzeFilterAPI(testCategoryCode);
  await analyzeReviewAjax(testModelNo);

  console.log('\n\n✅ 분석 완료');
}

main().catch(console.error);
