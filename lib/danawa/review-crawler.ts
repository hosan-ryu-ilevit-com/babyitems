/**
 * 다나와 리뷰 크롤러
 *
 * 목적: pcode로 리뷰 정보 크롤링 (리뷰 수, 평균 별점, 리뷰 내용, 사진)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import { createHash } from 'crypto';

// =====================================================
// 유틸리티 함수
// =====================================================

/**
 * 리뷰 고유 ID 생성 (content + author + date + mallName 기반 해시)
 * DOM ID는 페이지마다 반복되므로 내용 기반으로 생성
 */
function generateReviewId(
  content: string,
  author?: string,
  date?: string,
  mallName?: string
): string {
  const data = `${content}|${author || ''}|${date || ''}|${mallName || ''}`;
  return createHash('md5').update(data).digest('hex').substring(0, 16);
}

// =====================================================
// 타입 정의
// =====================================================

export interface ReviewImage {
  thumbnail: string;    // 썸네일 URL
  original?: string;    // 원본 이미지 URL
}

export interface Review {
  reviewId?: string;       // 리뷰 고유 ID
  rating: number;          // 별점 (1-5)
  content: string;         // 리뷰 내용
  author?: string;         // 작성자
  date?: string;           // 작성일
  images: ReviewImage[];   // 리뷰 이미지들
  helpful?: number;        // 도움됨 수
  mallName?: string;       // 구매처
  option?: string;         // 구매 옵션
}

export interface DanawaReviewResult {
  pcode: string;
  reviewCount: number;         // 총 리뷰 수
  averageRating: number | null; // 평균 별점
  reviews: Review[];           // 크롤링한 리뷰 목록
  crawledAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// 브라우저 설정
// =====================================================

/**
 * 브라우저 인스턴스 생성 (외부에서 재사용 가능하도록 export)
 */
export async function createBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      // --single-process, --no-zygote 제거: 병렬 처리 시 연결 끊김 발생
    ],
  });
}

// =====================================================
// 리뷰 추출 헬퍼
// =====================================================

/**
 * 페이지에서 리뷰 메타데이터 추출 (Schema.org 기반)
 */
function extractReviewMeta(html: string): { reviewCount: number; averageRating: number | null } {
  const $ = load(html);
  let reviewCount = 0;
  let averageRating: number | null = null;

  // Schema.org JSON-LD에서 추출
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const json = JSON.parse($(script).html() || '');
      if (json.aggregateRating) {
        reviewCount = parseInt(json.aggregateRating.reviewCount, 10) || 0;
        averageRating = parseFloat(json.aggregateRating.ratingValue) || null;
      }
    } catch {
      // JSON 파싱 실패 무시
    }
  });

  // 페이지에서 직접 추출 (fallback)
  if (reviewCount === 0) {
    // 리뷰 탭의 숫자 추출
    const reviewTabText = $('.tab_item a:contains("리뷰"), .tab_item a:contains("사용기")').text();
    const match = reviewTabText.match(/\d+/);
    if (match) {
      reviewCount = parseInt(match[0], 10);
    }
  }

  if (!averageRating) {
    // 별점 영역에서 추출
    const ratingText = $('.star_area .num, .star_point .num, .point_num').first().text();
    if (ratingText) {
      averageRating = parseFloat(ratingText) || null;
    }
  }

  return { reviewCount, averageRating };
}

// Cheerio element types
type CheerioAPI = ReturnType<typeof load>;
type CheerioSelection = ReturnType<CheerioAPI>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioElement = any;

/**
 * 개별 리뷰 파싱 (다나와 쇼핑몰 리뷰 구조)
 */
function parseReview($review: CheerioSelection, $: CheerioAPI): Review | null {
  try {
    // 별점 추출 (.star_mask의 width 스타일에서)
    let rating = 5; // 기본값
    const starEl = $review.find('.star_mask');
    if (starEl.length) {
      const style = starEl.attr('style') || '';
      const widthMatch = style.match(/width:\s*(\d+)%/);
      if (widthMatch) {
        rating = Math.round(parseInt(widthMatch[1], 10) / 20);
      }
    }

    // 리뷰 내용 추출 (.atc 클래스)
    // .atc_exp가 있으면 그것만 사용 (펼쳐보기 클릭 시 나타나는 전체 내용)
    const $atcExp = $review.find('.atc_exp');
    const $atcCont = $review.find('.atc_cont');
    
    let content = '';
    if ($atcExp.length > 0 && $atcExp.text().trim().length > 10) {
      content = $atcExp.text().trim();
    } else if ($atcCont.length > 0) {
      content = $atcCont.text().trim();
    } else {
      // 최후의 수단으로 부모 요소에서 텍스트 추출하되 "펼쳐보기" 등의 버튼 텍스트 제외 시도
      let $atc = $review.find('.atc, .rvw_atc, .atc_cont').clone();
      if ($atc.length === 0) {
        $atc = $review.find('.rvw_atc, .atc_cont').clone();
      }
      $atc.find('.btn_more, .btn_atc_exp, .btn_rvw_atc, style, script').remove();
      content = $atc.text().trim();
    }

    // "펼쳐보기" 문자열이 포함되어 있다면 정리
    if (content.includes('펼쳐보기')) {
      const parts = content.split('펼쳐보기');
      if (parts[1] && parts[1].trim().length > parts[0].trim().length) {
        content = parts[1].trim();
      } else {
        content = parts[0].trim();
      }
    }

    if (!content || content.length < 5) {
      return null; // 내용이 너무 짧으면 스킵
    }

    // 작성자 추출 (.name 클래스)
    const authorEl = $review.find('.name');
    const author = authorEl.first().text().trim() || undefined;

    // 작성일 추출 (.date 클래스)
    const dateEl = $review.find('.date');
    const date = dateEl.first().text().trim() || undefined;

    // 이미지 추출 (.pto_thumb 영역 내 이미지들)
    const images: ReviewImage[] = [];
    const seenUrls = new Set<string>();
    $review.find('.pto_thumb img, .photoReviewImgDiv img').each((_: number, img: CheerioElement) => {
      const $img = $(img);
      let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original');
      if (src && !src.includes('noImg') && !src.includes('noData') && !src.includes('icon')) {
        // URL이 //로 시작하면 https: 추가
        if (src.startsWith('//')) {
          src = 'https:' + src;
        }
        // 중복 URL 제거
        if (!seenUrls.has(src)) {
          seenUrls.add(src);
          images.push({
            thumbnail: src,
            original: src.replace(/\?.*$/, ''), // 쿼리 파라미터 제거한 원본
          });
        }
      }
    });

    // 구매처 추출 (.mall 클래스)
    const mallEl = $review.find('.mall');
    const mallName = mallEl.first().text().trim() || undefined;

    // 리뷰 ID 생성 - content + author + date + mallName 기반 해시
    // DOM ID는 페이지마다 반복되므로 사용하지 않음
    const reviewId = generateReviewId(content, author, date, mallName);

    return {
      reviewId,
      rating,
      content,
      author,
      date,
      images,
      mallName,
    };
  } catch {
    return null;
  }
}

/**
 * 페이지에서 리뷰 목록 추출
 * @param page Puppeteer 페이지
 * @param maxPages 최대 페이지 수
 * @param fastMode 빠른 모드 (딜레이 축소)
 */
async function extractReviews(page: Page, maxPages: number = 3, fastMode: boolean = false): Promise<Review[]> {
  const allReviews: Review[] = [];

  // 딜레이 설정 (fastMode: 축소된 딜레이)
  const scrollDelay = fastMode ? 800 : 2000;
  const tabClickDelay = fastMode ? 800 : 2000;
  const pageLoadDelay = fastMode ? 600 : 1500;
  const nextPageDelay = fastMode ? 800 : 2000;

  try {
    // 리뷰 영역으로 스크롤
    await page.evaluate(() => {
      const reviewSection = document.querySelector('#bookmark_cm_opinion, #opinionArea');
      if (reviewSection) {
        reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        window.scrollTo(0, 1000);
      }
    });
    await new Promise(resolve => setTimeout(resolve, scrollDelay));

    // "쇼핑몰 상품리뷰" 탭 클릭 (실제 리뷰가 있는 탭)
    await page.evaluate(() => {
      const companyReviewTab = document.querySelector('#danawa-prodBlog-companyReview-button-tab-companyReview');
      if (companyReviewTab) {
        (companyReviewTab as HTMLElement).click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, tabClickDelay));

    // 페이지네이션 처리
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      await new Promise(resolve => setTimeout(resolve, pageLoadDelay));

      const html = await page.content();
      const $ = load(html);

      // 쇼핑몰 리뷰 아이템 선택자들 시도 (다나와 구조)
      const reviewSelectors = [
        '.rvw_list > li',
        'li.danawa-prodBlog-companyReview-clazz-more',
        '.danawa-prodBlog-companyReview-cl498-item',
        '.cmt_item',
        '.review_item',
      ];

      let reviewItems: ReturnType<typeof $>[] = [];
      for (const selector of reviewSelectors) {
        const items = $(selector);
        if (items.length > 0) {
          console.log(`   📌 Found ${items.length} reviews with selector: ${selector}`);
          items.each((_, el) => {
            reviewItems.push($(el));
          });
          break;
        }
      }

      // 리뷰 파싱
      for (const $item of reviewItems) {
        const review = parseReview($item, $);
        if (review) {
          // 중복 체크
          const isDuplicate = allReviews.some(r =>
            r.content === review.content && r.author === review.author
          );
          if (!isDuplicate) {
            allReviews.push(review);
          }
        }
      }

      console.log(`   📄 Page ${pageNum}: Found ${reviewItems.length} items, Total: ${allReviews.length}`);

      // 다음 페이지로 이동
      if (pageNum < maxPages && allReviews.length > 0) {
        const nextPageClicked = await page.evaluate((currentPage) => {
          // 페이지 번호 버튼 찾기
          const pageSelectors = [
            '.danawa-prodBlog-companyReview-button-page',
            '.num_nav a',
            '.page_nav a',
            '.paginate a',
            '[class*="page"] a',
          ];

          for (const sel of pageSelectors) {
            const pageLinks = document.querySelectorAll(sel);
            for (const link of pageLinks) {
              const text = link.textContent?.trim();
              if (text === String(currentPage + 1)) {
                (link as HTMLElement).click();
                return true;
              }
            }
          }

          // 다음 버튼 클릭
          const nextBtnSelectors = [
            '.danawa-prodBlog-companyReview-button-next:not(.disabled)',
            '.btn_next:not(.disabled)',
            '.next:not(.disabled)',
            'a[class*="next"]:not(.disabled)',
          ];

          for (const sel of nextBtnSelectors) {
            const nextBtn = document.querySelector(sel);
            if (nextBtn) {
              (nextBtn as HTMLElement).click();
              return true;
            }
          }

          return false;
        }, pageNum);

        if (!nextPageClicked) {
          console.log(`   ⚠️ No more pages after page ${pageNum}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, nextPageDelay));
      }
    }
  } catch (error) {
    console.error('   ❌ Review extraction error:', error);
  }

  return allReviews;
}

// =====================================================
// 메인 함수
// =====================================================

/**
 * 다나와 상품 리뷰 정보 크롤링 (브라우저 재사용 버전)
 * @param pcode 다나와 상품 코드
 * @param maxPages 최대 크롤링할 페이지 수 (기본 3)
 * @param sharedBrowser 재사용할 브라우저 인스턴스 (없으면 새로 생성)
 * @param fastMode 빠른 모드 (딜레이 축소)
 * @returns 리뷰 정보
 */
export async function fetchDanawaReviews(
  pcode: string,
  maxPages: number = 3,
  sharedBrowser?: Browser,
  fastMode: boolean = false
): Promise<DanawaReviewResult> {
  const result: DanawaReviewResult = {
    pcode,
    reviewCount: 0,
    averageRating: null,
    reviews: [],
    crawledAt: new Date(),
    success: false,
  };

  let browser: Browser | null = null;
  const ownBrowser = !sharedBrowser;

  try {
    browser = sharedBrowser || await createBrowser();
    const page = await browser.newPage();

    // 이미지는 로드 (리뷰 이미지 필요)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 상품 페이지 접속 (리뷰 탭으로 바로 이동)
    const url = `https://prod.danawa.com/info/?pcode=${pcode}#bookmark_cm_opinion`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // 메타데이터 추출
    const html = await page.content();
    const { reviewCount, averageRating } = extractReviewMeta(html);
    result.reviewCount = reviewCount;
    result.averageRating = averageRating;

    // 리뷰 목록 추출
    if (reviewCount > 0) {
      result.reviews = await extractReviews(page, maxPages, fastMode);
    }

    result.success = true;

    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [${pcode}] Review crawl failed:`, result.error);
  } finally {
    // 자체 생성한 브라우저만 닫음
    if (ownBrowser && browser) {
      try {
        await browser.close();
      } catch {
        // 브라우저 닫기 실패 무시
      }
    }
  }

  return result;
}

/**
 * 여러 상품 리뷰 배치 크롤링
 * @param pcodes 상품 코드 배열
 * @param delayMs 요청 간 딜레이 (기본 3초)
 * @param maxPagesPerProduct 상품당 최대 페이지 수 (기본 3)
 * @param onProgress 진행 콜백
 */
export async function fetchDanawaReviewsBatch(
  pcodes: string[],
  delayMs: number = 3000,
  maxPagesPerProduct: number = 3,
  onProgress?: (current: number, total: number, result: DanawaReviewResult) => void
): Promise<DanawaReviewResult[]> {
  const results: DanawaReviewResult[] = [];
  const total = pcodes.length;

  for (let i = 0; i < pcodes.length; i++) {
    const pcode = pcodes[i];
    console.log(`📦 [${i + 1}/${total}] Fetching reviews for ${pcode}...`);

    const result = await fetchDanawaReviews(pcode, maxPagesPerProduct);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ ${result.reviewCount}개 리뷰, 평균 ${result.averageRating}점, 크롤링: ${result.reviews.length}개`);
      if (result.reviews.length > 0) {
        const withImages = result.reviews.filter(r => r.images.length > 0).length;
        console.log(`   📷 이미지 포함 리뷰: ${withImages}개`);
      }
    } else {
      console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
    }

    onProgress?.(i + 1, total, result);

    // Rate limit (마지막 요청 제외)
    if (i < pcodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
