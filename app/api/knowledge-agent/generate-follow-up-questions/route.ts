/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent - Generate Follow-up Questions API (v2)
 *
 * 맞춤 질문 완료 후, 사용자 응답 + 상품 + 리뷰를 병렬 분석하여
 * 의미있는 꼬리질문을 동적으로 생성합니다.
 *
 * 플로우:
 * [1] 병렬 분석: 리뷰 인사이트 + 스펙 분산 + 가격대 분석
 * [2] 종합: 분석 결과를 바탕으로 LLM이 꼬리질문 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { callGeminiWithRetry } from '@/lib/ai/gemini';
import type { QuestionTodo, TrendData } from '@/lib/knowledge-agent/types';

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 모델 설정
const ANALYSIS_MODEL = 'gemini-2.0-flash-lite';  // 빠른 분석용
const QUESTION_MODEL = 'gemini-2.0-flash-lite';  // 질문 생성용

export const maxDuration = 30;

// ============================================================================
// Types
// ============================================================================

interface ReviewLite {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
}

interface GenerateFollowUpQuestionsRequest {
  categoryKey: string;
  categoryName: string;
  collectedInfo: Record<string, string>;
  products: any[];
  reviews?: Record<string, ReviewLite[]>;  // 🆕 리뷰 데이터
  trendData?: TrendData;
}

interface AnalysisResult {
  reviewInsights: string[];      // 리뷰에서 추출한 인사이트
  specVariances: string[];       // 스펙 분산 분석 결과
  priceRanges: string[];         // 가격대 분석
  tradeoffs: string[];           // 트레이드오프 포인트
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * specSummary 문자열을 specs 객체로 파싱
 * 예: "용량: 5L | 소비전력: 1400W | 브랜드: 삼성" → { "용량": "5L", "소비전력": "1400W", "브랜드": "삼성" }
 */
function parseSpecSummary(specSummary: string | undefined): Record<string, string> {
  if (!specSummary || typeof specSummary !== 'string') return {};

  const specs: Record<string, string> = {};

  // 구분자: | 또는 / 또는 ,
  const parts = specSummary.split(/[|/,]/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    // "키: 값" 또는 "키:값" 형태 파싱
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      if (key && value) {
        specs[key] = value;
      }
    }
  }

  return specs;
}

/**
 * products 배열에 specs가 없으면 specSummary에서 파싱하여 추가
 */
function enrichProductsWithSpecs(products: any[]): any[] {
  return products.map(p => {
    // specs가 이미 있으면 그대로 사용
    if (p.specs && Object.keys(p.specs).length > 0) {
      return p;
    }
    // specSummary에서 파싱
    return {
      ...p,
      specs: parseSpecSummary(p.specSummary),
    };
  });
}

// ============================================================================
// Parallel Analysis Functions
// ============================================================================

/**
 * 리뷰에서 인사이트 추출 (샘플링 후 LLM 분석)
 */
async function analyzeReviews(
  reviews: Record<string, ReviewLite[]>,
  categoryName: string
): Promise<string[]> {
  if (!ai || Object.keys(reviews).length === 0) {
    return [];
  }

  // 리뷰 샘플링: 각 상품에서 최대 3개씩, 총 30개 제한
  const sampledReviews: string[] = [];
  const pcodes = Object.keys(reviews);

  for (const pcode of pcodes.slice(0, 10)) {
    const productReviews = reviews[pcode] || [];
    const samples = productReviews
      .slice(0, 3)
      .map(r => `[${r.rating}점] ${r.content.slice(0, 150)}`);
    sampledReviews.push(...samples);
  }

  if (sampledReviews.length === 0) {
    return [];
  }

  const model = ai.getGenerativeModel({
    model: ANALYSIS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
  });

  const prompt = `## ${categoryName} 리뷰 분석

아래 리뷰들에서 구매 결정에 영향을 주는 **핵심 포인트**를 추출하세요.

### 리뷰 샘플 (${sampledReviews.length}개)
${sampledReviews.slice(0, 20).join('\n')}

### 추출할 것
1. 사람들이 자주 언급하는 **만족 포인트**
2. 사람들이 자주 언급하는 **불만 포인트**
3. 선택 시 **갈리는 포인트** (A를 좋아하는 사람 vs B를 좋아하는 사람)

### 응답 (JSON 배열만, 설명 없이)
["인사이트1", "인사이트2", "인사이트3", ...]`;

  try {
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Follow-up] Review insights: ${parsed.length}개`);
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    }
  } catch (error) {
    console.error('[Follow-up] Review analysis failed:', error);
  }

  return [];
}

/**
 * 스펙 분산 분석 (통계 기반 + LLM 해석)
 */
async function analyzeSpecs(
  products: any[],
  categoryName: string
): Promise<{ variances: string[]; tradeoffs: string[] }> {
  // 스펙별 값 분포 계산
  const specValues: Record<string, Set<string>> = {};
  products.forEach((p) => {
    const specs = p.specs || {};
    Object.entries(specs).forEach(([key, value]) => {
      if (!specValues[key]) specValues[key] = new Set();
      if (value && typeof value === 'string' && value.trim()) {
        specValues[key].add(value.trim());
      }
    });
  });

  // 분산이 높은 스펙 추출
  const highVarianceSpecs = Object.entries(specValues)
    .filter(([, values]) => values.size > 1 && values.size < products.length * 0.9)
    .map(([key, values]) => ({
      key,
      values: Array.from(values).slice(0, 5),
      variance: values.size / products.length,
    }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 8);

  if (!ai || highVarianceSpecs.length === 0) {
    return { variances: [], tradeoffs: [] };
  }

  const model = ai.getGenerativeModel({
    model: ANALYSIS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
  });

  const specText = highVarianceSpecs
    .map(s => `- ${s.key}: ${s.values.join(', ')} (분산 ${Math.round(s.variance * 100)}%)`)
    .join('\n');

  const prompt = `## ${categoryName} 스펙 분석

후보 상품들의 스펙 분포입니다:
${specText}

### 분석할 것
1. 사용자가 선택해야 할 **주요 스펙 차이점** (어떤 게 더 좋다가 아니라, 상황에 따라 다른 것)
2. **트레이드오프 관계** (예: 용량↑ = 무게↑, 성능↑ = 가격↑)

### 응답 (JSON만, 설명 없이)
{"variances":["차이점1","차이점2"],"tradeoffs":["트레이드오프1","트레이드오프2"]}`;

  try {
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Follow-up] Spec variances: ${parsed.variances?.length || 0}, tradeoffs: ${parsed.tradeoffs?.length || 0}`);
      return {
        variances: parsed.variances || [],
        tradeoffs: parsed.tradeoffs || [],
      };
    }
  } catch (error) {
    console.error('[Follow-up] Spec analysis failed:', error);
  }

  return { variances: [], tradeoffs: [] };
}

/**
 * 가격대 분석
 */
function analyzePriceRanges(products: any[]): string[] {
  const prices = products
    .map(p => p.price)
    .filter((p): p is number => typeof p === 'number' && p > 0)
    .sort((a, b) => a - b);

  if (prices.length < 3) return [];

  const min = prices[0];
  const max = prices[prices.length - 1];
  const median = prices[Math.floor(prices.length / 2)];
  const range = max - min;

  const insights: string[] = [];

  if (range > median * 0.5) {
    insights.push(`가격대가 ${min.toLocaleString()}원 ~ ${max.toLocaleString()}원으로 다양함`);
  }

  // 가격 구간별 분포
  const lowCount = prices.filter(p => p < median * 0.8).length;
  const highCount = prices.filter(p => p > median * 1.2).length;

  if (lowCount > 0 && highCount > 0) {
    insights.push(`가성비 제품과 프리미엄 제품이 모두 있음`);
  }

  return insights;
}

// ============================================================================
// Main Question Generation
// ============================================================================

async function generateQuestions(
  categoryName: string,
  collectedInfo: Record<string, string>,
  analysis: AnalysisResult,
  sampleProducts: any[]
): Promise<QuestionTodo[]> {
  if (!ai) return [];

  const model = ai.getGenerativeModel({
    model: QUESTION_MODEL,
    generationConfig: { temperature: 0.5, maxOutputTokens: 2000 },
  });

  const answeredText = Object.entries(collectedInfo)
    .filter(([k]) => !k.startsWith('__'))
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  const productsText = sampleProducts.slice(0, 10)
    .map(p => `- ${p.brand || ''} ${p.name} (${p.price?.toLocaleString() || '?'}원)`)
    .join('\n');

  const prompt = `## ${categoryName} 꼬리질문 생성

사용자가 기본 질문에 답변했습니다. 아래 분석 결과를 바탕으로 **더 정확한 추천을 위한 추가 질문 1~3개**를 생성하세요.

---

## 사용자가 이미 답변한 내용
${answeredText}

## 📊 분석 결과

### 리뷰 인사이트 (실제 구매자들의 의견)
${analysis.reviewInsights.length > 0 ? analysis.reviewInsights.map(i => `- ${i}`).join('\n') : '(분석 데이터 없음)'}

### 스펙 차이점 (후보들 간 갈리는 포인트)
${analysis.specVariances.length > 0 ? analysis.specVariances.map(v => `- ${v}`).join('\n') : '(분석 데이터 없음)'}

### 트레이드오프 관계
${analysis.tradeoffs.length > 0 ? analysis.tradeoffs.map(t => `- ${t}`).join('\n') : '(없음)'}

### 가격대
${analysis.priceRanges.length > 0 ? analysis.priceRanges.map(p => `- ${p}`).join('\n') : '(없음)'}

## 후보 상품 (${sampleProducts.length}개 중 일부)
${productsText}

---

## 꼬리질문 생성 규칙

**반드시 1~3개의 질문을 생성하세요.** 분석 결과에서 아직 물어보지 않은 중요한 포인트를 질문으로 만드세요.

질문 유형 예시:
- 트레이드오프 질문: "A와 B 중 뭐가 더 중요하세요?"
- 사용 환경 질문: "주로 어디서 사용하시나요?"
- 구체적 선호: "이 기능이 필요하신가요?"
- 리스크 확인: "이런 단점은 괜찮으세요?"

**주의:**
- 이미 답변한 내용과 겹치면 안 됨
- 전문 용어 대신 쉬운 표현
- 옵션은 2~4개, 각각 한 줄 설명
- **중요:** "둘 다", "모두", "기타", "직접 입력"과 같은 옵션은 절대 생성하지 마세요. (시스템에서 자동으로 처리됨)
- **중요:** "상관없어요" 옵션도 절대 생성하지 마세요. (시스템에서 자동으로 추가됨)

## 출력 (JSON 배열만)

\`\`\`json
[
  {
    "id": "followup_1",
    "question": "질문 내용?",
    "reason": "이 질문이 필요한 이유 (내부용)",
    "options": [
      { "value": "opt1", "label": "옵션1", "description": "설명" },
      { "value": "opt2", "label": "옵션2", "description": "설명" }
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "follow_up",
    "completed": false
  }
]
\`\`\`

JSON만 출력:`;

  try {
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    return parseQuestionsResponse(text);
  } catch (error) {
    console.error('[Follow-up] Question generation failed:', error);
    return [];
  }
}

function parseQuestionsResponse(response: string): QuestionTodo[] {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const startIdx = jsonStr.indexOf('[');
    const endIdx = jsonStr.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((q: any) => q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q: any, index: number) => ({
        id: q.id || `followup_${index + 1}`,
        question: q.question,
        reason: q.reason || '',
        options: q.options.map((opt: any) => ({
          value: opt.value || opt.label,
          label: opt.label,
          description: opt.description || '',
        })),
        type: q.type || 'single',
        priority: q.priority || index + 1,
        dataSource: q.dataSource || 'follow_up',
        completed: false,
      }));
  } catch (error) {
    console.error('[Follow-up] Parse failed:', error);
    return [];
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: GenerateFollowUpQuestionsRequest = await request.json();
    const { categoryName, collectedInfo, products, reviews = {}, trendData } = body;

    console.log(`[Follow-up] Starting for ${categoryName}`);
    console.log(`  - Products: ${products.length}`);
    console.log(`  - Reviews: ${Object.keys(reviews).length} products`);
    console.log(`  - Answered: ${Object.keys(collectedInfo).filter(k => !k.startsWith('__')).length} questions`);

    // 유효성 검사
    if (!categoryName || !products || products.length === 0) {
      return NextResponse.json({
        success: false,
        hasFollowUpQuestions: false,
        followUpQuestions: [],
        error: 'Missing required parameters',
      });
    }

    // 상품 수가 너무 적으면 스킵
    if (products.length < 5) {
      return NextResponse.json({
        success: true,
        hasFollowUpQuestions: false,
        followUpQuestions: [],
        skipReason: '후보 상품이 충분히 좁혀졌습니다.',
      });
    }

    // 🆕 specs가 없으면 specSummary에서 파싱하여 추가
    const enrichedProducts = enrichProductsWithSpecs(products);
    const specsCounts = enrichedProducts.filter(p => p.specs && Object.keys(p.specs).length > 0).length;
    console.log(`[Follow-up] Enriched products with specs: ${specsCounts}/${enrichedProducts.length}`);

    // 디버그: 첫 번째 상품의 specs 샘플 출력
    if (enrichedProducts[0]?.specs) {
      console.log(`[Follow-up] Sample specs:`, JSON.stringify(enrichedProducts[0].specs));
    }

    // 🚀 병렬 분석 실행
    console.log(`[Follow-up] ⚡ Starting parallel analysis...`);
    const analysisStart = Date.now();

    const [reviewInsights, specAnalysis, priceRanges] = await Promise.all([
      analyzeReviews(reviews, categoryName),
      analyzeSpecs(enrichedProducts, categoryName),
      Promise.resolve(analyzePriceRanges(enrichedProducts)),
    ]);

    const analysisResult: AnalysisResult = {
      reviewInsights,
      specVariances: specAnalysis.variances,
      priceRanges,
      tradeoffs: [
        ...specAnalysis.tradeoffs,
        ...(trendData?.cons || []).slice(0, 3),
      ],
    };

    console.log(`[Follow-up] ⚡ Analysis done in ${Date.now() - analysisStart}ms`);
    console.log(`  - Review insights: ${reviewInsights.length}`);
    console.log(`  - Spec variances: ${specAnalysis.variances.length}`);
    console.log(`  - Tradeoffs: ${analysisResult.tradeoffs.length}`);

    // 질문 생성
    const questions = await generateQuestions(
      categoryName,
      collectedInfo,
      analysisResult,
      enrichedProducts.slice(0, 20)
    );

    const duration = Date.now() - startTime;
    console.log(`[Follow-up] ✅ Generated ${questions.length} questions in ${duration}ms`);

    return NextResponse.json({
      success: true,
      hasFollowUpQuestions: questions.length > 0,
      followUpQuestions: questions,
    });

  } catch (error: any) {
    console.error('[Follow-up] Error:', error);
    return NextResponse.json({
      success: false,
      hasFollowUpQuestions: false,
      followUpQuestions: [],
      error: error.message || 'Unknown error',
    });
  }
}
