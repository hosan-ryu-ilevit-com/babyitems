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

// OpenGraph 메타데이터 fetch (open-graph-scraper 사용)
async function fetchOGMetadata(url: string): Promise<OGMetadata | null> {
  try {
    const { result } = await ogs({
      url,
      timeout: 3000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    });

    if (!result.success) return null;

    const og: OGMetadata = {};
    if (result.ogTitle) og.title = result.ogTitle;
    if (result.ogDescription) og.description = result.ogDescription.slice(0, 150);
    if (result.ogImage && result.ogImage.length > 0) {
      og.image = result.ogImage[0].url;
    }
    if (result.ogSiteName) og.siteName = result.ogSiteName;

    return Object.keys(og).length > 0 ? og : null;
  } catch (error) {
    console.warn(`[OG fetch] Failed for ${url}:`, error);
    return null;
  }
}

// 여러 URL의 OG 메타데이터를 병렬로 fetch
async function fetchAllOGMetadata(sources: Array<{ title: string; uri: string }>): Promise<SourceWithOG[]> {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const og = await fetchOGMetadata(source.uri);
      return { ...source, og: og || undefined };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return { ...sources[i], og: undefined };
  });
}

async function searchWithGrounding(prompt: string): Promise<SearchResult> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
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

// 2차 처리: 포맷팅 정리 (인용 번호 제거) - lite 모델로 충분
async function cleanupFormatting(rawText: string): Promise<string> {
  // 먼저 기존 인용 번호 제거 [1], [2], [1][2] 등
  const textWithoutCitations = rawText.replace(/\s*\[\d+\](\[\d+\])*/g, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `아래 텍스트를 깔끔한 마크다운 형식으로 정리해주세요.

규칙:
1. 반드시 ## 장점, ## 단점 2개 섹션만 (추천대상/비추천대상 제외)
2. 각 항목은 "- **핵심 키워드**: 설명" 형식 (볼드는 2-3단어 핵심만)
3. 장단점 각각 2-4개만 (공통적으로 많이 언급된 것만)
4. [1], [2] 등 인용 번호는 모두 제거 (출처는 별도 표시됨)
5. 서론/맺음말 없이 바로 ## 장점부터 시작
6. 줄바꿈 최소화

원본:
${textWithoutCitations}`,
    config: {
      temperature: 0.1,
    },
  });

  return response.text || textWithoutCitations;
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

    const startTime = Date.now();

    // 1차: 검색 + 정보 수집 (내돈내산 우선, 할루시네이션 방지 프롬프트)
    const result = await searchWithGrounding(
      `"${productTitle}" 제품의 실제 사용자 후기를 검색해주세요.

[중요 규칙]
- 검색된 출처에 명시적으로 작성된 내용만 사용하세요
- 추론, 추측, 일반화 절대 금지
- 출처에서 직접 인용하거나 요약만 허용
- 확인되지 않은 내용은 절대 작성하지 마세요

[검색 우선순위]
1. 네이버 블로그/카페의 "내돈내산", "솔직후기", "실사용" 후기 (가장 중요!)
2. 쿠팡/11번가/G마켓 등 쇼핑몰의 실구매 리뷰
3. 다나와/에누리 사용자 리뷰
※ 광고성/협찬 글 제외, 실제 구매 후기만. 최근 1년 이내 작성된 후기 우선.

## 장점
여러 "내돈내산" 후기에서 공통적으로 언급된 장점 (2-4개)
- 출처에 명시된 구체적인 사용 경험만 작성

## 단점
여러 "내돈내산" 후기에서 공통적으로 언급된 단점 (2-4개)
- 출처에 명시된 구체적인 불만사항만 작성`
    );

    const searchElapsed = Date.now() - startTime;

    // Validation: 결과 품질 체크
    const hasNoSources = result.sources.length === 0;
    const textTooShort = result.text.length < 100;
    const noSubstantiveContent = !result.text.includes('장점') && !result.text.includes('단점');

    // 결과가 없거나 품질이 낮은 경우
    if (hasNoSources || textTooShort || noSubstantiveContent) {
      console.warn('[real-reviews API] Low quality result:', {
        productTitle,
        sourcesCount: result.sources.length,
        textLength: result.text.length,
        hasRequiredSections: !noSubstantiveContent,
      });

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

    // 2차: 포맷팅 정리 + OG 메타데이터 fetch (병렬 실행)
    const [cleanedText, sourcesWithOG] = await Promise.all([
      cleanupFormatting(result.text),
      fetchAllOGMetadata(result.sources),
    ]);

    const totalElapsed = Date.now() - startTime;
    console.log(`[real-reviews API] ${productTitle}: search=${searchElapsed}ms, total=${totalElapsed}ms`);

    return NextResponse.json({
      success: true,
      data: {
        content: cleanedText,
        sources: sourcesWithOG,
        elapsed: totalElapsed,
        lowQuality: false,
      },
    });
  } catch (error) {
    console.error('[real-reviews API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
