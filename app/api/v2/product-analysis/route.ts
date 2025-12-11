/**
 * V2 제품 상세 분석 API
 * POST /api/v2/product-analysis
 *
 * Top 3 제품에 대한 상세 분석을 생성합니다:
 * - additionalPros: 추가로 이런 점도 좋아요
 * - cons: 이런 점은 주의하세요
 * - purchaseTip: 구매 전 확인하세요
 *
 * 병렬 처리로 3개 제품을 동시에 분석합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getProModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  spec?: Record<string, unknown>;
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
  // Rule key / value → Korean label mappings
  balanceLabels?: Record<string, string>;
  negativeLabels?: Record<string, string>;
  hardFilterLabels?: Record<string, string>;
}

// 요청 타입
interface ProductAnalysisRequest {
  categoryKey: string;
  products: ProductInfo[];
  userContext?: UserContext;
}

// 조건 충족도 평가 항목 타입
interface ConditionEvaluation {
  condition: string;           // 원본 조건 텍스트
  conditionType: 'hardFilter' | 'balance' | 'negative';  // 조건 유형
  status: '충족' | '부분충족' | '불충족' | '개선됨' | '부분개선' | '회피안됨';  // 평가 상태
  evidence: string;            // 평가 근거
  tradeoff?: string;           // 트레이드오프 설명 (선택)
  questionId?: string;         // 하드필터 질문 ID (같은 질문 내 옵션 그룹화용)
}

// 제품 분석 결과 타입
interface ProductAnalysis {
  pcode: string;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations: number[] }>;
  selectedConditionsEvaluation?: ConditionEvaluation[];  // V2 조건 충족도 평가
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
  insights: CategoryInsights,
  userContext: UserContext
): Promise<ProductAnalysis> {
  const model = getProModel(0.5);

  // 스펙 정보 문자열화
  const specStr = product.spec
    ? Object.entries(product.spec)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 15)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '스펙 정보 없음';

  // 카테고리 인사이트에서 관련 정보 추출
  const categoryPros = insights.pros.slice(0, 5).map(p => p.text).join('\n');
  const categoryCons = insights.cons.slice(0, 5).map(c => `${c.text}${c.deal_breaker_for ? ` (치명적: ${c.deal_breaker_for})` : ''}`).join('\n');

  // 사용자 선택 조건들 준비 (한국어 레이블 사용, 'any' 제외)
  // questionId를 포함하여 같은 질문 내 옵션들을 그룹화할 수 있게 함
  const hardFilterLabels = userContext.hardFilterLabels || {};
  const hardFilterConditions: Array<{ questionId: string; label: string }> = [];
  if (userContext.hardFilterAnswers) {
    Object.entries(userContext.hardFilterAnswers).forEach(([questionId, values]) => {
      if (Array.isArray(values)) {
        values.forEach(v => {
          // Skip 'any' (상관없어요) - 실제 필터링 조건이 아님
          if (v === 'any') return;
          // Use Korean label from mapping if available
          const label = hardFilterLabels[v] || v;
          hardFilterConditions.push({ questionId, label });
        });
      } else if (typeof values === 'string') {
        // Skip 'any' (상관없어요)
        if (values === 'any') return;
        const label = hardFilterLabels[values] || values;
        hardFilterConditions.push({ questionId, label });
      }
    });
  }

  // Convert rule_keys to Korean labels using the mappings
  const balanceLabels = userContext.balanceLabels || {};
  const negativeLabels = userContext.negativeLabels || {};

  const balanceConditions = (userContext.balanceSelections || []).map(
    ruleKey => balanceLabels[ruleKey] || ruleKey.replace('체감속성_', '').replace(/_/g, ' ')
  );
  const negativeConditions = (userContext.negativeSelections || []).map(
    ruleKey => negativeLabels[ruleKey] || ruleKey.replace(/_/g, ' ')
  );

  const hasUserConditions = hardFilterConditions.length > 0 || balanceConditions.length > 0 || negativeConditions.length > 0;

  // 조건 평가 섹션 (조건이 있을 때만)
  const conditionEvaluationSection = hasUserConditions ? `
## 사용자 선택 조건
${hardFilterConditions.length > 0 ? `### 필수 조건 (하드 필터)
${hardFilterConditions.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}` : ''}

${balanceConditions.length > 0 ? `### 선호 속성 (밸런스 게임 선택)
${balanceConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

${negativeConditions.length > 0 ? `### 피하고 싶은 단점
${negativeConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

## 조건 충족도 평가 요청
위 사용자 조건들에 대해 이 제품이 얼마나 충족하는지 평가해주세요:
- **필수 조건/선호 속성**: "충족" (완벽히 만족) | "부분충족" (일부 만족) | "불충족" (만족 안 함)
- **피하고 싶은 단점**: "개선됨" (단점 없음) | "부분개선" (일부 단점 있음) | "회피안됨" (단점 존재)
` : '';

  const conditionEvaluationFormat = hasUserConditions ? `
  "selectedConditionsEvaluation": [
    // 필수 조건 평가 (${hardFilterConditions.length}개)
    ${hardFilterConditions.map(c => `{
      "condition": "${c.label}",
      "conditionType": "hardFilter",
      "questionId": "${c.questionId}",
      "status": "충족|부분충족|불충족",
      "evidence": "구체적 근거..."
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    // 선호 속성 평가 (${balanceConditions.length}개)
    ${balanceConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "balance",
      "status": "충족|부분충족|불충족",
      "evidence": "구체적 근거..."
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    // 피하고 싶은 단점 평가 (${negativeConditions.length}개)
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "개선됨|부분개선|회피안됨",
      "evidence": "구체적 근거...",
      "tradeoff": "(선택) 트레이드오프 설명"
    }`).join(',\n    ')}
  ],` : '';

  const prompt = `당신은 ${categoryName} 전문 리뷰어입니다.
아래 제품에 대해 실제 사용자 관점에서 분석해주세요.

## 제품 정보
- 제품명: ${product.title}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '가격 미정'}
- 주요 스펙:
${specStr}

## 이 카테고리의 일반적인 장점들
${categoryPros}

## 이 카테고리의 주요 단점/우려사항
${categoryCons}
${conditionEvaluationSection}
## 분석 요청
제품 스펙과 카테고리 특성을 고려하여 다음을 작성해주세요:

${hasUserConditions ? '1. **조건 충족도 평가 (selectedConditionsEvaluation)**: 사용자가 선택한 조건들에 대한 충족 여부 평가\n' : ''}${hasUserConditions ? '2' : '1'}. **추가 장점 (additionalPros)**: 스펙에서 유추할 수 있는 이 제품만의 추가 장점 2-3개
${hasUserConditions ? '3' : '2'}. **주의점 (cons)**: 이 제품 사용 시 주의해야 할 점 2-3개 (스펙 기반 추론)
${hasUserConditions ? '4' : '3'}. **구매 팁 (purchaseTip)**: 구매 전 확인해야 할 사항 1-2개

## 응답 JSON 형식
{${conditionEvaluationFormat}
  "additionalPros": [
    { "text": "장점 설명 (구체적으로)", "citations": [] }
  ],
  "cons": [
    { "text": "주의점 설명 (구체적으로)", "citations": [] }
  ],
  "purchaseTip": [
    { "text": "구매 팁 (구체적으로)", "citations": [] }
  ]
}

중요:
- 스펙 정보를 기반으로 구체적으로 작성
- 일반적인 내용이 아닌 이 제품에 특화된 내용으로
- 사용자 관점에서 실용적인 정보 위주로
- citations는 빈 배열로 (리뷰 인용 없음)
${hasUserConditions ? `- selectedConditionsEvaluation은 사용자가 선택한 조건 총 ${hardFilterConditions.length + balanceConditions.length + negativeConditions.length}개를 모두 평가해야 합니다
- evidence에는 핵심 키워드를 **볼드** 처리해주세요
- 필수 조건/선호 속성: status는 "충족", "부분충족", "불충족" 중 하나
- 피하고 싶은 단점: status는 "개선됨", "부분개선", "회피안됨" 중 하나` : ''}

JSON만 응답하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = parseJSONResponse(responseText) as {
      additionalPros?: Array<{ text: string; citations: number[] }>;
      cons?: Array<{ text: string; citations: number[] }>;
      purchaseTip?: Array<{ text: string; citations: number[] }>;
      selectedConditionsEvaluation?: ConditionEvaluation[];
    };

    // 잘못된 값 필터링 함수 (LLM이 "[]", "없음", 빈 문자열 등을 반환하는 경우)
    const filterInvalidTextItems = <T extends { text: string }>(items: T[] | undefined): T[] => {
      if (!Array.isArray(items)) return [];
      return items.filter(item => {
        if (!item || typeof item.text !== 'string') return false;
        const trimmed = item.text.trim();
        // 빈 문자열, "[]", "없음", "-" 등 무효한 값 제거
        if (!trimmed) return false;
        if (trimmed === '[]' || trimmed === '[ ]') return false;
        if (trimmed === '없음' || trimmed === '-' || trimmed === 'N/A') return false;
        return true;
      });
    };

    return {
      pcode: product.pcode,
      additionalPros: filterInvalidTextItems(parsed.additionalPros),
      cons: filterInvalidTextItems(parsed.cons),
      purchaseTip: filterInvalidTextItems(parsed.purchaseTip),
      selectedConditionsEvaluation: parsed.selectedConditionsEvaluation || [],
    };
  } catch (error) {
    console.error(`[product-analysis] Failed to analyze ${product.pcode}:`, error);
    // Fallback: 카테고리 인사이트 기반 기본 응답
    return generateFallbackAnalysis(product, insights, userContext);
  }
}

/**
 * Fallback 분석 생성
 */
function generateFallbackAnalysis(product: ProductInfo, insights: CategoryInsights, userContext: UserContext = {}): ProductAnalysis {
  // 카테고리 장점에서 랜덤하게 2개 선택
  const additionalPros = insights.pros.slice(0, 2).map(p => ({
    text: p.text,
    citations: [],
  }));

  // 카테고리 단점에서 랜덤하게 2개 선택
  const cons = insights.cons.slice(0, 2).map(c => ({
    text: c.text,
    citations: [],
  }));

  // 구매 팁
  const purchaseTip = [
    { text: '구매 전 실제 사용 리뷰를 확인해보세요.', citations: [] },
  ];

  // Fallback 조건 평가 생성
  const selectedConditionsEvaluation: ConditionEvaluation[] = [];

  // 하드 필터 조건 (한국어 레이블 사용, 'any' 제외)
  const hardFilterLabels = userContext.hardFilterLabels || {};
  if (userContext.hardFilterAnswers) {
    Object.entries(userContext.hardFilterAnswers).forEach(([questionId, values]) => {
      const conditionValues = Array.isArray(values) ? values : [values];
      conditionValues.forEach(v => {
        // Skip 'any' (상관없어요) - 실제 필터링 조건이 아님
        if (v === 'any') return;
        const label = hardFilterLabels[v] || v;
        selectedConditionsEvaluation.push({
          condition: label,
          conditionType: 'hardFilter',
          questionId,  // 같은 질문 내 옵션 그룹화용
          status: '부분충족',
          evidence: '스펙 정보로 정확한 확인이 어렵습니다. 상세 스펙을 확인해주세요.',
        });
      });
    });
  }

  // 밸런스 게임 선택 (한국어 레이블 사용)
  const balanceLabels = userContext.balanceLabels || {};
  userContext.balanceSelections?.forEach(ruleKey => {
    const label = balanceLabels[ruleKey] || ruleKey.replace('체감속성_', '').replace(/_/g, ' ');
    selectedConditionsEvaluation.push({
      condition: label,
      conditionType: 'balance',
      status: '부분충족',
      evidence: '스펙 정보로 정확한 확인이 어렵습니다. 상세 스펙을 확인해주세요.',
    });
  });

  // 피하고 싶은 단점 (한국어 레이블 사용)
  const negativeLabels = userContext.negativeLabels || {};
  userContext.negativeSelections?.forEach(ruleKey => {
    const label = negativeLabels[ruleKey] || ruleKey.replace(/_/g, ' ');
    selectedConditionsEvaluation.push({
      condition: label,
      conditionType: 'negative',
      status: '부분개선',
      evidence: '스펙 정보로 정확한 확인이 어렵습니다. 상세 스펙을 확인해주세요.',
    });
  });

  return {
    pcode: product.pcode,
    additionalPros,
    cons,
    purchaseTip,
    selectedConditionsEvaluation,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryKey, products, userContext = {} } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let analyses: ProductAnalysis[] = [];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable() && insights) {
      try {
        // 병렬로 3개 제품 분석
        const analysisPromises = products.slice(0, 3).map(product =>
          callGeminiWithRetry(
            () => analyzeProduct(product, categoryName, insights, userContext),
            2,
            1000
          )
        );

        analyses = await Promise.all(analysisPromises);
        generated_by = 'llm';

        console.log(`[product-analysis] LLM analyzed ${analyses.length} products for ${categoryKey}`);
      } catch (llmError) {
        console.error('[product-analysis] LLM failed, using fallback:', llmError);
        analyses = products.slice(0, 3).map(p => generateFallbackAnalysis(p, insights));
      }
    } else {
      console.log(`[product-analysis] LLM not available, using fallback for ${categoryKey}`);
      if (insights) {
        analyses = products.slice(0, 3).map(p => generateFallbackAnalysis(p, insights));
      } else {
        // insights도 없으면 빈 분석 반환
        analyses = products.slice(0, 3).map(p => ({
          pcode: p.pcode,
          additionalPros: [],
          cons: [],
          purchaseTip: [],
        }));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        analyses,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[product-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze products' },
      { status: 500 }
    );
  }
}
