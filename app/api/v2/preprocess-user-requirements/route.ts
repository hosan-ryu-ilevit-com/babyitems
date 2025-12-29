'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

/**
 * 사용자 요구사항 전처리 API - Gemini Flash Lite 사용
 *
 * 여러 직접입력(하드필터, 단점필터, 마지막 자연어)을
 * 자연스러운 문장으로 정리하여 LLM Top3 선정 시 사용
 */

interface PreprocessRequest {
  categoryKey: string;
  categoryName: string;
  // 하드필터 직접 입력들 (질문별로 등록된 것들)
  hardFilterDirectInputs?: string[];
  // 단점필터 직접 입력
  negativeDirectInput?: string;
  // 마지막 자연어 입력 (캐러셀에서)
  finalNaturalInput?: string;
  // 초기 컨텍스트 (있다면)
  initialContext?: string;
}

interface PreprocessedRequirements {
  // 전처리된 요구사항 (자연스러운 문장)
  summary: string;
  // 핵심 키워드 (추천 이유 생성 시 참조용)
  keyPoints: string[];
  // 원본 입력 보존 (디버깅/로깅용)
  originalInputs: {
    hardFilter?: string[];
    negative?: string;
    final?: string;
    initial?: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const body: PreprocessRequest = await request.json();
    const {
      categoryKey,
      categoryName,
      hardFilterDirectInputs = [],
      negativeDirectInput,
      finalNaturalInput,
      initialContext
    } = body;

    // 입력이 없으면 빈 결과 반환
    const hasAnyInput =
      hardFilterDirectInputs.length > 0 ||
      negativeDirectInput ||
      finalNaturalInput ||
      initialContext;

    if (!hasAnyInput) {
      return NextResponse.json({
        success: true,
        data: null,
        processingTime: Date.now() - startTime,
      });
    }

    // 입력 수집
    const inputs: string[] = [];

    if (initialContext) {
      inputs.push(`[초기상황] ${initialContext}`);
    }

    if (hardFilterDirectInputs.length > 0) {
      inputs.push(`[선호조건] ${hardFilterDirectInputs.join(', ')}`);
    }

    if (negativeDirectInput) {
      inputs.push(`[회피조건] ${negativeDirectInput}`);
    }

    if (finalNaturalInput) {
      inputs.push(`[추가요청] ${finalNaturalInput}`);
    }

    // 입력이 1개뿐이고 짧으면 전처리 없이 그대로 반환 (API 호출 절약)
    const totalLength = inputs.join(' ').length;
    if (inputs.length === 1 && totalLength < 30) {
      const singleInput = inputs[0].replace(/^\[.*?\]\s*/, '');
      return NextResponse.json({
        success: true,
        data: {
          summary: singleInput,
          keyPoints: [singleInput],
          originalInputs: {
            hardFilter: hardFilterDirectInputs.length > 0 ? hardFilterDirectInputs : undefined,
            negative: negativeDirectInput || undefined,
            final: finalNaturalInput || undefined,
            initial: initialContext || undefined,
          },
        } as PreprocessedRequirements,
        processingTime: Date.now() - startTime,
      });
    }

    // Flash Lite로 전처리
    const model = getModel(0.4); // 약간의 창의성 허용

    const prompt = `당신은 아기용품 추천 시스템의 요구사항 정리 전문가입니다.

## 목표
사용자가 ${categoryName} 구매 시 입력한 여러 조건들을 하나의 자연스러운 요구사항으로 정리합니다.
이 정리된 내용은 AI가 제품을 추천할 때 최우선으로 반영됩니다.

## 사용자 입력
${inputs.join('\n')}

## 규칙
1. 모든 입력 내용의 디테일을 살려서 정리
2. 중복되는 내용은 통합하되 의미 손실 없이
3. 자연스러운 한국어 문장으로 (2-3문장)
4. 선호/회피 조건을 명확히 구분
5. 핵심 키워드를 추출 (제품 추천 이유에 활용)

## 응답 형식 (JSON)
{
  "summary": "사용자가 원하는 조건을 자연스럽게 정리한 2-3문장",
  "keyPoints": ["핵심포인트1", "핵심포인트2", ...]
}

예시:
입력: [선호조건] 가벼운거, [회피조건] 소음 큰건 싫어요, [추가요청] 밤수유할때 편한게 좋겠어요
출력: {
  "summary": "밤수유 시 사용하기 편한 제품을 원하시며, 가벼운 무게를 선호합니다. 소음이 큰 제품은 피하고 싶어하세요.",
  "keyPoints": ["밤수유 편의", "가벼운 무게", "저소음"]
}`;

    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    }, 2, 300); // 빠른 응답을 위해 짧은 대기 시간

    const parsed = parseJSONResponse<{ summary: string; keyPoints: string[] }>(result);

    // 결과 검증
    if (!parsed.summary || !parsed.keyPoints) {
      // 파싱 실패 시 단순 연결로 fallback
      const fallbackSummary = inputs.map(i => i.replace(/^\[.*?\]\s*/, '')).join('. ');
      return NextResponse.json({
        success: true,
        data: {
          summary: fallbackSummary,
          keyPoints: inputs.map(i => i.replace(/^\[.*?\]\s*/, '')),
          originalInputs: {
            hardFilter: hardFilterDirectInputs.length > 0 ? hardFilterDirectInputs : undefined,
            negative: negativeDirectInput || undefined,
            final: finalNaturalInput || undefined,
            initial: initialContext || undefined,
          },
        } as PreprocessedRequirements,
        processingTime: Date.now() - startTime,
        generated_by: 'fallback',
      });
    }

    const processingTime = Date.now() - startTime;
    console.log(`[preprocess-user-requirements] Completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        originalInputs: {
          hardFilter: hardFilterDirectInputs.length > 0 ? hardFilterDirectInputs : undefined,
          negative: negativeDirectInput || undefined,
          final: finalNaturalInput || undefined,
          initial: initialContext || undefined,
        },
      } as PreprocessedRequirements,
      processingTime,
      generated_by: 'flash-lite',
    });

  } catch (error) {
    console.error('[preprocess-user-requirements] Error:', error);

    // 에러 시에도 원본 데이터는 반환
    const body = await request.clone().json().catch(() => ({})) as PreprocessRequest;
    const fallbackInputs: string[] = [];

    if (body.initialContext) fallbackInputs.push(body.initialContext);
    if (body.hardFilterDirectInputs?.length) fallbackInputs.push(...body.hardFilterDirectInputs);
    if (body.negativeDirectInput) fallbackInputs.push(body.negativeDirectInput);
    if (body.finalNaturalInput) fallbackInputs.push(body.finalNaturalInput);

    return NextResponse.json({
      success: true,
      data: fallbackInputs.length > 0 ? {
        summary: fallbackInputs.join('. '),
        keyPoints: fallbackInputs,
        originalInputs: {
          hardFilter: body.hardFilterDirectInputs,
          negative: body.negativeDirectInput,
          final: body.finalNaturalInput,
          initial: body.initialContext,
        },
      } : null,
      processingTime: Date.now() - startTime,
      generated_by: 'error-fallback',
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
      endpoint: '/api/v2/preprocess-user-requirements',
      method: 'POST',
      description: 'Flash Lite로 사용자 직접입력들을 자연스러운 요구사항으로 전처리',
      input: {
        categoryKey: 'string (required)',
        categoryName: 'string (required)',
        hardFilterDirectInputs: 'string[] (optional)',
        negativeDirectInput: 'string (optional)',
        finalNaturalInput: 'string (optional)',
        initialContext: 'string (optional)',
      },
      output: {
        summary: 'string - 전처리된 요구사항',
        keyPoints: 'string[] - 핵심 키워드',
        originalInputs: 'object - 원본 입력 보존',
      },
    },
  });
}
