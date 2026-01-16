/**
 * 다나와 검색 결과 목록 크롤러 (Lite 버전)
 *
 * Axios + Cheerio 기반 - Puppeteer 대비 서버 부하 1/10 수준
 * - 메모리: ~200MB → ~10MB
 * - 응답 시간: 5-15초 → 0.5-2초
 *
 * 다나와 검색 페이지가 SSR(Server Side Rendering)이므로
 * JavaScript 실행 없이 HTML에서 직접 제품 데이터 추출 가능
 */

import axios from 'axios';
import { load } from 'cheerio';
import type {
  DanawaSearchOptions,
  DanawaSearchListItem,
  DanawaSearchListResponse,
  DanawaFilterSection,
  DanawaFilterOption,
} from './search-crawler';

/* eslint-disable @typescript-eslint/no-explicit-any */
type CheerioElement = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// 검색 URL 생성 (search-crawler.ts와 동일)
function buildSearchUrl(options: DanawaSearchOptions): string {
  let query = options.query;

  try {
    // 이중 인코딩 방지
    if (query.includes('%')) {
      query = decodeURIComponent(query);
    }
  } catch {
    // 디코딩 실패 시 원본 사용
  }

  let url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`;

  // limit 파라미터 추가 (다나와에서 한 페이지에 가져올 상품 수)
  if (options.limit) {
    url += `&limit=${options.limit}`;
  }

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

// 가격 텍스트에서 숫자 추출
function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d]/g, '');
  if (cleaned) {
    return parseInt(cleaned, 10);
  }
  return null;
}

// 상품 코드 추출
function extractPcode(element: CheerioElement, _$: ReturnType<typeof load>): string | null {
  // data-product-code 속성 (SSR에서 주로 사용)
  const dataProductCode = element.find('[data-product-code]').first().attr('data-product-code');
  if (dataProductCode) return dataProductCode;

  // data-pcode 속성
  const dataPcode = element.attr('data-pcode');
  if (dataPcode) return dataPcode;

  // 링크에서 추출
  const link = element.find('a[href*="pcode="]').first().attr('href');
  if (link) {
    const match = link.match(/pcode=(\d+)/);
    if (match) return match[1];
  }

  return null;
}

// 상품 카드 파싱 (SSR HTML 최적화)
function parseProductCard(
  element: CheerioElement,
  $: ReturnType<typeof load>
): DanawaSearchListItem | null {
  try {
    const pcode = extractPcode(element, $);
    if (!pcode) return null;

    // 상품명
    const nameSelectors = [
      '.prod_name a',
      '.prod_info .tit a',
      'p.prod_name a',
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

    // 브랜드 (상품명 첫 단어)
    let brand: string | null = null;
    const brandEl = element.find('.prod_maker, .maker').first();
    if (brandEl.length) {
      brand = brandEl.text().trim().replace(/제조사\s*:\s*/i, '').trim() || null;
    }
    if (!brand && name) {
      const nameParts = name.split(' ');
      if (nameParts[0] && /^[A-Za-z가-힣]+$/.test(nameParts[0]) && nameParts[0].length <= 10) {
        brand = nameParts[0];
      }
    }

    // 가격 - SSR에서는 혜택가 영역에 있음
    let price: number | null = null;
    const priceSelectors = [
      '.rel_item.rel_special dd a',  // 혜택 최저가
      '.price_sect .price_wrap em.prc',
      '.price_sect strong',
      '.prod_pricelist em.prc',
    ];
    for (const selector of priceSelectors) {
      const priceEl = element.find(selector).first();
      if (priceEl.length) {
        let priceText = priceEl.text();
        // "248,400원 [SSG.COM] 현대카드" 같은 텍스트에서 첫 번째 가격만 추출
        const priceMatch = priceText.match(/[\d,]+원/);
        if (priceMatch) {
          priceText = priceMatch[0];
        }
        price = parsePrice(priceText);
        if (price) break;
      }
    }

    // 썸네일 - 다양한 속성과 fallback 시도
    let thumbnail: string | null = null;
    const imgEl = element.find('.thumb_image img').first();
    if (imgEl.length) {
      // 다양한 속성에서 이미지 URL 추출 시도
      thumbnail = imgEl.attr('data-original')
        || imgEl.attr('data-src')
        || imgEl.attr('data-lazy-src')
        || imgEl.attr('src')
        || null;

      if (thumbnail && thumbnail.startsWith('//')) {
        thumbnail = `https:${thumbnail}`;
      }
      // 플레이스홀더 제외
      if (thumbnail && (thumbnail.includes('noImg') || thumbnail.includes('blank') || thumbnail.includes('noData'))) {
        thumbnail = null;
      }

      // 모든 다나와 썸네일에 shrink=500:500 적용
      if (thumbnail && thumbnail.includes('img.danawa.com')) {
        try {
          const url = new URL(thumbnail);
          url.searchParams.set('shrink', '500:500');
          thumbnail = url.toString();
        } catch {
          // URL 파싱 실패 시 그대로 사용
        }
      }
    }

    // 썸네일이 없으면 pcode 기반으로 다나와 CDN URL 생성
    // 패턴: https://img.danawa.com/prod_img/500000/{끝3자리}/{끝6자리중3-6}/{img}/{pcode}_1.jpg
    if (!thumbnail && pcode && pcode.length >= 6) {
      const last3 = pcode.slice(-3);                    // 661
      const mid3 = pcode.slice(-6, -3);                 // 011
      thumbnail = `https://img.danawa.com/prod_img/500000/${last3}/${mid3}/img/${pcode}_1.jpg?shrink=500:500`;
    }

    // 리뷰 수 - SSR에서는 .text__number
    let reviewCount = 0;
    const reviewEl = element.find('.text__number').first();
    if (reviewEl.length) {
      const reviewText = reviewEl.text().replace(/[^\d]/g, '');
      reviewCount = parseInt(reviewText, 10) || 0;
    }

    // 평점 - .text__score
    let rating: number | null = null;
    const ratingEl = element.find('.text__score').first();
    if (ratingEl.length) {
      const ratingText = ratingEl.text().trim();
      const parsed = parseFloat(ratingText);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
        rating = parsed;
      }
    }

    // 스펙 요약 - 강화된 크롤링
    let specSummary = '';

    // 1. spec_list에서 개별 스펙 아이템 파싱 시도
    const specListItems: string[] = [];
    const specListEl = element.find('.spec_list');
    if (specListEl.length) {
      // 개별 li 또는 span 아이템 추출
      specListEl.find('li, span.spec_item, a').each((_: number, specItem: CheerioElement) => {
        const specText = $(specItem).text().trim();
        if (specText && specText.length > 1 && specText.length < 50) {
          // 닫기, 더보기 등 제외
          if (!specText.includes('닫기') && !specText.includes('더보기') && !specText.includes('접기')) {
            specListItems.push(specText);
          }
        }
      });

      // li가 없으면 전체 텍스트 파싱
      if (specListItems.length === 0) {
        const rawText = specListEl.text()
          .replace(/\s+/g, ' ')
          .replace(/닫기.*$/, '')
          .replace(/더보기.*$/, '')
          .trim();

        // "/" 또는 " / " 구분자로 분리
        const parts = rawText.split(/\s*\/\s*/).filter((p: string) => p.length > 1 && p.length < 50);
        specListItems.push(...parts);
      }
    }

    // 2. prod_spec_set 대체 셀렉터 시도 (일부 상품에서 사용)
    if (specListItems.length === 0) {
      const altSpecEl = element.find('.prod_spec_set, .spec_wrap');
      if (altSpecEl.length) {
        altSpecEl.find('dd, .item').each((_: number, specItem: CheerioElement) => {
          const specText = $(specItem).text().trim();
          if (specText && specText.length > 1 && specText.length < 60) {
            specListItems.push(specText);
          }
        });
      }
    }

    // 3. 스펙 테이블 형식 (.tbl_info) 파싱 시도
    if (specListItems.length === 0) {
      const tableEl = element.find('.tbl_info, table.spec');
      if (tableEl.length) {
        tableEl.find('tr').each((_: number, row: CheerioElement) => {
          const th = $(row).find('th').text().trim();
          const td = $(row).find('td').text().trim();
          if (th && td && th.length < 20 && td.length < 40) {
            specListItems.push(`${th}: ${td}`);
          }
        });
      }
    }

    // 스펙 아이템들을 정리하여 specSummary 생성
    if (specListItems.length > 0) {
      // 중복 제거 및 정리
      const uniqueSpecs = [...new Set(specListItems)]
        .filter(s => s.length > 1)
        .slice(0, 15); // 최대 15개 스펙

      specSummary = uniqueSpecs.join(' / ');
    }

    // 너무 길면 자르기
    if (specSummary.length > 400) {
      specSummary = specSummary.substring(0, 400) + '...';
    }

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
    console.error('[Lite] Error parsing product card:', error);
    return null;
  }
}

/**
 * 다나와 검색 필터 파싱
 *
 * 검색 결과 페이지의 좌측 필터 영역에서 카테고리별 핵심 필터 정보를 추출
 * - 필터 제목 (예: "통신망", "용량", "화면크기")
 * - 옵션 목록 (예: "5G", "LTE", "256GB")
 * - 하이라이트 여부 (CM추천)
 */
function parseFilters($: ReturnType<typeof load>): DanawaFilterSection[] {
  const filters: DanawaFilterSection[] = [];

  $('.basic_cate_area').each((_: number, filterEl: CheerioElement) => {
    const $filter = $(filterEl);
    const titleEl = $filter.find('.cate_tit');

    // 제목 추출 - a.btn_dic 안의 텍스트 또는 직접 텍스트
    // 불필요한 텍스트 제거 (리서치 보기, 닫기 등)
    let title = '';
    const btnDic = titleEl.find('a.btn_dic');
    if (btnDic.length) {
      title = btnDic.find('span.name').text().trim() || btnDic.text().trim();
    }
    if (!title) {
      // 직접 텍스트에서 제목만 추출 (첫 줄만)
      const rawText = titleEl.text().trim();
      title = rawText.split('\n')[0].trim().split('\t')[0].trim();
    }

    // 빈 제목이나 "카테고리" 같은 기본 필터는 스킵
    if (!title || title === '카테고리' || title.length > 30) return;

    // 리서치 보기 버튼 유무
    const hasResearch = $filter.find('button.button__graph').length > 0;

    // 옵션 추출
    const options: DanawaFilterOption[] = [];
    $filter.find('.basic_cate_item').each((_: number, itemEl: CheerioElement) => {
      const $item = $(itemEl);
      const nameEl = $item.find('span.name');
      const inputEl = $item.find('input[type="checkbox"]');
      const isHighlight = $item.hasClass('highlight');

      if (nameEl.length && inputEl.length) {
        const name = nameEl.text().trim();
        const value = inputEl.attr('value') || '';

        // 유효한 옵션만 추가
        if (name && name.length < 50) {
          options.push({
            name,
            value,
            highlight: isHighlight || undefined,
          });
        }
      }
    });

    // 옵션이 있는 필터만 추가
    if (options.length > 0) {
      filters.push({
        title,
        options,
        hasResearch: hasResearch || undefined,
      });
    }
  });

  return filters;
}

/**
 * Axios + Cheerio 기반 다나와 검색 크롤러
 *
 * Puppeteer 대비 장점:
 * - 메모리 사용량 95% 감소
 * - 응답 시간 90% 감소
 * - 서버리스 환경 친화적
 */
export async function crawlDanawaSearchListLite(
  options: DanawaSearchOptions,
  onProductFound?: (product: DanawaSearchListItem, index: number) => void,
  onHeaderParsed?: (header: { query: string; totalCount: number; searchUrl: string; filters?: DanawaFilterSection[] }) => void
): Promise<DanawaSearchListResponse> {
  const searchUrl = buildSearchUrl(options);
  console.log(`\n🚀 [SearchCrawler-Lite] Starting search: "${options.query}"`);
  console.log(`   URL: ${searchUrl}`);

  try {
    // Fly.io 크롤러 서버 사용 여부 (Vercel 배포 환경)
    const FLY_CRAWLER_URL = process.env.FLY_CRAWLER_URL || 'https://danawa-crawler.fly.dev';
    const USE_FLY_CRAWLER = process.env.VERCEL === '1';

    // Vercel 환경에서는 Fly.io 크롤러 서버 사용
    if (USE_FLY_CRAWLER) {
      console.log(`   🚀 Using Fly.io crawler server`);

      const flyResponse = await axios.post(`${FLY_CRAWLER_URL}/crawl/search`, {
        query: options.query,
        limit: options.limit || 40,
        sort: options.sort || 'saveDESC',
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
      }, {
        timeout: 60000, // 60초 (Fly.io는 타임아웃 없음)
        headers: { 'Content-Type': 'application/json' },
      });

      const data = flyResponse.data;
      console.log(`   ✅ Fly.io response: ${data.items?.length || 0} products (${data.elapsed}ms)`);

      // Fly.io 응답을 그대로 반환
      if (data.success && data.items) {
        // onHeaderParsed 콜백 호출 (Fly.io는 통째로 오므로 여기서 호출)
        if (onHeaderParsed) {
          onHeaderParsed({
            query: data.query,
            totalCount: data.totalCount,
            searchUrl: data.searchUrl,
            filters: data.filters,
          });
        }

        // onProductFound 콜백 호출
        if (onProductFound) {
          data.items.forEach((item: DanawaSearchListItem, index: number) => {
            onProductFound(item, index);
          });
        }

        return {
          success: true,
          query: data.query,
          totalCount: data.totalCount,
          items: data.items,
          searchUrl: data.searchUrl,
          filters: data.filters,
        };
      }

      throw new Error(data.error || 'Fly.io crawler failed');
    }

    // 로컬 환경에서는 직접 요청
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
      },
      timeout: 15000,
      responseType: 'text',
    });

    console.log(`   ✅ HTML fetched (${Math.round(response.data.length / 1024)}KB)`);

    // Cheerio로 파싱
    const $ = load(response.data);
    const items: DanawaSearchListItem[] = [];
    const seenPcodes = new Set<string>();

    // 필터 파싱
    const filters = parseFilters($);
    if (filters.length > 0) {
      console.log(`   🔍 Found ${filters.length} filter sections`);
    }

    // 헤더 파싱 완료 콜백 (로컬 파싱 시 즉시 호출)
    if (onHeaderParsed) {
      onHeaderParsed({
        query: options.query,
        totalCount: 0, // 나중에 채워짐
        searchUrl,
        filters: filters.length > 0 ? filters : undefined,
      });
    }

    // 상품 카드 선택자 (광고 제외)
    const productSelectors = [
      '#productListArea .prod_item',
      '.product_list > .prod_item',
      '#danawa_content .prod_item',
    ];

    let productElements: CheerioElement | null = null;

    for (const selector of productSelectors) {
      const elements = $(selector);
      // 광고 섹션 필터링
      const filteredElements = elements.filter((i: number, el: CheerioElement) => {
        const $el = $(el);
        if ($el.closest('.goods_list').length > 0) return false;
        if ($el.closest('.recommend_list').length > 0) return false;
        if ($el.closest('.ad_box').length > 0) return false;
        if ($el.closest('[class*="recommend"]').length > 0) return false;
        if ($el.closest('[class*="adver"]').length > 0) return false;
        return true;
      });

      if (filteredElements.length > 0) {
        productElements = filteredElements;
        console.log(`   Found ${filteredElements.length} products with selector: ${selector}`);
        break;
      }
    }

    if (!productElements || productElements.length === 0) {
      console.log(`   ⚠️ No products found in HTML`);

      // JSON-LD 스키마에서 기본 정보 추출 시도
      const jsonLd = $('script[type="application/ld+json"]').first().html();
      if (jsonLd) {
        try {
          const schema = JSON.parse(jsonLd);
          if (schema['@type'] === 'ItemList' && schema.itemListElement) {
            console.log(`   📋 Found ${schema.itemListElement.length} items in JSON-LD schema`);
            // JSON-LD에서 기본 정보만 추출 (pcode, name, image, url)
            for (const item of schema.itemListElement) {
              if (items.length >= (options.limit || 40)) break;

              const urlMatch = item.url?.match(/pcode=(\d+)/);
              if (urlMatch) {
                const pcode = urlMatch[1];
                if (!seenPcodes.has(pcode)) {
                  seenPcodes.add(pcode);
                  const product: DanawaSearchListItem = {
                    pcode,
                    name: item.name || '',
                    brand: null,
                    price: null,
                    thumbnail: item.image || null,
                    reviewCount: 0,
                    rating: null,
                    specSummary: '',
                    productUrl: item.url || `https://prod.danawa.com/info/?pcode=${pcode}`,
                  };
                  items.push(product);
                  if (onProductFound) {
                    onProductFound(product, items.length - 1);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log(`   ⚠️ JSON-LD parsing failed:`, e);
        }
      }

      if (items.length === 0) {
        return {
          success: true,
          query: options.query,
          totalCount: 0,
          items: [],
          searchUrl,
        };
      }
    } else {
      // 정상적으로 상품 카드 파싱
      productElements.each((index: number, element: CheerioElement) => {
        if (items.length >= (options.limit || 40)) return false;

        const product = parseProductCard($(element), $);
        if (product && !seenPcodes.has(product.pcode)) {
          seenPcodes.add(product.pcode);
          items.push(product);

          if (onProductFound) {
            onProductFound(product, items.length - 1);
          }

          console.log(`   [${items.length}] ${product.name.substring(0, 40)}... - ${product.price?.toLocaleString() || 'N/A'}원`);
        }
      });
    }

    console.log(`\n📦 [SearchCrawler-Lite] 크롤링 완료: ${items.length}개 상품, ${filters.length}개 필터`);

    return {
      success: true,
      query: options.query,
      totalCount: items.length,
      items,
      searchUrl,
      filters: filters.length > 0 ? filters : undefined,
    };

  } catch (error) {
    console.error(`❌ [SearchCrawler-Lite] Error:`, error);

    // 에러 타입 분석
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        console.log(`   ⏱️ Timeout - 다나와 서버 응답 지연`);
      } else if (error.response?.status === 403) {
        console.log(`   🚫 403 Forbidden - 봇 차단 가능성`);
      } else if (error.response?.status === 429) {
        console.log(`   ⚠️ 429 Too Many Requests - Rate limit`);
      }
    }

    // 에러를 throw하여 fallback 크롤러로 전환 유도
    throw error;
  }
}
