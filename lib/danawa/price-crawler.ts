/**
 * 다나와 가격 전용 크롤러
 * 
 * 목적: pcode로 가격 정보만 크롤링 (메타데이터 X)
 * 용도: 주간 배치 업데이트
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';

// =====================================================
// 타입 정의
// =====================================================

export interface MallPrice {
  mall: string;           // 쇼핑몰명
  price: number;          // 판매가
  delivery: string;       // 배송비 (예: "무료배송", "3,000원")
  seller?: string;        // 판매자명
  link?: string;          // 상품 링크
}

export interface DanawaPriceResult {
  pcode: string;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  mallPrices: MallPrice[];
  mallCount: number;
  priceMin: number | null;
  priceMax: number | null;
  updatedAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// 브라우저 설정
// =====================================================

async function createBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

// =====================================================
// 가격 추출 헬퍼
// =====================================================

/**
 * 가격 행에서 정보 추출
 */
function parsePriceRow($row: any, $: ReturnType<typeof load>): MallPrice | null {
  let mall: string | null = null;

  // 1. 이미지 alt/title에서 쇼핑몰명
  $row.find('img').each((_: number, img: any) => {
    const alt = $(img).attr('alt')?.trim();
    const title = $(img).attr('title')?.trim();
    if (alt && alt.length > 1 && !['상품이미지', '이미지'].includes(alt)) {
      mall = alt;
      return false;
    }
    if (title && title.length > 1) {
      mall = title;
      return false;
    }
  });

  // 2. 링크 텍스트에서 쇼핑몰명
  if (!mall) {
    const mallLink = $row.find('a.mall_name, a.logo_over, td.mall a').first();
    if (mallLink.length) {
      mall = mallLink.text().trim();
    }
  }

  // 3. data 속성에서 쇼핑몰명
  if (!mall) {
    const elem = $row.find('[data-mall-name], [data-shop-name]').first();
    if (elem.length) {
      mall = elem.attr('data-mall-name') || elem.attr('data-shop-name') || null;
    }
  }

  // 4. 키워드 패턴 매칭
  if (!mall) {
    const knownMalls = ['쿠팡', '11번가', 'G마켓', '옥션', 'SSG', '롯데', '하이마트', '네이버', '위메프', '티몬', '인터파크'];
    const rowHtml = $row.html() || '';
    for (const m of knownMalls) {
      if (rowHtml.toLowerCase().includes(m.toLowerCase())) {
        mall = m;
        break;
      }
    }
  }

  // 가격 추출
  const priceElem = $row.find('.price_sect em, .prc, .price em, .txt_prc, em.prc').first();
  let price: number | null = null;
  if (priceElem.length) {
    const priceText = priceElem.text().replace(/[^\d]/g, '');
    if (priceText) {
      price = parseInt(priceText, 10);
    }
  }

  if (!price) {
    return null;
  }

  // 배송비 추출
  const deliveryElem = $row.find('.ship, .delivery, .dlv_info, .stxt').first();
  const delivery = deliveryElem.length ? deliveryElem.text().trim() : '';

  // 판매자 추출
  const sellerElem = $row.find('.seller_nm, .seller, .txt_shop').first();
  const seller = sellerElem.length ? sellerElem.text().trim() : undefined;

  // 링크 추출
  const linkElem = $row.find('a[href*="link.danawa"], a[href*="prod.danawa"]').first();
  const link = linkElem.length ? linkElem.attr('href') : undefined;

  return {
    mall: mall || '알 수 없음',
    price,
    delivery,
    seller,
    link,
  };
}

/**
 * 페이지에서 가격 정보만 추출
 */
async function extractPrices(page: Page): Promise<{
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  mallPrices: MallPrice[];
}> {
  let lowestPrice: number | null = null;
  let lowestMall: string | null = null;
  let lowestDelivery: string | null = null;
  let lowestLink: string | null = null;
  const mallPrices: MallPrice[] = [];

  try {
    // 가격비교 탭 클릭 시도
    try {
      await page.evaluate(() => window.scrollTo(0, 500));
      await new Promise(resolve => setTimeout(resolve, 1000));

      const tabs = await page.$$('.tab_item a, .product_tab a');
      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        if (text?.includes('가격')) {
          await tab.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }
    } catch {
      // 탭 클릭 실패해도 계속 진행
    }

    // 가격 영역 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    // 쇼핑몰별 가격 목록 추출
    const priceRows = $('.mall_list tbody tr, .diff_item, .ProductList tr');
    priceRows.each((_: number, row: any) => {
      const priceInfo = parsePriceRow($(row), $);
      if (priceInfo && priceInfo.price) {
        mallPrices.push(priceInfo);
      }
    });

    // Alternative format
    if (mallPrices.length === 0) {
      const altRows = $('.product_list .prod_item, .price_sect .item');
      altRows.each((_: number, row: any) => {
        const priceInfo = parsePriceRow($(row), $);
        if (priceInfo && priceInfo.price) {
          mallPrices.push(priceInfo);
        }
      });
    }

    // 최저가 계산 (정렬 후 첫 번째)
    if (mallPrices.length > 0) {
      mallPrices.sort((a, b) => a.price - b.price);
      const lowest = mallPrices[0];
      lowestPrice = lowest.price;
      lowestMall = lowest.mall;
      lowestDelivery = lowest.delivery;
      lowestLink = lowest.link || null;
    }

    // 요약 영역에서 최저가 시도 (mallPrices가 비어있을 때 fallback)
    if (!lowestPrice) {
      const lowestElem = $('.lowest_price em.prc, .lowest_area .lwst_prc, .bnft_price em').first();
      if (lowestElem.length) {
        const priceText = lowestElem.text().replace(/[^\d]/g, '');
        if (priceText) {
          lowestPrice = parseInt(priceText, 10);
        }
      }

      const lowestMallElem = $('.lowest_price .mall_name, .lowest_area .logo_over img').first();
      if (lowestMallElem.length) {
        if (lowestMallElem.is('img')) {
          lowestMall = lowestMallElem.attr('alt') || null;
        } else {
          lowestMall = lowestMallElem.text().trim() || null;
        }
      }
    }
  } catch (error) {
    console.error(`   ❌ Price extraction error:`, error);
  }

  return { lowestPrice, lowestMall, lowestDelivery, lowestLink, mallPrices };
}

// =====================================================
// 메인 함수
// =====================================================

/**
 * 다나와 상품 가격 정보 크롤링
 * @param pcode 다나와 상품 코드
 * @returns 가격 정보
 */
export async function fetchDanawaPrice(pcode: string): Promise<DanawaPriceResult> {
  const result: DanawaPriceResult = {
    pcode,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    lowestLink: null,
    mallPrices: [],
    mallCount: 0,
    priceMin: null,
    priceMax: null,
    updatedAt: new Date(),
    success: false,
  };

  let browser: Browser | null = null;

  try {
    browser = await createBrowser();
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 가격 정보 추출
    const { lowestPrice, lowestMall, lowestDelivery, lowestLink, mallPrices } = await extractPrices(page);

    // 결과 설정
    result.lowestPrice = lowestPrice;
    result.lowestMall = lowestMall;
    result.lowestDelivery = lowestDelivery;
    result.lowestLink = lowestLink;
    result.mallPrices = mallPrices;
    result.mallCount = mallPrices.length;

    // 가격 범위 계산
    if (mallPrices.length > 0) {
      const prices = mallPrices.map(p => p.price);
      result.priceMin = Math.min(...prices);
      result.priceMax = Math.max(...prices);
    }

    result.success = lowestPrice !== null || mallPrices.length > 0;

    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [${pcode}] Crawl failed:`, result.error);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 브라우저 닫기 실패 무시
      }
    }
  }

  return result;
}

/**
 * 여러 상품 가격 배치 크롤링
 * @param pcodes 상품 코드 배열
 * @param delayMs 요청 간 딜레이 (기본 2초)
 * @param onProgress 진행 콜백
 */
export async function fetchDanawaPricesBatch(
  pcodes: string[],
  delayMs: number = 2000,
  onProgress?: (current: number, total: number, result: DanawaPriceResult) => void
): Promise<DanawaPriceResult[]> {
  const results: DanawaPriceResult[] = [];
  const total = pcodes.length;

  for (let i = 0; i < pcodes.length; i++) {
    const pcode = pcodes[i];
    console.log(`📦 [${i + 1}/${total}] Fetching price for ${pcode}...`);

    const result = await fetchDanawaPrice(pcode);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ ${result.lowestPrice?.toLocaleString()}원 (${result.lowestMall}) - ${result.mallCount}개 쇼핑몰`);
    } else {
      console.log(`   ❌ Failed: ${result.error || 'No price found'}`);
    }

    onProgress?.(i + 1, total, result);

    // Rate limit (마지막 요청 제외)
    if (i < pcodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
