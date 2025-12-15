/**
 * 다나와 리뷰 페이지 HTML 구조 디버그 스크립트
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

async function debugDanawaReviewPage(pcode: string): Promise<void> {
  console.log(`\n🔍 다나와 리뷰 페이지 디버깅: pcode=${pcode}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
    console.log(`📡 페이지 로드 중: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 스크롤 다운
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 리뷰 탭 찾기
    console.log('\n📌 탭 버튼 찾기...');
    const tabs = await page.$$eval('.tab_item a, .product_tab a, [class*="tab"] a', (els) =>
      els.map(el => ({ text: el.textContent?.trim(), href: el.getAttribute('href'), id: el.id, class: el.className }))
    );
    console.log('탭 목록:', JSON.stringify(tabs, null, 2));

    // 리뷰/의견 탭 클릭
    console.log('\n📌 리뷰 탭 클릭 시도...');
    const clicked = await page.evaluate(() => {
      const selectors = [
        '#bookmark_cm_opinion',
        'a[href*="opinion"]',
        'a[href*="review"]',
        '.tab_item a',
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent || '';
          if (text.includes('리뷰') || text.includes('사용기') || text.includes('의견')) {
            (el as HTMLElement).click();
            return { selector: sel, text };
          }
        }
      }
      return null;
    });
    console.log('클릭 결과:', clicked);

    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 리뷰 영역 HTML 추출
    console.log('\n📌 리뷰 영역 분석...');
    const reviewAreaInfo = await page.evaluate(() => {
      const areas = [
        '#opinionArea',
        '.danawa-prodBlog-opinion-listWrap',
        '.opinion_list',
        '.review_list',
        '.cmt_list',
        '[class*="opinion"]',
        '[class*="review"]',
      ];

      const results: { selector: string; found: boolean; childCount: number; sample: string }[] = [];

      for (const sel of areas) {
        const el = document.querySelector(sel);
        if (el) {
          results.push({
            selector: sel,
            found: true,
            childCount: el.children.length,
            sample: el.innerHTML.substring(0, 500),
          });
        }
      }

      return results;
    });

    console.log('리뷰 영역:', JSON.stringify(reviewAreaInfo, null, 2));

    // 전체 HTML 저장
    const html = await page.content();
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const htmlPath = path.join(outputDir, `debug_danawa_${pcode}.html`);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`\n💾 HTML 저장됨: ${htmlPath}`);

    // 리뷰 관련 요소들 찾기
    console.log('\n📌 리뷰 아이템 선택자 테스트...');
    const reviewSelectors = [
      '.danawa-prodBlog-opinion-list-item',
      '.danawa-prodBlog-companyReview-cl498-item',
      '.opinion_list li',
      '.review_item',
      '.cmt_item',
      'li[class*="opinion"]',
      'li[class*="review"]',
      'div[class*="review"]',
    ];

    for (const sel of reviewSelectors) {
      const count = await page.$$eval(sel, els => els.length);
      if (count > 0) {
        console.log(`  ✅ ${sel}: ${count}개 발견`);
        // 첫 번째 아이템 HTML 출력
        const firstItem = await page.$eval(sel, el => el.outerHTML.substring(0, 800));
        console.log(`     Sample: ${firstItem.substring(0, 300)}...`);
      }
    }

    // AJAX 요청 모니터링을 위한 네트워크 분석
    console.log('\n📌 다나와 리뷰 AJAX URL 패턴 확인...');
    const scripts = await page.$$eval('script', (els) =>
      els.map(el => el.innerHTML).filter(s => s.includes('opinion') || s.includes('review'))
    );
    if (scripts.length > 0) {
      console.log('관련 스크립트 발견:', scripts.length, '개');
      scripts.slice(0, 2).forEach((s, i) => {
        console.log(`\n[스크립트 ${i + 1}]:`, s.substring(0, 500));
      });
    }

  } finally {
    await browser.close();
  }
}

// 실행
const pcode = process.argv[2] || '10371804';
debugDanawaReviewPage(pcode).catch(console.error);
