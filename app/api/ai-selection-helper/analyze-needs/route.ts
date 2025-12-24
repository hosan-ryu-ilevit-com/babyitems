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

interface AnalyzeNeedsRequest {
  userContext: string;
  category: string;
  hardFilterQuestions: any[];
  balanceQuestions: any[];
  negativeOptions: any[];
  subCategories?: any[];
}

interface AnalyzeNeedsResponse {
  hardFilterSelections: Record<string, string[]>;
  balanceGameSelections: Record<string, string>; // "A" | "B" | "both"
  negativeFilterSelections: string[]; // target_rule_keys
  subCategorySelections?: string[]; // codes
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeNeedsRequest = await request.json();
    const { userContext, category, hardFilterQuestions, balanceQuestions, negativeOptions, subCategories } = body;

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

    // 프롬프트 구성
    const systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 분석하여 모든 선택 과정을 한 번에 수행해주세요.

**입력 정보:**
1. 사용자 상황 (userContext)
2. 선택해야 할 항목들:
   - 하드 필터 (hardFilterQuestions): 필수 선택 조건들
   - 밸런스 게임 (balanceQuestions): 선호도/가치관 파악
   - 기피하는 단점 (negativeOptions): 피하고 싶은 제품 특징
   - 서브 카테고리 (subCategories): (선택 사항) 제품 하위 분류

**중요 규칙:**
1. **상황 분석 및 신뢰도 판단 (CRITICAL):** 
   - 사용자의 입력(userContext)이 육아용품 추천과 관련이 없거나, 무의미한 문자열(예: 'asdf', 'ㄱㄱㄱ', '테스트' 등), 혹은 정보가 너무 부족하여 상황을 유추할 수 없는 경우, 반드시 **confidence를 "low"**로 설정하세요.
   - 이 경우 reasoning에 "입력하신 내용으로는 구체적인 상황을 파악하기 어려워요. 아기의 월령이나 고민되는 점을 조금 더 자세히 말씀해 주시면 딱 맞는 제품을 찾아드릴게요!"라고 작성하세요.
   - 억지로 추천 이유를 지어내거나 높은 확신을 보이지 마세요.
2. **모든 질문에 대해 답변을 생성해야 합니다.** (건너뛰기 금지)
3. **하드 필터:** 각 질문(id)에 대해 적절한 옵션(value)들을 선택하세요. (복수 선택 가능)
4. **밸런스 게임:** 각 질문(id)에 대해 "A", "B", "both" 중 하나를 선택하세요. "both"는 정말 애매할 때만 사용하세요.
5. **기피하는 단점:** 사용자 상황에서 꼭 피해야 할 단점들의 target_rule_key를 리스트로 반환하세요. 없으면 빈 리스트.
6. **서브 카테고리:** 제공된 경우, 적절한 code를 선택하세요. (필요 시 복수 선택)
7. **Reasoning:** 왜 이렇게 선택했는지 사용자에게 설명하는 3-4문장 정도의 요약글을 한글로 작성하세요. "사용자님의 상황(~~)을 고려하여 ~~한 제품 위주로 골라봤어요" 톤으로 작성하세요.
8. **신뢰도(confidence) 기준:**
   - **high**: 사용자의 상황이 구체적이고 명확한 근거가 있는 경우.
   - **medium**: 상황은 파악되나 일부 선택에 추측이 필요한 경우.
   - **low**: 입력이 무의미하거나, 너무 짧거나, 카테고리와 전혀 상관없는 이야기를 하는 경우. (이 경우 위 1번 규칙을 따름)

**응답 형식 (JSON):**
{
  "hardFilterSelections": { "questionId1": ["value1", "value2"], ... },
  "balanceGameSelections": { "questionId1": "A", "questionId2": "B", ... },
  "negativeFilterSelections": ["key1", "key2"],
  "subCategorySelections": ["code1"], (제공된 경우만)
  "reasoning": "...",
  "confidence": "high" | "medium" | "low"
}

${insightsContext}`;

    const userPrompt = `
**사용자 상황:**
"${userContext}"

**1. 하드 필터 질문 목록:**
${JSON.stringify(hardFilterQuestions, null, 2)}

**2. 밸런스 게임 질문 목록:**
${JSON.stringify(balanceQuestions.map((q: any) => ({
  id: q.id,
  A: q.option_A?.text,
  B: q.option_B?.text
})), null, 2)}

**3. 기피하는 단점 옵션들:**
${JSON.stringify(negativeOptions.map((o: any) => ({
  key: o.target_rule_key,
  label: o.label
})), null, 2)}

${subCategories ? `**4. 서브 카테고리 목록:**
${JSON.stringify(subCategories.map((s: any) => ({
  code: s.code,
  name: s.name
})), null, 2)}` : ''}

위 정보를 바탕으로 최적의 선택을 JSON으로 반환해주세요.
`;

    const model = getModel(0.4); // 약간의 창의성 허용

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<AnalyzeNeedsResponse>(response);

    return NextResponse.json({ success: true, data: parsed });

  } catch (error) {
    console.error('Analyze Needs error:', error);
    return NextResponse.json(
      { error: 'AI 분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}

