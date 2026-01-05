/**
 * 다나와 리뷰 크롤러 (Lite 버전)
 *
 * Knowledge Agent V3용 - 빠른 리뷰 수집
 * - Axios + Cheerio 기반 (Puppeteer 대비 10배 빠름)
 * - 상품당 5개 리뷰만 수집 (요약용)
 * - 병렬 처리 최적화
 */

import axios from 'axios';
import { load } from 'cheerio';
import { createHash } from 'crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
type CheerioElement = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// =====================================================
// Types
// =====================================================

export interface ReviewLite {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  mallName?: string;
}

export interface ReviewCrawlResult {
  pcode: string;
  success: boolean;
  reviewCount: number;
  averageRating: number | null;
  reviews: ReviewLite[];
  error?: string;
}

// =====================================================
// Utilities
// =====================================================

function generateReviewId(content: string, author?: string, date?: string): string {
  const data = `${content}|${author || ''}|${date || ''}`;
  return createHash('md5').update(data).digest('hex').substring(0, 12);
}

function parseRatingFromStyle(style: string): number {
  const match = style.match(/width:\s*(\d+)%/);
  if (match) {
    return Math.round(parseInt(match[1], 10) / 20);
  }
  return 5;
}

// =====================================================
// Single Product Review Crawler
// =====================================================

/**
 * 단일 상품 리뷰 크롤링 (Axios 버전)
 *
 * 쇼핑몰 리뷰 API 직접 호출로 빠른 수집
 */
export async function fetchReviewsLite(
  pcode: string,
  maxReviews: number = 5
): Promise<ReviewCrawlResult> {
  const result: ReviewCrawlResult = {
    pcode,
    success: false,
    reviewCount: 0,
    averageRating: null,
    reviews: [],
  };

  try {
    // 1. 상품 페이지에서 메타데이터 추출
    const productUrl = `https://prod.danawa.com/info/?pcode=${pcode}`;
    const productResponse = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 10000,
    });

    const $ = load(productResponse.data);

    // Schema.org에서 리뷰 메타데이터 추출
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const json = JSON.parse($(script).html() || '');
        if (json.aggregateRating) {
          result.reviewCount = parseInt(json.aggregateRating.reviewCount, 10) || 0;
          result.averageRating = parseFloat(json.aggregateRating.ratingValue) || null;
        }
      } catch {
        // ignore
      }
    });

    // 리뷰가 없으면 빠르게 종료
    if (result.reviewCount === 0) {
      result.success = true;
      return result;
    }

    // 2. 쇼핑몰 리뷰 AJAX API 호출
    // 다나와는 리뷰를 별도 AJAX로 로드함
    const reviewApiUrl = `https://prod.danawa.com/info/dpg/ajax/companyReview.ajax.php`;
    const reviewResponse = await axios.post(reviewApiUrl,
      `pcode=${pcode}&page=1&limit=${maxReviews}&sort=date`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': productUrl,
        },
        timeout: 10000,
      }
    );

    // AJAX 응답 파싱
    const reviewHtml = reviewResponse.data;
    if (typeof reviewHtml === 'string' && reviewHtml.length > 100) {
      const $review = load(reviewHtml);

      // 리뷰 아이템 파싱
      $review('.rvw_list > li, li[class*="companyReview"]').each((i: number, el: CheerioElement) => {
        if (result.reviews.length >= maxReviews) return false;

        const $item = $review(el);

        // 별점
        let rating = 5;
        const starMask = $item.find('.star_mask');
        if (starMask.length) {
          rating = parseRatingFromStyle(starMask.attr('style') || '');
        }

        // 내용
        const content = $item.find('.atc, .rvw_atc').text().trim();
        if (!content || content.length < 10) return;

        // 작성자
        const author = $item.find('.name').text().trim() || undefined;

        // 날짜
        const date = $item.find('.date').text().trim() || undefined;

        // 구매처
        const mallName = $item.find('.mall').text().trim() || undefined;

        const reviewId = generateReviewId(content, author, date);

        // 중복 체크
        if (!result.reviews.some(r => r.reviewId === reviewId)) {
          result.reviews.push({
            reviewId,
            rating,
            content,
            author,
            date,
            mallName,
          });
        }
      });
    }

    // 3. AJAX 실패 시 페이지에서 직접 파싱 (Fallback)
    if (result.reviews.length === 0) {
      // 쇼핑몰 리뷰 탭 내용에서 파싱
      $('.rvw_list > li').each((i: number, el: CheerioElement) => {
        if (result.reviews.length >= maxReviews) return false;

        const $item = $(el);

        let rating = 5;
        const starMask = $item.find('.star_mask');
        if (starMask.length) {
          rating = parseRatingFromStyle(starMask.attr('style') || '');
        }

        const content = $item.find('.atc').text().trim();
        if (!content || content.length < 10) return;

        const author = $item.find('.name').text().trim() || undefined;
        const date = $item.find('.date').text().trim() || undefined;
        const mallName = $item.find('.mall').text().trim() || undefined;

        const reviewId = generateReviewId(content, author, date);

        if (!result.reviews.some(r => r.reviewId === reviewId)) {
          result.reviews.push({
            reviewId,
            rating,
            content,
            author,
            date,
            mallName,
          });
        }
      });
    }

    result.success = true;
    console.log(`   ✅ [${pcode}] ${result.reviews.length}개 리뷰 수집 (총 ${result.reviewCount}개)`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`   ❌ [${pcode}] 리뷰 크롤링 실패:`, result.error);
  }

  return result;
}

// =====================================================
// Batch Crawler with Parallel Processing
// =====================================================

/**
 * 여러 상품 리뷰 병렬 크롤링
 *
 * @param pcodes 상품 코드 배열
 * @param maxReviewsPerProduct 상품당 최대 리뷰 수
 * @param concurrency 동시 처리 수 (기본 4)
 * @param onProgress 진행 콜백
 */
export async function fetchReviewsBatchParallel(
  pcodes: string[],
  maxReviewsPerProduct: number = 5,
  concurrency: number = 4,
  onProgress?: (completed: number, total: number, result: ReviewCrawlResult) => void
): Promise<ReviewCrawlResult[]> {
  const results: ReviewCrawlResult[] = [];
  const total = pcodes.length;
  let completed = 0;

  console.log(`\n📦 [ReviewCrawler-Lite] 배치 크롤링 시작: ${total}개 상품, 동시 처리: ${concurrency}`);

  // 청크로 나누어 병렬 처리
  for (let i = 0; i < pcodes.length; i += concurrency) {
    const chunk = pcodes.slice(i, i + concurrency);

    // 청크 내 병렬 실행
    const chunkResults = await Promise.all(
      chunk.map(async (pcode) => {
        const result = await fetchReviewsLite(pcode, maxReviewsPerProduct);
        completed++;
        if (onProgress) {
          onProgress(completed, total, result);
        }
        return result;
      })
    );

    results.push(...chunkResults);

    // Rate limit (마지막 청크 제외)
    if (i + concurrency < pcodes.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const totalReviews = results.reduce((sum, r) => sum + r.reviews.length, 0);

  console.log(`\n✅ [ReviewCrawler-Lite] 배치 완료: ${successCount}/${total} 성공, 총 ${totalReviews}개 리뷰 수집`);

  return results;
}

// =====================================================
// Review Summary Generator (for MD)
// =====================================================

export interface ReviewSummary {
  totalReviews: number;
  avgRating: number;
  topKeywords: Array<{ keyword: string; sentiment: 'positive' | 'negative'; count: number }>;
  sampleReviews: Array<{ content: string; rating: number }>;
}

/**
 * 리뷰 데이터를 요약 형태로 변환
 */
export function summarizeReviews(results: ReviewCrawlResult[]): ReviewSummary {
  let totalReviews = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  const allReviews: ReviewLite[] = [];

  for (const result of results) {
    totalReviews += result.reviewCount;
    if (result.averageRating) {
      ratingSum += result.averageRating;
      ratingCount++;
    }
    allReviews.push(...result.reviews);
  }

  const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0;

  // 간단한 키워드 빈도 분석 (실제로는 AI로 처리 예정)
  const keywordCounts: Record<string, { count: number; sentiment: 'positive' | 'negative' }> = {};

  // 긍정 키워드
  const positiveKeywords = ['좋아요', '만족', '추천', '최고', '깨끗', '편리', '빠르', '조용', '예쁘', '튼튼'];
  // 부정 키워드
  const negativeKeywords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거'];

  for (const review of allReviews) {
    const content = review.content.toLowerCase();

    for (const keyword of positiveKeywords) {
      if (content.includes(keyword)) {
        if (!keywordCounts[keyword]) {
          keywordCounts[keyword] = { count: 0, sentiment: 'positive' };
        }
        keywordCounts[keyword].count++;
      }
    }

    for (const keyword of negativeKeywords) {
      if (content.includes(keyword)) {
        if (!keywordCounts[keyword]) {
          keywordCounts[keyword] = { count: 0, sentiment: 'negative' };
        }
        keywordCounts[keyword].count++;
      }
    }
  }

  const topKeywords = Object.entries(keywordCounts)
    .map(([keyword, data]) => ({ keyword, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 샘플 리뷰 (평점 높은 것 + 낮은 것)
  const sortedByRating = [...allReviews].sort((a, b) => b.rating - a.rating);
  const sampleReviews = [
    ...sortedByRating.slice(0, 3),  // 높은 평점
    ...sortedByRating.slice(-2),     // 낮은 평점
  ].map(r => ({ content: r.content.slice(0, 200), rating: r.rating }));

  return {
    totalReviews,
    avgRating,
    topKeywords,
    sampleReviews,
  };
}
