/**
 * 에누리 검색어 기반 크롤러 V2 (Puppeteer 기반)
 * 제품 목록 + 리뷰 + 이미지 + 가격 + categoryPath + features 전부 추출
 *
 * 사용법:
 *   npx tsx scripts/crawl-enuri-search.ts "분유제조기"
 *   npx tsx scripts/crawl-enuri-search.ts "분유제조기" --min-reviews=1 --max-products=20
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import { createHash } from 'crypto';
import * as fs from 'fs';

// =====================================================
// 타입 정의
// =====================================================

interface EnuriReview {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  mallName?: string;
  date?: string;
  images: Array<{ thumbnail: string; original?: string; mallName?: string }>;
}

interface EnuriMallPrice {
  mallName: string;
  mallLogo?: string;
  productName?: string;
  price: number;
  cardPrice?: number;
  deliveryFee: number;
  totalPrice: number;
  productUrl: string;
  earn?: number;
}

interface EnuriProduct {
  modelNo: string;
  title: string;
  brand: string;
  lowPrice: number;
  highPrice: number;
  reviewCount: number;
  ratingValue: number;
  imageUrl: string;
  detailUrl: string;
  description?: string;
  categoryPath?: string;
  features?: string[];
  specs?: Record<string, string>;
  reviews: EnuriReview[];
  mallPrices: EnuriMallPrice[];
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
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

// =====================================================
// 유틸리티
// =====================================================

function generateReviewId(content: string, author?: string): string {
  const data = `${content}|${author || ''}`;
  return createHash('md5').update(data).digest('hex').substring(0, 16);
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// 검색 결과에서 제품 목록 추출 (fetch + JSON-LD - 빠름)
// =====================================================

async function fetchProductList(keyword: string): Promise<Omit<EnuriProduct, 'reviews' | 'mallPrices'>[]> {
  const url = `https://www.enuri.com/search.jsp?keyword=${encodeURIComponent(keyword)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });

  const html = await response.text();
  const $ = load(html);
  const products: Omit<EnuriProduct, 'reviews' | 'mallPrices'>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data['@type'] === 'ItemList' && data.itemListElement) {
        for (const item of data.itemListElement) {
          if (item['@type'] === 'ListItem' && item.item) {
            const p = item.item;
            const urlMatch = p.url?.match(/modelno=(\d+)/);

            products.push({
              modelNo: urlMatch ? urlMatch[1] : '',
              title: p.name || '',
              brand: p.brand?.name || '',
              lowPrice: parseInt(p.offers?.lowPrice) || 0,
              highPrice: parseInt(p.offers?.highPrice) || 0,
              reviewCount: parseInt(p.aggregateRating?.reviewCount) || 0,
              ratingValue: parseFloat(p.aggregateRating?.ratingValue) || 0,
              imageUrl: p.image || '',
              detailUrl: p.url || '',
            });
          }
        }
      }
    } catch (e) {}
  });

  return products;
}

// =====================================================
// 상세 페이지에서 가격 추출 (Puppeteer - 동적 콘텐츠)
// =====================================================

async function extractPricesFromPage(page: Page): Promise<EnuriMallPrice[]> {
  const html = await page.content();
  const $ = load(html);
  const prices: EnuriMallPrice[] = [];

  // 가격비교 테이블 행들 파싱
  $('table.tb-compare__list tbody tr').each((_, tr) => {
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

    // 가격
    const priceCell = $tr.find('.tb-col--price');
    const priceHtml = priceCell.html() || '';
    const priceMatch = priceHtml.match(/(\d{1,3}(,\d{3})+)\s*원/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;

    // 카드 할인가
    const cardMatch = priceHtml.match(/카드.*?(\d{1,3}(,\d{3})+)\s*원/);
    const cardPrice = cardMatch ? parseInt(cardMatch[1].replace(/,/g, '')) : undefined;

    // 배송비
    const deliCell = $tr.find('.tb-col--deli');
    const deliText = deliCell.text().trim();
    let deliveryFee = 0;
    if (!deliText.includes('무료') && deliText !== '-') {
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

    if (price >= 10000 && price < 10000000) {
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
// 상세 페이지에서 리뷰 추출 (Puppeteer)
// =====================================================

async function extractReviewsFromPage(page: Page, maxReviews: number = 20): Promise<EnuriReview[]> {
  const reviews: EnuriReview[] = [];
  const seenIds = new Set<string>();

  // 1. 리뷰 섹션으로 스크롤
  try {
    await page.evaluate(() => {
      const reviewSection = document.querySelector('#prod_review');
      if (reviewSection) {
        reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    await delay(1500);
  } catch {}

  // 2. 리뷰 탭들 클릭해서 더 많은 리뷰 로드
  try {
    const tabSelectors = [
      '.review-tab button',
      '[data-tab="blogreview"]',
      '[data-tab="photoreview"]',
      '.blogreview__tab',
    ];

    for (const selector of tabSelectors) {
      try {
        const tab = await page.$(selector);
        if (tab) {
          await tab.click();
          await delay(800);
        }
      } catch {}
    }
  } catch {}

  // 3. 페이지 HTML 파싱
  const html = await page.content();
  const $ = load(html);

  // 파싱 헬퍼 함수
  const addReview = (content: string, rating: number, mallName?: string, date?: string, thumbSrc?: string) => {
    if (content.length < 10) return;
    const reviewId = generateReviewId(content, mallName);
    if (seenIds.has(reviewId)) return;
    seenIds.add(reviewId);

    const images: Array<{ thumbnail: string; original?: string; mallName?: string }> = [];
    if (thumbSrc && !thumbSrc.includes('thum_none') && !thumbSrc.includes('noImg')) {
      let src = thumbSrc.startsWith('//') ? 'https:' + thumbSrc : thumbSrc;
      images.push({ thumbnail: src, original: src.replace(/\?.*$/, ''), mallName });
    }

    reviews.push({ reviewId, rating, content, mallName, date, images });
  };

  // 4. 요약 리뷰 (.review-summary__item)
  $('.review-summary__item').each((_, item) => {
    const $item = $(item);
    const content = $item.find('.review-summary__text').text().trim();
    const ratingText = $item.find('.review-summary__rate strong').text().trim();
    const rating = parseInt(ratingText) || 5;
    const sourceSpans = $item.find('.review-summary__source span');
    const mallName = sourceSpans.eq(0).text().trim() || undefined;
    const date = sourceSpans.eq(1).text().trim() || undefined;
    const thumbSrc = $item.find('.review-summary__thumb img').attr('src') || '';
    addReview(content, rating, mallName, date, thumbSrc);
  });

  // 5. 블로그 리뷰 (.blogreview__item)
  $('.blogreview__item').each((_, item) => {
    const $item = $(item);
    const content = $item.find('.blogreview__text, .review__text, .blogreview__cont').text().trim();
    const ratingText = $item.find('.blogreview__score, .review__score, strong').first().text().trim();
    const rating = parseInt(ratingText) || 5;
    const mallName = $item.find('.blogreview__mall, .review__mall, .blogreview__source span').first().text().trim() || undefined;
    const date = $item.find('.blogreview__date, .review__date').text().trim() || undefined;
    const thumbSrc = $item.find('.blogreview__thumb img, .review__thumb img').attr('src') || '';
    addReview(content, rating, mallName, date, thumbSrc);
  });

  // 6. 포토 리뷰 (.photoreview__item)
  $('.photoreview__item').each((_, item) => {
    const $item = $(item);
    const content = $item.find('.photoreview__text, .review__text').text().trim();
    const ratingText = $item.find('.photoreview__score, strong').first().text().trim();
    const rating = parseInt(ratingText) || 5;
    const mallName = $item.find('.photoreview__mall, .photoreview__source span').first().text().trim() || undefined;
    const date = $item.find('.photoreview__date').text().trim() || undefined;
    const thumbSrc = $item.find('.photoreview__thumb img').attr('src') || '';
    addReview(content, rating, mallName, date, thumbSrc);
  });

  // 7. 일반 리뷰 아이템 (.review__item, .mall-review__item)
  $('.review__item, .mall-review__item, [class*="review"][class*="item"]').each((_, item) => {
    const $item = $(item);
    const content = $item.find('[class*="text"], [class*="content"], [class*="cont"]').first().text().trim();
    const ratingText = $item.find('[class*="score"] strong, [class*="rate"] strong, [class*="rating"]').first().text().trim();
    const rating = parseInt(ratingText) || 5;
    const sourceSpans = $item.find('[class*="source"] span, [class*="mall"]');
    const mallName = sourceSpans.eq(0).text().trim() || undefined;
    const date = $item.find('[class*="date"]').text().trim() || undefined;
    const thumbSrc = $item.find('[class*="thumb"] img').attr('src') || '';
    addReview(content, rating, mallName, date, thumbSrc);
  });

  // 8. JSON-LD 리뷰도 추가
  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript && reviews.length < maxReviews) {
    try {
      const productData = JSON.parse(seoScript);
      if (productData.review && Array.isArray(productData.review)) {
        const extractMallFromImages = (images: any[]): string | undefined => {
          if (!images || !Array.isArray(images)) return undefined;
          for (const img of images) {
            const src = img.url || img.contentUrl || '';
            if (src.includes('cjonstyle')) return 'CJ온스타일';
            if (src.includes('ssg')) return 'SSG';
            if (src.includes('hmall')) return '현대몰';
            if (src.includes('lotte')) return '롯데몰';
            if (src.includes('gmarket')) return '지마켓';
            if (src.includes('11st')) return '11번가';
            if (src.includes('naver')) return '네이버쇼핑';
            if (src.includes('auction')) return '옥션';
            if (src.includes('interpark')) return '인터파크';
            if (src.includes('tmon')) return '티몬';
            if (src.includes('wemakeprice')) return '위메프';
          }
          return undefined;
        };

        productData.review.forEach((r: any) => {
          const content = r.reviewBody || '';
          if (content.length < 10 || reviews.length >= maxReviews) return;

          const reviewId = generateReviewId(content, r.author?.name);
          if (seenIds.has(reviewId)) return;
          seenIds.add(reviewId);

          const mallName = extractMallFromImages(r.image) || r.publisher?.name;

          const images: Array<{ thumbnail: string; original?: string; mallName?: string }> = [];
          if (r.image && Array.isArray(r.image)) {
            r.image.forEach((img: any) => {
              const src = img.url || img.contentUrl || '';
              if (src && !src.includes('thum_none') && !src.includes('noImg')) {
                const fullSrc = src.startsWith('//') ? 'https:' + src : src;
                images.push({
                  thumbnail: fullSrc,
                  original: fullSrc.replace(/\?.*$/, ''),
                  mallName,
                });
              }
            });
          }

          reviews.push({
            reviewId,
            rating: parseFloat(r.reviewRating?.ratingValue) || 5,
            content,
            author: r.author?.name,
            mallName,
            images,
          });
        });
      }
    } catch (e) {}
  }

  return reviews.slice(0, maxReviews);
}

// =====================================================
// 상세 페이지에서 스펙 추출 (categoryPath, features 포함)
// =====================================================

async function extractSpecsFromPage(page: Page): Promise<{
  description: string;
  categoryPath: string;
  features: string[];
  specs: Record<string, string>;
}> {
  const html = await page.content();
  const $ = load(html);

  let description = '';
  let categoryPath = '';
  const features: string[] = [];
  const specs: Record<string, string> = {};

  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript) {
    try {
      const productData = JSON.parse(seoScript);
      description = productData.description || '';

      // description 예시: "분유제조기/출수형/취수방식:1가지/크기:190x420x290mm/무게:4.3kg"
      // 또는: "카시트/일체형/사용대상:12개월~7세/[특징]/5점식벨트/ISOFIX(벨트형)"

      // [특징] 이후의 내용 분리
      const featureIdx = description.indexOf('[특징]');
      let mainPart = description;
      let featurePart = '';

      if (featureIdx >= 0) {
        mainPart = description.slice(0, featureIdx);
        featurePart = description.slice(featureIdx + '[특징]'.length);

        // 특징 파싱 (/ 로 구분)
        featurePart.split('/').forEach((f: string) => {
          const trimmed = f.trim();
          if (trimmed && trimmed !== '[특징]') {
            features.push(trimmed);
          }
        });
      }

      // 메인 파트 파싱
      const parts = mainPart.split('/');
      const categoryParts: string[] = [];

      parts.forEach((part: string) => {
        const trimmed = part.trim();
        if (!trimmed) return;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          // key:value 형태 → specs
          specs[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
        } else if (!trimmed.startsWith('[')) {
          // 콜론이 없고 대괄호로 시작하지 않으면 → categoryPath
          categoryParts.push(trimmed);
        }
      });

      categoryPath = categoryParts.join('/');

    } catch (e) {}
  }

  return { description, categoryPath, features, specs };
}

// =====================================================
// 제품 상세 크롤링 (Puppeteer - 브라우저 재사용)
// =====================================================

async function fetchProductDetail(
  modelNo: string,
  sharedBrowser: Browser
): Promise<{
  reviews: EnuriReview[];
  mallPrices: EnuriMallPrice[];
  description: string;
  categoryPath: string;
  features: string[];
  specs: Record<string, string>;
}> {
  let page: Page | null = null;

  try {
    page = await sharedBrowser.newPage();

    // 리소스 최적화 (이미지는 로드 - 리뷰 이미지 필요)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
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

    // 가격 테이블 로딩 대기
    await delay(2000);

    // 리뷰 영역으로 스크롤
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await delay(1000);

    // 데이터 추출
    const mallPrices = await extractPricesFromPage(page);
    const reviews = await extractReviewsFromPage(page);
    const { description, categoryPath, features, specs } = await extractSpecsFromPage(page);

    return { reviews, mallPrices, description, categoryPath, features, specs };
  } catch (error) {
    console.error(`  ❌ ${modelNo} 오류:`, error instanceof Error ? error.message : error);
    return { reviews: [], mallPrices: [], description: '', categoryPath: '', features: [], specs: {} };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }
}

// =====================================================
// 메인 크롤링 함수
// =====================================================

async function crawlSearch(keyword: string, options: {
  minReviews?: number;
  maxProducts?: number;
  detailDelay?: number;
} = {}) {
  const { minReviews = 1, maxProducts = 50, detailDelay = 1000 } = options;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║     에누리 검색 크롤링 V2: "${keyword}" (Puppeteer)            `);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 1. 검색 결과에서 제품 목록 수집 (fetch - 빠름)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  제품 목록 수집 (fetch + JSON-LD)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const searchUrl = `https://www.enuri.com/search.jsp?keyword=${encodeURIComponent(keyword)}`;
  console.log(`🔍 검색 URL: ${searchUrl}\n`);

  const allProducts = (await fetchProductList(keyword)).map(p => ({
    ...p,
    reviews: [] as EnuriReview[],
    mallPrices: [] as EnuriMallPrice[],
  }));

  console.log(`📊 총 검색 결과: ${allProducts.length}개`);

  // 2. 리뷰 있는 상품 필터링
  const withReviews = allProducts.filter(p => p.reviewCount >= minReviews);
  console.log(`   리뷰 ${minReviews}개 이상 상품: ${withReviews.length}개`);

  // 리뷰순 정렬
  withReviews.sort((a, b) => b.reviewCount - a.reviewCount);

  // maxProducts 제한
  const targetProducts = withReviews.slice(0, maxProducts);

  if (targetProducts.length === 0) {
    console.log('\n⚠️ 리뷰가 있는 상품이 없습니다.');
    return;
  }

  // 3. Puppeteer로 상세 정보 수집
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`2️⃣  상세 정보 수집 - Puppeteer (${targetProducts.length}개 제품)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let totalReviews = 0;
  let totalImages = 0;
  let totalPrices = 0;

  // 브라우저 한 번만 생성
  const browser = await createBrowser();

  try {
    for (let i = 0; i < targetProducts.length; i++) {
      const product = targetProducts[i];
      process.stdout.write(`[${i + 1}/${targetProducts.length}] ${product.modelNo} "${product.title.slice(0, 25)}..." (리뷰:${product.reviewCount})... `);

      const detail = await fetchProductDetail(product.modelNo, browser);
      product.reviews = detail.reviews;
      product.mallPrices = detail.mallPrices;
      product.description = detail.description;
      product.categoryPath = detail.categoryPath;
      product.features = detail.features;
      product.specs = detail.specs;

      const imageCount = product.reviews.reduce((sum, r) => sum + r.images.length, 0);
      totalReviews += detail.reviews.length;
      totalImages += imageCount;
      totalPrices += detail.mallPrices.length;

      const featureStr = detail.features.length > 0 ? ` [${detail.features.slice(0, 3).join(', ')}${detail.features.length > 3 ? '...' : ''}]` : '';
      const catStr = detail.categoryPath ? ` (${detail.categoryPath})` : '';
      console.log(`리뷰 ${detail.reviews.length}개, 이미지 ${imageCount}개, 가격 ${detail.mallPrices.length}개${catStr}${featureStr}`);

      await delay(detailDelay);
    }
  } finally {
    try {
      await browser.close();
    } catch {}
  }

  // 4. 통계
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣  크롤링 결과');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📦 제품: ${targetProducts.length}개`);
  console.log(`📝 리뷰: ${totalReviews}개`);
  console.log(`🖼️  이미지: ${totalImages}개`);
  console.log(`💰 가격 정보: ${totalPrices}개`);

  // 브랜드 통계
  const brandStats: Record<string, number> = {};
  targetProducts.forEach(p => {
    const brand = p.brand || '(미상)';
    brandStats[brand] = (brandStats[brand] || 0) + 1;
  });

  console.log('\n📊 브랜드별 제품 수:');
  Object.entries(brandStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => {
      console.log(`   ${brand}: ${count}개`);
    });

  // categoryPath 통계
  const categoryStats: Record<string, number> = {};
  targetProducts.forEach(p => {
    const cat = p.categoryPath || '(미분류)';
    categoryStats[cat] = (categoryStats[cat] || 0) + 1;
  });

  if (Object.keys(categoryStats).length > 1) {
    console.log('\n📁 카테고리별 제품 수:');
    Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}개`);
      });
  }

  // 5. JSON 저장
  const safeName = keyword.replace(/[^가-힣a-zA-Z0-9]/g, '_');
  const outputData = {
    crawledAt: new Date().toISOString(),
    keyword,
    summary: {
      totalProducts: targetProducts.length,
      totalBrands: Object.keys(brandStats).length,
      totalReviews,
      totalImages,
      totalPrices,
      avgReviews: targetProducts.length > 0 ? Math.round(totalReviews / targetProducts.length) : 0,
      avgPriceMalls: targetProducts.length > 0 ? Math.round(totalPrices / targetProducts.length) : 0,
      avgPrice: targetProducts.filter(p => p.lowPrice > 0).length > 0
        ? Math.round(
            targetProducts.filter(p => p.lowPrice > 0).reduce((s, p) => s + p.lowPrice, 0) /
            targetProducts.filter(p => p.lowPrice > 0).length
          )
        : 0,
    },
    products: targetProducts,
    brandStats,
    categoryStats,
  };

  const outputPath = `/tmp/enuri_search_${safeName}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 JSON 저장: ${outputPath}`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      ✅ 크롤링 완료                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  return outputPath;
}

// =====================================================
// CLI
// =====================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('--')) {
    console.log(`
Usage: npx tsx scripts/crawl-enuri-search.ts "<검색어>" [options]

Options:
  --min-reviews=N   최소 리뷰 수 (기본: 1)
  --max-products=N  최대 제품 수 (기본: 50)
  --delay=N         상세 페이지 딜레이 ms (기본: 1000)

Example:
  npx tsx scripts/crawl-enuri-search.ts "분유제조기"
  npx tsx scripts/crawl-enuri-search.ts "분유제조기" --min-reviews=1 --max-products=20
`);
    process.exit(1);
  }

  const keyword = args[0];
  const minReviews = parseInt(args.find(a => a.startsWith('--min-reviews='))?.split('=')[1] || '1');
  const maxProducts = parseInt(args.find(a => a.startsWith('--max-products='))?.split('=')[1] || '50');
  const detailDelay = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '1000');

  await crawlSearch(keyword, { minReviews, maxProducts, detailDelay });
}

main().catch(console.error);
