/**
 * REFILTER_WITH_ANCHOR Tool
 *
 * Re-recommend products using a specific product as new anchor
 */

import type { Intent, AgentContext, AttributeRequest } from '../types';
import type { Recommendation, BudgetRange, UserContextSummary } from '@/types';
import { getProductSpec } from '@/lib/data/specLoader';
import { getFullTagObjects, getTagText } from '../utils/tagHelpers';
import { parseBudgetFromNaturalLanguage, formatBudgetRange } from '../utils/budgetAdjustment';
import { detectCategoryFromContext } from '../utils/contextHelpers';
import { generateRecommendations } from '@/app/api/recommend-v2/route';
import { generateContextSummaryFromTags } from '@/lib/utils/generateContextSummaryFromTags';
import { NextResponse } from 'next/server';

/**
 * Convert AttributeRequest[] to Tag[] format for V2 route
 */
function convertAttributeRequestsToTags(attributes: AttributeRequest[]): Array<{
  id: string;
  text: string;
  attributes: Record<string, number>;
}> {
  return attributes.map((attr, index) => ({
    id: `user-req-${attr.key}-${index + 1}`,
    text: attr.userText,
    attributes: { [attr.key]: attr.weight },
  }));
}

export interface RefilterResult {
  success: boolean;
  message: string;
  recommendations?: Recommendation[];
  updatedSession?: {
    anchorProduct: any;
    selectedProsTags: Array<{ id: string; text: string; attributes: Record<string, number> }>;
    selectedConsTags: Array<{ id: string; text: string; attributes: Record<string, number> }>;
    budget: BudgetRange;
  };
  contextSummary?: UserContextSummary;
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

    // Step 0: Detect category from context
    const category = detectCategoryFromContext(context);

    const { newAnchorProductId, productRank, tagChanges, attributeChanges, budgetChange } = intent.args || {};

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
    console.log(`   Using anchor: ${resolvedAnchorId} (category: ${category})`);
    const newAnchor = await getProductSpec(category, resolvedAnchorId);

    if (newAnchor) {
      const anchorTitle = newAnchor.모델명 || newAnchor.제품명 || newAnchor.브랜드 || '선택하신 제품';
      console.log(`   ✅ Anchor loaded: ${anchorTitle}`);
    } else {
      console.log(`   ⚠️  Could not load anchor product details, but continuing...`);
    }

    // Step 2: Load current tags/attributes
    const currentProsTags = context.currentSession.selectedProsTags || [];
    const currentConsTags = context.currentSession.selectedConsTags || [];
    const currentBudget = context.currentSession.budget || '0-150000';

    console.log(`   Current tags - Pros: ${currentProsTags.length}, Cons: ${currentConsTags.length}`);
    console.log(`   Current budget: ${currentBudget}`);

    // Step 3: Apply changes - NEW attribute-based path or LEGACY tag-based path
    let finalProsTags: Array<{ id: string; text: string; attributes: Record<string, number> }> = [];
    let finalConsTags: Array<{ id: string; text: string; attributes: Record<string, number> }> = [];

    if (attributeChanges) {
      // NEW: Attribute-based system
      console.log(`   Using NEW attribute-based system`);

      // Start with existing tags (already full tag objects with attributes)
      finalProsTags = currentProsTags || [];
      finalConsTags = currentConsTags || [];
      console.log(`   Loaded ${finalProsTags.length} existing pros tags, ${finalConsTags.length} cons tags`);

      // Add new attribute requests
      if (attributeChanges.addProsAttributes && attributeChanges.addProsAttributes.length > 0) {
        const newProsTags = convertAttributeRequestsToTags(attributeChanges.addProsAttributes);
        finalProsTags.push(...newProsTags);
        console.log(`   Added ${newProsTags.length} pros attributes`);
      }

      if (attributeChanges.addConsAttributes && attributeChanges.addConsAttributes.length > 0) {
        const newConsTags = convertAttributeRequestsToTags(attributeChanges.addConsAttributes);
        finalConsTags.push(...newConsTags);
        console.log(`   Added ${newConsTags.length} cons attributes`);
      }

      // Remove attributes (filter out tags with matching attribute keys)
      if (attributeChanges.removeProsAttributes && attributeChanges.removeProsAttributes.length > 0) {
        finalProsTags = finalProsTags.filter(tag =>
          !attributeChanges.removeProsAttributes!.some(key => key in tag.attributes)
        );
      }

      if (attributeChanges.removeConsAttributes && attributeChanges.removeConsAttributes.length > 0) {
        finalConsTags = finalConsTags.filter(tag =>
          !attributeChanges.removeConsAttributes!.some(key => key in tag.attributes)
        );
      }
    } else if (tagChanges) {
      // LEGACY: Tag-based system (backward compatibility)
      console.log(`   Using LEGACY tag-based system`);

      finalProsTags = [...(currentProsTags || [])];
      finalConsTags = [...(currentConsTags || [])];

      // Add new tags (convert tag IDs to tag objects using getFullTagObjects)
      if (tagChanges.addProsTags) {
        const newTags = getFullTagObjects(tagChanges.addProsTags);
        newTags.forEach(tag => {
          if (!finalProsTags.some(t => t.id === tag.id)) {
            finalProsTags.push(tag);
          }
        });
      }
      if (tagChanges.addConsTags) {
        const newTags = getFullTagObjects(tagChanges.addConsTags);
        newTags.forEach(tag => {
          if (!finalConsTags.some(t => t.id === tag.id)) {
            finalConsTags.push(tag);
          }
        });
      }

      // Remove tags
      if (tagChanges.removeProsTags) {
        finalProsTags = finalProsTags.filter(tag => !tagChanges.removeProsTags!.includes(tag.id));
      }
      if (tagChanges.removeConsTags) {
        finalConsTags = finalConsTags.filter(tag => !tagChanges.removeConsTags!.includes(tag.id));
      }
    } else {
      // No changes, keep existing tags
      finalProsTags = currentProsTags || [];
      finalConsTags = currentConsTags || [];
    }

    console.log(`   Final tags - Pros: ${finalProsTags.length}, Cons: ${finalConsTags.length}`);

    // Step 4: Update budget
    let updatedBudget = currentBudget;

    if (budgetChange) {
      if (budgetChange.type === 'specific' && budgetChange.value) {
        updatedBudget = budgetChange.value as BudgetRange;
      } else if (budgetChange.type === 'clarification_needed') {
        // Need to ask user for budget clarification
        return {
          success: false,
          message: '예산을 구체적으로 알려주시면 더 정확하게 찾아드릴 수 있어요! 예를 들어 "7만원 이하", "최대 10만원" 같이 말씀해주세요.',
          error: 'Budget clarification needed',
        };
      }
    }

    console.log(`   Updated budget: ${updatedBudget}`);

    // Step 5: Call recommendation logic directly (no HTTP call needed)
    console.log(`   Generating recommendations...`);

    const result = await generateRecommendations(
      category,
      resolvedAnchorId,
      finalProsTags,  // Already in Tag[] format
      finalConsTags,  // Already in Tag[] format
      updatedBudget
    );

    // Check if result is a NextResponse (error case)
    if (result instanceof NextResponse) {
      throw new Error('Failed to generate recommendations');
    }

    if (!result.success || !result.recommendations) {
      throw new Error('No recommendations returned');
    }

    console.log(`   ✅ Got ${result.recommendations.length} recommendations`);

    // Step 6: Transform V2 recommendations to match Recommendation interface
    const transformedRecommendations: Recommendation[] = result.recommendations.map((rec: any, index: number) => ({
      product: {
        id: String(rec.productId),
        title: rec.모델명 || rec.제품명 || rec.브랜드 || 'Unknown',
        brand: rec.브랜드,
        price: rec.최저가,
        reviewCount: rec.reviewCount || 0,
        reviewUrl: rec.썸네일 || '',
        ranking: rec.순위 || index + 1,
        thumbnail: rec.썸네일 || '',
        coreValues: {
          temperatureControl: 0,
          hygiene: 0,
          material: 0,
          usability: 0,
          portability: 0,
          priceValue: 0,
          durability: 0,
          additionalFeatures: 0,
        },
        category: category as any,
      },
      rank: (index + 1) as 1 | 2 | 3 | 4,
      finalScore: rec.fitScore,
      reasoning: rec.reasoning,
      selectedTagsEvaluation: rec.selectedTagsEvaluation || [],
      additionalPros: rec.additionalPros || [],
      cons: rec.cons || [],
      anchorComparison: [],
      citedReviews: rec.citedReviews || [],
    }));

    // Step 7: Collect added tag texts for message generation
    const addedProsTexts: string[] = [];
    const addedConsTexts: string[] = [];

    if (attributeChanges) {
      // NEW system: get texts from attribute requests
      addedProsTexts.push(...(attributeChanges.addProsAttributes?.map(a => a.userText) || []));
      addedConsTexts.push(...(attributeChanges.addConsAttributes?.map(a => a.userText) || []));
    } else if (tagChanges) {
      // LEGACY system: get texts from tag IDs
      addedProsTexts.push(...(tagChanges.addProsTags?.map(id => getTagText(id)) || []));
      addedConsTexts.push(...(tagChanges.addConsTags?.map(id => getTagText(id)) || []));
    }

    // Step 8: Generate user-friendly message
    const anchorTitle = newAnchor?.모델명 || newAnchor?.제품명 || newAnchor?.브랜드 || '선택하신 제품';

    const message = generateRefilterMessage({
      oldAnchor: context.currentSession.anchorProduct,
      newAnchor: {
        productId: newAnchor?.productId || resolvedAnchorId,
        title: anchorTitle,
      },
      oldBudget: currentBudget,
      newBudget: updatedBudget,
      addedProsTexts,
      addedConsTexts,
      recommendations: transformedRecommendations,
    });

    // Step 9: Generate updated context summary for "내 구매기준" component
    const updatedContextSummary = generateContextSummaryFromTags(
      finalProsTags,
      finalConsTags,
      updatedBudget
    );

    // Step 10: Return full tag objects for session storage (preserves attributes for future re-filtering)
    return {
      success: true,
      message,
      recommendations: transformedRecommendations,
      updatedSession: {
        anchorProduct: {
          productId: newAnchor?.productId || resolvedAnchorId,
          title: anchorTitle,
        },
        selectedProsTags: finalProsTags,
        selectedConsTags: finalConsTags,
        budget: updatedBudget,
      },
      contextSummary: updatedContextSummary,
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
 * Generate user-friendly message for refilter result (simplified)
 */
function generateRefilterMessage(params: {
  oldAnchor?: any;
  newAnchor: any;
  oldBudget: BudgetRange;
  newBudget: BudgetRange;
  addedProsTexts: string[];
  addedConsTexts: string[];
  recommendations: Recommendation[];
}): string {
  const { oldAnchor, newAnchor, oldBudget, newBudget, addedProsTexts, addedConsTexts, recommendations } = params;

  // Simple intro
  let message = ``;

  // Only show changes that actually happened
  const hasAnchorChange = oldAnchor && oldAnchor.productId !== (newAnchor.productId || newAnchor.id);
  const hasBudgetChange = oldBudget !== newBudget;
  const hasAttributeChanges = addedProsTexts.length > 0 || addedConsTexts.length > 0;

  if (hasAnchorChange) {
    message += `**${newAnchor.title}**을 기준으로 다시 찾아봤어요!\n`;
  } else if (hasBudgetChange) {
    message += `**${formatBudgetRange(newBudget)}** 예산으로 다시 찾아봤어요!\n`;
  } else if (hasAttributeChanges) {
    message += `조건을 반영해서 다시 찾아봤어요!\n`;
  } else {
    message += `다시 찾아봤어요!\n`;
  }

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
