/**
 * 지식 생성 테스트 API
 *
 * POST /api/v2/knowledge/test
 * Body: { keyword: string, type: 'danawa' | 'websearch' | 'full' }
 */

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { load } from 'cheerio';
import { GoogleGenAI } from '@google/genai';

// 다나와 카테고리 코드 매핑 (테스트용)
const CATEGORY_CODES: Record<string, string> = {
  에어프라이어: '10252979',
  로봇청소기: '103412',
  식기세척기: '1020927',
  건조기: '1020935',
  공기청정기: '10252959',
};

// 다나와 정렬 옵션
type DanawaSortOption = 'popular' | 'lowPrice' | 'highPrice' | 'newest' | 'sales' | 'review';
const DANAWA_SORT_CODES: Record<DanawaSortOption, string> = {
  popular: '1',    // 인기상품순 (기본)
  lowPrice: '2',   // 낮은가격순
  highPrice: '3',  // 높은가격순
  newest: '4',     // 신상품순
  sales: '6',      // 판매량순
  review: '7',     // 상품의견많은순
};

interface SearchProduct {
  pcode: string;
  name: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  opinionCount: number | null;
  thumbnail: string | null;
  specs: Record<string, string>;
  brand: string | null;
  productUrl: string;
}

/**
 * 다나와 카테고리 크롤링 (상세 정보 포함)
 */
async function crawlDanawaCategory(
  categoryCode: string,
  limit: number = 20,
  sort: DanawaSortOption = 'review'
): Promise<SearchProduct[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 이미지 로드 활성화 (썸네일 추출용)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // 스타일시트, 폰트, 미디어만 차단 (이미지는 허용)
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const products: SearchProduct[] = [];
    const PRODUCTS_PER_PAGE = 30;
    const totalPages = Math.ceil(limit / PRODUCTS_PER_PAGE);

    // 첫 페이지 로드
    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}`;
    console.log(`[Danawa] Crawling: ${categoryUrl}`);
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let pageNum = 1; pageNum <= totalPages && products.length < limit; pageNum++) {
      // 2페이지 이상이면 movePage() 함수 호출
      if (pageNum > 1) {
        console.log(`[Danawa] Navigating to page ${pageNum}...`);
        try {
          await page.evaluate((pn) => {
            // Danawa's global function
            const movePageFn = (window as any).movePage;
            if (typeof movePageFn === 'function') {
              movePageFn(pn);
            }
          }, pageNum);
          // AJAX 로딩 대기
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (e) {
          console.log(`[Danawa] Failed to navigate to page ${pageNum}:`, e);
          break;
        }
      }

      const html = await page.content();
      const $ = load(html);

      const productItems = $('#productListArea .prod_item, .main_prodlist .prod_item');
      console.log(`[Danawa] Page ${pageNum}: Found ${productItems.length} items`);

      if (productItems.length === 0) {
        console.log(`[Danawa] No more products, stopping pagination`);
        break;
      }

      productItems.each((index, element) => {
        if (products.length >= limit) return false;

      const $item = $(element);

      // 상품 코드
      const pcodeInput = $item.find('input[id^="productItem_categoryInfo_"]').attr('id');
      const pcode = pcodeInput?.replace('productItem_categoryInfo_', '') || '';
      if (!pcode) return;

      // 상품명
      const name = $item.find('.prod_name a').text().trim().replace(/\s+/g, ' ');

      // 가격 (쉼표 제거)
      const minPriceInput = $item.find(`input[id="min_price_${pcode}"]`).val();
      const priceStr = String(minPriceInput || '').replace(/,/g, '');
      const price = priceStr ? parseInt(priceStr, 10) : null;

      // 별점 (star-single 요소)
      let rating: number | null = null;
      const starEl = $item.find('.star-single');
      if (starEl.length) {
        const starText = starEl.text().trim();
        const ratingMatch = starText.match(/([\d.]+)/);
        if (ratingMatch) rating = parseFloat(ratingMatch[1]);
      }

      // 외부 리뷰 수 (text__number)
      let reviewCount: number | null = null;
      const reviewNumEl = $item.find('.text__number');
      if (reviewNumEl.length) {
        const reviewText = reviewNumEl.text().trim();
        const reviewMatch = reviewText.match(/([\d,]+)/);
        if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
      }

      // 다나와 의견 수
      let opinionCount: number | null = null;
      const opinionEl = $item.find('.meta_item.mt_comment .dd strong');
      if (opinionEl.length) {
        const opinionText = opinionEl.text().trim();
        const opinionMatch = opinionText.match(/(\d+)/);
        if (opinionMatch) opinionCount = parseInt(opinionMatch[1], 10);
      }

      // 썸네일 이미지
      let thumbnail: string | null = null;
      const imgEl = $item.find('.thumb_image img');
      thumbnail = imgEl.attr('data-original') || imgEl.attr('src') || null;
      if (thumbnail?.startsWith('//')) {
        thumbnail = `https:${thumbnail}`;
      }
      // 빈 이미지 URL 필터링
      if (thumbnail?.includes('noImg') || thumbnail?.includes('blank')) {
        thumbnail = null;
      }

      // 스펙 정보
      const specs: Record<string, string> = {};
      const specText = $item.find('.spec_list').text().trim();
      if (specText) {
        const specParts = specText.split('/').map((s) => s.trim()).filter(Boolean);
        specParts.forEach((part, idx) => {
          if (part.includes(':')) {
            const [key, value] = part.split(':', 2);
            specs[key.trim()] = value.trim();
          } else if (part.startsWith('[')) {
            const catMatch = part.match(/\[(.+?)\]\s*(.+)/);
            if (catMatch) {
              specs[catMatch[1]] = (specs[catMatch[1]] ? specs[catMatch[1]] + ', ' : '') + catMatch[2];
            }
          } else {
            specs[`feature_${idx}`] = part;
          }
        });
      }

      // 브랜드
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
        brand,
        productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
      });
    });
    } // end for loop (pagination)

    console.log(`[Danawa] Successfully parsed ${products.length} products`);
    return products;
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * Gemini 2.5 Flash-Lite + Google Search Grounding으로 웹 검색
 * 최신 SDK 포맷 사용
 */
async function searchWithGemini(keyword: string): Promise<{
  buyingGuide: string;
  trends: string;
  tradeoffs: string;
  sources: string[];
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const sources: string[] = [];

  // Google Search grounding 도구 설정
  const groundingTool = {
    googleSearch: {},
  };

  const config = {
    tools: [groundingTool],
  };

  // 구매 가이드
  console.log('[Gemini] Searching: 구매 가이드...');
  const guideResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `${keyword} 구매 가이드 2025년 선택 기준과 핵심 포인트를 한국어로 정리해줘. 용량, 기능, 가격대별 추천 기준을 포함해줘.`,
    config,
  });
  const buyingGuide = guideResponse.text || '';

  // 출처 수집
  const guideChunks = guideResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (guideChunks) {
    for (const chunk of guideChunks) {
      if (chunk.web?.uri) sources.push(chunk.web.uri);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 트렌드
  console.log('[Gemini] Searching: 트렌드...');
  const trendResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `${keyword} 2025년 최신 트렌드와 인기 기능, 주요 브랜드를 한국어로 정리해줘.`,
    config,
  });
  const trends = trendResponse.text || '';

  const trendChunks = trendResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (trendChunks) {
    for (const chunk of trendChunks) {
      if (chunk.web?.uri) sources.push(chunk.web.uri);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 트레이드오프
  console.log('[Gemini] Searching: 트레이드오프...');
  const tradeoffResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `${keyword} 구매할 때 고민되는 트레이드오프 3가지를 한국어로 정리해줘. 예: 대용량 vs 소형, 가성비 vs 프리미엄 등.`,
    config,
  });
  const tradeoffs = tradeoffResponse.text || '';

  const tradeoffChunks = tradeoffResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (tradeoffChunks) {
    for (const chunk of tradeoffChunks) {
      if (chunk.web?.uri) sources.push(chunk.web.uri);
    }
  }

  return {
    buyingGuide,
    trends,
    tradeoffs,
    sources: [...new Set(sources)], // 중복 제거
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, type = 'danawa', limit = 20, sort = 'review' } = body as {
      keyword: string;
      type?: 'danawa' | 'websearch' | 'full';
      limit?: number;
      sort?: DanawaSortOption;
    };

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    const result: {
      keyword: string;
      type: string;
      sort?: DanawaSortOption;
      danawa?: {
        products: SearchProduct[];
        totalCount: number;
        topBrands: string[];
        priceRange: { min: number; max: number };
        stats: {
          withThumbnail: number;
          withRating: number;
          withReview: number;
          withSpecs: number;
        };
      };
      websearch?: {
        buyingGuide: string;
        trends: string;
        tradeoffs: string;
        sources: string[];
      };
      duration: number;
    } = {
      keyword,
      type,
      sort: type !== 'websearch' ? sort : undefined,
      duration: 0,
    };

    const startTime = Date.now();

    // 다나와 크롤링
    if (type === 'danawa' || type === 'full') {
      const categoryCode = CATEGORY_CODES[keyword];
      if (categoryCode) {
        const products = await crawlDanawaCategory(categoryCode, limit, sort);

        // 브랜드 집계
        const brandCounts: Record<string, number> = {};
        products.forEach((p) => {
          if (p.brand) {
            brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
          }
        });
        const topBrands = Object.entries(brandCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([brand]) => brand);

        // 가격 범위
        const prices = products.map((p) => p.price).filter((p): p is number => p !== null);
        const priceRange = {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 0,
        };

        // 통계
        const stats = {
          withThumbnail: products.filter((p) => p.thumbnail).length,
          withRating: products.filter((p) => p.rating).length,
          withReview: products.filter((p) => p.reviewCount).length,
          withSpecs: products.filter((p) => Object.keys(p.specs).length > 0).length,
        };

        result.danawa = {
          products,
          totalCount: products.length,
          topBrands,
          priceRange,
          stats,
        };
      } else {
        result.danawa = {
          products: [],
          totalCount: 0,
          topBrands: [],
          priceRange: { min: 0, max: 0 },
          stats: { withThumbnail: 0, withRating: 0, withReview: 0, withSpecs: 0 },
        };
      }
    }

    // 웹 검색
    if (type === 'websearch' || type === 'full') {
      result.websearch = await searchWithGemini(keyword);
    }

    result.duration = Date.now() - startTime;

    return NextResponse.json(result);
  } catch (error) {
    console.error('[knowledge/test] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
