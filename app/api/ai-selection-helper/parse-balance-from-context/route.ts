'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import fs from 'fs';
import path from 'path';

// 카테고리 인사이트 로드
function loadCategoryInsights(category: string): Record<string, unknown> | null {
  try {
    const filePath = path.join(process.cwd(), 'data', 'category-insights', `${category}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Failed to load category insights for ${category}:`, error);
  }
  return null;
}

interface BalanceQuestion {
  id: string;
  title: string;
  description?: string;
  option_A: {
    text: string;
    target_rule_key: string;
  };
  option_B: {
    text: string;
    target_rule_key: string;
  };
}

interface ParseBalanceRequest {
  category: string;
  categoryName: string;
  context: string;
  balanceQuestions: BalanceQuestion[];
}

interface BalanceSelectionResult {
  balanceSelections: Record<string, 'A' | 'B' | 'both'>;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseBalanceRequest = await request.json();
    const { category, categoryName, context, balanceQuestions } = body;

    // 컨텍스트 검증
    if (!context || context.trim().length < 2) {
      return NextResponse.json(
        { error: '상황을 조금 더 자세히 알려주세요.' },
        { status: 400 }
      );
    }

    // 밸런스 질문이 없으면 빈 결과 반환
    if (!balanceQuestions || balanceQuestions.length === 0) {
      return NextResponse.json({
        balanceSelections: {},
        confidence: {},
      });
    }

    // 카테고리 인사이트 로드
    const insights = loadCategoryInsights(category);
    const insightsContext = insights ? `
## 카테고리 인사이트:
- 일반적인 고민: ${JSON.stringify((insights as { question_context?: { common_concerns?: unknown } }).question_context?.common_concerns || [])}
` : '';

    // 밸런스 질문 포맷팅
    const questionsFormatted = balanceQuestions.map((q, i) => `
${i + 1}. [${q.id}] ${q.title}
   A: ${q.option_A.text}
   B: ${q.option_B.text}
`).join('\n');

    const systemPrompt = `당신은 ${categoryName} 추천 전문가입니다.

사용자가 다음과 같은 상황을 설명했습니다:
"${context}"

이제 사용자에게 밸런스게임 질문들을 할 예정입니다.
각 질문에 대해 사용자의 상황을 고려하여 A, B, 또는 both 중 하나를 추천해주세요.

${insightsContext}

## 중요 규칙:
1. 사용자 상황에서 명확하게 추론 가능하면 A 또는 B 선택
2. 확신이 없거나 둘 다 해당되면 "both" 선택 (사용자가 직접 선택하도록)
3. confidence는 추론의 확실성을 표시:
   - "high": 사용자 상황에서 명확하게 추론됨
   - "medium": 상황에서 어느 정도 추론 가능
   - "low": 확신 없음, 사용자가 직접 선택하는 것이 좋음
4. confidence가 "low"인 경우 "both"로 선택하세요
5. 모든 질문에 대해 응답해야 합니다`;

    const userPrompt = `## 밸런스게임 질문들
${questionsFormatted}

## 출력 형식 (JSON)
{
  "balanceSelections": {
    "question_id_1": "A" | "B" | "both",
    "question_id_2": "A" | "B" | "both"
  },
  "confidence": {
    "question_id_1": "high" | "medium" | "low",
    "question_id_2": "high" | "medium" | "low"
  }
}

각 질문 ID에 대해 선택과 확실성을 출력하세요.`;

    const model = getModel(0.3);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<BalanceSelectionResult>(response);

    // 유효성 검증: 각 질문에 대해 유효한 선택인지 확인
    const validOptions = ['A', 'B', 'both'];
    const questionIds = balanceQuestions.map(q => q.id);
    
    // 유효하지 않은 선택 제거 및 기본값 설정
    const validatedSelections: Record<string, 'A' | 'B' | 'both'> = {};
    const validatedConfidence: Record<string, 'high' | 'medium' | 'low'> = {};

    for (const qId of questionIds) {
      const selection = parsed.balanceSelections?.[qId];
      const conf = parsed.confidence?.[qId];

      if (selection && validOptions.includes(selection)) {
        validatedSelections[qId] = selection as 'A' | 'B' | 'both';
        validatedConfidence[qId] = conf && ['high', 'medium', 'low'].includes(conf) 
          ? conf as 'high' | 'medium' | 'low'
          : 'medium';
      }
      // confidence가 low인 경우 선택하지 않음 (사용자가 직접 선택하도록)
      // 따라서 validatedSelections에 추가하지 않음
    }

    // confidence가 low이거나 both인 경우 선택에서 제외
    const finalSelections: Record<string, 'A' | 'B' | 'both'> = {};
    const finalConfidence: Record<string, 'high' | 'medium' | 'low'> = {};

    for (const qId of Object.keys(validatedSelections)) {
      // low confidence는 미리 선택하지 않음
      if (validatedConfidence[qId] !== 'low') {
        finalSelections[qId] = validatedSelections[qId];
        finalConfidence[qId] = validatedConfidence[qId];
      }
    }

    console.log('🎯 Parse balance from context result:');
    console.log('  - Context:', context);
    console.log('  - Selections:', finalSelections);
    console.log('  - Confidence:', finalConfidence);

    return NextResponse.json({
      balanceSelections: finalSelections,
      confidence: finalConfidence,
    });

  } catch (error) {
    console.error('Parse balance from context error:', error);
    return NextResponse.json(
      { error: 'AI 분석에 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}

