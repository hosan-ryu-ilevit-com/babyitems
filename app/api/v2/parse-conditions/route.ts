import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import hardFiltersData from '@/data/rules/hard_filters.json';

// hard_filters.json에서 가이드 정보만 사용
interface HardFilterGuide {
  category_name?: string;
  guide?: {
    title: string;
    points: string[];
    trend: string;
  };
}

// 프론트엔드에서 전달받는 질문 형태
interface QuestionInput {
  id: string;
  question: string;
  options: Array<{
    label: string;
    value: string;
  }>;
}

interface ParsedResult {
  parsedConditions: Record<string, string>;
  confidence: number;
  message: string;
}

/**
 * POST /api/v2/parse-conditions
 * 자연어 입력을 하드필터 조건으로 파싱
 *
 * 주의: hard_filters.json에서 questions가 제거됨
 * 프론트엔드에서 동적 질문을 전달해야 함
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, categoryKey, currentAnswers, questions } = body;

    if (!query || !categoryKey) {
      return NextResponse.json(
        { success: false, error: 'query and categoryKey are required' },
        { status: 400 }
      );
    }

    // 해당 카테고리의 가이드 정보 가져오기
    const hardFilterGuide = (hardFiltersData as Record<string, HardFilterGuide>)[categoryKey];
    const categoryName = hardFilterGuide?.category_name || categoryKey;

    // 질문 목록: 프론트엔드에서 전달받거나 빈 배열
    const questionsToUse: QuestionInput[] = questions || [];

    if (questionsToUse.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          parsedConditions: {},
          confidence: 0,
          message: '질문 목록이 없어서 조건을 파싱할 수 없어요.',
        },
      });
    }

    // 질문과 옵션 정보 구성
    const questionsInfo = questionsToUse.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options.map(o => ({ value: o.value, label: o.label })),
    }));

    // Gemini 프롬프트 구성
    const prompt = `당신은 육아용품 추천 시스템의 조건 파서입니다.
사용자가 자연어로 입력한 조건을 분석하여 하드필터 질문에 대한 답변으로 변환해주세요.

## 카테고리
${categoryName}

## 현재 답변 상태
${JSON.stringify(currentAnswers || {}, null, 2)}

## 질문 목록과 선택지
${JSON.stringify(questionsInfo, null, 2)}

## 사용자 입력
"${query}"

## 작업
1. 사용자 입력에서 관련된 조건을 추출하세요
2. 각 조건을 해당 질문의 선택지(value)로 매핑하세요
3. 확신이 없는 조건은 포함하지 마세요

## 응답 형식 (JSON)
{
  "parsedConditions": {
    "질문ID": "선택지value"
  },
  "confidence": 0.0-1.0,
  "message": "사용자에게 보여줄 확인 메시지 (예: '쌍둥이라서 두 개 필요하시군요!')"
}

## 예시
입력: "PPSU 재질로 찾아주세요"
- 만약 재질 질문에 "ppsu" 옵션이 있다면:
{
  "parsedConditions": { "hf_bottle_material": "ppsu" },
  "confidence": 0.9,
  "message": "PPSU 재질로 찾아볼게요! 가볍고 안전한 소재예요."
}

입력: "외출이 많아요"
- 만약 환경 질문에 "travel" 옵션이 있다면:
{
  "parsedConditions": { "hf_stroller_env": "travel" },
  "confidence": 0.8,
  "message": "외출이 잦으시군요! 휴대성을 고려해서 찾아볼게요."
}

입력이 어떤 질문과도 매칭되지 않으면:
{
  "parsedConditions": {},
  "confidence": 0,
  "message": "입력하신 내용을 조건으로 변환하기 어려워요. 다른 방식으로 말씀해주시겠어요?"
}

JSON만 응답하세요.`;

    // Gemini API 호출
    const model = getModel(0.3); // 낮은 temperature로 일관된 파싱

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    // 응답 파싱
    const parsed = parseJSONResponse<ParsedResult>(result);

    // 유효성 검증
    const validatedConditions: Record<string, string> = {};

    for (const [questionId, value] of Object.entries(parsed.parsedConditions || {})) {
      const question = questionsToUse.find(q => q.id === questionId);
      if (question) {
        const option = question.options.find(o => o.value === value);
        if (option) {
          validatedConditions[questionId] = value;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        parsedConditions: validatedConditions,
        confidence: parsed.confidence || 0,
        message: parsed.message || '조건을 업데이트했어요.',
      },
    });
  } catch (error) {
    console.error('Parse conditions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to parse conditions',
        data: {
          parsedConditions: {},
          confidence: 0,
          message: '조건 파싱 중 오류가 발생했어요.',
        },
      },
      { status: 500 }
    );
  }
}
