/**
 * 에누리 리뷰 크롤러 테스트
 */

import { fetchEnuriReviews } from '../lib/enuri/review-crawler';

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           에누리 리뷰 크롤러 테스트                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const testModelNo = '46256330'; // 순성 빌리 카시트

  console.log(`📦 테스트 상품: modelNo=${testModelNo}\n`);

  const result = await fetchEnuriReviews(testModelNo, 2);

  console.log('\n========== 결과 ==========\n');
  console.log(`✅ 성공: ${result.success}`);
  console.log(`📊 총 리뷰 수: ${result.reviewCount}개`);
  console.log(`⭐ 평균 평점: ${result.averageRating}`);
  console.log(`📝 크롤링된 리뷰: ${result.reviews.length}개`);

  const withImages = result.reviews.filter(r => r.images.length > 0);
  console.log(`📷 이미지 포함 리뷰: ${withImages.length}개`);

  const totalImages = result.reviews.reduce((sum, r) => sum + r.images.length, 0);
  console.log(`🖼️ 총 이미지 수: ${totalImages}개`);

  if (result.error) {
    console.log(`❌ 에러: ${result.error}`);
  }

  // 샘플 리뷰 출력
  console.log('\n========== 샘플 리뷰 (최대 5개) ==========\n');

  result.reviews.slice(0, 5).forEach((review, i) => {
    console.log(`[${i + 1}] ⭐${review.rating} | 이미지: ${review.images.length}개`);
    console.log(`    작성자: ${review.author || '(없음)'}`);
    console.log(`    내용: ${review.content.slice(0, 100)}...`);
    if (review.images.length > 0) {
      console.log(`    📷 이미지들:`);
      review.images.slice(0, 3).forEach(img => {
        console.log(`       - ${img.thumbnail.slice(0, 80)}...`);
        if (img.mallName) console.log(`         (${img.mallName})`);
      });
    }
    console.log('');
  });

  // 이미지 도메인 통계
  const imageDomains: Record<string, number> = {};
  result.reviews.forEach(r => {
    r.images.forEach(img => {
      try {
        const url = new URL(img.thumbnail);
        const domain = url.hostname;
        imageDomains[domain] = (imageDomains[domain] || 0) + 1;
      } catch {
        // 무시
      }
    });
  });

  if (Object.keys(imageDomains).length > 0) {
    console.log('========== 이미지 도메인 통계 ==========\n');
    Object.entries(imageDomains)
      .sort((a, b) => b[1] - a[1])
      .forEach(([domain, count]) => {
        console.log(`   ${domain}: ${count}개`);
      });
  }
}

main().catch(console.error);
