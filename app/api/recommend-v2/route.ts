import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import type { Category, ProductSpec, ProductWithReviews } from '@/lib/data';
import {
  getSpecsByCategory,
  filterByBudget,
  getTopByPopularity,
  getProductSpec,
} from '@/lib/data/specLoader';
import {
  getReviewsForProduct,
  getReviewsForMultipleProducts,
  sampleLongestReviews,
  sampleBalancedBySentiment,
  formatReviewsForLLM,
} from '@/lib/review';
import {
  TagWithAttributes,
  scoreProducts,
  getTopNByScore,
  debugScoringBreakdown,
} from '@/lib/scoring/tagBasedScoring';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';
import { generateContextSummaryFromTags } from '@/lib/utils/generateContextSummaryFromTags';
import type { BudgetRange, UserContextSummary } from '@/types';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface Tag {
  id: string;
  text: string;
  mentionCount?: number;
  attributes: Record<string, number>;
}

interface RecommendRequest {
  category: Category;
  anchorId: string;
  selectedProsTags: Tag[]; // Full tag objects with attributes
  selectedConsTags: Tag[]; // Full tag objects with attributes
  budget: string; // "0-50000", "50000-100000", etc.
}

interface SelectedTagEvaluation {
  userTag: string;
  tagType: 'pros' | 'cons';
  priority: number;
  status: '충족' | '부분충족' | '불충족' | '개선됨' | '부분개선' | '회피안됨';
  evidence: string;
  citations: number[];
  tradeoff?: string;
}

interface ProductEvaluation {
  product: ProductSpec;
  fitScore: number;
  reasoning: string;
  selectedTagsEvaluation: SelectedTagEvaluation[];
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations?: number[] }>;
  reviewCount: number;
  citedReviews: Array<{ index: number; text: string; rating: number }>;
}

/**
 * Note: RankComparison and ComparativeAnalysis interfaces moved to /api/comparative-analysis
 */

/**
 * Parse budget string to min/max values
 */
function parseBudget(budget: string): { min: number; max: number } {
  const [min, max] = budget.split('-').map((v) => (v === '+' ? Infinity : parseInt(v, 10)));
  return { min, max: max || Infinity };
}

/**
 * Step 3-1: LLM evaluates a single product (with anchor comparison)
 */
async function evaluateProduct(
  product: ProductSpec,
  anchorProduct: ProductSpec,
  category: Category,
  prosTexts: string[],
  consTexts: string[]
): Promise<ProductEvaluation> {
  try {
    // Get reviews for this product
    const allReviews = await getReviewsForProduct(category, String(product.productId));

    if (allReviews.length === 0) {
      return {
        product,
        fitScore: 0,
        reasoning: '리뷰 없음',
        selectedTagsEvaluation: [],
        additionalPros: [],
        cons: [],
        purchaseTip: [],
        reviewCount: 0,
        citedReviews: [],
      };
    }

    // Sample 10 high + 10 low reviews (optimized for speed)
    const { high, low } = sampleBalancedBySentiment(allReviews, 10, 10);

    // 🔧 Re-index sampled reviews to 1-30 (critical for citation accuracy)
    const reindexedHigh = high.map((r, i) => ({ ...r, index: i + 1 }));
    const reindexedLow = low.map((r, i) => ({ ...r, index: high.length + i + 1 }));
    const sampledReviews = [...reindexedHigh, ...reindexedLow];

    // DEBUG: Log review structure
    console.log(`\n📚 Review sampling for ${product.모델명}:`);
    console.log(`   Total sampled: ${sampledReviews.length} reviews`);
    console.log(`   High-rating (indices 1-${high.length}): ${high.length} reviews`);
    reindexedHigh.forEach((r, i) => {
      console.log(`      [${i + 1}] Rating: ${r.custom_metadata.rating}★`);
    });
    console.log(`   Low-rating (indices ${high.length + 1}-${sampledReviews.length}): ${low.length} reviews`);
    reindexedLow.forEach((r, i) => {
      console.log(`      [${high.length + i + 1}] Rating: ${r.custom_metadata.rating}★`);
    });

    // Build comprehensive specs section
    const specsEntries = Object.entries(product)
      .filter(([key, value]) =>
        value !== null &&
        value !== undefined &&
        !['productId', '브랜드', '모델명', '최저가', '총점', 'popularityScore', 'attributeScores', 'tagScore', 'tagScoringResult'].includes(key)
      )
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    // Build attributeScores section with Korean names
    const categoryAttributes = CATEGORY_ATTRIBUTES[category] || [];
    let attributeScoresSection = '(속성 점수 없음)';

    if (product.attributeScores && Object.keys(product.attributeScores).length > 0) {
      attributeScoresSection = Object.entries(product.attributeScores)
        .map(([attrKey, score]) => {
          const attrInfo = categoryAttributes.find(a => a.key === attrKey);
          const attrName = attrInfo ? attrInfo.name : attrKey;
          const scoreDisplay = score !== null ? `${score}점` : 'N/A';
          return `- ${attrName}: ${scoreDisplay}`;
        })
        .join('\n');
    }

    // Build anchor product section
    const anchorAttributeScoresSection = anchorProduct.attributeScores && Object.keys(anchorProduct.attributeScores).length > 0
      ? Object.entries(anchorProduct.attributeScores)
          .map(([attrKey, score]) => {
            const attrInfo = categoryAttributes.find(a => a.key === attrKey);
            const attrName = attrInfo ? attrInfo.name : attrKey;
            const scoreDisplay = score !== null ? `${score}점` : 'N/A';
            return `- ${attrName}: ${scoreDisplay}`;
          })
          .join('\n')
      : '(속성 점수 없음)';

    // Build evaluation prompt
    // IMPORTANT: Order represents user priority (1st = most important)
    const prosRequirements = prosTexts
      .map((t, i) => {
        const priority = i === 0 ? '⭐ 최우선' : i === 1 ? '⭐ 중요' : '';
        return `${i + 1}. **${t}** ${priority}`;
      })
      .join('\n');

    const consRequirements =
      consTexts.length > 0
        ? consTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : '(없음)';

    const query = `다음 제품이 사용자의 요구사항을 얼마나 잘 충족하는지 평가해주세요.

**사용자가 선택하신 기준 제품:**
- 브랜드: ${anchorProduct.브랜드}
- 모델명: ${anchorProduct.모델명}
- 가격: ${anchorProduct.최저가?.toLocaleString() || '정보 없음'}원
- 속성 점수:
${anchorAttributeScoresSection}


**평가할 제품 정보:**
- 브랜드: ${product.브랜드}
- 모델명: ${product.모델명}
- 가격: ${product.최저가?.toLocaleString() || '정보 없음'}원
- 총점: ${product.총점 || 'N/A'}

**제품 스펙:**
${specsEntries || '(스펙 정보 없음)'}

**제품 속성 점수 (0-100점, 실제 리뷰 기반 평가):**
${attributeScoresSection}

**사용자가 원하는 장점 (우선순위순 - 위에 있을수록 중요):**
${prosRequirements}

**사용자가 원하지 않는 단점 (피해야 함):**
${consRequirements}

**실제 사용자 리뷰 (${sampledReviews.length}개 샘플링):**

📗 **고평점 리뷰 (리뷰 1-${high.length}번) - 장점 근거로 사용:**
${formatReviewsForLLM(high, 40000)}

📕 **저평점 리뷰 (리뷰 ${high.length + 1}-${sampledReviews.length}번) - 단점 근거로 사용:**
${formatReviewsForLLM(low, 40000)}

**평가 기준:**
1. 사용자가 원하는 장점이 실제 리뷰와 스펙에서 확인되는가? (⭐표시가 있는 항목에 더 큰 가중치)
2. 사용자가 피하고 싶은 단점이 이 제품에도 있는가?
3. 제품의 특징이 사용자의 요구와 일치하는가?
4. 전반적인 만족도는 어떤가?
5. **⚠️ 중요**: 다른 제품들과 비교했을 때 이 제품만의 **독특한 강점**이 무엇인가?
   - 앵커 제품과의 차이점 (가격, 기능, 디자인 등)
   - 리뷰에서 반복적으로 언급되는 고유한 특징
   - recommendationReason에 이 차별점을 반드시 반영하세요

**⚠️ 출력 시 절대 금지 사항:**
- **속성 점수, 수치, 등급을 절대 언급하지 마세요**
- "8점", "95점", "온도 조절 점수", "위생 점수가 낮다", "85점 vs 78점" 등 모든 점수 표현 금지
- 속성 점수는 **내부 판단용**으로만 사용하고, 출력에는 "우수하다", "뛰어나다", "부족하다" 등 자연어로만 표현

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "fitScore": 85,
  "recommendationReason": "[제품의 핵심 차별점을 자연스럽게 1-2문장으로]",
  "selectedTagsEvaluation": [
    // ⚠️ 사용자가 선택한 ${prosTexts.length}개 장점 + ${consTexts.length}개 단점 = 총 ${prosTexts.length + consTexts.length}개만 평가
    // 장점 태그 예시 (선택한 개수만큼):
    {
      "userTag": "[사용자 선택 장점 태그 1]",
      "tagType": "pros",
      "priority": 1,
      "status": "충족",
      "evidence": "구체적 근거..."
    }
    // 단점 태그 예시 (선택한 개수만큼, 없으면 생략):
    ${consTexts.length > 0 ? `{
      "userTag": "[사용자 선택 단점 태그 1]",
      "tagType": "cons",
      "priority": 1,
      "status": "개선됨",
      "evidence": "구체적 근거..."
    }` : '// 단점 선택 안 함 - 배열에 추가하지 마세요'}
  ],
  "additionalPros": [
    { "text": "**추가로 발견된 장점** (2-3개)" }
  ],
  "cons": [
    { "text": "**제품의 단점** (1-3개)" }
  ],
  "purchaseTip": [
    { "text": "**구매 결정 조언** (1-2개)" }
  ]
}
\`\`\`

**중요:**
- **⚠️ 최우선 규칙: 속성 점수를 출력에 절대 언급하지 마세요** (내부 판단용으로만 사용)
- fitScore는 0-100 점수 (높을수록 사용자 요구에 부합)
- 우선순위가 높은 장점(⭐최우선)을 더 중요하게 평가하세요
- **recommendationReason**: 이 제품만의 핵심 차별점을 강조하는 요약 문구 (1-2문장)
  - **⚠️ 필수**: 다른 제품과 구별되는 **고유한 특징**을 부각하세요
  - **⚠️ 제품명/브랜드명 언급 금지**: 기능과 특징만 설명하세요
  - **⚠️ 불필요한 주어 금지**: "이 제품은", "이 제품을", "해당 제품은" 등으로 시작하지 마세요
  - **바로 핵심 특징부터 시작**: 기능/특징을 주어로 문장을 시작하세요
  - **자연스러운 회화체** 사용 - 딱딱한 표현 금지
    - ❌ "이 제품은 온도 조절이..."
    - ❌ "~를 충족하며, ~도 만족스럽게 제공합니다"
    - ❌ "~에 부합하는 제품입니다"
    - ✅ "**온도 조절 정확성**이 뛰어나고..."
    - ✅ "**넓은 입구**로 세척이 편하고..."
    - ✅ "~라서 ~하는 분께 딱이에요"
  - **차별화 전략** (fitScore에 따라):
    - fitScore 85+ (1위급): 1순위 장점 완벽 충족 + 추가 강점 강조
      예: "**온도 조절 정확성**이 뛰어나고, **8시간 보온**으로 밤새 편하게 사용할 수 있어요"
    - fitScore 70-84 (2위급): 가성비나 특정 강점 부각
      예: "가격 대비 **세척 편의성**이 훌륭하고, **컴팩트한 디자인**으로 공간 활용도 좋아요"
    - fitScore 70 미만 (3위급): 특화된 용도나 트레이드오프 설명
      예: "**초경량 무게**로 외출용으로 최적이지만, 용량은 다소 작은 편이에요"
  - 핵심 키워드 **볼드** 처리 (1-2개만)
  - **⚠️ 절대 점수 언급 금지**: "8점", "95점", "만점" 등 수치 표현 완전 금지
  - **⚠️ 형식적 표현 금지**: "가장 중요하게 생각하시는", "사용자가 원하는" 등 반복 금지
- **selectedTagsEvaluation**: 사용자가 선택한 **모든 태그**(장점 ${prosTexts.length}개 + 단점 ${consTexts.length}개 = 총 ${prosTexts.length + consTexts.length}개)를 순서대로 평가
  - **⚠️ CRITICAL**: selectedTagsEvaluation 배열의 길이는 **정확히 ${prosTexts.length + consTexts.length}개**여야 합니다
  - 사용자가 선택하지 않은 태그는 절대 추가하지 마세요
  - userTag: 사용자가 선택한 원문 그대로 + ** 강조 표시
  - tagType: "pros" (장점 태그) | "cons" (단점 태그)
  - priority: 각 tagType 내에서의 선택 순서 (1이 가장 중요)
  - status:
    - 장점 태그 (pros): "충족" (완벽히 만족) | "부분충족" (일부 만족) | "불충족" (만족 안 함)
    - 단점 태그 (cons): "개선됨" (단점 없음) | "부분개선" (일부 단점 있음) | "회피안됨" (단점 존재)
  - evidence: 해당 평가의 근거를 자연스럽게 설명, 핵심 키워드는 **키워드**로 볼드
    - 장점 태그 자연스러운 표현 예시:
      - "다수의 사용자들이 **정확한 온도 조절**을 강조하며 만족도가 높음"
      - "실제 구매자들이 **세척 편의성**을 높이 평가함"
      - "자동 출수 기능이 없음"
    - 단점 태그 자연스러운 표현 예시:
      - "터치 버튼 반응이 **안정적이고 민감도가 적절**하다는 평가가 많음" (개선됨)
      - "입구는 넓지만 **패킹 틈새**는 여전히 세척이 불편하다는 의견 있음" (부분개선)
      - "이 제품도 **유리 재질**로 무게감이 있고 파손 위험 우려가 있음" (회피안됨)
    - ❌ 피해야 할 표현: "리뷰 1, 3, 5번에서...", "리뷰 번호...", 리뷰 숫자 언급
  - tradeoff: (선택사항) status가 중간 상태("부분충족", "불충족", "부분개선", "회피안됨")일 때, 대신 얻는 이점이나 보완 설명, 핵심 키워드 볼드
  - **⚠️ 장점 평가는 고평점 리뷰(1-${high.length}번), 단점 평가는 저평점 리뷰(${high.length + 1}-${sampledReviews.length}번) 기반, 리뷰 번호는 언급하지 마세요**
  - **중요**: 장점 태그를 모두 나열한 후, 단점 태그를 나열하세요 (tagType별로 그룹화)
- **additionalPros**: 사용자가 선택하지 않았지만 발견된 장점 (2-3개)
  - text: 구체적인 기능에 대한 평가를 자연스럽게 작성, 핵심 키워드는 **키워드**로 볼드
  - **⚠️ 절대 점수 언급 금지**: 속성 점수, "95점", "8/10", "A등급" 등 수치 표현 완전 금지
  - 자연스러운 표현만 사용: "우수하다", "매우 좋다", "뛰어나다" 등
  - 예시: "**붕규산 유리** 재질로 위생적이라는 평가가 많음", "**빠른 냉각 속도**에 만족하는 사용자가 많음"
  - **⚠️ 고평점 리뷰(1-${high.length}번) 내용 기반, 리뷰 번호 언급 금지**
- **cons**: 단점 1-3개
  - text: 단점을 자연스럽게 설명, 핵심 키워드는 **키워드**로 볼드
  - **⚠️ 절대 점수 언급 금지**: "3점", "낮은 점수", "5/10" 등 수치 표현 완전 금지
  - 자연스러운 표현만 사용: "부족하다", "아쉽다", "개선이 필요하다" 등
  - 예시: "**터치 버튼 민감도**가 불규칙하다는 불만이 있음", "**유리 파손 위험**을 경험한 사용자들이 있음"
  - **⚠️ 주로 저평점 리뷰(${high.length + 1}-${sampledReviews.length}번) 기반, 리뷰 번호 언급 금지**
- **purchaseTip**: 구매 결정에 도움이 되는 핵심 조언 (리스트 형태, 1-2개 항목)
  - 각 항목은 { text } 형태
  - text: 조언 1문장, 핵심 키워드는 **키워드**로 볼드
  - 다음 우선순위로 작성 (높은 순서부터 확인):
    1. selectedTagsEvaluation에 "불충족" 장점 태그가 있는 경우 → 누락된 핵심 기능 경고
       예: "**자동 출수 기능**은 없으니 수동 조작이 불편하지 않은지 확인하세요"
    2. selectedTagsEvaluation에 "회피안됨" 단점 태그가 있는 경우 → 피하고 싶은 단점이 여전히 존재한다는 경고
       예: "**유리 재질**로 무게감과 파손 위험이 있으니 주의가 필요합니다"
    3. "부분충족" 또는 "부분개선" 태그가 있는 경우 → tradeoff를 고려한 주의사항
       예: "입구는 넓지만 **패킹 틈새 세척**이 불편하니 완벽한 세척을 원한다면 고려가 필요합니다"
    4. cons에 치명적 단점(파손 위험, 안전 문제, 내구성 이슈)이 있는 경우 → 해당 리스크 강조
       예: "**터치 버튼 민감도**가 불규칙하다는 불만이 있으니 조작감이 중요하다면 고려하세요"
    5. 위 경우가 모두 해당없으면 → 이 제품이 적합한 사용자 유형이나 사용 시나리오 설명
       예: "새벽 수유가 잦고 **온도 정확성**을 중시한다면 최적의 선택입니다"
  - ⚠️ 타 섹션과 중복 최소화: 구매 결정에 직접 영향을 주는 종합적 조언에 집중

**recommendationReason 작성 예시:**
✅ 좋은 예시 (자연스럽고 차별화됨):
- "**1℃ 단위 정밀 온도 조절**이 가능하고, **8시간 장시간 보온**으로 새벽 수유에 최적이에요"
- "**넓은 입구**로 세척이 편하고, **가격 대비 기능**이 훌륭해서 가성비를 중시하는 분께 추천해요"
- "**초경량 디자인**으로 휴대가 간편하지만, 보온 시간은 4시간으로 짧은 편이에요"
- "**스테인리스 재질**로 내구성이 뛰어나고, **자동 세척 기능**까지 갖춰 관리가 쉬워요"

❌ 나쁜 예시 (형식적이고 비슷함):
- "이 제품은 온도 조절 기능이 뛰어납니다" (불필요한 주어)
- "가장 중요하게 생각하시는 온도 조절을 완벽히 충족해요" (형식적)
- "사용자가 원하는 세척 편의성을 만족스럽게 제공합니다" (딱딱함)
- "요구사항에 부합하는 제품입니다" (차별점 없음)
- "온도 조절을 충족하며, 세척도 편리합니다" (모든 제품이 비슷하게 들림)

- 반드시 JSON 형식만 출력`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: query,
      config: {
        temperature: 0.3,
      },
    });

    if (!result.text) {
      throw new Error('No text returned from LLM');
    }

    let summaryText = result.text.trim();

    // Parse JSON
    if (summaryText.includes('```json')) {
      summaryText = summaryText.split('```json')[1].split('```')[0].trim();
    } else if (summaryText.includes('```')) {
      summaryText = summaryText.split('```')[1].split('```')[0].trim();
    }

    const evaluation = JSON.parse(summaryText) as {
      fitScore: number;
      recommendationReason: string;
      selectedTagsEvaluation: SelectedTagEvaluation[];
      additionalPros: Array<{ text: string; citations: number[] }>;
      cons: Array<{ text: string; citations: number[] }>;
      purchaseTip: Array<{ text: string; citations?: number[] }>;
    };

    // Validate selectedTagsEvaluation length
    const expectedLength = prosTexts.length + consTexts.length;
    if (evaluation.selectedTagsEvaluation.length !== expectedLength) {
      console.warn(`⚠️ selectedTagsEvaluation length mismatch: expected ${expectedLength}, got ${evaluation.selectedTagsEvaluation.length}`);
      console.warn(`   Filtering to match user-selected tags only...`);

      // Filter to only include tags that match user-selected tags
      evaluation.selectedTagsEvaluation = evaluation.selectedTagsEvaluation.filter(tagEval => {
        const matchesPros = prosTexts.some(prosText => tagEval.userTag.includes(prosText) || prosText.includes(tagEval.userTag.replace(/\*\*/g, '')));
        const matchesCons = consTexts.some(consText => tagEval.userTag.includes(consText) || consText.includes(tagEval.userTag.replace(/\*\*/g, '')));
        return matchesPros || matchesCons;
      });

      console.warn(`   After filtering: ${evaluation.selectedTagsEvaluation.length} tags remain`);
    }

    // Note: Citations removed - LLM generates natural language evidence instead

    return {
      product,
      fitScore: evaluation.fitScore,
      reasoning: evaluation.recommendationReason,
      selectedTagsEvaluation: evaluation.selectedTagsEvaluation,
      additionalPros: evaluation.additionalPros,
      cons: evaluation.cons,
      purchaseTip: evaluation.purchaseTip,
      reviewCount: allReviews.length,
      citedReviews: [], // Citations removed - natural language evidence used instead
    };
  } catch (error) {
    console.error(`Failed to evaluate product ${product.productId}:`, error);
    return {
      product,
      fitScore: 0,
      reasoning: '평가 실패',
      selectedTagsEvaluation: [],
      additionalPros: [],
      cons: [],
      purchaseTip: [],
      reviewCount: 0,
      citedReviews: [],
    };
  }
}

/**
 * Note: generateComparativeAnalysis moved to /api/comparative-analysis
 * for lazy loading to improve initial response time
 */

/**
 * Core recommendation logic (extracted for reuse)
 * Can be called directly from other server-side code
 */
export async function generateRecommendations(
  category: Category,
  anchorId: string,
  selectedProsTags: Tag[],
  selectedConsTags: Tag[],
  budget: string
) {
  console.log(`🎯 Recommendation request:`);
  console.log(`   Category: ${category}`);
  console.log(`   Anchor: ${anchorId}`);
  console.log(`   Pros: ${selectedProsTags.length} tags`);
  console.log(`   Cons: ${selectedConsTags.length} tags`);
  console.log(`   Budget: ${budget}`);

  const startTime = Date.now();

    // ===== STEP 1: Budget Filtering (Fast, Local JSON) =====
    console.log(`\n📊 Step 1: Budget filtering...`);
    const step1Start = Date.now();
    const allSpecs = await getSpecsByCategory(category);
    const { min, max } = parseBudget(budget);
    const budgetFiltered = filterByBudget(allSpecs, max, min);
    const step1Time = Date.now() - step1Start;

    console.log(`   ✅ ${allSpecs.length} → ${budgetFiltered.length} products (budget: ${min}-${max})`);
    console.log(`   ⏱️  Step 1 completed in ${step1Time}ms`);

    if (budgetFiltered.length === 0) {
      return NextResponse.json(
        {
          error: '예산 범위 내 제품 없음',
          details: '예산을 조정해주세요.',
        },
        { status: 404 }
      );
    }

    // ===== STEP 2: Tag-Based Scoring (Fast, Local JSON) =====
    console.log(`\n🎯 Step 2: Tag-based scoring...`);
    const step2Start = Date.now();

    // Check if products have attributeScores
    const hasAttributeScores = budgetFiltered.some(p => p.attributeScores && Object.keys(p.attributeScores).length > 0);

    let topCandidates: ProductSpec[];

    if (!hasAttributeScores) {
      // Fallback: Use popularity sorting if attribute scores not available yet
      console.warn(`   ⚠️ Products missing attributeScores - falling back to popularity sorting`);
      topCandidates = getTopByPopularity(budgetFiltered, 5);
      console.log(`   ✅ Top 5 candidates selected for parallel evaluation (popularity fallback)`);
    } else {
      // Primary method: Tag-based scoring
      // Convert productId from number to string for scoreProducts
      const productsWithStringId = budgetFiltered.map(p => ({
        ...p,
        productId: String(p.productId),
        attributeScores: p.attributeScores
      }));

      const scoredProducts = scoreProducts(
        selectedProsTags,
        selectedConsTags,
        productsWithStringId
      );

      // Convert back to ProductSpec for getTopNByScore
      topCandidates = getTopNByScore(scoredProducts, 5).map(p => ({
        ...p,
        productId: Number(p.productId) // Convert back to number
      })) as ProductSpec[];

      console.log(`   ✅ Top 5 candidates selected for parallel evaluation (tag-based scoring)`);
      console.log(`   📊 Tag scoring stats:`);
      console.log(`      Selected Pros: ${selectedProsTags.length} tags`);
      console.log(`      Selected Cons: ${selectedConsTags.length} tags`);

      // Debug: Show top 3 scoring breakdown
      if (topCandidates.length > 0 && (topCandidates[0] as any).tagScoringResult) {
        console.log(`\n   🔍 Top product scoring breakdown:`);
        debugScoringBreakdown(
          String(topCandidates[0].productId),
          (topCandidates[0] as any).tagScoringResult
        );
      }
    }

    const step2Time = Date.now() - step2Start;
    console.log(`   ⏱️  Step 2 completed in ${step2Time}ms`);

    topCandidates.slice(0, 5).forEach((p, i) => {
      const score = (p as any).tagScore !== undefined
        ? `Tag Score: ${(p as any).tagScore.toFixed(2)}`
        : `Popularity: ${p.popularityScore?.toFixed(1)}`;
      console.log(`   ${i + 1}. ${p.브랜드} ${p.모델명} (${score})`);
    });

    // Get anchor product for comparison (needed in STEP 3-1)
    const anchorProduct = await getProductSpec(category, anchorId);

    if (!anchorProduct) {
      return NextResponse.json(
        { error: '앵커 제품을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // ===== STEP 3-1: LLM Qualitative Evaluation (Slow, Parallel) =====
    console.log(`\n🤖 Step 3-1: Individual product evaluation (parallel)...`);
    const step3Start = Date.now();

    // Extract tag texts from full tag objects
    const prosTexts = selectedProsTags.map(tag => tag.text);
    const consTexts = selectedConsTags.map(tag => tag.text);

    // Evaluate all candidates in parallel (batch of 5 to avoid rate limits)
    const batchSize = 5;
    const evaluations: ProductEvaluation[] = [];
    const individualEvalTimes: number[] = [];

    for (let i = 0; i < topCandidates.length; i += batchSize) {
      const batch = topCandidates.slice(i, i + batchSize);
      console.log(`   Evaluating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(topCandidates.length / batchSize)}...`);
      const batchStart = Date.now();

      const batchEvaluations = await Promise.all(
        batch.map(async (product) => {
          const evalStart = Date.now();
          const result = await evaluateProduct(product, anchorProduct, category, prosTexts, consTexts);
          const evalTime = Date.now() - evalStart;
          individualEvalTimes.push(evalTime);
          console.log(`      ⏱️  ${product.브랜드} ${product.모델명}: ${evalTime}ms`);
          return result;
        })
      );

      const batchTime = Date.now() - batchStart;
      console.log(`   ⏱️  Batch ${Math.floor(i / batchSize) + 1} completed in ${batchTime}ms (parallel)`);

      evaluations.push(...batchEvaluations);
    }

    const step3Time = Date.now() - step3Start;
    const avgEvalTime = individualEvalTimes.reduce((a, b) => a + b, 0) / individualEvalTimes.length;
    console.log(`   ⏱️  Step 3-1 total: ${step3Time}ms (avg per product: ${Math.round(avgEvalTime)}ms)`);

    // Sort by fitScore and take top 3
    evaluations.sort((a, b) => b.fitScore - a.fitScore);
    const top3 = evaluations.slice(0, 3);

    console.log(`\n🏆 Top 3 recommendations:`);
    top3.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.product.브랜드} ${e.product.모델명}`);
      console.log(`      Fit Score: ${e.fitScore} | Reviews: ${e.reviewCount}`);
      console.log(`      ${e.reasoning}`);
    });

    // ===== STEP 3-2: Comparative Analysis - REMOVED (Lazy loaded via /api/comparative-analysis) =====
    // Comparative analysis is now generated on-demand in the background
    // to improve initial response time

    // ===== STEP 4: Context Summary Generation (Code-based, No LLM) =====
    console.log(`\n📝 Step 4: Generating context summary...`);
    const step4Start = Date.now();

    // Generate contextSummary from tags (code-based, instant)
    const contextSummary: UserContextSummary = generateContextSummaryFromTags(
      selectedProsTags,
      selectedConsTags,
      budget as BudgetRange
    );

    const step4Time = Date.now() - step4Start;
    console.log(`   ⏱️  Step 4 completed in ${step4Time}ms (code-based)`);

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ Total processing time: ${totalTime}ms`);
    console.log(`\n📊 Performance Breakdown:`);
    console.log(`   Step 1 (Budget Filter):    ${step1Time}ms (${((step1Time / totalTime) * 100).toFixed(1)}%)`);
    console.log(`   Step 2 (Tag Scoring):      ${step2Time}ms (${((step2Time / totalTime) * 100).toFixed(1)}%)`);
    console.log(`   Step 3 (LLM Evaluation):   ${step3Time}ms (${((step3Time / totalTime) * 100).toFixed(1)}%)`);
    console.log(`   Step 4 (Context Summary):  ${step4Time}ms (${((step4Time / totalTime) * 100).toFixed(1)}%)`);
    console.log(`   Other overhead:            ${totalTime - step1Time - step2Time - step3Time - step4Time}ms`);

    return {
      success: true,
      category,
      recommendations: top3.map((e) => ({
        ...e.product,
        fitScore: e.fitScore,
        reasoning: e.reasoning,
        selectedTagsEvaluation: e.selectedTagsEvaluation,
        additionalPros: e.additionalPros,
        cons: e.cons,
        purchaseTip: e.purchaseTip,
        reviewCount: e.reviewCount,
        citedReviews: e.citedReviews,
      })),
      // comparativeAnalysis removed - now loaded lazily via /api/comparative-analysis
      anchorProduct,
      contextSummary,
      processingTime: {
        total: totalTime,
      },
    };
}

/**
 * POST /api/recommend-v2
 * HTTP endpoint wrapper for generateRecommendations
 */
export async function POST(req: NextRequest) {
  try {
    const body: RecommendRequest = await req.json();
    const { category, anchorId, selectedProsTags, selectedConsTags, budget } = body;

    if (!category || !anchorId || !selectedProsTags || !budget) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await generateRecommendations(
      category,
      anchorId,
      selectedProsTags,
      selectedConsTags,
      budget
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Recommend v2 API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations', details: String(error) },
      { status: 500 }
    );
  }
}
