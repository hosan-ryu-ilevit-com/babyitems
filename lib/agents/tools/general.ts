/**
 * GENERAL Tool
 *
 * Handle out-of-scope or general questions with friendly guidance
 */

import { GoogleGenAI } from '@google/genai';
import type { Intent, AgentContext } from '../types';
import { CATEGORY_INFO } from '../systemPrompt';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

export interface GeneralResult {
  success: boolean;
  message: string;
}

/**
 * Execute GENERAL tool
 */
export async function executeGeneral(
  intent: Intent,
  context: AgentContext,
  userInput: string
): Promise<GeneralResult> {
  try {
    console.log(`\n💬 GENERAL: Handling general question...`);

    // Always generate contextual, empathetic response
    const response = await generateContextualResponse(userInput, context);

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error('GENERAL failed:', error);
    // Even on error, try to respond naturally
    return {
      success: true,
      message: generateFallbackResponse(context),
    };
  }
}

/**
 * Check if question is completely out of scope
 */
async function checkCompletelyOutOfScope(input: string): Promise<boolean> {
  try {
    const prompt = `
Is this question related to baby products or parenting?

User input: "${input}"

Output JSON only:
\`\`\`json
{
  "related": true | false
}
\`\`\`
`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.1,
      },
    });

    if (!result.text) return false;

    let jsonText = result.text.trim();
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonText);
    return !parsed.related;
  } catch {
    return false;  // Default to in-scope if check fails
  }
}

/**
 * Generate contextual response for parenting/product-related questions
 */
async function generateContextualResponse(
  input: string,
  context: AgentContext
): Promise<string> {
  // Infer category from first recommendation
  const categoryName = inferCategoryName(context);

  // Build context summary
  const currentProducts = context.currentRecommendations
    .map((rec, i) => `${i + 1}. ${rec.product.title} (${rec.finalScore}점)`)
    .join('\n');

  const prompt = `
You are a warm, empathetic baby product advisor who deeply understands the challenges of parenting.

**User's Situation:** "${input}"

**Current Product Category You're Helping With:** ${categoryName}

**Current Recommendations:**
${currentProducts}

**Your Task:**
1. **First, show genuine empathy** - Acknowledge their feelings warmly (e.g., "정말 힘드시죠...", "많이 지치셨겠어요...", "그 마음 충분히 이해해요...")
2. **Relate to their specific situation** - If they mention parenting struggles, acknowledge the specific difficulty (e.g., 새벽 수유, 아기 재우기, 육아 스트레스)
3. **Gently guide back** - Connect their situation to how the ${categoryName} might help, then offer to answer questions

**Tone:**
- Very warm and empathetic Korean (친근한 반말/존댓말 혼용)
- Like a caring friend who's been through it
- Use emoticons sparingly (😊 or 💪)

**Examples of Good Responses:**
- "정말 힘드시죠... 특히 새벽 수유 할 때는 더 그럴 것 같아요. 😊 좋은 분유포트가 조금이라도 도움이 될 수 있을 거예요. 추천드린 제품 중에서 궁금한 점 있으시면 편하게 물어보세요!"
- "아기 재우는 게 정말 쉽지 않죠... 그 마음 충분히 이해해요. 💪 베이비 모니터가 있으면 조금은 안심하고 계실 수 있을 거예요. 추천드린 제품에 대해 더 알고 싶으신 게 있으시면 말씀해주세요!"

**Format:** 2-4 sentences, natural and warm

Response:`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      temperature: 0.8,  // Higher for more empathetic, varied responses
    },
  });

  if (!result.text) {
    return generateFallbackResponse(context);
  }

  return result.text.trim();
}

/**
 * Generate natural fallback response
 */
function generateFallbackResponse(context: AgentContext): string {
  const categoryName = inferCategoryName(context);
  const firstProduct = context.currentRecommendations[0]?.product.title || categoryName;

  return `육아하시느라 정말 수고 많으세요! 💪\n\n` +
    `저는 **${categoryName} 추천**을 도와드리고 있어요. ` +
    `추천드린 제품들에 대해 궁금한 점이나 다른 조건으로 다시 찾아보고 싶으시면 편하게 말씀해주세요. 😊\n\n` +
    `예를 들어 이런 것들이요:\n` +
    `• "${firstProduct} 세척하기 편한가요?"\n` +
    `• "더 저렴한 제품으로 다시 보여주세요"\n` +
    `• "소재가 안전한 걸로 추천해주세요"`;
}

/**
 * Infer category name from current recommendations
 */
function inferCategoryName(context: AgentContext): string {
  // Category name mapping based on product characteristics
  const categoryMap: { [key: string]: string } = {
    milk_powder_port: '분유포트',
    baby_bottle: '젖병',
    baby_bottle_sterilizer: '젖병 소독기',
    baby_formula_dispenser: '분유 보관함',
    baby_monitor: '베이비 모니터',
    baby_play_mat: '놀이매트',
    car_seat: '카시트',
    nasal_aspirator: '코 흡입기',
    thermometer: '체온계',
  };

  // Try to infer from first recommendation's product title or category field
  if (context.currentRecommendations.length > 0) {
    const firstProduct = context.currentRecommendations[0].product;

    // If product has a category field, use it
    if ((firstProduct as any).category) {
      const category = (firstProduct as any).category;
      return categoryMap[category] || '아기용품';
    }

    // Fallback: Try to detect from title
    const title = firstProduct.title.toLowerCase();
    if (title.includes('분유포트') || title.includes('포트')) return '분유포트';
    if (title.includes('젖병') && title.includes('소독')) return '젖병 소독기';
    if (title.includes('젖병')) return '젖병';
    if (title.includes('모니터')) return '베이비 모니터';
    if (title.includes('매트') || title.includes('놀이')) return '놀이매트';
    if (title.includes('카시트')) return '카시트';
    if (title.includes('코 흡입기') || title.includes('코세척')) return '코 흡입기';
    if (title.includes('체온계')) return '체온계';
  }

  // Default fallback
  return '아기용품';
}
