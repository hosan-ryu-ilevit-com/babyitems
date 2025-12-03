import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/cache/simple';

const ADMIN_PASSWORD = '1545';

// All product categories
const ALL_CATEGORIES = [
  'baby_formula_dispenser',
  'milk_powder_port',
  'baby_bottle',
  'baby_bottle_sterilizer',
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'nasal_aspirator',
  'thermometer'
];

/**
 * POST /api/admin/clear-cache
 * Clear cache for specific product or all cache
 *
 * Body:
 * - password: Admin password
 * - productId?: Specific product ID to clear (optional)
 * - clearAll?: true to clear all cache (optional)
 */
export async function POST(req: NextRequest) {
  try {
    const { password, productId, clearAll } = await req.json();

    // Auth check
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Clear all cache
    if (clearAll) {
      cache.clear();
      console.log('🧹 All cache cleared');
      return NextResponse.json({
        success: true,
        message: 'All cache cleared',
        cleared: 'all'
      });
    }

    // Clear specific product cache
    if (productId) {
      const clearedKeys: string[] = [];

      // Try all category combinations
      for (const category of ALL_CATEGORIES) {
        const cacheKey = `tags:${category}:${productId}`;
        if (cache.has(cacheKey)) {
          cache.delete(cacheKey);
          clearedKeys.push(cacheKey);
        }
      }

      if (clearedKeys.length === 0) {
        return NextResponse.json({
          success: true,
          message: `No cache found for product ${productId}`,
          cleared: []
        });
      }

      console.log(`🧹 Cleared ${clearedKeys.length} cache entries for product ${productId}`);
      return NextResponse.json({
        success: true,
        message: `Cache cleared for product ${productId}`,
        cleared: clearedKeys
      });
    }

    return NextResponse.json(
      { error: 'Either productId or clearAll must be provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Clear cache API error:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache', details: String(error) },
      { status: 500 }
    );
  }
}
