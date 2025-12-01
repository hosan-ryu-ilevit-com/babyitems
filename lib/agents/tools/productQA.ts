/**
 * PRODUCT_QA Tool
 *
 * Answer questions about specific products using RAG (specs + reviews)
 */

import { GoogleGenAI } from '@google/genai';
import type { Intent, AgentContext } from '../types';
import { getReviewsForProduct, sampleBalancedBySentiment, formatReviewsForLLM } from '@/lib/review';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

export interface ProductQAResult {
  success: boolean;
  answer: string;
  product: {
    rank: number;
    title: string;
  };
  error?: string;
}

/**
 * Execute PRODUCT_QA tool
 */
export async function executeProductQA(
  intent: Intent,
  context: AgentContext
): Promise<ProductQAResult> {
  try {
    console.log(`\n💬 PRODUCT_QA: Starting...`);

    const { productRank, question } = intent.args || {};

    if (!productRank || !question) {
      throw new Error('productRank and question are required');
    }

    // Get product from recommendations
    const product = context.currentRecommendations[productRank - 1];

    if (!product) {
      return {
        success: false,
        answer: `죄송해요, 해당 제품을 찾을 수 없어요.`,
        product: { rank: productRank, title: '' },
        error: 'Product not found',
      };
    }

    console.log(`   Product: ${product.product.title}`);
    console.log(`   Question: "${question}"`);

    // Load reviews for this product
    const allReviews = await getReviewsForProduct('milk_powder_port', String(product.product.id));

    if (allReviews.length === 0) {
      return {
        success: true,
        answer: `${product.product.title}에 대한 리뷰가 아직 없어서 정확한 답변을 드리기 어려워요. 😅\n\n제품 스펙을 보시면 자세한 정보를 확인하실 수 있어요!`,
        product: {
          rank: productRank,
          title: product.product.title,
        },
      };
    }

    // Sample reviews (10 high + 10 low)
    const { high, low } = sampleBalancedBySentiment(allReviews, 10, 10);
    const sampledReviews = [...high, ...low];

    console.log(`   Loaded ${sampledReviews.length} reviews (${high.length} high + ${low.length} low)`);

    // Build context
    const productContext = buildProductContext(product);
    const reviewContext = formatReviewsForLLM(sampledReviews, 30000);

    // Generate answer using Gemini
    const prompt = `
You are a helpful product assistant. Answer the user's question about this specific product based ONLY on the provided specs and reviews.

**Product:**
${productContext}

**User Reviews (${sampledReviews.length} samples):**
${reviewContext}

**User Question:** "${question}"

**Instructions:**
1. Answer in Korean, friendly tone (반말 존댓말 혼용)
2. Be specific and cite actual review content (but DO NOT mention review numbers like "리뷰 1, 3번")
3. Use natural language like "다수의 사용자들이...", "실제 구매자들이..."
4. If the question cannot be answered from the data, say so honestly
5. Keep answer concise (3-5 sentences max)
6. Use ** for bold keywords (e.g., **세척 편의성**)

Answer:`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.5,
      },
    });

    if (!result.text) {
      throw new Error('No response from Gemini');
    }

    const answer = result.text.trim();

    console.log(`   ✅ Answer generated (${answer.length} chars)`);

    return {
      success: true,
      answer,
      product: {
        rank: productRank,
        title: product.product.title,
      },
    };
  } catch (error) {
    console.error('PRODUCT_QA failed:', error);
    return {
      success: false,
      answer: '죄송해요, 답변을 생성하는 중에 문제가 발생했어요. 다시 질문해주시겠어요?',
      product: { rank: intent.args?.productRank || 0, title: '' },
      error: String(error),
    };
  }
}

/**
 * Build product context summary
 */
function buildProductContext(recommendation: any): string {
  const product = recommendation.product;

  let context = `**${product.title}**\n`;
  context += `- Price: ${product.price?.toLocaleString()}원\n`;
  context += `- Fit Score: ${recommendation.finalScore}\n`;
  context += `- Reasoning: ${recommendation.reasoning}\n\n`;

  // Selected tags evaluation
  if (recommendation.selectedTagsEvaluation && recommendation.selectedTagsEvaluation.length > 0) {
    context += `**Selected Tags Evaluation:**\n`;
    recommendation.selectedTagsEvaluation.forEach((tag: any) => {
      context += `- ${tag.userTag}: ${tag.status} - ${tag.evidence}\n`;
    });
    context += `\n`;
  }

  // Additional pros
  if (recommendation.additionalPros && recommendation.additionalPros.length > 0) {
    context += `**Additional Pros:**\n`;
    recommendation.additionalPros.forEach((pro: any) => {
      context += `- ${pro.text}\n`;
    });
    context += `\n`;
  }

  // Cons
  if (recommendation.cons && recommendation.cons.length > 0) {
    context += `**Cons:**\n`;
    recommendation.cons.forEach((con: any) => {
      context += `- ${con.text}\n`;
    });
    context += `\n`;
  }

  // Specs (if available)
  if (product.attributeScores) {
    context += `**Attribute Scores:**\n`;
    Object.entries(product.attributeScores).forEach(([key, value]) => {
      context += `- ${key}: ${value}\n`;
    });
  }

  return context;
}
