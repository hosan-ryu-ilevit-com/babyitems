/**
 * 리뷰 텍스트에서 핵심 문장 추출 API
 * Gemini Flash Lite로 체감속성과 직결되는 문장을 발췌
 */

import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry } from '@/lib/ai/gemini';

interface HighlightRequest {
  reviews: Array<{
    reviewText: string;
    criteriaName: string;
    criteriaId: string;
  }>;
}

interface HighlightResult {
  criteriaId: string;
  originalText: string;
  excerpt: string;  // 발췌된 핵심 문장 (앞뒤 컨텍스트 포함)
}

export async function POST(request: NextRequest) {
  try {
    const body: HighlightRequest = await request.json();
    const { reviews } = body;

    if (!reviews || reviews.length === 0) {
      return NextResponse.json(
        { success: false, error: 'reviews array is required' },
        { status: 400 }
      );
    }

    // 배치로 처리 (여러 리뷰를 한 번에)
    const prompt = `당신은 리뷰에서 특정 속성과 관련된 핵심 문장을 발췌하는 전문가입니다.

각 리뷰에서 지정된 속성과 **직접적으로 관련된 핵심 문장**을 찾아 발췌해주세요.

규칙:
1. 해당 속성과 직결되는 핵심 문장 1-2개를 찾으세요
2. 핵심 문장의 앞뒤로 문장 1개씩 포함해서 자연스럽게 발췌
3. 발췌문 앞뒤에 "..."를 붙여 생략되었음을 표시
4. 핵심 문장은 **볼드**로 감싸주세요
5. 관련 내용이 없으면 가장 관련 있는 부분을 발췌
6. 발췌문은 최대 2-3문장으로 간결하게

입력:
${reviews.map((r, i) => `[${i + 1}] 속성: "${r.criteriaName}"
리뷰: "${r.reviewText}"`).join('\n\n')}

출력 형식 (JSON 배열):
[
  {"index": 1, "excerpt": "...**핵심 문장**이 포함된 발췌문..."},
  {"index": 2, "excerpt": "...**핵심 문장**이 포함된 발췌문..."}
]

JSON 배열만 출력하세요.`;

    const response = await callGeminiWithRetry(prompt, {
      temperature: 0.2,
      maxOutputTokens: 1024,
    });

    // JSON 파싱
    let results: Array<{ index: number; excerpt: string }> = [];
    try {
      // JSON 블록 추출
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[highlight-review] JSON parse error:', parseError);
      // 파싱 실패 시 원본 일부 반환 (앞 100자)
      return NextResponse.json({
        success: true,
        data: reviews.map(r => ({
          criteriaId: r.criteriaId,
          originalText: r.reviewText,
          excerpt: r.reviewText.length > 100
            ? r.reviewText.substring(0, 100) + '...'
            : r.reviewText,
        })),
        fallback: true,
      });
    }

    // 결과 매핑
    const highlightResults: HighlightResult[] = reviews.map((review, idx) => {
      const result = results.find(r => r.index === idx + 1);
      return {
        criteriaId: review.criteriaId,
        originalText: review.reviewText,
        excerpt: result?.excerpt || (review.reviewText.length > 100
          ? review.reviewText.substring(0, 100) + '...'
          : review.reviewText),
      };
    });

    return NextResponse.json({
      success: true,
      data: highlightResults,
    });
  } catch (error) {
    console.error('[highlight-review] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
