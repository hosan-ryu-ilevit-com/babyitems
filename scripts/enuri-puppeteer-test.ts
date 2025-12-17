/**
 * 에누리 Puppeteer 기반 리뷰 + 필터 크롤러 테스트
 * 다나와 크롤러 참고하여 작성
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { load } from 'cheerio';

// =====================================================
// 타입 정의
// =====================================================

interface ReviewImage {
  thumbnail: string;
  original?: string;
}

interface EnuriReview {
  reviewId?: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  images: ReviewImage[];
  mallName?: string;
}

interface FilterOption {
  name: string;
  code?: string;
  count?: number;
}

interface FilterGroup {
  groupName: string;
  options: FilterOption[];
}

// =====================================================
// 브라우저 설정
// =====================================================

async function createBrowser(): Promise<Browser> {
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
// 1. 리뷰 이미지 추출 테스트
// =====================================================

async function testReviewImages(page: Page, modelNo: string): Promise<void> {
  console.log('\n=== 1. 리뷰 이미지 추출 테스트 ===\n');

  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
  console.log(`URL: ${url}\n`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

  // 리뷰 탭으로 스크롤
  await page.evaluate(() => {
    const reviewSection = document.querySelector('#prod-review, .prod-review, [class*="review"]');
    if (reviewSection) {
      reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else {
      window.scrollTo(0, 2000);
    }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 리뷰 영역 클릭 (탭이 있는 경우)
  await page.evaluate(() => {
    // 리뷰 탭 찾기
    const selectors = ['[data-tab="review"]', '[href*="review"]', '.tab-review'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        (el as HTMLElement).click();
        return;
      }
    }
    // 텍스트로 찾기
    const links = document.querySelectorAll('a, button');
    for (const link of links) {
      if (link.textContent?.includes('리뷰')) {
        (link as HTMLElement).click();
        return;
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // HTML에서 리뷰 추출
  const html = await page.content();
  const $ = load(html);

  console.log('📸 이미지 관련 요소 검색:\n');

  // 모든 리뷰 관련 이미지 찾기
  const imageSelectors = [
    '.review img',
    '.comment img',
    '.rvw img',
    '[class*="review"] img',
    '[class*="comment"] img',
    '.photo-review img',
    '.user-photo img',
    'img[src*="review"]',
    'img[data-src*="review"]',
  ];

  for (const selector of imageSelectors) {
    const images = $(selector);
    if (images.length > 0) {
      console.log(`✅ ${selector}: ${images.length}개`);
      images.slice(0, 3).each((_, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src) console.log(`   - ${src.slice(0, 100)}`);
      });
    }
  }

  // 페이지 내 모든 이미지 분석
  console.log('\n📷 페이지 내 모든 이미지 URL 패턴:\n');
  const allImgUrls = new Set<string>();
  $('img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
    if (src && !src.includes('icon') && !src.includes('btn') && !src.includes('logo')) {
      // 도메인만 추출
      try {
        const urlObj = new URL(src.startsWith('//') ? 'https:' + src : src);
        allImgUrls.add(urlObj.hostname);
      } catch {
        // URL 파싱 실패
      }
    }
  });
  console.log('이미지 도메인들:', [...allImgUrls].join(', '));

  // 리뷰 HTML 구조 분석
  console.log('\n📝 리뷰 관련 HTML 클래스/ID:\n');
  const reviewClasses: string[] = [];
  $('[class*="review"], [class*="comment"], [class*="rvw"], [id*="review"]').each((i, el) => {
    if (i < 10) {
      const className = $(el).attr('class') || $(el).attr('id');
      if (className && !reviewClasses.includes(className)) {
        reviewClasses.push(className);
        console.log(`   ${el.tagName}: ${className}`);
      }
    }
  });
}

// =====================================================
// 2. 필터 데이터 추출 테스트
// =====================================================

async function testFilterExtraction(page: Page, categoryCode: string): Promise<FilterGroup[]> {
  console.log('\n\n=== 2. 필터 데이터 추출 테스트 ===\n');

  const url = `https://www.enuri.com/list.jsp?cate=${categoryCode}&tabType=1`;
  console.log(`URL: ${url}\n`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

  // 필터 영역이 로드될 때까지 대기
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 필터 펼치기 버튼 클릭 (접혀있는 경우)
  await page.evaluate(() => {
    const expandBtns = document.querySelectorAll('[class*="more"], [class*="expand"], .btn_more, .btn_expand');
    expandBtns.forEach(btn => {
      (btn as HTMLElement).click();
    });
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  const html = await page.content();
  const $ = load(html);
  const filters: FilterGroup[] = [];

  console.log('🔍 필터 영역 분석:\n');

  // JavaScript 변수에서 필터 데이터 추출
  const scripts = $('script').text();

  // 여러 패턴으로 필터 데이터 찾기
  const patterns = [
    { name: 'brandAttrList', regex: /brandAttrList\s*=\s*(\[[\s\S]*?\]);?\s*(?:var|\/\/|$)/m },
    { name: 'factoryAttrList', regex: /factoryAttrList\s*=\s*(\[[\s\S]*?\]);?\s*(?:var|\/\/|$)/m },
    { name: 'attrGrpList', regex: /attrGrpList\s*=\s*(\[[\s\S]*?\]);?\s*(?:var|\/\/|$)/m },
  ];

  for (const p of patterns) {
    const match = scripts.match(p.regex);
    if (match && match[1] && match[1].length > 5) {
      console.log(`✅ ${p.name} 발견! (길이: ${match[1].length})`);
      console.log(`   미리보기: ${match[1].slice(0, 200)}...`);
    }
  }

  // HTML에서 직접 필터 추출
  console.log('\n📋 HTML 필터 요소:\n');

  // 체크박스/라디오 기반 필터
  $('input[type="checkbox"][name], input[type="radio"][name]').each((i, el) => {
    if (i >= 20) return;
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    const label = $(el).closest('label').text().trim() || $(el).next('label').text().trim();
    if (name && value && !name.includes('undefined')) {
      console.log(`   [${name}] ${value}: ${label.slice(0, 30)}`);
    }
  });

  // 필터 그룹 추출 시도
  console.log('\n📁 필터 그룹 구조:\n');

  // dt/dd 기반 필터
  $('dl.filter-group, .attr-group dl, [class*="filter"] dl').each((_, dl) => {
    const groupName = $(dl).find('dt').first().text().trim();
    const options: FilterOption[] = [];

    $(dl).find('dd li, dd label, dd a').each((_, opt) => {
      const optName = $(opt).text().trim();
      if (optName && optName.length < 50) {
        options.push({ name: optName });
      }
    });

    if (groupName && options.length > 0) {
      filters.push({ groupName, options: options.slice(0, 10) });
      console.log(`   ${groupName}: ${options.length}개 옵션`);
    }
  });

  // 리스트 기반 필터
  $('.list-filter-attr ul, .attr-list ul, [class*="brand"] ul').each((_, ul) => {
    const parent = $(ul).parent();
    const groupName = parent.find('.title, .name, dt, h3, h4').first().text().trim() || '(그룹명 없음)';
    const options: FilterOption[] = [];

    $(ul).find('li').each((_, li) => {
      const optName = $(li).text().trim();
      const optValue = $(li).find('input').attr('value') || $(li).find('a').attr('href');
      if (optName && optName.length < 50) {
        options.push({ name: optName, code: optValue });
      }
    });

    if (options.length > 2) {
      filters.push({ groupName, options: options.slice(0, 10) });
      console.log(`   ${groupName}: ${options.length}개 옵션`);
    }
  });

  return filters;
}

// =====================================================
// 3. 실제 리뷰 크롤링 테스트
// =====================================================

async function testActualReviewCrawl(page: Page, modelNo: string): Promise<EnuriReview[]> {
  console.log('\n\n=== 3. 실제 리뷰 크롤링 테스트 ===\n');

  const url = `https://www.enuri.com/detail.jsp?modelno=${modelNo}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

  // 리뷰 영역으로 스크롤
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight / 2);
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 리뷰 탭 클릭 시도
  const tabClicked = await page.evaluate(() => {
    const selectors = [
      'a[href*="review"]',
      '[data-tab="review"]',
      '.tab-review',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        (el as HTMLElement).click();
        return sel;
      }
    }
    // 텍스트로 찾기
    const elements = document.querySelectorAll('a, button, [role="tab"]');
    for (const el of elements) {
      if (el.textContent?.includes('리뷰') || el.textContent?.includes('상품평')) {
        (el as HTMLElement).click();
        return 'text:리뷰';
      }
    }
    return null;
  });
  console.log(`탭 클릭: ${tabClicked || '없음'}`);
  await new Promise(resolve => setTimeout(resolve, 2000));

  const html = await page.content();
  const $ = load(html);
  const reviews: EnuriReview[] = [];

  // 리뷰 아이템 선택자들
  const reviewSelectors = [
    '.review-item',
    '.rvw_item',
    '.comment-item',
    'li[class*="review"]',
    '.user-review',
    '.prod-review-item',
  ];

  console.log('📝 리뷰 아이템 검색:\n');

  for (const selector of reviewSelectors) {
    const items = $(selector);
    if (items.length > 0) {
      console.log(`✅ ${selector}: ${items.length}개 발견`);

      items.slice(0, 5).each((i, el) => {
        const $item = $(el);

        // 별점 추출
        let rating = 5;
        const starEl = $item.find('[class*="star"], [class*="rating"]');
        const starStyle = starEl.attr('style') || '';
        const widthMatch = starStyle.match(/width:\s*(\d+)%/);
        if (widthMatch) {
          rating = Math.round(parseInt(widthMatch[1], 10) / 20);
        }

        // 내용 추출
        const content = $item.find('.content, .text, .atc, p').first().text().trim();

        // 작성자 추출
        const author = $item.find('.author, .name, .user').first().text().trim();

        // 날짜 추출
        const date = $item.find('.date, .time').first().text().trim();

        // 이미지 추출
        const images: ReviewImage[] = [];
        $item.find('img').each((_, img) => {
          const src = $(img).attr('src') || $(img).attr('data-src');
          if (src && !src.includes('icon') && !src.includes('profile')) {
            images.push({
              thumbnail: src.startsWith('//') ? 'https:' + src : src,
            });
          }
        });

        if (content && content.length > 10) {
          reviews.push({ rating, content: content.slice(0, 200), author, date, images });
          console.log(`   [${i + 1}] ⭐${rating} | 이미지: ${images.length}개`);
          console.log(`       ${content.slice(0, 80)}...`);
          if (images.length > 0) {
            console.log(`       📷 ${images[0].thumbnail.slice(0, 60)}...`);
          }
        }
      });
      break;
    }
  }

  if (reviews.length === 0) {
    console.log('❌ 리뷰 아이템을 찾지 못했습니다.');

    // 디버깅: 페이지 구조 출력
    console.log('\n페이지 내 주요 클래스:');
    const classes = new Set<string>();
    $('[class]').each((i, el) => {
      if (i < 500) {
        const cls = $(el).attr('class');
        if (cls && (cls.includes('review') || cls.includes('comment') || cls.includes('rvw'))) {
          classes.add(cls);
        }
      }
    });
    console.log([...classes].slice(0, 20).join('\n'));
  }

  return reviews;
}

// =====================================================
// 메인 실행
// =====================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     에누리 Puppeteer 리뷰 + 필터 크롤링 테스트           ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const browser = await createBrowser();
  const page = await browser.newPage();

  // User-Agent 설정
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // 불필요한 리소스 차단
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['stylesheet', 'font'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    const testModelNo = '46256330'; // 순성 빌리 카시트 (리뷰 1352개)
    const testCategoryCode = '10040201'; // 일체형 카시트

    // 1. 리뷰 이미지 테스트
    await testReviewImages(page, testModelNo);

    // 2. 필터 데이터 테스트
    const filters = await testFilterExtraction(page, testCategoryCode);
    console.log(`\n추출된 필터 그룹: ${filters.length}개`);

    // 3. 실제 리뷰 크롤링 테스트
    const reviews = await testActualReviewCrawl(page, testModelNo);
    console.log(`\n추출된 리뷰: ${reviews.length}개`);
    console.log(`이미지 포함 리뷰: ${reviews.filter(r => r.images.length > 0).length}개`);

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    await browser.close();
    console.log('\n✅ 테스트 완료');
  }
}

main().catch(console.error);
