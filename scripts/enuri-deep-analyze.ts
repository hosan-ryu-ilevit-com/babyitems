/**
 * 에누리 HTML 심층 분석 - 리뷰 이미지 + 필터 데이터
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  return response.text();
}

async function main() {
  // 1. 상세 페이지에서 리뷰 이미지 찾기
  console.log('=== 1. 상세 페이지 리뷰 이미지 분석 ===\n');

  const detailUrl = 'https://www.enuri.com/detail.jsp?modelno=46256330';
  const detailHtml = await fetchPage(detailUrl);
  const $detail = cheerio.load(detailHtml);

  // 모든 이미지 URL 추출
  const allImages: string[] = [];
  $detail('img').each((_, el) => {
    const src = $detail(el).attr('src') || $detail(el).attr('data-src') || $detail(el).attr('data-original');
    if (src && !src.includes('icon') && !src.includes('btn') && !src.includes('logo')) {
      allImages.push(src);
    }
  });
  console.log(`전체 이미지 ${allImages.length}개:`);
  allImages.slice(0, 20).forEach(img => console.log(`  ${img}`));

  // 리뷰 관련 HTML 영역 찾기
  console.log('\n--- 리뷰 관련 HTML 클래스 ---');
  $detail('[class*="review"], [class*="Review"], [id*="review"]').each((i, el) => {
    if (i >= 5) return;
    const className = $detail(el).attr('class') || $detail(el).attr('id');
    console.log(`  [${className}]`);
  });

  // knowcom (에누리 리뷰 시스템) 관련 찾기
  console.log('\n--- knowcom 관련 영역 ---');
  $detail('[class*="knowcom"], [id*="knowcom"], [class*="user"], [class*="comment"]').each((i, el) => {
    if (i >= 5) return;
    const tagName = el.tagName;
    const className = $detail(el).attr('class') || $detail(el).attr('id');
    console.log(`  <${tagName} class="${className}">`);
  });

  // script 태그에서 리뷰/필터 관련 데이터 찾기
  console.log('\n--- Script 태그 분석 ---');
  $detail('script').each((i, el) => {
    const content = $detail(el).html() || '';
    if (content.includes('review') || content.includes('Review') || content.includes('filter') || content.includes('attr')) {
      // 변수 할당 패턴 찾기
      const varMatches = content.match(/var\s+\w+\s*=\s*[\[\{]/g);
      if (varMatches) {
        console.log(`  Script ${i}: ${varMatches.slice(0, 5).join(', ')}`);
      }
    }
  });

  // 2. 리스트 페이지에서 필터 데이터 찾기
  console.log('\n\n=== 2. 리스트 페이지 필터 분석 ===\n');

  const listUrl = 'https://www.enuri.com/list.jsp?cate=10040201&tabType=1';
  const listHtml = await fetchPage(listUrl);
  const $list = cheerio.load(listHtml);

  // 필터 체크박스/옵션 찾기
  console.log('--- 필터 input 요소 ---');
  $list('input[type="checkbox"], input[type="radio"]').each((i, el) => {
    if (i >= 20) return;
    const name = $list(el).attr('name');
    const value = $list(el).attr('value');
    const id = $list(el).attr('id');
    const dataAttr = $list(el).attr('data-attr') || $list(el).attr('data-value');
    if (name || value || dataAttr) {
      console.log(`  name="${name}" value="${value}" data="${dataAttr}"`);
    }
  });

  // 필터 dl/dt/dd 구조 찾기
  console.log('\n--- 필터 영역 (dl/dt/dd) ---');
  $list('.list-filter dl, .attr-list dl, [class*="filter"] dl').each((i, el) => {
    if (i >= 5) return;
    const dt = $list(el).find('dt').text().trim();
    const ddCount = $list(el).find('dd').length;
    console.log(`  ${dt}: ${ddCount}개 옵션`);
  });

  // 필터 ul/li 구조 찾기
  console.log('\n--- 필터 영역 (ul/li) ---');
  $list('.list-filter-attr, .attr-area, [class*="attr"]').each((i, el) => {
    if (i >= 10) return;
    const className = $list(el).attr('class');
    const items = $list(el).find('li, label, a').slice(0, 5).map((_, item) => $list(item).text().trim().slice(0, 20)).get();
    if (items.length > 0) {
      console.log(`  [${className}]: ${items.join(', ')}`);
    }
  });

  // JavaScript에서 필터 데이터 추출
  console.log('\n--- JavaScript 필터 변수 ---');
  $list('script').each((i, el) => {
    const content = $list(el).html() || '';

    // attrGrpList, attrList 등 찾기
    const patterns = [
      { name: 'attrGrpList', regex: /attrGrpList\s*[=:]\s*(\[[\s\S]*?\]);?/ },
      { name: 'attrList', regex: /attrList\s*[=:]\s*(\[[\s\S]*?\]);?/ },
      { name: 'brandList', regex: /brandList\s*[=:]\s*(\[[\s\S]*?\]);?/ },
      { name: 'filterData', regex: /filterData\s*[=:]\s*(\{[\s\S]*?\});?/ },
      { name: 'categoryAttr', regex: /categoryAttr\s*[=:]\s*(\{[\s\S]*?\});?/ },
    ];

    for (const p of patterns) {
      const match = content.match(p.regex);
      if (match) {
        console.log(`\n✅ ${p.name} 발견!`);
        console.log(`   미리보기: ${match[1].slice(0, 500)}...`);

        // JSON 파싱 시도
        try {
          const data = JSON.parse(match[1]);
          console.log(`   파싱 성공! 항목 수: ${Array.isArray(data) ? data.length : Object.keys(data).length}`);
          if (Array.isArray(data) && data.length > 0) {
            console.log(`   첫 항목:`, JSON.stringify(data[0]).slice(0, 200));
          }
        } catch (e) {
          console.log(`   파싱 실패 (eval 필요할 수 있음)`);
        }
      }
    }
  });

  // 3. HTML 파일로 저장 (디버깅용)
  fs.writeFileSync('/tmp/enuri_detail.html', detailHtml);
  fs.writeFileSync('/tmp/enuri_list.html', listHtml);
  console.log('\n\n💾 HTML 저장: /tmp/enuri_detail.html, /tmp/enuri_list.html');
}

main().catch(console.error);
