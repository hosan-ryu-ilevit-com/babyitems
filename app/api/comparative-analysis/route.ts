import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';
import type { Category } from '@/lib/data';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface SelectedTagEvaluation {
  userTag: string;
  tagType: 'pros' | 'cons';
  priority: number;
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
  evidence: string;
  citations: number[];
  tradeoff?: string;
}

interface ProductEvaluation {
  product: any;
  fitScore: number;
  reasoning: string;
  selectedTagsEvaluation: SelectedTagEvaluation[];
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
  purchaseTip: Array<{ text: string; citations?: number[] }>;
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
  productComparisons: {
    rank1: Array<{ text: string }>;
    rank2: Array<{ text: string }>;
    rank3: Array<{ text: string }>;
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

interface ComparativeAnalysisRequest {
  top3: ProductEvaluation[];
  anchorProduct: any;
  category: Category;
  prosTexts: string[];
  consTexts: string[];
}

/**
 * Generate comparative analysis for Top 3 products
 */
async function generateComparativeAnalysis(
  top3: ProductEvaluation[],
  anchorProduct: any,
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
      `.trim();
    });

    const query = `다음 Top 3 추천 제품을 종합 비교 분석해주세요.

**사용자가 선택하신 기준 제품:**
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
      "keyStrengths": "온도 조절 정확성과 위생성이 3개 중 가장 우수함",
      "keyWeaknesses": "가격이 가장 높음, 자동 출수 기능 없음",
      "vsRank2": "2위 대비 온도 조절이 더 정확하지만, 가격은 약간 비쌈",
      "vsRank3": "3위 대비 가성비는 낮지만 온도 정확도는 훨씬 우수함",
      "vsAnchor": "선택하신 제품 대비 온도 조절이 더 정확하며, 가격은 약간 높음",
      "bestFor": "온도 조절 정확성을 최우선으로 하는 고객"
    },
    "rank2": {
      "keyStrengths": "가성비 최고, 쿨링팬으로 빠른 냉각",
      "keyWeaknesses": "온도 조절 정확도는 1위보다 낮음",
      "vsRank1": "1위 대비 가격은 저렴하지만 온도 정확도는 낮음",
      "vsRank3": "3위 대비 가격이 저렴하고, 쿨링팬 속도가 빠름",
      "vsAnchor": "선택하신 제품과 가격 비슷하며, 쿨링팬 성능이 향상됨",
      "bestFor": "가성비와 빠른 냉각을 원하는 고객"
    },
    "rank3": {
      "keyStrengths": "자동 출수, 무음 모드로 편의성 최고",
      "keyWeaknesses": "가격 가장 높음, 무게 무거움",
      "vsRank1": "1위 대비 자동 출수가 있지만 온도 정확도는 낮음",
      "vsRank2": "2위 대비 편의 기능이 많지만 가격은 높음",
      "vsAnchor": "선택하신 제품 대비 자동 출수와 무음 기능이 추가되며, 가격은 높음",
      "bestFor": "편의성과 프리미엄 기능을 원하는 고객"
    }
  },
  "productComparisons": {
    "rank1": [
      { "text": "선택하신 제품보다 **온도 조절**이 더 정확합니다. 대신 **가격**은 1만원 정도 더 높은 편이에요" },
      { "text": "${top3[1]?.product.브랜드}보다 **온도 정확도**는 우수하지만, **가격**은 조금 더 비쌉니다" },
      { "text": "${top3[2]?.product.브랜드}보다 **가성비**는 낮지만, **온도 정확성**은 훨씬 높아요" }
    ],
    "rank2": [
      { "text": "선택하신 제품과 **가격**은 비슷하지만, **쿨링팬 성능**이 더 좋아요" },
      { "text": "${top3[0]?.product.브랜드}보다 **가격 대비 성능**이 우수합니다" },
      { "text": "${top3[2]?.product.브랜드}보다 **가성비**가 좋지만, **편의 기능**은 적어요" }
    ],
    "rank3": [
      { "text": "선택하신 제품보다 **자동 출수, 무음 모드** 등 편의 기능이 많습니다" },
      { "text": "${top3[0]?.product.브랜드}보다 **편의성**은 높지만, **온도 정확도**는 낮아요" },
      { "text": "${top3[1]?.product.브랜드}보다 **프리미엄 기능**이 많지만, **가격**도 높습니다" }
    ]
  },
  "useCaseRecommendations": [
    {
      "useCase": "새벽 수유가 잦은 경우",
      "recommended": "${top3[0]?.product.브랜드} ${top3[0]?.product.모델명}",
      "reason": "온도 조절 정확성이 뛰어나 안전하고 빠른 조유 가능"
    }
  ],
  "budgetConsideration": {
    "withinBudget": true,
    "priceRange": "5만원 ~ 15만원",
    "valueAnalysis": "2위가 가성비 최고, 1위는 프리미엄"
  },
  "finalAdvice": "온도 정확성을 최우선으로 한다면 1위, 가성비를 중시한다면 2위를 추천합니다"
}
\`\`\`

**중요:**
- 각 제품의 핵심 강점/약점을 명확히 구분하세요
- **⚠️ 절대 점수 언급 금지**: 속성 점수, "7점 높음", "85점 vs 78점", "95점" 등 모든 수치 표현 완전 금지
- 자연스러운 비교 표현만 사용: "더 정확함", "우수함", "뛰어남", "낮음", "부족함" 등
- 제품 간 비교는 구체적인 차이점과 특징 위주로 서술
- 상황별 추천은 실제 사용 시나리오 기반으로 작성
- 반드시 JSON 형식만 출력하세요`;

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
      productComparisons: {
        rank1: [],
        rank2: [],
        rank3: [],
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
 * POST /api/comparative-analysis
 * Generate comparative analysis for Top 3 products (lazy loaded)
 */
export async function POST(req: NextRequest) {
  try {
    const body: ComparativeAnalysisRequest = await req.json();
    const { top3, anchorProduct, category, prosTexts, consTexts } = body;

    if (!top3 || !anchorProduct || !category || !prosTexts) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`🤖 Comparative analysis request:`);
    console.log(`   Category: ${category}`);
    console.log(`   Top 3 products: ${top3.length}`);

    const startTime = Date.now();

    const analysis = await generateComparativeAnalysis(
      top3,
      anchorProduct,
      category,
      prosTexts,
      consTexts
    );

    const totalTime = Date.now() - startTime;
    console.log(`✅ Comparative analysis generated in ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      analysis,
      processingTime: totalTime,
    });
  } catch (error) {
    console.error('Comparative analysis API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate comparative analysis', details: String(error) },
      { status: 500 }
    );
  }
}
