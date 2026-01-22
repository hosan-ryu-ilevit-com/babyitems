/**
 * "다른 구성" 크롤링 테스트 스크립트
 *
 * 용도: 다나와 상품 페이지에서 "다른 구성" 섹션의 HTML 구조 파악 및 크롤링 테스트
 */

import puppeteer from 'puppeteer';
import { load } from 'cheerio';

async function testVariantCrawl(pcode: string) {
  console.log(`\n🧪 [Test] Testing variant crawl for pcode: ${pcode}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
    console.log(`📡 Loading: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`✅ Page loaded`);

    // 스크롤하여 동적 콘텐츠 로드
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    console.log(`\n📋 Searching for "다른 구성" section...`);

    // 여러 셀렉터 패턴 시도
    const selectors = [
      // 다른 구성 관련 가능한 셀렉터들
      '.product_variant',
      '.prod_option',
      '.option_list',
      '.variant_list',
      '.pack_option',
      '.spec_opt',
      '[class*="variant"]',
      '[class*="option"]',
      '[class*="pack"]',
      '[class*="구성"]',
    ];

    console.log(`\n🔍 Testing selectors...`);
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`\n✅ Found with selector: "${selector}" (${elements.length} elements)`);

        // 첫 번째 요소의 HTML 출력
        const firstHtml = $(elements[0]).html();
        console.log(`   HTML preview (first 500 chars):`);
        console.log(`   ${firstHtml?.substring(0, 500)}`);
      }
    }

    // "다른 구성" 텍스트로 검색
    console.log(`\n🔍 Searching for text containing "다른 구성"...`);
    const allText = $('*').filter((_, el) => {
      const text = $(el).text();
      return text.includes('다른 구성') || text.includes('다른구성');
    });

    if (allText.length > 0) {
      console.log(`✅ Found ${allText.length} elements with "다른 구성" text`);
      allText.slice(0, 3).each((i, el) => {
        const tagName = $(el).prop('tagName');
        const className = $(el).attr('class') || 'no-class';
        const id = $(el).attr('id') || 'no-id';
        console.log(`   [${i}] <${tagName}> class="${className}" id="${id}"`);

        // 부모 요소 확인
        const parent = $(el).parent();
        const parentTag = parent.prop('tagName');
        const parentClass = parent.attr('class') || 'no-class';
        console.log(`       Parent: <${parentTag}> class="${parentClass}"`);
      });
    }

    // 가격과 매수 정보가 함께 있는 패턴 찾기
    console.log(`\n🔍 Searching for price + quantity patterns...`);
    const priceElements = $('[class*="price"], [class*="prc"]');
    console.log(`   Found ${priceElements.length} price-related elements`);

    // "매", "팩", "개" 같은 수량 단위 찾기
    const quantityPattern = /(\d+)(매|팩|개|입)/;
    const potentialVariants: Array<{selector: string; text: string}> = [];

    $('*').each((_, el) => {
      const text = $(el).text().trim();
      if (quantityPattern.test(text) && text.length < 50) {
        const className = $(el).attr('class') || '';
        const tagName = $(el).prop('tagName');
        potentialVariants.push({
          selector: `${tagName}.${className}`,
          text: text.substring(0, 100)
        });
      }
    });

    if (potentialVariants.length > 0) {
      console.log(`\n✅ Found ${potentialVariants.length} elements with quantity patterns:`);
      potentialVariants.slice(0, 10).forEach((v, i) => {
        console.log(`   [${i}] ${v.selector}: "${v.text}"`);
      });
    }

    // ===== 핵심: list__variant-selector 분석 =====
    console.log(`\n🎯 Analyzing .list__variant-selector structure...`);
    const variantList = $('.list__variant-selector');

    if (variantList.length > 0) {
      console.log(`✅ Found .list__variant-selector!`);

      // 전체 HTML 출력 (처음 2000자)
      const fullHtml = variantList.html() || '';
      console.log(`\n📄 Full HTML (first 2000 chars):\n`);
      console.log(fullHtml.substring(0, 2000));
      console.log(`\n... (total ${fullHtml.length} chars)`);

      // 각 variant item 분석
      const items = variantList.find('li.list-item');
      console.log(`\n📦 Found ${items.length} variant items:\n`);

      items.each((i, item) => {
        const $item = $(item);

        // 수량/팩 정보
        const quantity = $item.find('.text__spec').text().trim();

        // 가격 정보
        const priceText = $item.find('.sell-price .text__num').text().trim();
        const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

        // 단가 정보 (정확한 클래스명)
        const unitPrice = $item.find('.text__unit-price').text().trim();

        // 쇼핑몰 수 (정확한 클래스명)
        const mallCountText = $item.find('.text__count-mall').text().trim();
        const mallCountMatch = mallCountText.match(/(\d+)/);
        const mallCount = mallCountMatch ? parseInt(mallCountMatch[1], 10) : null;

        // 순위 (정확한 클래스명)
        const rank = $item.find('.label__rank').text().trim();

        // 활성 상태 (현재 보고 있는 상품)
        const isActive = $item.hasClass('is-active');

        // 링크 (pcode)
        const link = $item.find('a').attr('href') || '';
        const pcodeMatch = link.match(/pcode=(\d+)/);
        const variantPcode = pcodeMatch ? pcodeMatch[1] : null;

        console.log(`[${i + 1}] ${quantity}${isActive ? ' ⭐ (현재 상품)' : ''}${rank ? ` [${rank}]` : ''}`);
        console.log(`    💰 가격: ${price ? `${price.toLocaleString()}원` : 'N/A'}`);
        console.log(`    📊 단가: ${unitPrice || 'N/A'}`);
        console.log(`    🏪 쇼핑몰: ${mallCount !== null ? `${mallCount}몰` : 'N/A'}`);
        console.log(`    🔗 PCode: ${variantPcode || 'N/A'}`);
        console.log(``);
      });
    } else {
      console.log(`❌ .list__variant-selector not found`);
    }

    // JavaScript 변수 검색 (페이지 소스에서)
    console.log(`\n🔍 Searching for JavaScript variables with variant data...`);
    const scripts = $('script').filter((_, el) => {
      const content = $(el).html() || '';
      return content.includes('variant') ||
             content.includes('option') ||
             content.includes('구성') ||
             content.includes('pcode');
    });
    console.log(`   Found ${scripts.length} scripts with potential variant data`);

  } catch (error) {
    console.error(`❌ Error:`, error);
  } finally {
    await browser.close();
  }
}

// 테스트 실행
const testPcode = process.argv[2] || '30154592'; // 하기스 기저귀
testVariantCrawl(testPcode).then(() => {
  console.log(`\n✅ Test completed`);
  process.exit(0);
}).catch((err) => {
  console.error(`❌ Test failed:`, err);
  process.exit(1);
});
