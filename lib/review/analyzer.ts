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
