const fs = require('fs');
const path = require('path');

// 카테고리 목록
const CATEGORIES = [
  'thermometer',
  'baby_bottle',
  'milk_powder_port',
  'baby_play_mat',
  'nasal_aspirator',
  'car_seat',
  'baby_bottle_sterilizer',
  'baby_monitor',
  'baby_formula_dispenser'
];

/**
 * 새로 추가된 제품 ID 찾기 (백업 파일과 비교)
 */
function findNewProducts(category) {
  const backupPath = path.join(__dirname, '..', 'data', 'specs', `${category}_backup_20251202.json`);
  const currentPath = path.join(__dirname, '..', 'data', 'specs', `${category}.json`);

  if (!fs.existsSync(backupPath)) {
    console.log(`  ⚠️  백업 파일 없음: ${category}`);
    return [];
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

  const backupIds = new Set(backup.map(p => p.productId.toString()));
  const newProducts = current.filter(p => !backupIds.has(p.productId.toString()));

  return newProducts.map(p => p.productId.toString());
}

/**
 * 리뷰 통계 계산
 */
function calculateReviewStats(category, productId) {
  const reviewPath = path.join(__dirname, '..', 'data', 'reviews', `${category}.jsonl`);

  if (!fs.existsSync(reviewPath)) {
    return { reviewCount: 0, averageRating: null };
  }

  const lines = fs.readFileSync(reviewPath, 'utf8').trim().split('\n');
  const productReviews = [];

  for (const line of lines) {
    const review = JSON.parse(line);
    if (review.custom_metadata.productId.toString() === productId.toString()) {
      productReviews.push(review);
    }
  }

  if (productReviews.length === 0) {
    return { reviewCount: 0, averageRating: null };
  }

  const ratings = productReviews.map(r => r.custom_metadata.rating);
  const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
  const averageRating = Math.round((totalRating / ratings.length) * 10) / 10; // 소수점 1자리

  return {
    reviewCount: productReviews.length,
    averageRating: averageRating
  };
}

/**
 * 제품 스펙 파일에 리뷰 통계 추가
 */
function updateProductSpecs(category, productId, stats) {
  const specPath = path.join(__dirname, '..', 'data', 'specs', `${category}.json`);
  const products = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  const productIndex = products.findIndex(p => p.productId.toString() === productId.toString());

  if (productIndex === -1) {
    console.warn(`  ⚠️  제품 못 찾음: ${productId}`);
    return false;
  }

  products[productIndex].reviewCount = stats.reviewCount;
  products[productIndex].averageRating = stats.averageRating;

  fs.writeFileSync(specPath, JSON.stringify(products, null, 2), 'utf8');
  return true;
}

/**
 * 메인 함수
 */
async function main() {
  console.log('🚀 새 제품에 리뷰 통계 추가\n');
  console.log('='.repeat(70));

  let totalUpdated = 0;
  let totalWithReviews = 0;
  let totalWithoutReviews = 0;

  for (const category of CATEGORIES) {
    console.log(`\n📦 [${category}]`);

    // 새 제품 ID 찾기
    const newProductIds = findNewProducts(category);

    if (newProductIds.length === 0) {
      console.log('  새 제품 없음, 스킵');
      continue;
    }

    console.log(`  새 제품: ${newProductIds.length}개`);

    let withReviews = 0;
    let withoutReviews = 0;

    for (const productId of newProductIds) {
      const stats = calculateReviewStats(category, productId);
      const updated = updateProductSpecs(category, productId, stats);

      if (updated) {
        totalUpdated++;
        if (stats.reviewCount > 0) {
          withReviews++;
          totalWithReviews++;
          console.log(`  ✓ ${productId}: ${stats.reviewCount}개 리뷰, 평균 ${stats.averageRating}점`);
        } else {
          withoutReviews++;
          totalWithoutReviews++;
          console.log(`  ✓ ${productId}: 리뷰 없음`);
        }
      }
    }

    console.log(`  → 리뷰 있음: ${withReviews}개, 리뷰 없음: ${withoutReviews}개`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n📊 최종 통계:\n');
  console.log(`  총 업데이트: ${totalUpdated}개 제품`);
  console.log(`  리뷰 있는 제품: ${totalWithReviews}개`);
  console.log(`  리뷰 없는 제품: ${totalWithoutReviews}개`);
  console.log('\n✅ 완료!');
}

main().catch(error => {
  console.error('\n❌ 에러:', error);
  process.exit(1);
});
