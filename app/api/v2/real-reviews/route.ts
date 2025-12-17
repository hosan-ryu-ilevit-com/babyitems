import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import ogs from 'open-graph-scraper';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface OGMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface SourceWithOG {
  title: string;
  uri: string;
  og?: OGMetadata;
}

interface SearchResult {
  text: string;
  sources: Array<{ title: string; uri: string }>;
}

// URL에서 사이트 정보 추출 (fallback용)
function extractSiteInfo(url: string): { siteName: string; favicon: string; isNaver: boolean } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // Google Favicon API
    const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    
    // 사이트별 이름 매핑
    const siteNameMap: Record<string, string> = {
      'blog.naver.com': '네이버 블로그',
      'cafe.naver.com': '네이버 카페',
      'post.naver.com': '네이버 포스트',
      'coupang.com': '쿠팡',
      '11st.co.kr': '11번가',
      'gmarket.co.kr': 'G마켓',
      'auction.co.kr': '옥션',
      'danawa.com': '다나와',
      'enuri.com': '에누리',
      'youtube.com': '유튜브',
      'tistory.com': '티스토리',
    };
    
    const siteName = Object.entries(siteNameMap).find(([domain]) => 
      hostname.includes(domain)
    )?.[1] || hostname;
    
    const isNaver = hostname.includes('naver.com');
    
    return { siteName, favicon, isNaver };
  } catch {
    return { siteName: '출처', favicon: '', isNaver: false };
  }
}

// OpenGraph 메타데이터 fetch (with fallback)
async function fetchOGMetadata(url: string): Promise<OGMetadata | null> {
  const siteInfo = extractSiteInfo(url);
  
  try {
    const { result } = await ogs({
      url,
      timeout: 5000,  // timeout 늘림
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      },
    });

    if (!result.success) {
      // OG 실패 시 fallback 정보 반환
      return {
        siteName: siteInfo.siteName,
        image: siteInfo.favicon,
      };
    }

    const og: OGMetadata = {};
    if (result.ogTitle) og.title = result.ogTitle;
    if (result.ogDescription) og.description = result.ogDescription.slice(0, 150);
    if (result.ogImage && result.ogImage.length > 0) {
      og.image = result.ogImage[0].url;
    } else {
      // OG 이미지 없으면 favicon 사용
      og.image = siteInfo.favicon;
    }
    if (result.ogSiteName) {
      og.siteName = result.ogSiteName;
    } else {
      og.siteName = siteInfo.siteName;
    }

    return og;
  } catch (error) {
    console.warn(`[OG fetch] Failed for ${url}, using fallback:`, error);
    // 실패해도 fallback 정보 반환
    return {
      siteName: siteInfo.siteName,
      image: siteInfo.favicon,
    };
  }
}

// vertexaisearch URL을 실제 URL로 변환
async function resolveVertexAISearchUrl(url: string): Promise<string> {
  // vertexaisearch URL이 아니면 그대로 반환
  if (!url.includes('vertexaisearch.cloud.google.com')) {
    return url;
  }

  try {
    // HEAD 요청으로 리다이렉트 따라가기
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    // 최종 URL 반환
    if (response.url && response.url !== url) {
      console.log(`[URL Resolve] ${url.slice(0, 50)}... -> ${response.url.slice(0, 50)}...`);
      return response.url;
    }
  } catch (error) {
    console.warn(`[URL Resolve] Failed for ${url}:`, error);
  }

  return url;
}

// 여러 URL의 실제 URL 변환 (병렬)
async function resolveAllUrls(sources: Array<{ title: string; uri: string }>): Promise<Array<{ title: string; uri: string }>> {
  const results = await Promise.allSettled(
    sources.map(async (source) => ({
      ...source,
      uri: await resolveVertexAISearchUrl(source.uri),
    }))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return sources[i];
  });
}

// 여러 URL의 OG 메타데이터를 병렬로 fetch
async function fetchAllOGMetadata(sources: Array<{ title: string; uri: string }>): Promise<SourceWithOG[]> {
  // 먼저 vertexaisearch URL들을 실제 URL로 변환
  const resolvedSources = await resolveAllUrls(sources);

  const results = await Promise.allSettled(
    resolvedSources.map(async (source) => {
      const og = await fetchOGMetadata(source.uri);
      return { ...source, og: og || undefined };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return { ...resolvedSources[i], og: undefined };
  });
}

// 단일 검색 쿼리 실행
async function searchWithGrounding(query: string): Promise<SearchResult> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
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

// 병렬 검색 실행 (여러 키워드 동시 검색)
async function parallelSearch(productTitle: string): Promise<{ results: SearchResult[]; elapsed: number }> {
  const startTime = Date.now();

  // 병렬로 실행할 검색 쿼리들
  const searchQueries = [
    // 1. 네이버 블로그 내돈내산 (최우선)
    `site:blog.naver.com "${productTitle}" 내돈내산 후기 장단점
    
이 제품의 실제 구매 후기에서 장점과 단점을 찾아주세요.
- 출처에서 직접 인용한 내용만 작성
- 구체적인 사용 경험 (수치, 비교, 체감) 포함
- 장점 1-3개, 단점 1-3개
- 없으면 해당 섹션 생략`,

    // 2. 네이버 블로그 솔직후기
    `site:blog.naver.com "${productTitle}" 솔직후기 실사용

이 제품의 실제 사용 경험을 찾아주세요.
- 한달 이상 사용 후기 우선
- 장점: 구체적인 만족 포인트
- 단점: 구체적인 불만 사항
- 출처에서 직접 확인된 내용만`,

    // 3. 쇼핑몰 리뷰 (쿠팡, 11번가)
    `"${productTitle}" 쿠팡 리뷰 장단점 OR 11번가 후기

쇼핑몰 실구매 리뷰에서 장단점을 찾아주세요.
- 별점 3-4점 리뷰 (균형잡힌 의견)
- 구체적인 사용 경험만
- 광고/협찬 글 제외`,
  ];

  // 병렬 실행
  const results = await Promise.allSettled(
    searchQueries.map(query => searchWithGrounding(query))
  );

  const successResults = results
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .map(r => r.value);

  const elapsed = Date.now() - startTime;
  console.log(`[Parallel Search] ${successResults.length}/${searchQueries.length} succeeded in ${elapsed}ms`);

  return { results: successResults, elapsed };
}

// 결과 종합 (중복 제거 + 합성)
async function synthesizeResults(
  productTitle: string,
  searchResults: SearchResult[]
): Promise<{ content: string; sources: Array<{ title: string; uri: string }> }> {
  // 모든 소스 합치기 (중복 제거)
  const allSources = new Map<string, { title: string; uri: string }>();
  const allTexts: string[] = [];

  for (const result of searchResults) {
    if (result.text) {
      allTexts.push(result.text);
    }
    for (const source of result.sources) {
      if (source.uri && !allSources.has(source.uri)) {
        allSources.set(source.uri, source);
      }
    }
  }

  // 텍스트가 없으면 빈 결과
  if (allTexts.length === 0) {
    return { content: '', sources: [] };
  }

  // 종합 프롬프트 (빠른 합성)
  const synthesisPrompt = `아래는 "${productTitle}" 제품의 여러 후기 검색 결과입니다.
이를 종합하여 장단점을 정리해주세요.

[검색 결과들]
${allTexts.join('\n\n---\n\n')}

[출력 형식]
## 장점
- 구체적인 장점 1 (여러 후기에서 공통으로 언급된 것 우선)
- 구체적인 장점 2
- 구체적인 장점 3 (최대)

## 단점
- 구체적인 단점 1
- 구체적인 단점 2
- 구체적인 단점 3 (최대)

[규칙]
1. 검색 결과에서 직접 인용된 내용만 사용
2. 중복된 내용은 하나로 합치기
3. 구체적인 수치/체감 표현 유지
4. 없으면 해당 섹션 생략`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: synthesisPrompt,
    config: {
      temperature: 0.1,
    },
  });

  // 출처 검증: 제품과 관련 없는 링크 필터링
  const allSourcesList = Array.from(allSources.values());
  const filteredSources = await filterRelevantSources(productTitle, allSourcesList);

  return {
    content: response.text || '',
    sources: filteredSources,
  };
}

// 출처 관련성 검증 (flash-lite로 제품과 무관한 링크 제거)
async function filterRelevantSources(
  productTitle: string,
  sources: Array<{ title: string; uri: string }>
): Promise<Array<{ title: string; uri: string }>> {
  if (sources.length === 0) return [];

  // 출처가 3개 이하면 검증 없이 반환 (비용 절감)
  if (sources.length <= 3) return sources;

  try {
    const sourceList = sources.map((s, i) => 
      `${i + 1}. 제목: "${s.title || '제목없음'}" / URL: ${s.uri}`
    ).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: `제품명: "${productTitle}"

아래 출처 목록 중에서 이 제품의 실제 후기/리뷰와 관련 있는 것만 선별해주세요.

[출처 목록]
${sourceList}

[판단 기준]
- ✅ 유지: 제품명 또는 브랜드가 제목에 포함된 경우
- ✅ 유지: 해당 제품 카테고리의 후기/리뷰인 경우
- ❌ 제거: 전혀 다른 제품이나 주제인 경우
- ❌ 제거: 쇼핑몰 메인 페이지나 검색 결과 페이지인 경우
- ❌ 제거: 뉴스 기사나 광고성 컨텐츠인 경우

[출력 형식]
관련 있는 출처의 번호만 쉼표로 구분하여 출력 (예: 1,3,5)
없으면 "없음" 출력`,
      config: {
        temperature: 0.1,
      },
    });

    const resultText = response.text?.trim() || '';
    
    if (resultText === '없음' || resultText === '') {
      console.log('[filterSources] No relevant sources found');
      return [];
    }

    // 번호 파싱 (1,3,5 형식)
    const relevantIndices = resultText
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= sources.length);

    const filteredSources = relevantIndices.map(i => sources[i - 1]).filter(Boolean);
    
    console.log(`[filterSources] ${sources.length} -> ${filteredSources.length} sources (filtered ${sources.length - filteredSources.length})`);
    
    return filteredSources.length > 0 ? filteredSources : sources.slice(0, 3);  // fallback: 상위 3개
  } catch (error) {
    console.warn('[filterSources] Error:', error);
    return sources.slice(0, 5);  // 에러 시 상위 5개만 반환
  }
}

export async function POST(request: NextRequest) {
  try {
    const { productTitle } = await request.json();

    if (!productTitle) {
      return NextResponse.json(
        { success: false, error: 'productTitle is required' },
        { status: 400 }
      );
    }

    const totalStartTime = Date.now();

    // 1. 병렬 검색 실행
    const { results: searchResults, elapsed: searchElapsed } = await parallelSearch(productTitle);
    console.log(`[real-reviews] Parallel search: ${searchElapsed}ms`);

    // 결과가 없으면 early return
    if (searchResults.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          content: `"${productTitle}" 제품에 대한 충분한 실제 후기를 찾지 못했습니다.`,
          sources: [],
          elapsed: searchElapsed,
          lowQuality: true,
        },
      });
    }

    // 2. 결과 종합
    const synthesisStartTime = Date.now();
    const { content, sources } = await synthesizeResults(productTitle, searchResults);
    const synthesisElapsed = Date.now() - synthesisStartTime;
    console.log(`[real-reviews] Synthesis: ${synthesisElapsed}ms`);

    // 3. 품질 검증
    const hasNoContent = content.length < 30;
    const noSubstantiveContent = !content.includes('장점') && !content.includes('단점');

    if (hasNoContent || noSubstantiveContent) {
      console.warn('[real-reviews] Low quality result:', {
        productTitle,
        contentLength: content.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          content: `"${productTitle}" 제품에 대한 충분한 실제 후기를 찾지 못했습니다.`,
          sources: [],
          elapsed: searchElapsed + synthesisElapsed,
          lowQuality: true,
        },
      });
    }

    // 4. 텍스트 정리
    const cleanedContent = content
      .replace(/\s*\[\d+\](\[\d+\])*/g, '')
      .replace(/^#+\s*/gm, '## ')
      .replace(/\*\*장점\*\*/g, '## 장점')
      .replace(/\*\*단점\*\*/g, '## 단점')
      .replace(/### 장점/g, '## 장점')
      .replace(/### 단점/g, '## 단점')
      .trim();

    // 5. OG 메타데이터 fetch (상위 5개, 병렬)
    const topSources = sources.slice(0, 5);
    const sourcesWithOG = await fetchAllOGMetadata(topSources);

    const totalElapsed = Date.now() - totalStartTime;
    console.log(`[real-reviews] ${productTitle}: search=${searchElapsed}ms, synthesis=${synthesisElapsed}ms, total=${totalElapsed}ms, sources=${sourcesWithOG.length}`);

    return NextResponse.json({
      success: true,
      data: {
        content: cleanedContent,
        sources: sourcesWithOG,
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
