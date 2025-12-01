/**
 * REFILTER_WITH_ANCHOR Tool
 *
 * Re-recommend products using a specific product as new anchor
 */

import type { Intent, AgentContext } from '../types';
import type { Recommendation, BudgetRange } from '@/types';
import { getProductSpec } from '@/lib/data/specLoader';
import { getFullTagObjects, getTagText } from '../utils/tagHelpers';
import { parseBudgetFromNaturalLanguage, formatBudgetRange } from '../utils/budgetAdjustment';
import { generateRecommendations } from '@/app/api/recommend-v2/route';

export interface RefilterResult {
  success: boolean;
  message: string;
  recommendations?: Recommendation[];
  updatedSession?: {
    anchorProduct: any;
    selectedProsTags: string[];
    selectedConsTags: string[];
    budget: BudgetRange;
  };
  error?: string;
}

/**
 * Execute REFILTER_WITH_ANCHOR tool
 */
export async function executeRefilterWithAnchor(
  intent: Intent,
  context: AgentContext
): Promise<RefilterResult> {
  try {
    console.log(`\n🔄 REFILTER_WITH_ANCHOR: Starting...`);

    const { newAnchorProductId, productRank, tagChanges, budgetChange } = intent.args || {};

    // If productRank is provided, resolve to actual product ID from current recommendations
    let resolvedAnchorId = newAnchorProductId;

    if (productRank && !resolvedAnchorId) {
      // Get product from current recommendations by rank (1-based index)
      const product = context.currentRecommendations[productRank - 1];

      if (product) {
        resolvedAnchorId = String(product.product.id);
        console.log(`   ✅ Resolved productRank ${productRank} → ${resolvedAnchorId} (${product.product.title})`);
      } else {
        return {
          success: false,
          error: '죄송해요, 해당 순위의 제품을 찾을 수 없어요. 현재 추천된 제품은 1-3번까지만 있어요.',
          message: '제품을 찾을 수 없습니다.',
        };
      }
    }

    if (!resolvedAnchorId) {
      throw new Error('newAnchorProductId or productRank is required');
    }

    // Step 1: Load new anchor product (optional - for message generation)
    console.log(`   Using anchor: ${resolvedAnchorId}`);
    const newAnchor = await getProductSpec('milk_powder_port', resolvedAnchorId);

    if (newAnchor) {
      console.log(`   ✅ Anchor loaded: ${newAnchor.title}`);
    } else {
      console.log(`   ⚠️  Could not load anchor product details, but continuing...`);
    }

    // Step 2: Load current tags
    const currentProsTags = context.currentSession.selectedProsTags || [];
    const currentConsTags = context.currentSession.selectedConsTags || [];
    const currentBudget = context.currentSession.budget || '0-150000';

    console.log(`   Current tags - Pros: ${currentProsTags.length}, Cons: ${currentConsTags.length}`);
    console.log(`   Current budget: ${currentBudget}`);

    // Step 3: Apply tag changes (preserve existing tags by default)
    let updatedProsTags = [...currentProsTags];
    let updatedConsTags = [...currentConsTags];

    if (tagChanges) {
      // Add new tags
      if (tagChanges.addProsTags) {
        tagChanges.addProsTags.forEach(id => {
          if (!updatedProsTags.includes(id)) {
            updatedProsTags.push(id);
          }
        });
      }
      if (tagChanges.addConsTags) {
        tagChanges.addConsTags.forEach(id => {
          if (!updatedConsTags.includes(id)) {
            updatedConsTags.push(id);
          }
        });
      }

      // Remove tags (only if explicitly requested)
      if (tagChanges.removeProsTags) {
        updatedProsTags = updatedProsTags.filter(id => !tagChanges.removeProsTags!.includes(id));
      }
      if (tagChanges.removeConsTags) {
        updatedConsTags = updatedConsTags.filter(id => !tagChanges.removeConsTags!.includes(id));
      }
    }

    console.log(`   Updated tags - Pros: ${updatedProsTags.length}, Cons: ${updatedConsTags.length}`);

    // Step 4: Update budget
    let updatedBudget = currentBudget;

    if (budgetChange) {
      if (budgetChange.type === 'specific' && budgetChange.value) {
        updatedBudget = budgetChange.value as BudgetRange;
      } else if (budgetChange.type === 'clarification_needed') {
        // Need to ask user for clarification - should be handled by router
        return {
          success: false,
          message: '예산을 구체적으로 알려주세요.',
          error: 'Budget clarification needed',
        };
      }
    }

    console.log(`   Updated budget: ${updatedBudget}`);

    // Step 5: Call recommendation logic directly (no HTTP call needed)
    console.log(`   Generating recommendations...`);

    const result = await generateRecommendations(
      'milk_powder_port',
      resolvedAnchorId,
      getFullTagObjects(updatedProsTags),
      getFullTagObjects(updatedConsTags),
      updatedBudget
    );

    if (!result.success || !result.recommendations) {
      throw new Error('No recommendations returned');
    }

    console.log(`   ✅ Got ${result.recommendations.length} recommendations`);

    // Step 6: Generate user-friendly message
    const message = generateRefilterMessage({
      oldAnchor: context.currentSession.anchorProduct,
      newAnchor: newAnchor || { id: resolvedAnchorId, title: '선택하신 제품' },
      oldBudget: currentBudget,
      newBudget: updatedBudget,
      addedProsTagIds: tagChanges?.addProsTags || [],
      addedConsTagIds: tagChanges?.addConsTags || [],
      recommendations: result.recommendations,
    });

    return {
      success: true,
      message,
      recommendations: result.recommendations,
      updatedSession: {
        anchorProduct: {
          productId: newAnchor.id,
          title: newAnchor.title,
        },
        selectedProsTags: updatedProsTags,
        selectedConsTags: updatedConsTags,
        budget: updatedBudget,
      },
    };
  } catch (error) {
    console.error('REFILTER_WITH_ANCHOR failed:', error);
    return {
      success: false,
      error: String(error),
      message: '죄송해요, 추천을 다시 생성하는 중에 문제가 발생했어요. 잠시 후 다시 시도해주세요.',
    };
  }
}

/**
 * Generate user-friendly message for refilter result
 */
function generateRefilterMessage(params: {
  oldAnchor?: any;
  newAnchor: any;
  oldBudget: BudgetRange;
  newBudget: BudgetRange;
  addedProsTagIds: string[];
  addedConsTagIds: string[];
  recommendations: Recommendation[];
}): string {
  const { oldAnchor, newAnchor, oldBudget, newBudget, addedProsTagIds, addedConsTagIds, recommendations } = params;

  let message = `**${newAnchor.title}**을 기준으로 다시 찾아봤어요!\n\n`;

  // Anchor change
  if (oldAnchor && oldAnchor.productId !== newAnchor.id) {
    message += `📍 **기준 제품 변경**: ${oldAnchor.title} → ${newAnchor.title}\n`;
  }

  // Budget change
  if (oldBudget !== newBudget) {
    const comparison = compareBudgetRanges(oldBudget, newBudget);
    if (comparison === 'lower') {
      message += `💰 **예산 조정**: ${formatBudgetRange(oldBudget)} → ${formatBudgetRange(newBudget)} (더 합리적인 가격대)\n`;
    } else if (comparison === 'higher') {
      message += `💰 **예산 조정**: ${formatBudgetRange(oldBudget)} → ${formatBudgetRange(newBudget)} (더 프리미엄 제품 포함)\n`;
    }
  }

  // Added tags
  if (addedProsTagIds.length > 0) {
    const tagTexts = addedProsTagIds.map(id => getTagText(id)).join(', ');
    message += `✨ **추가된 중요 기능**: ${tagTexts}\n`;
  }

  if (addedConsTagIds.length > 0) {
    const tagTexts = addedConsTagIds.map(id => getTagText(id)).join(', ');
    message += `⚠️ **추가로 피하고 싶은 단점**: ${tagTexts}\n`;
  }

  message += `\n---\n\n`;
  message += `### 🎯 새로운 Top 3 추천\n\n`;

  recommendations.slice(0, 3).forEach((rec, i) => {
    message += `**${i + 1}. ${rec.product.title}** (${rec.finalScore}점)\n`;
    message += `   ${rec.reasoning}\n`;
    message += `   💰 ${rec.product.price?.toLocaleString()}원\n\n`;
  });

  return message;
}

/**
 * Compare budget ranges
 */
function compareBudgetRanges(budget1: BudgetRange, budget2: BudgetRange): 'lower' | 'higher' | 'same' {
  const max1 = budget1.endsWith('+') ? Infinity : parseInt(budget1.split('-')[1], 10);
  const max2 = budget2.endsWith('+') ? Infinity : parseInt(budget2.split('-')[1], 10);

  if (max1 < max2) return 'lower';
  if (max1 > max2) return 'higher';
  return 'same';
}
