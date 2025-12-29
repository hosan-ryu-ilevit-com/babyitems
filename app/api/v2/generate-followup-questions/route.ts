'use server';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseJSONResponse } from '@/lib/ai/gemini';

/**
 * 동적 추가 질문 생성 API
 *
 * Gemini Flash Lite가 사용자의 모든 선택을 분석하여 0~3개의 추가 질문 생성
 * - 항상 AI가 판단 (빠른 스킵 조건 없음)
 * - 질문이 필요한 경우만 생성 (적을수록 좋음)
 * - 각 질문에 라디오 버튼 옵션 + 직접 입력 가능
 */

interface FollowupQuestionOption {
  value: string;
  label: string;
  description: string;
  scoreImpact: number;
  targetRuleKey?: string;
}

interface FollowupQuestion {
  id: string;
  title: string;
  type: 'single' | 'multi';
  options: FollowupQuestionOption[];
  allowOther: boolean;
  reason: string;  // 이 질문을 하는 이유
}

interface GenerateFollowupRequest {
  categoryKey: string;
  categoryName?: string;
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
  budget?: { min: number; max: number };
  filteredProductCount?: number;
  candidateProducts?: Array<{
    pcode: string;
    title: string;
    brand?: string;
    spec?: Record<string, unknown>;
  }>;
  directInputAnalysis?: {
    keywords: string[];
    originalInput?: string;
  };
}

interface GenerateFollowupResponse {
  success: boolean;
  data?: {
    questions: FollowupQuestion[];
    shouldAsk: boolean;
    reason: string;
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

// Flash Lite 모델 가져오기 (빠르고 저렴)
function getFlashLiteModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateFollowupResponse>> {
  try {
    const body: GenerateFollowupRequest = await request.json();
    const {
      categoryKey,
      categoryName,
      hardFilterAnswers,
      balanceSelections,
      negativeSelections,
      budget,
      filteredProductCount,
      candidateProducts,
      directInputAnalysis,
    } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    console.log(`[generate-followup] Analyzing inputs for ${categoryKey}...`);

    // Flash Lite 모델 사용 (빠른 응답)
    const model = getFlashLiteModel();

    // 하드필터 답변 요약
    const hardFilterSummary = hardFilterAnswers && Object.keys(hardFilterAnswers).length > 0
      ? Object.entries(hardFilterAnswers)
          .map(([key, values]) => `${key}: ${values.join(', ')}`)
          .join('\n')
      : '선택 없음';

    // 후보 제품 요약 (상위 5개)
    const productSummary = candidateProducts?.slice(0, 5).map((p, i) => {
      const specStr = Object.entries(p.spec || {})
        .slice(0, 4)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      return `${i + 1}. ${p.brand || ''} ${p.title.slice(0, 50)}${p.title.length > 50 ? '...' : ''} (${specStr})`;
    }).join('\n') || '제품 정보 없음';

    const systemPrompt = `당신은 아기용품 추천 전문가입니다.
사용자가 지금까지 입력한 모든 정보를 분석하여, 더 정확한 추천을 위해 추가 질문이 **정말** 필요한지 판단하세요.

## 핵심 원칙
**질문은 최소화!** 사용자를 귀찮게 하지 마세요.
- 대부분의 경우 shouldAsk: false 입니다
- 정말 중요한 정보가 빠졌을 때만 질문하세요

## 질문이 필요한 경우 (shouldAsk: true) - 드문 케이스
1. **핵심 결정 요소 완전 누락**: 젖병인데 소재(유리/PPSU/트라이탄) 선택이 전혀 없음
2. **명백한 조건 충돌**: "가벼운 유리 젖병" → 유리는 무거움, 소재 재확인 필요
3. **후보 제품 특성 극명한 차이**: Top 5 중 특성이 완전히 다른 제품들이 섞임

## 질문이 필요 없는 경우 (shouldAsk: false) - 대부분
1. 밸런스 게임에서 이미 선호도를 충분히 표현함
2. 단점 필터에서 피할 것을 명확히 선택함
3. 자연어 입력으로 원하는 것을 구체적으로 설명함
4. 후보 제품이 비슷한 특성을 가짐 (좁혀진 상태)
5. 예산 범위가 명확함

## 질문 개수 (shouldAsk: true인 경우)
- 1개가 기본 (핵심만)
- 2개 최대 (매우 드문 경우)
- 3개는 거의 없음

## 응답 형식 (JSON)
{
  "shouldAsk": false,
  "reason": "밸런스 게임과 단점 필터에서 충분히 선호도가 파악되었습니다",
  "questions": []
}

또는

{
  "shouldAsk": true,
  "reason": "젖병 소재 선택이 없어 확인이 필요합니다",
  "questions": [
    {
      "id": "followup_1",
      "title": "젖병 소재는 어떤 게 좋으세요?",
      "type": "single",
      "options": [
        { "value": "glass", "label": "유리", "description": "열탕 소독 가능, 환경호르몬 걱정 없음", "scoreImpact": 40 },
        { "value": "ppsu", "label": "PPSU", "description": "가볍고 튼튼, 유리만큼 안전", "scoreImpact": 40 },
        { "value": "tritan", "label": "트라이탄", "description": "가장 가벼움, 가성비 좋음", "scoreImpact": 40 }
      ],
      "allowOther": true,
      "reason": "소재에 따라 무게, 내구성, 가격이 크게 달라집니다"
    }
  ]
}`;

    const userPrompt = `## 카테고리
${categoryName || categoryKey}

## 1. 하드필터 선택 (환경/스펙 조건)
${hardFilterSummary}

## 2. 밸런스 게임 선택 (선호도)
${balanceSelections && balanceSelections.length > 0 ? balanceSelections.join(', ') : '선택 없음'}

## 3. 단점 필터 선택 (피하고 싶은 것)
${negativeSelections && negativeSelections.length > 0 ? negativeSelections.join(', ') : '선택 없음'}

## 4. 예산 범위
${budget ? `${budget.min.toLocaleString()}원 ~ ${budget.max.toLocaleString()}원` : '미설정'}

## 5. 자연어 직접 입력
${directInputAnalysis?.originalInput ? `"${directInputAnalysis.originalInput}" (키워드: ${directInputAnalysis.keywords?.join(', ')})` : '없음'}

## 6. 현재 후보 제품 (${filteredProductCount || 0}개 중 상위 5개)
${productSummary}

위 정보를 종합 분석하고, 추가 질문이 **정말** 필요한지 판단하세요.
대부분의 경우 이미 충분한 정보가 있습니다.`;

    try {
      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: '네, 분석하겠습니다.' }] },
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
      });

      const result = response.response.text();
      const parsed = parseJSONResponse<{
        shouldAsk: boolean;
        reason: string;
        questions: FollowupQuestion[];
      }>(result);

      // 질문 개수 제한 (최대 2개)
      const questions = (parsed.questions || []).slice(0, 2);

      // 각 질문 유효성 검사
      const validQuestions = questions.filter(q =>
        q.id && q.title && q.options && q.options.length >= 2
      );

      const shouldAsk = parsed.shouldAsk && validQuestions.length > 0;

      console.log(`[generate-followup] Result: shouldAsk=${shouldAsk}, questions=${validQuestions.length}, reason="${parsed.reason}"`);

      return NextResponse.json({
        success: true,
        data: {
          questions: validQuestions,
          shouldAsk,
          reason: parsed.reason || (shouldAsk ? '추가 확인이 필요해요' : '충분한 정보가 수집되었어요'),
          generated_by: 'llm',
        },
      });

    } catch (llmError) {
      console.error('[generate-followup] LLM error:', llmError);

      // Fallback: 질문 없이 진행
      return NextResponse.json({
        success: true,
        data: {
          questions: [],
          shouldAsk: false,
          reason: '기존 정보로 추천을 진행합니다',
          generated_by: 'fallback',
        },
      });
    }

  } catch (error) {
    console.error('[generate-followup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate follow-up questions' },
      { status: 500 }
    );
  }
}

/**
 * GET: API 정보
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    info: {
      endpoint: '/api/v2/generate-followup-questions',
      method: 'POST',
      description: '동적 추가 질문 생성 API - Flash Lite가 모든 입력을 분석하여 0~2개 질문 생성',
      input: {
        categoryKey: 'string (required)',
        categoryName: 'string (optional)',
        hardFilterAnswers: 'Record<string, string[]> (optional)',
        balanceSelections: 'string[] (optional)',
        negativeSelections: 'string[] (optional)',
        budget: '{ min, max } (optional)',
        filteredProductCount: 'number (optional)',
        candidateProducts: 'array of top products (optional)',
        directInputAnalysis: '{ keywords, originalInput } (optional)',
      },
      output: {
        questions: 'FollowupQuestion[]',
        shouldAsk: 'boolean',
        reason: 'string',
        generated_by: "'llm' | 'fallback'",
      },
    },
  });
}
