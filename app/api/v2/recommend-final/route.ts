/**
 * V2 최종 추천 API - LLM 기반 Top 3 선정 + 추천 이유 생성
 * POST /api/v2/recommend-final
 *
 * 기존 score API의 점수 기반 정렬 대신, LLM이 사용자 상황을 종합적으로 분석하여
 * 최적의 Top 3 제품을 선정하고 개인화된 추천 이유를 생성합니다.
 *
 * 입력:
 * - categoryKey: 카테고리 키
 * - candidateProducts: 점수 계산이 완료된 후보 상품들 (상위 10~20개 권장)
 * - userContext: 사용자 선택 정보
 *   - hardFilterAnswers: 하드 필터 응답
 *   - balanceSelections: 밸런스 게임 선택 (rule_key 배열)
 *   - negativeSelections: 단점 필터 선택 (rule_key 배열)
 * - budget: { min, max }
 *
 * 출력:
 * - top3Products: 최종 Top 3 제품 (추천 이유 포함)
 * - selectionReason: 전체 선정 기준 설명
 * - generated_by: 'llm' | 'fallback'
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getProModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';
import {
  normalizeTitle,
  extractOptionLabel,
  deduplicateProducts,
  type ProductVariant,
} from '@/lib/utils/productGrouping';
import {
  getSampledReviewsFromSupabase,
  formatReviewsForPrompt,
  type ProductReviewSample,
} from '@/lib/review/supabase-analyzer';

// 후보 상품 타입
interface CandidateProduct {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  lowestPrice?: number | null;  // 다나와 최저가 (우선 사용)
  rank?: number | null;
  thumbnail?: string | null;
  spec?: Record<string, unknown>;
  filter_attrs?: Record<string, string>;  // 상품 필터 속성 (재질, 타입 등)
  baseScore?: number;
  negativeScore?: number;
  totalScore?: number;
  matchedRules?: string[];
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
}

// 요청 타입
interface RecommendFinalRequest {
  categoryKey: string;
  candidateProducts: CandidateProduct[];
  userContext?: UserContext;
  budget?: { min: number; max: number };
}

// 추천 제품 타입 (이유 포함)
interface RecommendedProduct extends CandidateProduct {
  recommendationReason: string;
  matchedPreferences: string[];
  rank: number;
  // 옵션/변형 정보
  variants: ProductVariant[];
  optionCount: number;
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

// 응답 타입
interface RecommendFinalResponse {
  success: boolean;
  data?: {
    categoryKey: string;
    categoryName: string;
    top3Products: RecommendedProduct[];
    selectionReason: string;
    generated_by: 'llm' | 'fallback';
    totalCandidates: number;
  };
  error?: string;
}

/**
 * 제품에 variants 정보 추가
 * 같은 그룹(정규화된 타이틀)의 다른 제품들을 variants로 포함
 */
function enrichWithVariants(
  product: CandidateProduct,
  allCandidates: CandidateProduct[],
  recommendationReason: string,
  matchedPreferences: string[],
  rank: number
): RecommendedProduct {
  const groupKey = normalizeTitle(product.title);

  // 같은 그룹의 제품들 찾기
  const groupProducts = allCandidates.filter(
    p => normalizeTitle(p.title) === groupKey
  );

  // variants 생성 (가격 오름차순)
  const variants: ProductVariant[] = groupProducts
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .map(p => ({
      pcode: p.pcode,
      title: p.title,
      optionLabel: extractOptionLabel(p.title),
      price: p.price ?? null,
      rank: p.rank ?? null,
    }));

  // 가격 범위 계산
  const prices = groupProducts
    .map(p => p.price)
    .filter((p): p is number => p != null && p > 0);

  const priceRange = {
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
  };

  return {
    ...product,
    recommendationReason,
    matchedPreferences,
    rank,
    variants,
    optionCount: variants.length,
    priceRange,
  };
}

/**
 * 밸런스 선택을 자연어로 변환
 */
function formatBalanceSelections(selections: string[]): string {
  const descriptions: Record<string, string> = {
    // 예시 매핑 (실제로는 logic_map에서 description을 가져올 수 있음)
    'rule_bottle_lightweight': '가벼운 제품 선호',
    'rule_bottle_durable': '내구성 있는 제품 선호',
    'rule_pot_warm_fast': '빠른 가열 선호',
    'rule_pot_temp_accurate': '정확한 온도 조절 선호',
    // ... 더 많은 매핑
  };

  return selections
    .map(key => descriptions[key] || key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 단점 필터 선택을 자연어로 변환
 */
function formatNegativeSelections(selections: string[]): string {
  return selections
    .map(key => key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 상품 정보를 LLM 프롬프트용 문자열로 변환 (스펙 + 리뷰 데이터 포함)
 */
function formatProductForPrompt(
  product: CandidateProduct,
  index: number,
  reviewSample?: ProductReviewSample
): string {
  // 스펙 정보 포맷팅 (중요한 항목 우선)
  let specStr = '스펙 정보 없음';
  if (product.spec) {
    const priorityKeys = ['용량', '무게', '재질', '크기', '온도', '기능', '타입', '소비전력'];
    const prioritySpecs: string[] = [];
    const otherSpecs: string[] = [];

    Object.entries(product.spec).forEach(([k, v]) => {
      if (!v || v === '' || v === '-') return;
      const isPriority = priorityKeys.some(pk => k.includes(pk));
      const specItem = `${k}: ${v}`;
      if (isPriority) {
        prioritySpecs.push(specItem);
      } else {
        otherSpecs.push(specItem);
      }
    });

    const allSpecs = [...prioritySpecs.slice(0, 6), ...otherSpecs.slice(0, 4)];
    if (allSpecs.length > 0) {
      specStr = allSpecs.join(', ');
    }
  }

  // 매칭 규칙 포맷팅
  const matchedRulesStr = product.matchedRules && product.matchedRules.length > 0
    ? product.matchedRules.map(r => r.replace('체감속성_', '').replace(/_/g, ' ')).join(', ')
    : '없음';

  // 가격: 다나와 최저가 우선 사용
  const effectivePrice = product.lowestPrice ?? product.price;
  const priceStr = effectivePrice ? `${effectivePrice.toLocaleString()}원` : '가격 미정';

  // 리뷰 정보 포맷팅
  const reviewStr = reviewSample ? formatReviewsForPrompt(reviewSample) : '- 리뷰: 없음';

  return `[상품 ${index + 1}] pcode: ${product.pcode}
- 제품명: ${product.title}
- 브랜드: ${product.brand || '미상'}
- 가격: ${priceStr}
- 인기순위: ${product.rank || '미정'}위
- 선호도점수: ${product.totalScore || 0}점
- 매칭된 선호조건: ${matchedRulesStr}
- 상세스펙: ${specStr}
${reviewStr}`;
}

/**
 * LLM을 사용하여 Top 3 선정 및 추천 이유 생성
 */
async function selectTop3WithLLM(
  categoryKey: string,
  categoryName: string,
  insights: CategoryInsights,
  candidates: CandidateProduct[],
  userContext: UserContext,
  budget: { min: number; max: number }
): Promise<{
  top3Products: RecommendedProduct[];
  selectionReason: string;
}> {
  const model = getProModel(0.4); // 낮은 temperature로 일관된 결과

  // 사용자 선택 요약
  const hardFilterSummary = userContext.hardFilterAnswers
    ? Object.entries(userContext.hardFilterAnswers)
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .join('\n')
    : '선택 없음';

  const balanceSummary = userContext.balanceSelections?.length
    ? formatBalanceSelections(userContext.balanceSelections)
    : '선택 없음';

  const negativeSummary = userContext.negativeSelections?.length
    ? formatNegativeSelections(userContext.negativeSelections)
    : '선택 없음';

  // 카테고리 인사이트에서 핵심 정보 추출
  const topPros = insights.pros.slice(0, 5).map(p => `- ${p.text}`).join('\n');
  const topCons = insights.cons.slice(0, 5).map(c => `- ${c.text}`).join('\n');

  // 후보 상품 리뷰 로드 (상위 10개에 대해)
  const top10Candidates = candidates.slice(0, 10);
  const productIds = top10Candidates.map(p => p.pcode);

  let reviewsMap = new Map<string, ProductReviewSample>();
  try {
    console.log(`[recommend-final] Loading reviews for ${productIds.length} products from Supabase`);
    reviewsMap = await getSampledReviewsFromSupabase(productIds, 10, 10);
    const reviewCounts = Array.from(reviewsMap.values()).map(r => r.totalCount);
    console.log(`[recommend-final] Reviews loaded: ${reviewCounts.filter(c => c > 0).length}/${productIds.length} products have reviews`);
  } catch (err) {
    console.log(`[recommend-final] Failed to load reviews, proceeding without: ${err}`);
  }

  // 후보 상품 목록 (리뷰 포함)
  const candidatesStr = top10Candidates
    .map((p, i) => formatProductForPrompt(p, i, reviewsMap.get(p.pcode)))
    .join('\n\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
아래 사용자 상황과 후보 상품들을 분석하여, 가장 적합한 Top 3 제품을 선정하고 개인화된 추천 이유를 작성해주세요.

### ⚠️ 절대 금지 사항
- 영어 변수명/속성명 절대 사용 금지. 풀어서 자연스러운 한국어만 사용해야 함. 영어와 한국어를 병기 처리 하지 말고, 오직 한국어만 사용해야 함
- 시스템 용어 절대 사용 금지 (예: 하드필터, 밸런스게임, 필터 조건 등)
- 반드시 모든 문장을 자연스러운 한국어로 풀어서 작성하세요
- 추상적/두리뭉실한 표현 금지. 반드시 구체적 수치와 정량적 근거를 제시하세요

### 📊 리뷰 데이터 분석 방법 (필수)
각 제품의 리뷰 데이터가 아래 형식으로 제공됩니다:
- 리뷰: 긍정 N개 (평점 4-5점), 부정 M개 (평점 1-3점), 전체 평점 X.X/5.0
- 긍정 리뷰 내용: "실제 사용자 의견 인용"
- 부정 리뷰 내용: "실제 사용자 의견 인용"

**반드시 다음을 수행하세요:**
1. 리뷰 총 개수를 파악 (긍정 + 부정)
2. 사용자가 선택한 조건과 관련된 키워드가 리뷰에 몇 번 언급되는지 카운트
3. 긍정/부정 비율을 계산하여 추천 이유에 포함
4. 리뷰 원문을 짧게 인용하되, 정량적 수치와 함께 제시

## 사용자 상황

### 1. 필수 요구사항 (사용자가 꼭 원하는 조건)
${hardFilterSummary}

### 2. 선호하는 특성
${balanceSummary}

### 3. 피하고 싶은 단점
${negativeSummary}

### 4. 예산 범위
${budget.min.toLocaleString()}원 ~ ${budget.max.toLocaleString()}원

## 이 카테고리의 일반적인 장점들 (언급률 순)
${topPros}

## 이 카테고리의 주요 단점/우려사항 (언급률 순)
${topCons}

## 후보 상품 목록 (현재 점수 기준 정렬)
${candidatesStr}

## 선정 기준
1. 사용자가 꼭 원한다고 선택한 필수 조건을 모두 만족해야 함
2. 선호한다고 선택한 특성을 가진 제품 우선
3. 피하고 싶다고 한 단점이 없는 제품 우선 (리뷰에서 해당 단점 언급이 적은 제품 우선)
4. 예산 범위 내에서 가성비 고려
5. **실제 사용자 리뷰를 필수로 참고하여 스펙과 실사용 경험이 일치하는지 확인**
   - 높은평점 리뷰: 어떤 스펙이 어떤 상황에서 좋은지 구체적으로 파악 (예: "300W 출력 → 2분 내 데워짐 → 새벽 수유 편함")
   - 낮은평점 리뷰: 어떤 스펙/상황에서 불만이 있는지 구체적으로 파악 (예: "소음 35dB인데도 시끄럽다는 평 2건")
   - 리뷰 통계: 총 리뷰 개수 중 특정 장점/단점 언급 개수를 반드시 카운트
6. **스펙 → 실사용 효과 → 리뷰 검증 체인 확립**: 단순 스펙 나열이 아닌, "이 스펙이 실제 어떤 효과를 내는지" → "리뷰에서 실제로 그런 효과를 경험했는지" 연결
## 응답 JSON 형식
⚠️ 중요: pcode는 반드시 **숫자 문자열** (예: "11354604")을 사용하세요. 제품명이 아닙니다!

{
  "top3": [
    {
      "pcode": "11354604",  // ← 위 목록의 "pcode: XXXXXXXX" 값을 그대로 사용
      "rank": 1,
      "recommendationReason": "구체적 수치를 포함한 추천 이유 (1~3문장)",
      "matchedPreferences": [
        "선택하신 빠른 가열 (85개 리뷰 중 68개 언급)",
        "세척 편의성 (92개 리뷰 중 79개 긍정)",
        "저소음 (150개 중 불만 단 2건)"
      ]
    },
    { "pcode": "숫자pcode", "rank": 2, "recommendationReason": "...", "matchedPreferences": ["구체적 수치 포함..."] },
    { "pcode": "숫자pcode", "rank": 3, "recommendationReason": "...", "matchedPreferences": ["구체적 수치 포함..."] }
  ]
}

⚠️ matchedPreferences도 구체적으로: "빠른 가열" (❌) → "빠른 가열 (85개 리뷰 중 68개 언급)" (✅)

## 추천 이유 작성 가이드 (매우 중요!)
추천 이유는 반드시 **사용자가 선택한 조건**과 **이 제품이 그 조건을 어떻게 충족하는지**를 연결해야 합니다.

### ⚠️ 필수: 구체적 근거 제시
- **정량적 수치 필수**: "리뷰가 많아요" (❌) → "85개 리뷰 중 72개에서 언급" (✅)
- **스펙 → 실사용 효과 연결**: "300W 고출력" (❌) → "300W로 2분 내 데워져 새벽 수유가 빨라요" (✅)
- **부정 리뷰도 정량화**: "소음 적음" (❌) → "120개 리뷰 중 소음 불만 단 3건" (✅)
- **사용자 선택 조건 직접 연결**: 선택한 체감속성/필터 키워드를 자연스럽게 언급

※ recommendationReason은 1~2문장, 최대 3문장으로 작성하세요.

### 좋은 예시 (구체적 수치 + 스펙-효과 연결 + 리뷰 정량화)
- "선택하신 빠른 가열 조건에 맞춰, 300W 고출력으로 2분 내 데워져요. 실제로 85개 리뷰 중 68개에서 '새벽 수유 때 빨리 먹여서 좋다'고 언급했어요"
- "세척 편의를 중요하게 보셨는데, 분리형 3단 구조로 구석구석 닦을 수 있어요. 92개 리뷰 중 79개가 '세척 편하다'고 평가했고, 평점 4.7/5.0이에요"
- "소음을 걱정하셨죠. 저소음 모터(35dB)라 조용하고, 150개 리뷰 중 소음 불만은 단 2건뿐이에요"
- "가볍고 휴대 편한 걸 원하셨는데, 850g으로 한 손에 들고 다닐 수 있어요. 여행용으로 쓴다는 리뷰가 48개 중 31개예요"
- "신생아부터 써야 한다고 하셨죠. 0개월부터 36개월까지 쓸 수 있고, 신생아 부모 리뷰 64개 중 '신생아 때부터 잘 썼다'는 평가가 58개예요"
- "스테인리스 소재를 선호하셨는데, 304 스테인리스로 내구성이 좋아요. 1년 이상 사용자 리뷰 23개 중 22개가 '변색/파손 없다'고 해요"

### 나쁜 예시 (절대 사용하지 마세요)
- ❌ "rule_pot_warm_fast 조건에 맞는 제품이에요" (영어 변수명 노출)
- ❌ "하드필터 조건을 만족하는 제품이에요" (시스템 용어 노출)
- ❌ "크기: 86.6 x 85 x117.7 mm 스펙으로 실용적이에요" (스펙만 나열, 효과 없음)
- ❌ "인기순위 5위로 많은 분들이 선택한 제품이에요" (사용자 선택과 무관)
- ❌ "좋은 제품이에요" (너무 추상적)
- ❌ "리뷰가 많아요" / "만족도가 높아요" (정량적 수치 없음)
- ❌ "세척이 편해요" (구체적 이유/근거 없음)

### 작성 원칙 (우선순위 순)
1. **정량적 근거 필수**: 리뷰 개수, 비율, 평점, 스펙 수치를 구체적으로 제시
2. **사용자 선택 조건 명시적 연결**: "선택하신 [조건]에 맞춰", "[선택한 특성]을 중요하게 보셨는데"
3. **스펙 → 실사용 효과 체인**: 스펙 수치 → 그로 인한 사용자 경험 → 리뷰 근거
4. **긍정+부정 리뷰 모두 활용**: "X개 리뷰 중 Y개 긍정" 또는 "X개 중 단점 언급 단 Y건"
5. **이 제품만의 차별점**: 다른 제품과 구분되는 구체적 특징 + 수치
6. **자연스러운 대화체**: 정량적이되, 딱딱하지 않게 한국어로 자연스럽게
7. **리뷰 인용 간결하게**: 리뷰 원문은 짧게 따옴표로, 전체 맥락은 자연스럽게

- JSON만 응답`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // 디버그: LLM 원본 응답 로그
  console.log(`[recommend-final] 📝 LLM raw response (first 800 chars):`, responseText.slice(0, 800));
  console.log(`[recommend-final] 🎯 userContext:`, JSON.stringify(userContext, null, 2));

  const parsed = parseJSONResponse(responseText) as {
    top3?: Array<{
      pcode: string;
      rank: number;
      recommendationReason?: string;
      matchedPreferences?: string[];
    }>;
    selectionReason?: string;
  };

  // 결과를 RecommendedProduct 형태로 변환 (중복 제거 + variants 추가)
  const top3Products: RecommendedProduct[] = [];
  const usedGroupKeys = new Set<string>();  // 중복 그룹 체크용

  for (const item of parsed.top3 || []) {
    const candidate = candidates.find(c => c.pcode === item.pcode);
    if (candidate) {
      // 중복 그룹 체크
      const groupKey = normalizeTitle(candidate.title);
      if (usedGroupKeys.has(groupKey)) {
        console.log(`[recommend-final] ⚠️ Skipping duplicate group: ${groupKey}`);
        continue;
      }
      usedGroupKeys.add(groupKey);

      // LLM이 matchedPreferences를 제공하지 않으면 matchedRules 사용
      const preferences = (item.matchedPreferences && item.matchedPreferences.length > 0)
        ? item.matchedPreferences
        : candidate.matchedRules || [];

      const useFallback = !item.recommendationReason;
      if (useFallback) {
        console.log(`[recommend-final] ⚠️ Using fallback for pcode ${item.pcode}: LLM returned empty recommendationReason`);
      }

      const reason = item.recommendationReason || generateFallbackReason(candidate, item.rank, userContext);
      top3Products.push(enrichWithVariants(candidate, candidates, reason, preferences, item.rank));
    }
  }

  // 만약 3개 미만이면 기존 점수 기준으로 채우기 (중복 제거 적용)
  if (top3Products.length < 3) {
    const selectedPcodes = new Set(top3Products.map(p => p.pcode));

    // 중복 제거된 후보에서 선택
    const deduped = deduplicateProducts(candidates);
    const remaining = deduped
      .filter(c => !selectedPcodes.has(c.pcode) && !usedGroupKeys.has(normalizeTitle(c.title)))
      .slice(0, 3 - top3Products.length);

    for (const p of remaining) {
      const newRank = top3Products.length + 1;
      const reason = generateFallbackReason(p, newRank, userContext);
      top3Products.push(enrichWithVariants(p, candidates, reason, p.matchedRules || [], newRank));
    }
  }

  return {
    top3Products,
    selectionReason: parsed.selectionReason || '원하시는 조건과 제품 특성을 종합적으로 분석해서 선정했어요.',
  };
}

/**
 * Fallback: 점수 기준 Top 3 반환 (중복 제거 + variants 포함)
 */
function selectTop3Fallback(
  candidates: CandidateProduct[],
  userContext?: UserContext
): {
  top3Products: RecommendedProduct[];
  selectionReason: string;
} {
  // 점수 순 정렬 후 중복 제거
  const sorted = [...candidates].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  const dedupedTop3 = deduplicateProducts(sorted, 3);

  const top3Products: RecommendedProduct[] = dedupedTop3.map((p, index) => {
    const rank = index + 1;
    const reason = generateFallbackReason(p, rank, userContext);
    return enrichWithVariants(p, candidates, reason, p.matchedRules || [], rank);
  });

  return {
    top3Products,
    selectionReason: '원하시는 조건에 맞춰 가장 적합한 제품을 선정했어요.',
  };
}

/**
 * 밸런스 선택 키에서 사용자 친화적 텍스트 추출
 * 실제 키 형태: "체감속성_손목보호_가벼움", "체감속성_새벽수유_1초완성" 등
 */
function getBalanceSelectionText(ruleKey: string): string {
  // 한국어 체감속성 키 → 사용자 친화적 텍스트
  const koreanMapping: Record<string, string> = {
    // 젖병
    '손목보호_가벼움': '가벼운 무게',
    '미세플라스틱_제로': '미세플라스틱 걱정 없는 소재',
    '설거지_해방_식세기': '식기세척기 사용',
    '세척솔_필요없는_와이드': '넓은 입구로 세척 편의',
    '배앓이_철벽방어': '배앓이 방지 기능',
    '유두혼동_최소화': '유두혼동 방지',
    '여행용_간편함': '여행용 휴대 편의',

    // 분유포트
    '새벽수유_1초완성': '빠른 가열/영구보온',
    '배고픈아기_급속냉각': '급속 냉각 기능',
    '손목보호_자동출수': '자동 출수 기능',
    '위생적인_통유리': '통유리로 위생적',
    '내구성_스테인리스': '스테인리스 내구성',
    '수돗물_안심제거': '수돗물 염소 제거',
    '밤중수유_무드등': '밤중 수유등',

    // 유모차
    '초경량_깃털무게': '초경량 무게',
    '나홀로_원터치_폴딩': '원터치 폴딩',
    '신생아_흔들림_제로': '신생아 안정감',
    '비행기_기내반입': '기내 반입 가능',
    '양대면_아이컨택': '양대면 시선 교환',
    '오래쓰는_튼튼함': '튼튼한 내구성',
    '쌍둥이_다둥이': '쌍둥이/연년생용',

    // 카시트
    '허리보호_360회전': '360도 회전',
    '유럽안전인증_iSize': 'i-Size 안전 인증',
    '신생아_바구니': '바구니형 이동',
    '주니어_오래사용': '주니어까지 사용',
    '안전고정_ISOFIX': 'ISOFIX 안전 고정',
    '측면충돌_보호': '측면 충돌 보호',
    '편안한_다리공간': '넓은 다리 공간',

    // 기저귀
    '여름철_땀띠_해방': '통기성 좋음',
    '밤샘_이불빨래_끝': '높은 흡수력',
    '활동적인_아기_팬티': '팬티형 편의',
    '예민보스_피부보호': '피부 저자극',
    '신생아_배꼽케어': '배꼽 보호',
    '가성비_대량구매': '가성비 좋음',
    '물놀이_전용': '물놀이 전용',

    // 체온계
    '정확도_병원급': '병원급 정확도',
    '비접촉_위생': '비접촉 측정',
    '밤중_몰래측정': '무음/야간 모드',
    '빠른_1초측정': '1초 빠른 측정',
    '생활온도_겸용': '다용도 온도 측정',
    '스마트_기록관리': '앱 연동 기록',

    // 코흡입기
    '강력흡입_전동식': '전동식 강력 흡입',
    '휴대간편_수동식': '수동식 휴대 간편',
    '부드러운_실리콘팁': '부드러운 실리콘',
    '위생_세척용이': '세척 용이',

    // 베이비모니터
    '해킹안심_보안': '해킹 방지 보안',
    '선명한_화질': '선명한 화질',
    '움직임_감지알림': '움직임 감지 알림',
    '밤샘_지킴이': '야간 모드',
    '양방향_소통': '양방향 대화',
    '사각지대_제로': '360도 회전',

    // 분유제조기
    '스마트_원격제어': '스마트 원격 제어',
    '위생_자동세척': '자동 세척 기능',
    '미세조절_맞춤': '정밀 온도/양 조절',
    '올인원_포트겸용': '포트 겸용',
    '대용량_물탱크': '대용량',
    '안전소재': '안전한 소재',
  };

  // 체감속성_ 접두사 제거 후 매핑 검색
  const cleanKey = ruleKey.replace('체감속성_', '');

  for (const [key, text] of Object.entries(koreanMapping)) {
    if (cleanKey.includes(key) || ruleKey.includes(key)) {
      return text;
    }
  }

  // 기본 변환: 언더스코어를 공백으로, 체감속성_ 제거
  return cleanKey.replace(/_/g, ' ');
}

/**
 * Fallback용 추천 이유 생성 (사용자 선택 연결)
 */
function generateFallbackReason(
  product: CandidateProduct,
  rank: number,
  userContext?: UserContext
): string {
  const reasons: string[] = [];

  // 디버그: fallback 진입 시 데이터 확인
  console.log(`[fallback] 🔍 product.matchedRules:`, product.matchedRules);
  console.log(`[fallback] 🔍 userContext.balanceSelections:`, userContext?.balanceSelections);

  // 1. 매칭된 밸런스 선택과 연결
  if (product.matchedRules && product.matchedRules.length > 0) {
    const positiveRules = product.matchedRules.filter(r => !r.startsWith('❌'));
    if (positiveRules.length > 0) {
      const topPreference = getBalanceSelectionText(positiveRules[0]);
      // 매핑 실패 체크: 영어, 숫자, 또는 시스템 용어가 포함된 경우 일반 메시지로 대체
      const hasInvalidChars = /[a-zA-Z0-9_]|hf|체감속성/.test(topPreference);
      const isTooShort = topPreference.length < 3;

      if (hasInvalidChars || isTooShort) {
        reasons.push('선택하신 조건에 잘 맞는 제품이에요');
      } else {
        reasons.push(`${topPreference}을(를) 원하셨는데, 이 조건에 잘 맞는 제품이에요`);
      }
    }
  }

  // 2. 사용자가 선택한 밸런스 게임 항목 기반 (userContext 활용)
  if (reasons.length === 0 && userContext?.balanceSelections && userContext.balanceSelections.length > 0) {
    const userPreference = getBalanceSelectionText(userContext.balanceSelections[0]);
    // 매핑 실패 체크: 영어, 숫자, 또는 시스템 용어가 포함된 경우 일반 메시지로 대체
    const hasInvalidChars = /[a-zA-Z0-9_]|hf|체감속성/.test(userPreference);
    const isTooShort = userPreference.length < 3;

    if (hasInvalidChars || isTooShort) {
      reasons.push('선택하신 선호 조건에 잘 맞는 제품이에요');
    } else {
      reasons.push(`${userPreference}을(를) 중시하시는 분께 적합한 제품이에요`);
    }
  }

  // 3. 피하고 싶은 단점이 없음을 강조
  if (userContext?.negativeSelections && userContext.negativeSelections.length > 0) {
    const avoidedIssue = getBalanceSelectionText(userContext.negativeSelections[0]);
    // 매핑 실패 체크: 영어, 숫자, 또는 시스템 용어가 포함된 경우 일반 메시지로 대체
    const hasInvalidChars = /[a-zA-Z0-9_]|hf|체감속성/.test(avoidedIssue);
    const isTooShort = avoidedIssue.length < 3;

    if (hasInvalidChars || isTooShort) {
      reasons.push('걱정하셨던 단점이 없는 제품이에요');
    } else {
      reasons.push(`걱정하셨던 ${avoidedIssue} 문제가 없어요`);
    }
  }

  // 4. 기본 fallback
  if (reasons.length === 0) {
    if (rank === 1) {
      reasons.push('선택하신 조건들을 종합 분석한 결과 가장 적합한 제품이에요');
    } else if (rank === 2) {
      reasons.push('1위와 비슷한 조건을 충족하면서 다른 장점이 있는 제품이에요');
    } else {
      reasons.push('선택하신 조건에 맞는 좋은 대안 제품이에요');
    }
  }

  return reasons[0];
}

export async function POST(request: NextRequest): Promise<NextResponse<RecommendFinalResponse>> {
  try {
    const body: RecommendFinalRequest = await request.json();
    const {
      categoryKey,
      candidateProducts,
      userContext = {},
      budget = { min: 0, max: 10000000 }
    } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'candidateProducts array is required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let top3Products: RecommendedProduct[];
    let selectionReason: string;
    let generated_by: 'llm' | 'fallback' = 'fallback';

    // LLM 사용 가능 여부 확인
    if (isGeminiAvailable() && insights) {
      try {
        const llmResult = await callGeminiWithRetry(
          () => selectTop3WithLLM(
            categoryKey,
            categoryName,
            insights,
            candidateProducts,
            userContext,
            budget
          ),
          2, // 최대 2번 재시도
          1500
        );

        top3Products = llmResult.top3Products;
        selectionReason = llmResult.selectionReason;
        generated_by = 'llm';

        console.log(`[recommend-final] LLM selected Top 3 for ${categoryKey}: ${top3Products.map(p => p.pcode).join(', ')}`);
      } catch (llmError) {
        console.error('[recommend-final] LLM failed, using fallback:', llmError);
        const fallbackResult = selectTop3Fallback(candidateProducts, userContext);
        top3Products = fallbackResult.top3Products;
        selectionReason = fallbackResult.selectionReason;
      }
    } else {
      // LLM 없을 때 fallback
      console.log(`[recommend-final] LLM not available, using fallback for ${categoryKey}`);
      const fallbackResult = selectTop3Fallback(candidateProducts, userContext);
      top3Products = fallbackResult.top3Products;
      selectionReason = fallbackResult.selectionReason;
    }

    return NextResponse.json({
      success: true,
      data: {
        categoryKey,
        categoryName,
        top3Products,
        selectionReason,
        generated_by,
        totalCandidates: candidateProducts.length,
      },
    });
  } catch (error) {
    console.error('[recommend-final] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate final recommendations' },
      { status: 500 }
    );
  }
}

/**
 * GET: API 정보 및 사용법 반환
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    info: {
      endpoint: '/api/v2/recommend-final',
      method: 'POST',
      description: 'LLM 기반 최종 Top 3 추천 API',
      input: {
        categoryKey: 'string (required)',
        candidateProducts: 'CandidateProduct[] (required) - 점수 계산된 후보 상품들',
        userContext: {
          hardFilterAnswers: 'Record<string, string[]> (optional)',
          balanceSelections: 'string[] (optional) - 선택한 밸런스 게임 rule_key',
          negativeSelections: 'string[] (optional) - 선택한 단점 필터 rule_key',
        },
        budget: '{ min: number, max: number } (optional)',
      },
      output: {
        top3Products: 'RecommendedProduct[] - 추천 이유가 포함된 Top 3 제품',
        selectionReason: 'string - 전체 선정 기준 설명',
        generated_by: "'llm' | 'fallback'",
      },
    },
  });
}
