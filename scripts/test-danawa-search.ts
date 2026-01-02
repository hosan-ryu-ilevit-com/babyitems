/**
 * 다나와 검색 크롤러 테스트 스크립트
 *
 * 테스트 목표:
 * 1. 에어프라이어 검색
 * 2. 상품평 많은순 정렬
 * 3. 상품 리스트 파싱 (이름, 가격, 리뷰 수, 스펙)
 *
 * 실행: npx tsx scripts/test-danawa-search.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';

// 검색 결과 상품 타입
interface SearchProduct {
  pcode: string;
  name: string;
  price: number | null;
  rating: number | null;        // 외부 리뷰 별점 (1-5점)
  reviewCount: number | null;   // 외부 리뷰 수 (네이버, 쿠팡 등)
  opinionCount: number | null;  // 다나와 상품의견 수
  thumbnail: string | null;
  specs: Record<string, string>;
  productUrl: string;
  brand: string | null;
}

// 정렬 옵션
type SortOption = 'popular' | 'price_low' | 'price_high' | 'newest' | 'review_count';

const SORT_PARAMS: Record<SortOption, string> = {
  popular: 'saveDESC',      // 인기상품순 (판매량)
  price_low: 'priceASC',    // 낮은가격순
  price_high: 'priceDESC',  // 높은가격순
  newest: 'dateDESC',       // 신상품순
  review_count: 'opinionDESC', // 상품평 많은순
};

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
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

/**
 * 다나와 검색 결과 크롤링
 */
async function crawlSearchResults(
  query: string,
  options?: {
    sortBy?: SortOption;
    limit?: number;
  }
): Promise<SearchProduct[]> {
  const sortBy = options?.sortBy || 'review_count';
  const limit = options?.limit || 20;

  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [Search] "${query}" 검색 시작 (정렬: ${sortBy})`);

    // 리소스 차단 (속도 향상)
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

    // 검색 URL (정렬 파라미터 포함)
    const sortParam = SORT_PARAMS[sortBy];
    const searchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&sort=${sortParam}`;
    console.log(`   URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 동적 콘텐츠 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 3000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    // 상품 리스트 파싱
    const products: SearchProduct[] = [];

    // 상품 아이템 선택자 (다나와 검색 결과 구조)
    const productItems = $('.product_list .prod_item, .main_prodlist .prod_item');
    console.log(`   상품 아이템 발견: ${productItems.length}개`);

    productItems.each((index, element) => {
      if (index >= limit) return false;

      const $item = $(element);

      // 상품 코드 추출
      const productLink = $item.find('a[href*="pcode="]').attr('href') || '';
      const pcodeMatch = productLink.match(/pcode=(\d+)/);
      const pcode = pcodeMatch ? pcodeMatch[1] : '';

      if (!pcode) return; // 상품 코드 없으면 스킵

      // 상품명
      const name = $item.find('.prod_name a, .prod_info .prod_name').text().trim() ||
                   $item.find('.prod_main_info a').text().trim();

      // 가격
      const priceText = $item.find('.price_sect strong, .prod_pricelist .price_sect em').text().trim();
      const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

      // 별점
      const ratingText = $item.find('.star_graph .star_mask').attr('style') || '';
      const ratingMatch = ratingText.match(/width:\s*([\d.]+)%/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) / 20 : null; // 100% = 5점

      // 리뷰 수
      const reviewText = $item.find('.cnt_opinion, .prod_sub_info .cnt').text().trim();
      const reviewMatch = reviewText.match(/\(?([\d,]+)\)?/);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : null;

      // 썸네일
      const thumbnail = $item.find('.thumb_image img, .prod_img img').attr('src') ||
                       $item.find('.thumb_image img, .prod_img img').attr('data-src') || null;

      // 스펙 정보
      const specs: Record<string, string> = {};
      $item.find('.spec_list li, .prod_spec_set li').each((_, specEl) => {
        const specText = $(specEl).text().trim();
        if (specText.includes(':')) {
          const [key, value] = specText.split(':', 2);
          specs[key.trim()] = value.trim();
        } else if (specText) {
          // 콜론 없는 스펙 (예: "10L", "바스켓형")
          specs[`spec_${Object.keys(specs).length}`] = specText;
        }
      });

      // 브랜드 (제조사)
      const brand = $item.find('.prod_maker, .prod_brand').text().trim() || null;

      products.push({
        pcode,
        name: name || `상품 ${pcode}`,
        price,
        rating,
        reviewCount,
        thumbnail: thumbnail?.startsWith('//') ? `https:${thumbnail}` : thumbnail,
        specs,
        productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
        brand,
      });
    });

    console.log(`   ✅ ${products.length}개 상품 파싱 완료`);

    return products;

  } catch (error) {
    console.error(`   ❌ 크롤링 오류:`, error);
    return [];
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * HTML 구조 분석용 - 페이지 HTML 저장
 */
async function analyzeHtmlStructure(query: string): Promise<void> {
  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [분석] "${query}" 검색 페이지 HTML 구조 분석`);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const searchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&sort=opinionDESC`;
    console.log(`   URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const html = await page.content();
    const $ = load(html);

    // 상품 리스트 영역 찾기
    console.log('\n📋 HTML 구조 분석:');
    console.log('-'.repeat(60));

    // 가능한 상품 컨테이너들 확인
    const selectors = [
      '.product_list',
      '.main_prodlist',
      '#productListArea',
      '.prod_main_info',
      '.prod_item',
      'li.prod_item',
      '.productList',
      '[class*="product"]',
    ];

    selectors.forEach(selector => {
      const count = $(selector).length;
      if (count > 0) {
        console.log(`   ${selector}: ${count}개`);
      }
    });

    // 첫 번째 상품 아이템의 HTML 구조 출력
    console.log('\n📦 첫 번째 상품 아이템 분석:');
    console.log('-'.repeat(60));

    // prod_main_info 안의 첫 번째 제품 찾기
    const firstProduct = $('.main_prodlist .prod_item').first();
    if (firstProduct.length) {
      console.log('\n[prod_item 클래스 구조]');

      // 상품 링크들
      const links = firstProduct.find('a[href*="pcode"]');
      console.log(`   링크 수: ${links.length}`);
      if (links.length > 0) {
        console.log(`   첫 링크: ${links.first().attr('href')?.substring(0, 100)}`);
      }

      // 상품명 찾기
      const nameEl = firstProduct.find('.prod_name a, .prod_info .prod_name, [class*="name"] a');
      console.log(`   상품명 요소: ${nameEl.length}개`);
      if (nameEl.length > 0) {
        console.log(`   상품명: ${nameEl.first().text().trim().substring(0, 50)}`);
      }

      // 가격 찾기
      const priceEl = firstProduct.find('.price_sect em, .price em, [class*="price"] em, .prc');
      console.log(`   가격 요소: ${priceEl.length}개`);
      priceEl.each((i, el) => {
        if (i < 3) {
          console.log(`   가격[${i}]: "${$(el).text().trim()}"`);
        }
      });

      // 리뷰 수 찾기
      const reviewEl = firstProduct.find('[class*="opinion"], [class*="review"], .cnt');
      console.log(`   리뷰 요소: ${reviewEl.length}개`);
      reviewEl.each((i, el) => {
        if (i < 3) {
          console.log(`   리뷰[${i}]: "${$(el).text().trim().substring(0, 30)}"`);
        }
      });

      // 스펙 찾기
      const specEl = firstProduct.find('.spec_list li, [class*="spec"] li, .prod_spec');
      console.log(`   스펙 요소: ${specEl.length}개`);
      specEl.each((i, el) => {
        if (i < 5) {
          console.log(`   스펙[${i}]: "${$(el).text().trim().substring(0, 50)}"`);
        }
      });

      // 전체 HTML 일부 출력
      console.log('\n[HTML 구조 샘플]');
      const htmlSample = firstProduct.html()?.substring(0, 2000) || '';
      console.log(htmlSample);
    } else {
      console.log('   prod_item을 찾을 수 없습니다.');

      // 대안: 전체 HTML에서 pcode 링크 찾기
      const allPcodeLinks = $('a[href*="pcode="]');
      console.log(`\n   전체 페이지에서 pcode 링크: ${allPcodeLinks.length}개`);

      allPcodeLinks.slice(0, 5).each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().substring(0, 50);
        console.log(`   [${i}] ${text || '(텍스트 없음)'}`);
        console.log(`       href: ${href.substring(0, 80)}`);
      });
    }

    // HTML 파일로 저장 (디버깅용)
    const fs = await import('fs/promises');
    await fs.writeFile('/tmp/danawa-search.html', html);
    console.log('\n   📄 전체 HTML 저장: /tmp/danawa-search.html');

  } catch (error) {
    console.error(`   ❌ 오류:`, error);
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * 카테고리 페이지에서 상품 크롤링 (더 정확함)
 * 에어프라이어 카테고리 코드: 10252979
 */
async function crawlCategoryPage(
  categoryCode: string,
  options?: {
    sortBy?: SortOption;
    limit?: number;
  }
): Promise<SearchProduct[]> {
  const sortBy = options?.sortBy || 'review_count';
  const limit = options?.limit || 20;

  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [카테고리] 코드 ${categoryCode} 크롤링 (정렬: ${sortBy})`);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 카테고리 페이지 URL (정렬 파라미터 포함)
    // 정렬: order=7 (상품의견많은순), order=1 (인기순)
    const sortParam = sortBy === 'review_count' ? '7' : '1';
    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}&order=${sortParam}`;
    console.log(`   URL: ${categoryUrl}`);

    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const html = await page.content();
    const $ = load(html);

    const products: SearchProduct[] = [];

    // 상품 리스트 파싱
    const productItems = $('#productListArea .prod_item, .main_prodlist .prod_item');
    console.log(`   상품 아이템 발견: ${productItems.length}개`);

    productItems.each((index, element) => {
      if (index >= limit) return false;

      const $item = $(element);

      // 상품 코드 추출
      const pcodeInput = $item.find('input[id^="productItem_categoryInfo_"]').attr('id');
      const pcode = pcodeInput?.replace('productItem_categoryInfo_', '') || '';

      if (!pcode) {
        // 대안: 링크에서 추출
        const link = $item.find('a[href*="pcode="]').attr('href') || '';
        const match = link.match(/pcode=(\d+)/);
        if (!match) return;
      }

      // 상품명
      const name = $item.find('.prod_name a').text().trim().replace(/\s+/g, ' ');

      // 가격 (최저가) - 쉼표 제거 필수!
      const minPriceInput = $item.find(`input[id="min_price_${pcode}"]`).val();
      const priceStr = String(minPriceInput || '').replace(/,/g, '');
      const price = priceStr ? parseInt(priceStr, 10) : null;

      // 별점 - star-single 요소에서 추출 (예: "별점 4.6")
      let rating: number | null = null;
      const starEl = $item.find('.star-single');
      if (starEl.length) {
        const starText = starEl.text().trim();
        const ratingMatch = starText.match(/([\d.]+)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }
      }

      // 리뷰 수 - text__number 요소에서 추출 (외부 리뷰 수)
      let reviewCount: number | null = null;
      const reviewNumEl = $item.find('.text__number');
      if (reviewNumEl.length) {
        const reviewText = reviewNumEl.text().trim();
        const reviewMatch = reviewText.match(/([\d,]+)/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
        }
      }

      // 다나와 상품의견 수 (옵션)
      let opinionCount: number | null = null;
      const opinionEl = $item.find('.meta_item.mt_comment .dd strong');
      if (opinionEl.length) {
        const opinionText = opinionEl.text().trim();
        const opinionMatch = opinionText.match(/(\d+)/);
        if (opinionMatch) {
          opinionCount = parseInt(opinionMatch[1], 10);
        }
      }

      // 썸네일
      let thumbnail = $item.find('.thumb_image img').attr('src') ||
                      $item.find('.thumb_image img').attr('data-original') || null;
      if (thumbnail?.startsWith('//')) {
        thumbnail = `https:${thumbnail}`;
      }

      // 스펙 정보 - /로 구분된 전체 텍스트 파싱
      const specs: Record<string, string> = {};
      const specText = $item.find('.spec_list').text().trim();
      if (specText) {
        const specParts = specText.split('/').map(s => s.trim()).filter(Boolean);
        specParts.forEach((part, idx) => {
          if (part.includes(':')) {
            const [key, value] = part.split(':', 2);
            specs[key.trim()] = value.trim();
          } else if (part.startsWith('[')) {
            // [조작] 디지털디스플레이 형태
            const catMatch = part.match(/\[(.+?)\]\s*(.+)/);
            if (catMatch) {
              const category = catMatch[1];
              const feature = catMatch[2];
              specs[category] = (specs[category] ? specs[category] + ', ' : '') + feature;
            }
          } else {
            // 단순 특징 (예: 바스켓형, 스테인리스)
            specs[`feature_${idx}`] = part;
          }
        });
      }

      // 브랜드/제조사 - 상품명 앞부분에서 추출 또는 wishlist에서
      const wishVal = $item.find(`input[id^="wishListBundleVal_${pcode}"]`).val() || '';
      const wishParts = String(wishVal).split('//');
      const brand = wishParts[1]?.split(' ')[0] || null;

      products.push({
        pcode,
        name: name || `상품 ${pcode}`,
        price,
        rating,
        reviewCount,
        opinionCount,
        thumbnail,
        specs,
        productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
        brand,
      });
    });

    console.log(`   ✅ ${products.length}개 상품 파싱 완료`);
    return products;

  } catch (error) {
    console.error(`   ❌ 크롤링 오류:`, error);
    return [];
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * 카테고리 페이지 HTML 구조 상세 분석
 */
async function analyzeCategoryHtml(categoryCode: string): Promise<void> {
  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [분석] 카테고리 ${categoryCode} HTML 구조 분석`);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}&order=7`;
    console.log(`   URL: ${categoryUrl}`);

    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const html = await page.content();
    const $ = load(html);

    // 첫 번째 상품 아이템 분석
    const firstItem = $('#productListArea .prod_item').first();

    console.log('\n📦 첫 번째 상품 HTML 구조:');
    console.log('-'.repeat(60));

    // 상품 코드 관련
    const allInputs = firstItem.find('input[type="hidden"]');
    console.log(`\n[Hidden inputs: ${allInputs.length}개]`);
    allInputs.slice(0, 10).each((i, el) => {
      const id = $(el).attr('id') || '';
      const val = $(el).val() || '';
      console.log(`   ${id} = ${String(val).substring(0, 50)}`);
    });

    // 가격 관련 요소들
    console.log('\n[가격 관련 요소]');
    const priceSelectors = [
      '.price_sect .price_wrap',
      '.price_sect em',
      '.prod_pricelist em',
      '[class*="price"]',
      '.price_sect',
    ];
    priceSelectors.forEach(sel => {
      const el = firstItem.find(sel).first();
      if (el.length) {
        console.log(`   ${sel}: "${el.text().trim().substring(0, 50)}"`);
      }
    });

    // 리뷰/별점 관련
    console.log('\n[리뷰/별점 관련 요소]');
    const reviewSelectors = [
      '.cnt_opinion',
      '.star_graph',
      '[class*="review"]',
      '[class*="opinion"]',
      '[class*="rate"]',
      '.prod_sub_info',
    ];
    reviewSelectors.forEach(sel => {
      const el = firstItem.find(sel).first();
      if (el.length) {
        console.log(`   ${sel}: "${el.text().trim().substring(0, 50)}"`);
      }
    });

    // 스펙 관련
    console.log('\n[스펙 관련 요소]');
    const specSelectors = [
      '.spec_list',
      '.prod_spec',
      '[class*="spec"]',
      '.prod_option',
    ];
    specSelectors.forEach(sel => {
      const el = firstItem.find(sel).first();
      if (el.length) {
        console.log(`   ${sel}: "${el.text().trim().substring(0, 100)}"`);
      }
    });

    // 제조사/브랜드
    console.log('\n[브랜드 관련 요소]');
    const brandSelectors = [
      '.prod_maker',
      '.maker',
      '[class*="brand"]',
      '[class*="maker"]',
    ];
    brandSelectors.forEach(sel => {
      const el = firstItem.find(sel).first();
      if (el.length) {
        console.log(`   ${sel}: "${el.text().trim().substring(0, 50)}"`);
      }
    });

    // 전체 HTML 일부
    console.log('\n[HTML 샘플 (2000자)]');
    console.log(firstItem.html()?.substring(0, 2000));

    // 파일 저장
    const fs = await import('fs/promises');
    await fs.writeFile('/tmp/danawa-category.html', html);
    console.log('\n   📄 HTML 저장: /tmp/danawa-category.html');

  } catch (error) {
    console.error(`   ❌ 오류:`, error);
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * 리뷰/별점 관련 HTML 요소 상세 분석
 */
async function analyzeReviewElements(categoryCode: string): Promise<void> {
  const browser = await createBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n🔍 [분석] 리뷰/별점 HTML 요소 분석`);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}&order=7`;
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const html = await page.content();
    const $ = load(html);

    // 첫 번째 상품 아이템 분석
    const firstItem = $('#productListArea .prod_item').first();
    const pcode = firstItem.find('input[id^="productItem_categoryInfo_"]').attr('id')?.replace('productItem_categoryInfo_', '');
    const name = firstItem.find('.prod_name a').text().trim();

    console.log(`\n첫 번째 상품: ${name} (pcode: ${pcode})`);
    console.log('-'.repeat(60));

    // 모든 링크 분석 (opinion, review 관련)
    console.log('\n[opinion/review 관련 링크]');
    const opinionLinks = firstItem.find('a[href*="opinion"], a[href*="review"], a[class*="opinion"], a[class*="review"]');
    opinionLinks.each((i, el) => {
      const href = $(el).attr('href') || '';
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim();
      console.log(`   [${i}] class="${cls}" text="${text}" href="${href.substring(0, 50)}"`);
    });

    // 숫자가 포함된 모든 요소 분석
    console.log('\n[숫자 포함 요소 (리뷰 수 후보)]');
    const numberedElements = firstItem.find('*').filter((_, el) => {
      const text = $(el).text().trim();
      return /^\(?\d{1,5}\)?$/.test(text) || /\d{2,}개?건?$/.test(text);
    });
    numberedElements.slice(0, 10).each((i, el) => {
      const tag = $(el).prop('tagName');
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim();
      console.log(`   [${i}] <${tag}> class="${cls}" → "${text}"`);
    });

    // star 관련 요소
    console.log('\n[star/rating 관련 요소]');
    const starElements = firstItem.find('[class*="star"], [class*="rating"], [class*="rate"]');
    starElements.each((i, el) => {
      const cls = $(el).attr('class') || '';
      const style = $(el).attr('style') || '';
      const text = $(el).text().trim();
      console.log(`   [${i}] class="${cls}" style="${style.substring(0, 50)}" text="${text.substring(0, 30)}"`);
    });

    // prod_sub_info 분석 (리뷰 정보가 있는 영역)
    console.log('\n[prod_sub_info 영역 분석]');
    const subInfo = firstItem.find('.prod_sub_info');
    if (subInfo.length) {
      console.log(`   전체 텍스트: "${subInfo.text().replace(/\s+/g, ' ').trim().substring(0, 200)}"`);
      subInfo.find('*').slice(0, 15).each((i, el) => {
        const tag = $(el).prop('tagName');
        const cls = $(el).attr('class') || '';
        const text = $(el).clone().children().remove().end().text().trim();
        if (text) {
          console.log(`   [${i}] <${tag}> class="${cls}" → "${text}"`);
        }
      });
    }

    // cnt 클래스 분석
    console.log('\n[cnt 클래스 분석]');
    const cntElements = firstItem.find('[class*="cnt"]');
    cntElements.each((i, el) => {
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim();
      const html = $(el).html()?.substring(0, 100) || '';
      console.log(`   [${i}] class="${cls}" text="${text}" html="${html}"`);
    });

  } catch (error) {
    console.error(`   ❌ 오류:`, error);
  } finally {
    await page.close();
    await browser.close();
  }
}

// 테스트 실행
async function main() {
  console.log('='.repeat(60));
  console.log('다나와 카테고리 크롤링 테스트 - 에어프라이어');
  console.log('='.repeat(60));

  // 에어프라이어 카테고리 코드: 10252979
  // 상품평 많은순으로 상위 10개 크롤링
  const products = await crawlCategoryPage('10252979', {
    sortBy: 'review_count',
    limit: 10,
  });

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('크롤링 결과');
  console.log('='.repeat(60));

  products.forEach((product, index) => {
    console.log(`\n[${index + 1}] ${product.name}`);
    console.log(`    pcode: ${product.pcode}`);
    console.log(`    가격: ${product.price ? product.price.toLocaleString() + '원' : '정보 없음'}`);
    console.log(`    별점: ${product.rating ? product.rating.toFixed(1) + '점' : '정보 없음'}`);
    console.log(`    리뷰(외부): ${product.reviewCount ? product.reviewCount.toLocaleString() + '개' : '정보 없음'}`);
    console.log(`    의견(다나와): ${product.opinionCount ? product.opinionCount.toLocaleString() + '개' : '정보 없음'}`);
    console.log(`    브랜드: ${product.brand || '정보 없음'}`);
    console.log(`    스펙: ${JSON.stringify(product.specs, null, 2)}`);
    console.log(`    URL: ${product.productUrl}`);
  });

  // 요약
  console.log('\n' + '='.repeat(60));
  console.log('요약');
  console.log('='.repeat(60));
  console.log(`총 상품 수: ${products.length}`);
  console.log(`가격 정보 있음: ${products.filter(p => p.price).length}`);
  console.log(`리뷰(외부) 정보 있음: ${products.filter(p => p.reviewCount).length}`);
  console.log(`의견(다나와) 정보 있음: ${products.filter(p => p.opinionCount).length}`);
  console.log(`별점 정보 있음: ${products.filter(p => p.rating).length}`);
  console.log(`브랜드 정보 있음: ${products.filter(p => p.brand).length}`);
  console.log(`스펙 정보 있음: ${products.filter(p => Object.keys(p.specs).length > 0).length}`);
}

main().catch(console.error);
