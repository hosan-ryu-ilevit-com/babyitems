/**
 * Context Helper Utilities
 *
 * Utilities for extracting information from AgentContext
 */

import type { AgentContext } from '../types';
import type { ProductCategory } from '@/types';
import { products as PRODUCTS_DATA } from '@/data/products';

/**
 * Detect category from current recommendations
 * @param context Agent context with current recommendations
 * @returns Category string (e.g., 'milk_powder_port', 'baby_bottle')
 * @throws Error if category cannot be determined
 */
export function detectCategoryFromContext(context: AgentContext): ProductCategory {
  // Try to get category from current recommendations
  if (context.currentRecommendations && context.currentRecommendations.length > 0) {
    const category = context.currentRecommendations[0].product.category;
    if (category) {
      console.log(`   ✅ Detected category from recommendations: ${category}`);
      return category;
    }
  }

  // Fallback: Look up category from anchor product ID
  if (context.currentSession?.anchorProduct?.productId) {
    console.warn(`   ⚠️  Could not detect category from recommendations, looking up anchor product...`);

    const anchorProductId = String(context.currentSession.anchorProduct.productId);
    const anchorProduct = PRODUCTS_DATA.find(p => p.id === anchorProductId);

    if (anchorProduct?.category) {
      console.log(`   ✅ Detected category from anchor product ${anchorProductId}: ${anchorProduct.category}`);
      return anchorProduct.category;
    }

    console.error(`   ❌ Anchor product ${anchorProductId} not found in products data`);
  }

  // If all else fails, throw error - we cannot proceed without knowing the category
  throw new Error('Cannot detect category: No recommendations or valid anchor product in context');
}

/**
 * Get category display name (Korean)
 * @param category Product category
 * @returns Display name in Korean
 */
export function getCategoryDisplayName(category: ProductCategory): string {
  const displayNames: Record<ProductCategory, string> = {
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

  return displayNames[category] || category;
}
