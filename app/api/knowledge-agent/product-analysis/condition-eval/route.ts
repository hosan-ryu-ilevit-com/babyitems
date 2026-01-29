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
    // 이미 shortReason이 있고 충분히 길면 그대로 사용
    if (condition.shortReason && condition.shortReason.trim().length > 10) {
      return condition;
    }

    // evidence에서 첫 문장 추출
    const evidence = condition.evidence || '';
    const firstSentenceMatch = evidence.match(/^[^.!?]+[.!?]/);
    let shortReason = (firstSentenceMatch ? firstSentenceMatch[0] : evidence).trim();

    // shortReason이 여전히 비어있거나 너무 짧으면 condition을 기반으로 생성
    if (!shortReason || shortReason.length < 10) {
      const conditionText = condition.condition;
      const conditionType = condition.conditionType;
      const status = condition.status;

      // "질문: 답변" 형식이면 답변 부분만 사용
      if (conditionText.includes(':')) {
        const parts = conditionText.split(':', 2);
        const answer = parts[1].trim();

        if (conditionType === 'negative') {
          // 부정 조건
          if (status === '회피됨' || status === '부분회피') {
            shortReason = `${answer} 문제를 최소화했어요.`;
          } else {
            shortReason = `${answer} 관련 정보를 확인해보세요.`;
          }
        } else {
          // 긍정 조건
          if (status === '충족' || status === '부분충족') {
            shortReason = `${answer} 조건을 고려해 선정했어요.`;
          } else {
            shortReason = `${answer} 관련 상세 스펙을 확인해보세요.`;
          }
        }
      } else {
        // 질문 형식이 아닌 경우
        if (conditionType === 'negative') {
          shortReason = `${conditionText} 문제를 고려했어요.`;
        } else {
          shortReason = `${conditionText} 특성을 반영했어요.`;
        }
      }
    }

    return {
      ...condition,
      shortReason,
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
          shortReason: `${answer} 조건을 고려해 선정했어요.`,
          evidence: '말씀하신 조건을 종합적으로 고려해 선정한 제품이에요. 상세 스펙과 리뷰를 확인해보시면 더 많은 정보를 얻으실 수 있어요.',
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
      shortReason: `${b.selectedLabel} 특성을 고려해 선정했어요.`,
      evidence: '선호하신 속성을 반영해 선정한 제품이에요. 실제 사용 리뷰를 확인하시면 더 자세한 정보를 얻으실 수 있어요.',
    });
  });

  // 피할 단점
  userContext.negativeSelections?.forEach(neg => {
    selectedConditionsEvaluation.push({
      condition: neg,
      conditionType: 'negative',
      status: '부분회피',
      shortReason: `${neg} 문제를 최소화한 제품이에요.`,
      evidence: '피하고 싶어하신 단점을 고려해 선정한 제품이에요. 리뷰를 확인하시면 실제 사용자 경험을 알 수 있어요.',
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
      "shortReason": "심플한 1문장 (필수! 빈 문자열 금지)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    ${balanceConditions.map(c => `{
      "condition": "${c.questionText}: ${c.selectedLabel}",
      "conditionType": "balance",
      "questionId": "${c.questionId}",
      "status": "충족/부분충족/불충족 중 하나",
      "shortReason": "심플한 1문장 (필수! 빈 문자열 금지)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "회피됨/부분회피/회피안됨 중 하나",
      "shortReason": "심플한 1문장 (필수! 빈 문자열 금지)",
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

### 🚨 필수 규칙: shortReason은 절대 비워두지 마세요!
모든 조건에 대해 **반드시 shortReason을 생성**해야 합니다. 스펙 데이터가 부족하더라도 사용자가 선택한 조건을 언급하는 문장을 만드세요.

### 1️⃣ shortReason - "왜 추천했나요?" 섹션용
**용도**: PDP 상단의 "왜 추천했나요?" 리스트 항목으로 표시
**형식**: 구체적인 1문장 (20-40자, 가능하면 제품의 실제 스펙/수치 포함)

#### ✅ Good Examples (구체적 수치/스펙 포함)
- "IH 압력 방식으로 1,050W 고출력 가열이 가능해요."
- "에코 스테인리스 내솥으로 코팅 벗겨짐 걱정이 없어요."
- "10인용(1.8L) 대용량으로 4인 가족도 넉넉하게 사용해요."

#### 🆗 Acceptable (스펙 데이터 부족 시)
스펙 데이터가 부족하면 사용자 조건을 언급하는 문장으로 대체 가능:
- "말씀하신 브랜드 선호도를 반영한 제품이에요."
- "요청하신 용량 조건을 고려해 선정했어요."

#### ❌ Bad Examples (절대 사용 금지)
- "" (빈 문자열) ← 절대 금지!
- "상세 스펙에서 확인이 어려워요." ← 무의미한 메시지
- "최상급 핸들링과 안정적인 주행을 제공합니다." ← 너무 추상적

### 2️⃣ evidence - "주요 포인트" 섹션용
**용도**: PDP의 "주요 포인트" Q/A 섹션에서 상세 설명으로 표시
**형식**: 자세한 2문장 (첫 문장: 핵심 특성, 두 번째 문장: 구체적 근거/리뷰)

#### ✅ Good Examples
- "IH 압력 방식으로 빠르고 균일하게 가열돼요. 리뷰에서도 '밥이 고르게 익어 맛있다'는 평가가 많습니다."
- "에코 스테인리스 내솥을 사용해 내구성이 뛰어나요. 코팅이 벗겨질 걱정 없이 오래 사용할 수 있습니다."

### 공통 규칙
1. **제품 관점**으로 작성 - "이 제품은 ~해요" 형식
2. **구체적 수치/스펙 우선** - 가능하면 실제 수치(용량, 무게, 전력, 소음 dB 등) 포함
3. **shortReason은 절대 비우지 않기** - 스펙 데이터 부족 시 사용자 조건을 언급하는 문장으로 대체
4. **사용자 조건 직접 반복 금지** - "~하시는군요", "충족합니다" 같은 당연한 표현 금지
5. **당연한 말 금지** - 구체적 정보가 없는 무의미한 표현 사용 금지
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

    // 🔍 디버깅: LLM이 생성한 원본 데이터 로깅
    console.log(`[condition-eval] LLM response for ${product.pcode}:`, JSON.stringify({
      conditionCount: parsed.selectedConditionsEvaluation?.length || 0,
      hasContextMatch: !!parsed.contextMatch,
      shortReasonCount: parsed.selectedConditionsEvaluation?.filter((c: ConditionEvaluation) => c.shortReason).length || 0
    }));

    const normalized = normalizeShortReasons(parsed.selectedConditionsEvaluation || []);

    // 🔍 디버깅: normalize 후 shortReason 상태 확인
    const emptyShortReasons = normalized.filter(c => !c.shortReason || c.shortReason.trim() === '');
    if (emptyShortReasons.length > 0) {
      console.warn(`[condition-eval] ⚠️ ${product.pcode}: ${emptyShortReasons.length}개 조건의 shortReason이 비어있음`);
    }

    return {
      pcode: product.pcode,
      selectedConditionsEvaluation: normalized,
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
