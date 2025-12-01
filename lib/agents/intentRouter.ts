/**
 * Intent Router
 *
 * Classifies user input into one of 5 tool types using Gemini API
 */

import { GoogleGenAI } from '@google/genai';
import { AGENT_SYSTEM_PROMPT } from './systemPrompt';
import type { Intent, AgentContext } from './types';
import { PROS_TAGS, CONS_TAGS } from '@/data/priorityTags';
import { parseBudgetFromNaturalLanguage, needsBudgetClarification } from './utils/budgetAdjustment';

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

    // Build context summary
    const contextSummary = buildContextSummary(context);

    // Gemini prompt
    const prompt = `
${AGENT_SYSTEM_PROMPT}

**Current Context:**
${contextSummary}

**User Input:** "${userInput}"

${clickedAnchorId ? `**Important:** User clicked "이 상품 기반으로 재추천" button on product ID ${clickedAnchorId}. This means they want REFILTER_WITH_ANCHOR with this product as new anchor.` : ''}

**Your Task:**
Analyze the user input and output a JSON object with the tool to use and its arguments.

**Available PROS_TAGS (for tagChanges):**
${PROS_TAGS.map(t => `- ${t.id}: "${t.text}"`).join('\n')}

**Available CONS_TAGS (for tagChanges):**
${CONS_TAGS.map(t => `- ${t.id}: "${t.text}"`).join('\n')}

**Output Format (JSON only):**
\`\`\`json
{
  "tool": "REFILTER_WITH_ANCHOR" | "REFILTER" | "PRODUCT_QA" | "COMPARE" | "ASK_CLARIFICATION" | "GENERAL",
  "confidence": 85,
  "needsClarification": false,
  "args": {
    // See TOOL DEFINITIONS in system prompt for required args per tool
  },
  "reasoning": "Brief explanation of why this tool was chosen"
}
\`\`\`

**Critical Rules:**
1. **Budget Classification**:
   - SPECIFIC budget (use REFILTER, NOT clarification): "10만원", "7만원 이하", "50000원", "15만원 정도", "100000원 아래"
   - VAGUE budget (use ASK_CLARIFICATION): "더 저렴한 걸로", "가격 낮춰서", "싼 걸로", "비싼 걸로" (no specific amount)
   - If user provides ANY specific number with currency (만원, 원), it is SPECIFIC - extract it immediately!
2. If user mentions a feature, map it to specific tag IDs from PROS_TAGS/CONS_TAGS
3. If clickedAnchorId is provided, you MUST use REFILTER_WITH_ANCHOR (not REFILTER)
4. Product numbers like "1번", "2번" map to productRank 1, 2, 3
5. For out-of-scope questions (e.g., "육아 힘들다"), use GENERAL tool

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

  summary += `\n**Selected Tags:**\n`;
  summary += `- Pros: ${currentSession.selectedProsTags?.length || 0} tags\n`;
  if (currentSession.selectedProsTags && currentSession.selectedProsTags.length > 0) {
    currentSession.selectedProsTags.forEach(id => {
      const tag = PROS_TAGS.find(t => t.id === id);
      if (tag) summary += `  • ${id}: "${tag.text}"\n`;
    });
  }

  summary += `- Cons: ${currentSession.selectedConsTags?.length || 0} tags\n`;
  if (currentSession.selectedConsTags && currentSession.selectedConsTags.length > 0) {
    currentSession.selectedConsTags.forEach(id => {
      const tag = CONS_TAGS.find(t => t.id === id);
      if (tag) summary += `  • ${id}: "${tag.text}"\n`;
    });
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
