/**
 * 다나와 크롤러 (Puppeteer 기반)
 *
 * Selenium (Python) → Puppeteer (TypeScript) 변환
 * - 서버리스 친화적 (Vercel Serverless Functions 지원)
 * - 타임아웃 최적화 (10초 제한)
 * - 동적 로딩 대응 (waitForSelector)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import type { DanawaProductData, DanawaPriceInfo, ProductVariant } from '@/types/danawa';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Cheerio element types - using any to avoid package version conflicts
type CheerioElement = any;
type CheerioCallback = (index: number, element: any) => void;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 브라우저 인스턴스 생성 (매번 새로 생성 - 안정성 우선)
 */
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
      '--single-process', // 서버리스 환경에서 필수
      '--disable-web-security', // CORS 우회
      '--disable-blink-features=AutomationControlled', // 봇 감지 우회
    ],
  });
}

/**
 * URL에서 상품 코드 추출
 */
function extractProductCode(url: string): string | null {
  const match = url.match(/[?&](?:p)?code=(\d+)/);
  return match ? match[1] : null;
}

/**
 * 다나와 검색하여 상품 코드 찾기
 * @param query 검색어 (브랜드 + 제품명)
 * @returns 다나와 상품 코드
 */
export async function searchDanawaProduct(query: string): Promise<string | null> {
  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [Search] Starting search for: "${query}"`);

    // 리소스 차단 (이미지, CSS, 폰트, 미디어 등)으로 30-50% 속도 향상
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

    // 검색 페이지 이동
    const searchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`;
    console.log(`   Search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 검색 결과 로딩 대기 (동적 콘텐츠)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 상품 링크 찾기
    const productLinks = await page.$$eval('.prod_main_info a, .product_list a', (links) =>
      links.map((link) => (link as HTMLAnchorElement).href).filter((href) => href.includes('code='))
    );

    console.log(`   Found ${productLinks.length} product links`);
    if (productLinks.length > 0) {
      console.log(`   First link: ${productLinks[0].substring(0, 100)}...`);
    }

    if (productLinks.length === 0) {
      console.warn(`   ❌ No product found for query: "${query}"`);
      return null;
    }

    // 첫 번째 상품 코드 추출
    const productCode = extractProductCode(productLinks[0]);
    console.log(`   ✅ Extracted product code: ${productCode}`);

    return productCode;
  } catch (error) {
    console.error(`   ❌ Error in searchDanawaProduct:`, error);
    return null;
  } finally {
    try {
      await page.close();
      await browser.close();
    } catch (err) {
      console.error('   ⚠️ Error closing browser:', err);
    }
  }
}

/**
 * 상품명 추출 (다층 fallback)
 */
function extractProductName($: ReturnType<typeof load>): string | null {
  // 1. 메타 태그 (가장 신뢰도 높음)
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) {
    return ogTitle.split(':')[0].trim();
  }

  // 2. title 태그
  const title = $('title').text();
  if (title) {
    return title.split(':')[0].split('-')[0].trim();
  }

  // 3. h1 태그
  const h1 = $('h1.prod_tit, h1.tit').text().trim();
  if (h1) {
    return h1;
  }

  return null;
}

/**
 * 이미지 URL 추출
 */
function extractImage($: ReturnType<typeof load>): string | null {
  const ogImg = $('meta[property="og:image"]').attr('content');
  if (ogImg) {
    return ogImg;
  }

  const img = $('#imgExtensionArea img, .thumb_w img, #baseImage').attr('src');
  if (img) {
    return img.startsWith('//') ? `https:${img}` : img;
  }

  return null;
}

/**
 * 제조사, 등록일 추출
 */
function extractManufacturerAndDate($: ReturnType<typeof load>): {
  manufacturer: string | null;
  registrationDate: string | null;
} {
  let manufacturer: string | null = null;
  let registrationDate: string | null = null;

  // 제조사
  const makerElem = $('.made_info .txt a').text().trim();
  if (makerElem) {
    manufacturer = makerElem;
  }

  // 등록일 - spec 영역에서
  $('.spec_list li').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('등록') || text.includes('출시')) {
      const match = text.match(/(\d{4}[.\-년]\s*\d{1,2})/);
      if (match) {
        registrationDate = match[1];
      }
    }
  });

  return { manufacturer, registrationDate };
}

/**
 * 카테고리 경로 추출
 */
function extractCategory($: ReturnType<typeof load>): string | null {
  // 1. location 영역
  const locationLinks = $('.location_wrap a, .location_w a, .bread_crumb a, #breadcrumb a')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text && !['홈', 'Home', '다나와', ''].includes(text));

  if (locationLinks.length > 0) {
    return locationLinks.slice(0, 5).join(' > ');
  }

  // 2. 스펙 테이블에서 카테고리 찾기
  $('th').each((_, el) => {
    if ($(el).text().includes('카테고리')) {
      const td = $(el).next('td');
      if (td.length) {
        return td.text().trim();
      }
    }
  });

  // 3. meta 태그
  const keywords = $('meta[name="keywords"]').attr('content');
  if (keywords) {
    const parts = keywords.split(',');
    if (parts.length > 0) {
      return parts[0].trim();
    }
  }

  return null;
}

/**
 * 스펙 정보 추출
 */
function extractSpecs($: ReturnType<typeof load>): Record<string, string> {
  const specs: Record<string, string> = {};
  console.log(`\n📋 [Specs] Extracting specs...`);

  // 블랙리스트: 스펙이 아닌 메타 정보
  const blacklist = [
    '구매 주의사항',
    '빠른 배송 안내',
    '배송 안내',
    '주의사항',
    '법적 고지',
    '배송정보',
    '반품/교환',
    '상품평',
    '제품평',
  ];

  const isBlacklisted = (key: string): boolean => {
    return blacklist.some(item => key.includes(item));
  };

  // 1. 상단 요약 스펙
  const specList1 = $('.spec_list li, .prod_spec li');
  console.log(`   Selector 1 (.spec_list li, .prod_spec li): ${specList1.length} elements`);
  specList1.each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const [key, val] = text.split(':', 2);
      const cleanKey = key.trim();
      const cleanVal = val.trim();
      // 블랙리스트 체크 + key/val 길이 제한
      if (cleanKey && cleanVal && cleanKey.length < 30 && cleanVal.length < 100 && !isBlacklisted(cleanKey)) {
        specs[cleanKey] = cleanVal;
        console.log(`   ✓ Found spec: "${cleanKey}" = "${cleanVal}"`);
      }
    }
  });

  // 2. 상세 스펙 테이블 (다양한 패턴 시도)
  const specSelectors = [
    '.spec_tbl tr',
    '#productDescriptionArea table tr',
    '.spec_sec table tr',
    '.product_detail table tr',
    'table.spec_tbl tr',
    '.prod_spec table tr',
    '#prodSpecArea table tr', // NEW
    '.spec_view table tr', // NEW
    '#detail_view table tr', // NEW
    '.prod_info table tr', // NEW
  ];

  for (const selector of specSelectors) {
    const rows = $(selector);
    if (rows.length > 0) {
      console.log(`   Selector 2 (${selector}): ${rows.length} rows`);

      rows.each((_, el) => {
        const ths = $(el).find('th');
        const tds = $(el).find('td');

        // Python의 zip(ths, tds)와 동일하게 - 같은 인덱스끼리 매칭
        const minLength = Math.min(ths.length, tds.length);
        for (let i = 0; i < minLength; i++) {
          const key = $(ths[i]).text().trim();
          let val = $(tds[i]).text().trim();

          // 불필요한 텍스트 제거
          val = val.replace(/인증번호\s*확인/g, '').replace(/\(제조사 웹사이트 바로가기\)/g, '').trim();

          // 블랙리스트 체크 + 길이 제한
          if (key && val && key.length < 30 && val.length < 100 && !isBlacklisted(key) && !specs[key]) {
            specs[key] = val;
            console.log(`   ✓ Found spec: "${key}" = "${val}"`);
          }
        }
      });

      if (Object.keys(specs).length > 5) break; // 충분히 찾았으면 중단
    }
  }

  // Fallback: 모든 테이블을 스캔 (위의 셀렉터들이 실패한 경우)
  if (Object.keys(specs).length === 0) {
    console.log(`   🔄 Fallback: scanning all tables...`);
    const allTables = $('table');
    console.log(`   Found ${allTables.length} tables in total`);

    allTables.each((_, table) => {
      const rows = $(table).find('tr');
      rows.each((_, row) => {
        const ths = $(row).find('th');
        const tds = $(row).find('td');

        const minLength = Math.min(ths.length, tds.length);
        for (let i = 0; i < minLength; i++) {
          const key = $(ths[i]).text().trim();
          let val = $(tds[i]).text().trim();
          val = val.replace(/인증번호\s*확인/g, '').replace(/\(제조사 웹사이트 바로가기\)/g, '').trim();

          if (key && val && key.length < 30 && val.length < 100 && !isBlacklisted(key) && !specs[key]) {
            specs[key] = val;
            console.log(`   ✓ Found spec (fallback): "${key}" = "${val}"`);
          }
        }
      });

      // 충분히 찾았으면 중단
      if (Object.keys(specs).length > 10) return false;
    });
  }

  // 3. dl/dt/dd 형식
  const dlSelectors = ['.spec_list_wrap dl', '.detail_cont dl', '.product_detail dl'];
  for (const selector of dlSelectors) {
    const dls = $(selector);
    if (dls.length > 0) {
      console.log(`   Selector 3 (${selector}): ${dls.length} elements`);

      dls.each((_, dl) => {
        const dts = $(dl).find('dt');
        const dds = $(dl).find('dd');

        dts.each((i, dt) => {
          const key = $(dt).text().trim();
          const dd = $(dds[i]);
          if (dd.length) {
            const val = dd.text().trim();
            // 블랙리스트 체크 + 길이 제한
            if (key && val && key.length < 30 && val.length < 100 && !isBlacklisted(key) && !specs[key]) {
              specs[key] = val;
              console.log(`   ✓ Found spec: "${key}" = "${val}"`);
            }
          }
        });
      });
    }
  }

  console.log(`   📊 Total specs extracted: ${Object.keys(specs).length}`);
  return specs;
}

/**
 * 제품 구성 옵션 추출 (다른 구성)
 */
function extractVariants($: ReturnType<typeof load>, currentPcode: string): ProductVariant[] {
  const variants: ProductVariant[] = [];
  console.log(`\n📦 [Variants] Extracting product variants...`);

  const variantList = $('.list__variant-selector');

  if (variantList.length === 0) {
    console.log(`   ℹ️ No variants section found (this is normal for products without options)`);
    return variants;
  }

  const items = variantList.find('li.list-item');
  console.log(`   Found ${items.length} variant items`);

  items.each((_, item) => {
    const $item = $(item);

    // 수량/팩 정보
    const quantity = $item.find('.text__spec').text().trim();
    if (!quantity) return;

    // 가격 정보
    const priceText = $item.find('.sell-price .text__num').text().trim();
    const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

    // 단가 정보
    const unitPrice = $item.find('.text__unit-price').text().trim() || null;

    // 쇼핑몰 수
    const mallCountText = $item.find('.text__count-mall').text().trim();
    const mallCountMatch = mallCountText.match(/(\d+)/);
    const mallCount = mallCountMatch ? parseInt(mallCountMatch[1], 10) : null;

    // 순위
    const rank = $item.find('.label__rank').text().trim() || null;

    // 활성 상태 (현재 보고 있는 상품)
    const isActive = $item.hasClass('is-active');

    // 링크 (pcode)
    const link = $item.find('a').attr('href') || '';
    const pcodeMatch = link.match(/pcode=(\d+)/);
    const pcode = pcodeMatch ? pcodeMatch[1] : '';

    if (!pcode) {
      console.log(`   ⚠️ Skipping variant "${quantity}" - no pcode found`);
      return;
    }

    const productUrl = link.startsWith('http') ? link : `https://prod.danawa.com${link}`;

    variants.push({
      pcode,
      quantity,
      price,
      unitPrice,
      mallCount,
      rank,
      isActive,
      productUrl,
    });

    console.log(`   ✓ ${quantity}${isActive ? ' (현재)' : ''}${rank ? ` [${rank}]` : ''} - ${price?.toLocaleString()}원`);
  });

  console.log(`   📊 Total variants extracted: ${variants.length}`);
  return variants;
}

/**
 * 가격 정보 추출 (최저가 + 쇼핑몰별 가격)
 */
async function extractPrices(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _$: ReturnType<typeof load>
): Promise<{
  lowestPrice: number | null;
  lowestMall: string | null;
  prices: DanawaPriceInfo[];
}> {
  let lowestPrice: number | null = null;
  let lowestMall: string | null = null;
  const prices: DanawaPriceInfo[] = [];

  try {
    console.log(`\n💰 [Price] Starting price extraction...`);

    // 가격비교 탭 클릭 시도
    try {
      await page.evaluate(() => {
        window.scrollTo(0, 500);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 가격비교 탭 찾기
      const tabs = await page.$$('.tab_item a, .product_tab a');
      console.log(`   Found ${tabs.length} tabs`);

      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        if (text?.includes('가격')) {
          console.log(`   Clicking price comparison tab...`);
          await tab.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }
    } catch (err) {
      console.log(`   Tab click failed (continuing): ${err}`);
    }

    // 가격 영역 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.evaluate(() => {
      window.scrollTo(0, 800);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // HTML 다시 가져오기
    const html = await page.content();
    const $updated = load(html);

    // 최저가 추출
    console.log(`   Searching for lowest price with selectors...`);
    const lowestElem = $updated('.lowest_price em.prc, .lowest_area .lwst_prc, .bnft_price em').first();
    console.log(`   Found lowest price element: ${lowestElem.length > 0}`);

    if (lowestElem.length) {
      const priceText = lowestElem.text().replace(/[^\d]/g, '');
      console.log(`   Price text: "${lowestElem.text()}" → "${priceText}"`);
      if (priceText) {
        lowestPrice = parseInt(priceText, 10);
        console.log(`   ✅ Lowest price extracted: ${lowestPrice}`);
      }
    } else {
      console.log(`   ❌ No lowest price element found`);
    }

    // 최저가 쇼핑몰
    const lowestMallElem = $updated('.lowest_price .mall_name, .lowest_area .logo_over img').first();
    console.log(`   Found lowest mall element: ${lowestMallElem.length > 0}`);

    if (lowestMallElem.length) {
      if (lowestMallElem.is('img')) {
        lowestMall = lowestMallElem.attr('alt') || '';
      } else {
        lowestMall = lowestMallElem.text().trim();
      }
      console.log(`   ✅ Lowest mall extracted: ${lowestMall}`);
    } else {
      console.log(`   ❌ No lowest mall element found`);
    }

    // 쇼핑몰별 가격 목록
    const priceRows = $updated('.mall_list tbody tr, .diff_item, .ProductList tr');
    console.log(`   Found ${priceRows.length} price rows`);

    priceRows.each((_, row) => {
      const priceInfo = parsePriceRow($updated(row), $updated);
      if (priceInfo && priceInfo.price) {
        prices.push(priceInfo);
      }
    });

    // Alternative format
    if (prices.length === 0) {
      console.log(`   Trying alternative price format...`);
      const altRows = $updated('.product_list .prod_item, .price_sect .item');
      console.log(`   Found ${altRows.length} alternative rows`);

      altRows.each((_, row) => {
        const priceInfo = parsePriceRow($updated(row), $updated);
        if (priceInfo && priceInfo.price) {
          prices.push(priceInfo);
        }
      });
    }

    console.log(`   📊 Final result: ${prices.length} prices extracted`);

    // Fallback: prices 배열에서 최저가 가져오기 (요약 영역을 못 찾은 경우)
    if (!lowestPrice && prices.length > 0) {
      console.log(`   🔄 Using fallback: extracting lowest price from prices array`);
      // prices 배열은 보통 가격 오름차순으로 정렬되어 있음
      const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
      lowestPrice = sortedPrices[0].price;
      lowestMall = sortedPrices[0].mall;
      console.log(`   ✅ Fallback lowest price: ${lowestPrice}원 (${lowestMall})`);
    }
  } catch (error) {
    console.error(`   ❌ Failed to extract prices:`, error);
  }

  return { lowestPrice, lowestMall, prices };
}

/**
 * 가격 행 파싱
 */
function parsePriceRow($row: CheerioElement, $: ReturnType<typeof load>): DanawaPriceInfo | null {
  let mall: string | null = null;

  // 1. 이미지 alt/title
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $row.find('img').each((_: number, img: any) => {
    const alt = $(img).attr('alt')?.trim();
    const title = $(img).attr('title')?.trim();
    if (alt && alt.length > 1 && !['상품이미지', '이미지'].includes(alt)) {
      mall = alt;
      return false; // break
    }
    if (title && title.length > 1) {
      mall = title;
      return false;
    }
  });

  // 2. 링크 텍스트
  if (!mall) {
    const mallLink = $row.find('a.mall_name, a.logo_over, td.mall a').first();
    if (mallLink.length) {
      mall = mallLink.text().trim();
    }
  }

  // 3. data 속성
  if (!mall) {
    const elem = $row.find('[data-mall-name], [data-shop-name]').first();
    if (elem.length) {
      mall = elem.attr('data-mall-name') || elem.attr('data-shop-name') || null;
    }
  }

  // 4. 키워드 패턴 매칭
  if (!mall) {
    const malls = ['쿠팡', '11번가', 'G마켓', '옥션', 'SSG', '롯데', '하이마트', '네이버', '위메프', '티몬', '인터파크'];
    const rowHtml = $row.html() || '';
    for (const m of malls) {
      if (rowHtml.toLowerCase().includes(m.toLowerCase())) {
        mall = m;
        break;
      }
    }
  }

  // 가격
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

  // 배송비
  const deliveryElem = $row.find('.ship, .delivery, .dlv_info, .stxt').first();
  const delivery = deliveryElem.length ? deliveryElem.text().trim() : '';

  // 판매자
  const sellerElem = $row.find('.seller_nm, .seller, .txt_shop').first();
  const seller = sellerElem.length ? sellerElem.text().trim() : undefined;

  // 상품 링크
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
 * 다나와 상품 정보 크롤링
 * @param productCode 다나와 상품 코드
 * @returns 상품 전체 정보
 */
export async function crawlDanawaProduct(productCode: string): Promise<DanawaProductData | null> {
  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    // 리소스 차단 (이미지, CSS, 폰트, 미디어 등)으로 30-50% 속도 향상
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

    // 상품 페이지 이동 (타임아웃 45초로 증가)
    const url = `https://prod.danawa.com/info/?pcode=${productCode}`;
    console.log(`\n📡 [Crawl] Starting crawl: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`   Page loaded successfully`);

    // 스펙 영역까지 스크롤 (동적 로딩 트리거)
    console.log(`   Scrolling to load spec data...`);
    await page.evaluate(() => {
      window.scrollTo(0, 800);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 상세 정보 탭 클릭 시도 (스펙이 탭 안에 있는 경우)
    try {
      const tabs = await page.$$('.tab_item a, .product_tab a, #productTabMenu a');
      console.log(`   Found ${tabs.length} tabs, looking for spec tab...`);
      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        if (text?.includes('상세') || text?.includes('스펙') || text?.includes('사양')) {
          console.log(`   Clicking spec/detail tab: "${text}"`);
          await tab.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }
    } catch (err) {
      console.log(`   Tab navigation skipped: ${err}`);
    }

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);
    console.log(`   HTML parsed, content length: ${html.length} bytes`);

    // 데이터 추출
    console.log(`\n📝 [Extract] Extracting product data...`);
    const name = extractProductName($);
    console.log(`   Product name: ${name || '❌ NOT FOUND'}`);

    const image = extractImage($);
    console.log(`   Image: ${image ? '✅ Found' : '❌ NOT FOUND'}`);

    const { manufacturer, registrationDate } = extractManufacturerAndDate($);
    console.log(`   Manufacturer: ${manufacturer || '❌ NOT FOUND'}`);
    console.log(`   Registration date: ${registrationDate || '❌ NOT FOUND'}`);

    const category = extractCategory($);
    console.log(`   Category: ${category || '❌ NOT FOUND'}`);

    const specs = extractSpecs($);
    console.log(`   Specs: ${Object.keys(specs).length} items found`);

    const variants = extractVariants($, productCode);
    console.log(`   Variants: ${variants.length} items found`);

    const { lowestPrice, lowestMall, prices } = await extractPrices(page, $);

    // 등록일 보완 (스펙에서)
    let finalRegistrationDate = registrationDate;
    if (!finalRegistrationDate && specs['등록년월']) {
      finalRegistrationDate = specs['등록년월'];
    }

    const result: DanawaProductData = {
      productCode,
      url,
      name: name || '',
      image,
      manufacturer,
      registrationDate: finalRegistrationDate,
      category,
      lowestPrice,
      lowestMall,
      specs,
      prices,
      variants: variants.length > 0 ? variants : undefined,
    };

    console.log(`\n✅ [Summary] Crawling completed successfully`);
    console.log(`   Product: ${name}`);
    console.log(`   Lowest price: ${lowestPrice ? `${lowestPrice.toLocaleString()}원` : '❌ NOT FOUND'}`);
    console.log(`   Lowest mall: ${lowestMall || '❌ NOT FOUND'}`);
    console.log(`   Specs count: ${Object.keys(specs).length}`);
    console.log(`   Prices count: ${prices.length}`);
    console.log(`   Variants count: ${variants.length}`);

    return result;
  } catch (error) {
    console.error(`\n❌ [Error] Failed to crawl product ${productCode}:`, error);
    return null;
  } finally {
    try {
      await page.close();
      await browser.close();
    } catch (err) {
      console.error('   ⚠️ Error closing browser:', err);
    }
  }
}

// 브라우저는 각 함수에서 생성 후 자동 종료됨
