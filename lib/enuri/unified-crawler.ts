/**
 * 에누리 통합 크롤러
 * 제품 목록 + 리뷰 + 가격 통합 크롤링
 */

import puppeteer, { Browser } from 'puppeteer';
import { load } from 'cheerio';
import {
  EnuriProduct,
  EnuriProductWithDetails,
  EnuriCategory,
  EnuriCrawlResult,
} from '../../types/enuri';
import { fetchEnuriReviews, createBrowser, EnuriReview } from './review-crawler';
import { fetchEnuriPrices } from './price-crawler';
import { EnuriMallPrice } from '../../types/enuri';

// =====================================================
// 설정
// =====================================================

const DEFAULT_MAX_PRODUCTS = 50;
const DEFAULT_REVIEW_TOP_N = 10;
const CONCURRENT_LIMIT = 3; // 동시 크롤링 제한

// =====================================================
// 제품 목록 크롤링
// =====================================================

interface ProductListItem {
  modelNo: string;
  title: string;
  brand: string | null;
  price: number | null;
  highPrice: number | null;
  thumbnail: string | null;
  imageUrl: string | null;
  rank: number;
  detailUrl: string;
  averageRating: number | null;
  reviewCount: number;
}

async function fetchProductList(
  categoryCode: string,
  maxProducts: number,
  browser: Browser
): Promise<{ products: ProductListItem[]; category: EnuriCategory }> {
  const page = await browser.newPage();

  try {
    // 불필요한 리소스 차단
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

    // 카테고리 페이지 로드 (인기순)
    const url = `https://www.enuri.com/list.jsp?cate=${categoryCode}&sort=popularity&page=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const products: ProductListItem[] = [];
    let pageNum = 1;

    while (products.length < maxProducts) {
      const html = await page.content();
      const $ = load(html);

      // 카테고리 정보 추출 (첫 페이지만)
      let categoryName = '';
      let categoryPath = '';
      if (pageNum === 1) {
        categoryName = $('.breadcrumb li:last-child, .cate-title, h1').first().text().trim() || '알 수 없음';
        categoryPath = $('.breadcrumb').text().replace(/\s+/g, ' ').trim() || '';
      }

      // 제품 목록 파싱
      const productItems = $('.list-product-item, .prod-item, [class*="prod-list"] li');

      if (productItems.length === 0) {
        console.log(`   페이지 ${pageNum}: 제품 없음`);
        break;
      }

      productItems.each((i, el) => {
        if (products.length >= maxProducts) return false;

        const $item = $(el);

        // modelNo 추출
        const link = $item.find('a[href*="modelno"]').first().attr('href') || '';
        const modelNoMatch = link.match(/modelno=(\d+)/);
        const modelNo = modelNoMatch ? modelNoMatch[1] : '';

        if (!modelNo) return;

        // 이미 있으면 스킵
        if (products.some(p => p.modelNo === modelNo)) return;

        // 제품 정보 추출
        const title = $item.find('.prod-name, .prod-tit, [class*="name"] a').first().text().trim() ||
                     $item.find('a').first().attr('title') || '';

        const brand = $item.find('.brand, .prod-brand, [class*="brand"]').first().text().trim() || null;

        // 가격
        const priceText = $item.find('.price, .prod-price, [class*="price"]').text().replace(/[^0-9]/g, '');
        const price = parseInt(priceText) || null;

        // 이미지
        const imgSrc = $item.find('img').first().attr('src') ||
                      $item.find('img').first().attr('data-src') || null;
        const thumbnail = imgSrc?.startsWith('//') ? 'https:' + imgSrc : imgSrc;

        // 평점 & 리뷰수
        const ratingText = $item.find('[class*="rating"], [class*="star"]').text();
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        const averageRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = $item.find('[class*="review"], [class*="count"]').text();
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0;

        products.push({
          modelNo,
          title,
          brand,
          price,
          highPrice: null,
          thumbnail,
          imageUrl: thumbnail,
          rank: products.length + 1,
          detailUrl: `https://www.enuri.com/detail.jsp?modelno=${modelNo}`,
          averageRating,
          reviewCount,
        });
      });

      console.log(`   페이지 ${pageNum}: ${products.length}개 수집`);

      // 다음 페이지
      if (products.length < maxProducts) {
        pageNum++;
        const nextUrl = `https://www.enuri.com/list.jsp?cate=${categoryCode}&sort=popularity&page=${pageNum}`;
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // 카테고리 정보
    const category: EnuriCategory = {
      categoryCode,
      categoryName: '카테고리',
      categoryPath: '',
      totalProductCount: products.length,
      crawledProductCount: products.length,
    };

    return { products, category };
  } finally {
    await page.close();
  }
}

// =====================================================
// 제품 상세 크롤링 (스펙)
// =====================================================

async function fetchProductDetails(
  modelNo: string,
  browser: Browser
): Promise<Partial<EnuriProduct>> {
  const page = await browser.newPage();

  try {
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const html = await page.content();
    const $ = load(html);

    // JSON-LD에서 스펙 추출
    let spec: Record<string, string> = {};
    let specRaw = '';
    let averageRating: number | null = null;
    let reviewCount = 0;

    const seoScript = $('#SEOSCRIPT').html();
    if (seoScript) {
      try {
        specRaw = seoScript;
        const productData = JSON.parse(seoScript);

        // 스펙 파싱
        if (productData.additionalProperty && Array.isArray(productData.additionalProperty)) {
          productData.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.value) {
              spec[prop.name] = prop.value;
            }
          });
        }

        // 평점/리뷰
        if (productData.aggregateRating) {
          averageRating = parseFloat(productData.aggregateRating.ratingValue) || null;
          reviewCount = parseInt(productData.aggregateRating.reviewCount) || 0;
        }
      } catch (e) {
        // 파싱 실패
      }
    }

    return {
      spec,
      specRaw,
      averageRating,
      reviewCount,
    };
  } finally {
    await page.close();
  }
}

// =====================================================
// 배치 실행 유틸리티
// =====================================================

async function runBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }

  return results;
}

// =====================================================
// 메인 통합 크롤러
// =====================================================

export interface CrawlOptions {
  categoryCode: string;
  maxProducts?: number;
  includeReviews?: boolean;
  includePrices?: boolean;
  reviewTopN?: number;
  onProgress?: (message: string) => void;
}

export async function crawlEnuriCategory(options: CrawlOptions): Promise<EnuriCrawlResult> {
  const {
    categoryCode,
    maxProducts = DEFAULT_MAX_PRODUCTS,
    includeReviews = true,
    includePrices = true,
    reviewTopN = DEFAULT_REVIEW_TOP_N,
    onProgress = console.log,
  } = options;

  const result: EnuriCrawlResult = {
    category: {
      categoryCode,
      categoryName: '',
      categoryPath: '',
      totalProductCount: 0,
      crawledProductCount: 0,
    },
    products: [],
    crawledAt: new Date(),
    success: false,
  };

  let browser: Browser | null = null;

  try {
    onProgress(`🚀 에누리 크롤링 시작: 카테고리 ${categoryCode}`);
    browser = await createBrowser();

    // 1. 제품 목록 크롤링
    onProgress(`📦 제품 목록 수집 중... (최대 ${maxProducts}개)`);
    const { products: productList, category } = await fetchProductList(categoryCode, maxProducts, browser);
    result.category = category;
    result.category.totalProductCount = productList.length;

    onProgress(`   ✓ ${productList.length}개 제품 발견`);

    // 2. 각 제품 상세 정보 + 리뷰 + 가격 크롤링
    const productsWithDetails: EnuriProductWithDetails[] = [];

    for (let i = 0; i < productList.length; i++) {
      const product = productList[i];
      onProgress(`\n[${i + 1}/${productList.length}] ${product.title.slice(0, 40)}...`);

      // 기본 정보
      const fullProduct: EnuriProductWithDetails = {
        modelNo: product.modelNo,
        title: product.title,
        brand: product.brand,
        price: product.price,
        highPrice: product.highPrice,
        categoryCode,
        rank: product.rank,
        detailUrl: product.detailUrl,
        thumbnail: product.thumbnail,
        imageUrl: product.imageUrl,
        regDate: null,
        specRaw: null,
        spec: {},
        filterAttrs: {},
        averageRating: product.averageRating,
        reviewCount: product.reviewCount,
        reviews: [],
        mallPrices: [],
      };

      // 상세 정보 (스펙)
      try {
        const details = await fetchProductDetails(product.modelNo, browser);
        fullProduct.spec = details.spec || {};
        fullProduct.specRaw = details.specRaw || null;
        fullProduct.averageRating = details.averageRating || fullProduct.averageRating;
        fullProduct.reviewCount = details.reviewCount || fullProduct.reviewCount;
        onProgress(`   📋 스펙: ${Object.keys(fullProduct.spec).length}개 항목`);
      } catch (e) {
        onProgress(`   ⚠️ 스펙 크롤링 실패`);
      }

      // 리뷰 (상위 N개 제품만)
      if (includeReviews && i < reviewTopN) {
        try {
          const reviewResult = await fetchEnuriReviews(product.modelNo, 2, browser);
          if (reviewResult.success) {
            fullProduct.reviews = reviewResult.reviews;
            fullProduct.averageRating = reviewResult.averageRating || fullProduct.averageRating;
            fullProduct.reviewCount = reviewResult.reviewCount || fullProduct.reviewCount;
            const imageCount = reviewResult.reviews.reduce((sum, r) => sum + r.images.length, 0);
            onProgress(`   📝 리뷰: ${reviewResult.reviews.length}개, 이미지: ${imageCount}개`);
          }
        } catch (e) {
          onProgress(`   ⚠️ 리뷰 크롤링 실패`);
        }
      }

      // 가격
      if (includePrices) {
        try {
          const priceResult = await fetchEnuriPrices(product.modelNo, browser);
          if (priceResult.success) {
            fullProduct.mallPrices = priceResult.mallPrices;
            fullProduct.price = priceResult.lowestPrice || fullProduct.price;
            fullProduct.highPrice = priceResult.priceMax || null;
            onProgress(`   💰 가격: ${priceResult.mallCount}개 쇼핑몰, 최저가 ${priceResult.lowestPrice?.toLocaleString()}원`);
          }
        } catch (e) {
          onProgress(`   ⚠️ 가격 크롤링 실패`);
        }
      }

      productsWithDetails.push(fullProduct);

      // 메모리 관리를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    result.products = productsWithDetails;
    result.category.crawledProductCount = productsWithDetails.length;
    result.success = true;

    // 요약
    onProgress(`\n${'═'.repeat(50)}`);
    onProgress(`✅ 크롤링 완료!`);
    onProgress(`   카테고리: ${result.category.categoryCode}`);
    onProgress(`   제품 수: ${result.products.length}개`);

    const totalReviews = result.products.reduce((sum, p) => sum + p.reviews.length, 0);
    const totalImages = result.products.reduce(
      (sum, p) => sum + p.reviews.reduce((s, r) => s + r.images.length, 0), 0
    );
    const productsWithPrices = result.products.filter(p => p.mallPrices.length > 0).length;

    onProgress(`   리뷰: ${totalReviews}개 (이미지 ${totalImages}개)`);
    onProgress(`   가격 정보: ${productsWithPrices}개 제품`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    onProgress(`❌ 크롤링 실패: ${result.error}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 무시
      }
    }
  }

  return result;
}

// =====================================================
// 간편 export
// =====================================================

export { fetchEnuriReviews } from './review-crawler';
export { fetchEnuriPrices } from './price-crawler';
