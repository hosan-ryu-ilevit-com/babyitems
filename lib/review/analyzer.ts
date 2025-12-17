import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Review } from './types';

/**
 * Get all reviews for a specific product from JSONL file
 * @param category Category name (e.g., 'baby_bottle', 'milk_powder_port')
 * @param productId Product ID to filter
 * @returns Array of reviews
 */
export async function getReviewsForProduct(
  category: string,
  productId: string
): Promise<Review[]> {
  const reviewsPath = path.join(process.cwd(), 'data', 'reviews', `${category}.jsonl`);

  if (!fs.existsSync(reviewsPath)) {
    throw new Error(`Reviews file not found: ${category}.jsonl`);
  }

  const reviews: Review[] = [];
  const fileStream = fs.createReadStream(reviewsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const review = JSON.parse(line) as Review;
        if (review.custom_metadata?.productId === productId) {
          reviews.push(review);
        }
      } catch (e) {
        console.error('Failed to parse review line:', e);
      }
    }
  }

  return reviews;
}

/**
 * Get all reviews from a category JSONL file
 * @param category Category name
 * @returns Array of all reviews in the category
 */
export async function getAllReviewsInCategory(category: string): Promise<Review[]> {
  const reviewsPath = path.join(process.cwd(), 'data', 'reviews', `${category}.jsonl`);

  if (!fs.existsSync(reviewsPath)) {
    throw new Error(`Reviews file not found: ${category}.jsonl`);
  }

  const reviews: Review[] = [];
  const fileStream = fs.createReadStream(reviewsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const review = JSON.parse(line) as Review;
        reviews.push(review);
      } catch (e) {
        console.error('Failed to parse review line:', e);
      }
    }
  }

  return reviews;
}

/**
 * Get reviews for multiple products efficiently
 * @param category Category name
 * @param productIds Array of product IDs to filter
 * @returns Map of productId -> reviews array
 */
export async function getReviewsForMultipleProducts(
  category: string,
  productIds: string[]
): Promise<Map<string, Review[]>> {
  const reviewsPath = path.join(process.cwd(), 'data', 'reviews', `${category}.jsonl`);

  if (!fs.existsSync(reviewsPath)) {
    throw new Error(`Reviews file not found: ${category}.jsonl`);
  }

  const productIdSet = new Set(productIds);
  const reviewsMap = new Map<string, Review[]>();

  // Initialize empty arrays for each product
  productIds.forEach((id) => {
    reviewsMap.set(id, []);
  });

  const fileStream = fs.createReadStream(reviewsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const review = JSON.parse(line) as Review;
        const productId = review.custom_metadata?.productId;

        if (productId && productIdSet.has(productId)) {
          reviewsMap.get(productId)!.push(review);
        }
      } catch (e) {
        console.error('Failed to parse review line:', e);
      }
    }
  }

  return reviewsMap;
}

/**
 * Sampled review for LLM prompt
 */
export interface ProductReviewSample {
  high: Array<{ text: string; rating: number; length: number }>;
  low: Array<{ text: string; rating: number; length: number }>;
  totalCount: number;
}

/**
 * Get sampled reviews for multiple products efficiently
 * Samples longest reviews from high (4-5★) and low (1-2★) ratings
 *
 * @param category Category name
 * @param productIds Array of product IDs
 * @param highCount Number of high-rating reviews per product (default: 5)
 * @param lowCount Number of low-rating reviews per product (default: 5)
 * @returns Map of productId -> sampled reviews
 */
export async function getSampledReviewsForProducts(
  category: string,
  productIds: string[],
  highCount: number = 5,
  lowCount: number = 5
): Promise<Map<string, ProductReviewSample>> {
  const reviewsPath = path.join(process.cwd(), 'data', 'reviews', `${category}.jsonl`);

  // Check if file exists, return empty map if not
  if (!fs.existsSync(reviewsPath)) {
    console.log(`[review] Reviews file not found: ${category}.jsonl`);
    const emptyMap = new Map<string, ProductReviewSample>();
    productIds.forEach(id => {
      emptyMap.set(id, { high: [], low: [], totalCount: 0 });
    });
    return emptyMap;
  }

  const productIdSet = new Set(productIds);
  const rawReviewsMap = new Map<string, Review[]>();

  // Initialize empty arrays for each product
  productIds.forEach((id) => {
    rawReviewsMap.set(id, []);
  });

  const fileStream = fs.createReadStream(reviewsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const review = JSON.parse(line) as Review;
        const productId = review.custom_metadata?.productId;

        if (productId && productIdSet.has(productId)) {
          rawReviewsMap.get(productId)!.push(review);
        }
      } catch (e) {
        // Skip malformed lines silently
      }
    }
  }

  // Sample reviews for each product
  const sampledMap = new Map<string, ProductReviewSample>();

  for (const [productId, reviews] of rawReviewsMap) {
    const highRating = reviews
      .filter(r => r.custom_metadata.rating >= 4)
      .map(r => ({ text: r.text, rating: r.custom_metadata.rating, length: r.text.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, highCount);

    const lowRating = reviews
      .filter(r => r.custom_metadata.rating <= 2)
      .map(r => ({ text: r.text, rating: r.custom_metadata.rating, length: r.text.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, lowCount);

    sampledMap.set(productId, {
      high: highRating,
      low: lowRating,
      totalCount: reviews.length,
    });
  }

  console.log(`[review] Loaded reviews for ${productIds.length} products in ${category}`);

  return sampledMap;
}

/**
 * Format a single review text for LLM prompt (truncate if too long)
 */
function truncateReviewText(text: string, maxLength: number = 200): string {
  // Extract just the content part (remove "제목:" and "내용:" prefixes)
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
    lines.push('- 👍 높은평점 리뷰:');
    sample.high.slice(0, 3).forEach((r, i) => {
      lines.push(`  ${i + 1}. "${truncateReviewText(r.text)}" (${r.rating}★)`);
    });
  }

  if (sample.low.length > 0) {
    lines.push('- 👎 낮은평점 리뷰:');
    sample.low.slice(0, 3).forEach((r, i) => {
      lines.push(`  ${i + 1}. "${truncateReviewText(r.text)}" (${r.rating}★)`);
    });
  }

  return lines.join('\n');
}
