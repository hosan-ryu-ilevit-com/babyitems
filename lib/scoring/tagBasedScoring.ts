/**
 * Tag-Based Scoring System
 *
 * This module calculates product match scores based on user-selected tags.
 * Each tag has attribute mappings with weights (1.0 for primary, 0.3-0.5 for secondary).
 * Products have pre-calculated attribute scores (0-100 scale).
 *
 * Scoring Formula:
 * - Pros tags: +3 points × attribute weight × priority multiplier × (product attribute score / 100)
 *   - 1st selected tag: 1.5x multiplier
 *   - 2nd selected tag: 1.2x multiplier
 *   - 3rd+ tags: 1.0x multiplier
 * - Cons tags: -2 points × attribute weight × (1 - product attribute score / 100)
 *   - Lower attribute score = more penalty (product has the con)
 *   - Higher attribute score = less penalty (product avoids the con)
 */

export interface TagWithAttributes {
  id: string;
  text: string;
  mentionCount?: number;
  attributes: Record<string, number>; // { attribute_key: weight }
}

export interface ProductAttributeScores {
  [attributeKey: string]: number | null; // 0-100 scale, null if insufficient data
}

export interface ScoringResult {
  totalScore: number;
  breakdown: {
    prosScore: number;
    consScore: number;
    prosDetails: AttributeContribution[];
    consDetails: AttributeContribution[];
  };
}

export interface AttributeContribution {
  tagId: string;
  tagText: string;
  attributeKey: string;
  attributeWeight: number;
  productAttributeScore: number;
  priorityMultiplier?: number; // Only for pros
  contribution: number; // Final score contribution
}

/**
 * Calculate tag-based score for a single product
 *
 * @param selectedProsTags - User-selected pros tags (in priority order)
 * @param selectedConsTags - User-selected cons tags
 * @param productAttributeScores - Product's attribute scores (0-100 scale)
 * @returns Total score and detailed breakdown
 */
export function calculateTagScore(
  selectedProsTags: TagWithAttributes[],
  selectedConsTags: TagWithAttributes[],
  productAttributeScores: ProductAttributeScores
): ScoringResult {
  const prosDetails: AttributeContribution[] = [];
  const consDetails: AttributeContribution[] = [];

  let prosScore = 0;
  let consScore = 0;

  // Process PROS tags with priority multipliers
  selectedProsTags.forEach((tag, index) => {
    const priorityMultiplier = index === 0 ? 1.5 : index === 1 ? 1.2 : 1.0;

    Object.entries(tag.attributes).forEach(([attrKey, attributeWeight]) => {
      const productAttributeScore = productAttributeScores[attrKey];

      // Skip if attribute score is null (insufficient data)
      if (productAttributeScore === null || productAttributeScore === undefined) {
        return;
      }

      const normalizedScore = productAttributeScore / 100; // 0-1 scale
      const contribution = 3 * attributeWeight * priorityMultiplier * normalizedScore;

      prosScore += contribution;
      prosDetails.push({
        tagId: tag.id,
        tagText: tag.text,
        attributeKey: attrKey,
        attributeWeight,
        productAttributeScore,
        priorityMultiplier,
        contribution,
      });
    });
  });

  // Process CONS tags (negative impact)
  // Lower attribute score = more penalty (product has the con)
  // Higher attribute score = less penalty (product avoids the con)
  selectedConsTags.forEach(tag => {
    Object.entries(tag.attributes).forEach(([attrKey, attributeWeight]) => {
      const productAttributeScore = productAttributeScores[attrKey];

      // Skip if attribute score is null (insufficient data)
      if (productAttributeScore === null || productAttributeScore === undefined) {
        return;
      }

      const normalizedScore = productAttributeScore / 100; // 0-1 scale
      const contribution = -2 * attributeWeight * (1 - normalizedScore);

      consScore += contribution;
      consDetails.push({
        tagId: tag.id,
        tagText: tag.text,
        attributeKey: attrKey,
        attributeWeight,
        productAttributeScore,
        contribution,
      });
    });
  });

  return {
    totalScore: prosScore + consScore,
    breakdown: {
      prosScore,
      consScore,
      prosDetails,
      consDetails,
    },
  };
}

/**
 * Calculate tag scores for multiple products
 *
 * @param selectedProsTags - User-selected pros tags
 * @param selectedConsTags - User-selected cons tags
 * @param products - Array of products with attribute scores
 * @returns Array of products with scores, sorted by score (descending)
 */
export function scoreProducts<T extends { productId: string; attributeScores?: ProductAttributeScores }>(
  selectedProsTags: TagWithAttributes[],
  selectedConsTags: TagWithAttributes[],
  products: T[]
): Array<T & { tagScore: number; tagScoringResult?: ScoringResult }> {
  return products
    .map(product => {
      // If product doesn't have attributeScores, skip scoring (score = 0)
      if (!product.attributeScores) {
        console.warn(`⚠️ Product ${product.productId} missing attributeScores`);
        return {
          ...product,
          tagScore: 0,
        };
      }

      const scoringResult = calculateTagScore(
        selectedProsTags,
        selectedConsTags,
        product.attributeScores
      );

      return {
        ...product,
        tagScore: scoringResult.totalScore,
        tagScoringResult: scoringResult,
      };
    })
    .sort((a, b) => b.tagScore - a.tagScore); // Sort by score descending
}

/**
 * Filter products by minimum tag score threshold
 *
 * @param scoredProducts - Products with tag scores
 * @param minScore - Minimum score threshold
 * @returns Filtered products above threshold
 */
export function filterByMinScore<T extends { tagScore: number }>(
  scoredProducts: T[],
  minScore: number
): T[] {
  return scoredProducts.filter(product => product.tagScore >= minScore);
}

/**
 * Get top N products by tag score
 *
 * @param scoredProducts - Products with tag scores (should already be sorted)
 * @param topN - Number of top products to return
 * @returns Top N products
 */
export function getTopNByScore<T extends { tagScore: number }>(
  scoredProducts: T[],
  topN: number
): T[] {
  return scoredProducts.slice(0, topN);
}

/**
 * Debug helper: Print scoring breakdown for a product
 *
 * @param productId - Product ID
 * @param scoringResult - Scoring result
 */
export function debugScoringBreakdown(productId: string, scoringResult: ScoringResult): void {
  console.log(`\n🔍 Scoring Breakdown for Product ${productId}:`);
  console.log(`   Total Score: ${scoringResult.totalScore.toFixed(2)}`);
  console.log(`   Pros Score: +${scoringResult.breakdown.prosScore.toFixed(2)}`);
  console.log(`   Cons Score: ${scoringResult.breakdown.consScore.toFixed(2)}`);

  console.log(`\n   📈 Pros Contributions (${scoringResult.breakdown.prosDetails.length}):`);
  scoringResult.breakdown.prosDetails.forEach(detail => {
    console.log(`      • Tag: "${detail.tagText.substring(0, 30)}..."`);
    console.log(`        Attribute: ${detail.attributeKey} (weight: ${detail.attributeWeight})`);
    console.log(`        Product Score: ${detail.productAttributeScore}/100`);
    console.log(`        Priority: ${detail.priorityMultiplier}x`);
    console.log(`        Contribution: +${detail.contribution.toFixed(2)}`);
  });

  if (scoringResult.breakdown.consDetails.length > 0) {
    console.log(`\n   📉 Cons Contributions (${scoringResult.breakdown.consDetails.length}):`);
    scoringResult.breakdown.consDetails.forEach(detail => {
      console.log(`      • Tag: "${detail.tagText.substring(0, 30)}..."`);
      console.log(`        Attribute: ${detail.attributeKey} (weight: ${detail.attributeWeight})`);
      console.log(`        Product Score: ${detail.productAttributeScore}/100`);
      console.log(`        Contribution: ${detail.contribution.toFixed(2)}`);
    });
  }
}
