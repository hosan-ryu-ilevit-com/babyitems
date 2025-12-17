/**
 * 에누리 몰별 가격 리스트 크롤링 - 정확한 파싱 버전
 */

import puppeteer from 'puppeteer';
import { load } from 'cheerio';

interface MallPrice {
  mallName: string;
  mallLogo?: string;
  productName: string;
  price: number;
  cardPrice?: number;    // 카드 할인가
  deliveryFee: number;
  totalPrice: number;
  productUrl: string;
  earn?: number;         // 적립금
}

async function crawlEnuriPrices(modelNo: string): Promise<MallPrice[]> {
  console.log(`\n📦 에누리 가격 크롤링: modelNo=${modelNo}\n`);

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

  // table.tb-compare__list 파싱
  $('table.tb-compare__list tbody tr').each((i, tr) => {
    const $tr = $(tr);

    // 쇼핑몰 (이미지 alt에서)
    const shopCell = $tr.find('.tb-col--shop');
    const mallImg = shopCell.find('img').first();
    const mallName = mallImg.attr('alt')?.trim() || shopCell.text().trim() || '';
    const mallLogo = mallImg.attr('src') || '';

    // 상품명
    const nameCell = $tr.find('.tb-col--name');
    const productName = nameCell.find('a').first().text().trim() ||
                       nameCell.text().trim().split('\n')[0]?.trim() || '';

    // 가격 (첫 번째 숫자만)
    const priceCell = $tr.find('.tb-col--price');
    const priceHtml = priceCell.html() || '';

    // 첫 번째 가격 추출 (정규식으로 첫 번째 금액만)
    const priceMatch = priceHtml.match(/(\d{1,3}(,\d{3})+)\s*원/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;

    // 카드 할인가 (있으면)
    const cardMatch = priceHtml.match(/카드.*?(\d{1,3}(,\d{3})+)\s*원/);
    const cardPrice = cardMatch ? parseInt(cardMatch[1].replace(/,/g, '')) : undefined;

    // 배송비
    const deliCell = $tr.find('.tb-col--deli');
    const deliText = deliCell.text().trim();
    let deliveryFee = 0;
    if (deliText.includes('무료') || deliText === '-') {
      deliveryFee = 0;
    } else {
      const deliMatch = deliText.match(/(\d{1,3}(,\d{3})*)/);
      deliveryFee = deliMatch ? parseInt(deliMatch[1].replace(/,/g, '')) : 0;
    }

    // 적립금
    const earnCell = $tr.find('.tb-col--earn');
    const earnMatch = earnCell.text().match(/(\d{1,3}(,\d{3})*)/);
    const earn = earnMatch ? parseInt(earnMatch[1].replace(/,/g, '')) : undefined;

    // 링크
    const link = $tr.find('a').first().attr('href') || '';
    const productUrl = link.startsWith('/') ? `https://www.enuri.com${link}` : link;

    if (price > 10000 && price < 10000000) {
      prices.push({
        mallName,
        mallLogo: mallLogo.startsWith('//') ? 'https:' + mallLogo : mallLogo,
        productName,
        price,
        cardPrice,
        deliveryFee,
        totalPrice: price + deliveryFee,
        productUrl,
        earn,
      });
    }
  });

  await browser.close();

  // 결과 출력
  console.log(`✅ ${prices.length}개 가격 정보 수집\n`);
  console.log('─'.repeat(100));
  console.log(`${'No'.padStart(3)} | ${'쇼핑몰'.padEnd(15)} | ${'상품명'.padEnd(35)} | ${'가격'.padStart(12)} | ${'카드가'.padStart(10)} | 배송비`);
  console.log('─'.repeat(100));

  prices.forEach((p, i) => {
    const mall = p.mallName.slice(0, 13) || '(이미지)';
    const name = p.productName.length > 33 ? p.productName.slice(0, 33) + '..' : p.productName;
    const cardStr = p.cardPrice ? `${p.cardPrice.toLocaleString()}원` : '-';
    console.log(
      `${String(i + 1).padStart(3)} | ${mall.padEnd(15)} | ${name.padEnd(35)} | ${(p.price.toLocaleString() + '원').padStart(12)} | ${cardStr.padStart(10)} | ${p.deliveryFee === 0 ? '무료' : p.deliveryFee.toLocaleString() + '원'}`
    );
  });
  console.log('─'.repeat(100));

  return prices;
}

// 실행
crawlEnuriPrices('46256330').catch(console.error);
