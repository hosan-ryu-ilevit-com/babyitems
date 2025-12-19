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

interface HardFilterOption {
  value: string;
  label: string;
}

interface BalanceGameOption {
  text: string;
  target_rule_key: string;
}

interface NegativeFilterOption {
  id: string;
  label: string;
  target_rule_key: string;
}

interface AISelectionRequest {
  questionType: 'hard_filter' | 'balance_game' | 'negative_filter' | 'category_selection';
  questionId: string;
  questionText: string;
  options: HardFilterOption[] | { A: BalanceGameOption; B: BalanceGameOption } | NegativeFilterOption[];
  userContext: string;
  category: string;
  tipText?: string;
  // negative_filter용 추가 컨텍스트
  userSelections?: {
    hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
    balanceGames?: Array<{ title: string; selectedOption: string }>;
  };
}

interface AISelectionResponse {
  recommendation: {
    selectedOptions: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  reasoning: string;
  alternatives?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AISelectionRequest = await request.json();
    const { questionType, questionId, questionText, options, userContext, category, tipText, userSelections } = body;

    if (!userContext || userContext.trim().length < 2) {
      return NextResponse.json(
        { error: '상황을 조금 더 자세히 알려주세요.' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = loadCategoryInsights(category);
    const insightsContext = insights ? `
카테고리 인사이트:
- 가이드: ${JSON.stringify((insights as { guide?: unknown }).guide || {})}
- 주요 장점들: ${JSON.stringify(((insights as { pros?: unknown[] }).pros || []).slice(0, 3))}
- 주요 단점들: ${JSON.stringify(((insights as { cons?: unknown[] }).cons || []).slice(0, 3))}
- 일반적인 고민: ${JSON.stringify((insights as { question_context?: { common_concerns?: unknown } }).question_context?.common_concerns || [])}
` : '';

    let systemPrompt: string;
    let userPrompt: string;

    if (questionType === 'negative_filter') {
      // negative_filter 처리
      const negativeOptions = options as NegativeFilterOption[];
      const optionsList = negativeOptions
        .map(o => `- "${o.target_rule_key}": ${o.label}`)
        .join('\n');

      // 이전 선택 컨텍스트 구성
      let previousSelectionsContext = '';
      if (userSelections) {
        if (userSelections.hardFilters && userSelections.hardFilters.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (환경 체크):**\n';
          userSelections.hardFilters.forEach(hf => {
            previousSelectionsContext += `- ${hf.questionText}: ${hf.selectedLabels.join(', ')}\n`;
          });
        }
        if (userSelections.balanceGames && userSelections.balanceGames.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (취향 선택):**\n';
          userSelections.balanceGames.forEach(bg => {
            previousSelectionsContext += `- ${bg.title}: ${bg.selectedOption}\n`;
          });
        }
      }

      systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 듣고 "피하고 싶은 단점"을 추천해주세요.

**중요 규칙:**
1. 반드시 제공된 단점 옵션의 "target_rule_key" 값만 selectedOptions에 넣으세요 (label이 아닌 target_rule_key)
2. 사용자 상황에 맞는 0-3개의 단점을 추천하세요
3. 정말 피해야 하는 단점만 선택하세요. 모호한 경우 선택하지 마세요
4. 사용자의 이전 선택(환경 체크, 취향 선택)과 일관성 있게 추천하세요
5. 추천 이유는 반드시 사용자의 상황과 연결해서 설명하세요
6. **reasoning과 alternatives 응답은 반드시 한글로 작성하세요. 옵션을 언급할 때는 target_rule_key가 아닌 한글 label을 사용하세요.**
7. **alternatives(TIP)는 반드시 한 문장으로만 작성하세요. 불필요하면 null로 두세요.**
8. 사용자가 특별히 피해야 할 단점이 없어 보이면 빈 배열 []을 selectedOptions에 넣으세요

${insightsContext}`;

      userPrompt = `**현재 질문:**
${questionText}

**피할 수 있는 단점 옵션들:**
${optionsList}
${previousSelectionsContext}
${tipText ? `**팁:** ${tipText}` : ''}

**사용자 상황:**
"${userContext}"

**응답 형식 (JSON):**
{
  "recommendation": {
    "selectedOptions": ["target_rule_key1", "target_rule_key2"] 또는 [] (피해야 할 단점이 없으면),
    "confidence": "high" | "medium" | "low"
  },
  "reasoning": "추천 이유 (2-3문장, 사용자 상황과 연결)",
  "alternatives": "다른 선택이 더 나을 수 있는 경우 (없으면 null)"
}`;

    } else if (questionType === 'category_selection') {
      // 카테고리 선택 도움
      const categoryOptions = options as HardFilterOption[];
      const optionsList = categoryOptions
        .map(o => `- "${o.value}": ${o.label}`)
        .join('\n');

      systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 육아 상황을 듣고 지금 가장 필요한 제품 카테고리를 추천해주세요.

**중요 규칙:**
1. 반드시 제공된 카테고리의 "value" 값만 selectedOptions에 넣으세요 (label이 아닌 value)
2. 사용자 상황에 가장 적합한 1-2개의 카테고리를 추천하세요 (최대 2개)
3. 우선순위가 명확한 카테고리 1개만 추천하는 것이 더 좋습니다
4. 추천 이유는 반드시 사용자의 구체적인 상황과 연결해서 설명하세요
5. 아기 개월 수, 육아 환경, 현재 불편한 점 등을 고려하세요
6. **reasoning과 alternatives 응답은 반드시 한글로 작성하세요**
7. **alternatives(TIP)는 반드시 한 문장으로만 작성하세요. 불필요하면 null로 두세요**

**카테고리 선택 가이드:**
- 수유 관련 고민 → 분유, 분유제조기, 분유포트, 젖병, 쪽쪽이
- 외출 관련 고민 → 유모차, 카시트
- 위생/청결 고민 → 기저귀, 아기물티슈, 체온계, 코흡입기
- 공간/가구 필요 → 유아침대, 유아의자, 유아소파, 유아책상`;

      userPrompt = `**현재 질문:**
${questionText}

**선택 가능한 카테고리:**
${optionsList}

**사용자 상황:**
"${userContext}"

**응답 형식 (JSON):**
{
  "recommendation": {
    "selectedOptions": ["value1"] 또는 ["value1", "value2"] (최대 2개),
    "confidence": "high" | "medium" | "low"
  },
  "reasoning": "추천 이유 (2-3문장, 사용자 상황과 연결)",
  "alternatives": "다른 카테고리도 고려해볼 만한 경우 (없으면 null)"
}`;

    } else if (questionType === 'hard_filter') {
      const optionsList = (options as HardFilterOption[])
        .map(o => `- "${o.value}": ${o.label}`)
        .join('\n');

      // 이전 선택 컨텍스트 구성
      let previousSelectionsContext = '';
      if (userSelections) {
        if (userSelections.hardFilters && userSelections.hardFilters.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (환경 체크):**\n';
          userSelections.hardFilters.forEach(hf => {
            previousSelectionsContext += `- ${hf.questionText}: ${hf.selectedLabels.join(', ')}\n`;
          });
        }
        if (userSelections.balanceGames && userSelections.balanceGames.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (취향 선택):**\n';
          userSelections.balanceGames.forEach(bg => {
            previousSelectionsContext += `- ${bg.title}: ${bg.selectedOption}\n`;
          });
        }
        if (userSelections.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 자연어 입력:**\n';
          userSelections.naturalLanguageInputs.forEach(nl => {
            previousSelectionsContext += `- ${nl.input}\n`;
          });
        }
      }

      systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 듣고 현재 질문의 선택지 중 최적의 옵션을 추천해주세요.

**중요 규칙:**
1. 반드시 제공된 선택지의 "value" 값만 selectedOptions에 넣으세요 (label이 아닌 value)
2. 사용자 상황에 맞는 1-3개의 옵션을 추천하세요
3. "상관없어요", "전부 좋아요" 같은 스킵 옵션은 정말 필요한 경우에만 추천하세요
4. 추천 이유는 반드시 사용자의 상황과 연결해서 설명하세요
5. 사용자의 이전 선택과 일관성 있게 추천하세요
6. 대안이 있다면 언급하세요
7. **reasoning과 alternatives 응답은 반드시 한글로 작성하세요. 옵션을 언급할 때는 영어 value가 아닌 한글 label을 사용하세요.**
8. **alternatives(TIP)는 반드시 한 문장으로만 작성하세요. 불필요하면 null로 두세요.**

${insightsContext}`;

      userPrompt = `**현재 질문:**
${questionText}

**선택지:**
${optionsList}
${previousSelectionsContext}
${tipText ? `**팁:** ${tipText}` : ''}

**사용자 상황:**
"${userContext}"

**응답 형식 (JSON):**
{
  "recommendation": {
    "selectedOptions": ["value1", "value2"],
    "confidence": "high" | "medium" | "low"
  },
  "reasoning": "추천 이유 (2-3문장, 사용자 상황과 연결)",
  "alternatives": "예외 케이스가 있다면 언급 (없으면 null)"
}`;

    } else {
      // balance_game
      const balanceOptions = options as { A: BalanceGameOption; B: BalanceGameOption };

      // 이전 선택 컨텍스트 구성
      let previousSelectionsContext = '';
      if (userSelections) {
        if (userSelections.hardFilters && userSelections.hardFilters.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (환경 체크):**\n';
          userSelections.hardFilters.forEach(hf => {
            previousSelectionsContext += `- ${hf.questionText}: ${hf.selectedLabels.join(', ')}\n`;
          });
        }
        if (userSelections.balanceGames && userSelections.balanceGames.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 선택 (취향 선택):**\n';
          userSelections.balanceGames.forEach(bg => {
            previousSelectionsContext += `- ${bg.title}: ${bg.selectedOption}\n`;
          });
        }
        if (userSelections.naturalLanguageInputs && userSelections.naturalLanguageInputs.length > 0) {
          previousSelectionsContext += '\n**사용자의 이전 자연어 입력:**\n';
          userSelections.naturalLanguageInputs.forEach(nl => {
            previousSelectionsContext += `- ${nl.input}\n`;
          });
        }
      }

      systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 듣고 A vs B 중 어떤 선택이 더 적합한지 추천해주세요.

**중요 규칙:**
1. 반드시 "A", "B", 또는 "both" 중 하나를 selectedOptions에 넣으세요
2. "both"는 정말 둘 다 중요한 상황일 때만 추천하세요
3. 추천 이유는 반드시 사용자의 상황과 연결해서 설명하세요
4. 사용자의 이전 선택과 일관성 있게 추천하세요
5. 확신이 낮으면 "both"보다는 더 중요한 하나를 선택하세요
6. **reasoning과 alternatives 응답은 반드시 한글로 작성하세요. 옵션을 언급할 때는 "A", "B" 대신 해당 옵션의 한글 설명을 사용하세요.**
7. **alternatives(TIP)는 반드시 한 문장으로만 작성하세요. 불필요하면 null로 두세요.**

${insightsContext}`;

      userPrompt = `**현재 질문:**
${questionText}

**선택지:**
A: ${balanceOptions.A.text}
B: ${balanceOptions.B.text}
${previousSelectionsContext}
**사용자 상황:**
"${userContext}"

**응답 형식 (JSON):**
{
  "recommendation": {
    "selectedOptions": ["A"] 또는 ["B"] 또는 ["both"],
    "confidence": "high" | "medium" | "low"
  },
  "reasoning": "추천 이유 (2-3문장, 사용자 상황과 연결)",
  "alternatives": "다른 선택이 더 나을 수 있는 경우 (없으면 null)"
}`;
    }

    const model = getModel(0.3);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<AISelectionResponse>(response);

    // 유효성 검증
    if (questionType === 'hard_filter' || questionType === 'category_selection') {
      const validValues = (options as HardFilterOption[]).map(o => o.value);
      parsed.recommendation.selectedOptions = parsed.recommendation.selectedOptions.filter(
        opt => validValues.includes(opt)
      );
      // category_selection은 최대 2개로 제한
      if (questionType === 'category_selection' && parsed.recommendation.selectedOptions.length > 2) {
        parsed.recommendation.selectedOptions = parsed.recommendation.selectedOptions.slice(0, 2);
      }
    } else if (questionType === 'negative_filter') {
      // negative_filter는 target_rule_key 값들만 허용
      const validKeys = (options as NegativeFilterOption[]).map(o => o.target_rule_key);
      parsed.recommendation.selectedOptions = parsed.recommendation.selectedOptions.filter(
        opt => validKeys.includes(opt)
      );
      // 빈 배열도 유효 (피해야 할 단점이 없는 경우)
    } else {
      // balance_game은 A, B, both만 허용
      const validOptions = ['A', 'B', 'both'];
      parsed.recommendation.selectedOptions = parsed.recommendation.selectedOptions.filter(
        opt => validOptions.includes(opt)
      );
      if (parsed.recommendation.selectedOptions.length === 0) {
        parsed.recommendation.selectedOptions = ['A']; // fallback
      }
    }

    return NextResponse.json(parsed);

  } catch (error) {
    console.error('AI Selection Helper error:', error);
    return NextResponse.json(
      { error: 'AI 추천을 생성하는 데 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
