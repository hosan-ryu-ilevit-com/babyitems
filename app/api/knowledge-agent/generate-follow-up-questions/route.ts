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
const ANALYSIS_MODEL = 'gemini-2.5-flash-lite';  // 빠른 분석용
const QUESTION_MODEL = 'gemini-2.5-flash-lite';  // 질문 생성용

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
  reviews?: Record<string, ReviewLite[]>;
  trendData?: TrendData;
  buyingFactors?: string[];  // 🆕 핵심 구매 고려사항 (가장 중요!)
  onboarding?: {  // 🆕 온보딩 데이터
    purchaseSituation?: string;
    replaceReasons?: string[];
    replaceOther?: string;
    firstSituations?: string[];
    firstSituationOther?: string;
  };
  babyInfo?: {  // 🆕 아기 정보
    gender?: string;
    calculatedMonths?: number;
    expectedDate?: string;
    isBornYet?: boolean;
  };
}

interface AnalysisResult {
  sampledReviews: string[];      // 샘플링된 리뷰 원문 (LLM에 직접 전달)
  specVariances: string[];       // 스펙 분산 분석 결과
  priceRanges: string[];         // 가격대 분석
  tradeoffs: string[];           // 트레이드오프 포인트
  buyingFactors: string[];       // 🆕 핵심 구매 고려사항 (가장 중요!)
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
 * 리뷰 샘플링 (LLM 분석 없이 원문 직접 전달)
 * - 길이 긴 순으로 고평점 10개, 저평점 10개
 */
function sampleReviews(
  reviews: Record<string, ReviewLite[]>
): string[] {
  if (Object.keys(reviews).length === 0) {
    return [];
  }

  // 모든 리뷰를 평점별로 그룹핑
  const allReviews: ReviewLite[] = [];
  Object.values(reviews).forEach(productReviews => {
    allReviews.push(...productReviews);
  });

  // 고평점 (4점 이상) - 길이 긴 순으로 10개
  const highRatingReviews = allReviews
    .filter(r => r.rating >= 4)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 10);

  // 저평점 (2점 이하) - 길이 긴 순으로 10개
  const lowRatingReviews = allReviews
    .filter(r => r.rating <= 2)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 10);

  // 포맷팅: [평점] 리뷰 내용
  const sampledReviews = [
    ...highRatingReviews.map(r => `[${r.rating}점] ${r.content}`),
    ...lowRatingReviews.map(r => `[${r.rating}점] ${r.content}`)
  ];

  console.log(`[Follow-up] Sampled reviews: 고평점 ${highRatingReviews.length}개, 저평점 ${lowRatingReviews.length}개`);
  return sampledReviews;
}

// extractAnsweredKeywords 함수 제거 - LLM이 직접 중복 판단하도록 변경

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

  // 분산이 높은 스펙 추출 (최적화: 상위 6개만)
  const highVarianceSpecs = Object.entries(specValues)
    .filter(([, values]) => values.size > 1 && values.size < products.length * 0.9)
    .map(([key, values]) => ({
      key,
      values: Array.from(values).slice(0, 4), // 값도 4개로 제한
      variance: values.size / products.length,
    }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 6); // 8개 → 6개로 축소

  if (!ai || highVarianceSpecs.length === 0) {
    return { variances: [], tradeoffs: [] };
  }

  const model = ai.getGenerativeModel({
    model: ANALYSIS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
  });

  const specText = highVarianceSpecs
    .map(s => `- ${s.key}: ${s.values.join(', ')}`)
    .join('\n');

  const prompt = `## ${categoryName} 스펙 분석

${specText}

### 추출 (각 최대 3-4개)
1. 주요 스펙 차이점 (상황에 따라 다름)
2. 트레이드오프 관계 (예: 용량↑=무게↑)

### 출력 (JSON만)
{"variances":["차이1","차이2"],"tradeoffs":["트레이드오프1"]}`;

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
  sampleProducts: any[],
  onboarding?: GenerateFollowUpQuestionsRequest['onboarding'],  // 🆕
  babyInfo?: GenerateFollowUpQuestionsRequest['babyInfo']       // 🆕
): Promise<QuestionTodo[]> {
  if (!ai) return [];

  const model = ai.getGenerativeModel({
    model: QUESTION_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
  });

  const answeredText = Object.entries(collectedInfo)
    .filter(([k]) => !k.startsWith('__'))
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  // 🆕 온보딩/아기정보 컨텍스트 구성
  const userContextParts: string[] = [];
  if (onboarding) {
    const situationMap: Record<string, string> = {
      first: '첫 구매',
      replace: '교체/업그레이드',
      gift: '둘러보기/선물',
    };
    if (onboarding.purchaseSituation) {
      userContextParts.push(`구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}`);
    }
    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
      userContextParts.push(`기존 제품 불만: ${onboarding.replaceReasons.join(', ')}`);
    }
    if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
      userContextParts.push(`구매 니즈: ${onboarding.firstSituations.join(', ')}`);
    }
  }
  if (babyInfo) {
    if (babyInfo.calculatedMonths !== undefined) {
      userContextParts.push(`아기 월령: ${babyInfo.calculatedMonths}개월`);
    } else if (babyInfo.expectedDate) {
      userContextParts.push(`출산예정일: ${babyInfo.expectedDate}`);
    }
    if (babyInfo.gender) {
      const genderMap: Record<string, string> = { male: '남아', female: '여아', unknown: '모름' };
      userContextParts.push(`성별: ${genderMap[babyInfo.gender] || babyInfo.gender}`);
    }
  }
  const userContextSection = userContextParts.length > 0
    ? `\n## 🆕 수집된 사용자 정보 (중복 질문 절대 금지!)\n${userContextParts.map(p => `- ${p}`).join('\n')}\n**→ 위 정보는 이미 수집되었으므로, 이와 관련된 질문은 절대 생성하지 마세요!**\n`
    : '';

  const productsText = sampleProducts.slice(0, 8)
    .map(p => `- ${p.brand || ''} ${p.name} (${p.price?.toLocaleString() || '?'}원)`)
    .join('\n');

  // 리뷰 샘플 제한 (프롬프트 길이 최적화)
  const reviewsText = analysis.sampledReviews.length > 0
    ? analysis.sampledReviews.slice(0, 20).join('\n')
    : '(리뷰 데이터 없음)';

  const prompt = `당신은 "${categoryName}" 구매 결정을 돕는 전문 AI 쇼핑 컨시어지입니다.
당신의 목표는 **사용자의 이전 선택을 더 깊게 파고들어** 더욱 정확한 추천을 위한 꼬리 질문(follow-up)을 생성하는 것입니다.

## ⚠️ 꼬리질문 핵심 원칙 (반드시 지켜야 함!)
1. **딥다이브 (Deep-dive):** 이전 질문/답변과 **직접 연결**되어 그것을 더 깊게 파고드는 질문이어야 함
   - ✅ "대용량을 선호하신다고 하셨는데, 그만큼 무게가 무거워지는데 괜찮으세요?"
   - ❌ "용량도 중요하지만, 브랜드는?" (토픽 변경 - 금지!)
2. **옵션 명확성:** 옵션 자체가 구체적이고 바로 필터링 가능해야 함
   - ✅ "BPA-free 소재" vs "일반 플라스틱"
   - ❌ "피하고 싶은 성분이 있나요?" (정보값 없음 - 금지!)
3. **사용자 언어:** 기술 용어 대신 효익(Benefit)과 상황 중심으로 질문하세요.
4. **MECE 원칙:** 선택지는 3~5개로 구성하며, 상호 배타적이어야 함
5. **예산 질문 금지:** 예산 관련 질문은 이미 이전 단계에서 완료되었으므로 절대 생성하지 마세요.

---
${userContextSection}
## 사용자가 이미 답변한 내용
${answeredText}

**🚫 중복 금지:** 위 내용과 의미적으로 중복되거나 이미 답변한 내용을 다시 묻는 질문은 절대 생성하지 마세요. 질문-답변 쌍을 꼼꼼히 검토하고, 이미 명확히 결정된 사항은 다시 묻지 않습니다.

---

## 📊 분석 결과

**🎯 질문 생성 원칙:** 아래 분석 결과(스펙 차이점, 리뷰, 트레이드오프)에서 **실제로 확인 가능한 정보만** 기반으로 질문을 생성하세요. 데이터에 없는 내용은 절대 질문하지 마세요!

### ⭐ 핵심 구매 고려사항 (가장 중요!)
${analysis.buyingFactors.length > 0 ? analysis.buyingFactors.map(f => `- ${f}`).join('\n') : '(정보 없음)'}
**→ 위 항목들은 이 카테고리에서 구매 결정에 가장 중요한 요소입니다. 아직 질문하지 않은 항목이 있다면 우선적으로 질문하세요!**

### 실제 구매자 리뷰 (${analysis.sampledReviews.length}개)
${reviewsText}

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

**현재 남은 후보 제품: ${sampleProducts.length}개**

### 질문 개수 결정 기준
- 후보 10개 이상 → 3-5개 질문 (중요 포인트만)
- 후보 5-9개 → 2-3개 질문 (최소한의 정보만)

### 질문 생성 시 주의사항
- **중복 금지:** 위에 나열된 "사용자가 이미 답변한 내용"과 의미적으로 중복되는 질문 절대 금지
- **생성 금지 옵션:** "둘 다", "모두", "기타", "직접 입력", "상관없어요", "잘 모르겠어요", "아무거나", "둘다 좋아요", "별로 안 중요해요" 등 회피성 옵션 절대 생성 금지 (시스템에서 "상관없어요" 버튼을 별도 제공함)
- **효과성:** 후보군을 실제로 나눌 수 있는 질문만 생성
- **🔍 데이터 기반 질문 (매우 중요!):**
  * **필수:** 위에 제공된 "스펙 차이점", "실제 구매자 리뷰", "트레이드오프 관계"에서 **실제로 확인 가능한 특징만** 질문하세요
  * **금지:** 제품 스펙이나 리뷰에 언급되지 않은 추상적이거나 확인 불가능한 내용은 절대 질문하지 마세요
  * **예시:**
    - ✅ 좋은 질문: 스펙에 "IH 방식", "압력 방식" 구분이 있음 → "가열 방식은 어떤 게 좋으세요?"
    - ✅ 좋은 질문: 리뷰에 "소음" 언급 다수 → "소음 수준은 어느 정도까지 괜찮으세요?"
    - ❌ 나쁜 질문: 데이터에 없는 "디자인 색상" 질문 → 나중에 태그 평가 시 증거 없음
    - ❌ 나쁜 질문: 확인 불가능한 "브랜드 신뢰도" → 주관적이고 증거 찾기 어려움
- **⭐ [MUST] 구체적 수치/스펙 필수:** 옵션 라벨에 반드시 소괄호 안에 구체적인 수치, 스펙, 또는 효익을 명시하세요.[MUST]
  * 수치: "대용량 (5L 이상)", "저소음 (40dB 이하)"
  * 전문 용어: "HEPA 필터 (미세먼지 99.9% 제거)", "무선 충전 (케이블 필요없음)"
  * 기능/효익: "자동 세척 (관리 편함)", "타이머 기능 (시간 맞춰 조리)"
- **질문 작성 규칙 (매우 중요!):**
  - **[필수] 이전 질문/답변과의 직접 연결:** 질문 시작 시 사용자의 **바로 직전** 선택을 언급하면서 그것을 더 깊게 파고드는 질문으로 연결
  - 웬만하면 간결한 한문장으로 생성하기
  - **✅ 올바른 예시 (딥다이브):**
    - 이전: "소재? → 메쉬" / 꼬리: "메쉬 소재를 선호하신다고 하셨는데, 착용감은 어떤 게 좋으세요?"
    - 이전: "용량? → 대용량" / 꼬리: "대용량을 선호하신다고 하셨는데, 그만큼 무게가 무거워지는데 괜찮으세요?"
    - 이전: "소음? → 조용한 거" / 꼬리: "조용한 제품을 원하신다고 하셨는데, 야간 사용이 주된 목적이신가요?"
  - **❌ 절대 금지 (토픽 변경):**
    - 이전: "눈금? → 선명한 거" / 꼬리: "눈금도 중요하지만, 재질은 어떤 걸 선호하세요?" ← 완전히 다른 토픽
    - 이전: "소음? → 조용한 거" / 꼬리: "소음도 중요하지만, 디자인 색상은?" ← 관련 없음
    - 이전: "용량? → 대용량" / 꼬리: "용량 외에 브랜드는 어떤 걸 선호하세요?" ← 딥다이브 아님
  - **❌ 잘못된 예시:**
    - "12-24개월이고, 유기농/무첨가를 원하시고, 과자형태를 선호하시고..." ← 모든 답변 나열 금지
    - "착용감은 어떤 게 좋으세요?" ← 맥락 없이 갑자기 질문 금지 (이전 답변과 연결 필요)
- **핵심 원칙:**
  - 질문에 맥락을 포함하되, 앞선 답변들 중 **바로 직전 질문/답변 1개만** 언급
  - 그 답변을 더 깊게 파고들거나, 그로 인한 트레이드오프를 확인하는 질문으로 연결
  - 모든 답변을 나열하지 말 것!
- **중복 금지:** 각 질문마다 서로 다른 포인트를 언급해야 함
- **할루시네이션 금지:** 사용자가 언급하지 않은 내용을 '~라고 하셨죠' 식으로 말하지 말 것. 확실하지 않으면 '남은 후보군에서~' 식으로 표현
- **형식:** 질문은 자연스러운 한국어 문장으로 (40~60자 권장)
- **톤:** 친근하고 공감하는 톤
- **⛔ 월령/성별 억지 언급 금지:** 이미 수집된 정보(월령, 성별 등)를 굳이 질문에 반복하지 마세요.
  - ❌ 잘못된 예: "20개월 남아라고 하셨는데, 디자인은 어떤 게 좋으세요?"
  - ✅ 올바른 예: "디자인은 어떤 스타일을 선호하세요?"
  - 수집된 정보는 내부적으로 추천에 활용되므로 질문에서 반복할 필요 없음
- **⭐⭐ 옵션 정보값 필수 (매우 중요!):**
  - **꼬리질문 옵션은 더 이상 질문이 필요 없을 정도로 명확하고 구체적이어야 함**
  - 옵션 자체만으로 추천에 바로 반영 가능한 구체적 정보여야 함
  - **❌ 절대 금지 - 정보값 없는 질문:**
    * "피하고 싶은 성분이 있나요?" → 옵션이 없으면 의미 없음
    * "특별히 원하는 기능이 있나요?" → 막연함, 구체성 없음
    * "중요하게 생각하는 게 있나요?" → 추상적
    * "추가로 고려할 사항이 있나요?" → 불명확
  - **✅ 올바른 예 - 바로 필터링 가능:**
    * "BPA-free 소재" vs "일반 플라스틱"
    * "스테인리스 재질" vs "유리 재질"
    * "무향/무첨가" vs "향료 첨가"
    * "분리형 물통 (세척 편함)" vs "일체형 (세척 불편)"
- **⭐⭐ 이전 질문과 직접 연결된 딥다이브 질문 (매우 중요!):**
  - **꼬리질문은 반드시 바로 직전 질문이나 답변을 더 깊게 파고드는 질문이어야 함**
  - **토픽이 완전히 달라지면 안 됨 (중복 질문 위험 + 사용자 혼란)**
  - **❌ 절대 금지 - 토픽 변경:**
    * 이전: "눈금 선명도?" → 꼬리: "눈금도 중요하지만, 재질은?" (X - 완전히 다른 토픽)
    * 이전: "소음 수준?" → 꼬리: "소음도 중요하지만, 디자인은?" (X - 토픽 변경)
    * 이전: "용량?" → 꼬리: "용량도 중요하지만, 브랜드는?" (X - 관련 없음)
  - **✅ 올바른 예 - 딥다이브:**
    * 이전: "눈금 선명도?" (답: 선명한 게 좋아요) → 꼬리: "눈금 위치는 어디가 편하세요? (양쪽/한쪽)"
    * 이전: "소음 수준?" (답: 조용한 게 좋아요) → 꼬리: "조용한 시간대는? (밤/낮 모두)"
    * 이전: "용량?" (답: 대용량) → 꼬리: "용량이 큰 만큼 크기도 커지는데, 수납 공간은 괜찮으세요?"
  - **원칙:** 이전 답변에서 선택한 키워드를 질문에 직접 언급하고, 그것의 세부 사항을 물어보기
- **⭐ 인기 옵션 표시 (isPopular):**
  - 시장 데이터 기반으로 가장 많이 선택되는 옵션에 \`isPopular: true\` 표시
  - 한 질문당 0~2개만 표시
- **⭐⭐ 개인화 추천 옵션 표시 (isRecommend):**
  - 사용자의 개인 상황(아기 월령, 성별, 온보딩 상황 등)을 고려하여 가장 적합한 옵션에 \`isRecommend: true\` 표시
  - 한 질문당 1~2개 표시 (웬만하면 1개는 표시)
  - 예: 신생아 → 저자극/무향 옵션에 isRecommend
  - 예: 온보딩 "소음 불만" → 초저소음 옵션에 isRecommend
  - isPopular와 isRecommend는 별개 (둘 다 true 가능)
  - 사용자 상황을 고려했을 때 적합한 옵션이 있다면 반드시 표시

## 출력 (JSON 배열만)

⚠️ **중요:** 꼬리질문은 이전 질문/답변과 **직접 연결**되어야 하며, 옵션은 **그 자체로 명확하고 구체적**이어야 합니다!

\`\`\`json
[
  {
    "id": "followup_1",
    "question": "메쉬 소재를 선호하신다고 하셨는데, 착용감은 어떤 게 좋으세요?",
    "reason": "메쉬 소재 내에서도 착용감 차이가 크므로 (딥다이브)",
    "options": [
      { "value": "soft", "label": "부드러운 착용감 (3D 메쉬, 장시간 편안)", "description": "통기성 좋고 피부에 자극 없음", "isPopular": true, "isRecommend": true },
      { "value": "firm", "label": "탄탄한 지지력 (하드 메쉬, 허리 보호)", "description": "안정적이고 무게 분산 좋음" }
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "follow_up",
    "completed": false
  }
]
\`\`\`

**✅ 좋은 꼬리질문 패턴:**
- 이전: "용량? → 대용량" / 꼬리: "대용량을 선호하신다고 하셨는데, 그만큼 무게가 무거워지는데 괜찮으세요?" (트레이드오프 확인)
- 이전: "소음? → 조용한 거" / 꼬리: "조용한 제품을 원하신다고 하셨는데, 야간 사용 빈도가 높으신가요?" (사용 패턴 확인)
- 이전: "재질? → 스테인리스" / 꼬리: "스테인리스 재질을 선호하신다고 하셨는데, 내솥 코팅은 어떤 게 좋으세요?" (세부 스펙 확인)

**❌ 나쁜 꼬리질문 패턴:**
- 이전: "눈금? → 선명한 거" / 꼬리: "눈금도 중요하지만, 재질은?" (토픽 변경 - 금지!)
- 이전: "소음? → 조용한 거" / 꼬리: "피하고 싶은 성분이 있나요?" (관련 없음 + 정보값 없음 - 금지!)

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
          isPopular: !!opt.isPopular,
          isRecommend: !!opt.isRecommend,
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
    const {
      categoryName,
      collectedInfo,
      products,
      reviews = {},
      trendData,
      buyingFactors = [],  // 🆕 핵심 구매 고려사항만 사용
      onboarding,  // 🆕 온보딩 데이터
      babyInfo,    // 🆕 아기 정보
    } = body;

    console.log(`[Follow-up] Starting for ${categoryName}`);
    console.log(`  - Products: ${products.length}`);
    console.log(`  - Reviews: ${Object.keys(reviews).length} products`);
    console.log(`  - Answered: ${Object.keys(collectedInfo).filter(k => !k.startsWith('__')).length} questions`);
    console.log(`  - BuyingFactors: ${buyingFactors.length > 0 ? buyingFactors.join(', ') : '(없음)'}`);

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

    const [sampledReviews, specAnalysis, priceRanges] = await Promise.all([
      Promise.resolve(sampleReviews(reviews)),
      analyzeSpecs(enrichedProducts, categoryName),
      Promise.resolve(analyzePriceRanges(enrichedProducts)),
    ]);

    const analysisResult: AnalysisResult = {
      sampledReviews,
      specVariances: specAnalysis.variances,
      priceRanges,
      tradeoffs: [
        ...specAnalysis.tradeoffs,
        ...(trendData?.cons || []).slice(0, 3),
      ],
      buyingFactors,  // 🆕 핵심 구매 고려사항만 전달
    };

    console.log(`[Follow-up] ⚡ Analysis done in ${Date.now() - analysisStart}ms`);
    console.log(`  - Sampled reviews: ${sampledReviews.length}`);
    console.log(`  - Spec variances: ${specAnalysis.variances.length}`);
    console.log(`  - Tradeoffs: ${analysisResult.tradeoffs.length}`);
    console.log(`  - BuyingFactors: ${buyingFactors.join(', ') || '(없음)'}`);

    // 질문 생성
    const questions = await generateQuestions(
      categoryName,
      collectedInfo,
      analysisResult,
      enrichedProducts.slice(0, 20),
      onboarding,  // 🆕 온보딩 데이터
      babyInfo     // 🆕 아기 정보
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
