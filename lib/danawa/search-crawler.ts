/**
 * 다나와 검색 결과 목록 크롤러
 *
 * Knowledge Agent V2용 - 실시간 검색 결과 크롤링
 * - URL 파라미터 기반 검색 (query, sort, minPrice, maxPrice, limit)
 * - 스트리밍 지원: 상품 발견 시 즉시 콜백으로 전달
 * - 30-40개 상품 리스트 추출
 * - LLM 기반 관련성 필터링
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { load } from 'cheerio';
import { crawlDanawaSearchListLite } from './search-crawler-lite';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Cheerio element types - using any to avoid package version conflicts
type CheerioElement = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// 검색 옵션
export interface DanawaSearchOptions {
  query: string;
  limit?: number;           // default: 40
  sort?: 'saveDESC' | 'opinionDESC' | 'priceASC' | 'priceDESC';
  minPrice?: number;
  maxPrice?: number;
}

// 검색 결과 목록의 개별 상품
export interface DanawaSearchListItem {
  pcode: string;            // 다나와 상품 코드
  name: string;             // 상품명
  brand: string | null;     // 브랜드
  price: number | null;     // 가격
  thumbnail: string | null; // 썸네일 URL
  reviewCount: number;      // 리뷰 수
  rating: number | null;    // 평점 (1-5)
  specSummary: string;      // 스펙 요약 (예: "용량: 5L | 소비전력: 1400W")
  productUrl: string;       // 상품 상세 URL
}

// 검색 결과 응답
export interface DanawaSearchListResponse {
  success: boolean;
  query: string;
  totalCount: number;
  items: DanawaSearchListItem[];
  searchUrl: string;
  cached?: boolean;
  cachedAt?: string;
  error?: string;
}

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');

/**
 * LLM 기반 관련성 필터링
 * 
 * Flash Lite를 사용해 검색어와 상품의 관련성을 스마트하게 판단
 * 배치로 처리해서 API 호출 최소화
 */
async function filterRelevantProducts(
  query: string,
  products: DanawaSearchListItem[]
): Promise<DanawaSearchListItem[]> {
  if (products.length === 0) return [];
  
  console.log(`\n🤖 [Relevance] LLM 기반 관련성 필터링 시작 (${products.length}개 상품)`);
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    
    // 상품 리스트 준비 (이름만 추출)
    const productList = products.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    
    const prompt = `사용자가 "${query}"를 검색했습니다.

아래 상품 목록에서 "${query}"와 관련된 상품의 번호만 콤마로 구분해서 출력하세요.
관련 없는 상품(다른 카테고리, 악세서리, 소모품 등)은 제외합니다.

상품 목록:
${productList}

관련 상품 번호 (예: 1,2,5,7):`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    
    // 숫자만 추출
    const relevantIndices = response
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= products.length)
      .map(n => n - 1); // 0-based index
    
    const relevantProducts = relevantIndices.map(i => products[i]).filter(Boolean);
    
    console.log(`✅ [Relevance] 필터링 완료: ${products.length}개 → ${relevantProducts.length}개`);
    console.log(`   관련 상품: ${relevantIndices.slice(0, 10).map(i => i + 1).join(', ')}${relevantIndices.length > 10 ? '...' : ''}`);
    
    return relevantProducts;
  } catch (error) {
    console.error(`❌ [Relevance] LLM 필터링 실패, 원본 반환:`, error);
    return products; // 실패 시 원본 반환
  }
}

/**
 * 브라우저 인스턴스 생성
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
      '--single-process',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

/**
 * 검색 URL 생성 (단순화 버전)
 * 
 * 기본 URL: https://search.danawa.com/dsearch.php?query=검색어
 * 
 * ⚠️ 주의: 이중 인코딩 방지
 * - 입력이 이미 인코딩된 경우 "%25" 같은 이중 인코딩 발생
 * - 한글 쿼리는 encodeURIComponent로 한 번만 인코딩
 */
function buildSearchUrl(options: DanawaSearchOptions): string {
  // 쿼리 정규화: 이미 인코딩된 경우 디코딩 후 재인코딩
  let query = options.query;
  
  try {
    // 이중 인코딩 방지: 이미 인코딩된 것 같으면 디코딩
    if (query.includes('%')) {
      query = decodeURIComponent(query);
    }
  } catch {
    // 디코딩 실패 시 원본 사용
  }
  
  console.log(`   [URL Builder] Query: "${query}"`);
  
  // URL 수동 구성 (URLSearchParams 대신 - 이중 인코딩 방지)
  let url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`;
  
  if (options.sort) {
    url += `&sort=${options.sort}`;
  }
  if (options.minPrice !== undefined) {
    url += `&minPrice=${options.minPrice}`;
  }
  if (options.maxPrice !== undefined) {
    url += `&maxPrice=${options.maxPrice}`;
  }

  return url;
}

/**
 * 상품 코드 추출
 */
function extractPcode(element: CheerioElement, $: ReturnType<typeof load>): string | null {
  // data-pcode 속성
  const dataPcode = element.attr('data-pcode');
  if (dataPcode) return dataPcode;

  // 링크에서 추출
  const link = element.find('a[href*="pcode="]').first().attr('href');
  if (link) {
    const match = link.match(/pcode=(\d+)/);
    if (match) return match[1];
  }

  // prod_info의 id에서 추출 (productInfoDetail_{pcode} 형식)
  const prodInfo = element.find('[id^="productInfoDetail_"]');
  if (prodInfo.length) {
    const id = prodInfo.attr('id');
    const match = id?.match(/productInfoDetail_(\d+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * 가격 텍스트에서 숫자 추출
 */
function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d]/g, '');
  if (cleaned) {
    return parseInt(cleaned, 10);
  }
  return null;
}

/**
 * 상품 카드 파싱 (다나와 검색 결과 페이지용)
 */
function parseProductCard(
  element: CheerioElement,
  $: ReturnType<typeof load>
): DanawaSearchListItem | null {
  try {
    // pcode 추출
    const pcode = extractPcode(element, $);
    if (!pcode) return null;

    // 상품명 - 다양한 셀렉터 시도
    const nameSelectors = [
      '.prod_name a',
      '.prod_info .tit a',
      '.prod_name .title a',
      'a.prod_name',
      '.prod_info a.tit',
      'p.prod_name a'
    ];
    
    let name = '';
    for (const selector of nameSelectors) {
      const nameEl = element.find(selector).first();
      if (nameEl.length) {
        name = nameEl.text().trim();
        if (name) break;
      }
    }
    
    if (!name) return null;

    // 브랜드 (제조사) - 상품명에서 첫 단어 또는 .prod_maker
    let brand: string | null = null;
    const brandEl = element.find('.prod_maker, .maker').first();
    if (brandEl.length) {
      brand = brandEl.text().trim().replace(/제조사\s*:\s*/i, '').trim() || null;
    }
    // 상품명에서 브랜드 추출 시도 (첫 단어가 영문이거나 알려진 브랜드인 경우)
    if (!brand && name) {
      const nameParts = name.split(' ');
      if (nameParts[0] && /^[A-Za-z가-힣]+$/.test(nameParts[0]) && nameParts[0].length <= 10) {
        brand = nameParts[0];
      }
    }

    // 가격 - 여러 셀렉터 시도
    let price: number | null = null;
    const priceSelectors = [
      '.price_sect .price_wrap em.prc',
      '.price_sect strong',
      '.prod_pricelist em.prc',
      '.bnft_price em',
      '.lwst_prc em'
    ];
    for (const selector of priceSelectors) {
      const priceEl = element.find(selector).first();
      if (priceEl.length) {
        const priceText = priceEl.text();
        price = parsePrice(priceText);
        if (price) break;
      }
    }

    // 썸네일 - 다양한 셀렉터와 속성 시도
    let thumbnail: string | null = null;
    const imgSelectors = [
      '.thumb_image img',
      '.prod_img img', 
      '.thumb img',
      'img.thumb',
      '.product_image img',
      'a.thumb_link img'
    ];
    
    for (const selector of imgSelectors) {
      const imgEl = element.find(selector).first();
      if (imgEl.length) {
        // 다양한 속성에서 이미지 URL 추출 시도
        thumbnail = imgEl.attr('data-original') 
          || imgEl.attr('data-src') 
          || imgEl.attr('data-lazy-src')
          || imgEl.attr('src') 
          || null;
        
        if (thumbnail) {
          // 프로토콜 없는 URL 처리
          if (thumbnail.startsWith('//')) {
            thumbnail = `https:${thumbnail}`;
          }
          // 플레이스홀더 이미지 제외
          if (!thumbnail.includes('noimg') && !thumbnail.includes('blank') && !thumbnail.includes('placeholder')) {
            break;
          }
          thumbnail = null; // 플레이스홀더면 다음 시도
        }
      }
    }

    // 상품의견 수 (리뷰 수)
    let reviewCount = 0;
    // 1. 상품의견 (.mt_comment 내의 strong)
    const opinionEl = element.find('.meta_item.mt_comment dd strong, .mt_comment strong').first();
    if (opinionEl.length) {
      const opinionText = opinionEl.text().replace(/[^\d]/g, '');
      if (opinionText) {
        reviewCount = parseInt(opinionText, 10) || 0;
      }
    }
    // 2. Fallback: cnt_opinion
    if (reviewCount === 0) {
      const cntEl = element.find('.cnt_opinion').first();
      if (cntEl.length) {
        const cntText = cntEl.text().replace(/[^\d]/g, '');
        if (cntText) {
          reviewCount = parseInt(cntText, 10) || 0;
        }
      }
    }

    // 평점 (별점)
    let rating: number | null = null;
    // 1. .star-single .text__score (예: "4.8")
    const ratingScoreEl = element.find('.star-single .text__score').first();
    if (ratingScoreEl.length) {
      const scoreText = ratingScoreEl.text().trim();
      if (scoreText) {
        const parsed = parseFloat(scoreText);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
          rating = parsed;
        }
      }
    }
    // 2. Fallback: style width 기반
    if (!rating) {
      const graphBar = element.find('.star_graph .graph_bar').first();
      if (graphBar.length) {
        const style = graphBar.attr('style') || '';
        const widthMatch = style.match(/width:\s*([\d.]+)%/);
        if (widthMatch) {
          rating = Math.round((parseFloat(widthMatch[1]) / 20) * 10) / 10;
        }
      }
    }

    // 스펙 요약 - .spec_list 전체 텍스트
    let specSummary = '';
    const specEl = element.find('.spec_list, .spec-box .spec_list').first();
    if (specEl.length) {
      // 전체 텍스트를 가져와서 정리
      specSummary = specEl.text()
        .replace(/\s+/g, ' ')           // 연속 공백 정리
        .replace(/\s*\/\s*/g, '/')      // / 주변 공백 제거
        .replace(/닫기.*$/, '')          // "닫기" 이후 텍스트 제거
        .trim();

      // 너무 길면 자르기 (300자 제한)
      if (specSummary.length > 300) {
        specSummary = specSummary.substring(0, 300) + '...';
      }
    }

    // 상품 URL
    const productUrl = `https://prod.danawa.com/info/?pcode=${pcode}`;

    return {
      pcode,
      name,
      brand,
      price,
      thumbnail,
      reviewCount,
      rating,
      specSummary,
      productUrl,
    };
  } catch (error) {
    console.error('Error parsing product card:', error);
    return null;
  }
}

/**
 * 다나와 검색 결과 크롤링 (Puppeteer 버전)
 *
 * Lite 버전 실패 시 fallback으로 사용
 *
 * @param options 검색 옵션
 * @param onProductFound 상품 발견 시 콜백 (스트리밍 UX용)
 * @returns 검색 결과 목록
 */
export async function crawlDanawaSearchListPuppeteer(
  options: DanawaSearchOptions,
  onProductFound?: (product: DanawaSearchListItem, index: number) => void
): Promise<DanawaSearchListResponse> {
  const searchUrl = buildSearchUrl(options);
  console.log(`\n🔍 [SearchCrawler] Starting search: "${options.query}"`);
  console.log(`   URL: ${searchUrl}`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await createBrowser();
    page = await browser.newPage();

    // 리소스 차단 (속도 최적화) - 이미지는 썸네일 URL 추출을 위해 허용
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
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
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`   Page loaded`);

    // 동적 콘텐츠 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 스크롤하여 lazy loading 트리거
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    const items: DanawaSearchListItem[] = [];

    // 상품 카드 선택자들 (다양한 레이아웃 대응)
    // 2025년 다나와 페이지 구조 기준
    // ⚠️ 중요: 광고/추천 섹션 제외! (이런 상품 어때요? 등)
    const productSelectors = [
      '#productListArea .prod_item',           // 메인 검색 결과 영역 (가장 정확)
      '.product_list > .prod_item',            // 직계 자식만
      '#danawa_content .prod_item',            // 메인 콘텐츠 영역
      '.search_result .prod_item',             // 검색 결과 영역
    ];

    let productElements: CheerioElement | null = null;

    for (const selector of productSelectors) {
      const elements = $(selector);
      // 광고 섹션 요소 필터링
      const filteredElements = elements.filter((i: number, el: CheerioElement) => {
        const $el = $(el);
        // 광고/추천 섹션 내의 요소 제외
        if ($el.closest('.goods_list').length > 0) return false;
        if ($el.closest('.recommend_list').length > 0) return false;
        if ($el.closest('.ad_box').length > 0) return false;
        if ($el.closest('.sponsored').length > 0) return false;
        if ($el.closest('[class*="recommend"]').length > 0) return false;
        if ($el.closest('[class*="adver"]').length > 0) return false;
        if ($el.closest('[class*="banner"]').length > 0) return false;
        return true;
      });
      
      if (filteredElements.length > 0) {
        productElements = filteredElements;
        console.log(`   Found ${filteredElements.length} products with selector: ${selector} (filtered from ${elements.length})`);
        break;
      }
    }

    if (!productElements || productElements.length === 0) {
      console.log(`   ⚠️ No products found with any selector`);
      console.log(`   Debug: Checking page structure...`);
      
      // 페이지 구조 디버깅
      const bodyClasses = $('body').attr('class') || 'none';
      const mainContent = $('.product_list').length;
      const anyProdItem = $('[class*="prod"]').length;
      console.log(`   - Body classes: ${bodyClasses}`);
      console.log(`   - .product_list count: ${mainContent}`);
      console.log(`   - Elements with 'prod' in class: ${anyProdItem}`);
      
      return {
        success: true,
        query: options.query,
        totalCount: 0,
        items: [],
        searchUrl,
      };
    }

    // 중복 제거를 위한 pcode Set
    const seenPcodes = new Set<string>();

    // 각 상품 파싱 (관련성 필터링은 나중에 LLM으로 처리)
    productElements.each((index: number, element: CheerioElement) => {
      // 충분한 상품을 모았으면 중단
      if (items.length >= (options.limit || 40)) return false;

      const product = parseProductCard($(element), $);
      if (product) {
        // 중복 pcode 체크
        if (seenPcodes.has(product.pcode)) {
          console.log(`   [SKIP] Duplicate pcode: ${product.pcode}`);
          return; // continue to next element
        }
        
        seenPcodes.add(product.pcode);
        items.push(product);

        // 스트리밍 콜백
        if (onProductFound) {
          onProductFound(product, items.length - 1);
        }

        console.log(`   [${items.length}] ${product.name.substring(0, 40)}... - ${product.price?.toLocaleString() || 'N/A'}원 | 리뷰: ${product.reviewCount} | 평점: ${product.rating || 'N/A'}`);
      }
    });

    console.log(`\n📦 [SearchCrawler] 크롤링 완료: ${items.length}개 상품`);

    // LLM 기반 관련성 필터링
    const filteredItems = await filterRelevantProducts(options.query, items);
    
    console.log(`✅ [SearchCrawler] 최종: ${filteredItems.length}개 관련 상품`);

    return {
      success: true,
      query: options.query,
      totalCount: filteredItems.length,
      items: filteredItems,
      searchUrl,
    };

  } catch (error) {
    console.error(`❌ [SearchCrawler] Error:`, error);
    return {
      success: false,
      query: options.query,
      totalCount: 0,
      items: [],
      searchUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (page) await page.close();
      if (browser) await browser.close();
    } catch (err) {
      console.error('Error closing browser:', err);
    }
  }
}

/**
 * 다나와 검색 결과 크롤링 (메인 엔트리 포인트)
 *
 * 기본: Axios + Cheerio (Lite 버전) - 빠르고 가벼움
 * Fallback: Puppeteer - 봇 차단 시 자동 전환
 *
 * @param options 검색 옵션
 * @param onProductFound 상품 발견 시 콜백 (스트리밍 UX용)
 * @returns 검색 결과 목록
 */
export async function crawlDanawaSearchList(
  options: DanawaSearchOptions,
  onProductFound?: (product: DanawaSearchListItem, index: number) => void
): Promise<DanawaSearchListResponse> {
  try {
    // 1차: Lite 버전 시도 (Axios + Cheerio)
    const liteResult = await crawlDanawaSearchListLite(options, onProductFound);

    // Lite 버전 성공 시 LLM 필터링 적용
    if (liteResult.success && liteResult.items.length > 0) {
      console.log(`✅ [SearchCrawler] Lite 버전 성공, LLM 필터링 적용`);
      const filteredItems = await filterRelevantProducts(options.query, liteResult.items);
      return {
        ...liteResult,
        items: filteredItems,
        totalCount: filteredItems.length,
      };
    }

    // Lite 결과가 비어있으면 Puppeteer로 fallback
    if (liteResult.items.length === 0) {
      console.log(`⚠️ [SearchCrawler] Lite 버전 결과 없음, Puppeteer fallback`);
      return await crawlDanawaSearchListPuppeteer(options, onProductFound);
    }

    return liteResult;
  } catch (error) {
    // Lite 버전 실패 시 Puppeteer로 fallback
    console.warn(`⚠️ [SearchCrawler] Lite 버전 실패, Puppeteer fallback:`, error);
    return await crawlDanawaSearchListPuppeteer(options, onProductFound);
  }
}

/**
 * 간단한 검색 헬퍼 (기본 옵션 사용)
 */
export async function searchDanawaProducts(
  query: string,
  onProductFound?: (product: DanawaSearchListItem, index: number) => void
): Promise<DanawaSearchListItem[]> {
  const response = await crawlDanawaSearchList({ query }, onProductFound);
  return response.items;
}
