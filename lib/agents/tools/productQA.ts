/**
 * PRODUCT_QA Tool
 *
 * Answer questions about specific products using RAG (specs + reviews)
 */

import { GoogleGenAI } from '@google/genai';
import type { Intent, AgentContext } from '../types';
import { getReviewsForProduct, sampleBalancedBySentiment, formatReviewsForLLM } from '@/lib/review';
import { getProductSpec } from '@/lib/data/specLoader';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';

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

    // Load full product specs
    const fullProductSpec = await getProductSpec('milk_powder_port', String(product.product.id));

    if (!fullProductSpec) {
      console.warn(`   ⚠️ Could not load full specs for product ${product.product.id}`);
    } else {
      console.log(`   ✅ Loaded full product specs`);
    }

    // Load reviews for this product (limit to 15 high + 15 low for performance)
    const allReviews = await getReviewsForProduct('milk_powder_port', String(product.product.id));

    if (allReviews.length === 0) {
      // Even without reviews, we can answer based on specs
      if (fullProductSpec) {
        const productContext = buildProductContext(product, fullProductSpec);

        const prompt = `
You are a helpful product assistant. Answer the user's question about this specific product based on the provided specs.

**Product:**
${productContext}

**User Question:** "${question}"

**Instructions:**
1. Answer in Korean, friendly tone (반말 존댓말 혼용)
2. Be specific based on product specs
3. If the question cannot be answered from specs, say so honestly
4. Keep answer concise (3-5 sentences max)
5. Use ** for bold keywords (e.g., **세척 편의성**)

Answer:`;

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite',
          contents: prompt,
          config: { temperature: 0.5 },
        });

        if (result.text) {
          return {
            success: true,
            answer: result.text.trim(),
            product: { rank: productRank, title: product.product.title },
          };
        }
      }

      return {
        success: true,
        answer: `${product.product.title}에 대한 리뷰가 아직 없어서 실제 사용 경험을 반영한 답변을 드리기 어려워요. 😅\n\n제품 스펙 정보를 보시거나 다른 질문을 해주세요!`,
        product: {
          rank: productRank,
          title: product.product.title,
        },
      };
    }

    // Sample reviews (15 high + 15 low, reduced from 10+10 per user request "리뷰는 개수제한 필요")
    const { high, low } = sampleBalancedBySentiment(allReviews, 15, 15);
    const sampledReviews = [...high, ...low];

    console.log(`   Loaded ${sampledReviews.length} reviews (${high.length} high + ${low.length} low)`);

    // Build context with full specs
    const productContext = buildProductContext(product, fullProductSpec);
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
 * Build product context summary with full specs
 */
function buildProductContext(recommendation: any, fullProductSpec?: any): string {
  const product = recommendation.product;

  let context = `**${product.title}**\n`;
  context += `- 브랜드: ${product.brand || '정보 없음'}\n`;
  context += `- 가격: ${product.price?.toLocaleString()}원\n`;
  context += `- Fit Score: ${recommendation.finalScore}\n`;
  context += `- 추천 이유: ${recommendation.reasoning}\n\n`;

  // Full product specs (from markdown files)
  if (fullProductSpec) {
    context += `**제품 상세 스펙:**\n`;

    // Filter out internal fields and show user-friendly specs
    const excludedFields = [
      'productId', 'popularityScore', 'attributeScores', 'tagScore',
      'tagScoringResult', '총점', '브랜드', '모델명', '최저가'
    ];

    Object.entries(fullProductSpec).forEach(([key, value]) => {
      if (value !== null && value !== undefined && !excludedFields.includes(key)) {
        context += `- ${key}: ${value}\n`;
      }
    });
    context += `\n`;

    // Attribute scores with Korean names
    if (fullProductSpec.attributeScores && Object.keys(fullProductSpec.attributeScores).length > 0) {
      const categoryAttributes = CATEGORY_ATTRIBUTES['milk_powder_port'] || [];
      context += `**속성 평가 (리뷰 기반):**\n`;
      Object.entries(fullProductSpec.attributeScores).forEach(([attrKey, score]) => {
        const attrInfo = categoryAttributes.find(a => a.key === attrKey);
        const attrName = attrInfo ? attrInfo.name : attrKey;
        const scoreDisplay = score !== null ? `${score}점/100점` : 'N/A';
        context += `- ${attrName}: ${scoreDisplay}\n`;
      });
      context += `\n`;
    }
  }

  // Selected tags evaluation
  if (recommendation.selectedTagsEvaluation && recommendation.selectedTagsEvaluation.length > 0) {
    context += `**사용자가 선택한 기준 평가:**\n`;
    recommendation.selectedTagsEvaluation.forEach((tag: any) => {
      context += `- ${tag.userTag}: ${tag.status} - ${tag.evidence}\n`;
    });
    context += `\n`;
  }

  // Additional pros
  if (recommendation.additionalPros && recommendation.additionalPros.length > 0) {
    context += `**추가 장점:**\n`;
    recommendation.additionalPros.forEach((pro: any) => {
      context += `- ${pro.text}\n`;
    });
    context += `\n`;
  }

  // Cons
  if (recommendation.cons && recommendation.cons.length > 0) {
    context += `**단점:**\n`;
    recommendation.cons.forEach((con: any) => {
      context += `- ${con.text}\n`;
    });
    context += `\n`;
  }

  return context;
}
