const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REVIEWS_DIR = path.join(__dirname, '../data/reviews');
const OUTPUT_FILE = path.join(__dirname, '../data/review_counts.json');

async function countReviewsByProduct() {
  console.log('📊 리뷰 개수 계산 중...\n');

  const reviewCounts = {};
  const files = fs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const category = file.replace('.jsonl', '');
    console.log(`\n📁 ${category} 처리 중...`);

    const filePath = path.join(REVIEWS_DIR, file);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const review = JSON.parse(line);
          const productId = review.custom_metadata?.productId;

          if (productId) {
            if (!reviewCounts[productId]) {
              reviewCounts[productId] = {
                count: 0,
                category: review.custom_metadata.category
              };
            }
            reviewCounts[productId].count++;
            lineCount++;
          }
        } catch (e) {
          console.error(`   ⚠️ 파싱 실패: ${line.substring(0, 50)}...`);
        }
      }
    }

    console.log(`   ✅ ${lineCount}개 리뷰 처리 완료`);
  }

  // 통계 출력
  const totalProducts = Object.keys(reviewCounts).length;
  const totalReviews = Object.values(reviewCounts).reduce((sum, item) => sum + item.count, 0);
  const avgReviews = (totalReviews / totalProducts).toFixed(1);

  console.log(`\n📈 통계:`);
  console.log(`   총 제품 수: ${totalProducts}개`);
  console.log(`   총 리뷰 수: ${totalReviews}개`);
  console.log(`   평균 리뷰/제품: ${avgReviews}개`);

  // 리뷰가 많은 순으로 정렬
  const sortedProducts = Object.entries(reviewCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  console.log(`\n🔝 리뷰가 많은 상위 10개 제품:`);
  sortedProducts.forEach(([productId, data], idx) => {
    console.log(`   ${idx + 1}. Product ${productId}: ${data.count}개 (${data.category})`);
  });

  // JSON 파일로 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reviewCounts, null, 2), 'utf-8');
  console.log(`\n💾 저장 완료: ${OUTPUT_FILE}`);
}

countReviewsByProduct().catch(console.error);
