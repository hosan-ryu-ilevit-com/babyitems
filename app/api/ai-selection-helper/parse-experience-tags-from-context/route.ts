'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import fs from 'fs';
import path from 'path';

interface HardFilterOption {
  label: string;
  displayLabel: string;
  value: string;
  mentionCount?: number;
  sentiment?: string;
  sampleReview?: string;
  reviewKeywords?: string[];
}

interface HardFilterQuestion {
  id: string;
  type: string;
  question: string;
  options: HardFilterOption[];
}

// manual_hard_questions.json에서 Q1 (review_priorities) 옵션 로드
function loadQ1Options(category: string): HardFilterOption[] | null {
  try {
    const filePath = path.join(process.cwd(), 'data', 'rules', 'manual_hard_questions.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      const categoryConfig = data[category];
      
      if (categoryConfig?.questions) {
        // 첫 번째 질문 (review_priorities 타입) 찾기
        const q1 = categoryConfig.questions.find(
          (q: HardFilterQuestion) => q.type === 'review_priorities'
        );
        if (q1?.options) {
          return q1.options;
        }
      }
    }
  } catch (error) {
    console.error(`Failed to load Q1 options for ${category}:`, error);
  }
  return null;
}

interface ParseExperienceTagsRequest {
  category: string;
  categoryName: string;
  context: string;
}

interface ExperienceTagsResult {
  selectedTags: string[];  // 선택된 옵션 value들
  explanation: string;     // AI 생성 설명 텍스트
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseExperienceTagsRequest = await request.json();
    const { category, categoryName, context } = body;

    // 컨텍스트 검증
    if (!context || context.trim().length < 2) {
      return NextResponse.json(
        { error: '상황을 조금 더 자세히 알려주세요.' },
        { status: 400 }
      );
    }

    // Q1 옵션 로드
    const q1Options = loadQ1Options(category);
    if (!q1Options || q1Options.length === 0) {
      return NextResponse.json({
        selectedTags: [],
        explanation: '',
      });
    }

    // 옵션 포맷팅
    const optionsFormatted = q1Options.map((opt, i) => {
      const keywords = opt.reviewKeywords?.join(', ') || '';
      return `${i + 1}. [${opt.value}] ${opt.displayLabel || opt.label}
   관련 키워드: ${keywords}`;
    }).join('\n');

    const systemPrompt = `당신은 10년 경력의 ${categoryName} 전문 컨설턴트입니다.

사용자가 다음과 같은 상황을 설명했습니다:
"${context}"

아래는 ${categoryName} 선택 시 중요한 구매조건들입니다. 사용자의 상황을 분석하여 꼭 체크해야 할 조건들을 선택해주세요.

## 중요 규칙:
1. 사용자 상황에서 명확하게 연관되는 조건만 선택
2. 확신이 없으면 선택하지 않음 (사용자가 직접 선택하도록)
3. 최대 3개까지 선택 가능
4. explanation은 전문가답게 구체적으로 작성 (80자 이내)
   - 사용자 상황의 핵심 포인트를 짚어주고
   - 왜 해당 조건들이 중요한지 근거를 설명
   - 예: "밤수유가 잦으시면 **온도 정확도**가 핵심이고, 피로 누적을 줄이려면 **사용 편의성**도 꼭 챙기세요"`;

    const userPrompt = `## ${categoryName} 구매조건 목록
${optionsFormatted}

## 출력 형식 (JSON)
{
  "selectedTags": ["option_value_1", "option_value_2", "option_value_3"],
  "explanation": "밤수유가 잦으시면 **온도 정확도**가 핵심이고, 피로 누적을 줄이려면 **사용 편의성**과 **소음**도 꼭 챙기세요"
}

사용자 상황을 분석하여 꼭 필요한 조건들을 선택하세요. 확신이 없으면 빈 배열을 반환하세요.`;

    const model = getModel(0.5); // 약간의 창의성 허용

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<ExperienceTagsResult>(response);

    // 유효성 검증: 존재하는 옵션 값인지 확인
    const validOptionValues = q1Options.map(opt => opt.value);
    const validatedTags = (parsed.selectedTags || []).filter(tag => validOptionValues.includes(tag));

    console.log('🎯 Parse experience tags from context result:');
    console.log('  - Context:', context);
    console.log('  - Selected tags:', validatedTags);
    console.log('  - Explanation:', parsed.explanation);

    return NextResponse.json({
      selectedTags: validatedTags,
      explanation: parsed.explanation || '',
    });

  } catch (error) {
    console.error('Parse experience tags from context error:', error);
    return NextResponse.json(
      { error: 'AI 분석에 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
