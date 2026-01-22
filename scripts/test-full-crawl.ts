/**
 * 전체 크롤링 테스트 (variants 포함)
 */

import { crawlDanawaProduct } from '../lib/danawa/crawler';

async function testFullCrawl(pcode: string) {
  console.log(`\n🧪 [Test] Testing full crawl with variants for pcode: ${pcode}\n`);

  const result = await crawlDanawaProduct(pcode);

  if (!result) {
    console.error(`\n❌ Crawl failed`);
    return;
  }

  console.log(`\n📊 [Result] Crawl completed!\n`);
  console.log(`Product: ${result.name}`);
  console.log(`Price: ${result.lowestPrice?.toLocaleString()}원`);
  console.log(`Specs: ${Object.keys(result.specs).length} items`);
  console.log(`Prices: ${result.prices.length} malls`);
  console.log(`Variants: ${result.variants?.length || 0} options\n`);

  if (result.variants && result.variants.length > 0) {
    console.log(`📦 Variants Details:\n`);
    result.variants.forEach((v, i) => {
      console.log(`[${i + 1}] ${v.quantity}${v.isActive ? ' ⭐ (현재)' : ''}${v.rank ? ` [${v.rank}]` : ''}`);
      console.log(`    💰 가격: ${v.price?.toLocaleString()}원`);
      console.log(`    📊 단가: ${v.unitPrice || 'N/A'}`);
      console.log(`    🏪 쇼핑몰: ${v.mallCount ? `${v.mallCount}몰` : 'N/A'}`);
      console.log(`    🔗 PCode: ${v.pcode}`);
      console.log(``);
    });
  }

  // JSON 출력 (전체 구조 확인)
  console.log(`\n📄 Full JSON:\n`);
  console.log(JSON.stringify(result, null, 2));
}

// 테스트 실행
const testPcode = process.argv[2] || '30154592'; // 하기스 기저귀
testFullCrawl(testPcode).then(() => {
  console.log(`\n✅ Test completed`);
  process.exit(0);
}).catch((err) => {
  console.error(`\n❌ Test failed:`, err);
  process.exit(1);
});
