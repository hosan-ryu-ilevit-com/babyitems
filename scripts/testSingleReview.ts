import 'dotenv/config';
import puppeteer from 'puppeteer';
import { load } from 'cheerio';

const pcode = '10863147'; // TP-LINK Tapo C200

async function test() {
  console.log(`\n테스트: pcode ${pcode}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const url = `https://prod.danawa.com/info/?pcode=${pcode}#bookmark_cm_opinion`;
  console.log(`URL: ${url}\n`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

  // 리뷰 영역으로 스크롤
  await page.evaluate(() => {
    const reviewSection = document.querySelector('#bookmark_cm_opinion, #opinionArea');
    if (reviewSection) reviewSection.scrollIntoView();
    else window.scrollTo(0, 1000);
  });
  await new Promise(r => setTimeout(r, 2000));

  // 쇼핑몰 리뷰 탭 클릭
  await page.evaluate(() => {
    const tab = document.querySelector('#danawa-prodBlog-companyReview-button-tab-companyReview');
    if (tab) (tab as HTMLElement).click();
  });
  await new Promise(r => setTimeout(r, 2000));

  const html = await page.content();
  const $ = load(html);

  // 리뷰 선택자들 테스트
  const selectors = [
    '.rvw_list > li',
    'li.danawa-prodBlog-companyReview-clazz-more',
    '.danawa-prodBlog-companyReview-cl498-item',
    '.cmt_item',
    '.review_item',
    '.cmt_list > li',
    '.opinion_list > li',
  ];

  console.log('=== 선택자 테스트 ===');
  for (const sel of selectors) {
    const count = $(sel).length;
    if (count > 0) {
      console.log(`✅ ${sel}: ${count}개`);
    }
  }

  // 페이지 전체에서 리뷰 관련 영역 확인
  console.log('\n=== 리뷰 관련 영역 확인 ===');

  // 리뷰 탭 존재 확인
  const reviewTab = $('#danawa-prodBlog-companyReview-button-tab-companyReview');
  console.log('쇼핑몰 리뷰 탭:', reviewTab.length ? '있음' : '없음');

  // 다른 탭들
  const tabs = $('[class*="tab"], [id*="tab"]').map((_, el) => $(el).attr('id') || $(el).attr('class')).get();
  console.log('탭들:', tabs.slice(0, 10));

  // 리뷰 영역 ID 확인
  const reviewAreas = $('[id*="review"], [id*="opinion"], [class*="review"], [class*="opinion"]');
  console.log('리뷰 영역 수:', reviewAreas.length);

  // cm_opinion 영역 확인 (다나와 커뮤니티 리뷰)
  const cmOpinion = $('#bookmark_cm_opinion, #opinionArea');
  console.log('\ncm_opinion 영역:', cmOpinion.length ? '있음' : '없음');

  // 그 안의 리뷰 아이템들
  const opinionItems = $('#bookmark_cm_opinion li, .opinion_list li, .user_review_list li');
  console.log('opinion 아이템 수:', opinionItems.length);

  // 첫번째 아이템 HTML
  if (opinionItems.length) {
    console.log('\n첫 아이템 HTML (500자):');
    console.log(opinionItems.first().html()?.substring(0, 500));
  }

  // productOpinion 탭 클릭 (다나와 의견)
  const clicked = await page.evaluate(() => {
    // 사용자 리뷰 탭 찾기
    const tabs = document.querySelectorAll('.sub_tab a, .tab_item a');
    for (const tab of tabs) {
      const text = tab.textContent || '';
      if (text.includes('사용자 리뷰') || text.includes('리뷰') || text.includes('의견')) {
        console.log('클릭:', text);
        (tab as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log('\n클릭한 탭:', clicked);
  await new Promise(r => setTimeout(r, 2000));

  // 다시 HTML 가져오기
  const html2 = await page.content();
  const $2 = load(html2);

  // 리뷰 아이템 다시 찾기
  const reviewItems2 = $2('.opinion_item, .review_item, .cmt_item, [class*="opinion"] li, [class*="review"] li');
  console.log('리뷰 아이템 수:', reviewItems2.length);

  if (reviewItems2.length) {
    console.log('\n첫 리뷰 HTML:');
    console.log(reviewItems2.first().html()?.substring(0, 800));
  }

  // 페이지 타이틀 확인
  console.log('페이지 타이틀:', $('title').text());

  // 제품명 확인
  console.log('제품명:', $('.prod_tit, .product_title, h1').first().text().trim().substring(0, 50));

  await browser.close();
  console.log('\n완료');
}

test().catch(console.error);
