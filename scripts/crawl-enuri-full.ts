/**
 * 에누리 카시트 전체 크롤링 스크립트
 * 하위카테고리, 필터속성, 상품리스트, 메타데이터, 리뷰 전부 추출
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';

// 카시트 하위 카테고리
const CAR_SEAT_CATEGORIES = [
  { code: '10040201', name: '일체형' },
  { code: '10040202', name: '분리형' },
  { code: '10040203', name: '바구니형' },
  { code: '10040204', name: '부스터형' },
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

interface FilterOption {
  name: string;
  values: string[];
}

interface CategoryData {
  code: string;
  name: string;
  productCount: number;
  filters: FilterOption[];
  products: EnuriProduct[];
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

// JSON-LD에서 상품 목록 추출
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

// HTML에서 필터 옵션 추출
function extractFilters(html: string): FilterOption[] {
  const $ = cheerio.load(html);
  const filters: FilterOption[] = [];

  // JavaScript 변수에서 필터 데이터 추출 시도
  const scriptContent = $('script').text();

  // 브랜드 필터
  const brandMatch = scriptContent.match(/brandAttrList\s*=\s*\[(.*?)\]/s);
  if (brandMatch) {
    const brands = brandMatch[1].match(/"name"\s*:\s*"([^"]+)"/g);
    if (brands) {
      filters.push({
        name: '브랜드',
        values: brands.map(b => b.match(/"([^"]+)"$/)?.[1] || '').filter(Boolean)
      });
    }
  }

  // 필터 영역에서 직접 추출
  $('.filter-area, .attr-area, [class*="filter"]').each((_, area) => {
    const $area = $(area);
    const filterName = $area.find('.filter-title, .attr-title, dt').first().text().trim();
    const values: string[] = [];

    $area.find('input[type="checkbox"], li a, .attr-item').each((_, item) => {
      const value = $(item).text().trim() || $(item).attr('data-value') || '';
      if (value && value.length < 50) values.push(value);
    });

    if (filterName && values.length > 0) {
      filters.push({ name: filterName, values: values.slice(0, 20) });
    }
  });

  return filters;
}

// 상품 상세 정보 추출 (스펙 + 리뷰)
async function fetchProductDetail(modelNo: string): Promise<{
  description: string;
  specs: Record<string, string>;
  reviews: Array<{ rating: number; content: string; author: string }>;
  categoryPath: string[];
}> {
  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    let description = '';
    const specs: Record<string, string> = {};
    const reviews: Array<{ rating: number; content: string; author: string }> = [];
    const categoryPath: string[] = [];

    // SEOSCRIPT에서 Product JSON-LD 추출
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

        // 리뷰 추출
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

    // BreadcrumbList에서 카테고리 경로
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data['@type'] === 'BreadcrumbList') {
          data.itemListElement?.forEach((item: any) => {
            if (item.name && item.position > 1) categoryPath.push(item.name);
          });
        }
      } catch (e) {}
    });

    return { description, specs, reviews, categoryPath };
  } catch (error) {
    return { description: '', specs: {}, reviews: [], categoryPath: [] };
  }
}

// 메인 크롤링 함수
async function crawlCarSeats() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     에누리 카시트 전체 크롤링 (하위카테고리/필터/상품/리뷰)      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allData: CategoryData[] = [];
  const allProducts: EnuriProduct[] = [];
  const existingIds = new Set<string>();

  // 1. 각 하위 카테고리 크롤링
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  하위 카테고리별 크롤링');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const cat of CAR_SEAT_CATEGORIES) {
    console.log(`\n📂 [${cat.name}] (${cat.code})`);
    console.log('─'.repeat(60));

    const url = `https://www.enuri.com/list.jsp?cate=${cat.code}&tabType=1`;
    const html = await fetchPage(url);

    // 필터 추출
    const filters = extractFilters(html);

    // 상품 추출
    const products = extractProducts(html, cat.name);

    // 중복 제거
    const newProducts = products.filter(p => {
      if (existingIds.has(p.modelNo)) return false;
      existingIds.add(p.modelNo);
      return true;
    });

    allProducts.push(...newProducts);

    allData.push({
      code: cat.code,
      name: cat.name,
      productCount: newProducts.length,
      filters,
      products: newProducts,
    });

    console.log(`   총 상품: ${products.length}개 (신규: ${newProducts.length}개)`);
    console.log(`   필터 옵션: ${filters.length}개`);

    if (filters.length > 0) {
      filters.forEach(f => {
        console.log(`     - ${f.name}: ${f.values.slice(0, 5).join(', ')}${f.values.length > 5 ? '...' : ''}`);
      });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // 2. 전체 통계
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣  전체 통계');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📊 총 유니크 상품: ${allProducts.length}개\n`);

  // 하위 카테고리별 분포
  console.log('📁 하위 카테고리별 분포:');
  allData.forEach(d => {
    console.log(`   - ${d.name}: ${d.productCount}개`);
  });

  // 브랜드별 분포
  const brandStats: Record<string, number> = {};
  allProducts.forEach(p => {
    const brand = p.brand || '(미상)';
    brandStats[brand] = (brandStats[brand] || 0) + 1;
  });

  console.log('\n🏷️  브랜드별 분포:');
  Object.entries(brandStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => {
      console.log(`   - ${brand}: ${count}개`);
    });

  // 가격대 분포
  console.log('\n💰 가격대 분포:');
  const priceRanges = [
    { label: '무료/미정', min: 0, max: 1 },
    { label: '~10만원', min: 1, max: 100000 },
    { label: '10~30만원', min: 100000, max: 300000 },
    { label: '30~50만원', min: 300000, max: 500000 },
    { label: '50~100만원', min: 500000, max: 1000000 },
    { label: '100만원~', min: 1000000, max: Infinity },
  ];
  priceRanges.forEach(r => {
    const count = allProducts.filter(p => p.lowPrice >= r.min && p.lowPrice < r.max).length;
    if (count > 0) console.log(`   - ${r.label}: ${count}개`);
  });

  // 리뷰 통계
  const withReviews = allProducts.filter(p => p.reviewCount > 0);
  console.log('\n⭐ 리뷰 통계:');
  console.log(`   - 리뷰 있는 상품: ${withReviews.length}개 (${(withReviews.length/allProducts.length*100).toFixed(1)}%)`);
  console.log(`   - 리뷰 없는 상품: ${allProducts.length - withReviews.length}개`);
  console.log(`   - 평균 리뷰 수: ${Math.round(allProducts.reduce((s, p) => s + p.reviewCount, 0) / allProducts.length)}개`);
  console.log(`   - 최다 리뷰: ${Math.max(...allProducts.map(p => p.reviewCount))}개`);

  // 3. 전체 상품 목록
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣  전체 상품 목록');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 리뷰순 정렬
  const sortedProducts = [...allProducts].sort((a, b) => b.reviewCount - a.reviewCount);

  sortedProducts.forEach((p, i) => {
    console.log(`\n[${i + 1}] ${p.title}`);
    console.log(`    ├─ modelNo: ${p.modelNo}`);
    console.log(`    ├─ 브랜드: ${p.brand || '(미상)'}`);
    console.log(`    ├─ 카테고리: ${p.subCategory}`);
    console.log(`    ├─ 가격: ${p.lowPrice.toLocaleString()}원 ~ ${p.highPrice.toLocaleString()}원`);
    console.log(`    ├─ 리뷰: ${p.reviewCount}개 (평점: ${p.ratingValue})`);
    console.log(`    ├─ 이미지: ${p.imageUrl}`);
    console.log(`    └─ URL: ${p.detailUrl}`);
  });

  // 4. 상위 10개 상품 상세 정보 (스펙 + 리뷰)
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣  상위 10개 상품 상세 정보 (스펙 + 리뷰)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const top10 = sortedProducts.filter(p => p.reviewCount > 0).slice(0, 10);

  for (const product of top10) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📦 ${product.title}`);
    console.log(`${'═'.repeat(70)}`);

    const detail = await fetchProductDetail(product.modelNo);

    console.log(`\n📋 기본 정보:`);
    console.log(`   modelNo: ${product.modelNo}`);
    console.log(`   브랜드: ${product.brand}`);
    console.log(`   하위카테고리: ${product.subCategory}`);
    console.log(`   가격: ${product.lowPrice.toLocaleString()}원 ~ ${product.highPrice.toLocaleString()}원`);
    console.log(`   리뷰: ${product.reviewCount}개 (평점: ${product.ratingValue})`);

    if (detail.categoryPath.length > 0) {
      console.log(`\n🗂️  카테고리 경로:`);
      console.log(`   ${detail.categoryPath.join(' > ')}`);
    }

    if (detail.description) {
      console.log(`\n📝 Description:`);
      console.log(`   ${detail.description}`);
    }

    if (Object.keys(detail.specs).length > 0) {
      console.log(`\n⚙️  스펙:`);
      Object.entries(detail.specs).forEach(([k, v]) => {
        console.log(`   - ${k}: ${v}`);
      });
    }

    if (detail.reviews.length > 0) {
      console.log(`\n💬 리뷰 (${detail.reviews.length}개):`);
      detail.reviews.slice(0, 5).forEach((r, i) => {
        console.log(`\n   [리뷰 ${i + 1}] ⭐${r.rating}`);
        console.log(`   ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`);
      });
      if (detail.reviews.length > 5) {
        console.log(`\n   ... 외 ${detail.reviews.length - 5}개 리뷰`);
      }
    }

    // 상품 데이터 업데이트
    product.description = detail.description;
    product.specs = detail.specs;
    product.reviews = detail.reviews;

    await new Promise(r => setTimeout(r, 500));
  }

  // 5. JSON 파일로 저장
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣  데이터 저장');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const outputData = {
    crawledAt: new Date().toISOString(),
    summary: {
      totalProducts: allProducts.length,
      totalBrands: Object.keys(brandStats).length,
      withReviews: withReviews.length,
      avgReviews: Math.round(allProducts.reduce((s, p) => s + p.reviewCount, 0) / allProducts.length),
      avgPrice: Math.round(allProducts.filter(p => p.lowPrice > 0).reduce((s, p) => s + p.lowPrice, 0) / allProducts.filter(p => p.lowPrice > 0).length),
    },
    categories: allData,
    products: sortedProducts,
    brandStats,
  };

  const outputPath = '/tmp/enuri_carseat_full.json';
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`💾 JSON 저장 완료: ${outputPath}`);

  // 요약 출력
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      크롤링 완료 요약                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ 총 상품: ${allProducts.length}개`);
  console.log(`✅ 브랜드: ${Object.keys(brandStats).length}개`);
  console.log(`✅ 리뷰 있는 상품: ${withReviews.length}개`);
  console.log(`✅ 상세 정보 추출: ${top10.length}개`);
  console.log(`✅ 데이터 저장: ${outputPath}`);
}

// 실행
crawlCarSeats().catch(console.error);
