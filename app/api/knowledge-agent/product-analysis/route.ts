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

// 요청 타입
interface ProductAnalysisRequest {
  categoryKey: string;
  categoryName: string;
  products: ProductInfo[];
  userContext: UserContext;
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
 */
async function analyzeProduct(
  product: ProductInfo,
  categoryName: string,
  userContext: UserContext
): Promise<ProductAnalysis> {
  if (!ai) {
    return generateFallbackAnalysis(product, userContext);
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
    ? product.reviews.slice(0, 5).map((r, i) =>
        `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
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

  const prompt = `당신은 ${categoryName} 전문 리뷰어입니다.
아래 제품에 대해 분석해주세요.

## 제품 정보
- 제품명: ${product.name}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '미정'}
- 스펙: ${product.specSummary || '정보 없음'}
- 추천 이유: ${product.recommendReason || '정보 없음'}

## 리뷰
${reviewStr}
${conditionSection}${contextSection}
## 분석 요청
다음 JSON 형식으로 응답해주세요:

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

중요:
- 실제 스펙과 리뷰를 기반으로 구체적으로 작성
- status 값은 정확히 지정된 값만 사용
- JSON만 응답`;

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
    return generateFallbackAnalysis(product, userContext);
  }
}

/**
 * Fallback 분석 생성
 */
function generateFallbackAnalysis(
  product: ProductInfo,
  userContext: UserContext
): ProductAnalysis {
  const selectedConditionsEvaluation: ConditionEvaluation[] = [];

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
          evidence: '스펙 정보로 정확한 확인이 어렵습니다.',
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
      evidence: '스펙 정보로 정확한 확인이 어렵습니다.',
    });
  });

  // 피할 단점
  userContext.negativeSelections?.forEach(neg => {
    selectedConditionsEvaluation.push({
      condition: neg,
      conditionType: 'negative',
      status: '부분회피',
      evidence: '스펙 정보로 정확한 확인이 어렵습니다.',
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
      explanation: '대화 내용을 기반으로 선정된 제품입니다.',
      matchedPoints: [],
    } : undefined,
    additionalPros,
    cons,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryKey, categoryName, products, userContext } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    console.log(`[knowledge-agent/product-analysis] Analyzing ${products.length} products for ${categoryKey}`);

    // 병렬로 분석
    const analysisPromises = products.slice(0, 3).map(product =>
      analyzeProduct(product, categoryName || categoryKey, userContext)
    );

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
