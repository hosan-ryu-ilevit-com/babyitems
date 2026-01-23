/**
 * Knowledge Agent - Product Analysis API
 *
 * Top3 상품에 대한 상세 분석 생성:
 * - selectedConditionsEvaluation: 조건 충족도 평가 (밸런스, 단점)
 * - contextMatch: 사용자 상황과의 적합성
 * - additionalPros/cons: 추가 장단점
 *
 * recommend-v2의 product-analysis와 유사하지만 knowledge-agent 컨텍스트에 맞게 조정
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
  collectedInfo?: Record<string, string>;  // 하드필터 질문-응답 (questionId -> 답변)
  balanceSelections?: Array<{
    questionId: string;
    selectedLabel: string;
    selectedKey: string;
  }>;
  negativeSelections?: string[];  // 피할 단점 레이블
  conversationSummary?: string;   // 대화 요약
  questionTodos?: Array<{         // 질문 목록 (질문 텍스트 복원용)
    id: string;
    question: string;
  }>;
}

// 조건 충족도 평가 타입
interface ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
  evidence: string;
  questionId?: string;
}

// 상황 적합성 타입
interface ContextMatch {
  explanation: string;
  matchedPoints: string[];
}

// 제품 분석 결과 타입
interface ProductAnalysis {
  pcode: string;
  selectedConditionsEvaluation: ConditionEvaluation[];
  contextMatch?: ContextMatch;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
}

// 🆕 FilterTag 타입 (final-recommend에서 전달)
interface FilterTag {
  id: string;
  label: string;
  category: string;
  sourceType?: 'balance' | 'negative' | 'collected' | 'free_input';
  originalCondition?: string;
}

// 🆕 사전 평가 결과 (final-recommend의 tagScores)
interface PreEvaluation {
  score: 'full' | 'partial' | null;
  evidence?: string;
  conditionType?: 'hardFilter' | 'balance' | 'negative';
}

// 요청 타입
interface ProductAnalysisRequest {
  categoryKey: string;
  categoryName: string;
  products: ProductInfo[];
  userContext: UserContext;
  // 🆕 final-recommend에서 전달된 사전 평가 결과
  preEvaluations?: Record<string, Record<string, PreEvaluation>>;  // pcode -> tagId -> evaluation
  filterTags?: FilterTag[];
}

// 응답 타입
interface ProductAnalysisResponse {
  success: boolean;
  data?: {
    analyses: ProductAnalysis[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 단일 제품 분석 생성
 * @param preEvaluations - final-recommend에서 전달된 사전 평가 결과 (tagScores)
 * @param filterTags - final-recommend에서 생성된 필터 태그
 */
async function analyzeProduct(
  product: ProductInfo,
  categoryName: string,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): Promise<ProductAnalysis> {
  if (!ai) {
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }

  // 🆕 preEvaluations가 있고 대부분의 태그에 대한 평가가 있으면 바로 사용 (PLP-PDP 일관성 보장)
  if (preEvaluations && filterTags && filterTags.length > 0) {
    const evaluatedCount = filterTags.filter(tag => preEvaluations[tag.id]?.score).length;
    const coverageRatio = evaluatedCount / filterTags.length;

    // 50% 이상 평가가 있으면 fallback 사용 (PLP와 동일한 결과 보장)
    if (coverageRatio >= 0.5) {
      console.log(`[product-analysis] Using preEvaluations directly for ${product.pcode} (${evaluatedCount}/${filterTags.length} tags, ${Math.round(coverageRatio * 100)}%)`);
      return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
    }
  }

  // preEvaluations에서 evidence 추출 (LLM 프롬프트에 참고 정보로 제공)
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
    if (preEvalHints.length > 0) {
      console.log(`[product-analysis] Using ${preEvalHints.length} preEvaluation hints for ${product.pcode}`);
    }
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

  // 사용자 선택 조건들 준비 (questionId -> 질문 텍스트 매핑)
  const questionIdToText: Record<string, string> = {};
  if (userContext.questionTodos) {
    userContext.questionTodos.forEach(q => {
      questionIdToText[q.id] = q.question;
    });
  }

  const hardFilterConditions: Array<{ questionId: string; questionText: string; label: string }> = [];
  if (userContext.collectedInfo) {
    Object.entries(userContext.collectedInfo).forEach(([questionId, answer]) => {
      // 내부 키(__로 시작)는 제외
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        // questionTodos에서 질문 텍스트 복원, 없으면 questionId 그대로 사용
        const questionText = questionIdToText[questionId] || questionId;
        hardFilterConditions.push({ questionId, questionText, label: answer });
      }
    });
  }

  // balanceSelections에서 questionText 포함된 객체로 변환
  const balanceConditions = (userContext.balanceSelections || []).map(b => ({
    questionId: b.questionId,
    questionText: (b as any).questionText || b.selectedLabel, // questionText가 있으면 사용, 없으면 selectedLabel
    selectedLabel: b.selectedLabel,
  }));
  const negativeConditions = userContext.negativeSelections || [];

  const hasUserConditions = hardFilterConditions.length > 0 || balanceConditions.length > 0 || negativeConditions.length > 0;
  const hasConversation = !!userContext.conversationSummary;

  // 조건 평가 섹션 (질문 텍스트 + 답변 함께 표시)
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
      "evidence": "근거 1문장"
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    ${balanceConditions.map(c => `{
      "condition": "${c.questionText}: ${c.selectedLabel}",
      "conditionType": "balance",
      "questionId": "${c.questionId}",
      "status": "충족/부분충족/불충족 중 하나",
      "evidence": "근거 1문장"
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "회피됨/부분회피/회피안됨 중 하나",
      "evidence": "근거 1문장"
    }`).join(',\n    ')}
  ],` : '';

  // 상황 적합성 섹션
  const contextSection = hasConversation ? `
## 사용자 대화 요약
"${userContext.conversationSummary}"

이 제품이 사용자 상황에 얼마나 적합한지 평가해주세요.
` : '';

  const contextFormat = hasConversation ? `
  "contextMatch": {
    "explanation": "사용자 상황에 맞는 이유 1문장",
    "matchedPoints": ["매칭 포인트1", "매칭 포인트2"]
  },` : '';

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
## 참고: 사전 분석 결과 (이 정보를 우선 활용하세요)
${preEvalHints.join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## evidence 작성 규칙 (매우 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

evidence는 PDP 상단 "왜 추천했나요?" 섹션에 표시되는 핵심 문장입니다.
전문적이면서도 친근한 톤으로, 사용자에게 확신을 주는 문장을 작성하세요.

### 작성 원칙
1. 스펙 또는 리뷰에서 명확한 근거를 찾아 작성
2. 근거가 없으면 절대 추측하지 말고, "확인 필요" 문장 사용
3. 사용자 조건과 제품 특성을 자연스럽게 연결

### Good Example
- 텐키리스(87키) 배열로 책상 공간을 효율적으로 활용할 수 있어요.
- 3단계 가열 조절이 가능해 상황에 맞게 사용할 수 있어요.
- 리뷰에서 "소음이 거의 없다"는 평가가 많아요.

### 근거 부족 시
스펙이나 리뷰에서 해당 조건을 확인할 수 없을 때:
- status: "부분충족" 또는 "불충족"
- evidence: "스펙이나 리뷰에서 관련 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 JSON 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{${conditionFormat}${contextFormat}
  "additionalPros": [
    { "text": "추가 장점 1", "citations": [] },
    { "text": "추가 장점 2", "citations": [] }
  ],
  "cons": [
    { "text": "주의점 1", "citations": [] },
    { "text": "주의점 2", "citations": [] }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 주의사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- JSON만 응답
- status 값은 정확히 지정된 값만 사용
- evidence에 이모티콘, 볼드(**) 사용 금지
- 추측성 표현 금지
- "사용자는 ~를 선택했습니다" 같은 기계적 표현 금지`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // JSON 추출
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[product-analysis] No JSON found in response');
      return generateFallbackAnalysis(product, userContext);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      pcode: product.pcode,
      selectedConditionsEvaluation: parsed.selectedConditionsEvaluation || [],
      contextMatch: parsed.contextMatch,
      additionalPros: parsed.additionalPros || [],
      cons: parsed.cons || [],
    };
  } catch (error) {
    console.error(`[product-analysis] Failed to analyze ${product.pcode}:`, error);
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }
}

/**
 * Fallback 분석 생성 (preEvaluations 우선 사용)
 */
function generateFallbackAnalysis(
  product: ProductInfo,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): ProductAnalysis {
  const selectedConditionsEvaluation: ConditionEvaluation[] = [];

  // 🆕 preEvaluations가 있으면 우선 사용
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

        selectedConditionsEvaluation.push({
          condition: tag.label,  // PLP 태그와 동일한 label 사용 (일관성)
          conditionType,
          status,
          evidence: preEval.evidence || '상세 스펙에서 해당 정보를 확인하기 어려워요.',
        });
      }
    });

    // preEvaluations로 처리했으면 여기서 리턴
    if (selectedConditionsEvaluation.length > 0) {
      const additionalPros = (product.highlights || []).map(text => ({ text, citations: [] }));
      const cons = (product.concerns || []).map(text => ({ text, citations: [] }));

      return {
        pcode: product.pcode,
        selectedConditionsEvaluation,
        contextMatch: userContext.conversationSummary ? {
          explanation: '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.',
          matchedPoints: [],
        } : undefined,
        additionalPros,
        cons,
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
      // 내부 키(__로 시작)는 제외
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        const questionText = questionIdToText[questionId] || questionId;
        selectedConditionsEvaluation.push({
          condition: `${questionText}: ${answer}`,
          conditionType: 'hardFilter',
          questionId: questionId,
          status: '부분충족',
          evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
        });
      }
    });
  }

  // 밸런스 선택 (선호 속성)
  userContext.balanceSelections?.forEach(b => {
    const questionText = (b as any).questionText || b.selectedLabel;
    selectedConditionsEvaluation.push({
      condition: `${questionText}: ${b.selectedLabel}`,
      conditionType: 'balance',
      questionId: b.questionId,
      status: '부분충족',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  // 피할 단점
  userContext.negativeSelections?.forEach(neg => {
    selectedConditionsEvaluation.push({
      condition: neg,
      conditionType: 'negative',
      status: '부분회피',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  // 기존 highlights/concerns 활용
  const additionalPros = (product.highlights || []).map(text => ({
    text,
    citations: [],
  }));

  const cons = (product.concerns || []).map(text => ({
    text,
    citations: [],
  }));

  return {
    pcode: product.pcode,
    selectedConditionsEvaluation,
    contextMatch: userContext.conversationSummary ? {
      explanation: '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.',
      matchedPoints: [],
    } : undefined,
    additionalPros,
    cons,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryKey, categoryName, products, userContext, preEvaluations, filterTags } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    const hasPreEvaluations = preEvaluations && Object.keys(preEvaluations).length > 0;
    console.log(`[knowledge-agent/product-analysis] Analyzing ${products.length} products for ${categoryKey}${hasPreEvaluations ? ' (with preEvaluations)' : ''}`);

    // 병렬로 분석 (preEvaluations 전달) - Top 5 지원
    const ANALYSIS_LIMIT = 5;  // 기존 3 → 5
    const analysisPromises = products.slice(0, ANALYSIS_LIMIT).map(product => {
      const productPreEval = preEvaluations?.[product.pcode];
      return analyzeProduct(product, categoryName || categoryKey, userContext, productPreEval, filterTags);
    });

    const analyses = await Promise.all(analysisPromises);
    const generated_by = ai ? 'llm' : 'fallback';

    console.log(`[knowledge-agent/product-analysis] Complete: ${analyses.length} analyses (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        analyses,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[knowledge-agent/product-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze products' },
      { status: 500 }
    );
  }
}
