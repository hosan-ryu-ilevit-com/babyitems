/**
 * 다나와 리뷰 크롤링 테스트 스크립트
 *
 * 실행 방법:
 *   npx tsx scripts/testDanawaReviews.ts                    # 기본 테스트 (pcode: 10371804)
 *   npx tsx scripts/testDanawaReviews.ts --pcode 12345678   # 특정 상품 테스트
 *   npx tsx scripts/testDanawaReviews.ts --pages 5          # 최대 5페이지 크롤링
 *   npx tsx scripts/testDanawaReviews.ts --save             # 결과를 JSON 파일로 저장
 */

import { fetchDanawaReviews, DanawaReviewResult } from '../lib/danawa/review-crawler';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================
// CLI 인자 파싱
// =====================================================

interface Options {
  pcode: string;
  maxPages: number;
  save: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    pcode: '10371804',  // 기본값: 보르르 B17-505
    maxPages: 3,
    save: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pcode' && args[i + 1]) {
      options.pcode = args[i + 1];
      i++;
    } else if (args[i] === '--pages' && args[i + 1]) {
      options.maxPages = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--save') {
      options.save = true;
    }
  }

  return options;
}

// =====================================================
// 결과 출력
// =====================================================

function printResult(result: DanawaReviewResult): void {
  console.log('\n========================================');
  console.log('📊 크롤링 결과');
  console.log('========================================\n');

  console.log(`📦 상품 코드: ${result.pcode}`);
  console.log(`🔗 URL: https://prod.danawa.com/info/?pcode=${result.pcode}`);
  console.log(`✅ 성공 여부: ${result.success ? '성공' : '실패'}`);

  if (result.error) {
    console.log(`❌ 에러: ${result.error}`);
  }

  console.log(`\n📈 메타데이터:`);
  console.log(`   - 총 리뷰 수: ${result.reviewCount}개`);
  console.log(`   - 평균 별점: ${result.averageRating ?? 'N/A'}점`);
  console.log(`   - 크롤링한 리뷰: ${result.reviews.length}개`);

  if (result.reviews.length > 0) {
    const withImages = result.reviews.filter(r => r.images.length > 0);
    const totalImages = result.reviews.reduce((sum, r) => sum + r.images.length, 0);

    console.log(`\n📷 이미지 통계:`);
    console.log(`   - 이미지 포함 리뷰: ${withImages.length}개`);
    console.log(`   - 총 이미지 수: ${totalImages}개`);

    // 별점 분포
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result.reviews.forEach(r => {
      const rating = Math.round(r.rating);
      if (rating >= 1 && rating <= 5) {
        ratingDist[rating]++;
      }
    });

    console.log(`\n⭐ 별점 분포:`);
    for (let i = 5; i >= 1; i--) {
      const bar = '█'.repeat(Math.ceil(ratingDist[i] / 2));
      console.log(`   ${i}점: ${ratingDist[i]}개 ${bar}`);
    }

    // 샘플 리뷰 출력
    console.log(`\n📝 샘플 리뷰 (최대 3개):`);
    result.reviews.slice(0, 3).forEach((review, idx) => {
      console.log(`\n   [${idx + 1}] ⭐${review.rating}점 ${review.author ? `by ${review.author}` : ''} ${review.date || ''}`);
      console.log(`       ${review.content.substring(0, 100)}${review.content.length > 100 ? '...' : ''}`);
      if (review.images.length > 0) {
        console.log(`       📷 이미지 ${review.images.length}개`);
        review.images.forEach((img, imgIdx) => {
          console.log(`          [${imgIdx + 1}] ${img.thumbnail.substring(0, 60)}...`);
        });
      }
    });
  }

  console.log(`\n⏱️ 크롤링 시간: ${result.crawledAt.toLocaleString()}`);
  console.log('========================================\n');
}

// =====================================================
// 메인 실행
// =====================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('🚀 다나와 리뷰 크롤링 테스트');
  console.log('========================================\n');

  console.log('⚙️ 설정:');
  console.log(`   - 상품 코드: ${options.pcode}`);
  console.log(`   - 최대 페이지: ${options.maxPages}`);
  console.log(`   - 결과 저장: ${options.save ? '예' : '아니오'}`);

  console.log(`\n📡 크롤링 시작...`);
  const startTime = Date.now();

  const result = await fetchDanawaReviews(options.pcode, options.maxPages);

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n⏱️ 크롤링 완료 (${elapsed.toFixed(1)}초 소요)`);

  printResult(result);

  // 결과 저장
  if (options.save) {
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `danawa_reviews_${options.pcode}_${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`💾 결과 저장됨: ${filepath}`);
  }

  // 결과 코드
  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});
