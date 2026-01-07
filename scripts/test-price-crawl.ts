/**
 * 가격 크롤링 테스트 스크립트
 */
import axios from 'axios';
import { load } from 'cheerio';

async function testPriceExtraction(pcode: string) {
  const url = `https://prod.danawa.com/info/?pcode=${pcode}`;
  console.log('\n=== Testing:', pcode, '===');

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      timeout: 10000,
    });

    const $ = load(res.data);

    // 1. 최저가 영역 (정적 HTML)
    const lowestPriceElem = $('.lowest_price em.prc, .lwst_prc em, .bnft_price em.prc').first();
    const lowestPrice = lowestPriceElem.text().replace(/[^\d]/g, '');

    // 2. 쇼핑몰 목록 (동적으로 로드되는 경우가 많음)
    const mallListRows = $('.mall_list tbody tr').length;
    const productListRows = $('.ProductList tr').length;

    // 3. 가격 관련 영역 존재 여부
    const hasLowestArea = $('.lowest_price, .lwst_prc, .bnft_price').length > 0;
    const hasMallList = $('.mall_list').length > 0;
    const hasPriceCompare = $('.price_compare, #priceCompareWrap').length > 0;

    // 4. 동적 로딩 스크립트 확인
    const htmlStr = res.data as string;
    const hasDynamicPrice = htmlStr.includes('lowPriceList') || htmlStr.includes('priceCompare');

    // 5. 상품 기본 정보
    const productName = $('.prod_tit h3, .top_summary h2').first().text().trim().slice(0, 50);

    console.log({
      productName: productName || '(이름 없음)',
      lowestPrice: lowestPrice ? `${parseInt(lowestPrice).toLocaleString()}원` : '❌ 없음',
      mallListRows,
      productListRows,
      hasLowestArea,
      hasMallList,
      hasPriceCompare,
      hasDynamicPrice,
    });

    // 결론
    if (!lowestPrice && hasDynamicPrice) {
      console.log('⚠️ 가격이 JavaScript로 동적 로딩됨 - Puppeteer 필요');
    } else if (lowestPrice) {
      console.log('✅ 정적 HTML에서 가격 추출 가능');
    } else {
      console.log('❌ 가격 정보를 찾을 수 없음');
    }

  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

// 테스트 상품들
const testPcodes = [
  '19451186',  // 예시 1
  '18891422',  // 예시 2
  '21785947',  // 예시 3
];

async function main() {
  for (const pcode of testPcodes) {
    await testPriceExtraction(pcode);
  }
}

main();
