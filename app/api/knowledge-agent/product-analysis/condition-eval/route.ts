/**
 * Knowledge Agent - Condition Evaluation API
 *
 * PDP 선호 포인트용 조건 평가 생성
 * - shortReason: "왜 추천했나요?" 심플 1문장 (15-25자)
 * - evidence: "주요 포인트" 상세 2문장
 * - contextMatch: 종합 추천 이유
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  name: string;
  brand?: string;
  price?: number;
  specSummary?: string;
  recommendReason?: string;
  highlights?: string[];
  concerns?: string[];
  reviews?: Array<{
    content: string;
    rating: number;
  }>;
}

// 사용자 컨텍스트 타입
interface UserContext {
  collectedInfo?: Record<string, string>;
  balanceSelections?: Array<{
    questionId: string;
    selectedLabel: string;
    selectedKey: string;
    questionText?: string;
  }>;
  negativeSelections?: string[];
  conversationSummary?: string;
  questionTodos?: Array<{
    id: string;
    question: string;
  }>;
}

// FilterTag 타입
interface FilterTag {
  id: string;
  label: string;
  category: string;
  sourceType?: 'balance' | 'negative' | 'collected' | 'free_input';
  originalCondition?: string;
}

// 사전 평가 결과
interface PreEvaluation {
  score: 'full' | 'partial' | null;
  evidence?: string;
  conditionType?: 'hardFilter' | 'balance' | 'negative';
}

// 조건 충족도 평가 타입
interface ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
  evidence: string;
  shortReason?: string;
  questionId?: string;
}

// 상황 적합성 타입
interface ContextMatch {
  explanation: string;
  matchedPoints: string[];
}

// 결과 타입
interface ConditionEvalResult {
  pcode: string;
  selectedConditionsEvaluation: ConditionEvaluation[];
  contextMatch?: ContextMatch;
}

// 요청 타입
interface ConditionEvalRequest {
  categoryName: string;
  products: ProductInfo[];
  userContext: UserContext;
  preEvaluations?: Record<string, Record<string, PreEvaluation>>;
  filterTags?: FilterTag[];
}

// 응답 타입
interface ConditionEvalResponse {
  success: boolean;
  data?: {
    results: ConditionEvalResult[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

const normalizeShortReasons = (conditions: ConditionEvaluation[]): ConditionEvaluation[] => {
  return conditions.map((condition) => {
    if (condition.shortReason) return condition;
    const evidence = condition.evidence || '';
    const firstSentenceMatch = evidence.match(/^[^.!?]+[.!?]/);
    const shortReason = (firstSentenceMatch ? firstSentenceMatch[0] : evidence).trim();
    return {
      ...condition,
      shortReason: shortReason || condition.condition,
    };
  });
};

/**
 * Fallback 분석 생성 (preEvaluations 우선 사용)
 */
function generateFallbackAnalysis(
  product: ProductInfo,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): ConditionEvalResult {
  const selectedConditionsEvaluation: ConditionEvaluation[] = [];

  // preEvaluations가 있으면 우선 사용
  if (preEvaluations && filterTags && filterTags.length > 0) {
    filterTags.forEach(tag => {
      const preEval = preEvaluations[tag.id];
      if (preEval && preEval.score) {
        const conditionType = tag.sourceType === 'balance' ? 'balance' :
                              tag.sourceType === 'negative' ? 'negative' : 'hardFilter';

        let status: ConditionEvaluation['status'];
        if (conditionType === 'negative') {
          status = preEval.score === 'full' ? '회피됨' :
                   preEval.score === 'partial' ? '부분회피' : '회피안됨';
        } else {
          status = preEval.score === 'full' ? '충족' :
                   preEval.score === 'partial' ? '부분충족' : '불충족';
        }

        const fullEvidence = preEval.evidence || '상세 스펙에서 해당 정보를 확인하기 어려워요.';
        const firstSentenceMatch = fullEvidence.match(/^[^.!?]+[.!?]/);
        const shortReason = firstSentenceMatch ? firstSentenceMatch[0] : fullEvidence;

        selectedConditionsEvaluation.push({
          condition: tag.label,
          conditionType,
          status,
          evidence: fullEvidence,
          shortReason: shortReason,
        });
      }
    });

    if (selectedConditionsEvaluation.length > 0) {
      let contextExplanation = '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.';
      const mainConditions: string[] = [];

      if (userContext.collectedInfo) {
        Object.values(userContext.collectedInfo)
          .filter((val) => val && val !== '상관없어요' && typeof val === 'string')
          .slice(0, 2)
          .forEach((val) => mainConditions.push(val as string));
      }
      if (userContext.balanceSelections && userContext.balanceSelections.length > 0) {
        mainConditions.push(userContext.balanceSelections[0].selectedLabel);
      }

      if (mainConditions.length > 0) {
        const condStr = mainConditions.slice(0, 2).join(', ');
        contextExplanation = `${condStr} 등 말씀하신 조건들을 고려해 선정한 제품이에요. 상세 스펙과 리뷰를 확인해보시면 더 많은 정보를 얻으실 수 있어요.`;
      }

      return {
        pcode: product.pcode,
        selectedConditionsEvaluation,
        contextMatch: userContext.conversationSummary || (userContext.collectedInfo && Object.keys(userContext.collectedInfo).length > 0) ? {
          explanation: contextExplanation,
          matchedPoints: [],
        } : undefined,
      };
    }
  }

  // questionId -> 질문 텍스트 매핑
  const questionIdToText: Record<string, string> = {};
  if (userContext.questionTodos) {
    userContext.questionTodos.forEach(q => {
      questionIdToText[q.id] = q.question;
    });
  }

  // 하드필터 조건
  if (userContext.collectedInfo) {
    Object.entries(userContext.collectedInfo).forEach(([questionId, answer]) => {
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        const questionText = questionIdToText[questionId] || questionId;
        selectedConditionsEvaluation.push({
          condition: `${questionText}: ${answer}`,
          conditionType: 'hardFilter',
          questionId: questionId,
          status: '부분충족',
          shortReason: '상세 스펙에서 확인이 어려워요.',
          evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
        });
      }
    });
  }

  // 밸런스 선택
  userContext.balanceSelections?.forEach(b => {
    const questionText = b.questionText || b.selectedLabel;
    selectedConditionsEvaluation.push({
      condition: `${questionText}: ${b.selectedLabel}`,
      conditionType: 'balance',
      questionId: b.questionId,
      status: '부분충족',
      shortReason: '상세 스펙에서 확인이 어려워요.',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  // 피할 단점
  userContext.negativeSelections?.forEach(neg => {
    selectedConditionsEvaluation.push({
      condition: neg,
      conditionType: 'negative',
      status: '부분회피',
      shortReason: '상세 스펙에서 확인이 어려워요.',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  let contextExplanation = '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.';
  const mainConditions: string[] = [];

  if (userContext.collectedInfo) {
    Object.values(userContext.collectedInfo)
      .filter((val) => val && val !== '상관없어요' && typeof val === 'string')
      .slice(0, 2)
      .forEach((val) => mainConditions.push(val as string));
  }
  if (userContext.balanceSelections && userContext.balanceSelections.length > 0) {
    mainConditions.push(userContext.balanceSelections[0].selectedLabel);
  }

  if (mainConditions.length > 0) {
    const condStr = mainConditions.slice(0, 2).join(', ');
    contextExplanation = `${condStr} 등 말씀하신 조건들을 고려해 선정한 제품이에요. 상세 스펙과 리뷰를 확인해보시면 더 많은 정보를 얻으실 수 있어요.`;
  }

  return {
    pcode: product.pcode,
    selectedConditionsEvaluation,
    contextMatch: userContext.conversationSummary || (userContext.collectedInfo && Object.keys(userContext.collectedInfo).length > 0) ? {
      explanation: contextExplanation,
      matchedPoints: [],
    } : undefined,
  };
}

async function analyzeProductConditions(
  product: ProductInfo,
  categoryName: string,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): Promise<ConditionEvalResult> {
  if (!ai) {
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }

  // 🔧 항상 LLM 호출 (preEvaluations는 참고 정보로만 사용)
  // preEvaluations에서 evidence 추출 (프롬프트 힌트용)
  const preEvalHints: string[] = [];
  if (preEvaluations && filterTags) {
    filterTags.forEach(tag => {
      const preEval = preEvaluations[tag.id];
      if (preEval && preEval.score && preEval.evidence) {
        const statusText = tag.sourceType === 'negative'
          ? (preEval.score === 'full' ? '회피됨' : preEval.score === 'partial' ? '부분회피' : '회피안됨')
          : (preEval.score === 'full' ? '충족' : preEval.score === 'partial' ? '부분충족' : '불충족');
        preEvalHints.push(`- "${tag.label}": ${statusText} - ${preEval.evidence}`);
      }
    });
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4096,
    },
  });

  // 리뷰 정보 포맷팅
  const reviewStr = product.reviews && product.reviews.length > 0
    ? product.reviews.slice(0, 10).map((r, i) =>
        `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 400 ? '...' : ''}"`
      ).join('\n')
    : '리뷰 없음';

  // 사용자 선택 조건들 준비
  const questionIdToText: Record<string, string> = {};
  if (userContext.questionTodos) {
    userContext.questionTodos.forEach(q => {
      questionIdToText[q.id] = q.question;
    });
  }

  const hardFilterConditions: Array<{ questionId: string; questionText: string; label: string }> = [];
  if (userContext.collectedInfo) {
    Object.entries(userContext.collectedInfo).forEach(([questionId, answer]) => {
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        const questionText = questionIdToText[questionId] || questionId;
        hardFilterConditions.push({ questionId, questionText, label: answer });
      }
    });
  }

  const balanceConditions = (userContext.balanceSelections || []).map(b => ({
    questionId: b.questionId,
    questionText: b.questionText || b.selectedLabel,
    selectedLabel: b.selectedLabel,
  }));
  const negativeConditions = userContext.negativeSelections || [];

  const hasUserConditions = hardFilterConditions.length > 0 || balanceConditions.length > 0 || negativeConditions.length > 0;
  const hasConversation = !!userContext.conversationSummary;

  // 조건 평가 섹션
  const conditionSection = hasUserConditions ? `
## 사용자 선택 조건
${hardFilterConditions.length > 0 ? `### 필수 조건 (맞춤 질문 응답)
${hardFilterConditions.map((c, i) => `${i + 1}. **${c.questionText}** → "${c.label}"`).join('\n')}` : ''}
${balanceConditions.length > 0 ? `### 선호 속성 (사용자 선호)
${balanceConditions.map((c, i) => `${i + 1}. **${c.questionText}** → "${c.selectedLabel}"`).join('\n')}` : ''}
${negativeConditions.length > 0 ? `### 피할 단점
${negativeConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}
` : '';

  const conditionFormat = hasUserConditions ? `
  "selectedConditionsEvaluation": [
    ${hardFilterConditions.map(c => `{
      "condition": "${c.questionText}: ${c.label}",
      "conditionType": "hardFilter",
      "questionId": "${c.questionId}",
      "status": "충족 또는 불충족",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    ${balanceConditions.map(c => `{
      "condition": "${c.questionText}: ${c.selectedLabel}",
      "conditionType": "balance",
      "questionId": "${c.questionId}",
      "status": "충족/부분충족/불충족 중 하나",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "회피됨/부분회피/회피안됨 중 하나",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}
  ],` : '';

  // 상황 적합성 섹션
  const userConditions = userContext.collectedInfo
    ? Object.entries(userContext.collectedInfo)
        .filter(([key]) => !key.startsWith('__'))
        .map(([q, a]) => `- ${q}: ${a}`)
        .join('\n')
    : '';

  const userPriorities = userContext.balanceSelections && userContext.balanceSelections.length > 0
    ? userContext.balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n')
    : '';

  const contextSection = hasConversation ? `
## 사용자 조건 및 우선순위
${userConditions ? `### 질문 응답\n${userConditions}\n` : ''}
${userPriorities ? `### 우선순위\n${userPriorities}\n` : ''}
${userContext.conversationSummary ? `### 대화 요약\n"${userContext.conversationSummary}"\n` : ''}
` : '';

  const contextFormat = hasConversation ? `
  "contextMatch": {
    "explanation": "사용자 맞춤형 추천 이유 (2-3문장)",
    "matchedPoints": ["매칭 포인트1", "매칭 포인트2"]
  }` : '';

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
사용자가 선택한 조건을 이 제품이 얼마나 충족하는지 분석해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 제품 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 제품명: ${product.name}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '미정'}
- 스펙: ${product.specSummary || '정보 없음'}
- 추천 이유: ${product.recommendReason || '정보 없음'}

## 리뷰
${reviewStr}
${conditionSection}${contextSection}${preEvalHints.length > 0 ? `
## 참고: 사전 분석 결과 (이 상품이 사용자 요구를 충족한 것들 참고용 - 자연스러운 문장으로 재작성하세요)
${preEvalHints.join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 필드 작성 규칙 (매우 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1️⃣ shortReason - "왜 추천했나요?" 섹션용
**용도**: PDP 상단의 "왜 추천했나요?" 리스트 항목으로 표시
**형식**: 구체적인 1문장 (20-40자, 제품의 실제 스펙/수치 포함)

#### ✅ Good Examples (구체적 수치/스펙 포함)
- "IH 압력 방식으로 1,050W 고출력 가열이 가능해요."
- "에코 스테인리스 내솥으로 코팅 벗겨짐 걱정이 없어요."
- "10인용(1.8L) 대용량으로 4인 가족도 넉넉하게 사용해요."
- "35dB 저소음 설계로 밤에도 조용하게 사용할 수 있어요."
- "접이식 프레임으로 차 트렁크에 쉽게 수납돼요."
- "5.8kg 경량 설계로 한 손으로도 들어올릴 수 있어요."

#### ❌ Bad Examples (너무 추상적)
- "최상급 핸들링과 안정적인 주행을 제공합니다." ← 구체적 수치 없음
- "아기의 편안함을 위한 기능을 제공합니다." ← 어떤 기능인지 불명확
- "선호하는 브랜드를 충족합니다." ← 당연한 말, 가치 없음

### 2️⃣ evidence - "주요 포인트" 섹션용
**용도**: PDP의 "주요 포인트" Q/A 섹션에서 상세 설명으로 표시
**형식**: 자세한 2문장 (첫 문장: 핵심 특성, 두 번째 문장: 구체적 근거/리뷰)

#### ✅ Good Examples
- "IH 압력 방식으로 빠르고 균일하게 가열돼요. 리뷰에서도 '밥이 고르게 익어 맛있다'는 평가가 많습니다."
- "에코 스테인리스 내솥을 사용해 내구성이 뛰어나요. 코팅이 벗겨질 걱정 없이 오래 사용할 수 있습니다."

### 공통 규칙
1. **제품 관점**으로 작성 - "이 제품은 ~해요" 형식
2. **구체적 수치/스펙 필수** - 추상적 표현 금지, 실제 수치(용량, 무게, 전력, 소음 dB 등) 포함
3. **사용자 조건 반복 금지** - "~하시는군요", "선호하는 ~를 충족합니다" 금지
4. **당연한 말 금지** - "브랜드를 충족", "기능을 제공" 같은 무의미한 표현 금지
5. 근거가 없으면 "상세 스펙 확인 필요" 사용
6. **최대 6개까지만 생성** - 조건이 많아도 가장 중요한 6개만 선택 (우선순위: 충족 > 부분충족 > 회피됨)
7. **각 문장은 서로 다른 정보** 포함 - 중복 금지

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 JSON 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{${conditionFormat}${contextFormat}
}

JSON만 응답하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[condition-eval] No JSON found in response');
      return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      pcode: product.pcode,
      selectedConditionsEvaluation: normalizeShortReasons(parsed.selectedConditionsEvaluation || []),
      contextMatch: parsed.contextMatch,
    };
  } catch (error) {
    console.error(`[condition-eval] Failed to analyze ${product.pcode}:`, error);
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ConditionEvalResponse>> {
  try {
    const body: ConditionEvalRequest = await request.json();
    const { categoryName, products, userContext, preEvaluations, filterTags } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    console.log(`[condition-eval] Processing ${products.length} products for ${categoryName}`);

    // 병렬로 분석
    const analysisPromises = products.map(product => {
      const productPreEval = preEvaluations?.[product.pcode];
      return analyzeProductConditions(product, categoryName, userContext, productPreEval, filterTags);
    });

    const results = await Promise.all(analysisPromises);
    const generated_by = ai ? 'llm' : 'fallback';

    console.log(`[condition-eval] Complete: ${results.length} results (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        results,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[condition-eval] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate conditions' },
      { status: 500 }
    );
  }
}
