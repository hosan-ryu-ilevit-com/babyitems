import { NextRequest, NextResponse } from 'next/server';
import { getReviewsForProduct } from '@/lib/review';
import type { Category } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/product-reviews
 *
 * Query params:
 * - category: Category name (e.g., 'milk_powder_port')
 * - productId: Product ID
 * - sortBy: 'rating_desc' | 'rating_asc' (default: 'rating_desc')
 *
 * Returns all reviews for a specific product with sorting
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as Category;
    const productId = searchParams.get('productId');
    const sortBy = searchParams.get('sortBy') || 'rating_desc';

    // Validation
    if (!category || !productId) {
      return NextResponse.json(
        { error: 'Missing required parameters: category and productId' },
        { status: 400 }
      );
    }

    console.log(`📚 Fetching reviews for product ${productId} in category ${category}`);

    // Fetch all reviews for this product
    const reviews = await getReviewsForProduct(category, productId);

    // Sort reviews
    const sortedReviews = [...reviews].sort((a, b) => {
      if (sortBy === 'rating_desc') {
        return b.custom_metadata.rating - a.custom_metadata.rating;
      } else if (sortBy === 'rating_asc') {
        return a.custom_metadata.rating - b.custom_metadata.rating;
      }
      return 0;
    });

    console.log(`✅ Found ${sortedReviews.length} reviews (sorted by ${sortBy})`);

    return NextResponse.json({
      success: true,
      reviews: sortedReviews,
      totalCount: sortedReviews.length,
      sortBy,
    });
  } catch (error) {
    console.error('Product reviews API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch reviews',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
