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

export interface FetchReviewsOptions {
  maxReviews?: number;
  skipMetadata?: boolean;  // 메타데이터 요청 생략 (검색에서 이미 가져온 경우)
  timeout?: number;
}

/**
 * 단일 상품 리뷰 크롤링 (Axios 버전 - 최적화)
 *
 * 2026년 1월 업데이트: 다나와 API 변경
 * 1. 상품 페이지에서 Schema.org 메타데이터로 reviewCount, averageRating 추출
 * 2. companyProductReview.ajax.php API로 "쇼핑몰 상품리뷰" 가져오기 (5000개+)
 *    (기존 companyReview.ajax.php API는 제거됨)
 */
export async function fetchReviewsLite(
  pcode: string,
  options: FetchReviewsOptions | number = 5
): Promise<ReviewCrawlResult> {
  // 하위 호환성: 숫자로 호출 시 maxReviews로 처리
  const opts: FetchReviewsOptions = typeof options === 'number'
    ? { maxReviews: options }
    : options;

  const maxReviews = opts.maxReviews ?? 5;
  const timeout = opts.timeout ?? 8000;

  const result: ReviewCrawlResult = {
    pcode,
    success: false,
    reviewCount: 0,
    averageRating: null,
    reviews: [],
  };

  const productUrl = `https://prod.danawa.com/info/?pcode=${pcode}`;

  try {
    // 1. 상품 페이지에서 메타데이터 + 카테고리 정보 추출
    let cate1 = '';
    
    try {
      const productResponse = await axios.get(productUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout,
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

      // 카테고리 정보 추출 (companyProductReview API에 필요)
      // 형식: cate1Code = '861';
      const htmlStr = productResponse.data as string;
      const cate1Match = htmlStr.match(/cate1Code\s*=\s*['"]?(\d+)['"]?/);
      if (cate1Match) cate1 = cate1Match[1];

    } catch {
      // 메타데이터 실패해도 리뷰 크롤링 시도
      console.log(`   ⚠️ [${pcode}] 메타데이터 추출 실패`);
    }

    // 2. companyProductReview API로 "쇼핑몰 상품리뷰" 가져오기
    // (기존 companyReview.ajax.php는 2025년 제거됨)
    // sortType: usefull (유용한 순), recent (최신순)
    if (cate1) {
      try {
        const timestamp = Math.random();
        const reviewUrl = `https://prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php?t=${timestamp}&prodCode=${pcode}&cate1Code=${cate1}&page=1&limit=${maxReviews * 2}&score=0&sortType=usefull&usefullScore=Y`;
        
        const reviewResponse = await axios.get(reviewUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': productUrl,
          },
          timeout,
        });

        const reviewHtml = reviewResponse.data;
        if (typeof reviewHtml === 'string' && reviewHtml.length > 100) {
          const $review = load(reviewHtml);

          // 쇼핑몰 상품리뷰 아이템 파싱
          // 선택자: .rvw_list > li 또는 .danawa-prodBlog-companyReview-clazz-more
          $review('.rvw_list > li, li.danawa-prodBlog-companyReview-clazz-more').each((i: number, el: CheerioElement) => {
            if (result.reviews.length >= maxReviews) return false;

            const $item = $review(el);

            // 내용 추출: .atc_exp가 있으면 그것만 사용 (펼쳐보기 클릭 시 나타나는 전체 내용)
            // 없으면 .atc_cont 또는 .atc, .rvw_atc 사용
            const $atcExp = $item.find('.atc_exp');
            const $atcCont = $item.find('.atc_cont');
            
            let content = '';
            if ($atcExp.length > 0 && $atcExp.text().trim().length > 10) {
              content = $atcExp.text().trim();
            } else if ($atcCont.length > 0) {
              content = $atcCont.text().trim();
            } else {
              // 최후의 수단으로 부모 요소에서 텍스트 추출하되 "펼쳐보기" 등의 버튼 텍스트 제외 시도
              const $atc = $item.find('.atc, .rvw_atc').clone();
              $atc.find('.btn_more, .btn_atc_exp, .btn_rvw_atc, style, script').remove();
              content = $atc.text().trim();
            }

            if (!content || content.length < 5) return;

            // "펼쳐보기" 문자열이 포함되어 있다면 그 이전까지만 자르거나 정리
            if (content.includes('펼쳐보기')) {
              const parts = content.split('펼쳐보기');
              // 보통 "요약내용... 펼쳐보기 ...전체내용" 구조임
              // 두 번째 파트가 충분히 길면 두 번째 파트 사용, 아니면 첫 번째 파트 사용
              if (parts[1] && parts[1].trim().length > parts[0].trim().length) {
                content = parts[1].trim();
              } else {
                content = parts[0].trim();
              }
            }

            // 별점 (.star_mask의 width 스타일에서)
            let rating = 5;
            const starMask = $item.find('.star_mask');
            if (starMask.length) {
              rating = parseRatingFromStyle(starMask.attr('style') || '');
            }

            // 쇼핑몰명 (.mall 클래스)
            const mallName = $item.find('.mall').text().trim() || undefined;

            // 작성자 (.name 클래스)
            const author = $item.find('.name').text().trim() || undefined;

            // 날짜 (.date 클래스)
            const date = $item.find('.date').text().trim() || undefined;

            const reviewId = generateReviewId(content, author, date);

            // 중복 체크
            if (!result.reviews.some(r => r.reviewId === reviewId)) {
              // 불필요한 공백/탭/줄바꿈 정리
              const cleanContent = content
                .replace(/[\t\n\r]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim()
                .slice(0, 500);
              
              result.reviews.push({
                reviewId,
                rating: Math.min(5, Math.max(1, rating)), // 1-5 범위 보장
                content: cleanContent,
                author,
                date,
                mallName,
              });
            }
          });
          
          // 리뷰 정렬: 길이가 긴 순으로 (더 유용한 정보 포함 가능성)
          result.reviews.sort((a, b) => b.content.length - a.content.length);
          
          // maxReviews 개수로 제한
          result.reviews = result.reviews.slice(0, maxReviews);
        }
      } catch {
        // API 실패 시 무시
        console.log(`   ⚠️ [${pcode}] companyProductReview API 실패`);
      }
    }

    // 3. 쇼핑몰 리뷰가 없으면 productOpinion (다나와 상품의견) 시도 (Fallback)
    if (result.reviews.length === 0 && cate1) {
      try {
        const timestamp = Math.random();
        const opinionUrl = `https://prod.danawa.com/info/dpg/ajax/productOpinion.ajax.php?t=${timestamp}&prodCode=${pcode}&page=1&limit=${maxReviews * 2}&cate1Code=${cate1}`;
        
        const opinionResponse = await axios.get(opinionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': productUrl,
          },
          timeout,
        });

        const opinionHtml = opinionResponse.data;
        if (typeof opinionHtml === 'string' && opinionHtml.length > 100) {
          const $opinion = load(opinionHtml);

          // 다나와 상품의견 파싱
          $opinion('.cmt_item, .rvw_item').each((i: number, el: CheerioElement) => {
            if (result.reviews.length >= maxReviews) return false;

            const $item = $opinion(el);
            const content = $item.find('.cmt_txt, .rvw_atc, .atc').text().trim();
            if (!content || content.length < 5) return;

            let rating = 4; // 상품의견은 별점이 없는 경우가 많음
            const starMask = $item.find('.star_mask');
            if (starMask.length) {
              rating = parseRatingFromStyle(starMask.attr('style') || '');
            }

            const author = $item.find('.name, .nick').text().trim() || undefined;
            const date = $item.find('.date, .time').text().trim() || undefined;
            const reviewId = generateReviewId(content, author, date);

            if (!result.reviews.some(r => r.reviewId === reviewId)) {
              // 불필요한 공백/탭/줄바꿈 정리
              const cleanContent = content
                .replace(/[\t\n\r]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim()
                .slice(0, 500);
                
              result.reviews.push({
                reviewId,
                rating: Math.min(5, Math.max(1, rating)),
                content: cleanContent,
                author,
                date,
              });
            }
          });
        }
      } catch {
        // productOpinion API 실패 시 무시
      }
    }

    result.success = true;
    if (result.reviews.length > 0) {
      console.log(`   ✅ [${pcode}] ${result.reviews.length}개 리뷰 수집 (총 ${result.reviewCount}개, 평점 ${result.averageRating})`);
    } else if (result.reviewCount > 0) {
      console.log(`   ⚠️ [${pcode}] 리뷰 내용 없음 (메타데이터: ${result.reviewCount}개, ${result.averageRating}점)`);
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`   ❌ [${pcode}] 리뷰 크롤링 실패:`, result.error);
  }

  return result;
}

// =====================================================
// Batch Crawler with Parallel Processing
// =====================================================

export interface BatchCrawlOptions {
  maxReviewsPerProduct?: number;
  concurrency?: number;          // 동시 처리 수 (기본 8)
  delayBetweenChunks?: number;   // 청크 간 딜레이 (기본 200ms)
  skipMetadata?: boolean;        // 메타데이터 생략 (기본 true)
  timeout?: number;              // 요청 타임아웃 (기본 5초)
  onProgress?: (completed: number, total: number, result: ReviewCrawlResult) => void;
}

/**
 * 여러 상품 리뷰 병렬 크롤링 (최적화 버전)
 *
 * 기본값 최적화:
 * - 동시 처리: 8개 (기존 4개)
 * - 청크 딜레이: 200ms (기존 500ms)
 * - 메타데이터 생략: true (검색에서 이미 가져온 경우)
 * - 타임아웃: 5초 (기존 10초)
 *
 * 예상 성능: 15개 상품 → ~3초 (기존 ~10초)
 */
export async function fetchReviewsBatchParallel(
  pcodes: string[],
  options: BatchCrawlOptions | number = {}
): Promise<ReviewCrawlResult[]> {
  // 하위 호환성: 숫자로 호출 시 maxReviewsPerProduct로 처리
  const opts: BatchCrawlOptions = typeof options === 'number'
    ? { maxReviewsPerProduct: options }
    : options;

  const maxReviewsPerProduct = opts.maxReviewsPerProduct ?? 5;
  const concurrency = opts.concurrency ?? 8;           // 4 → 8
  const delayBetweenChunks = opts.delayBetweenChunks ?? 200;  // 500 → 200
  const skipMetadata = opts.skipMetadata ?? true;      // 기본 true
  const timeout = opts.timeout ?? 5000;
  const onProgress = opts.onProgress;

  const results: ReviewCrawlResult[] = [];
  const total = pcodes.length;
  let completed = 0;

  console.log(`\n📦 [ReviewCrawler-Lite] 배치 크롤링 시작: ${total}개 상품, 동시 처리: ${concurrency}, 딜레이: ${delayBetweenChunks}ms`);
  const startTime = Date.now();

  // 청크로 나누어 병렬 처리
  for (let i = 0; i < pcodes.length; i += concurrency) {
    const chunk = pcodes.slice(i, i + concurrency);

    // 청크 내 병렬 실행
    const chunkResults = await Promise.all(
      chunk.map(async (pcode) => {
        const result = await fetchReviewsLite(pcode, {
          maxReviews: maxReviewsPerProduct,
          skipMetadata,
          timeout,
        });
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
      await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
    }
  }

  const elapsedMs = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const totalReviews = results.reduce((sum, r) => sum + r.reviews.length, 0);

  console.log(`\n✅ [ReviewCrawler-Lite] 배치 완료: ${successCount}/${total} 성공, 총 ${totalReviews}개 리뷰 수집 (${(elapsedMs / 1000).toFixed(1)}초)`);

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
