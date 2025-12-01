/**
 * COMPARE Tool
 *
 * Compare multiple products side by side
 */

import { GoogleGenAI } from '@google/genai';
import type { Intent, AgentContext } from '../types';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

export interface CompareResult {
  success: boolean;
  comparison: string;
  products: Array<{
    rank: number;
    title: string;
  }>;
  error?: string;
}

/**
 * Execute COMPARE tool
 */
export async function executeCompare(
  intent: Intent,
  context: AgentContext
): Promise<CompareResult> {
  try {
    console.log(`\n🔍 COMPARE: Starting...`);

    const { productRanks, aspect, specificAspect } = intent.args || {};

    if (!productRanks || productRanks.length < 2) {
      throw new Error('At least 2 products required for comparison');
    }

    // Get products from recommendations
    const products = productRanks
      .map((rank: number) => context.currentRecommendations[rank - 1])
      .filter(Boolean);

    if (products.length < 2) {
      return {
        success: false,
        comparison: '죄송해요, 비교할 제품을 찾을 수 없어요.',
        products: [],
        error: 'Products not found',
      };
    }

    console.log(`   Comparing ${products.length} products:`);
    products.forEach((p: any, i: number) => {
      console.log(`   ${productRanks[i]}. ${p.product.title}`);
    });

    // Build comparison context
    const comparisonContext = products
      .map((p: any, i: number) => buildProductSummary(p, productRanks[i]))
      .join('\n\n---\n\n');

    // Determine focus
    let focusInstruction = '';
    if (aspect === 'price') {
      focusInstruction = '가격 대비 가치를 중심으로 비교해주세요.';
    } else if (aspect === 'hygiene') {
      focusInstruction = '위생/세척 편의성을 중심으로 비교해주세요.';
    } else if (aspect === 'specific' && specificAspect) {
      focusInstruction = `**${specificAspect}** 측면을 중심으로 비교해주세요.`;
    } else {
      focusInstruction = '전반적인 장단점을 중심으로 비교해주세요.';
    }

    // Generate comparison using Gemini
    const prompt = `
You are a product comparison specialist. Compare the following products based on the user's focus.

**Products to Compare:**
${comparisonContext}

**Focus:** ${focusInstruction}

**Instructions:**
1. Write in Korean, friendly tone (반말 존댓말 혼용)
2. Structure the comparison clearly:
   - Brief intro (1 sentence)
   - Key differences (3-4 bullet points with ** for keywords)
   - Recommendation based on user needs (1-2 sentences)
3. Be specific and cite actual product features
4. DO NOT mention review numbers
5. Keep it concise but informative (max 10 sentences)

Comparison:`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.6,
      },
    });

    if (!result.text) {
      throw new Error('No response from Gemini');
    }

    const comparison = result.text.trim();

    console.log(`   ✅ Comparison generated (${comparison.length} chars)`);

    return {
      success: true,
      comparison,
      products: products.map((p: any, i: number) => ({
        rank: productRanks[i],
        title: p.product.title,
      })),
    };
  } catch (error) {
    console.error('COMPARE failed:', error);
    return {
      success: false,
      comparison: '죄송해요, 비교를 생성하는 중에 문제가 발생했어요. 다시 시도해주세요.',
      products: [],
      error: String(error),
    };
  }
}

/**
 * Build product summary for comparison
 */
function buildProductSummary(recommendation: any, rank: number): string {
  const product = recommendation.product;

  let summary = `**${product.title}**\n`;
  summary += `- 가격: ${product.price?.toLocaleString()}원\n`;
  summary += `- Fit Score: ${recommendation.finalScore}\n`;
  summary += `- 추천 이유: ${recommendation.reasoning}\n\n`;

  // Key pros
  if (recommendation.selectedTagsEvaluation) {
    const pros = recommendation.selectedTagsEvaluation
      .filter((tag: any) => tag.tagType === 'pros' && tag.status === '충족')
      .slice(0, 3);

    if (pros.length > 0) {
      summary += `**장점:**\n`;
      pros.forEach((tag: any) => {
        summary += `- ${tag.userTag}: ${tag.evidence}\n`;
      });
    }
  }

  // Key cons
  if (recommendation.cons && recommendation.cons.length > 0) {
    summary += `\n**단점:**\n`;
    recommendation.cons.slice(0, 2).forEach((con: any) => {
      summary += `- ${con.text}\n`;
    });
  }

  return summary;
}
