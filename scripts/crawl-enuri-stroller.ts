/**
 * 에누리 유모차 전체 크롤링 스크립트
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';

// 유모차 하위 카테고리
const STROLLER_CATEGORIES = [
  { code: '10040101', name: '디럭스형' },
  { code: '10040102', name: '휴대용' },
  { code: '10040103', name: '절충형' },
  { code: '10040104', name: '쌍둥이용' },
  { code: '10040105', name: '유모차악세서리' },
];

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
  reviews?: Array<{ rating: number; content: string; author: string }>;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractProducts(html: string, subCategory: string): EnuriProduct[] {
  const $ = cheerio.load(html);
  const products: EnuriProduct[] = [];

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

async function fetchProductDetail(modelNo: string): Promise<{
  description: string;
  specs: Record<string, string>;
  reviews: Array<{ rating: number; content: string; author: string }>;
}> {
  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    let description = '';
    const specs: Record<string, string> = {};
    const reviews: Array<{ rating: number; content: string; author: string }> = [];

    const seoScript = $('#SEOSCRIPT').html();
    if (seoScript) {
      try {
        const productData = JSON.parse(seoScript);
        description = productData.description || '';

        const parts = description.split('/');
        parts.forEach((part: string) => {
          const colonIdx = part.indexOf(':');
          if (colonIdx > 0) {
            specs[part.slice(0, colonIdx).trim()] = part.slice(colonIdx + 1).trim();
          }
        });

        if (productData.review && Array.isArray(productData.review)) {
          productData.review.forEach((r: any) => {
            reviews.push({
              rating: parseFloat(r.reviewRating?.ratingValue) || 0,
              content: r.reviewBody || '',
              author: r.author?.name || '',
            });
          });
        }
      } catch (e) {}
    }

    return { description, specs, reviews };
  } catch (error) {
    return { description: '', specs: {}, reviews: [] };
  }
}

async function crawlStrollers() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     에누리 유모차 전체 크롤링                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allProducts: EnuriProduct[] = [];
  const existingIds = new Set<string>();

  for (const cat of STROLLER_CATEGORIES) {
    console.log(`\n📂 [${cat.name}] (${cat.code})`);

    const url = `https://www.enuri.com/list.jsp?cate=${cat.code}&tabType=1`;
    const html = await fetchPage(url);
    const products = extractProducts(html, cat.name);

    const newProducts = products.filter(p => {
      if (existingIds.has(p.modelNo)) return false;
      existingIds.add(p.modelNo);
      return true;
    });

    allProducts.push(...newProducts);
    console.log(`   총 상품: ${products.length}개 (신규: ${newProducts.length}개)`);

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 총 유니크 상품: ${allProducts.length}개`);

  // 리뷰 있는 상품만 필터링
  const withReviews = allProducts.filter(p => p.reviewCount > 0);
  console.log(`   리뷰 있는 상품: ${withReviews.length}개`);

  // 리뷰순 정렬, 상위 15개 상세 정보 추출
  const sortedProducts = [...allProducts].sort((a, b) => b.reviewCount - a.reviewCount);
  const top15 = sortedProducts.filter(p => p.reviewCount > 0).slice(0, 15);

  console.log(`\n📝 상위 ${top15.length}개 상품 상세 정보 추출 중...`);
  for (const product of top15) {
    process.stdout.write(`   ${product.modelNo}... `);
    const detail = await fetchProductDetail(product.modelNo);
    product.description = detail.description;
    product.specs = detail.specs;
    product.reviews = detail.reviews;
    console.log(`리뷰 ${detail.reviews.length}개`);
    await new Promise(r => setTimeout(r, 500));
  }

  // 브랜드 통계
  const brandStats: Record<string, number> = {};
  allProducts.forEach(p => {
    const brand = p.brand || '(미상)';
    brandStats[brand] = (brandStats[brand] || 0) + 1;
  });

  // JSON 저장
  const outputData = {
    crawledAt: new Date().toISOString(),
    categoryCode: '100401',
    categoryName: '유모차',
    summary: {
      totalProducts: allProducts.length,
      totalBrands: Object.keys(brandStats).length,
      withReviews: withReviews.length,
      avgReviews: Math.round(allProducts.reduce((s, p) => s + p.reviewCount, 0) / allProducts.length),
      avgPrice: Math.round(allProducts.filter(p => p.lowPrice > 0).reduce((s, p) => s + p.lowPrice, 0) / allProducts.filter(p => p.lowPrice > 0).length),
    },
    products: sortedProducts,
    brandStats,
  };

  const outputPath = '/tmp/enuri_stroller.json';
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 JSON 저장 완료: ${outputPath}`);

  console.log('\n✅ 크롤링 완료!');
  console.log(`   총 상품: ${allProducts.length}개`);
  console.log(`   리뷰 있는 상품: ${withReviews.length}개`);
}

crawlStrollers().catch(console.error);
