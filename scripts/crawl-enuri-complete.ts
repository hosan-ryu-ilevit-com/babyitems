/**
 * 에누리 완전 크롤러 (제품 + 리뷰 + 가격)
 * fetch + cheerio 기반 - Puppeteer 불필요
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import { createHash } from 'crypto';

// =====================================================
// 카테고리 설정
// =====================================================

const CATEGORIES: Record<string, { code: string; name: string; subCategories: Array<{ code: string; name: string }> }> = {
  car_seat: {
    code: '100402',
    name: '카시트',
    subCategories: [
      { code: '10040201', name: '일체형' },
      { code: '10040202', name: '분리형' },
      { code: '10040203', name: '바구니형' },
      { code: '10040204', name: '부스터형' },
    ],
  },
  stroller: {
    code: '100401',
    name: '유모차',
    subCategories: [
      { code: '10040101', name: '디럭스형' },
      { code: '10040102', name: '휴대용' },
      { code: '10040103', name: '절충형' },
      { code: '10040104', name: '쌍둥이용' },
      { code: '10040105', name: '유모차악세서리' },
    ],
  },
  diaper: {
    code: '100729',
    name: '기저귀',
    subCategories: [
      { code: '10072901', name: '기저귀' },
      { code: '10072902', name: '팬티형기저귀' },
      { code: '10072903', name: '수영장팬티' },
      { code: '10072904', name: '기저귀악세서리' },
    ],
  },
};

// =====================================================
// 타입 정의
// =====================================================

interface EnuriReview {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  mallName?: string;
  images: Array<{ thumbnail: string; original?: string; mallName?: string }>;
}

interface EnuriMallPrice {
  mallName: string;
  mallLogo?: string;
  price: number;
  cardPrice?: number;
  deliveryFee: number;
  totalPrice: number;
  productUrl: string;
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
  subCategory: string;
  description?: string;
  specs?: Record<string, string>;
  reviews: EnuriReview[];
  mallPrices: EnuriMallPrice[];
}

// =====================================================
// 유틸리티
// =====================================================

function generateReviewId(content: string, author?: string): string {
  const data = `${content}|${author || ''}`;
  return createHash('md5').update(data).digest('hex').substring(0, 16);
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// 제품 목록 추출 (JSON-LD에서)
// =====================================================

function extractProductsFromList(html: string, subCategory: string): Omit<EnuriProduct, 'reviews' | 'mallPrices'>[] {
  const $ = cheerio.load(html);
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
              subCategory,
            });
          }
        }
      }
    } catch (e) {}
  });

  return products;
}

// =====================================================
// 상세 페이지에서 리뷰 추출
// =====================================================

function extractReviewsFromDetail($: cheerio.CheerioAPI): EnuriReview[] {
  const reviews: EnuriReview[] = [];

  // JSON-LD에서 리뷰 추출
  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript) {
    try {
      const productData = JSON.parse(seoScript);
      if (productData.review && Array.isArray(productData.review)) {
        productData.review.forEach((r: any) => {
          const content = r.reviewBody || '';
          if (content.length >= 10) {
            reviews.push({
              reviewId: generateReviewId(content, r.author?.name),
              rating: parseFloat(r.reviewRating?.ratingValue) || 5,
              content,
              author: r.author?.name,
              images: [],
            });
          }
        });
      }
    } catch (e) {}
  }

  // HTML에서 리뷰 이미지 수집
  const allImages: Array<{ thumbnail: string; original?: string; mallName?: string }> = [];

  // 리뷰 영역의 이미지 수집
  $('[class*="review"] img, [class*="Review"] img, .mall-review img').each((_, img) => {
    let src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
    if (src && !src.includes('icon') && !src.includes('profile') && !src.includes('star') &&
        !src.includes('logo') && !src.includes('btn') && !src.includes('noImg') &&
        !src.includes('storage.enuri.info/logo')) {
      if (src.startsWith('//')) {
        src = 'https:' + src;
      }
      // 쇼핑몰 도메인 추출
      let mallName: string | undefined;
      try {
        const url = new URL(src);
        if (url.hostname.includes('cjonstyle')) mallName = 'CJ온스타일';
        else if (url.hostname.includes('ssg')) mallName = 'SSG';
        else if (url.hostname.includes('hmall')) mallName = '현대몰';
        else if (url.hostname.includes('lotte')) mallName = '롯데몰';
        else if (url.hostname.includes('gmarket')) mallName = '지마켓';
        else if (url.hostname.includes('11st')) mallName = '11번가';
        else if (url.hostname.includes('naver')) mallName = '네이버쇼핑';
      } catch {}
      allImages.push({ thumbnail: src, original: src.replace(/\?.*$/, ''), mallName });
    }
  });

  // 이미지를 리뷰에 분배
  if (reviews.length > 0 && allImages.length > 0) {
    const imagesPerReview = Math.ceil(allImages.length / reviews.length);
    reviews.forEach((review, i) => {
      const startIdx = i * imagesPerReview;
      review.images = allImages.slice(startIdx, startIdx + imagesPerReview);
    });
  }

  return reviews;
}

// =====================================================
// 상세 페이지에서 가격 추출 (올바른 선택자!)
// =====================================================

function extractPricesFromDetail($: cheerio.CheerioAPI): EnuriMallPrice[] {
  const prices: EnuriMallPrice[] = [];

  // 새로운 에누리 가격 테이블 구조
  // tr.is-specialline, tr.is-minline 등
  $('table.tb-compare__list tbody tr').each((_, tr) => {
    const $tr = $(tr);

    // 쇼핑몰명 (이미지 alt)
    const mallImg = $tr.find('.col--mall img, .row--mall img').first();
    const mallName = mallImg.attr('alt')?.trim() || '';
    const mallLogo = mallImg.attr('src') || '';

    // 가격 (strong 태그 내부)
    const priceStrong = $tr.find('.col--price strong, .row--mall.col--price strong').first();
    const priceText = priceStrong.text().replace(/,/g, '').trim();
    const price = parseInt(priceText) || 0;

    // 카드가격 (data-benefit="card" 확인)
    let cardPrice: number | undefined;
    const isBenefitCard = $tr.find('[data-benefit="card"]').length > 0;
    if (isBenefitCard) {
      cardPrice = price;
    }

    // 배송비
    const deliCell = $tr.find('.col--delifee, .row--mall.col--delifee');
    const deliText = deliCell.text().trim();
    let deliveryFee = 0;
    if (!deliText.includes('무료')) {
      const deliMatch = deliText.match(/(\d{1,3}(,\d{3})*)/);
      deliveryFee = deliMatch ? parseInt(deliMatch[1].replace(/,/g, '')) : 0;
    }

    // 링크
    const link = $tr.find('a').first().attr('href') || '';
    const productUrl = link.startsWith('/') ? `https://www.enuri.com${link}` : link;

    if (price >= 10000 && price < 10000000 && mallName) {
      prices.push({
        mallName,
        mallLogo: mallLogo.startsWith('//') ? 'https:' + mallLogo : mallLogo,
        price,
        cardPrice,
        deliveryFee,
        totalPrice: price + deliveryFee,
        productUrl,
      });
    }
  });

  // 중복 제거 (같은 쇼핑몰에서 카드가/일반가 둘 다 있을 수 있음)
  // 카드가가 있으면 카드가를, 없으면 일반가를 우선
  const mallMap = new Map<string, EnuriMallPrice>();
  for (const p of prices) {
    const existing = mallMap.get(p.mallName);
    if (!existing) {
      mallMap.set(p.mallName, p);
    } else if (p.cardPrice && !existing.cardPrice) {
      // 카드가를 우선
      mallMap.set(p.mallName, p);
    } else if (!p.cardPrice && !existing.cardPrice && p.price < existing.price) {
      // 둘 다 일반가면 더 저렴한 것
      mallMap.set(p.mallName, p);
    }
  }

  return Array.from(mallMap.values()).sort((a, b) => a.totalPrice - b.totalPrice);
}

// =====================================================
// 상세 페이지에서 스펙/설명 추출
// =====================================================

function extractSpecsFromDetail($: cheerio.CheerioAPI): { description: string; specs: Record<string, string> } {
  let description = '';
  const specs: Record<string, string> = {};

  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript) {
    try {
      const productData = JSON.parse(seoScript);
      description = productData.description || '';

      // description 파싱하여 스펙 추출
      const parts = description.split('/');
      parts.forEach((part: string) => {
        const colonIdx = part.indexOf(':');
        if (colonIdx > 0) {
          specs[part.slice(0, colonIdx).trim()] = part.slice(colonIdx + 1).trim();
        }
      });
    } catch (e) {}
  }

  return { description, specs };
}

// =====================================================
// 제품 상세 정보 가져오기
// =====================================================

async function fetchProductDetail(modelNo: string): Promise<{
  reviews: EnuriReview[];
  mallPrices: EnuriMallPrice[];
  description: string;
  specs: Record<string, string>;
}> {
  try {
    const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const reviews = extractReviewsFromDetail($);
    const mallPrices = extractPricesFromDetail($);
    const { description, specs } = extractSpecsFromDetail($);

    return { reviews, mallPrices, description, specs };
  } catch (error) {
    console.error(`  ❌ ${modelNo} 상세 페이지 오류:`, error);
    return { reviews: [], mallPrices: [], description: '', specs: {} };
  }
}

// =====================================================
// 메인 크롤링 함수
// =====================================================

async function crawlCategory(categoryKey: string, options: {
  minReviews?: number;
  maxProducts?: number;
  detailDelay?: number;
} = {}) {
  const { minReviews = 1, maxProducts = 100, detailDelay = 500 } = options;

  const category = CATEGORIES[categoryKey];
  if (!category) {
    console.error(`Unknown category: ${categoryKey}`);
    console.log('Available categories:', Object.keys(CATEGORIES).join(', '));
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║     에누리 ${category.name} 완전 크롤링 (제품+리뷰+가격)              `);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allProducts: EnuriProduct[] = [];
  const existingIds = new Set<string>();

  // 1. 하위 카테고리별로 제품 목록 수집
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  제품 목록 수집');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const subCat of category.subCategories) {
    console.log(`📂 [${subCat.name}] (${subCat.code})`);

    const listUrl = `https://www.enuri.com/list.jsp?cate=${subCat.code}&tabType=1`;
    const html = await fetchPage(listUrl);
    const products = extractProductsFromList(html, subCat.name);

    const newProducts = products.filter(p => {
      if (existingIds.has(p.modelNo)) return false;
      existingIds.add(p.modelNo);
      return true;
    });

    allProducts.push(...newProducts.map(p => ({ ...p, reviews: [], mallPrices: [] })));
    console.log(`   총 상품: ${products.length}개 (신규: ${newProducts.length}개)`);

    await delay(300);
  }

  console.log(`\n📊 총 유니크 상품: ${allProducts.length}개`);

  // 2. 리뷰 있는 상품만 필터링
  const withReviews = allProducts.filter(p => p.reviewCount >= minReviews);
  console.log(`   리뷰 ${minReviews}개 이상 상품: ${withReviews.length}개`);

  // 리뷰순 정렬
  withReviews.sort((a, b) => b.reviewCount - a.reviewCount);

  // maxProducts 제한
  const targetProducts = withReviews.slice(0, maxProducts);

  // 3. 각 제품의 상세 정보 수집
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`2️⃣  상세 정보 수집 (${targetProducts.length}개 제품)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let totalReviews = 0;
  let totalImages = 0;
  let totalPrices = 0;

  for (let i = 0; i < targetProducts.length; i++) {
    const product = targetProducts[i];
    process.stdout.write(`[${i + 1}/${targetProducts.length}] ${product.modelNo} (리뷰:${product.reviewCount})... `);

    const detail = await fetchProductDetail(product.modelNo);
    product.reviews = detail.reviews;
    product.mallPrices = detail.mallPrices;
    product.description = detail.description;
    product.specs = detail.specs;

    const imageCount = product.reviews.reduce((sum, r) => sum + r.images.length, 0);
    totalReviews += detail.reviews.length;
    totalImages += imageCount;
    totalPrices += detail.mallPrices.length;

    console.log(`리뷰 ${detail.reviews.length}개, 이미지 ${imageCount}개, 가격 ${detail.mallPrices.length}개`);

    await delay(detailDelay);
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

  // 5. JSON 저장
  const outputData = {
    crawledAt: new Date().toISOString(),
    categoryCode: category.code,
    categoryName: category.name,
    summary: {
      totalProducts: targetProducts.length,
      totalBrands: Object.keys(brandStats).length,
      totalReviews,
      totalImages,
      totalPrices,
      avgReviews: Math.round(totalReviews / targetProducts.length),
      avgPrice: Math.round(
        targetProducts.filter(p => p.lowPrice > 0).reduce((s, p) => s + p.lowPrice, 0) /
        targetProducts.filter(p => p.lowPrice > 0).length
      ),
    },
    products: targetProducts,
    brandStats,
  };

  const outputPath = `/tmp/enuri_${categoryKey}_complete.json`;
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

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/crawl-enuri-complete.ts <category> [options]

Categories:
  car_seat   카시트 (100402)
  stroller   유모차 (100401)
  diaper     기저귀 (100729)

Options:
  --min-reviews=N   최소 리뷰 수 (기본: 1)
  --max-products=N  최대 제품 수 (기본: 100)
  --delay=N         상세 페이지 딜레이 ms (기본: 500)

Example:
  npx tsx scripts/crawl-enuri-complete.ts car_seat --min-reviews=1 --max-products=50
`);
    process.exit(1);
  }

  const categoryKey = args[0];
  const minReviews = parseInt(args.find(a => a.startsWith('--min-reviews='))?.split('=')[1] || '1');
  const maxProducts = parseInt(args.find(a => a.startsWith('--max-products='))?.split('=')[1] || '100');
  const detailDelay = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '500');

  await crawlCategory(categoryKey, { minReviews, maxProducts, detailDelay });
}

main().catch(console.error);
