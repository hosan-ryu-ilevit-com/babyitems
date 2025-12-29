'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

/**
 * 키워드 확장 API - Gemini Flash Lite 사용
 *
 * 사용자의 자연어 입력에서 추출한 키워드를 유의어/스펙 키워드로 확장합니다.
 * 예: "가벼운" → ["경량", "초경량", "라이트", "180g", "200g 이하"]
 */

interface ExpandKeywordsRequest {
  keywords: string[];
  categoryKey: string;
  categoryName?: string;
}

interface ExpandedKeyword {
  original: string;
  synonyms: string[];
  specKeywords: string[];
}

interface ExpandKeywordsResponse {
  expandedKeywords: Record<string, ExpandedKeyword>;
  generated_by: 'flash-lite' | 'fallback';
}

// 간단한 인메모리 캐시 (동일 키워드 재요청 방지)
const keywordCache = new Map<string, ExpandedKeyword>();
const CACHE_TTL = 1000 * 60 * 30; // 30분

function getCacheKey(keyword: string, categoryKey: string): string {
  return `${categoryKey}:${keyword.toLowerCase()}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ExpandKeywordsRequest = await request.json();
    const { keywords, categoryKey, categoryName } = body;

    if (!keywords || keywords.length === 0) {
      return NextResponse.json(
        { error: 'keywords array is required' },
        { status: 400 }
      );
    }

    // 캐시 확인 - 캐시에 있는 키워드는 건너뛰기
    const result: Record<string, ExpandedKeyword> = {};
    const uncachedKeywords: string[] = [];

    for (const keyword of keywords) {
      const cacheKey = getCacheKey(keyword, categoryKey);
      const cached = keywordCache.get(cacheKey);
      if (cached) {
        result[keyword] = cached;
      } else {
        uncachedKeywords.push(keyword);
      }
    }

    // 모든 키워드가 캐시에 있으면 바로 반환
    if (uncachedKeywords.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          expandedKeywords: result,
          generated_by: 'flash-lite',
        } as ExpandKeywordsResponse,
      });
    }

    // LLM으로 확장
    const model = getModel(0.3); // 낮은 temperature로 일관된 결과

    const systemPrompt = `당신은 아기용품 검색 전문가입니다.
사용자가 입력한 키워드를 유의어와 스펙 키워드로 확장해주세요.

## 목표
제품 제목, 스펙, 리뷰에서 검색할 수 있는 다양한 표현을 생성합니다.

## 규칙
1. synonyms: 같은 의미의 한국어 유의어 (최대 5개)
2. specKeywords: 스펙에서 찾을 수 있는 구체적인 값 (최대 5개)
   - 숫자 포함 표현 권장 (예: "100g", "200ml")
   - 카테고리에 맞는 일반적인 스펙 범위 사용
3. 모든 결과는 한국어로

## 카테고리 컨텍스트
- 카테고리: ${categoryName || categoryKey}
- 이 카테고리에서 자주 사용되는 표현을 우선 사용하세요

## 응답 형식 (JSON)
{
  "expandedKeywords": {
    "키워드1": {
      "original": "키워드1",
      "synonyms": ["유의어1", "유의어2", ...],
      "specKeywords": ["스펙1", "스펙2", ...]
    },
    ...
  }
}`;

    const userPrompt = `다음 키워드들을 확장해주세요:
${uncachedKeywords.map((k, i) => `${i + 1}. "${k}"`).join('\n')}`;

    const response = await callGeminiWithRetry(async () => {
      const res = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: '네, 키워드 확장 준비가 되었습니다.' }] },
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
      });
      return res.response.text();
    }, 2, 500);

    const parsed = parseJSONResponse<{ expandedKeywords: Record<string, ExpandedKeyword> }>(response);

    // 결과 병합 및 캐시 저장
    if (parsed.expandedKeywords) {
      for (const [keyword, expanded] of Object.entries(parsed.expandedKeywords)) {
        result[keyword] = expanded;
        // 캐시 저장
        const cacheKey = getCacheKey(keyword, categoryKey);
        keywordCache.set(cacheKey, expanded);
        // TTL 후 캐시 삭제
        setTimeout(() => keywordCache.delete(cacheKey), CACHE_TTL);
      }
    }

    // 확장 실패한 키워드는 기본값으로 처리
    for (const keyword of uncachedKeywords) {
      if (!result[keyword]) {
        result[keyword] = {
          original: keyword,
          synonyms: [keyword],
          specKeywords: [],
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        expandedKeywords: result,
        generated_by: 'flash-lite',
      } as ExpandKeywordsResponse,
    });

  } catch (error) {
    console.error('[expand-keywords] Error:', error);

    // Fallback: 원본 키워드만 반환
    const body = await request.clone().json().catch(() => ({})) as ExpandKeywordsRequest;
    const fallbackResult: Record<string, ExpandedKeyword> = {};

    for (const keyword of body.keywords || []) {
      fallbackResult[keyword] = {
        original: keyword,
        synonyms: [keyword],
        specKeywords: [],
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        expandedKeywords: fallbackResult,
        generated_by: 'fallback',
      } as ExpandKeywordsResponse,
    });
  }
}

/**
 * GET: API 정보
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    info: {
      endpoint: '/api/v2/expand-keywords',
      method: 'POST',
      description: 'Gemini Flash Lite를 사용하여 키워드를 유의어/스펙 키워드로 확장',
      input: {
        keywords: 'string[] (required) - 확장할 키워드 배열',
        categoryKey: 'string (required) - 카테고리 키',
        categoryName: 'string (optional) - 카테고리 이름',
      },
      output: {
        expandedKeywords: 'Record<string, ExpandedKeyword>',
        generated_by: "'flash-lite' | 'fallback'",
      },
    },
  });
}
