'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import type { DirectInputAnalysis, ExpandedKeyword } from '@/types/recommend-v2';

interface DirectInputRequest {
  filterType: 'hard_filter' | 'negative_filter';
  userInput: string;
  category: string;
  categoryName?: string;
  enableExpansion?: boolean;  // 유의어 확장 활성화 (기본: true)
}

// 유의어 확장 API 호출
async function expandKeywords(
  keywords: string[],
  categoryKey: string,
  categoryName?: string
): Promise<Record<string, ExpandedKeyword>> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/v2/expand-keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords, categoryKey, categoryName }),
    });

    if (!res.ok) {
      console.warn('[direct-input] expand-keywords API failed:', res.status);
      return {};
    }

    const data = await res.json();
    return data.data?.expandedKeywords || {};
  } catch (error) {
    console.warn('[direct-input] expand-keywords error:', error);
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DirectInputRequest = await request.json();
    const { filterType, userInput, category, categoryName, enableExpansion = true } = body;

    // 입력 검증
    if (!userInput || userInput.trim().length < 2) {
      return NextResponse.json(
        { error: '입력이 너무 짧습니다.' },
        { status: 400 }
      );
    }

    if (userInput.length > 200) {
      return NextResponse.json(
        { error: '입력이 너무 깁니다. 200자 이내로 입력해주세요.' },
        { status: 400 }
      );
    }

    const isPreference = filterType === 'hard_filter';
    const typeLabel = isPreference ? '선호 조건' : '회피 조건';

    const systemPrompt = `당신은 아기용품 추천 시스템의 키워드 분석 전문가입니다.
사용자가 입력한 ${typeLabel}에서 제품 검색에 사용할 수 있는 키워드를 추출합니다.

## 규칙
1. 사용자 입력에서 제품 특성과 관련된 핵심 키워드를 추출하세요
2. 키워드는 제품 제목이나 리뷰에서 검색될 수 있는 단어여야 합니다
3. 동의어나 유사 표현도 포함하세요 (예: "가벼운" → ["가벼운", "경량", "가볍"])
4. 키워드는 한국어로 추출하세요
5. 최대 5개의 키워드를 추출하세요

## 점수 영향도 결정 (높은 가중치!)
- 매우 구체적인 조건 (브랜드명, 특정 기능, 정확한 스펙): +80 또는 -80
- 구체적인 선호/회피 (소재명, 특정 특성): +60 또는 -60
- 일반적인 선호/회피 (소재 종류, 크기, 특성): +40 또는 -40
- 모호한 조건 (좋은, 괜찮은 등): +20 또는 -20

## 응답 형식 (JSON)
{
  "keywords": ["키워드1", "키워드2", ...],
  "scoreImpact": 20,
  "type": "${isPreference ? 'preference' : 'avoidance'}",
  "reasoning": "분석 이유 (한 문장)"
}`;

    const userPrompt = `카테고리: ${categoryName || category}
사용자 입력 (${typeLabel}): "${userInput}"

위 입력에서 제품 검색용 키워드를 추출하고 점수 영향도를 결정해주세요.`;

    const model = getModel(0.3); // 낮은 temperature로 일관된 결과

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: '네, 키워드 추출 준비가 되었습니다.' }] },
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
      });
      return response.response.text();
    });

    // JSON 파싱
    const analysis = parseJSONResponse<DirectInputAnalysis>(result);

    // 타입 강제 (filterType에 따라)
    analysis.type = isPreference ? 'preference' : 'avoidance';

    // 점수 범위 검증 (±20-80)
    analysis.scoreImpact = Math.min(80, Math.max(20, Math.abs(analysis.scoreImpact)));

    // 키워드 배열 검증
    if (!Array.isArray(analysis.keywords) || analysis.keywords.length === 0) {
      // 키워드 추출 실패 시 원본 입력을 키워드로 사용
      analysis.keywords = userInput.split(/\s+/).filter(w => w.length >= 2).slice(0, 3);
    }

    // 원본 입력 저장
    analysis.originalInput = userInput;

    // 유의어 확장 (enableExpansion이 true인 경우)
    if (enableExpansion && analysis.keywords.length > 0) {
      const expandedKeywords = await expandKeywords(analysis.keywords, category, categoryName);
      if (Object.keys(expandedKeywords).length > 0) {
        analysis.expandedKeywords = expandedKeywords;
        console.log(`[direct-input] Keywords expanded: ${Object.keys(expandedKeywords).join(', ')}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: analysis,
    });

  } catch (error) {
    console.error('Direct input analysis error:', error);

    // 에러 시에도 기본 응답 반환 (graceful degradation)
    const body = await request.clone().json().catch(() => ({})) as DirectInputRequest;
    const fallbackKeywords = (body.userInput || '')
      .split(/\s+/)
      .filter((w: string) => w.length >= 2)
      .slice(0, 3);

    return NextResponse.json({
      success: true,
      data: {
        keywords: fallbackKeywords.length > 0 ? fallbackKeywords : ['기타'],
        scoreImpact: 30,  // 기본값도 상향 (20-80 범위 내)
        type: body.filterType === 'hard_filter' ? 'preference' : 'avoidance',
        reasoning: 'AI 분석 실패, 기본값 사용',
        originalInput: body.userInput,
      } as DirectInputAnalysis,
    });
  }
}
