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
import { callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CategoryInsights } from '@/types/category-insights';
import {
  getSampledReviewsFromSupabase,
  formatReviewsForPrompt,
  type ProductReviewSample,
} from '@/lib/review/supabase-analyzer';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');
const genAI = new GoogleGenerativeAI(apiKey);

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  spec?: Record<string, unknown>;
  // PLP에서 생성된 추천 이유 (PDP contextMatch 일관성 유지용)
  recommendationReason?: string;
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  hardFilterDirectInputs?: Record<string, string>;
  balanceSelections?: string[];
  negativeSelections?: string[];
  // Rule key / value → Korean label mappings
  balanceLabels?: Record<string, string>;
  negativeLabels?: Record<string, string>;
  hardFilterLabels?: Record<string, string>;
  // 사용자가 처음 입력한 자연어 상황 설명
  initialContext?: string;
}

// 내 상황과의 적합성 평가 타입
interface ContextMatch {
  explanation: string;         // "밤수유가 잦다고 하셨는데, 이 제품은 저소음 35dB로 아기를 깨우지 않아요"
  matchedPoints: string[];     // ["저소음", "급속 가열", "야간 조명"]
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
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';  // 평가 상태
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
  contextMatch?: ContextMatch;  // 내 상황과의 적합성 (initialContext가 있을 때만)
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
  userContext: UserContext,
  reviewSample?: ProductReviewSample
): Promise<ProductAnalysis> {
  // Use Gemini Flash Lite for fast product analysis (speed matters)
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    generationConfig: {
      temperature: 0.5,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });

  // 스펙 정보 문자열화
  const specStr = product.spec
    ? Object.entries(product.spec)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 15)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '스펙 정보 없음';

  // 리뷰 정보 문자열화
  const reviewStr = reviewSample ? formatReviewsForPrompt(reviewSample) : '리뷰 데이터 없음';

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

  // 직접 입력 조건 추가 (hardFilterDirectInputs)
  if (userContext.hardFilterDirectInputs) {
    Object.entries(userContext.hardFilterDirectInputs).forEach(([questionId, value]) => {
      // 값이 있고 'any'가 아니면 추가
      if (value && value.trim() && value !== 'any') {
        hardFilterConditions.push({ questionId, label: value.trim() });
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
  const hasInitialContext = !!userContext.initialContext;

  // PLP에서 생성된 추천 이유 (일관성 유지용)
  const hasRecommendationReason = !!product.recommendationReason;

  // 내 상황과의 적합성 평가 섹션 (initialContext가 있을 때만)
  const contextMatchSection = hasInitialContext ? `
## 사용자가 처음 말씀하신 상황
"${userContext.initialContext}"
${hasRecommendationReason ? `
## ⚠️ 중요: PLP에서 이미 생성된 추천 이유 (일관성 유지 필수)
"${product.recommendationReason}"

위 추천 이유에서 언급된 장점(예: 저소음, 빠른 가열 등)은 contextMatch에서도 **반드시 동일하게 긍정적으로 평가**해야 합니다.
PLP와 PDP 간 상반된 평가는 사용자에게 혼란을 줍니다.
` : ''}
## 내 상황과의 적합성 평가 요청
위 상황과 이 제품이 얼마나 잘 맞는지 평가해주세요:
- **explanation**: 사용자 상황을 고려하여 이 제품이 왜 적합한지 **'~강화', '~최적', '~해결' 등 명사형/종결 어미**로 끝나는 간결한 한 문장으로 설명
  - ❌ 나쁜 예: "밤수유가 잦은 상황에 적합합니다. 저소음이라 아기를 깨우지 않아요." (두 문장 분리, 다/요 말투)
  - ✅ 좋은 예: "밤수유가 잦은 상황에 적합하도록 35dB의 저소음 설계를 갖춰 아기 수면 방해 최소화"
  - ✅ 좋은 예: "4개월 아기의 첫 분유포트로 적합한 높은 온도 정확도와 간편한 세척 기능으로 위생 관리 최적"
- **matchedPoints**: 해당 상황에 매칭되는 제품의 특징 2-4개 (간단한 키워드)
` : '';

  const contextMatchFormat = hasInitialContext ? `
  "contextMatch": {
    "explanation": "[상황]에 적합한 [특징]으로 [가치/결과] 최적/강화/제공",
    "matchedPoints": ["특징1", "특징2", "특징3"]
  },` : '';

  // 조건 평가 섹션 (조건이 있을 때만)
  const conditionEvaluationSection = hasUserConditions ? `
## 사용자 선택 조건
${hardFilterConditions.length > 0 ? `### 필수 조건 (하드 필터)
${hardFilterConditions.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}` : ''}

${balanceConditions.length > 0 ? `### 선호 속성 (밸런스 게임 선택)
${balanceConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

${negativeConditions.length > 0 ? `### 피할 단점
${negativeConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

## 조건 충족도 평가 요청
위 사용자 조건들에 대해 이 제품이 얼마나 충족하는지 평가해주세요:
- **필수 조건/선호 속성**: "충족" (완벽히 만족) | "부분충족" (일부 만족) | "불충족" (만족 안 함)
- **피할 단점**: "회피됨" (단점 없음) | "부분회피" (일부 단점 있음) | "회피안됨" (단점 존재)
` : '';

  const conditionEvaluationFormat = hasUserConditions ? `
  "selectedConditionsEvaluation": [
    // 필수 조건 평가 (${hardFilterConditions.length}개) - status는 "충족" 또는 "불충족" 중 하나만 선택
    ${hardFilterConditions.map(c => `{
      "condition": "${c.label}",
      "conditionType": "hardFilter",
      "questionId": "${c.questionId}",
      "status": "충족 또는 불충족 중 하나",
      "evidence": "충족 시 이 조건이 왜 중요한지 사용자 상황과 연결하여 '~강화', '~최적' 등 명사형으로 1문장 설명"
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    // 선호 속성 평가 (${balanceConditions.length}개) - status는 "충족", "부분충족", "불충족" 중 하나만 선택
    ${balanceConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "balance",
      "status": "충족, 부분충족, 불충족 중 하나",
      "evidence": "구체적 근거 1-2문장"
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    // 피할 단점 평가 (${negativeConditions.length}개) - status는 "회피됨", "부분회피", "회피안됨" 중 하나만 선택
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "회피됨, 부분회피, 회피안됨 중 하나",
      "evidence": "구체적 근거 1-2문장"
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

## 실제 사용자 리뷰
${reviewStr}

## 이 카테고리의 일반적인 장점들
${categoryPros}

## 이 카테고리의 주요 단점/우려사항
${categoryCons}
${conditionEvaluationSection}${contextMatchSection}
## 분석 요청
제품 스펙과 **실제 사용자 리뷰**를 종합하여 다음을 작성해주세요:

${hasUserConditions ? '1. **조건 충족도 평가 (selectedConditionsEvaluation)**: 사용자가 선택한 조건들에 대한 충족 여부 평가 (리뷰에서 언급된 내용 우선 참고)\n' : ''}${hasInitialContext ? `${hasUserConditions ? '2' : '1'}. **내 상황과의 적합성 (contextMatch)**: 처음 말씀하신 상황과 이 제품이 얼마나 맞는지 평가\n` : ''}${hasInitialContext && hasUserConditions ? '3' : hasInitialContext || hasUserConditions ? '2' : '1'}. **추가 장점 (additionalPros)**: 스펙 + 리뷰에서 확인된 이 제품만의 추가 장점 2-3개
${hasInitialContext && hasUserConditions ? '4' : hasInitialContext || hasUserConditions ? '3' : '2'}. **주의점 (cons)**: 이 제품 사용 시 주의해야 할 점 2-3개 (리뷰에서 언급된 실사용 단점 우선)
${hasInitialContext && hasUserConditions ? '5' : hasInitialContext || hasUserConditions ? '4' : '3'}. **구매 팁 (purchaseTip)**: 구매 전 확인해야 할 사항 1-2개

## 응답 JSON 형식
{${conditionEvaluationFormat}${contextMatchFormat}
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
- 스펙 정보와 **실제 리뷰**를 기반으로 구체적으로 작성
- 리뷰가 있으면 실제 사용자 의견을 근거로 활용 (예: "리뷰에서 '세척이 편하다'는 평이 많음")
- 일반적인 내용이 아닌 이 제품에 특화된 내용으로
- 사용자 관점에서 실용적인 정보 위주로
- citations는 빈 배열로
${hasUserConditions ? `
- selectedConditionsEvaluation은 사용자가 선택한 조건 총 ${hardFilterConditions.length + balanceConditions.length + negativeConditions.length}개를 모두 평가해야 합니다
- **필수 조건(hardFilter) 충족 시, 왜 이 제품이 그 조건에 부합하는지 사용자 상황과 연결하여 '~최적', '~강화', '~확보' 등 명사형/간결한 문장으로 evidence를 작성하세요.**

## ⚠️ status 값 중요 (정확히 아래 값만 사용):
- 필수 조건(hardFilter): "충족" 또는 "불충족" (이 두 값 중 하나만)
- 선호 속성(balance): "충족" 또는 "부분충족" 또는 "불충족" (이 세 값 중 하나만)
- 피할 단점(negative): "회피됨" 또는 "부분회피" 또는 "회피안됨" (이 세 값 중 하나만)

status 예시 (반드시 이 형식으로):
{
  "condition": "ISOFIX 지원",
  "conditionType": "hardFilter",
  "questionId": "q1",
  "status": "충족",
  "evidence": "최신 i-Size 인증을 받은 ISOFIX 시스템으로 빠르고 안전한 장착 환경 확보"
}
{
  "condition": "세척 편리성",
  "conditionType": "balance",
  "status": "부분충족",
  "evidence": "분리형 구조라 **세척은 편하지만** 건조 시간이 필요해요"
}
{
  "condition": "무거운 무게",
  "conditionType": "negative",
  "status": "회피됨",
  "evidence": "**가벼운 소재**로 되어 있어 휴대가 편해요"
}` : ''}

JSON만 응답하세요.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = parseJSONResponse(responseText) as {
      additionalPros?: Array<{ text: string; citations: number[] }>;
      cons?: Array<{ text: string; citations: number[] }>;
      purchaseTip?: Array<{ text: string; citations: number[] }>;
      selectedConditionsEvaluation?: ConditionEvaluation[];
      contextMatch?: ContextMatch;
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

    // 🔧 하드필터 검증: 같은 questionId에서 중복 충족 제거
    // 각 질문당 하나의 충족/불충족만 유지 (첫 번째 충족 또는 모두 불충족 시 첫 번째만)
    let validatedEvaluations = parsed.selectedConditionsEvaluation || [];

    if (validatedEvaluations.length > 0) {
      const seenQuestions = new Set<string>();
      const deduplicatedEvaluations: ConditionEvaluation[] = [];

      // 하드필터만 그룹화 (balance, negative는 그대로 유지)
      const hardFilterEvals = validatedEvaluations.filter(e => e.conditionType === 'hardFilter');
      const otherEvals = validatedEvaluations.filter(e => e.conditionType !== 'hardFilter');

      // 각 questionId별로 첫 번째 충족 조건만 유지
      for (const evaluation of hardFilterEvals) {
        const qid = evaluation.questionId || 'unknown';

        // 이미 이 질문에서 충족된 조건이 있으면 스킵
        if (seenQuestions.has(qid)) {
          console.log(`[product-analysis] Skipping duplicate hardFilter evaluation for question ${qid}: ${evaluation.condition}`);
          continue;
        }

        // 충족된 조건이면 추가하고 질문 ID 기록
        if (evaluation.status === '충족') {
          deduplicatedEvaluations.push(evaluation);
          seenQuestions.add(qid);
        } else {
          // 불충족 조건은 나중에 처리 (충족 조건이 없을 때만 추가)
          deduplicatedEvaluations.push(evaluation);
        }
      }

      // 중복 제거: 각 questionId별로 충족이 있으면 불충족 제거
      const finalHardFilterEvals: ConditionEvaluation[] = [];
      const questionsWithMatch = new Set(
        deduplicatedEvaluations
          .filter(e => e.status === '충족')
          .map(e => e.questionId)
          .filter((id): id is string => id !== undefined)
      );

      for (const evaluation of deduplicatedEvaluations) {
        const qid = evaluation.questionId;
        if (!qid) {
          finalHardFilterEvals.push(evaluation);
          continue;
        }

        // 이 질문에 충족 조건이 있으면, 불충족 조건은 제외
        if (questionsWithMatch.has(qid)) {
          if (evaluation.status === '충족') {
            finalHardFilterEvals.push(evaluation);
          }
          // 불충족은 스킵
        } else {
          // 충족 조건이 없으면 첫 번째 불충족만 유지
          if (!seenQuestions.has(`${qid}_unmatched`)) {
            finalHardFilterEvals.push(evaluation);
            seenQuestions.add(`${qid}_unmatched`);
          }
        }
      }

      validatedEvaluations = [...finalHardFilterEvals, ...otherEvals];

      console.log(`[product-analysis] Validated ${product.pcode}: ${hardFilterEvals.length} -> ${finalHardFilterEvals.length} hardFilter evaluations`);
    }

    // contextMatch 검증 (빈 값 필터링)
    let validatedContextMatch: ContextMatch | undefined;
    if (parsed.contextMatch && parsed.contextMatch.explanation && parsed.contextMatch.explanation.trim()) {
      validatedContextMatch = {
        explanation: parsed.contextMatch.explanation.trim(),
        matchedPoints: (parsed.contextMatch.matchedPoints || []).filter(p => p && p.trim()),
      };
    }

    return {
      pcode: product.pcode,
      additionalPros: filterInvalidTextItems(parsed.additionalPros),
      cons: filterInvalidTextItems(parsed.cons),
      purchaseTip: filterInvalidTextItems(parsed.purchaseTip),
      selectedConditionsEvaluation: validatedEvaluations,
      contextMatch: validatedContextMatch,
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

  // 피할 단점 (한국어 레이블 사용)
  const negativeLabels = userContext.negativeLabels || {};
  userContext.negativeSelections?.forEach(ruleKey => {
    const label = negativeLabels[ruleKey] || ruleKey.replace(/_/g, ' ');
    selectedConditionsEvaluation.push({
      condition: label,
      conditionType: 'negative',
      status: '부분회피',
      evidence: '스펙 정보로 정확한 확인이 어렵습니다. 상세 스펙을 확인해주세요.',
    });
  });

  // Fallback contextMatch (initialContext가 있을 때만)
  const contextMatch: ContextMatch | undefined = userContext.initialContext ? {
    explanation: `말씀하신 상황에 대해 정확한 평가가 어렵습니다. 상세 스펙과 리뷰를 확인해주세요.`,
    matchedPoints: [],
  } : undefined;

  return {
    pcode: product.pcode,
    additionalPros,
    cons,
    purchaseTip,
    selectedConditionsEvaluation,
    contextMatch,
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

    // 리뷰 로드 (상위 3개 제품에 대해)
    const productsToAnalyze = products.slice(0, 3);
    const productIds = productsToAnalyze.map(p => p.pcode);

    let reviewsMap = new Map<string, ProductReviewSample>();
    try {
      console.log(`[product-analysis] Loading reviews for ${productIds.length} products from Supabase`);
      reviewsMap = await getSampledReviewsFromSupabase(productIds, 10, 10);
      const reviewCounts = Array.from(reviewsMap.values()).map(r => r.totalCount);
      console.log(`[product-analysis] Reviews loaded: ${reviewCounts.filter(c => c > 0).length}/${productIds.length} products have reviews`);
    } catch (err) {
      console.log(`[product-analysis] Failed to load reviews, proceeding without: ${err}`);
    }

    let analyses: ProductAnalysis[] = [];
    let generated_by: 'llm' | 'fallback' = 'fallback';

    if (isGeminiAvailable() && insights) {
      try {
        // 병렬로 3개 제품 분석 (리뷰 포함)
        const analysisPromises = productsToAnalyze.map(product =>
          callGeminiWithRetry(
            () => analyzeProduct(product, categoryName, insights, userContext, reviewsMap.get(product.pcode)),
            2,
            1000
          )
        );

        analyses = await Promise.all(analysisPromises);
        generated_by = 'llm';

        console.log(`[product-analysis] LLM analyzed ${analyses.length} products for ${categoryKey}`);
      } catch (llmError) {
        console.error('[product-analysis] LLM failed, using fallback:', llmError);
        analyses = productsToAnalyze.map(p => generateFallbackAnalysis(p, insights));
      }
    } else {
      console.log(`[product-analysis] LLM not available, using fallback for ${categoryKey}`);
      if (insights) {
        analyses = productsToAnalyze.map(p => generateFallbackAnalysis(p, insights));
      } else {
        // insights도 없으면 빈 분석 반환
        analyses = productsToAnalyze.map(p => ({
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
