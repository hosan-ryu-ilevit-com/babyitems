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
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,  // 더 낮춰서 hallucination 방지
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

// 2차 처리: 포맷 정리 (인용 번호 제거)
async function cleanupFormatting(rawText: string): Promise<string> {
  // 인용 번호 제거 [1], [2], [1][2] 등
  const textWithoutCitations = rawText.replace(/\s*\[\d+\](\[\d+\])*/g, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `아래 텍스트를 정리해주세요.

[필수 규칙]
1. ## 장점, ## 단점 섹션만 유지 (내용 없으면 해당 섹션 생략)
2. 각 항목은 "- 구체적 내용" 형식
3. 장점 최대 3개, 단점 최대 3개
4. 서론/맺음말 제거, 원본 내용 유지
5. 원본에 없는 내용 추가 금지
6. 구체적인 수치/체감 표현은 반드시 유지

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

    // 1차: 검색 + 정보 수집 (구체적인 내용 + 정확한 출처)
    const result = await searchWithGrounding(
      `"${productTitle}" 제품의 실제 구매 후기를 검색하세요.

[필수 규칙]
1. 검색 결과에서 **직접 인용**한 내용만 작성 (추론/추측 절대 금지)
2. 후기에서 찾을 수 없는 내용은 작성하지 마세요
3. 구체적인 사용 경험을 포함해주세요

[검색 대상]
- 네이버 블로그/카페 "내돈내산", "솔직후기", "실사용"
- 쿠팡/11번가 실구매 리뷰
- 광고/협찬 글 제외

[출력 형식]
## 장점
- 구체적인 장점 (예: "무게가 5kg으로 가벼워 휴대 편리", "온도 유지력 8시간 이상")
- 실제 사용 경험 기반으로 작성

## 단점  
- 구체적인 단점 (예: "AS 응대 느림", "버튼 조작감 뻑뻑함")
- 실제 사용 경험 기반으로 작성

각 항목은 구체적으로 작성 (수치, 비교, 체감 포함). 장점 1-3개, 단점 1-3개.
후기에서 장점이나 단점을 찾을 수 없으면 해당 섹션 생략.`
    );

    const searchElapsed = Date.now() - startTime;

    // Validation: 결과 품질 체크 (간결한 출력에 맞게 기준 조정)
    const hasNoSources = result.sources.length === 0;
    const textTooShort = result.text.length < 50;  // 간결한 출력이므로 기준 완화
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
