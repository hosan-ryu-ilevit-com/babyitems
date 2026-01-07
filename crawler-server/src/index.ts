/**
 * Danawa Crawler Server for Fly.io
 *
 * Vercel 서버리스의 IP 차단 문제를 우회하기 위한 전용 크롤러 서버
 * - Express 기반 REST API
 * - Cheerio를 사용한 HTML 파싱
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { load } from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Types
interface SearchOptions {
  query: string;
  limit?: number;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}

interface ProductItem {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  reviewCount: number;
  rating: number | null;
  specSummary: string;
  productUrl: string;
}

interface FilterOption {
  name: string;
  value: string;
  highlight?: boolean;
}

interface FilterSection {
  title: string;
  options: FilterOption[];
  hasResearch?: boolean;
}

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'danawa-crawler',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// 검색 URL 생성
function buildSearchUrl(options: SearchOptions): string {
  let query = options.query;
  try {
    if (query.includes('%')) {
      query = decodeURIComponent(query);
    }
  } catch {}

  let url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`;
  if (options.limit) url += `&limit=${options.limit}`;
  if (options.sort) url += `&sort=${options.sort}`;
  if (options.minPrice !== undefined) url += `&minPrice=${options.minPrice}`;
  if (options.maxPrice !== undefined) url += `&maxPrice=${options.maxPrice}`;
  return url;
}

// 가격 파싱
function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

// 필터 파싱
function parseFilters($: ReturnType<typeof load>): FilterSection[] {
  const filters: FilterSection[] = [];

  $('.basic_cate_area').each((_, filterEl) => {
    const $filter = $(filterEl);
    const titleEl = $filter.find('.cate_tit');

    let title = '';
    const btnDic = titleEl.find('a.btn_dic');
    if (btnDic.length) {
      title = btnDic.find('span.name').text().trim() || btnDic.text().trim();
    }
    if (!title) {
      const rawText = titleEl.text().trim();
      title = rawText.split('\n')[0].trim().split('\t')[0].trim();
    }

    if (!title || title === '카테고리' || title.length > 30) return;

    const hasResearch = $filter.find('button.button__graph').length > 0;
    const options: FilterOption[] = [];

    $filter.find('.basic_cate_item').each((_, itemEl) => {
      const $item = $(itemEl);
      const nameEl = $item.find('span.name');
      const inputEl = $item.find('input[type="checkbox"]');
      const isHighlight = $item.hasClass('highlight');

      if (nameEl.length && inputEl.length) {
        const name = nameEl.text().trim();
        const value = inputEl.attr('value') || '';
        if (name && name.length < 50) {
          options.push({ name, value, highlight: isHighlight || undefined });
        }
      }
    });

    if (options.length > 0) {
      filters.push({ title, options, hasResearch: hasResearch || undefined });
    }
  });

  return filters;
}

// 상품 카드 파싱
function parseProductCard(element: any, $: ReturnType<typeof load>): ProductItem | null {
  try {
    // pcode 추출
    let pcode = element.find('[data-product-code]').first().attr('data-product-code');
    if (!pcode) pcode = element.attr('data-pcode');
    if (!pcode) {
      const link = element.find('a[href*="pcode="]').first().attr('href');
      if (link) {
        const match = link.match(/pcode=(\d+)/);
        if (match) pcode = match[1];
      }
    }
    if (!pcode) return null;

    // 상품명
    const nameSelectors = ['.prod_name a', '.prod_info .tit a', 'p.prod_name a'];
    let name = '';
    for (const selector of nameSelectors) {
      const nameEl = element.find(selector).first();
      if (nameEl.length) {
        name = nameEl.text().trim();
        if (name) break;
      }
    }
    if (!name) return null;

    // 브랜드
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

    // 가격
    let price: number | null = null;
    const priceSelectors = [
      '.rel_item.rel_special dd a',
      '.price_sect .price_wrap em.prc',
      '.price_sect strong',
      '.prod_pricelist em.prc',
    ];
    for (const selector of priceSelectors) {
      const priceEl = element.find(selector).first();
      if (priceEl.length) {
        let priceText = priceEl.text();
        const priceMatch = priceText.match(/[\d,]+원/);
        if (priceMatch) priceText = priceMatch[0];
        price = parsePrice(priceText);
        if (price) break;
      }
    }

    // 썸네일
    let thumbnail: string | null = null;
    const imgEl = element.find('.thumb_image img').first();
    if (imgEl.length) {
      thumbnail = imgEl.attr('data-original') || imgEl.attr('data-src') ||
                  imgEl.attr('data-lazy-src') || imgEl.attr('src') || null;
      if (thumbnail && thumbnail.startsWith('//')) thumbnail = `https:${thumbnail}`;
      if (thumbnail && (thumbnail.includes('noImg') || thumbnail.includes('blank'))) thumbnail = null;
    }
    if (!thumbnail && pcode.length >= 6) {
      const last3 = pcode.slice(-3);
      const mid3 = pcode.slice(-6, -3);
      thumbnail = `https://img.danawa.com/prod_img/500000/${last3}/${mid3}/img/${pcode}_1.jpg?shrink=130:130`;
    }

    // 리뷰 수
    let reviewCount = 0;
    const reviewEl = element.find('.text__number').first();
    if (reviewEl.length) {
      const reviewText = reviewEl.text().replace(/[^\d]/g, '');
      reviewCount = parseInt(reviewText, 10) || 0;
    }

    // 평점
    let rating: number | null = null;
    const ratingEl = element.find('.text__score').first();
    if (ratingEl.length) {
      const parsed = parseFloat(ratingEl.text().trim());
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) rating = parsed;
    }

    // 스펙 요약
    let specSummary = '';
    const specListEl = element.find('.spec_list');
    if (specListEl.length) {
      const specItems: string[] = [];
      specListEl.find('li, span.spec_item, a').each((_: number, specItem: any) => {
        const specText = $(specItem).text().trim();
        if (specText && specText.length > 1 && specText.length < 50) {
          if (!specText.includes('닫기') && !specText.includes('더보기')) {
            specItems.push(specText);
          }
        }
      });
      if (specItems.length === 0) {
        const rawText = specListEl.text().replace(/\s+/g, ' ').replace(/닫기.*$/, '').trim();
        specItems.push(...rawText.split(/\s*\/\s*/).filter((p: string) => p.length > 1 && p.length < 50));
      }
      specSummary = [...new Set(specItems)].slice(0, 15).join(' / ');
    }
    if (specSummary.length > 400) specSummary = specSummary.substring(0, 400) + '...';

    return {
      pcode,
      name,
      brand,
      price,
      thumbnail,
      reviewCount,
      rating,
      specSummary,
      productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
    };
  } catch (error) {
    console.error('Error parsing product card:', error);
    return null;
  }
}

// 메인 크롤링 엔드포인트
app.post('/crawl/search', async (req, res) => {
  const startTime = Date.now();
  const options: SearchOptions = req.body;

  if (!options.query) {
    return res.status(400).json({ error: 'query is required' });
  }

  const searchUrl = buildSearchUrl({
    query: options.query,
    limit: options.limit || 40,
    sort: options.sort || 'saveDESC',
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
  });

  console.log(`[Crawl] Starting search: "${options.query}"`);
  console.log(`[Crawl] URL: ${searchUrl}`);

  try {
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
      },
      timeout: 30000,
      responseType: 'text',
    });

    console.log(`[Crawl] HTML fetched (${Math.round(response.data.length / 1024)}KB)`);

    const $ = load(response.data);
    const items: ProductItem[] = [];
    const seenPcodes = new Set<string>();

    // 필터 파싱
    const filters = parseFilters($);

    // 상품 파싱
    const productSelectors = [
      '#productListArea .prod_item',
      '.product_list > .prod_item',
      '#danawa_content .prod_item',
    ];

    let productElements: any = null;
    for (const selector of productSelectors) {
      const elements = $(selector).filter((_, el) => {
        const $el = $(el);
        if ($el.closest('.goods_list').length > 0) return false;
        if ($el.closest('.recommend_list').length > 0) return false;
        if ($el.closest('.ad_box').length > 0) return false;
        return true;
      });
      if (elements.length > 0) {
        productElements = elements;
        break;
      }
    }

    if (productElements) {
      productElements.each((index: number, element: any) => {
        if (items.length >= (options.limit || 40)) return false;
        const product = parseProductCard($(element), $);
        if (product && !seenPcodes.has(product.pcode)) {
          seenPcodes.add(product.pcode);
          items.push(product);
        }
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Crawl] Complete: ${items.length} products, ${filters.length} filters (${elapsed}ms)`);

    res.json({
      success: true,
      query: options.query,
      totalCount: items.length,
      items,
      filters,
      searchUrl,
      elapsed,
    });

  } catch (error: any) {
    console.error('[Crawl] Error:', error.message);

    const status = error.response?.status;
    res.status(status || 500).json({
      success: false,
      error: error.message,
      status,
    });
  }
});

// 리뷰 크롤링 엔드포인트
app.post('/crawl/reviews', async (req, res) => {
  const { pcodes, maxPerProduct = 5 } = req.body;

  if (!pcodes || !Array.isArray(pcodes) || pcodes.length === 0) {
    return res.status(400).json({ error: 'pcodes array is required' });
  }

  console.log(`[Reviews] Starting for ${pcodes.length} products`);

  const results: Record<string, any[]> = {};

  for (const pcode of pcodes) {
    try {
      const reviewUrl = `https://prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php?t=0&prodCode=${pcode}&page=1&limit=${maxPerProduct}&score=0&usefullScore=Y`;

      const response = await axios.get(reviewUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': `https://prod.danawa.com/info/?pcode=${pcode}`,
        },
        timeout: 5000,
      });

      const $ = load(response.data);
      const reviews: any[] = [];

      $('.danawa-prodBlog-companyReview-clazz-more').each((_, el) => {
        const $review = $(el);
        const content = $review.find('.atc').text().trim();
        const rating = parseFloat($review.find('.star_mask').attr('style')?.match(/width:\s*([\d.]+)%/)?.[1] || '0') / 20;

        if (content) {
          reviews.push({ content: content.slice(0, 500), rating });
        }
      });

      results[pcode] = reviews;
    } catch (error) {
      results[pcode] = [];
    }
  }

  res.json({
    success: true,
    reviews: results,
    totalProducts: pcodes.length,
  });
});

app.listen(PORT, () => {
  console.log(`Danawa Crawler Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
