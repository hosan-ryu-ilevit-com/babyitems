/**
 * 대량 크롤링 테스트 스크립트
 * 
 * 목표: 120개 상품 + 상품당 10개 리뷰 크롤링
 * 측정: 총 소요 시간, 성공률
 */

import { crawlDanawaSearchListLite } from '../lib/danawa/search-crawler-lite';
import { fetchReviewsBatchParallel, type ReviewCrawlResult } from '../lib/danawa/review-crawler-lite';

const TEST_QUERY = '가습기'; // 테스트할 카테고리
const TARGET_PRODUCTS = 120;
const REVIEWS_PER_PRODUCT = 10;

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🧪 대량 크롤링 테스트 시작`);
  console.log(`   쿼리: "${TEST_QUERY}"`);
  console.log(`   목표: ${TARGET_PRODUCTS}개 상품, 상품당 ${REVIEWS_PER_PRODUCT}개 리뷰`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const totalStartTime = Date.now();

  // ============================================================================
  // Phase 1: 상품 크롤링
  // ============================================================================
  console.log('📦 [Phase 1] 상품 크롤링 시작...');
  const productStartTime = Date.now();

  const searchResult = await crawlDanawaSearchListLite({
    query: TEST_QUERY,
    limit: TARGET_PRODUCTS,
    sort: 'saveDESC',
  });

  const productDuration = Date.now() - productStartTime;
  const products = searchResult.items;

  console.log(`✅ [Phase 1] 상품 크롤링 완료`);
  console.log(`   수집된 상품: ${products.length}개`);
  console.log(`   소요 시간: ${(productDuration / 1000).toFixed(2)}초`);
  console.log(`   상품당 평균: ${(productDuration / products.length).toFixed(0)}ms\n`);

  if (products.length === 0) {
    console.error('❌ 상품이 없어서 테스트 중단');
    return;
  }

  // 상품 샘플 출력
  console.log('   📋 상품 샘플 (처음 5개):');
  products.slice(0, 5).forEach((p, i) => {
    console.log(`      ${i + 1}. ${p.brand || ''} ${p.name.slice(0, 40)}... | ${p.price?.toLocaleString() || 'N/A'}원`);
  });
  console.log('');

  // ============================================================================
  // Phase 2: 리뷰 크롤링 (병렬)
  // ============================================================================
  console.log('📝 [Phase 2] 리뷰 크롤링 시작...');
  console.log(`   대상: ${products.length}개 상품 × ${REVIEWS_PER_PRODUCT}개 리뷰 = 최대 ${products.length * REVIEWS_PER_PRODUCT}개 리뷰`);
  
  const reviewStartTime = Date.now();
  const pcodes = products.map(p => p.pcode);

  let completedCount = 0;
  let totalReviewsCollected = 0;

  const reviewResults = await fetchReviewsBatchParallel(pcodes, {
    maxReviewsPerProduct: REVIEWS_PER_PRODUCT,
    concurrency: 12,  // 동시 처리 수 증가
    delayBetweenChunks: 150, // 딜레이 감소
    timeout: 8000,
    onProgress: (completed, total, result) => {
      completedCount = completed;
      totalReviewsCollected += result.reviews.length;
      
      // 10개마다 진행상황 출력
      if (completed % 10 === 0 || completed === total) {
        const elapsed = (Date.now() - reviewStartTime) / 1000;
        const rate = completed / elapsed;
        console.log(`   📊 진행: ${completed}/${total} (${((completed/total)*100).toFixed(0)}%) | ` +
          `리뷰 ${totalReviewsCollected}개 | ${elapsed.toFixed(1)}초 | ${rate.toFixed(1)}개/초`);
      }
    }
  });

  const reviewDuration = Date.now() - reviewStartTime;

  // 결과 집계
  const successCount = reviewResults.filter(r => r.success).length;
  const totalReviews = reviewResults.reduce((sum, r) => sum + r.reviews.length, 0);
  const avgReviewsPerProduct = totalReviews / products.length;

  console.log(`\n✅ [Phase 2] 리뷰 크롤링 완료`);
  console.log(`   성공: ${successCount}/${products.length}개 상품 (${((successCount/products.length)*100).toFixed(1)}%)`);
  console.log(`   총 리뷰: ${totalReviews}개`);
  console.log(`   상품당 평균 리뷰: ${avgReviewsPerProduct.toFixed(1)}개`);
  console.log(`   소요 시간: ${(reviewDuration / 1000).toFixed(2)}초`);
  console.log(`   처리 속도: ${(products.length / (reviewDuration / 1000)).toFixed(1)} 상품/초\n`);

  // 리뷰 샘플 출력
  const productWithReviews = reviewResults.find(r => r.reviews.length > 0);
  if (productWithReviews) {
    console.log('   📋 리뷰 샘플 (첫 번째 상품):');
    productWithReviews.reviews.slice(0, 3).forEach((r, i) => {
      console.log(`      ${i + 1}. [${r.rating}점] ${r.content.slice(0, 60)}...`);
    });
    console.log('');
  }

  // ============================================================================
  // 최종 결과
  // ============================================================================
  const totalDuration = Date.now() - totalStartTime;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 최종 결과');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   총 소요 시간: ${(totalDuration / 1000).toFixed(2)}초`);
  console.log(`   ├─ 상품 크롤링: ${(productDuration / 1000).toFixed(2)}초`);
  console.log(`   └─ 리뷰 크롤링: ${(reviewDuration / 1000).toFixed(2)}초`);
  console.log('');
  console.log(`   수집 데이터:`);
  console.log(`   ├─ 상품: ${products.length}개`);
  console.log(`   └─ 리뷰: ${totalReviews}개 (상품당 평균 ${avgReviewsPerProduct.toFixed(1)}개)`);
  console.log('');

  // 예상 토큰 계산
  const estimatedTokens = products.length * (30 + 100) + totalReviews * 100;
  console.log(`   예상 LLM 토큰: ~${(estimatedTokens / 1000).toFixed(0)}K 토큰`);
  console.log(`   Gemini 3 Flash 한계 대비: ${((estimatedTokens / 1_000_000) * 100).toFixed(2)}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 성공 여부 판단
  if (totalDuration < 30000 && totalReviews > 500) {
    console.log('🎉 테스트 성공! 이 접근법은 현실적입니다.');
  } else if (totalDuration < 60000) {
    console.log('⚠️ 테스트 부분 성공. 사용자 질문 응답 시간으로 커버 가능.');
  } else {
    console.log('❌ 테스트 실패. 최적화가 필요합니다.');
  }
}

// 실행
runTest().catch(console.error);
