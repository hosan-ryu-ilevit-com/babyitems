/**
 * 지식 생성 테스트 API
 *
 * POST /api/v2/knowledge/test
 * Body: { keyword: string, type: 'danawa' | 'websearch' | 'full' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import puppeteer from 'puppeteer';
import { load } from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

// .env.local 로드
config({ path: '.env.local' });

// 다나와 카테고리 코드 매핑 (테스트용)
const CATEGORY_CODES: Record<string, string> = {
  에어프라이어: '10252979',
  로봇청소기: '103412',
  식기세척기: '1020927',
  건조기: '1020935',
  공기청정기: '10252959',
};

interface SearchProduct {
  pcode: string;
  name: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  opinionCount: number | null;
  specs: Record<string, string>;
  brand: string | null;
  productUrl: string;
}

/**
 * 다나와 카테고리 크롤링
 */
async function crawlDanawaCategory(
  categoryCode: string,
  limit: number = 10
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

    // 카테고리 페이지 (상품의견 많은순)
    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}&order=7`;
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const html = await page.content();
    const $ = load(html);

    const products: SearchProduct[] = [];
    const productItems = $('#productListArea .prod_item, .main_prodlist .prod_item');

    productItems.each((index, element) => {
      if (index >= limit) return false;

      const $item = $(element);

      // 상품 코드
      const pcodeInput = $item.find('input[id^="productItem_categoryInfo_"]').attr('id');
      const pcode = pcodeInput?.replace('productItem_categoryInfo_', '') || '';
      if (!pcode) return;

      // 상품명
      const name = $item.find('.prod_name a').text().trim().replace(/\s+/g, ' ');

      // 가격
      const minPriceInput = $item.find(`input[id="min_price_${pcode}"]`).val();
      const priceStr = String(minPriceInput || '').replace(/,/g, '');
      const price = priceStr ? parseInt(priceStr, 10) : null;

      // 별점
      let rating: number | null = null;
      const starEl = $item.find('.star-single');
      if (starEl.length) {
        const starText = starEl.text().trim();
        const ratingMatch = starText.match(/([\d.]+)/);
        if (ratingMatch) rating = parseFloat(ratingMatch[1]);
      }

      // 리뷰 수
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

      // 스펙
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
        specs,
        brand,
        productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
      });
    });

    return products;
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * Gemini Google Search Grounding으로 웹 검색
 */
async function searchWithGemini(keyword: string): Promise<{
  buyingGuide: string;
  trends: string;
  tradeoffs: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // @ts-expect-error - tools 타입 정의 없음
    tools: [{ googleSearch: {} }],
  });

  // 구매 가이드
  const guideResult = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${keyword} 구매 가이드 2025년 선택 기준과 핵심 포인트를 한국어로 정리해줘. 용량, 기능, 가격대별 추천 기준을 포함해줘.`,
          },
        ],
      },
    ],
  });
  const buyingGuide = guideResult.response.text();

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 트렌드
  const trendResult = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${keyword} 2025년 최신 트렌드와 인기 기능, 주요 브랜드를 한국어로 정리해줘.`,
          },
        ],
      },
    ],
  });
  const trends = trendResult.response.text();

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 트레이드오프
  const tradeoffResult = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${keyword} 구매할 때 고민되는 트레이드오프 3가지를 한국어로 정리해줘. 예: 대용량 vs 소형, 가성비 vs 프리미엄 등.`,
          },
        ],
      },
    ],
  });
  const tradeoffs = tradeoffResult.response.text();

  return { buyingGuide, trends, tradeoffs };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, type = 'danawa' } = body as {
      keyword: string;
      type?: 'danawa' | 'websearch' | 'full';
    };

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    const result: {
      keyword: string;
      type: string;
      danawa?: {
        products: SearchProduct[];
        totalCount: number;
        topBrands: string[];
        priceRange: { min: number; max: number };
      };
      websearch?: {
        buyingGuide: string;
        trends: string;
        tradeoffs: string;
      };
      duration: number;
    } = {
      keyword,
      type,
      duration: 0,
    };

    const startTime = Date.now();

    // 다나와 크롤링
    if (type === 'danawa' || type === 'full') {
      const categoryCode = CATEGORY_CODES[keyword];
      if (categoryCode) {
        const products = await crawlDanawaCategory(categoryCode, 10);

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
          min: Math.min(...prices),
          max: Math.max(...prices),
        };

        result.danawa = {
          products,
          totalCount: products.length,
          topBrands,
          priceRange,
        };
      } else {
        result.danawa = {
          products: [],
          totalCount: 0,
          topBrands: [],
          priceRange: { min: 0, max: 0 },
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
