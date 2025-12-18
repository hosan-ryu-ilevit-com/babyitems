/**
 * 리뷰 텍스트에서 핵심 문장 추출 API
 * Gemini Flash Lite로 체감속성과 직결되는 문장을 발췌
 */

import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry } from '@/lib/ai/gemini';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');
const ai = new GoogleGenAI({ apiKey });

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
    const prompt = `리뷰에서 특정 속성과 관련된 **핵심 문장만** 발췌하세요.

## 규칙
1. 해당 속성과 **직접 관련된 문장 1개**를 찾으세요 (문장 = 마침표/느낌표/물음표로 끝나는 단위)
2. 핵심 문장 앞뒤로 각 1문장씩 포함해서 발췌 (총 2-3문장)
3. 앞뒤에 "..."를 붙여 생략 표시
4. **핵심 문장 전체**를 볼드로 감싸세요 (단어가 아닌 문장!)
5. 관련 내용이 없으면 가장 연관된 부분 발췌

## 예시
- 원본: "배송 빨랐어요. 세척이 정말 편해서 좋아요. 매일 쓰는데 귀찮지 않아요. 디자인도 예뻐요."
- 속성: "세척 편리성"
- 발췌: "...**세척이 정말 편해서 좋아요. 매일 쓰는데 귀찮지 않아요.**..."

## 입력
${reviews.map((r, i) => `[${i + 1}] 속성: "${r.criteriaName}"
리뷰: "${r.reviewText}"`).join('\n\n')}

## 출력 (JSON만)
[{"index": 1, "excerpt": "...발췌문..."}]`;

    const response = await callGeminiWithRetry(async () => {
      // Use Gemini 3 Flash for better highlighting quality
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.2, // 낮은 temperature로 일관된 발췌
        },
      });
      return result.text || '';
    }, 2, 1000);

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
