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
  priority: number;
  status: '충족' | '부분충족' | '불충족';
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
  anchorComparison: string;
  purchaseTip: string;
  purchaseTipCitations: number[];
  reviewCount: number;
  citedReviews: Array<{ index: number; text: string; rating: number }>;
}

interface RankComparison {
  keyStrengths: string;
  keyWeaknesses: string;
  vsRank2?: string;
  vsRank3?: string;
  vsRank1?: string;
  vsAnchor: string;
  bestFor: string;
}

interface ComparativeAnalysis {
  overallSummary: string;
  rankComparison: {
    rank1: RankComparison;
    rank2: RankComparison;
    rank3: RankComparison;
  };
  useCaseRecommendations: Array<{
    useCase: string;
    recommended: string;
    reason: string;
  }>;
  budgetConsideration: {
    withinBudget: boolean;
    priceRange: string;
    valueAnalysis: string;
  };
  finalAdvice: string;
}

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
        anchorComparison: '리뷰 없음',
        purchaseTip: '',
        purchaseTipCitations: [],
        reviewCount: 0,
        citedReviews: [],
      };
    }

    // Sample 15 high + 15 low reviews (longest first) - More reviews for better analysis
    const { high, low } = sampleBalancedBySentiment(allReviews, 15, 15);
    const sampledReviews = [...high, ...low];

    // DEBUG: Log review structure
    console.log(`\n📚 Review sampling for ${product.모델명}:`);
    console.log(`   Total sampled: ${sampledReviews.length} reviews`);
    console.log(`   High-rating (indices 1-${high.length}): ${high.length} reviews`);
    high.forEach((r, i) => {
      console.log(`      [${i + 1}] Rating: ${r.custom_metadata.rating}★`);
    });
    console.log(`   Low-rating (indices ${high.length + 1}-${sampledReviews.length}): ${low.length} reviews`);
    low.forEach((r, i) => {
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

**앵커 제품 (사용자가 선택한 기준 제품):**
- 브랜드: ${anchorProduct.브랜드}
- 모델명: ${anchorProduct.모델명}
- 가격: ${anchorProduct.최저가?.toLocaleString() || '정보 없음'}원
- 속성 점수:
${anchorAttributeScoresSection}


**제품 정보:**
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
3. 속성 점수가 사용자의 요구와 일치하는가?
4. 전반적인 만족도는 어떤가?

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "fitScore": 85,
  "recommendationReason": "사용자가 최우선으로 선택한 온도 조절 정확성을 완벽히 충족하며, 세척 편의성도 우수합니다",
  "selectedTagsEvaluation": [
    {
      "userTag": "**1도 단위로 정확한 온도 조절**",
      "priority": 1,
      "status": "충족",
      "evidence": "리뷰 1, 3, 5, 8에서 정확한 온도 조절 강조",
      "citations": [1, 3, 5, 8]
    },
    {
      "userTag": "**입구 넓어서 세척 편리**",
      "priority": 2,
      "status": "부분충족",
      "evidence": "입구는 넓지만 패킹 틈새 세척 불편 언급",
      "citations": [2, 11],
      "tradeoff": "대신 디자인이 컴팩트해서 보관과 이동이 편리함"
    },
    {
      "userTag": "**자동 출수 기능**",
      "priority": 3,
      "status": "불충족",
      "evidence": "자동 출수 기능 없음",
      "tradeoff": "대신 버튼 조작이 간단하고 고장 위험 낮음"
    }
  ],
  "additionalPros": [
    {
      "text": "붕규산 유리로 위생적",
      "citations": [4, 6, 9]
    }
  ],
  "cons": [
    {
      "text": "터치 버튼 민감도 불규칙",
      "citations": [11, 13, 16]
    }
  ],
  "anchorComparison": "앵커 제품(${anchorProduct.브랜드} ${anchorProduct.모델명}) 대비 온도 조절 7점 향상, 세척 편의성 비슷, 가격 1만원 높음",
  "purchaseTip": "온도 조절 정확성을 최우선으로 한다면 추천하지만, 자동 출수 기능은 없으니 참고하세요",
  "purchaseTipCitations": [1, 3]
}
\`\`\`

**중요:**
- fitScore는 0-100 점수 (높을수록 사용자 요구에 부합)
- 우선순위가 높은 장점(⭐최우선)을 더 중요하게 평가하세요
- **selectedTagsEvaluation**: 사용자가 선택한 장점 태그를 순서대로 평가
  - userTag: 사용자가 선택한 원문 그대로 + ** 강조 표시
  - priority: 선택 순서 (1이 가장 중요)
  - status: "충족" (완벽히 만족) | "부분충족" (일부 만족) | "불충족" (만족 안 함)
  - evidence: 해당 평가의 근거 설명
  - citations: 근거 리뷰 번호 (1부터 시작)
  - tradeoff: (선택사항) status가 "부분충족"이나 "불충족"일 때, 대신 얻는 이점 설명
  - **⚠️ 장점 평가는 반드시 고평점 리뷰(1-${high.length}번)만 인용!**
- **additionalPros**: 사용자가 선택하지 않았지만 발견된 장점 (2-3개)
  - **⚠️ 고평점 리뷰(1-${high.length}번)만 인용!**
- **cons**: 단점 1-3개
  - **⚠️ 주로 저평점 리뷰(${high.length + 1}-${sampledReviews.length}번) 인용**
- **anchorComparison**: 앵커 제품 대비 비교 (속성 점수 차이, 가격 차이 포함)
- **purchaseTip**: 구매 시 참고할 조언 1-2문장
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
      anchorComparison: string;
      purchaseTip: string;
      purchaseTipCitations: number[];
    };

    // Build cited reviews array
    const allCitationIndices = new Set<number>();
    const selectedTagsCitations: number[] = [];
    const additionalProsAllCitations: number[] = [];
    const consAllCitations: number[] = [];

    evaluation.selectedTagsEvaluation.forEach(tagEval => {
      tagEval.citations.forEach(c => {
        allCitationIndices.add(c);
        selectedTagsCitations.push(c);
      });
    });
    evaluation.additionalPros.forEach(p => {
      p.citations.forEach(c => {
        allCitationIndices.add(c);
        additionalProsAllCitations.push(c);
      });
    });
    evaluation.cons.forEach(c => {
      c.citations.forEach(c => {
        allCitationIndices.add(c);
        consAllCitations.push(c);
      });
    });
    evaluation.purchaseTipCitations.forEach(c => allCitationIndices.add(c));

    // DEBUG: Citation analysis
    console.log(`\n🔍 Citation Analysis for ${product.모델명}:`);
    console.log(`   Selected tags citations: [${selectedTagsCitations.join(', ')}]`);
    console.log(`   Additional pros citations: [${additionalProsAllCitations.join(', ')}]`);
    console.log(`   Cons citations (raw): [${consAllCitations.join(', ')}]`);
    console.log(`   PurchaseTip citations: [${evaluation.purchaseTipCitations.join(', ')}]`);
    console.log(`   Total unique citations: ${allCitationIndices.size}`);
    console.log(`   Total citations (with duplicates): ${selectedTagsCitations.length + additionalProsAllCitations.length + consAllCitations.length + evaluation.purchaseTipCitations.length}`);

    // CRITICAL: Check if pros cite low-rating reviews (indices > high.length)
    const lowRatingStartIndex = high.length + 1;
    const allProsCitations = [...selectedTagsCitations, ...additionalProsAllCitations];
    const prosLowRatingCitations = allProsCitations.filter((c: number) => c >= lowRatingStartIndex);
    if (prosLowRatingCitations.length > 0) {
      console.error(`\n❌ CRITICAL BUG: Pros citing low-rating reviews!`);
      console.error(`   Pros should only cite indices 1-${high.length}, but found: [${prosLowRatingCitations.join(', ')}]`);
      console.error(`   Low-rating reviews start at index ${lowRatingStartIndex}`);
    }

    // Check for out-of-range citations
    const outOfRange = Array.from(allCitationIndices).filter(c => c < 1 || c > sampledReviews.length);
    if (outOfRange.length > 0) {
      console.error(`\n❌ Out-of-range citations: [${outOfRange.join(', ')}]`);
      console.error(`   Valid range: 1-${sampledReviews.length}`);
    }

    const citedReviews = Array.from(allCitationIndices)
      .sort((a, b) => a - b)
      .map(index => {
        const review = sampledReviews[index - 1]; // Convert 1-indexed to 0-indexed
        return review ? {
          index,
          text: review.text,
          rating: review.custom_metadata.rating
        } : null;
      })
      .filter(Boolean) as Array<{ index: number; text: string; rating: number }>;

    console.log(`   Successfully mapped: ${citedReviews.length}/${allCitationIndices.size} citations`);

    return {
      product,
      fitScore: evaluation.fitScore,
      reasoning: evaluation.recommendationReason,
      selectedTagsEvaluation: evaluation.selectedTagsEvaluation,
      additionalPros: evaluation.additionalPros,
      cons: evaluation.cons,
      anchorComparison: evaluation.anchorComparison,
      purchaseTip: evaluation.purchaseTip,
      purchaseTipCitations: evaluation.purchaseTipCitations,
      reviewCount: allReviews.length,
      citedReviews,
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
      anchorComparison: '평가 실패',
      purchaseTip: '',
      purchaseTipCitations: [],
      reviewCount: 0,
      citedReviews: [],
    };
  }
}

/**
 * Step 3-2: Generate comparative analysis for Top 3 products
 */
async function generateComparativeAnalysis(
  top3: ProductEvaluation[],
  anchorProduct: ProductSpec,
  category: Category,
  prosTexts: string[],
  consTexts: string[]
): Promise<ComparativeAnalysis> {
  try {
    const categoryAttributes = CATEGORY_ATTRIBUTES[category] || [];

    // Build product summaries with specs and attribute scores
    const productSummaries = top3.map((evaluation, index) => {
      const product = evaluation.product;
      const attributeScoresStr = product.attributeScores && Object.keys(product.attributeScores).length > 0
        ? Object.entries(product.attributeScores)
            .map(([attrKey, score]) => {
              const attrInfo = categoryAttributes.find(a => a.key === attrKey);
              const attrName = attrInfo ? attrInfo.name : attrKey;
              return `${attrName}: ${score}점`;
            })
            .join(', ')
        : '없음';

      const selectedTagsStatus = evaluation.selectedTagsEvaluation
        .map(tagEval => `"${tagEval.userTag.replace(/\*\*/g, '')}": ${tagEval.status}`)
        .join(', ');

      return `
${index + 1}위: ${product.브랜드} ${product.모델명}
- 가격: ${product.최저가?.toLocaleString() || '정보 없음'}원
- fitScore: ${evaluation.fitScore}
- 속성 점수: ${attributeScoresStr}
- 사용자 선택 태그 충족도: ${selectedTagsStatus}
- 앵커 대비: ${evaluation.anchorComparison}
      `.trim();
    });

    const query = `다음 Top 3 추천 제품을 종합 비교 분석해주세요.

**앵커 제품 (사용자가 선택한 기준 제품):**
- ${anchorProduct.브랜드} ${anchorProduct.모델명}
- 가격: ${anchorProduct.최저가?.toLocaleString() || '정보 없음'}원

**Top 3 추천 제품:**

${productSummaries.join('\n\n')}

**사용자가 선택한 장점 (우선순위순):**
${prosTexts.map((t, i) => `${i + 1}. **${t}** ${i === 0 ? '⭐ 최우선' : i === 1 ? '⭐ 중요' : ''}`).join('\n')}

**사용자가 선택한 단점 (피하고 싶음):**
${consTexts.length > 0 ? consTexts.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(없음)'}

---

**출력 형식 (JSON):**

\`\`\`json
{
  "overallSummary": "1위는 온도 조절 정확성 최우선 고객에게, 2위는 가성비 중시 고객에게, 3위는 편의성 극대화 원하는 고객에게 추천합니다",
  "rankComparison": {
    "rank1": {
      "keyStrengths": "온도 조절 정확성(85점), 위생성(78점)에서 3개 중 최고",
      "keyWeaknesses": "가격이 가장 높음, 자동 출수 기능 없음",
      "vsRank2": "2위 대비 온도 조절 7점 높지만, 가격 1만원 비쌈",
      "vsRank3": "3위 대비 가성비는 낮지만 온도 정확도는 우수",
      "vsAnchor": "앵커 대비 온도 조절 7점 향상, 가격 1만원 높음",
      "bestFor": "온도 조절 정확성을 최우선으로 하는 고객"
    },
    "rank2": {
      "keyStrengths": "가성비 최고, 쿨링팬으로 빠른 냉각",
      "keyWeaknesses": "온도 조절 정확도는 1위보다 낮음",
      "vsRank1": "1위 대비 가격 1만원 저렴하지만 온도 정확도 낮음",
      "vsRank3": "3위 대비 가격 2만원 저렴, 쿨링팬 속도 빠름",
      "vsAnchor": "앵커와 가격 동일, 쿨링팬 성능 향상",
      "bestFor": "가성비와 빠른 냉각을 원하는 고객"
    },
    "rank3": {
      "keyStrengths": "자동 출수, 무음 모드로 편의성 최고",
      "keyWeaknesses": "가격 가장 높음, 무게 무거움",
      "vsRank1": "1위 대비 자동 출수 있지만 온도 정확도는 낮음",
      "vsRank2": "2위 대비 편의 기능 많지만 가격 높음",
      "vsAnchor": "앵커 대비 자동 출수+무음 추가, 가격 높음",
      "bestFor": "편의성과 프리미엄 기능을 원하는 고객"
    }
  },
  "useCaseRecommendations": [
    {
      "useCase": "쌍둥이 부모 (빠른 조리 필요)",
      "recommended": "2위",
      "reason": "쿨링팬으로 가장 빠른 냉각"
    },
    {
      "useCase": "온도에 민감한 아기",
      "recommended": "1위",
      "reason": "1도 단위 정확한 온도 조절"
    }
  ],
  "budgetConsideration": {
    "withinBudget": true,
    "priceRange": "79,000~105,000원 (2.6만원 차이)",
    "valueAnalysis": "1만원 추가 투자 시 온도 정확도 대폭 향상"
  },
  "finalAdvice": "사용자가 온도 조절(1순위)을 선택했으므로 1위 제품이 가장 부합합니다"
}
\`\`\`

**중요:**
- overallSummary: 한 문장으로 Top 3의 차별점 요약
- rankComparison: 각 제품의 강점/약점과 다른 제품들 및 앵커와의 비교
- useCaseRecommendations: 3-5개의 구체적인 사용 상황별 추천
- budgetConsideration: 예산 범위와 가격 대비 가치 분석
- finalAdvice: 사용자의 우선순위를 고려한 최종 조언
- 반드시 JSON 형식만 출력`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: query,
      config: {
        temperature: 0.4,
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

    const analysis = JSON.parse(summaryText) as ComparativeAnalysis;

    console.log(`\n📊 Comparative analysis generated successfully`);

    return analysis;
  } catch (error) {
    console.error('Failed to generate comparative analysis:', error);
    // Return a fallback analysis
    return {
      overallSummary: 'Top 3 제품 비교 분석을 생성하지 못했습니다',
      rankComparison: {
        rank1: {
          keyStrengths: '-',
          keyWeaknesses: '-',
          vsAnchor: '-',
          bestFor: '-',
        },
        rank2: {
          keyStrengths: '-',
          keyWeaknesses: '-',
          vsAnchor: '-',
          bestFor: '-',
        },
        rank3: {
          keyStrengths: '-',
          keyWeaknesses: '-',
          vsAnchor: '-',
          bestFor: '-',
        },
      },
      useCaseRecommendations: [],
      budgetConsideration: {
        withinBudget: true,
        priceRange: '-',
        valueAnalysis: '-',
      },
      finalAdvice: '-',
    };
  }
}

/**
 * POST /api/recommend-v2
 * 3-stage recommendation engine
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

    console.log(`🎯 Recommendation request:`);
    console.log(`   Category: ${category}`);
    console.log(`   Anchor: ${anchorId}`);
    console.log(`   Pros: ${selectedProsTags.length} tags`);
    console.log(`   Cons: ${selectedConsTags.length} tags`);
    console.log(`   Budget: ${budget}`);

    const startTime = Date.now();

    // ===== STEP 1: Budget Filtering (Fast, Local JSON) =====
    console.log(`\n📊 Step 1: Budget filtering...`);
    const allSpecs = await getSpecsByCategory(category);
    const { min, max } = parseBudget(budget);
    const budgetFiltered = filterByBudget(allSpecs, max, min);

    console.log(`   ✅ ${allSpecs.length} → ${budgetFiltered.length} products (budget: ${min}-${max})`);

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

    // Extract tag texts from full tag objects
    const prosTexts = selectedProsTags.map(tag => tag.text);
    const consTexts = selectedConsTags.map(tag => tag.text);

    // Evaluate all candidates in parallel (batch of 5 to avoid rate limits)
    const batchSize = 5;
    const evaluations: ProductEvaluation[] = [];

    for (let i = 0; i < topCandidates.length; i += batchSize) {
      const batch = topCandidates.slice(i, i + batchSize);
      console.log(`   Evaluating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(topCandidates.length / batchSize)}...`);

      const batchEvaluations = await Promise.all(
        batch.map((product) =>
          evaluateProduct(product, anchorProduct, category, prosTexts, consTexts)
        )
      );

      evaluations.push(...batchEvaluations);
    }

    // Sort by fitScore and take top 3
    evaluations.sort((a, b) => b.fitScore - a.fitScore);
    const top3 = evaluations.slice(0, 3);

    console.log(`\n🏆 Top 3 recommendations:`);
    top3.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.product.브랜드} ${e.product.모델명}`);
      console.log(`      Fit Score: ${e.fitScore} | Reviews: ${e.reviewCount}`);
      console.log(`      ${e.reasoning}`);
    });

    // ===== STEP 3-2: Comparative Analysis (Fast, No Reviews) =====
    console.log(`\n🤖 Step 3-2: Comparative analysis...`);
    const comparativeAnalysis = await generateComparativeAnalysis(
      top3,
      anchorProduct,
      category,
      prosTexts,
      consTexts
    );

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ Total processing time: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      category,
      recommendations: top3.map((e) => ({
        ...e.product,
        fitScore: e.fitScore,
        reasoning: e.reasoning,
        selectedTagsEvaluation: e.selectedTagsEvaluation,
        additionalPros: e.additionalPros,
        cons: e.cons,
        anchorComparison: e.anchorComparison,
        purchaseTip: e.purchaseTip,
        purchaseTipCitations: e.purchaseTipCitations,
        reviewCount: e.reviewCount,
        citedReviews: e.citedReviews,
      })),
      comparativeAnalysis,
      anchorProduct,
      processingTime: {
        total: totalTime,
      },
    });
  } catch (error) {
    console.error('Recommend v2 API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations', details: String(error) },
      { status: 500 }
    );
  }
}
