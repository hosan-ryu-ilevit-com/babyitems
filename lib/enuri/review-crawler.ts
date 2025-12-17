/**
 * 에누리 리뷰 크롤러
 * Puppeteer 기반 - 리뷰 텍스트 + 이미지 추출
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';
import { createHash } from 'crypto';

// =====================================================
// 타입 정의
// =====================================================

export interface ReviewImage {
  thumbnail: string;
  original?: string;
  mallName?: string;
}

export interface EnuriReview {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  images: ReviewImage[];
  mallName?: string;
}

export interface EnuriReviewResult {
  modelNo: string;
  reviewCount: number;
  averageRating: number | null;
  reviews: EnuriReview[];
  crawledAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// 유틸리티
// =====================================================

function generateReviewId(content: string, author?: string, mallName?: string): string {
  const data = `${content}|${author || ''}|${mallName || ''}`;
  return createHash('md5').update(data).digest('hex').substring(0, 16);
}

// =====================================================
// 브라우저 설정
// =====================================================

export async function createBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  });
}

// =====================================================
// 리뷰 추출
// =====================================================

type CheerioAPI = ReturnType<typeof load>;

function parseEnuriReviews($: CheerioAPI): EnuriReview[] {
  const reviews: EnuriReview[] = [];
  const seenIds = new Set<string>();

  // 에누리 쇼핑몰 리뷰 구조: .review-mall-item 또는 유사한 클래스
  const reviewSelectors = [
    '.review-mall-item',
    '.review-item',
    '[class*="review-mall"]',
    '.mall-review',
    '.shop-review',
  ];

  for (const selector of reviewSelectors) {
    const items = $(selector);
    if (items.length > 0) {
      items.each((_, el) => {
        const $item = $(el);

        // 별점 추출
        let rating = 5;
        const starEl = $item.find('[class*="star"]');
        const starStyle = starEl.attr('style') || '';
        const widthMatch = starStyle.match(/width:\s*(\d+)%/);
        if (widthMatch) {
          rating = Math.round(parseInt(widthMatch[1], 10) / 20);
        } else {
          // 텍스트에서 별점 추출
          const ratingText = $item.find('[class*="rating"], [class*="score"]').text();
          const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
          if (ratingMatch) {
            rating = Math.round(parseFloat(ratingMatch[1]));
          }
        }

        // 내용 추출
        const content = $item.find('.content, .text, .review-content, [class*="content"]').text().trim() ||
                       $item.find('p').text().trim();

        if (!content || content.length < 10) return;

        // 작성자 추출
        const author = $item.find('.author, .name, .user, [class*="author"]').first().text().trim() || undefined;

        // 날짜 추출
        const date = $item.find('.date, .time, [class*="date"]').first().text().trim() || undefined;

        // 쇼핑몰명 추출
        const mallName = $item.find('.mall, .shop, [class*="mall"]').first().text().trim() || undefined;

        // 이미지 추출
        const images: ReviewImage[] = [];
        $item.find('img').each((_, img) => {
          let src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
          if (src && !src.includes('icon') && !src.includes('profile') && !src.includes('star') &&
              !src.includes('logo') && !src.includes('btn')) {
            if (src.startsWith('//')) {
              src = 'https:' + src;
            }
            images.push({
              thumbnail: src,
              original: src.replace(/\?.*$/, ''),
              mallName,
            });
          }
        });

        const reviewId = generateReviewId(content, author, mallName);
        if (!seenIds.has(reviewId)) {
          seenIds.add(reviewId);
          reviews.push({ reviewId, rating, content, author, date, images, mallName });
        }
      });

      if (reviews.length > 0) break;
    }
  }

  // 대안: 전체 리뷰 영역에서 이미지 수집
  if (reviews.length === 0) {
    // JSON-LD에서 리뷰 가져오기 (텍스트만)
    const seoScript = $('#SEOSCRIPT').html();
    if (seoScript) {
      try {
        const productData = JSON.parse(seoScript);
        if (productData.review && Array.isArray(productData.review)) {
          productData.review.forEach((r: any) => {
            const content = r.reviewBody || '';
            if (content.length >= 10) {
              const reviewId = generateReviewId(content, r.author?.name);
              reviews.push({
                reviewId,
                rating: parseFloat(r.reviewRating?.ratingValue) || 5,
                content,
                author: r.author?.name,
                images: [],
              });
            }
          });
        }
      } catch (e) {
        // 파싱 실패
      }
    }

    // 전체 리뷰 영역에서 이미지 수집
    const allReviewImages: ReviewImage[] = [];
    $('[class*="review"] img, [class*="Review"] img').each((_, img) => {
      let src = $(img).attr('src') || $(img).attr('data-src');
      if (src && !src.includes('icon') && !src.includes('profile') && !src.includes('star') &&
          !src.includes('logo') && !src.includes('btn') && !src.includes('noImg')) {
        if (src.startsWith('//')) {
          src = 'https:' + src;
        }
        // 쇼핑몰 도메인 추출
        let mallName: string | undefined;
        try {
          const url = new URL(src);
          if (url.hostname.includes('cjonstyle')) mallName = 'CJ온스타일';
          else if (url.hostname.includes('ssg')) mallName = 'SSG';
          else if (url.hostname.includes('hmall')) mallName = '현대몰';
          else if (url.hostname.includes('lotte')) mallName = '롯데몰';
          else if (url.hostname.includes('gmarket')) mallName = '지마켓';
          else if (url.hostname.includes('11st')) mallName = '11번가';
          else if (url.hostname.includes('naver')) mallName = '네이버쇼핑';
        } catch {
          // URL 파싱 실패
        }
        allReviewImages.push({ thumbnail: src, original: src.replace(/\?.*$/, ''), mallName });
      }
    });

    // 이미지를 리뷰에 분배 (첫 리뷰에 모두 할당하거나 분배)
    if (reviews.length > 0 && allReviewImages.length > 0) {
      // 이미지를 리뷰에 균등 분배
      const imagesPerReview = Math.ceil(allReviewImages.length / reviews.length);
      reviews.forEach((review, i) => {
        const startIdx = i * imagesPerReview;
        review.images = allReviewImages.slice(startIdx, startIdx + imagesPerReview);
      });
    }
  }

  return reviews;
}

// =====================================================
// 메인 함수
// =====================================================

export async function fetchEnuriReviews(
  modelNo: string,
  maxPages: number = 3,
  sharedBrowser?: Browser
): Promise<EnuriReviewResult> {
  const result: EnuriReviewResult = {
    modelNo,
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

    // 불필요한 리소스 차단 (이미지는 로드)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 리뷰 영역으로 스크롤
    await page.evaluate(() => {
      const reviewSection = document.querySelector('[class*="review"]');
      if (reviewSection) {
        reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        window.scrollTo(0, document.body.scrollHeight / 2);
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 리뷰 탭 클릭
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('a, button, [role="tab"]');
      for (const tab of tabs) {
        if (tab.textContent?.includes('리뷰') || tab.textContent?.includes('상품평')) {
          (tab as HTMLElement).click();
          return;
        }
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // HTML 파싱
    const html = await page.content();
    const $ = load(html);

    // 메타데이터 추출
    const seoScript = $('#SEOSCRIPT').html();
    if (seoScript) {
      try {
        const productData = JSON.parse(seoScript);
        result.reviewCount = parseInt(productData.aggregateRating?.reviewCount) || 0;
        result.averageRating = parseFloat(productData.aggregateRating?.ratingValue) || null;
      } catch (e) {
        // 파싱 실패
      }
    }

    // 리뷰 추출
    result.reviews = parseEnuriReviews($);

    // 페이지네이션 처리
    for (let pageNum = 2; pageNum <= maxPages && result.reviews.length < 100; pageNum++) {
      const hasNextPage = await page.evaluate((currentPage) => {
        const pageLinks = document.querySelectorAll('[class*="page"] a, .pagination a');
        for (const link of pageLinks) {
          if (link.textContent?.trim() === String(currentPage)) {
            (link as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, pageNum);

      if (!hasNextPage) break;

      await new Promise(resolve => setTimeout(resolve, 2000));
      const pageHtml = await page.content();
      const $page = load(pageHtml);
      const pageReviews = parseEnuriReviews($page);

      // 중복 제거하며 추가
      const existingIds = new Set(result.reviews.map(r => r.reviewId));
      for (const review of pageReviews) {
        if (!existingIds.has(review.reviewId)) {
          result.reviews.push(review);
          existingIds.add(review.reviewId);
        }
      }
    }

    result.success = true;
    await page.close();
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    if (ownBrowser && browser) {
      try {
        await browser.close();
      } catch {
        // 무시
      }
    }
  }

  return result;
}
