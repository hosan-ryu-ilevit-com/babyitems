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
  formatReviewsForLLM,
} from '@/lib/review';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface RecommendRequest {
  category: Category;
  anchorId: string;
  selectedProsTags: string[];
  selectedConsTags: string[];
  budget: string; // "0-50000", "50000-100000", etc.
}

interface ProductEvaluation {
  product: ProductSpec;
  fitScore: number;
  reasoning: string;
  reviewCount: number;
}

/**
 * Parse budget string to min/max values
 */
function parseBudget(budget: string): { min: number; max: number } {
  const [min, max] = budget.split('-').map((v) => (v === '+' ? Infinity : parseInt(v, 10)));
  return { min, max: max || Infinity };
}

/**
 * Step 3: LLM evaluates a single product
 */
async function evaluateProduct(
  product: ProductSpec,
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
        reviewCount: 0,
      };
    }

    // Sample top 30 longest reviews
    const sampledReviews = sampleLongestReviews(allReviews, 30);
    const reviewsText = formatReviewsForLLM(sampledReviews, 50000);

    // Build evaluation prompt
    // IMPORTANT: Order represents user priority (1st = most important)
    const prosRequirements = prosTexts
      .map((t, i) => {
        const priority = i === 0 ? '⭐ 최우선' : i === 1 ? '⭐ 중요' : '';
        return `${i + 1}. ${t} ${priority}`;
      })
      .join('\n');

    const consRequirements =
      consTexts.length > 0
        ? consTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : '(없음)';

    const query = `다음 제품이 사용자의 요구사항을 얼마나 잘 충족하는지 평가해주세요.

**제품 정보:**
- 브랜드: ${product.브랜드}
- 모델명: ${product.모델명}
- 가격: ${product.최저가?.toLocaleString() || '정보 없음'}원
- 총점: ${product.총점 || 'N/A'}

**사용자가 원하는 장점 (우선순위순 - 위에 있을수록 중요):**
${prosRequirements}

**사용자가 원하지 않는 단점 (피해야 함):**
${consRequirements}

**실제 사용자 리뷰 (${sampledReviews.length}개):**
${reviewsText}

**평가 기준:**
1. 사용자가 원하는 장점이 실제 리뷰에서 확인되는가? (⭐표시가 있는 항목에 더 큰 가중치를 두세요)
2. 사용자가 피하고 싶은 단점이 이 제품에도 있는가?
3. 전반적인 만족도는 어떤가?

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "fitScore": 85,
  "reasoning": "1도 단위 온도 조절이 정확하다는 리뷰가 많고, 세척도 편리하다는 평가가 많습니다.",
  "strengths": [
    "1도 단위로 정확한 온도 조절이 가능해요",
    "입구가 넓어서 세척이 편리해요",
    "보온 기능이 12시간 이상 지속돼요"
  ],
  "weaknesses": [
    "작동 소음이 약간 있어요",
    "첫 사용 시 냄새가 날 수 있어요"
  ],
  "comparison": [
    "다른 제품 대비 온도 조절이 더 정밀해요",
    "세척 편의성이 뛰어나지만 소음은 평균 수준이에요"
  ]
}
\`\`\`

**중요:**
- fitScore는 0-100 점수 (높을수록 사용자 요구에 부합)
- 우선순위가 높은 장점(⭐최우선)을 더 중요하게 평가하세요
- reasoning은 간결하게 2-3문장으로 핵심만 설명
- strengths는 3-5개의 구체적인 장점 (리뷰 기반)
- weaknesses는 1-3개의 단점 (없으면 빈 배열)
- comparison은 1-2개의 비교 문장
- 반드시 JSON 형식만 출력`;

    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
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
      reasoning: string;
      strengths: string[];
      weaknesses: string[];
      comparison: string[];
    };

    return {
      product,
      fitScore: evaluation.fitScore,
      reasoning: evaluation.reasoning,
      reviewCount: allReviews.length,
    };
  } catch (error) {
    console.error(`Failed to evaluate product ${product.productId}:`, error);
    return {
      product,
      fitScore: 0,
      reasoning: '평가 실패',
      reviewCount: 0,
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

    // ===== STEP 2: Popularity Sorting (Fast, Local JSON) =====
    console.log(`\n🔥 Step 2: Popularity sorting...`);
    const topCandidates = getTopByPopularity(budgetFiltered, 20);

    console.log(`   ✅ Top 20 candidates selected`);
    topCandidates.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.브랜드} ${p.모델명} (Score: ${p.popularityScore?.toFixed(1)})`);
    });

    // ===== STEP 3: LLM Qualitative Evaluation (Slow, Parallel) =====
    console.log(`\n🤖 Step 3: LLM evaluation (parallel)...`);

    // Get actual tag texts (in real app, fetch from /api/generate-tags result)
    // For now, use tag IDs as placeholder
    const prosTexts = selectedProsTags; // TODO: Map tag IDs to actual text
    const consTexts = selectedConsTags;

    // Evaluate all candidates in parallel (batch of 5 to avoid rate limits)
    const batchSize = 5;
    const evaluations: ProductEvaluation[] = [];

    for (let i = 0; i < topCandidates.length; i += batchSize) {
      const batch = topCandidates.slice(i, i + batchSize);
      console.log(`   Evaluating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(topCandidates.length / batchSize)}...`);

      const batchEvaluations = await Promise.all(
        batch.map((product) =>
          evaluateProduct(product, category, prosTexts, consTexts)
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

    // Get anchor product for comparison
    const anchorProduct = await getProductSpec(category, anchorId);

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ Total processing time: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      category,
      recommendations: top3.map((e) => ({
        ...e.product,
        fitScore: e.fitScore,
        reasoning: e.reasoning,
        reviewCount: e.reviewCount,
      })),
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
