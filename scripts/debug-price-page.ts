/**
 * 다나와 가격 페이지 HTML 분석
 */
import puppeteer from 'puppeteer';
import { load } from 'cheerio';
import * as fs from 'fs';

async function debugPricePage(pcode: string) {
  console.log(`\n=== Debugging ${pcode} ===`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  );

  const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // 스크롤 및 대기
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 가격 탭 클릭 시도
  try {
    const tabs = await page.$$('.tab_item a, .product_tab a, .detail_tab a');
    for (const tab of tabs) {
      const text = await page.evaluate((el) => el.textContent, tab);
      console.log(`  Tab found: "${text}"`);
      if (text?.includes('가격')) {
        await tab.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('  Clicked 가격 tab!');
        break;
      }
    }
  } catch (e) {
    console.log('  No tab clicked');
  }

  // HTML 가져오기
  const html = await page.content();
  const $ = load(html);

  // 파일로 저장 (디버깅용)
  fs.writeFileSync(`/tmp/danawa_${pcode}.html`, html);
  console.log(`  HTML saved to /tmp/danawa_${pcode}.html`);

  // 가격 관련 셀렉터 테스트
  const selectors = [
    '.mall_list tbody tr',
    '.diff_item',
    '.ProductList tr',
    '.lowest_price em.prc',
    '.lowest_area .lwst_prc',
    '.bnft_price em',
    '.price_sect em',
    '#priceCompareWrap',
    '.online_list tbody tr',
    '.lowest_sect',
    '.price_wrap',
  ];

  console.log('\n  [셀렉터 테스트]');
  for (const sel of selectors) {
    const count = $(sel).length;
    if (count > 0) {
      console.log(`  ✅ ${sel}: ${count}개`);
      // 첫 번째 요소 내용 미리보기
      const text = $(sel).first().text().trim().slice(0, 50);
      if (text) console.log(`     → "${text}..."`);
    } else {
      console.log(`  ❌ ${sel}: 없음`);
    }
  }

  // 가격 정보가 있는 영역 찾기
  console.log('\n  [가격 텍스트 검색]');
  const pricePattern = /(\d{1,3}(,\d{3})+)원/g;
  const matches = html.match(pricePattern);
  if (matches) {
    const uniquePrices = [...new Set(matches)].slice(0, 10);
    console.log(`  가격 패턴 발견: ${uniquePrices.join(', ')}`);
  } else {
    console.log('  가격 패턴 없음');
  }

  await browser.close();
}

debugPricePage('19451186').catch(console.error);
