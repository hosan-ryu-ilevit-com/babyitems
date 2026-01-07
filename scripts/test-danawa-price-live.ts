/**
 * 다나와 가격 크롤링 라이브 테스트
 *
 * 실행: npx tsx scripts/test-danawa-price-live.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';

interface MallPrice {
  mall: string;
  price: number;
  delivery: string;
  seller?: string;
  link?: string;
}

interface PriceResult {
  pcode: string;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  mallPrices: MallPrice[];
  success: boolean;
  error?: string;
}

async function crawlDanawaPrice(pcode: string): Promise<PriceResult> {
  const result: PriceResult = {
    pcode,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    mallPrices: [],
    success: false,
  };

  let browser: Browser | null = null;

  try {
    console.log(`\n🔍 [${pcode}] 크롤링 시작...`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // 리소스 차단 (속도 최적화)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 상품 페이지 접속
    const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
    console.log(`   📍 URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 스크롤해서 가격비교 탭 영역 로딩
    await page.evaluate(() => window.scrollTo(0, 500));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 가격비교 탭 클릭
    try {
      const tabs = await page.$$('.tab_item a, .product_tab a, #priceCompareWrap a');
      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        if (text?.includes('가격')) {
          console.log(`   📌 가격비교 탭 클릭`);
          await tab.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }
    } catch (e) {
      console.log(`   ⚠️ 탭 클릭 실패, 계속 진행`);
    }

    // 추가 대기 및 스크롤
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    // 상품명 확인
    const productName = $('.prod_tit h3, .top_summary h2, .prod_name').first().text().trim();
    console.log(`   📦 상품명: ${productName.slice(0, 50)}...`);

    // 쇼핑몰별 가격 목록 추출
    const mallPrices: MallPrice[] = [];

    // 다나와 가격비교 테이블에서 추출
    $('.lowPrice_wrap .mall_list tbody tr, .diff_item, .ProductList tr, .lowList tbody tr').each((_, row) => {
      const $row = $(row);

      // 쇼핑몰명 추출
      let mall: string | null = null;

      // 1. 이미지 alt에서 쇼핑몰명
      const imgAlt = $row.find('img').first().attr('alt');
      if (imgAlt && imgAlt.length > 1 && !['상품이미지', '이미지'].includes(imgAlt)) {
        mall = imgAlt;
      }

      // 2. 쇼핑몰명 링크 텍스트
      if (!mall) {
        mall = $row.find('a.mall_name, .logo_over img, td.mall a').first().attr('alt') ||
               $row.find('a.mall_name, td.mall a').first().text().trim() || null;
      }

      // 3. data 속성
      if (!mall) {
        mall = $row.attr('data-mall-name') || $row.find('[data-mall-name]').attr('data-mall-name') || null;
      }

      // 가격 추출
      const priceText = $row.find('.price_sect em, .prc, em.prc, .price em, .txt_prc').first().text().replace(/[^\d]/g, '');
      const price = priceText ? parseInt(priceText, 10) : null;

      // 배송비
      const delivery = $row.find('.ship, .delivery, .dlv_info').first().text().trim() || '';

      if (price && price > 1000) {
        mallPrices.push({
          mall: mall || '알 수 없음',
          price,
          delivery,
        });
      }
    });

    // 정렬
    mallPrices.sort((a, b) => a.price - b.price);

    // 최저가 영역에서 fallback 시도
    if (mallPrices.length === 0) {
      console.log(`   🔄 쇼핑몰 목록 없음, 최저가 영역에서 추출 시도...`);

      const lowestElem = $('.lowest_price em.prc, .lwst_prc em, .bnft_price em.prc, .price_sect .prc').first();
      const priceText = lowestElem.text().replace(/[^\d]/g, '');

      if (priceText) {
        const price = parseInt(priceText, 10);
        const mall = $('.lowest_price .mall_name, .logo_over img').first().attr('alt') ||
                     $('.lowest_price .mall_name').first().text().trim() || '최저가';

        mallPrices.push({
          mall,
          price,
          delivery: '',
        });
      }
    }

    // 결과 설정
    if (mallPrices.length > 0) {
      result.lowestPrice = mallPrices[0].price;
      result.lowestMall = mallPrices[0].mall;
      result.lowestDelivery = mallPrices[0].delivery;
      result.mallPrices = mallPrices;
      result.success = true;
    }

    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`   ❌ Error: ${result.error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('다나와 가격 크롤링 테스트');
  console.log('='.repeat(60));

  // 테스트 상품 코드들
  const testPcodes = [
    '74805527',   // 사용자가 제공한 예시
    '26489594',   // 부가부 드래곤플라이 (유모차)
    '20799044',   // 리안 그램플러스 유모차
  ];

  for (const pcode of testPcodes) {
    const result = await crawlDanawaPrice(pcode);

    console.log('\n' + '-'.repeat(60));
    if (result.success) {
      console.log(`✅ [${pcode}] 성공!`);
      console.log(`   최저가: ${result.lowestPrice?.toLocaleString()}원 (${result.lowestMall})`);
      console.log(`   배송: ${result.lowestDelivery || '정보없음'}`);
      console.log(`   쇼핑몰 수: ${result.mallPrices.length}개`);

      if (result.mallPrices.length > 0) {
        console.log('\n   📋 쇼핑몰별 가격:');
        result.mallPrices.slice(0, 5).forEach((mp, i) => {
          console.log(`      ${i + 1}. ${mp.mall}: ${mp.price.toLocaleString()}원 ${mp.delivery ? `(${mp.delivery})` : ''}`);
        });
        if (result.mallPrices.length > 5) {
          console.log(`      ... 외 ${result.mallPrices.length - 5}개`);
        }
      }
    } else {
      console.log(`❌ [${pcode}] 실패: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('테스트 완료');
}

main().catch(console.error);
