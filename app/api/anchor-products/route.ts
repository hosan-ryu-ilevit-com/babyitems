import { NextRequest, NextResponse } from 'next/server';
import type { Category } from '@/lib/data';
import { getSpecsByCategory, getTopByPopularity } from '@/lib/data/specLoader';
import { getAllReviewsInCategory } from '@/lib/review/analyzer';

/**
 * GET /api/anchor-products?category=xxx&limit=10&search=keyword
 * Get top anchor products for a category with review counts
 * - Filters out products with no reviews
 * - If search param provided, searches entire category (no limit)
 * - Otherwise returns top N by popularity
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') as Category;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const searchKeyword = searchParams.get('search')?.toLowerCase() || '';

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Loading anchor products for category: ${category}, limit: ${limit}, search: "${searchKeyword}"`);

    const specs = await getSpecsByCategory(category);

    if (specs.length === 0) {
      return NextResponse.json(
        { error: `No products found for category: ${category}` },
        { status: 404 }
      );
    }

    // Get all reviews and count by productId
    const allReviews = await getAllReviewsInCategory(category);
    const reviewCountMap = new Map<string, number>();

    allReviews.forEach(review => {
      const productId = review.custom_metadata?.productId;
      if (productId) {
        reviewCountMap.set(productId, (reviewCountMap.get(productId) || 0) + 1);
      }
    });

    // Add review count to each product and filter out products with no reviews
    const productsWithReviews = specs
      .map(product => ({
        ...product,
        reviewCount: reviewCountMap.get(String(product.productId)) || 0,
      }))
      .filter(product => product.reviewCount > 0); // 리뷰 없는 제품 제외

    console.log(`📊 Products with reviews: ${productsWithReviews.length}/${specs.length}`);

    // If search keyword provided, search entire category
    let results;
    if (searchKeyword) {
      results = productsWithReviews.filter(product => {
        const searchText = `${product.브랜드} ${product.모델명}`.toLowerCase();
        return searchText.includes(searchKeyword);
      });
      console.log(`🔎 Search results: ${results.length} products match "${searchKeyword}"`);
    } else {
      // Otherwise get top N by popularity
      results = getTopByPopularity(productsWithReviews, limit);
    }

    console.log(`✅ Found ${results.length} anchor products`);

    return NextResponse.json({
      success: true,
      category,
      products: results,
      total: productsWithReviews.length,
    });
  } catch (error) {
    console.error('Anchor products API error:', error);
    return NextResponse.json(
      { error: 'Failed to load anchor products', details: String(error) },
      { status: 500 }
    );
  }
}
