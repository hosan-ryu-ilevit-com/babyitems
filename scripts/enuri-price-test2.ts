/**
 * 에누리 몰별 가격 리스트 크롤링 테스트 v2
 * 테이블 구조 상세 분석
 */

import puppeteer from 'puppeteer';
import { load } from 'cheerio';

interface MallPrice {
  mallName: string;
  mallLogo?: string;
  productName: string;
  price: number;
  deliveryFee: number;
  totalPrice: number;
  productUrl: string;
}

async function testPriceListCrawl(modelNo: string): Promise<MallPrice[]> {
  console.log(`\n📦 상품 가격 리스트 테스트 v2: modelNo=${modelNo}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const html = await page.content();
  const $ = load(html);
  const prices: MallPrice[] = [];

  // 1. table.lowest-mall 분석 (최저가 몰 리스트)
  console.log('=== table.lowest-mall 분석 ===\n');
  $('table.lowest-mall tr').each((i, tr) => {
    if (i === 0) return; // 헤더 스킵

    const $tr = $(tr);
    const cells = $tr.find('td');

    console.log(`[행 ${i}] 셀 ${cells.length}개`);
    cells.each((j, td) => {
      const text = $(td).text().trim().slice(0, 50);
      const className = $(td).attr('class') || '';
      console.log(`   [${j}] (${className}) ${text}`);
    });
    console.log('');
  });

  // 2. table.tb-compare__list 분석 (가격 비교 리스트)
  console.log('\n=== table.tb-compare__list 분석 ===\n');
  $('table.tb-compare__list tr').each((i, tr) => {
    if (i >= 5) return; // 처음 5개만

    const $tr = $(tr);
    const cells = $tr.find('td, th');

    console.log(`[행 ${i}] 셀 ${cells.length}개`);
    cells.each((j, td) => {
      const text = $(td).text().trim().replace(/\s+/g, ' ').slice(0, 60);
      const className = $(td).attr('class') || '';
      console.log(`   [${j}] (${className}) ${text}`);
    });
    console.log('');
  });

  // 3. 실제 파싱 시도 (tb-compare__list)
  console.log('\n=== 실제 파싱 ===\n');
  $('table.tb-compare__list tbody tr').each((i, tr) => {
    const $tr = $(tr);

    // 몰 이름 (이미지 alt 또는 텍스트)
    const mallImg = $tr.find('img.logo, img[alt]').first();
    const mallName = mallImg.attr('alt') || $tr.find('.mall-name, .shop').first().text().trim() || '';
    const mallLogo = mallImg.attr('src') || '';

    // 상품명
    const productName = $tr.find('.product-name, .prd-name, td:nth-child(2)').text().trim();

    // 가격 (개별 셀에서)
    const priceCell = $tr.find('td.price, td:contains("원")').first();
    const priceText = priceCell.text().replace(/[^0-9]/g, '');
    const price = parseInt(priceText) || 0;

    // 배송비
    const deliveryCell = $tr.find('td.delivery, td:contains("배송")');
    const deliveryText = deliveryCell.text().replace(/[^0-9]/g, '');
    const deliveryFee = parseInt(deliveryText) || 0;

    // 링크
    const link = $tr.find('a').first().attr('href') || '';

    if (mallName || price > 0) {
      console.log(`[${i + 1}] ${mallName || '(몰명없음)'}`);
      console.log(`    상품: ${productName.slice(0, 40)}`);
      console.log(`    가격: ${price.toLocaleString()}원`);
      console.log(`    배송: ${deliveryFee}원`);
      console.log(`    링크: ${link.slice(0, 50)}`);
      console.log('');

      if (price > 10000 && price < 10000000) { // 유효한 가격만
        prices.push({
          mallName,
          mallLogo,
          productName,
          price,
          deliveryFee,
          totalPrice: price + deliveryFee,
          productUrl: link,
        });
      }
    }
  });

  // 4. HTML 직접 확인 (디버깅용)
  console.log('\n=== 가격 테이블 HTML 샘플 ===\n');
  const priceTableHtml = $('table.tb-compare__list').html()?.slice(0, 2000) || '없음';
  console.log(priceTableHtml);

  await browser.close();

  console.log(`\n✅ 총 ${prices.length}개 유효한 가격 정보 수집`);
  return prices;
}

// 실행
testPriceListCrawl('46256330').catch(console.error);
