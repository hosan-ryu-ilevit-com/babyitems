/**
 * Knowledge Pipeline v2 (Manus 아키텍처)
 *
 * "Cold Storage" 원칙: 크롤링 시점에 LLM 전처리를 수행하여
 * 런타임 LLM 호출을 최소화하고, KV-Cache 효율을 높임.
 *
 * 파이프라인 단계:
 * 1. 다나와 크롤링 (상품 리스트 + PDP 상세)
 * 2. 리뷰 크롤링 (다나와 의견)
 * 3. LLM 전처리 (상품별 분석)
 * 4. 카테고리 인사이트 생성
 * 5. DB 저장 (knowledge_*_v2 테이블)
 * 6. .md 파일 생성 (index.md, products.md)
 *
 * 사용법:
 *   npx tsx scripts/knowledge/crawl-pipeline-v2.ts --category=airfryer --limit=30
 *
 * 옵션:
 *   --category: 카테고리 키 (필수)
 *   --limit: 크롤링할 상품 수 (기본: 30)
 *   --skip-reviews: 리뷰 크롤링 건너뛰기
 *   --skip-llm: LLM 분석 건너뛰기
 *   --force: 기존 데이터 덮어쓰기
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// 환경변수 로드
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ============================================================================
// 클라이언트 초기화
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// ============================================================================
// 카테고리 설정
// ============================================================================

interface CategoryConfig {
  name: string;
  danawa_code: string;
  key_specs: string[];
  common_cons: string[];
}

const CATEGORIES: Record<string, CategoryConfig> = {
  airfryer: {
    name: '에어프라이어',
    danawa_code: '10252979',
    key_specs: ['용량', '소비전력', '내부재질', '조작방식', '타이머', '크기'],
    common_cons: ['소음이 큼', '세척 어려움', '전기세 부담', '공간 많이 차지', '무거움', '예열 오래 걸림']
  },
  robot_cleaner: {
    name: '로봇청소기',
    danawa_code: '103412',
    key_specs: ['흡입력', '물걸레', '장애물회피', '배터리', '먼지통용량'],
    common_cons: ['소음', '장애물 회피 불량', '배터리 짧음', '구석 청소 안됨', 'AS 어려움']
  },
  dishwasher: {
    name: '식기세척기',
    danawa_code: '1020927',
    key_specs: ['용량', '설치방식', '세척코스', '건조방식', '소음'],
    common_cons: ['소음', '세척력 부족', '건조 불량', '설치 어려움', '물때']
  }
};

// ============================================================================
// Types
// ============================================================================

interface CrawledProduct {
  pcode: string;
  name: string;
  brand: string | null;
  maker: string | null;
  price: number | null;
  thumbnail: string | null;
  rating: number | null;
  reviewCount: number | null;
  opinionCount: number | null;
  specsText: string;
  specsSummary: Record<string, string>;
  specsDetail: Record<string, string>;
  productUrl: string;
}

interface CrawledReview {
  pcode: string;
  reviewId: string;
  source: string;
  author: string;
  content: string;
  rating: number | null;
  helpfulCount: number;
  reviewDate: string | null;
}

interface LLMAnalysis {
  spec_summary_text: string;
  buying_point: string;
  review_summary: string;
  pros: string[];
  cons: string[];
  target_persona: string[];
  value_score: number;
  quality_score: number;
  ease_score: number;
}

// ============================================================================
// 브라우저 유틸
// ============================================================================

async function createBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

async function setupPage(browser: Browser, blockImages = true): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  if (blockImages) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  return page;
}

// ============================================================================
// Step 1: 상품 리스트 크롤링
// ============================================================================

async function crawlProductList(
  browser: Browser,
  categoryCode: string,
  limit: number
): Promise<CrawledProduct[]> {
  console.log(`\n[Step 1] 상품 리스트 크롤링 (limit: ${limit})`);

  const page = await setupPage(browser, false);
  const products: CrawledProduct[] = [];
  const PRODUCTS_PER_PAGE = 30;
  const totalPages = Math.ceil(limit / PRODUCTS_PER_PAGE);

  try {
    const categoryUrl = `https://prod.danawa.com/list/?cate=${categoryCode}`;
    console.log(`[Crawl] URL: ${categoryUrl}`);
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    for (let pageNum = 1; pageNum <= totalPages && products.length < limit; pageNum++) {
      if (pageNum > 1) {
        console.log(`[Crawl] 페이지 ${pageNum}로 이동...`);
        await page.evaluate((pn) => {
          // @ts-ignore
          if (typeof movePage === 'function') movePage(pn);
        }, pageNum);
        await new Promise((r) => setTimeout(r, 3000));
      }

      const html = await page.content();
      const $ = load(html);
      const productItems = $('#productListArea .prod_item, .main_prodlist .prod_item');

      console.log(`[Crawl] 페이지 ${pageNum}: ${productItems.length}개 상품 발견`);

      productItems.each((index, element) => {
        if (products.length >= limit) return false;

        const $item = $(element);
        const pcodeInput = $item.find('input[id^="productItem_categoryInfo_"]').attr('id');
        const pcode = pcodeInput?.replace('productItem_categoryInfo_', '') || '';
        if (!pcode) return;

        // 상품명
        const name = $item.find('.prod_name a').text().trim().replace(/\s+/g, ' ');

        // 가격
        const minPriceInput = $item.find(`input[id="min_price_${pcode}"]`).val();
        const priceStr = String(minPriceInput || '').replace(/,/g, '');
        const price = priceStr ? parseInt(priceStr, 10) : null;

        // 별점, 리뷰수, 의견수
        let rating: number | null = null;
        const starEl = $item.find('.star-single');
        if (starEl.length) {
          const starText = starEl.text().trim();
          const ratingMatch = starText.match(/([\d.]+)/);
          if (ratingMatch) rating = parseFloat(ratingMatch[1]);
        }

        let reviewCount: number | null = null;
        const reviewNumEl = $item.find('.text__number');
        if (reviewNumEl.length) {
          const reviewText = reviewNumEl.text().trim();
          const reviewMatch = reviewText.match(/([\d,]+)/);
          if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
        }

        let opinionCount: number | null = null;
        const opinionEl = $item.find('.meta_item.mt_comment .dd strong');
        if (opinionEl.length) {
          const opinionText = opinionEl.text().trim();
          const opinionMatch = opinionText.match(/(\d+)/);
          if (opinionMatch) opinionCount = parseInt(opinionMatch[1], 10);
        }

        // 썸네일
        let thumbnail: string | null = null;
        const imgEl = $item.find('.thumb_image img');
        thumbnail = imgEl.attr('data-original') || imgEl.attr('src') || null;
        if (thumbnail?.startsWith('//')) thumbnail = `https:${thumbnail}`;
        if (thumbnail?.includes('noImg') || thumbnail?.includes('blank')) thumbnail = null;

        // 스펙
        const specsText = $item.find('.spec_list').text().trim();
        const specsSummary = parseSpecsText(specsText);

        // 브랜드
        const wishVal = $item.find(`input[id^="wishListBundleVal_${pcode}"]`).val() || '';
        const wishParts = String(wishVal).split('//');
        const brand = wishParts[1]?.split(' ')[0] || null;

        products.push({
          pcode,
          name: name || `상품 ${pcode}`,
          brand,
          maker: null,
          price,
          thumbnail,
          rating,
          reviewCount,
          opinionCount,
          specsText,
          specsSummary,
          specsDetail: {},
          productUrl: `https://prod.danawa.com/info/?pcode=${pcode}`,
        });
      });
    }

    console.log(`[Step 1] 완료: ${products.length}개 상품`);
    return products;
  } finally {
    await page.close();
  }
}

function parseSpecsText(specsText: string): Record<string, string> {
  const specsSummary: Record<string, string> = {};
  if (!specsText) return specsSummary;

  const specParts = specsText.split('/').map((s) => s.trim()).filter(Boolean);
  specParts.forEach((part) => {
    if (part.includes(':')) {
      const colonIdx = part.indexOf(':');
      const key = part.substring(0, colonIdx).trim().replace(/^\[|\]$/g, '');
      const value = part.substring(colonIdx + 1).trim();
      if (key && value) specsSummary[key] = value;
    } else if (part.startsWith('[')) {
      const match = part.match(/\[(.+?)\]\s*(.+)/);
      if (match) {
        const key = match[1];
        const value = match[2];
        specsSummary[key] = (specsSummary[key] ? specsSummary[key] + ', ' : '') + value;
      }
    }
  });

  return specsSummary;
}

// ============================================================================
// Step 2: PDP 상세 + 리뷰 크롤링
// ============================================================================

async function crawlProductDetails(
  browser: Browser,
  products: CrawledProduct[],
  skipReviews: boolean
): Promise<{ products: CrawledProduct[]; reviews: CrawledReview[] }> {
  console.log(`\n[Step 2] PDP 상세 크롤링 (${products.length}개)`);

  const allReviews: CrawledReview[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[PDP] ${i + 1}/${products.length}: ${product.pcode}`);

    const page = await setupPage(browser);
    try {
      const url = `https://prod.danawa.com/info/?pcode=${product.pcode}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluate(() => window.scrollTo(0, 800));
      await new Promise((r) => setTimeout(r, 1500));

      const html = await page.content();
      const $ = load(html);

      // 제조사
      product.maker = extractMaker($);

      // 상세 스펙
      product.specsDetail = extractDetailSpecs($);

      // 리뷰 크롤링
      if (!skipReviews && product.opinionCount && product.opinionCount > 0) {
        const reviews = extractReviews($, product.pcode);
        allReviews.push(...reviews);
      }
    } catch (e) {
      console.error(`[PDP] Error: ${product.pcode}`, e);
    } finally {
      await page.close();
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[Step 2] 완료: ${allReviews.length}개 리뷰 수집`);
  return { products, reviews: allReviews };
}

function extractMaker($: ReturnType<typeof load>): string | null {
  const makerElem = $('.made_info .txt a').text().trim();
  if (makerElem) return makerElem;

  let maker: string | null = null;
  $('th').each((_, el) => {
    if ($(el).text().includes('제조회사')) {
      const td = $(el).next('td');
      if (td.length) {
        maker = td.text().replace(/\(제조사 웹사이트 바로가기\)/g, '').trim();
        return false;
      }
    }
  });
  return maker;
}

function extractDetailSpecs($: ReturnType<typeof load>): Record<string, string> {
  const specs: Record<string, string> = {};
  const blacklist = ['구매 주의사항', '빠른 배송', '배송 안내', '주의사항', '법적 고지', '반품/교환', '상품평'];

  const specSelectors = [
    '.spec_tbl tr',
    '#productDescriptionArea table tr',
    '.spec_sec table tr',
    'table.spec_tbl tr',
  ];

  for (const selector of specSelectors) {
    const rows = $(selector);
    if (rows.length > 0) {
      rows.each((_, el) => {
        const ths = $(el).find('th');
        const tds = $(el).find('td');

        const minLength = Math.min(ths.length, tds.length);
        for (let i = 0; i < minLength; i++) {
          const key = $(ths[i]).text().trim();
          let val = $(tds[i]).text().trim()
            .replace(/인증번호\s*확인/g, '')
            .replace(/\(제조사 웹사이트 바로가기\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (key && val && key.length < 50 && val.length < 200 && !blacklist.some(b => key.includes(b)) && !specs[key]) {
            specs[key] = val;
          }
        }
      });

      if (Object.keys(specs).length > 5) break;
    }
  }

  return specs;
}

function extractReviews($: ReturnType<typeof load>, pcode: string): CrawledReview[] {
  const reviews: CrawledReview[] = [];

  // 다나와 의견 크롤링
  $('.cmt_list .cmt_item, .prod_opinion_list .opinion_item').each((idx, el) => {
    if (reviews.length >= 10) return false;

    const $item = $(el);
    const content = $item.find('.txt, .opinion_txt').text().trim();
    if (!content || content.length < 10) return;

    const author = $item.find('.info_user .name, .name').first().text().trim() || '익명';
    const ratingEl = $item.find('.star_mask, .star');
    let rating: number | null = null;
    if (ratingEl.length) {
      const style = ratingEl.attr('style');
      if (style) {
        const widthMatch = style.match(/width:\s*([\d.]+)/);
        if (widthMatch) rating = parseFloat(widthMatch[1]) / 20;
      }
    }

    const dateText = $item.find('.date, .time').text().trim();

    reviews.push({
      pcode,
      reviewId: `danawa_${pcode}_${idx}`,
      source: 'danawa',
      author,
      content,
      rating,
      helpfulCount: 0,
      reviewDate: dateText || null,
    });
  });

  return reviews;
}

// ============================================================================
// Step 3: LLM 전처리 (핵심!)
// ============================================================================

async function analyzeProductsWithLLM(
  products: CrawledProduct[],
  reviews: CrawledReview[],
  categoryConfig: CategoryConfig
): Promise<Map<string, LLMAnalysis>> {
  console.log(`\n[Step 3] LLM 전처리 분석 (${products.length}개 상품)`);

  const analysisMap = new Map<string, LLMAnalysis>();

  if (!ai) {
    console.log('[LLM] API 키 없음 - 기본값 사용');
    products.forEach((p) => {
      analysisMap.set(p.pcode, getDefaultAnalysis(p));
    });
    return analysisMap;
  }

  // 상품별 리뷰 그룹화
  const reviewsByPcode = new Map<string, CrawledReview[]>();
  reviews.forEach((r) => {
    const list = reviewsByPcode.get(r.pcode) || [];
    list.push(r);
    reviewsByPcode.set(r.pcode, list);
  });

  // 배치 처리 (3개씩)
  const BATCH_SIZE = 3;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    console.log(`[LLM] 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map(p => p.pcode).join(', ')}`);

    const analyses = await Promise.all(
      batch.map(async (product) => {
        const productReviews = reviewsByPcode.get(product.pcode) || [];
        return {
          pcode: product.pcode,
          analysis: await analyzeOneProduct(product, productReviews, categoryConfig)
        };
      })
    );

    analyses.forEach(({ pcode, analysis }) => {
      analysisMap.set(pcode, analysis);
    });

    // Rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[Step 3] 완료: ${analysisMap.size}개 분석`);
  return analysisMap;
}

async function analyzeOneProduct(
  product: CrawledProduct,
  reviews: CrawledReview[],
  categoryConfig: CategoryConfig
): Promise<LLMAnalysis> {
  if (!ai) return getDefaultAnalysis(product);

  const reviewTexts = reviews.slice(0, 5).map(r =>
    `[${r.rating ? r.rating + '점' : '평점없음'}] ${r.content.substring(0, 100)}`
  ).join('\n');

  const prompt = `상품 정보를 분석해서 JSON으로 응답해주세요.

## 상품 정보
- 이름: ${product.name}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price?.toLocaleString() || '미상'}원
- 스펙: ${JSON.stringify(product.specsSummary)}
- 상세 스펙: ${JSON.stringify(product.specsDetail)}

## 사용자 리뷰 (최대 5개)
${reviewTexts || '리뷰 없음'}

## 카테고리 정보
- 중요 스펙: ${categoryConfig.key_specs.join(', ')}
- 흔한 단점: ${categoryConfig.common_cons.join(', ')}

## 응답 형식 (JSON만!)
{
  "spec_summary_text": "핵심 스펙 한 줄 요약 (예: 12L 대용량, 1700W, 스텐 내부)",
  "buying_point": "이 상품의 차별화된 구매 포인트 한 줄",
  "review_summary": "리뷰에서 나온 실사용 평가 한 줄 요약",
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2"],
  "target_persona": ["추천 대상1", "추천 대상2"],
  "value_score": 85,
  "quality_score": 80,
  "ease_score": 75
}

- pros/cons는 실제 리뷰와 스펙에서 추출
- *_score는 0-100 점수 (가성비/품질/사용편의)
- target_persona는 이 상품이 적합한 사용자 유형`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        spec_summary_text: parsed.spec_summary_text || '',
        buying_point: parsed.buying_point || '',
        review_summary: parsed.review_summary || '',
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        target_persona: parsed.target_persona || [],
        value_score: parsed.value_score || 70,
        quality_score: parsed.quality_score || 70,
        ease_score: parsed.ease_score || 70,
      };
    }
  } catch (e) {
    console.error(`[LLM] 분석 실패: ${product.pcode}`, e);
  }

  return getDefaultAnalysis(product);
}

function getDefaultAnalysis(product: CrawledProduct): LLMAnalysis {
  const specs = Object.entries(product.specsSummary).slice(0, 5);
  return {
    spec_summary_text: specs.map(([k, v]) => `${k}: ${v}`).join(', '),
    buying_point: '',
    review_summary: '',
    pros: [],
    cons: [],
    target_persona: [],
    value_score: 70,
    quality_score: 70,
    ease_score: 70,
  };
}

// ============================================================================
// Step 4: 카테고리 인사이트 생성
// ============================================================================

interface CategoryInsights {
  market_trend: string;
  buying_guide: string;
  common_tradeoffs: Array<{ a: string; b: string; insight: string }>;
  price_segments: Record<string, { min: number; max: number; desc: string }>;
  top_brands: Array<{ brand: string; count: number; avg_price: number; avg_rating: number }>;
}

async function generateCategoryInsights(
  products: CrawledProduct[],
  analyses: Map<string, LLMAnalysis>,
  categoryConfig: CategoryConfig
): Promise<CategoryInsights> {
  console.log(`\n[Step 4] 카테고리 인사이트 생성`);

  // 브랜드 통계
  const brandStats = new Map<string, { count: number; prices: number[]; ratings: number[] }>();
  products.forEach((p) => {
    if (p.brand) {
      const stat = brandStats.get(p.brand) || { count: 0, prices: [], ratings: [] };
      stat.count++;
      if (p.price) stat.prices.push(p.price);
      if (p.rating) stat.ratings.push(p.rating);
      brandStats.set(p.brand, stat);
    }
  });

  const top_brands = Array.from(brandStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([brand, stat]) => ({
      brand,
      count: stat.count,
      avg_price: stat.prices.length ? Math.round(stat.prices.reduce((a, b) => a + b, 0) / stat.prices.length) : 0,
      avg_rating: stat.ratings.length ? parseFloat((stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length).toFixed(1)) : 0,
    }));

  // 가격대 통계
  const prices = products.map((p) => p.price).filter((p): p is number => p !== null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  const price_segments = {
    entry: {
      min: minPrice,
      max: Math.round(minPrice + priceRange * 0.3),
      desc: '기본 기능에 충실한 실속형'
    },
    mid: {
      min: Math.round(minPrice + priceRange * 0.3),
      max: Math.round(minPrice + priceRange * 0.7),
      desc: '가성비 좋은 인기 모델'
    },
    premium: {
      min: Math.round(minPrice + priceRange * 0.7),
      max: maxPrice,
      desc: '프리미엄 기능과 품질'
    }
  };

  // LLM으로 트렌드/가이드 생성
  let market_trend = '';
  let buying_guide = '';
  let common_tradeoffs: Array<{ a: string; b: string; insight: string }> = [];

  if (ai) {
    const topProducts = products.slice(0, 10).map((p) => ({
      name: p.name,
      brand: p.brand,
      price: p.price,
      specs: p.specsSummary,
      analysis: analyses.get(p.pcode),
    }));

    const prompt = `다음은 ${categoryConfig.name} 카테고리의 인기 상품 TOP 10입니다:

${JSON.stringify(topProducts, null, 2)}

## 응답 형식 (JSON만!)
{
  "market_trend": "2025년 현재 이 카테고리의 주요 트렌드 (2-3문장)",
  "buying_guide": "구매 시 체크해야 할 핵심 포인트 (2-3문장)",
  "common_tradeoffs": [
    {"a": "선택지A", "b": "선택지B", "insight": "A를 선택하면 ~하고, B를 선택하면 ~합니다."},
    {"a": "선택지A", "b": "선택지B", "insight": "..."}
  ]
}

- tradeoffs는 실제 구매 결정에 중요한 것으로 2-3개`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: prompt,
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        market_trend = parsed.market_trend || '';
        buying_guide = parsed.buying_guide || '';
        common_tradeoffs = parsed.common_tradeoffs || [];
      }
    } catch (e) {
      console.error('[LLM] 카테고리 인사이트 생성 실패', e);
    }
  }

  console.log(`[Step 4] 완료`);
  return { market_trend, buying_guide, common_tradeoffs, price_segments, top_brands };
}

// ============================================================================
// Step 5: DB 저장
// ============================================================================

async function saveToDatabase(
  categoryKey: string,
  categoryConfig: CategoryConfig,
  products: CrawledProduct[],
  reviews: CrawledReview[],
  analyses: Map<string, LLMAnalysis>,
  insights: CategoryInsights
): Promise<void> {
  console.log(`\n[Step 5] DB 저장`);

  // 카테고리 저장
  const { error: catError } = await supabase.from('knowledge_categories_v2').upsert({
    category_key: categoryKey,
    category_name: categoryConfig.name,
    danawa_code: categoryConfig.danawa_code,
    market_trend: insights.market_trend,
    buying_guide: insights.buying_guide,
    common_tradeoffs: insights.common_tradeoffs,
    price_segments: insights.price_segments,
    key_specs: categoryConfig.key_specs,
    common_cons: categoryConfig.common_cons,
    top_brands: insights.top_brands,
    product_count: products.length,
    review_count: reviews.length,
    last_crawled_at: new Date().toISOString(),
    last_analyzed_at: new Date().toISOString(),
  }, { onConflict: 'category_key' });

  if (catError) {
    console.error('[DB] 카테고리 저장 실패:', catError.message);
  } else {
    console.log('[DB] 카테고리 저장 완료');
  }

  // 상품 저장
  let successCount = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const analysis = analyses.get(p.pcode) || getDefaultAnalysis(p);

    const { error } = await supabase.from('knowledge_products_v2').upsert({
      category_key: categoryKey,
      pcode: p.pcode,
      danawa_category_code: categoryConfig.danawa_code,
      name: p.name,
      brand: p.brand,
      maker: p.maker,
      price: p.price,
      thumbnail: p.thumbnail,
      product_url: p.productUrl,
      specs_text: p.specsText,
      specs_summary: p.specsSummary,
      specs_detail: p.specsDetail,
      // LLM 전처리 데이터
      spec_summary_text: analysis.spec_summary_text,
      buying_point: analysis.buying_point,
      review_summary: analysis.review_summary,
      pros: analysis.pros,
      cons: analysis.cons,
      target_persona: analysis.target_persona,
      value_score: analysis.value_score,
      quality_score: analysis.quality_score,
      ease_score: analysis.ease_score,
      // 통계
      rating: p.rating,
      review_count: p.reviewCount || 0,
      opinion_count: p.opinionCount || 0,
      popularity_rank: i + 1,
      last_crawled_at: new Date().toISOString(),
      last_analyzed_at: new Date().toISOString(),
    }, { onConflict: 'pcode' });

    if (error) {
      console.error(`[DB] 상품 저장 실패: ${p.pcode}`, error.message);
    } else {
      successCount++;
    }
  }

  console.log(`[DB] 상품 저장: ${successCount}/${products.length}`);

  // 리뷰 저장
  if (reviews.length > 0) {
    for (const r of reviews) {
      await supabase.from('knowledge_reviews_v2').upsert({
        pcode: r.pcode,
        review_id: r.reviewId,
        source: r.source,
        author: r.author,
        content: r.content,
        rating: r.rating,
        helpful_count: r.helpfulCount,
        review_date: r.reviewDate,
        crawled_at: new Date().toISOString(),
      }, { onConflict: 'pcode,review_id,source' });
    }
    console.log(`[DB] 리뷰 저장: ${reviews.length}개`);
  }

  console.log(`[Step 5] 완료`);
}

// ============================================================================
// Step 6: .md 파일 생성
// ============================================================================

function generateMarkdownFiles(
  categoryKey: string,
  categoryConfig: CategoryConfig,
  products: CrawledProduct[],
  analyses: Map<string, LLMAnalysis>,
  insights: CategoryInsights
): void {
  console.log(`\n[Step 6] .md 파일 생성`);

  const knowledgeDir = path.join(process.cwd(), 'data', 'knowledge', categoryKey);
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];

  // index.md (Stable Prefix용 도메인 지식)
  const tradeoffRows = insights.common_tradeoffs
    .map((t) => `| ${t.a} | ${t.b} | ${t.insight} |`)
    .join('\n');

  const priceInfo = Object.entries(insights.price_segments)
    .map(([key, seg]) => `- **${key === 'entry' ? '엔트리' : key === 'mid' ? '미들' : '프리미엄'}**: ${seg.min.toLocaleString()}~${seg.max.toLocaleString()}원 (${seg.desc})`)
    .join('\n');

  const brandInfo = insights.top_brands
    .map((b, i) => `${i + 1}. **${b.brand}** (${b.count}개 상품, 평균 ${b.avg_price.toLocaleString()}원, 평점 ${b.avg_rating})`)
    .join('\n');

  const indexMd = `# ${categoryConfig.name} 도메인 지식

> 마지막 업데이트: ${timestamp}
> 데이터 소스: 다나와 (상위 ${products.length}개 상품)

## 시장 트렌드 (2025년)

${insights.market_trend || '분석 중...'}

## 구매 가이드

${insights.buying_guide || '분석 중...'}

## 주요 트레이드오프

| 선택 A | 선택 B | 인사이트 |
|--------|--------|----------|
${tradeoffRows || '| - | - | 분석 중 |'}

## 가격대별 특징

${priceInfo}

## 인기 브랜드 TOP 5

${brandInfo}

## 주요 체크 스펙

${categoryConfig.key_specs.map(s => `- ${s}`).join('\n')}

## 흔한 단점 (필터용)

${categoryConfig.common_cons.map(c => `- ${c}`).join('\n')}

---

*이 문서는 자동 생성되었습니다. (${timestamp})*
`;

  fs.writeFileSync(path.join(knowledgeDir, 'index.md'), indexMd);
  console.log(`[File] index.md 생성`);

  // products.md (상품 상세)
  const productEntries = products.slice(0, 30).map((p, i) => {
    const analysis = analyses.get(p.pcode) || getDefaultAnalysis(p);
    return `### ${i + 1}. ${p.name}

- **브랜드**: ${p.brand || '-'}
- **가격**: ${p.price?.toLocaleString() || '-'}원
- **핵심 스펙**: ${analysis.spec_summary_text || '-'}
- **구매 포인트**: ${analysis.buying_point || '-'}
- **리뷰 요약**: ${analysis.review_summary || '-'}
- **장점**: ${analysis.pros.length ? analysis.pros.join(', ') : '-'}
- **단점**: ${analysis.cons.length ? analysis.cons.join(', ') : '-'}
- **추천 대상**: ${analysis.target_persona.length ? analysis.target_persona.join(', ') : '-'}
- **점수**: 가성비 ${analysis.value_score} / 품질 ${analysis.quality_score} / 편의성 ${analysis.ease_score}
- **평점**: ${p.rating || '-'} (리뷰 ${p.reviewCount?.toLocaleString() || 0}개)
`;
  });

  const productsMd = `# ${categoryConfig.name} 상품 리스트

> 마지막 업데이트: ${timestamp}
> 인기순 TOP 30

${productEntries.join('\n---\n\n')}
`;

  fs.writeFileSync(path.join(knowledgeDir, 'products.md'), productsMd);
  console.log(`[File] products.md 생성`);

  // _meta.json
  const meta = {
    category_key: categoryKey,
    category_name: categoryConfig.name,
    product_count: products.length,
    last_updated: new Date().toISOString(),
    files: ['index.md', 'products.md'],
  };
  fs.writeFileSync(path.join(knowledgeDir, '_meta.json'), JSON.stringify(meta, null, 2));
  console.log(`[File] _meta.json 생성`);

  console.log(`[Step 6] 완료`);
}

// ============================================================================
// 메인 실행
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const categoryArg = args.find((a) => a.startsWith('--category='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const skipReviews = args.includes('--skip-reviews');
  const skipLLM = args.includes('--skip-llm');

  const categoryKey = categoryArg?.split('=')[1] || 'airfryer';
  const limit = parseInt(limitArg?.split('=')[1] || '30', 10);

  const categoryConfig = CATEGORIES[categoryKey];
  if (!categoryConfig) {
    console.error(`Unknown category: ${categoryKey}`);
    console.log('Available:', Object.keys(CATEGORIES).join(', '));
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`Knowledge Pipeline v2 (Manus 아키텍처)`);
  console.log(`카테고리: ${categoryConfig.name} (${categoryKey})`);
  console.log(`다나와 코드: ${categoryConfig.danawa_code}`);
  console.log(`상품 수: ${limit}`);
  console.log(`리뷰 크롤링: ${skipReviews ? '건너뜀' : '수행'}`);
  console.log(`LLM 분석: ${skipLLM ? '건너뜀' : '수행'}`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  const browser = await createBrowser();

  try {
    // Step 1: 상품 리스트 크롤링
    const products = await crawlProductList(browser, categoryConfig.danawa_code, limit);

    // Step 2: PDP 상세 + 리뷰 크롤링
    const { products: enrichedProducts, reviews } = await crawlProductDetails(browser, products, skipReviews);

    // Step 3: LLM 전처리
    let analyses: Map<string, LLMAnalysis>;
    if (skipLLM) {
      analyses = new Map();
      enrichedProducts.forEach((p) => analyses.set(p.pcode, getDefaultAnalysis(p)));
    } else {
      analyses = await analyzeProductsWithLLM(enrichedProducts, reviews, categoryConfig);
    }

    // Step 4: 카테고리 인사이트 생성
    const insights = await generateCategoryInsights(enrichedProducts, analyses, categoryConfig);

    // Step 5: DB 저장
    await saveToDatabase(categoryKey, categoryConfig, enrichedProducts, reviews, analyses, insights);

    // Step 6: .md 파일 생성
    generateMarkdownFiles(categoryKey, categoryConfig, enrichedProducts, analyses, insights);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 파이프라인 완료! (${duration}s)`);
    console.log(`   - 상품: ${enrichedProducts.length}개`);
    console.log(`   - 리뷰: ${reviews.length}개`);
    console.log(`   - LLM 분석: ${analyses.size}개`);
    console.log('='.repeat(60));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
