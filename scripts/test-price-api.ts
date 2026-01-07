/**
 * 다나와 가격 API 테스트
 * - 리뷰처럼 AJAX API가 있는지 확인
 */
import axios from 'axios';
import { load } from 'cheerio';

async function findPriceApi(pcode: string) {
  console.log('\n=== Testing Price APIs for:', pcode, '===');

  const productUrl = `https://prod.danawa.com/info/?pcode=${pcode}`;

  // 1. 상품 페이지에서 가격 관련 API URL 찾기
  try {
    const res = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const html = res.data as string;

    // 가격 관련 AJAX URL 패턴 찾기
    const ajaxPatterns = [
      /lowPriceList.*?url.*?['"](.*?)['"]/gi,
      /priceCompare.*?['"](.*?ajax.*?)['"]/gi,
      /getPriceList.*?['"](.*?)['"]/gi,
      /mallList.*?['"](.*?php.*?)['"]/gi,
    ];

    console.log('\n[가격 관련 AJAX URL 패턴 검색]');
    for (const pattern of ajaxPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        console.log('  Found:', match[1]?.slice(0, 100));
      }
    }

    // 2. 알려진 다나와 가격 API 직접 테스트
    const priceApis = [
      `https://prod.danawa.com/info/dpg/ajax/mallPrice.ajax.php?pcode=${pcode}`,
      `https://prod.danawa.com/info/dpg/ajax/priceCompare.ajax.php?pcode=${pcode}`,
      `https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?pcode=${pcode}`,
    ];

    console.log('\n[알려진 가격 API 테스트]');
    for (const apiUrl of priceApis) {
      try {
        const apiRes = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': productUrl,
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 5000,
        });

        const data = apiRes.data;
        const preview = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
        console.log(`  ✅ ${apiUrl.split('/').pop()}:`);
        console.log(`     ${preview}...`);
      } catch (e: any) {
        console.log(`  ❌ ${apiUrl.split('/').pop()}: ${e.response?.status || e.message}`);
      }
    }

    // 3. HTML에서 인라인 가격 데이터 찾기
    console.log('\n[인라인 가격 데이터 검색]');
    const priceDataPatterns = [
      /lowPrice['"]\s*:\s*(\d+)/i,
      /minPrice['"]\s*:\s*(\d+)/i,
      /lowestPrice['"]\s*:\s*(\d+)/i,
    ];

    for (const pattern of priceDataPatterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`  Found: ${pattern.source} = ${match[1]}`);
      }
    }

  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

// 테스트
findPriceApi('19451186');
