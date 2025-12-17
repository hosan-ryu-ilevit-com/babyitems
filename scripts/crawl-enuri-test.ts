/**
 * 에누리 크롤링 테스트 스크립트
 * 카시트 카테고리(100402)를 대상으로 테스트
 */

import * as cheerio from 'cheerio';

// 카테고리 정보 (메인 + 하위 카테고리)
const ENURI_CATEGORIES = {
  카시트: {
    main: '100402',
    sub: [
      { code: '10040201', name: '일체형' },
      { code: '10040202', name: '분리형' },
      { code: '10040203', name: '바구니형' },
      { code: '10040204', name: '부스터형' },
    ]
  },
  유모차: {
    main: '100401',
    sub: []  // 추후 확인 필요
  },
  기저귀: {
    main: '1002014',
    sub: []  // 추후 확인 필요
  },
};

interface EnuriProduct {
  modelNo: string;
  title: string;
  brand?: string;
  lowPrice: number;
  highPrice: number;
  reviewCount: number;
  ratingValue: number;
  imageUrl: string;
  detailUrl: string;
  category: string;
}

interface CategoryInfo {
  categoryCode: string;
  categoryName: string;
  subCategories: Array<{ code: string; name: string }>;
  filterOptions: {
    brands: string[];
    specs: Record<string, string[]>;
  };
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

// JSON-LD 데이터에서 상품 정보 추출
function extractProductsFromJsonLd(html: string): EnuriProduct[] {
  const $ = cheerio.load(html);
  const products: EnuriProduct[] = [];

  // JSON-LD 스크립트 태그 찾기
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonText = $(el).html();
      if (!jsonText) return;

      const data = JSON.parse(jsonText);

      // ItemList 타입 찾기
      if (data['@type'] === 'ItemList' && data.itemListElement) {
        for (const item of data.itemListElement) {
          if (item['@type'] === 'ListItem' && item.item) {
            const product = item.item;

            // modelno 추출 (URL에서)
            const urlMatch = product.url?.match(/modelno=(\d+)/);
            const modelNo = urlMatch ? urlMatch[1] : '';

            products.push({
              modelNo,
              title: product.name || '',
              brand: product.brand?.name || '',
              lowPrice: product.offers?.lowPrice || 0,
              highPrice: product.offers?.highPrice || 0,
              reviewCount: product.aggregateRating?.reviewCount || 0,
              ratingValue: product.aggregateRating?.ratingValue || 0,
              imageUrl: product.image || '',
              detailUrl: product.url || '',
              category: '',
            });
          }
        }
      }
    } catch (e) {
      // JSON 파싱 실패 시 무시
    }
  });

  return products;
}

// HTML에서 직접 상품 정보 추출 (백업)
function extractProductsFromHtml(html: string): EnuriProduct[] {
  const $ = cheerio.load(html);
  const products: EnuriProduct[] = [];

  // 상품 리스트 컨테이너 찾기 (클래스명은 실제 확인 필요)
  $('.prod_main_info, .prodList_item, [class*="product"], [class*="item"]').each((_, el) => {
    const $el = $(el);

    // 상품 링크에서 modelno 추출
    const link = $el.find('a[href*="modelno="]').attr('href');
    const modelNoMatch = link?.match(/modelno=(\d+)/);
    if (!modelNoMatch) return;

    const modelNo = modelNoMatch[1];
    const title = $el.find('[class*="name"], [class*="title"], .tit').first().text().trim();
    const priceText = $el.find('[class*="price"]').first().text().replace(/[^0-9]/g, '');
    const reviewText = $el.find('[class*="review"], [class*="rating"]').text();
    const image = $el.find('img').first().attr('src') || '';

    if (title) {
      products.push({
        modelNo,
        title,
        lowPrice: parseInt(priceText) || 0,
        highPrice: parseInt(priceText) || 0,
        reviewCount: 0,
        ratingValue: 0,
        imageUrl: image,
        detailUrl: `https://www.enuri.com/detail.jsp?modelno=${modelNo}`,
        category: '',
      });
    }
  });

  return products;
}

// 카테고리 정보 추출
function extractCategoryInfo(html: string, categoryCode: string): CategoryInfo {
  const $ = cheerio.load(html);

  const info: CategoryInfo = {
    categoryCode,
    categoryName: '',
    subCategories: [],
    filterOptions: {
      brands: [],
      specs: {},
    },
  };

  // 카테고리명 추출
  info.categoryName = $('h1, .category_title, [class*="cate"] h2').first().text().trim();

  // 하위 카테고리 추출 (탭 또는 필터에서)
  $('[class*="subcate"] a, .tab_cate a, [data-cate]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const cateMatch = href.match(/cate=(\d+)/);
    if (cateMatch) {
      info.subCategories.push({
        code: cateMatch[1],
        name: $el.text().trim(),
      });
    }
  });

  // 브랜드 필터 추출
  $('[class*="brand"] input[type="checkbox"], [data-brand]').each((_, el) => {
    const brand = $(el).attr('data-brand') || $(el).next('label').text().trim();
    if (brand) info.filterOptions.brands.push(brand);
  });

  return info;
}

// 페이지네이션 정보 추출
function extractPaginationInfo(html: string): { totalPages: number; currentPage: number; totalItems: number } {
  const $ = cheerio.load(html);

  // JavaScript 변수에서 추출
  const scriptContent = $('script').text();

  const pageNumMatch = scriptContent.match(/param_pageNum\s*=\s*['"](\d+)['"]/);
  const totalMatch = scriptContent.match(/totalCount\s*[=:]\s*['"]?(\d+)['"]?/);
  const pageGapMatch = scriptContent.match(/param_pageGap\s*=\s*['"](\d+)['"]/);

  const currentPage = pageNumMatch ? parseInt(pageNumMatch[1]) : 1;
  const totalItems = totalMatch ? parseInt(totalMatch[1]) : 0;
  const pageGap = pageGapMatch ? parseInt(pageGapMatch[1]) : 40;
  const totalPages = Math.ceil(totalItems / pageGap);

  return { totalPages, currentPage, totalItems };
}

// 상품 상세 페이지에서 JSON-LD 기반 정보 추출
async function fetchProductDetail(modelNo: string): Promise<{
  specs: Record<string, string>;
  reviews: Array<{ rating: number; content: string; author: string }>;
  description: string;
  categoryPath: string[];
}> {
  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const specs: Record<string, string> = {};
    const reviews: Array<{ rating: number; content: string; author: string }> = [];
    let description = '';
    const categoryPath: string[] = [];

    // SEOSCRIPT JSON-LD에서 Product 정보 추출
    const seoScript = $('#SEOSCRIPT').html();
    if (seoScript) {
      try {
        const productData = JSON.parse(seoScript);

        // description에서 스펙 파싱 (슬래시로 구분)
        description = productData.description || '';
        const specParts = description.split('/');
        specParts.forEach((part: string) => {
          const colonIdx = part.indexOf(':');
          if (colonIdx > 0) {
            const key = part.slice(0, colonIdx).trim();
            const value = part.slice(colonIdx + 1).trim();
            specs[key] = value;
          } else if (part.startsWith('[') && part.endsWith(']')) {
            // [특징] 같은 섹션 마커
            specs['_section'] = part;
          } else {
            // 카테고리/타입 정보
            const trimmed = part.trim();
            if (trimmed && !specs['타입']) {
              specs['타입'] = trimmed;
            }
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
      } catch (e) {
        // JSON 파싱 실패
      }
    }

    // BreadcrumbList에서 카테고리 경로 추출
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data['@type'] === 'BreadcrumbList' && data.itemListElement) {
          data.itemListElement.forEach((item: any) => {
            if (item.name && item.position > 1) {
              categoryPath.push(item.name);
            }
          });
        }
      } catch (e) {}
    });

    return { specs, reviews, description, categoryPath };
  } catch (error) {
    console.error(`상품 상세 조회 실패 (${modelNo}):`, error);
    return { specs: {}, reviews: [], description: '', categoryPath: [] };
  }
}

// 페이지네이션으로 여러 페이지 크롤링
async function crawlMultiplePages(categoryCode: string, maxProducts: number = 80): Promise<EnuriProduct[]> {
  const allProducts: EnuriProduct[] = [];
  const pageSize = 40;
  const maxPages = Math.ceil(maxProducts / pageSize);

  console.log(`📄 페이지네이션 테스트: 최대 ${maxProducts}개 (${maxPages}페이지)\n`);

  for (let page = 1; page <= maxPages; page++) {
    // tabType=1 (가격비교), pageGap=120 (최대 페이지 사이즈)
    const url = `https://www.enuri.com/list.jsp?cate=${categoryCode}&tabType=1&pageGap=120&pageNum=${page}`;
    console.log(`   페이지 ${page} 크롤링 중... (${url})`);

    try {
      const html = await fetchPage(url);
      const products = extractProductsFromJsonLd(html);

      console.log(`   → ${products.length}개 상품 발견`);

      if (products.length === 0) {
        console.log(`   ⚠️ 더 이상 상품 없음, 종료`);
        break;
      }

      // 중복 제거하며 추가
      const existingIds = new Set(allProducts.map(p => p.modelNo));
      const newProducts = products.filter(p => !existingIds.has(p.modelNo));
      console.log(`   → 신규 상품: ${newProducts.length}개 (중복 ${products.length - newProducts.length}개)`);

      allProducts.push(...newProducts);

      // 신규 상품이 없으면 종료
      if (newProducts.length === 0) {
        console.log(`   ✅ 신규 상품 없음, 종료`);
        break;
      }

      // 마지막 페이지 체크 (40개 미만이면 마지막)
      if (products.length < pageSize) {
        console.log(`   ✅ 마지막 페이지 도달`);
        break;
      }

      // Rate limiting
      if (page < maxPages) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      console.error(`   ❌ 페이지 ${page} 실패:`, error);
      break;
    }
  }

  return allProducts;
}

// 하위 카테고리 전체 크롤링
async function crawlAllSubCategories(category: typeof ENURI_CATEGORIES.카시트): Promise<EnuriProduct[]> {
  const allProducts: EnuriProduct[] = [];
  const existingIds = new Set<string>();

  console.log(`📂 하위 카테고리 ${category.sub.length}개 크롤링\n`);

  for (const sub of category.sub) {
    console.log(`   [${sub.name}] (${sub.code}) 크롤링 중...`);

    const url = `https://www.enuri.com/list.jsp?cate=${sub.code}&tabType=1`;
    try {
      const html = await fetchPage(url);
      const products = extractProductsFromJsonLd(html);

      // 각 상품에 하위 카테고리 정보 추가
      products.forEach(p => {
        p.category = sub.name;
      });

      // 중복 제거
      const newProducts = products.filter(p => !existingIds.has(p.modelNo));
      newProducts.forEach(p => existingIds.add(p.modelNo));

      allProducts.push(...newProducts);
      console.log(`   → ${products.length}개 발견, 신규 ${newProducts.length}개 추가 (누적: ${allProducts.length}개)`);

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.error(`   ❌ ${sub.name} 크롤링 실패:`, error);
    }
  }

  return allProducts;
}

// 메인 테스트 함수
async function testEnuriCrawl() {
  console.log('=== 에누리 크롤링 테스트 (하위 카테고리 전체) ===\n');

  const category = ENURI_CATEGORIES.카시트;

  console.log(`📍 카테고리: 카시트 (메인: ${category.main})\n`);

  try {
    // 1. 하위 카테고리 전체 크롤링
    console.log('1️⃣ 하위 카테고리 전체 크롤링');
    const products = await crawlAllSubCategories(category);
    console.log(`\n   ✅ 총 ${products.length}개 상품 수집 완료\n`);

    // 2. 하위 카테고리별 통계
    console.log('2️⃣ 하위 카테고리별 통계:');
    const categoryStats: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category || '(미분류)';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });
    Object.entries(categoryStats).forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count}개`);
    });

    // 3. 브랜드별 통계
    console.log('\n3️⃣ 브랜드별 통계:');
    const brandStats: Record<string, number> = {};
    products.forEach(p => {
      const brand = p.brand || '(미상)';
      brandStats[brand] = (brandStats[brand] || 0) + 1;
    });
    Object.entries(brandStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([brand, count]) => {
        console.log(`   - ${brand}: ${count}개`);
      });

    // 4. 가격대 분포
    console.log('\n4️⃣ 가격대 분포:');
    const priceRanges = [
      { label: '~10만원', min: 0, max: 100000 },
      { label: '10~30만원', min: 100000, max: 300000 },
      { label: '30~50만원', min: 300000, max: 500000 },
      { label: '50만원~', min: 500000, max: Infinity },
    ];
    priceRanges.forEach(range => {
      const count = products.filter(p => p.lowPrice >= range.min && p.lowPrice < range.max).length;
      console.log(`   - ${range.label}: ${count}개`);
    });

    // 5. 리뷰 많은 상품 TOP 10
    console.log('\n5️⃣ 리뷰 많은 상품 TOP 10:');
    const sortedByReview = [...products].sort((a, b) => b.reviewCount - a.reviewCount);
    sortedByReview.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. [${p.brand}] ${p.title.slice(0, 30)}... - 리뷰 ${p.reviewCount}개, ⭐${p.ratingValue}`);
    });

    // 5. 전체 상품 목록 (간략)
    console.log('\n5️⃣ 전체 상품 목록 (80개):');
    console.log('─'.repeat(100));
    console.log(`${'No'.padStart(3)} | ${'브랜드'.padEnd(12)} | ${'상품명'.padEnd(40)} | ${'가격'.padStart(12)} | ${'리뷰'.padStart(6)} | 평점`);
    console.log('─'.repeat(100));

    products.forEach((p, i) => {
      const title = p.title.length > 38 ? p.title.slice(0, 38) + '..' : p.title;
      const brand = (p.brand || '-').slice(0, 10);
      const price = `${p.lowPrice.toLocaleString()}원`;
      console.log(
        `${String(i + 1).padStart(3)} | ${brand.padEnd(12)} | ${title.padEnd(40)} | ${price.padStart(12)} | ${String(p.reviewCount).padStart(6)} | ${p.ratingValue}`
      );
    });
    console.log('─'.repeat(100));

    // 6. 상세 페이지 샘플 (첫 번째 상품)
    if (products.length > 0 && products[0].modelNo) {
      console.log('\n6️⃣ 상세 페이지 테스트 (첫 번째 상품):');
      console.log(`   대상: ${products[0].title}`);

      const detail = await fetchProductDetail(products[0].modelNo);
      console.log(`   카테고리: ${detail.categoryPath.join(' > ')}`);
      console.log(`   스펙: ${JSON.stringify(detail.specs)}`);
      console.log(`   리뷰 수: ${detail.reviews.length}개`);
    }

    // 7. 결과 요약
    console.log('\n========== 크롤링 결과 요약 ==========');
    console.log(`✅ 총 상품: ${products.length}개`);
    console.log(`✅ 브랜드: ${Object.keys(brandStats).length}개`);
    console.log(`✅ 평균 가격: ${Math.round(products.reduce((sum, p) => sum + p.lowPrice, 0) / products.length).toLocaleString()}원`);
    console.log(`✅ 평균 리뷰: ${Math.round(products.reduce((sum, p) => sum + p.reviewCount, 0) / products.length)}개`);

    return { products, brandStats };

  } catch (error) {
    console.error('❌ 크롤링 실패:', error);
    throw error;
  }
}

// 실행
testEnuriCrawl().catch(console.error);
