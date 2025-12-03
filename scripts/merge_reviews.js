const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

// 느슨한 중복 체크를 위한 정규화
function normalizeContent(content) {
  return content
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → \n
    .replace(/<[^>]+>/g, '')          // 모든 HTML 태그 제거
    .replace(/&nbsp;/g, ' ')          // &nbsp; → 공백
    .replace(/\s+/g, ' ')             // 여러 공백 → 1개
    .trim()
    .toLowerCase();                   // 소문자 변환
}

// 리뷰 해시 생성
function generateReviewHash(productId, rating, content) {
  const normalized = normalizeContent(content);
  return crypto.createHash('sha256')
    .update(`${productId}|${rating}|${normalized}`)
    .digest('hex');
}

// CSV 리뷰 → JSONL 형식 변환
function transformReview(csvReview) {
  const title = csvReview.review_title || '';
  const content = csvReview.review_content || '';

  return {
    text: `제목: ${title}\n내용: ${content}`,
    custom_metadata: {
      productId: csvReview.productId.toString(),
      category: csvReview.category,
      rating: parseInt(csvReview.rating)
    }
  };
}

// 메인 함수
function mergeReviews(dryRun = true) {
  console.log('🔄 리뷰 병합 스크립트 시작...\n');
  console.log('모드:', dryRun ? '드라이런 (실제 파일 수정 안 함)' : '실제 병합');
  console.log('='.repeat(70));

  // 1. 모든 카테고리의 productId 로드
  console.log('\n📥 제품 정보 로드 중...');

  const allProductIds = new Set();
  const productIdsByCategory = new Map();

  for (const category of CATEGORIES) {
    const specsPath = `/Users/levit/Desktop/babyitem_MVP/data/specs/${category}.json`;

    if (!fs.existsSync(specsPath)) {
      console.log(`  ⚠️  ${category}.json 없음, 스킵`);
      continue;
    }

    const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
    const categoryIds = specs.map(p => p.productId.toString());

    productIdsByCategory.set(category, new Set(categoryIds));
    categoryIds.forEach(id => allProductIds.add(id));

    console.log(`  ✅ ${category}: ${categoryIds.length}개 제품`);
  }

  console.log(`\n  총 제품: ${allProductIds.size}개`);

  // 2. 기존 리뷰 로드 및 해시 생성
  console.log('\n📚 기존 리뷰 로드 중...');

  const categoryData = new Map();

  for (const category of CATEGORIES) {
    const reviewPath = `/Users/levit/Desktop/babyitem_MVP/data/reviews/${category}.jsonl`;

    if (!fs.existsSync(reviewPath)) {
      console.log(`  ⚠️  ${category}.jsonl 없음, 생성 예정`);
      categoryData.set(category, {
        existing: [],
        hashes: new Set(),
        newReviews: []
      });
      continue;
    }

    const lines = fs.readFileSync(reviewPath, 'utf8').trim().split('\n').filter(l => l);
    const reviews = lines.map(l => JSON.parse(l));

    const hashes = new Set();
    for (const review of reviews) {
      const hash = generateReviewHash(
        review.custom_metadata.productId,
        review.custom_metadata.rating,
        review.text
      );
      hashes.add(hash);
    }

    categoryData.set(category, {
      existing: reviews,
      hashes: hashes,
      newReviews: []
    });

    console.log(`  ✅ ${category}: ${reviews.length}개 리뷰`);
  }

  // 3. 새 리뷰 JSONL 읽기
  console.log('\n📥 새 리뷰 파일 로드 중...');

  const newReviewPath = '/Users/levit/Desktop/babyitem_MVP/1202 real final.jsonl';
  const newLines = fs.readFileSync(newReviewPath, 'utf8').trim().split('\n');

  console.log(`  파일: ${path.basename(newReviewPath)}`);
  console.log(`  총 라인: ${newLines.length}개`);

  // 4. 리뷰 처리
  console.log('\n🔄 리뷰 처리 중...\n');

  const stats = {
    total: newLines.length,
    emptyContent: 0,
    noProductId: 0,
    productNotFound: 0,
    duplicates: 0,
    added: 0,
    byCategory: {}
  };

  for (const category of CATEGORIES) {
    stats.byCategory[category] = {
      existing: categoryData.get(category)?.existing.length || 0,
      added: 0,
      duplicates: 0
    };
  }

  let processedCount = 0;

  for (const line of newLines) {
    processedCount++;

    if (processedCount % 1000 === 0) {
      process.stdout.write(`\r  진행: ${processedCount}/${newLines.length} (${Math.round(processedCount/newLines.length*100)}%)`);
    }

    const csvReview = JSON.parse(line);

    // 빈 리뷰 스킵
    if (!csvReview.review_content || csvReview.review_content.trim() === '') {
      stats.emptyContent++;
      continue;
    }

    // productId 없으면 스킵
    if (!csvReview.productId) {
      stats.noProductId++;
      continue;
    }

    const productId = csvReview.productId.toString();

    // productId가 specs에 없으면 스킵
    if (!allProductIds.has(productId)) {
      stats.productNotFound++;
      continue;
    }

    // 리뷰 변환
    const review = transformReview(csvReview);
    const category = csvReview.category;

    if (!categoryData.has(category)) {
      console.log(`\n  ⚠️  알 수 없는 카테고리: ${category}`);
      continue;
    }

    // 중복 체크
    const hash = generateReviewHash(
      review.custom_metadata.productId,
      review.custom_metadata.rating,
      review.text
    );

    const catData = categoryData.get(category);

    if (catData.hashes.has(hash)) {
      stats.duplicates++;
      stats.byCategory[category].duplicates++;
      continue;
    }

    // 추가
    catData.newReviews.push(review);
    catData.hashes.add(hash);
    stats.added++;
    stats.byCategory[category].added++;
  }

  console.log('\n\n✅ 처리 완료!\n');

  // 5. 통계 출력
  console.log('='.repeat(70));
  console.log('\n📊 카테고리별 상세:\n');

  for (const category of CATEGORIES) {
    const stat = stats.byCategory[category];
    if (stat.added > 0 || stat.existing > 0) {
      console.log(`[${category}]`);
      console.log(`  기존 리뷰: ${stat.existing}개`);
      console.log(`  추가된 리뷰: ${stat.added}개`);
      console.log(`  중복 제거: ${stat.duplicates}개`);
      console.log(`  최종 리뷰: ${stat.existing + stat.added}개`);
      console.log('');
    }
  }

  // 6. 저장 (드라이런이 아닐 때만)
  if (!dryRun) {
    console.log('='.repeat(70));
    console.log('\n💾 파일 저장 중...\n');

    const timestamp = '20251202';

    for (const [category, data] of categoryData) {
      if (data.newReviews.length === 0) continue;

      const reviewPath = `/Users/levit/Desktop/babyitem_MVP/data/reviews/${category}.jsonl`;

      // 백업
      if (fs.existsSync(reviewPath)) {
        const backupPath = reviewPath.replace('.jsonl', `_backup_${timestamp}.jsonl`);
        fs.copyFileSync(reviewPath, backupPath);
        console.log(`  백업: ${path.basename(backupPath)}`);
      }

      // 병합 및 저장
      const merged = [...data.existing, ...data.newReviews];
      const output = merged.map(r => JSON.stringify(r)).join('\n');
      fs.writeFileSync(reviewPath, output);
      console.log(`  저장: ${path.basename(reviewPath)} (${merged.length}개 리뷰)`);
    }

    console.log('\n✅ 병합 완료!');
  } else {
    console.log('='.repeat(70));
    console.log('\n⚠️  드라이런 모드: 파일이 수정되지 않았습니다.');
    console.log('실제 병합을 원하시면 --execute 플래그를 사용하세요.\n');
  }

  // 7. 최종 통계
  console.log('='.repeat(70));
  console.log('\n📈 최종 통계:\n');

  console.log(`  총 리뷰 라인: ${stats.total}개`);
  console.log(`  추가된 리뷰: ${stats.added}개`);
  console.log(`  중복 제거: ${stats.duplicates}개`);
  console.log('\n  스킵된 리뷰:');
  console.log(`    빈 리뷰: ${stats.emptyContent}개`);
  console.log(`    productId 없음: ${stats.noProductId}개`);
  console.log(`    제품 없음 (specs에 없는 productId): ${stats.productNotFound}개`);

  console.log('\n' + '='.repeat(70));
}

// 실행
const dryRun = process.argv[2] !== '--execute';
mergeReviews(dryRun);
