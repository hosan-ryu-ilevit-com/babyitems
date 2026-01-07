/**
 * 로컬 Puppeteer 가격 크롤러 테스트
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { fetchDanawaPrice } from '../lib/danawa/price-crawler';

async function test() {
  const testPcodes = ['19451186', '18891422', '12345678'];

  for (const pcode of testPcodes) {
    console.log(`\n=== Testing ${pcode} ===`);
    const result = await fetchDanawaPrice(pcode);

    if (result.success) {
      console.log(`✅ ${result.lowestPrice?.toLocaleString()}원 (${result.lowestMall})`);
      console.log(`   ${result.mallCount}개 쇼핑몰`);
    } else {
      console.log(`❌ Failed: ${result.error || 'No price'}`);
    }
  }
}

test().catch(console.error);
