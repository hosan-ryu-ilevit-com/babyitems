/**
 * 에누리 몰별 가격 리스트 크롤링 테스트
 */

import puppeteer from 'puppeteer';
import { load } from 'cheerio';

interface MallPrice {
  mallName: string;
  price: number;
  deliveryFee?: number;
  totalPrice?: number;
  productUrl?: string;
  mallLogo?: string;
}

async function testPriceListCrawl(modelNo: string): Promise<MallPrice[]> {
  console.log(`\n📦 상품 가격 리스트 테스트: modelNo=${modelNo}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
  console.log(`URL: ${url}\n`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // 가격 영역으로 스크롤
  await page.evaluate(() => {
    const priceSection = document.querySelector('[class*="price"], [class*="mall"], .lowest-price');
    if (priceSection) {
      priceSection.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const html = await page.content();
  const $ = load(html);
  const prices: MallPrice[] = [];

  console.log('🔍 가격 리스트 영역 분석:\n');

  // 1. 가격 테이블/리스트 찾기
  const priceSelectors = [
    '.model-price-list tbody tr',
    '.price-list li',
    '.mall-list li',
    '[class*="price-item"]',
    '[class*="mall-item"]',
    '.tb-compare tbody tr',
    '#lowPriceList li',
    '.lowest-list li',
  ];

  for (const selector of priceSelectors) {
    const items = $(selector);
    if (items.length > 0) {
      console.log(`✅ ${selector}: ${items.length}개 항목\n`);

      items.slice(0, 10).each((i, el) => {
        const $item = $(el);

        // 몰 이름
        const mallName = $item.find('.mall, .shop, [class*="mall"], [class*="shop"], img[alt]').first().attr('alt') ||
                        $item.find('.mall, .shop, [class*="mall-name"]').first().text().trim() ||
                        $item.find('a').first().text().trim();

        // 가격
        const priceText = $item.find('.price, [class*="price"], .prc').text().replace(/[^0-9]/g, '');
        const price = parseInt(priceText) || 0;

        // 배송비
        const deliveryText = $item.find('.delivery, .ship, [class*="delivery"]').text().replace(/[^0-9]/g, '');
        const deliveryFee = parseInt(deliveryText) || 0;

        // 링크
        const link = $item.find('a').first().attr('href') || '';

        if (mallName && price > 0) {
          prices.push({ mallName, price, deliveryFee, productUrl: link });
          console.log(`   [${i + 1}] ${mallName}: ${price.toLocaleString()}원 (배송: ${deliveryFee}원)`);
        }
      });

      if (prices.length > 0) break;
    }
  }

  // 2. 대안: JSON-LD에서 offers 추출
  if (prices.length === 0) {
    console.log('\n📋 JSON-LD offers 확인:\n');

    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html() || '');
        if (data.offers) {
          console.log('   offers 구조:', JSON.stringify(data.offers).slice(0, 300));
        }
      } catch (e) {}
    });
  }

  // 3. 가격 관련 클래스 디버깅
  if (prices.length === 0) {
    console.log('\n🔎 가격 관련 클래스 검색:\n');

    const priceClasses = new Set<string>();
    $('[class]').each((i, el) => {
      if (i > 1000) return;
      const cls = $(el).attr('class') || '';
      if (cls.includes('price') || cls.includes('mall') || cls.includes('shop') || cls.includes('lowest')) {
        priceClasses.add(cls);
      }
    });
    console.log([...priceClasses].slice(0, 30).join('\n'));
  }

  // 4. 테이블 구조 확인
  console.log('\n📊 테이블 구조 확인:\n');
  $('table').each((i, table) => {
    if (i >= 5) return;
    const className = $(table).attr('class') || $(table).attr('id') || '(클래스 없음)';
    const rowCount = $(table).find('tr').length;
    console.log(`   table.${className}: ${rowCount}개 행`);
  });

  await browser.close();

  console.log(`\n✅ 총 ${prices.length}개 가격 정보 수집`);
  return prices;
}

// 실행
testPriceListCrawl('46256330').catch(console.error);
