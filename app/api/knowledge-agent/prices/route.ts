/**
 * Knowledge Agent - 다나와 가격 크롤링 API
 *
 * pcode 기반으로 다나와에서 실시간 가격 정보를 크롤링합니다.
 * - 개발환경: 로컬 Puppeteer
 * - 프로덕션: Fly.io 크롤러 서버 호출
 * - POST 요청: 병렬 처리 (Top 3 등)
 */

import { NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 (캐시 fallback용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =====================================================
// Types
// =====================================================

interface MallPrice {
  mall: string;
  price: number;
  delivery: string;
  seller?: string;
  link?: string;
}

interface PriceResult {
  pcode: string;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  mallPrices: MallPrice[];
  mallCount: number;
  success: boolean;
  error?: string;
}

export const maxDuration = 60;

// Fly.io 크롤러 서버 URL
const CRAWLER_SERVER_URL = process.env.CRAWLER_SERVER_URL || 'https://danawa-crawler.fly.dev';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// =====================================================
// Supabase 캐시 조회 (Fallback)
// =====================================================

async function fetchPriceFromCache(pcode: string): Promise<PriceResult | null> {
  try {
    const { data, error } = await supabase
      .from('knowledge_prices_cache')
      .select('*')
      .eq('pcode', pcode)
      .single();

    if (error || !data) {
      return null;
    }

    console.log(`[PriceCrawl] Cache hit for ${pcode}: ${data.lowest_price?.toLocaleString()}원`);
    return {
      pcode,
      lowestPrice: data.lowest_price,
      lowestMall: data.lowest_mall,
      lowestDelivery: data.lowest_delivery,
      mallPrices: data.mall_prices || [],
      mallCount: data.mall_count || 0,
      success: true,
    };
  } catch (error) {
    console.warn(`[PriceCrawl] Cache lookup failed for ${pcode}:`, error);
    return null;
  }
}

async function fetchPricesFromCache(pcodes: string[]): Promise<Record<string, PriceResult>> {
  const results: Record<string, PriceResult> = {};

  try {
    const { data, error } = await supabase
      .from('knowledge_prices_cache')
      .select('*')
      .in('pcode', pcodes);

    if (error || !data) {
      return results;
    }

    for (const row of data) {
      results[row.pcode] = {
        pcode: row.pcode,
        lowestPrice: row.lowest_price,
        lowestMall: row.lowest_mall,
        lowestDelivery: row.lowest_delivery,
        mallPrices: row.mall_prices || [],
        mallCount: row.mall_count || 0,
        success: true,
      };
    }

    console.log(`[PriceCrawl] Cache hit for ${Object.keys(results).length}/${pcodes.length} products`);
  } catch (error) {
    console.warn('[PriceCrawl] Cache batch lookup failed:', error);
  }

  return results;
}

// =====================================================
// Fly.io 서버 호출 (프로덕션)
// =====================================================

async function fetchPriceFromFlyio(pcode: string): Promise<PriceResult> {
  const TIMEOUT_MS = 30000; // 30초 타임아웃 (콜드스타트 고려 상향)

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${CRAWLER_SERVER_URL}/crawl/price/${pcode}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Fly.io error: ${response.status}`);
    }

    const data = await response.json();
    return {
      pcode,
      lowestPrice: data.lowestPrice,
      lowestMall: data.lowestMall,
      lowestDelivery: data.lowestDelivery,
      mallPrices: data.mallPrices || [],
      mallCount: data.mallCount || 0,
      success: data.success,
      error: data.error,
    };
  } catch (error) {
    const errorMsg = error instanceof Error
      ? (error.name === 'AbortError' ? 'Fly.io timeout (30s)' : error.message)
      : 'Fly.io request failed';
    console.warn(`[PriceCrawl] Fly.io failed for ${pcode}: ${errorMsg}`);

    return {
      pcode,
      lowestPrice: null,
      lowestMall: null,
      lowestDelivery: null,
      mallPrices: [],
      mallCount: 0,
      success: false,
      error: errorMsg,
    };
  }
}

async function fetchPricesFromFlyioBatch(pcodes: string[]): Promise<Record<string, PriceResult>> {
  const TIMEOUT_MS = 90000; // 배치는 90초 타임아웃 (콜드스타트 + 순차처리 고려 대폭 상향)

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${CRAWLER_SERVER_URL}/crawl/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcodes }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Fly.io batch error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || {};
  } catch (error) {
    const errorMsg = error instanceof Error
      ? (error.name === 'AbortError' ? 'Fly.io timeout (90s)' : error.message)
      : 'Fly.io batch request failed';
    console.warn(`[PriceCrawl] Fly.io batch failed: ${errorMsg}`);

    // 개별 실패 결과 반환
    const results: Record<string, PriceResult> = {};
    for (const pcode of pcodes) {
      results[pcode] = {
        pcode,
        lowestPrice: null,
        lowestMall: null,
        lowestDelivery: null,
        mallPrices: [],
        mallCount: 0,
        success: false,
        error: errorMsg,
      };
    }
    return results;
  }
}

// =====================================================
// Puppeteer 가격 크롤링 (로컬 개발용)
// =====================================================

async function crawlPriceLocal(pcode: string): Promise<PriceResult> {
  const result: PriceResult = {
    pcode,
    lowestPrice: null,
    lowestMall: null,
    lowestDelivery: null,
    mallPrices: [],
    mallCount: 0,
    success: false,
  };

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // 더 공격적인 리소스 차단 (속도 최적화)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      // 이미지, 스타일, 폰트, 미디어, 광고/트래킹 차단
      if (
        ['image', 'stylesheet', 'font', 'media', 'texttrack', 'eventsource', 'websocket'].includes(resourceType) ||
        url.includes('google') ||
        url.includes('facebook') ||
        url.includes('analytics') ||
        url.includes('ad') ||
        url.includes('tracker')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 뷰포트 설정 (모바일처럼 작게 - 렌더링 빠르게)
    await page.setViewport({ width: 1280, height: 800 });

    const url = `https://prod.danawa.com/info/?pcode=${pcode}`;

    // 타임아웃 늘리고 networkidle0 대신 domcontentloaded 사용
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 가격 정보가 로드될 때까지 최대 5초 대기
    try {
      await page.waitForSelector('.lowPrice_wrap, .lowest_price, .bnft_price', { timeout: 5000 });
    } catch {
      // 셀렉터 못 찾아도 계속 진행
    }

    // 스크롤 및 가격비교 탭 클릭 (대기 시간 단축)
    await page.evaluate(() => window.scrollTo(0, 500));
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const tabs = await page.$$('.tab_item a, .product_tab a');
      for (const tab of tabs) {
        const text = await page.evaluate((el) => el.textContent, tab);
        if (text?.includes('가격')) {
          await tab.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      }
    } catch {
      // 탭 클릭 실패해도 계속
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(resolve => setTimeout(resolve, 500));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    const mallPrices: MallPrice[] = [];

    // 가격 목록 추출
    $('.lowPrice_wrap .mall_list tbody tr, .diff_item, .ProductList tr, .lowList tbody tr').each((_, row) => {
      const $row = $(row);

      let mall: string | null = null;

      const imgAlt = $row.find('img').first().attr('alt');
      if (imgAlt && imgAlt.length > 1 && !['상품이미지', '이미지'].includes(imgAlt)) {
        mall = imgAlt;
      }

      if (!mall) {
        mall = $row.find('a.mall_name, .logo_over img, td.mall a').first().attr('alt') ||
               $row.find('a.mall_name, td.mall a').first().text().trim() || null;
      }

      if (!mall) {
        mall = $row.attr('data-mall-name') || $row.find('[data-mall-name]').attr('data-mall-name') || null;
      }

      const priceText = $row.find('.price_sect em, .prc, em.prc, .price em, .txt_prc').first().text().replace(/[^\d]/g, '');
      const price = priceText ? parseInt(priceText, 10) : null;

      const delivery = $row.find('.ship, .delivery, .dlv_info').first().text().trim() || '';

      const linkEl = $row.find('a[href*="link.danawa"], a[href*="prod.danawa"]').first();
      const link = linkEl.length ? linkEl.attr('href') : undefined;

      if (price && price > 1000) {
        mallPrices.push({
          mall: mall || '알 수 없음',
          price,
          delivery,
          link,
        });
      }
    });

    mallPrices.sort((a, b) => a.price - b.price);

    // Fallback: 최저가 영역
    if (mallPrices.length === 0) {
      const lowestElem = $('.lowest_price em.prc, .lwst_prc em, .bnft_price em.prc, .price_sect .prc').first();
      const priceText = lowestElem.text().replace(/[^\d]/g, '');

      if (priceText) {
        const price = parseInt(priceText, 10);
        const mall = $('.lowest_price .mall_name, .logo_over img').first().attr('alt') ||
                     $('.lowest_price .mall_name').first().text().trim() || '최저가';

        mallPrices.push({ mall, price, delivery: '' });
      }
    }

    // 중복 제거
    const uniquePrices: MallPrice[] = [];
    const seen = new Set<string>();
    for (const mp of mallPrices) {
      const key = `${mp.mall}-${mp.price}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePrices.push(mp);
      }
    }

    if (uniquePrices.length > 0) {
      result.lowestPrice = uniquePrices[0].price;
      result.lowestMall = uniquePrices[0].mall;
      result.lowestDelivery = uniquePrices[0].delivery;
      result.mallPrices = uniquePrices;
      result.mallCount = uniquePrices.length;
      result.success = true;
    }

    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PriceCrawl] Error for ${pcode}:`, result.error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return result;
}

// =====================================================
// 통합 함수: 환경에 따라 Fly.io 또는 로컬 사용 + 캐시 Fallback
// =====================================================

async function fetchPrice(pcode: string): Promise<PriceResult> {
  // 모든 환경에서 캐시 먼저 확인 (빠름)
  const cacheResult = await fetchPriceFromCache(pcode);
  if (cacheResult) {
    console.log(`[PriceCrawl] Using cached price for ${pcode}`);
    return cacheResult;
  }

  // 캐시 없으면 환경별 크롤링
  if (IS_PRODUCTION) {
    console.log(`[PriceCrawl] No cache, trying Fly.io for ${pcode}`);
    return fetchPriceFromFlyio(pcode);
  }

  console.log(`[PriceCrawl] No cache, trying local Puppeteer for ${pcode}`);
  return crawlPriceLocal(pcode);
}

async function fetchPricesBatch(pcodes: string[]): Promise<Record<string, PriceResult>> {
  // 모든 환경에서 캐시 먼저 확인 (빠름)
  const cacheResults = await fetchPricesFromCache(pcodes);
  const cachedPcodes = Object.keys(cacheResults);
  const missingPcodes = pcodes.filter(pcode => !cacheResults[pcode]);

  console.log(`[PriceCrawl] Cache: ${cachedPcodes.length}/${pcodes.length}, Missing: ${missingPcodes.length}`);

  // 모두 캐시 히트면 바로 반환
  if (missingPcodes.length === 0) {
    return cacheResults;
  }

  // 캐시에 없는 것만 환경별 크롤링
  if (IS_PRODUCTION) {
    const flyioResults = await fetchPricesFromFlyioBatch(missingPcodes);
    return { ...cacheResults, ...flyioResults };
  }

  // 개발: 로컬에서 병렬 처리 (브라우저 인스턴스 여러 개)
  console.log(`[PriceCrawl] Local parallel crawl for ${missingPcodes.length} products`);

  const results: Record<string, PriceResult> = { ...cacheResults };

  // 병렬 처리 (최대 5개 동시)
  const promises = missingPcodes.slice(0, 5).map(pcode => crawlPriceLocal(pcode));
  const priceResults = await Promise.all(promises);

  for (let i = 0; i < priceResults.length; i++) {
    results[missingPcodes[i]] = priceResults[i];
  }

  return results;
}

// =====================================================
// API Handler
// =====================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pcode = searchParams.get('pcode');

  if (!pcode) {
    return NextResponse.json(
      { success: false, error: 'pcode is required' },
      { status: 400 }
    );
  }

  console.log(`[PriceCrawl] Fetching prices for: ${pcode} (${IS_PRODUCTION ? 'Fly.io' : 'Local'})`);
  const startTime = Date.now();

  try {
    const result = await fetchPrice(pcode);
    const elapsed = Date.now() - startTime;

    console.log(`[PriceCrawl] Done in ${elapsed}ms - ${result.success ? 'Success' : 'Failed'}`);

    return NextResponse.json({
      ...result,
      elapsed,
    });
  } catch (error) {
    console.error('[PriceCrawl] API Error:', error);
    return NextResponse.json(
      {
        success: false,
        pcode,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pcodes } = body;

    if (!pcodes || !Array.isArray(pcodes) || pcodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pcodes array is required' },
        { status: 400 }
      );
    }

    console.log(`[PriceCrawl] Batch fetching for ${pcodes.length} products (${IS_PRODUCTION ? 'Fly.io' : 'Local parallel'})`);
    const startTime = Date.now();

    const results = await fetchPricesBatch(pcodes);

    const elapsed = Date.now() - startTime;
    const successCount = Object.values(results).filter(r => r.success).length;
    console.log(`[PriceCrawl] Batch done in ${elapsed}ms - ${successCount}/${pcodes.length} success`);

    return NextResponse.json({
      success: true,
      results,
      elapsed,
    });
  } catch (error) {
    console.error('[PriceCrawl] API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
