/**
 * 에누리 가격 크롤러
 * Puppeteer 기반 - 쇼핑몰별 가격 리스트 추출
 */

import { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import { EnuriMallPrice, EnuriPriceResult } from '../../types/enuri';
import { createBrowser } from './review-crawler';

// =====================================================
// 가격 파싱 함수
// =====================================================

type CheerioAPI = ReturnType<typeof load>;

function parseEnuriPrices($: CheerioAPI): EnuriMallPrice[] {
  const prices: EnuriMallPrice[] = [];

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
    let deliveryStr = '무료';
    if (deliText.includes('무료') || deliText === '-') {
      deliveryFee = 0;
      deliveryStr = '무료';
    } else {
      const deliMatch = deliText.match(/(\d{1,3}(,\d{3})*)/);
      deliveryFee = deliMatch ? parseInt(deliMatch[1].replace(/,/g, '')) : 0;
      deliveryStr = deliveryFee > 0 ? `${deliveryFee.toLocaleString()}원` : '무료';
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

  return prices;
}

// =====================================================
// 메인 함수
// =====================================================

export async function fetchEnuriPrices(
  modelNo: string,
  sharedBrowser?: Browser
): Promise<EnuriPriceResult> {
  const result: EnuriPriceResult = {
    modelNo,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    lowestLink: null,
    mallPrices: [],
    mallCount: 0,
    priceMin: null,
    priceMax: null,
    crawledAt: new Date(),
    success: false,
  };

  let browser: Browser | null = null;
  const ownBrowser = !sharedBrowser;

  try {
    browser = sharedBrowser || await createBrowser();
    const page = await browser.newPage();

    // 불필요한 리소스 차단
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'media', 'image'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 가격 테이블 로드 대기
    await new Promise(resolve => setTimeout(resolve, 1500));

    const html = await page.content();
    const $ = load(html);

    // 가격 파싱
    result.mallPrices = parseEnuriPrices($);
    result.mallCount = result.mallPrices.length;

    // 최저가 정보 설정
    if (result.mallPrices.length > 0) {
      // totalPrice 기준 정렬
      const sorted = [...result.mallPrices].sort((a, b) => a.totalPrice - b.totalPrice);
      const lowest = sorted[0];

      result.lowestPrice = lowest.price;
      result.lowestMall = lowest.mallName;
      result.lowestDelivery = lowest.deliveryFee === 0 ? '무료' : `${lowest.deliveryFee.toLocaleString()}원`;
      result.lowestLink = lowest.productUrl;

      // 가격 범위
      result.priceMin = sorted[0].price;
      result.priceMax = sorted[sorted.length - 1].price;
    }

    result.success = true;
    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    if (ownBrowser && browser) {
      try {
        await browser.close();
      } catch {
        // 무시
      }
    }
  }

  return result;
}
