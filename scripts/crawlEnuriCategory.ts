/**
 * 에누리 카테고리 크롤링 + Supabase 저장 통합 스크립트
 *
 * Usage:
 *   npx tsx scripts/crawlEnuriCategory.ts <categoryCode> [options]
 *
 * Options:
 *   --max-products=N    최대 제품 수 (기본: 50)
 *   --review-top-n=N    리뷰 크롤링 대상 상위 N개 (기본: 10)
 *   --no-reviews        리뷰 크롤링 안함
 *   --no-prices         가격 크롤링 안함
 *   --no-save           DB 저장 안함 (JSON만 출력)
 *   --output=PATH       JSON 저장 경로 (기본: /tmp/enuri_{category}.json)
 *
 * Examples:
 *   npx tsx scripts/crawlEnuriCategory.ts 100402
 *   npx tsx scripts/crawlEnuriCategory.ts 100402 --max-products=100 --review-top-n=20
 *   npx tsx scripts/crawlEnuriCategory.ts 100402 --no-save --output=/tmp/carseat.json
 */

import { crawlEnuriCategory } from '../lib/enuri/unified-crawler';
import { saveEnuriCrawlResult } from './saveEnuriData';
import * as fs from 'fs';

// =====================================================
// 인자 파싱
// =====================================================

function parseArgs(args: string[]) {
  const options = {
    categoryCode: '',
    maxProducts: 50,
    reviewTopN: 10,
    includeReviews: true,
    includePrices: true,
    saveToDb: true,
    outputPath: '',
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');

      switch (key) {
        case 'max-products':
          options.maxProducts = parseInt(value) || 50;
          break;
        case 'review-top-n':
          options.reviewTopN = parseInt(value) || 10;
          break;
        case 'no-reviews':
          options.includeReviews = false;
          break;
        case 'no-prices':
          options.includePrices = false;
          break;
        case 'no-save':
          options.saveToDb = false;
          break;
        case 'output':
          options.outputPath = value;
          break;
      }
    } else if (!options.categoryCode) {
      options.categoryCode = arg;
    }
  }

  return options;
}

// =====================================================
// 메인
// =====================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
에누리 카테고리 크롤러

Usage:
  npx tsx scripts/crawlEnuriCategory.ts <categoryCode> [options]

Options:
  --max-products=N    최대 제품 수 (기본: 50)
  --review-top-n=N    리뷰 크롤링 대상 상위 N개 (기본: 10)
  --no-reviews        리뷰 크롤링 안함
  --no-prices         가격 크롤링 안함
  --no-save           DB 저장 안함 (JSON만 출력)
  --output=PATH       JSON 저장 경로

카테고리 코드:
  100402  카시트
  100401  유모차 (예상)
  (다른 코드는 에누리 사이트에서 확인)

Examples:
  npx tsx scripts/crawlEnuriCategory.ts 100402
  npx tsx scripts/crawlEnuriCategory.ts 100402 --max-products=100
  npx tsx scripts/crawlEnuriCategory.ts 100402 --no-save
`);
    process.exit(0);
  }

  const options = parseArgs(args);

  if (!options.categoryCode) {
    console.error('카테고리 코드를 입력하세요.');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           에누리 카테고리 크롤러                         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('⚙️  설정:');
  console.log(`   카테고리: ${options.categoryCode}`);
  console.log(`   최대 제품: ${options.maxProducts}개`);
  console.log(`   리뷰 대상: 상위 ${options.reviewTopN}개`);
  console.log(`   리뷰 크롤링: ${options.includeReviews ? '예' : '아니오'}`);
  console.log(`   가격 크롤링: ${options.includePrices ? '예' : '아니오'}`);
  console.log(`   DB 저장: ${options.saveToDb ? '예' : '아니오'}\n`);

  // 크롤링 실행
  const result = await crawlEnuriCategory({
    categoryCode: options.categoryCode,
    maxProducts: options.maxProducts,
    includeReviews: options.includeReviews,
    includePrices: options.includePrices,
    reviewTopN: options.reviewTopN,
  });

  if (!result.success) {
    console.error(`\n❌ 크롤링 실패: ${result.error}`);
    process.exit(1);
  }

  // JSON 저장
  const outputPath = options.outputPath || `/tmp/enuri_${options.categoryCode}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n💾 JSON 저장: ${outputPath}`);

  // DB 저장
  if (options.saveToDb) {
    console.log('\n📤 Supabase 저장 중...');
    const saveResult = await saveEnuriCrawlResult(result);

    if (saveResult.success) {
      console.log('\n✅ DB 저장 완료!');
      console.log(`   제품: ${saveResult.savedProducts}개`);
      console.log(`   리뷰: ${saveResult.savedReviews}개`);
      console.log(`   가격: ${saveResult.savedPrices}개`);
    } else {
      console.error(`\n❌ DB 저장 실패: ${saveResult.error}`);
    }
  }

  console.log('\n🎉 완료!');
}

main().catch(console.error);
