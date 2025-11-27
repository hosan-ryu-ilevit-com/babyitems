import { NextRequest, NextResponse } from 'next/server';
import type { Category } from '@/lib/data';
import { getSpecsByCategory, getTopByPopularity } from '@/lib/data/specLoader';
import { getAllReviewsInCategory } from '@/lib/review/analyzer';

/**
 * GET /api/anchor-products?category=xxx&limit=10&search=keyword
 * Get anchor products for a category with review counts
 * - Filters out products with no reviews
 * - If search param provided, searches entire category (no limit)
 * - If limit param provided, returns top N by popularity
 * - If no limit or search, returns all products with reviews
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') as Category;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : null;
    const searchKeyword = searchParams.get('search')?.toLowerCase() || '';

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Loading anchor products for category: ${category}, limit: ${limit || 'all'}, search: "${searchKeyword}"`);

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
    } else if (limit) {
      // If limit provided, get top N by popularity
      results = getTopByPopularity(productsWithReviews, limit);
    } else {
      // Otherwise return all products with reviews (sorted by popularity)
      results = productsWithReviews.sort((a, b) => (b.순위 || 999) - (a.순위 || 999));
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
