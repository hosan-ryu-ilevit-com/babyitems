/**
 * Knowledge Agent - 자연어 키워드 추출 API
 *
 * 사용자의 자연어 입력에서 검색 가능한 제품 키워드를 추출
 * 예: "우리 아기한테 좋은 젖병 뭐가 좋을까요?" → "젖병"
 * 예: "에어프라이어 추천해줘" → "에어프라이어"
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const MODEL_NAME = 'gemini-2.5-flash-lite';

interface ExtractResult {
  success: boolean;
  keyword: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggestions?: string[];
  clarificationNeeded?: boolean;
  clarificationQuestion?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userInput } = await request.json();

    if (!userInput || typeof userInput !== 'string') {
      return NextResponse.json({
        success: false,
        keyword: null,
        confidence: 'low',
        clarificationNeeded: true,
        clarificationQuestion: '어떤 제품을 찾고 계신가요?'
      });
    }

    if (!ai) {
      return NextResponse.json({
        success: false,
        keyword: null,
        confidence: 'low',
        clarificationNeeded: true,
        clarificationQuestion: 'AI 서비스를 사용할 수 없습니다.'
      }, { status: 500 });
    }

    const model = ai.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.1 }
    });

    const prompt = `
사용자가 제품 추천 서비스에 다음과 같이 입력했습니다:
"${userInput}"

## 과제
사용자가 입력한 **제품 검색 키워드를 그대로** 추출하세요.
카테고리로 일반화하지 말고 원본 키워드를 유지하세요.

## 핵심 규칙
1. **원본 유지**: "맥북" → "맥북" (O), "노트북" (X)
2. **브랜드+제품 유지**: "다이슨 청소기" → "다이슨 청소기", "갤럭시탭" → "갤럭시탭"
3. **구체적 제품명 유지**: "에어팟 프로" → "에어팟 프로", "LG 그램" → "LG 그램"
4. **제품이 아닌 경우만 null**: 인사말, 질문, 일반 대화 등

## 예시
- "맥북 추천해줘" → "맥북"
- "맥북프로 어떤게 좋아요?" → "맥북프로"
- "다이슨 무선청소기" → "다이슨 무선청소기"
- "갤럭시탭 S9" → "갤럭시탭 S9"
- "에어팟" → "에어팟"
- "LG 그램 17인치" → "LG 그램 17인치"
- "에어프라이어 추천" → "에어프라이어"
- "1인 가구 가습기" → "가습기" (수식어 제거는 OK)
- "안녕하세요" → null
- "뭐가 좋을까요" → null

## JSON 응답
{
  "keyword": "사용자가 말한 제품 키워드 그대로 또는 null",
  "confidence": "high|medium|low",
  "clarificationNeeded": boolean,
  "clarificationQuestion": "추가 질문 (필요시)",
  "suggestions": []
}

## 판단 기준
- high: 제품/브랜드 키워드가 명확함
- medium: 제품은 있지만 모호함
- low: 제품 키워드가 없음 (null 반환)

JSON만 응답:
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return NextResponse.json({
        success: true,
        keyword: parsed.keyword || null,
        confidence: parsed.confidence || 'low',
        clarificationNeeded: parsed.clarificationNeeded || false,
        clarificationQuestion: parsed.clarificationQuestion || null,
        suggestions: parsed.suggestions || []
      } as ExtractResult);
    }

    // JSON 파싱 실패
    return NextResponse.json({
      success: false,
      keyword: null,
      confidence: 'low',
      clarificationNeeded: true,
      clarificationQuestion: '어떤 제품을 찾고 계신가요? 예: 에어프라이어, 로봇청소기, 가습기'
    });

  } catch (error) {
    console.error('[ExtractKeyword] Error:', error);
    return NextResponse.json({
      success: false,
      keyword: null,
      confidence: 'low',
      clarificationNeeded: true,
      clarificationQuestion: '죄송합니다. 다시 한 번 말씀해 주시겠어요?'
    }, { status: 500 });
  }
}
