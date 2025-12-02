/**
 * Intent Router
 *
 * Classifies user input into one of 5 tool types using Gemini API
 * Uses CONVERSATIONAL_AGENT_PROMPT (V2) - 패션 AI 구조 참고
 */

import { GoogleGenAI } from '@google/genai';
import { CONVERSATIONAL_AGENT_PROMPT } from './conversationalSystemPrompt';
import type { Intent, AgentContext } from './types';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';
import { parseBudgetFromNaturalLanguage, needsBudgetClarification } from './utils/budgetAdjustment';
import { detectCategoryFromContext, getCategoryDisplayName } from './utils/contextHelpers';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

/**
 * Classify user intent and extract structured arguments
 */
export async function classifyIntent(
  userInput: string,
  context: AgentContext,
  clickedAnchorId?: string  // If user clicked "이 상품 기반으로 재추천" button
): Promise<Intent> {
  try {
    console.log(`\n🎯 Intent Router: Analyzing user input...`);
    console.log(`   Input: "${userInput}"`);
    console.log(`   Clicked Anchor: ${clickedAnchorId || 'none'}`);

    // Detect category from context
    const category = detectCategoryFromContext(context);
    const categoryName = getCategoryDisplayName(category);
    console.log(`   Category: ${category} (${categoryName})`);

    // Get category-specific attributes
    const categoryAttributes = CATEGORY_ATTRIBUTES[category as keyof typeof CATEGORY_ATTRIBUTES] || [];

    // Build context summary
    const contextSummary = buildContextSummary(context);

    // Gemini prompt with new conversational system prompt
    const prompt = `
${CONVERSATIONAL_AGENT_PROMPT}

**Current Context:**
${contextSummary}

**User Input:** "${userInput}"

${clickedAnchorId ? `**Important:** User clicked "이 상품 기반으로 재추천" button on product ID ${clickedAnchorId}. This means they want REFILTER_WITH_ANCHOR with this product as new anchor.` : ''}

**Current Product Category:** ${categoryName} (${category})

**Available Attributes for ${categoryName}:**
${categoryAttributes.map(attr => `- **${attr.key}** (${attr.name}): ${attr.description}`).join('\n')}

**Instructions for tagChanges:**
When user mentions features, map them to attribute keys above with appropriate weights (0.3-1.0):
- Primary feature mentioned → weight: 1.0
- Secondary/related feature → weight: 0.5
- Minor/tangential feature → weight: 0.3

For example, if user says "세척 편한 걸로" (easy to clean):
- Map to attribute key: "cleaning_convenience" with weight 1.0
- Generate tag ID like: "user-req-cleaning-1"
- Tag text: "세척 편한 걸로"

**Your Task:**
Analyze the user input and output a JSON object with the tool to use and its arguments.

Output JSON only. No extra text.
`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.2,  // Low temp for classification
      },
    });

    if (!result.text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON
    let jsonText = result.text.trim();
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    const intent: Intent = JSON.parse(jsonText);

    console.log(`   ✅ Intent: ${intent.tool} (confidence: ${intent.confidence}%)`);
    console.log(`   Reasoning: ${intent.reasoning}`);

    // Post-process: Validate REFILTER_WITH_ANCHOR has anchor ID
    if (intent.tool === 'REFILTER_WITH_ANCHOR') {
      const hasValidAnchor = intent.args?.newAnchorProductId || clickedAnchorId;

      if (!hasValidAnchor) {
        // Gemini classified as REFILTER_WITH_ANCHOR but no anchor specified
        // This is likely a budget-only query, downgrade to REFILTER
        console.log(`   ⚠️  REFILTER_WITH_ANCHOR without anchor, downgrading to REFILTER`);
        intent.tool = 'REFILTER';
      }
    }

    // Post-process: Only parse explicit budget numbers, don't override Gemini's classification
    // Gemini already handles budget classification correctly in systemPrompt
    if ((intent.tool === 'REFILTER' || intent.tool === 'REFILTER_WITH_ANCHOR') && !intent.args?.budgetChange) {
      // Try to extract budget only if Gemini didn't already specify one
      const parsedBudget = parseBudgetFromNaturalLanguage(userInput);

      if (parsedBudget) {
        // User provided specific budget number - add it to args
        console.log(`   💰 Parsed budget from natural language: ${parsedBudget}`);
        if (!intent.args) intent.args = {};
        intent.args.budgetChange = {
          type: 'specific',
          value: parsedBudget,
          rawInput: userInput,
        };
      }
      // If no parsedBudget, Gemini already decided correctly - don't override!
    }

    // 🔥 REMOVED: needsBudgetClarification() override logic
    // Trust Gemini's classification instead of rule-based override

    // If clicked anchor but Gemini didn't catch it, force REFILTER_WITH_ANCHOR
    if (clickedAnchorId && intent.tool !== 'REFILTER_WITH_ANCHOR' && intent.tool !== 'ASK_CLARIFICATION') {
      console.log(`   ⚠️  Forcing REFILTER_WITH_ANCHOR due to clicked anchor`);
      intent.tool = 'REFILTER_WITH_ANCHOR';
      intent.args = {
        ...intent.args,
        newAnchorProductId: clickedAnchorId,
      };
    }

    return intent;
  } catch (error) {
    console.error('Intent classification failed:', error);

    // Fallback: Default to GENERAL
    return {
      tool: 'GENERAL',
      confidence: 0,
      needsClarification: false,
      args: {
        message: '죄송해요, 잘 이해하지 못했어요. 다시 말씀해주시겠어요?',
      },
      reasoning: 'Error fallback',
    };
  }
}

/**
 * Build context summary for Gemini
 */
function buildContextSummary(context: AgentContext): string {
  const { currentRecommendations, currentSession } = context;

  let summary = `**Current Recommendations (Top 3):**\n`;
  currentRecommendations.forEach((rec, i) => {
    summary += `${i + 1}. **${rec.product.title}** (ID: ${rec.product.id})\n`;
    summary += `   - Price: ${rec.product.price?.toLocaleString()}원\n`;
    summary += `   - Fit Score: ${rec.finalScore}\n`;
    summary += `   - Reasoning: ${rec.reasoning}\n`;
  });

  summary += `\n**Current Anchor Product:**\n`;
  if (currentSession.anchorProduct) {
    summary += `- ${currentSession.anchorProduct.title} (ID: ${currentSession.anchorProduct.productId})\n`;
  } else {
    summary += `- None\n`;
  }

  summary += `\n**Current Budget:** ${currentSession.budget || 'Not set'}\n`;

  summary += `\n**Current User Preferences:**\n`;
  summary += `- Desired features (Pros): ${currentSession.selectedProsTags?.length || 0}\n`;
  if (currentSession.selectedProsTags && currentSession.selectedProsTags.length > 0) {
    summary += `  ${currentSession.selectedProsTags.map(t => t.text).join(', ')}\n`;
  }

  summary += `- Features to avoid (Cons): ${currentSession.selectedConsTags?.length || 0}\n`;
  if (currentSession.selectedConsTags && currentSession.selectedConsTags.length > 0) {
    summary += `  ${currentSession.selectedConsTags.map(t => t.text).join(', ')}\n`;
  }

  return summary;
}

/**
 * Helper: Extract product rank from user input (e.g., "1번" → 1)
 */
export function extractProductRank(input: string): number | null {
  const match = input.match(/(\d+)번/);
  if (match) {
    const rank = parseInt(match[1]);
    if (rank >= 1 && rank <= 3) return rank;
  }
  return null;
}

/**
 * Helper: Extract product ranks for comparison (e.g., "1번이랑 2번" → [1, 2])
 */
export function extractProductRanks(input: string): number[] {
  const matches = input.matchAll(/(\d+)번/g);
  const ranks: number[] = [];
  for (const match of matches) {
    const rank = parseInt(match[1]);
    if (rank >= 1 && rank <= 3 && !ranks.includes(rank)) {
      ranks.push(rank);
    }
  }
  return ranks;
}
