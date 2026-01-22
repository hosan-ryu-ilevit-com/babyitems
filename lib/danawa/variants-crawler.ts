/**
 * 다나와 Variants 전용 크롤러
 *
 * 목적: 기존 제품들의 variants 정보만 빠르게 크롤링
 */

import puppeteer, { Browser } from 'puppeteer';
import { load } from 'cheerio';
import type { ProductVariant } from '@/types/danawa';

/**
 * Variants만 크롤링 (경량 버전)
 */
export async function crawlVariantsOnly(pcode: string): Promise<ProductVariant[] | null> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // 리소스 차단 (속도 최적화)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 페이지 이동 (타임아웃 15초)
    const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 최소한의 스크롤 (variants 영역 로드)
    await page.evaluate(() => window.scrollTo(0, 500));
    await new Promise(resolve => setTimeout(resolve, 400));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    // Variants 추출
    const variants: ProductVariant[] = [];
    const variantList = $('.list__variant-selector');

    if (variantList.length === 0) {
      return []; // variants 없음 (정상)
    }

    const items = variantList.find('li.list-item');
    items.each((_, item) => {
      const $item = $(item);

      const quantity = $item.find('.text__spec').text().trim();
      if (!quantity) return;

      const priceText = $item.find('.sell-price .text__num').text().trim();
      const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

      const unitPrice = $item.find('.text__unit-price').text().trim() || null;

      const mallCountText = $item.find('.text__count-mall').text().trim();
      const mallCountMatch = mallCountText.match(/(\d+)/);
      const mallCount = mallCountMatch ? parseInt(mallCountMatch[1], 10) : null;

      const rank = $item.find('.label__rank').text().trim() || null;
      const isActive = $item.hasClass('is-active');

      const link = $item.find('a').attr('href') || '';
      const pcodeMatch = link.match(/pcode=(\d+)/);
      const variantPcode = pcodeMatch ? pcodeMatch[1] : '';

      if (!variantPcode) return;

      const productUrl = link.startsWith('http') ? link : `https://prod.danawa.com${link}`;

      variants.push({
        pcode: variantPcode,
        quantity,
        price,
        unitPrice,
        mallCount,
        rank,
        isActive,
        productUrl,
      });
    });

    await page.close();
    return variants;
  } catch (error) {
    console.error(`[${pcode}] Variants crawl error:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * 여러 상품의 variants 병렬 배치 크롤링
 */
export async function crawlVariantsBatch(
  pcodes: string[],
  concurrency: number = 4,
  delayMs: number = 500,
  onProgress?: (current: number, total: number, pcode: string, variants: ProductVariant[] | null) => void
): Promise<Map<string, ProductVariant[]>> {
  const results = new Map<string, ProductVariant[]>();
  const total = pcodes.length;
  let completed = 0;

  console.log(`🚀 [VariantsCrawler] Starting batch: ${total} products, concurrency: ${concurrency}`);

  // 작업 큐
  const queue = [...pcodes];

  // 워커 함수
  async function worker(workerId: number): Promise<void> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
      });

      while (queue.length > 0) {
        const pcode = queue.shift();
        if (!pcode) break;

        try {
          const page = await browser.newPage();

          // 리소스 차단
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
              req.abort();
            } else {
              req.continue();
            }
          });

          await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          );

          const url = `https://prod.danawa.com/info/?pcode=${pcode}`;

          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.evaluate(() => window.scrollTo(0, 500));
            await new Promise(resolve => setTimeout(resolve, 400));

            const html = await page.content();
            const $ = load(html);

            const variants: ProductVariant[] = [];
            const variantList = $('.list__variant-selector');

            if (variantList.length > 0) {
              const items = variantList.find('li.list-item');
              items.each((_, item) => {
                const $item = $(item);

                const quantity = $item.find('.text__spec').text().trim();
                if (!quantity) return;

                const priceText = $item.find('.sell-price .text__num').text().trim();
                const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

                const unitPrice = $item.find('.text__unit-price').text().trim() || null;

                const mallCountText = $item.find('.text__count-mall').text().trim();
                const mallCountMatch = mallCountText.match(/(\d+)/);
                const mallCount = mallCountMatch ? parseInt(mallCountMatch[1], 10) : null;

                const rank = $item.find('.label__rank').text().trim() || null;
                const isActive = $item.hasClass('is-active');

                const link = $item.find('a').attr('href') || '';
                const pcodeMatch = link.match(/pcode=(\d+)/);
                const variantPcode = pcodeMatch ? pcodeMatch[1] : '';

                if (!variantPcode) return;

                const productUrl = link.startsWith('http') ? link : `https://prod.danawa.com${link}`;

                variants.push({
                  pcode: variantPcode,
                  quantity,
                  price,
                  unitPrice,
                  mallCount,
                  rank,
                  isActive,
                  productUrl,
                });
              });
            }

            results.set(pcode, variants);
            completed++;

            console.log(`   [W${workerId}] ✅ ${pcode}: ${variants.length} variants`);
            onProgress?.(completed, total, pcode, variants);

          } catch (navError) {
            console.error(`   [W${workerId}] ❌ ${pcode}: ${navError instanceof Error ? navError.message : 'Navigation error'}`);
            results.set(pcode, []);
            completed++;
            onProgress?.(completed, total, pcode, null);
          }

          await page.close();

          // 딜레이
          if (queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }

        } catch (pageError) {
          console.error(`   [W${workerId}] Page error for ${pcode}:`, pageError);
          results.set(pcode, []);
          completed++;
          onProgress?.(completed, total, pcode, null);
        }
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // 워커 병렬 실행
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const successCount = Array.from(results.values()).filter(v => v.length > 0).length;
  console.log(`✅ [VariantsCrawler] Batch completed: ${successCount}/${total} have variants`);

  return results;
}
