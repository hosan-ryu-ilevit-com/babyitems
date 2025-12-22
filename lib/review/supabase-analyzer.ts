/**
 * Supabase-based review analyzer
 * Fetches reviews from danawa_reviews / enuri_reviews tables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Sampled review for LLM prompt
 */
export interface ProductReviewSample {
  high: Array<{
    text: string;
    rating: number;
    length: number;
    author?: string | null;
    review_date?: string | null;
    helpful_count?: number;
    reviewIndex: number;
  }>;
  low: Array<{
    text: string;
    rating: number;
    length: number;
    author?: string | null;
    review_date?: string | null;
    helpful_count?: number;
    reviewIndex: number;
  }>;
  totalCount: number;
}

interface SupabaseReview {
  id: number;
  pcode?: string;
  model_no?: string;
  rating: number;
  content: string;
  author?: string;
  review_date?: string;
  helpful_count?: number;
}

/**
 * Get sampled reviews for multiple products from Supabase
 * Samples longest reviews from high (4-5★) and low (1-2★) ratings
 *
 * @param productIds Array of product IDs (pcode)
 * @param highCount Number of high-rating reviews per product (default: 5)
 * @param lowCount Number of low-rating reviews per product (default: 5)
 * @returns Map of productId -> sampled reviews
 */
export async function getSampledReviewsFromSupabase(
  productIds: string[],
  highCount: number = 5,
  lowCount: number = 5
): Promise<Map<string, ProductReviewSample>> {
  const sampledMap = new Map<string, ProductReviewSample>();

  // Initialize empty samples for all products
  productIds.forEach(id => {
    sampledMap.set(id, { high: [], low: [], totalCount: 0 });
  });

  if (productIds.length === 0) {
    return sampledMap;
  }

  try {
    // 1. Try danawa_reviews first
    const { data: danawaReviews, error: danawaError } = await supabase
      .from('danawa_reviews')
      .select('pcode, rating, content, author, review_date, helpful_count')
      .in('pcode', productIds);

    if (danawaError) {
      console.error('[supabase-review] Danawa reviews error:', danawaError);
    }

    // 2. Get enuri_reviews as fallback (model_no = pcode)
    const { data: enuriReviews, error: enuriError } = await supabase
      .from('enuri_reviews')
      .select('model_no, rating, content, author, review_date, helpful_count')
      .in('model_no', productIds);

    if (enuriError) {
      console.error('[supabase-review] Enuri reviews error:', enuriError);
    }

    // Combine reviews, prioritizing danawa
    const reviewsByProduct = new Map<string, Array<{
      rating: number;
      content: string;
      author?: string | null;
      review_date?: string | null;
      helpful_count?: number;
    }>>();

    // Initialize
    productIds.forEach(id => {
      reviewsByProduct.set(id, []);
    });

    // Add danawa reviews
    if (danawaReviews) {
      danawaReviews.forEach(review => {
        if (review.pcode && review.content && review.rating) {
          reviewsByProduct.get(review.pcode)?.push({
            rating: review.rating,
            content: review.content,
            author: review.author,
            review_date: review.review_date,
            helpful_count: review.helpful_count,
          });
        }
      });
    }

    // Add enuri reviews for products with no danawa reviews
    if (enuriReviews) {
      enuriReviews.forEach(review => {
        const pcode = review.model_no;
        if (pcode && review.content && review.rating) {
          const existing = reviewsByProduct.get(pcode) || [];
          // Only add if no danawa reviews exist for this product
          if (existing.length === 0) {
            reviewsByProduct.get(pcode)?.push({
              rating: review.rating,
              content: review.content,
              author: review.author,
              review_date: review.review_date,
              helpful_count: review.helpful_count,
            });
          }
        }
      });
    }

    // Sample reviews for each product
    for (const [productId, reviews] of reviewsByProduct) {
      const highRating = reviews
        .filter(r => r.rating >= 4)
        .map((r, idx) => ({
          text: r.content,
          rating: r.rating,
          length: r.content.length,
          author: r.author,
          review_date: r.review_date,
          helpful_count: r.helpful_count,
          reviewIndex: idx,
        }))
        .sort((a, b) => b.length - a.length)
        .slice(0, highCount);

      const lowRating = reviews
        .filter(r => r.rating <= 2)
        .map((r, idx) => ({
          text: r.content,
          rating: r.rating,
          length: r.content.length,
          author: r.author,
          review_date: r.review_date,
          helpful_count: r.helpful_count,
          reviewIndex: idx,
        }))
        .sort((a, b) => b.length - a.length)
        .slice(0, lowCount);

      sampledMap.set(productId, {
        high: highRating,
        low: lowRating,
        totalCount: reviews.length,
      });
    }

    const totalLoaded = Array.from(sampledMap.values()).reduce((sum, s) => sum + s.totalCount, 0);
    console.log(`[supabase-review] Loaded ${totalLoaded} reviews for ${productIds.length} products`);

    return sampledMap;
  } catch (error) {
    console.error('[supabase-review] Failed to fetch reviews:', error);
    return sampledMap;
  }
}

/**
 * Format a single review text for LLM prompt (truncate if too long)
 */
function truncateReviewText(text: string, maxLength: number = 200): string {
  // Extract just the content part (remove "제목:" and "내용:" prefixes if exist)
  const contentMatch = text.match(/내용:\s*([\s\S]+)/);
  const content = contentMatch ? contentMatch[1].trim() : text;

  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

/**
 * Format sampled reviews for LLM prompt
 */
export function formatReviewsForPrompt(sample: ProductReviewSample): string {
  if (sample.totalCount === 0) {
    return '- 리뷰: 없음';
  }

  const lines: string[] = [];
  lines.push(`- 총 리뷰 수: ${sample.totalCount}개`);

  if (sample.high.length > 0) {
    lines.push('- 높은평점 리뷰 (4-5점):');
    sample.high.slice(0, 5).forEach((r, i) => {
      lines.push(`  ${i + 1}. "${truncateReviewText(r.text)}" (${r.rating}점)`);
    });
  }

  if (sample.low.length > 0) {
    lines.push('- 낮은평점 리뷰 (1-2점):');
    sample.low.slice(0, 5).forEach((r, i) => {
      lines.push(`  ${i + 1}. "${truncateReviewText(r.text)}" (${r.rating}점)`);
    });
  }

  return lines.join('\n');
}
