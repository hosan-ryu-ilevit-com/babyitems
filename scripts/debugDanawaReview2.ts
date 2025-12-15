/**
 * 다나와 쇼핑몰 리뷰 탭 HTML 구조 디버그 스크립트
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

async function debugDanawaReviewPage(pcode: string): Promise<void> {
  console.log(`\n🔍 다나와 쇼핑몰 리뷰 탭 디버깅: pcode=${pcode}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 리뷰 탭으로 바로 이동
    const url = `https://prod.danawa.com/info/?pcode=${pcode}#bookmark_cm_opinion`;
    console.log(`📡 페이지 로드 중: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 리뷰 영역으로 스크롤
    await page.evaluate(() => {
      const reviewSection = document.querySelector('#bookmark_cm_opinion, #opinionArea');
      if (reviewSection) {
        reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 쇼핑몰 상품리뷰 탭 클릭
    console.log('\n📌 쇼핑몰 상품리뷰 탭 클릭...');
    const tabClicked = await page.evaluate(() => {
      const tab = document.querySelector('#danawa-prodBlog-companyReview-button-tab-companyReview');
      if (tab) {
        (tab as HTMLElement).click();
        return true;
      }
      return false;
    });
    console.log(`탭 클릭 결과: ${tabClicked}`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    // 리뷰 영역 HTML 분석
    console.log('\n📌 리뷰 영역 HTML 구조 분석...');

    const reviewInfo = await page.evaluate(() => {
      const result: {
        tabContent: string;
        reviewCount: number;
        reviewItems: { html: string; classes: string }[];
        allClasses: string[];
      } = {
        tabContent: '',
        reviewCount: 0,
        reviewItems: [],
        allClasses: [],
      };

      // 쇼핑몰 리뷰 탭 콘텐츠 영역 찾기
      const tabContent = document.querySelector('.danawa-prodBlog-companyReview-tabContent-companyReview');
      if (tabContent) {
        result.tabContent = tabContent.innerHTML.substring(0, 2000);

        // 리뷰 아이템들 찾기
        const items = tabContent.querySelectorAll('[class*="item"], li, .cmt');
        result.reviewCount = items.length;

        items.forEach((item, idx) => {
          if (idx < 3) {
            result.reviewItems.push({
              html: item.outerHTML.substring(0, 1000),
              classes: item.className,
            });
          }
        });
      }

      // 모든 리뷰 관련 클래스 찾기
      const allElements = document.querySelectorAll('[class*="companyReview"]');
      const classSet = new Set<string>();
      allElements.forEach(el => {
        el.className.split(' ').forEach(cls => {
          if (cls.includes('companyReview') || cls.includes('review') || cls.includes('cmt')) {
            classSet.add(cls);
          }
        });
      });
      result.allClasses = Array.from(classSet).slice(0, 30);

      return result;
    });

    console.log('\n리뷰 정보:');
    console.log(`- 발견된 아이템 수: ${reviewInfo.reviewCount}`);
    console.log(`- 관련 클래스들: ${reviewInfo.allClasses.join(', ')}`);

    if (reviewInfo.reviewItems.length > 0) {
      console.log('\n📝 샘플 리뷰 아이템 HTML:');
      reviewInfo.reviewItems.forEach((item, idx) => {
        console.log(`\n[아이템 ${idx + 1}] 클래스: ${item.classes}`);
        console.log(item.html.substring(0, 500));
      });
    }

    // 전체 HTML 저장
    const html = await page.content();
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const htmlPath = path.join(outputDir, `debug_danawa_review_tab_${pcode}.html`);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`\n💾 HTML 저장됨: ${htmlPath}`);

    // 스크린샷 저장
    const screenshotPath = path.join(outputDir, `debug_danawa_review_tab_${pcode}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 스크린샷 저장됨: ${screenshotPath}`);

  } finally {
    await browser.close();
  }
}

// 실행
const pcode = process.argv[2] || '10371804';
debugDanawaReviewPage(pcode).catch(console.error);
