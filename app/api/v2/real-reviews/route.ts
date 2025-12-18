import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ============================================================================
// Types
// ============================================================================

interface RealReviewsRequest {
  productTitle: string;
  brand?: string;
  pcode?: string;
}

interface SearchResult {
  text: string;
  sources: Array<{ title: string; uri: string }>;
}

interface SourceInfo {
  title: string;
  uri: string;
  siteName: string;
  favicon: string;
  ogImage?: string;
}

// ============================================================================
// Search Query Templates
// ============================================================================

const SEARCH_TEMPLATES = {
  // 1. 블로그/커뮤니티 후기 (네이버 블로그 + 티스토리 + 맘카페 등)
  blogReview: (searchTerm: string) => `"${searchTerm}" 후기 (내돈내산 OR 솔직후기 OR 실사용)

이 제품의 실제 구매 후기에서 장점과 단점을 찾아주세요.
- 블로그(blog.naver.com), 카페(cafe.naver.com), 커뮤니티 후기 모두 포함
- 실제 사용자가 직접 구매하여 작성한 후기만. [내돈내산] 키워드 우선
- 구체적인 사용 경험 (수치, 비교, 체감) 우선`,

  // 2. 유튜브/영상 리뷰
  videoReview: (searchTerm: string) => `"${searchTerm}" (리뷰 OR 후기 OR 언박싱) site:youtube.com

이 제품의 영상 리뷰에서 장단점을 찾아주세요.
- 실제 사용 후기 영상
- 구체적인 장단점 언급`,

  // 3. 쇼핑몰 + 커뮤니티 리뷰
  generalReview: (searchTerm: string) => `"${searchTerm}" 장단점 (쿠팡 OR 네이버 OR 뽐뿌 OR 클리앙 OR 맘카페)

실구매자 리뷰에서 장단점을 찾아주세요.
- 쇼핑몰 리뷰, 커뮤니티 후기 모두 포함
- 구체적인 사용 경험만`,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * URL에서 사이트 정보 추출
 */
function extractSiteInfo(url: string): { siteName: string; favicon: string } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');

    const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

    const siteNameMap: Record<string, string> = {
      // 블로그
      'blog.naver.com': '네이버 블로그',
      'post.naver.com': '네이버 포스트',
      'tistory.com': '티스토리',
      'brunch.co.kr': '브런치',
      // 카페/커뮤니티
      'cafe.naver.com': '네이버 카페',
      'ppomppu.co.kr': '뽐뿌',
      'clien.net': '클리앙',
      'ruliweb.com': '루리웹',
      'dcinside.com': 'DC인사이드',
      'theqoo.net': '더쿠',
      'fmkorea.com': 'FM코리아',
      // 쇼핑몰
      'shopping.naver.com': '네이버쇼핑',
      'coupang.com': '쿠팡',
      '11st.co.kr': '11번가',
      'gmarket.co.kr': 'G마켓',
      'auction.co.kr': '옥션',
      'danawa.com': '다나와',
      'enuri.com': '에누리',
      // 영상
      'youtube.com': '유튜브',
      'youtu.be': '유튜브',
    };

    const siteName = Object.entries(siteNameMap).find(([domain]) =>
      hostname.includes(domain)
    )?.[1] || hostname;

    return { siteName, favicon };
  } catch {
    return { siteName: '출처', favicon: '' };
  }
}

/**
 * vertexaisearch URL을 실제 URL로 변환
 */
async function resolveVertexUrl(url: string): Promise<string> {
  if (!url.includes('vertexaisearch.cloud.google.com')) {
    return url;
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (response.url && response.url !== url) {
      return response.url;
    }
  } catch (error) {
    console.warn(`[URL Resolve] Failed:`, error);
  }

  return url;
}

/**
 * 제품명에서 세부 사양 제거 (용량, 색상, 사이즈 등)
 */
function simplifyProductTitle(title: string): string {
  return title
    // 용량 제거: 1.2L, 800ml, 600ML, 1L 등
    .replace(/\s*\d+(\.\d+)?\s*(ml|l|리터|㎖|ℓ)(?:\s|$)/gi, ' ')
    // 색상 제거: 화이트, 블랙, 핑크, 그레이, White 등 (한글 word boundary 대신 공백/끝 확인)
    .replace(/\s+(화이트|블랙|핑크|그레이|아이보리|베이지|블루|레드|그린|옐로우|실버|골드|브라운|네이비)(?:\s|$)/gi, ' ')
    // 영문 색상 제거 (word boundary 사용 가능)
    .replace(/\s+(white|black|pink|gray|grey|ivory|beige|blue|red|green|yellow|silver|gold|brown|navy)\b/gi, ' ')
    // 사이즈/규격 제거: (대), [소], 대용량, 미니 등
    .replace(/\s*[\(\[](대|중|소|특대|미니)[\)\]]/g, '')
    // 버전/세대 제거: 2세대, 3rd, v2 등
    .replace(/\s*\d+(세대|nd|rd|th|st)\b/gi, '')
    .replace(/\s*v\d+\b/gi, '')
    // 연속 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 검색어 변형 생성 (다양한 형태로 검색)
 */
function buildSearchTermVariations(productTitle: string, brand?: string): string[] {
  const variations: string[] = [];
  const seen = new Set<string>();

  const addVariation = (term: string) => {
    const normalized = term.toLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      variations.push(term.trim());
    }
  };

  // 1. 풀 타이틀
  addVariation(productTitle);

  // 2. 간소화된 타이틀 (용량, 색상 등 제거)
  const simplified = simplifyProductTitle(productTitle);
  if (simplified !== productTitle) {
    addVariation(simplified);
  }

  // 3. 브랜드 + 간소화된 타이틀 (브랜드가 간소화된 타이틀에 없는 경우만)
  if (brand && simplified && !simplified.toLowerCase().includes(brand.toLowerCase())) {
    addVariation(`${brand} ${simplified}`);
  }

  // 4. 핵심 키워드만 (브랜드 + 모델명 추정)
  // 타이틀에서 첫 2-3단어만 추출
  const words = productTitle.split(/\s+/).slice(0, 3).join(' ');
  if (words !== productTitle && words !== simplified && words.length > 5) {
    addVariation(words);
  }

  return variations.slice(0, 3); // 최대 3개 변형만 사용
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 단일 검색 쿼리 실행 (Gemini + Google Search Grounding)
 */
async function searchWithGrounding(query: string): Promise<SearchResult> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
    },
  });

  const metadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = metadata?.groundingChunks || [];

  return {
    text: response.text || '',
    sources: chunks.map((c: { web?: { title?: string; uri?: string } }) => ({
      title: c.web?.title || '',
      uri: c.web?.uri || '',
    })),
  };
}

/**
 * 병렬 검색 실행 (다양한 검색어 변형으로 검색)
 */
async function parallelSearch(
  searchTermVariations: string[]
): Promise<{ results: SearchResult[]; elapsed: number }> {
  const startTime = Date.now();

  // 각 검색어 변형에 대해 다른 템플릿 적용
  // 변형1: 블로그/커뮤니티, 변형2: 유튜브, 변형3: 일반
  const queries: string[] = [];

  // 첫 번째 변형 (가장 정확한 타이틀)으로 모든 템플릿 검색
  const primaryTerm = searchTermVariations[0];
  queries.push(SEARCH_TEMPLATES.blogReview(primaryTerm));
  queries.push(SEARCH_TEMPLATES.videoReview(primaryTerm));

  // 간소화된 변형으로 일반 검색 (더 넓은 범위)
  const simplifiedTerm = searchTermVariations[searchTermVariations.length - 1];
  queries.push(SEARCH_TEMPLATES.generalReview(simplifiedTerm));

  // 중간 변형이 있으면 추가 블로그 검색
  if (searchTermVariations.length > 1 && searchTermVariations[1] !== primaryTerm) {
    queries.push(SEARCH_TEMPLATES.blogReview(searchTermVariations[1]));
  }

  console.log(`[Search] Terms: ${searchTermVariations.join(' | ')}`);

  const results = await Promise.allSettled(
    queries.map(query => searchWithGrounding(query))
  );

  const successResults = results
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .map(r => r.value);

  const elapsed = Date.now() - startTime;
  console.log(`[Search] ${successResults.length}/${queries.length} in ${elapsed}ms`);

  return { results: successResults, elapsed };
}

/**
 * 출처 필터링 (관련성 검증) - OG 메타데이터로 2차 검증
 */
async function filterRelevantSources(
  productTitle: string,
  brand: string | undefined,
  sources: Array<{ title: string; uri: string }>
): Promise<Array<{ title: string; uri: string; ogTitle?: string; ogImage?: string }>> {
  if (sources.length === 0) return [];

  // 1. URL 해석 + OG 메타데이터 병렬 fetch (ogTitle + ogImage 모두)
  const resolvedSources = await Promise.all(
    sources.map(async (s) => {
      const resolvedUri = await resolveVertexUrl(s.uri);
      const ogData = await fetchOgMetadata(resolvedUri);
      return {
        ...s,
        uri: resolvedUri,
        ogTitle: ogData.ogTitle,
        ogImage: ogData.ogImage,
      };
    })
  );

  // 2. LLM 필터링 (OG 타이틀 포함하여 더 정확한 판단)
  try {
    const sourceList = resolvedSources.map((s, i) => {
      const displayTitle = s.ogTitle || s.title || '제목없음';
      return `${i + 1}. "${displayTitle}"`;
    }).join('\n');

    const brandInfo = brand ? ` (브랜드: ${brand})` : '';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `[작업] 출처 필터링

[검색한 제품]
"${productTitle}"${brandInfo}

[출처 목록]
${sourceList}

[엄격한 필터링 규칙]
✅ 유지 조건 (모두 충족해야 함):
- 제목에 검색 제품명 또는 브랜드가 명확히 포함됨
- 실제 사용 후기/리뷰 글임

❌ 반드시 제거:
- 다른 브랜드 제품 후기 (예: "레벤호프" 검색 시 "키친아트", "라팔", "브린" 등 다른 브랜드 글)
- 다른 모델 후기 (예: "캔디 전기포트" 검색 시 "미니포트", "케틀" 등)
- 쇼핑몰 검색/목록 페이지
- 뉴스/광고/협찬 콘텐츠
- 제품 비교글 (여러 제품 나열)

[출력]
정확히 일치하는 출처 번호만 쉼표로 출력.
확실하지 않으면 제외.
해당 없으면 "없음"`,
      config: { temperature: 0.0 },
    });

    const resultText = response.text?.trim() || '';
    console.log(`[Filter] LLM response: "${resultText}"`);

    if (resultText === '없음' || resultText === '') {
      console.log('[Filter] No relevant sources found');
      return [];
    }

    const indices = resultText
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= resolvedSources.length);

    const filtered = indices.map(i => resolvedSources[i - 1]).filter(Boolean);
    console.log(`[Filter] ${sources.length} -> ${filtered.length} sources`);

    return filtered;
  } catch (error) {
    console.warn('[Filter] Error:', error);
    return [];
  }
}

/**
 * 결과 합성 (유효한 출처 기반, 두괄식 포맷)
 * validSourceTitles: 필터링된 유효 출처 제목들 - 이 출처에서 나온 정보만 사용하도록 지시
 */
async function synthesizeResultsWithValidSources(
  productTitle: string,
  searchResults: SearchResult[],
  validSourceTitles: string[]
): Promise<string> {
  const allTexts = searchResults
    .map(r => r.text)
    .filter(Boolean);

  if (allTexts.length === 0) {
    return '';
  }

  const validSourcesInfo = validSourceTitles.length > 0
    ? `\n\n[유효한 출처 - 이 글들의 정보만 사용하세요]\n${validSourceTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}`
    : '';

  const enhancedPrompt = `
아래는 "${productTitle}" 제품의 여러 후기 검색 결과입니다.
이를 종합하여 장단점을 정리해주세요.
${validSourcesInfo}

[중요 규칙]
- 위 유효한 출처에서 언급된 내용만 사용하세요
- 다른 제품/브랜드에 대한 내용은 절대 포함하지 마세요
- "${productTitle}"에 대한 후기만 정리하세요

[검색 결과들]
${allTexts.join('\n\n---\n\n')}

[출력 형식 - 반드시 따라주세요]
## 장점
- **핵심 요약**: 구체적인 설명과 근거
- **핵심 요약**: 구체적인 설명과 근거

## 단점
- **핵심 요약**: 구체적인 설명과 근거
- **핵심 요약**: 구체적인 설명과 근거

[형식 예시]
## 장점
- **온도 정확도 높음**: 설정 온도와 실제 온도 오차가 1도 이내로, 분유 타기에 적합해요
- **세척이 편리함**: 입구가 넓고 분리가 쉬워서 매일 세척해도 부담이 없어요

## 단점
- **용량이 아쉬움**: 600ml라 하루에 여러 번 물을 채워야 해요

[규칙]
1. 각 항목은 반드시 "**핵심 요약**: 상세 설명" 형식으로 작성
2. 핵심 요약은 5-10자 이내로 간결하게
3. 상세 설명은 구체적인 수치, 비교, 체감 표현 포함
4. 유효한 출처에서 확인된 내용만 사용
5. 다른 제품 정보는 절대 포함하지 않음
6. 장점/단점 각각 최대 4개
7. 내용이 없으면 해당 섹션 생략
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: enhancedPrompt,
    config: { temperature: 0.1 },
  });

  return response.text || '';
}

/**
 * 콘텐츠 후처리 (정리 + 검증)
 */
function cleanContent(content: string): string {
  return content
    // 인용 번호 제거
    .replace(/\s*\[\d+\](\[\d+\])*/g, '')
    // 헤딩 정규화
    .replace(/^#+\s*/gm, '## ')
    .replace(/\*\*장점\*\*/g, '## 장점')
    .replace(/\*\*단점\*\*/g, '## 단점')
    .replace(/### 장점/g, '## 장점')
    .replace(/### 단점/g, '## 단점')
    // 빈 줄 정리
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * OG 메타데이터 가져오기 (title, image)
 * 타임아웃 2초로 제한하여 속도 영향 최소화
 */
async function fetchOgMetadata(url: string): Promise<{ ogTitle?: string; ogImage?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BabyItemBot/1.0)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return {};

    const html = await response.text();

    // OG title 추출
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);

    // OG image 추출
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

    // fallback: title 태그
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    return {
      ogTitle: ogTitleMatch?.[1] || titleMatch?.[1]?.trim(),
      ogImage: ogImageMatch?.[1],
    };
  } catch {
    return {};
  }
}

/**
 * 소스 정보 보강 (사이트명, 파비콘 추가) + 중복 제거
 * filterRelevantSources에서 이미 ogTitle, ogImage를 가져왔으므로 재사용
 */
function enrichSources(
  sources: Array<{ title: string; uri: string; ogTitle?: string; ogImage?: string }>
): SourceInfo[] {
  // URL 기반 중복 제거
  const seenUrls = new Set<string>();
  const uniqueSources = sources.filter((source) => {
    // URL 정규화 (trailing slash, query params 등 제거)
    const normalizedUrl = source.uri.split('?')[0].replace(/\/$/, '');
    if (seenUrls.has(normalizedUrl)) {
      return false;
    }
    seenUrls.add(normalizedUrl);
    return true;
  });

  return uniqueSources.slice(0, 4).map((source) => {
    const { siteName, favicon } = extractSiteInfo(source.uri);

    return {
      title: source.ogTitle || source.title || siteName,
      uri: source.uri,
      siteName,
      favicon,
      ogImage: source.ogImage,
    };
  });
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { productTitle, brand, pcode }: RealReviewsRequest = await request.json();

    if (!productTitle) {
      return NextResponse.json(
        { success: false, error: 'productTitle is required' },
        { status: 400 }
      );
    }

    const totalStartTime = Date.now();
    const searchTermVariations = buildSearchTermVariations(productTitle, brand);

    console.log(`[real-reviews] Start: "${productTitle}" -> variations: [${searchTermVariations.join(', ')}] (pcode: ${pcode || 'N/A'})`);

    // 1. 병렬 검색 (다양한 검색어 변형으로)
    const { results: searchResults, elapsed: searchElapsed } = await parallelSearch(searchTermVariations);

    if (searchResults.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          content: '',
          sources: [],
          elapsed: searchElapsed,
          lowQuality: true,
        },
      });
    }

    // 2. 출처 수집
    const allSources = new Map<string, { title: string; uri: string }>();
    for (const result of searchResults) {
      for (const source of result.sources) {
        if (source.uri && !allSources.has(source.uri)) {
          allSources.set(source.uri, source);
        }
      }
    }

    // 3. 출처 먼저 필터링 (유효한 출처 없으면 lowQuality)
    const filteredSources = await filterRelevantSources(
      productTitle,
      brand,
      Array.from(allSources.values())
    );

    if (filteredSources.length === 0) {
      console.log('[real-reviews] No valid sources after filtering');
      return NextResponse.json({
        success: true,
        data: {
          content: '',
          sources: [],
          elapsed: Date.now() - totalStartTime,
          lowQuality: true,
        },
      });
    }

    // 4. 유효한 출처 기반으로 장단점 합성
    // 유효한 출처 제목들을 알려줘서 관련 내용만 추출하도록 함
    const validSourceTitles = filteredSources
      .map(s => s.ogTitle || s.title)
      .filter(Boolean);

    const content = await synthesizeResultsWithValidSources(
      productTitle,
      searchResults,
      validSourceTitles
    );

    // 5. 품질 검증
    const hasNoContent = content.length < 30;
    const noSubstantiveContent = !content.includes('장점') && !content.includes('단점');

    if (hasNoContent || noSubstantiveContent) {
      console.warn('[real-reviews] Low quality content:', { productTitle, len: content.length });
      return NextResponse.json({
        success: true,
        data: {
          content: '',
          sources: [],
          elapsed: Date.now() - totalStartTime,
          lowQuality: true,
        },
      });
    }

    // 6. 후처리
    const cleanedContent = cleanContent(content);
    const enrichedSources = enrichSources(filteredSources);

    const totalElapsed = Date.now() - totalStartTime;
    console.log(`[real-reviews] Done: ${totalElapsed}ms, ${enrichedSources.length} sources`);

    return NextResponse.json({
      success: true,
      data: {
        content: cleanedContent,
        sources: enrichedSources,
        elapsed: totalElapsed,
        lowQuality: false,
      },
    });
  } catch (error) {
    console.error('[real-reviews] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
