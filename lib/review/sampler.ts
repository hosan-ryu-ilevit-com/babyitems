import { Review, SampledReview } from './types';

/**
 * Sample top N longest reviews from a list
 * Strategy: Longer reviews tend to be more detailed and helpful
 *
 * @param reviews Array of reviews
 * @param n Number of reviews to sample (default: 50)
 * @returns Sampled reviews with length and original index
 */
export function sampleLongestReviews(reviews: Review[], n: number = 50): SampledReview[] {
  // Add length and index to each review
  const reviewsWithMeta = reviews.map((review, index) => ({
    ...review,
    length: review.text.length,
    index: index + 1, // 1-indexed for display
  }));

  // Sort by length (descending) and take top N
  const sampled = reviewsWithMeta
    .sort((a, b) => b.length - a.length)
    .slice(0, n);

  console.log(`📊 Sampled ${sampled.length} reviews from ${reviews.length} total`);
  console.log(`   Average length: ${Math.round(sampled.reduce((sum, r) => sum + r.length, 0) / sampled.length)} chars`);
  console.log(`   Longest: ${sampled[0]?.length || 0} chars, Shortest: ${sampled[sampled.length - 1]?.length || 0} chars`);

  return sampled;
}

/**
 * Sample reviews balanced by sentiment (high/low ratings only)
 * Optimized for parallel processing of pros and cons
 *
 * Strategy:
 * - High ratings (4-5★): 15 longest reviews → Extract pros (parallel)
 * - Low ratings (1-2★): 10 longest reviews → Extract cons (parallel)
 * - Mid ratings excluded for speed optimization
 * - Total: 25 reviews (reduced from 30)
 *
 * @param reviews Array of reviews
 * @returns { high: SampledReview[], low: SampledReview[] } - Separated by sentiment for parallel processing
 */
export function sampleBalancedBySentiment(reviews: Review[]): { high: SampledReview[]; low: SampledReview[] } {
  // Group reviews by sentiment (exclude mid ratings)
  const highRating = reviews.filter(r => r.custom_metadata.rating >= 4);
  const lowRating = reviews.filter(r => r.custom_metadata.rating <= 2);

  // Sample longest from each group
  const sampleLongest = (group: Review[], count: number) =>
    group
      .map((review, index) => ({
        ...review,
        length: review.text.length,
        index: index + 1,
      }))
      .sort((a, b) => b.length - a.length)
      .slice(0, Math.min(count, group.length));

  const sampledHigh = sampleLongest(highRating, 15);
  const sampledLow = sampleLongest(lowRating, 10);

  console.log(`📊 Sampled ${sampledHigh.length + sampledLow.length} reviews for parallel processing`);
  console.log(`   High ratings (4-5★): ${sampledHigh.length} reviews → Pros extraction`);
  console.log(`   Low ratings (1-2★): ${sampledLow.length} reviews → Cons extraction`);
  if (sampledHigh.length > 0) {
    console.log(`   High avg length: ${Math.round(sampledHigh.reduce((sum, r) => sum + r.length, 0) / sampledHigh.length)} chars`);
  }
  if (sampledLow.length > 0) {
    console.log(`   Low avg length: ${Math.round(sampledLow.reduce((sum, r) => sum + r.length, 0) / sampledLow.length)} chars`);
  }

  return { high: sampledHigh, low: sampledLow };
}

/**
 * Sample reviews by rating distribution
 * Ensures balanced sampling across different ratings
 *
 * @param reviews Array of reviews
 * @param n Number of reviews to sample
 * @returns Sampled reviews
 */
export function sampleByRatingDistribution(reviews: Review[], n: number = 30): Review[] {
  // Group reviews by rating
  const byRating = new Map<number, Review[]>();
  reviews.forEach((review) => {
    const rating = review.custom_metadata.rating;
    if (!byRating.has(rating)) {
      byRating.set(rating, []);
    }
    byRating.get(rating)!.push(review);
  });

  // Calculate how many reviews to take from each rating
  const ratings = Array.from(byRating.keys()).sort((a, b) => b - a); // 5 -> 1
  const perRating = Math.floor(n / ratings.length);
  const remainder = n % ratings.length;

  const sampled: Review[] = [];

  ratings.forEach((rating, index) => {
    const reviewsInRating = byRating.get(rating)!;
    const take = perRating + (index < remainder ? 1 : 0);

    // Sort by length and take longest
    const longest = reviewsInRating
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, take);

    sampled.push(...longest);
  });

  console.log(`📊 Sampled ${sampled.length} reviews balanced by rating`);
  ratings.forEach((rating) => {
    const count = sampled.filter(r => r.custom_metadata.rating === rating).length;
    console.log(`   Rating ${rating}: ${count} reviews`);
  });

  return sampled;
}

/**
 * Format sampled reviews for LLM prompt
 * @param reviews Array of reviews (can be Review or SampledReview)
 * @param maxChars Maximum total characters (default: 100k)
 * @returns Formatted string ready for LLM
 */
export function formatReviewsForLLM(
  reviews: (Review | SampledReview)[],
  maxChars: number = 100000
): string {
  const formatted = reviews
    .map((review, idx) => {
      const index = 'index' in review ? review.index : idx + 1;
      const rating = review.custom_metadata.rating;
      return `[리뷰 ${index}] (별점: ${rating}점)\n${review.text}`;
    })
    .join('\n\n---\n\n');

  // Truncate if too long
  if (formatted.length > maxChars) {
    const truncated = formatted.substring(0, maxChars);
    console.log(`⚠️  Truncated reviews from ${formatted.length} to ${maxChars} chars`);
    return truncated + '\n\n...(리뷰가 너무 많아 일부만 표시됨)';
  }

  return formatted;
}

/**
 * Get review statistics for logging
 * @param reviews Array of reviews
 */
export function getReviewStats(reviews: Review[]) {
  if (reviews.length === 0) {
    return {
      total: 0,
      avgLength: 0,
      avgRating: 0,
      ratingDistribution: {},
    };
  }

  const avgLength = Math.round(
    reviews.reduce((sum, r) => sum + r.text.length, 0) / reviews.length
  );

  const avgRating = (
    reviews.reduce((sum, r) => sum + r.custom_metadata.rating, 0) / reviews.length
  ).toFixed(2);

  const ratingDistribution: Record<number, number> = {};
  reviews.forEach((r) => {
    const rating = r.custom_metadata.rating;
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
  });

  return {
    total: reviews.length,
    avgLength,
    avgRating: parseFloat(avgRating),
    ratingDistribution,
  };
}
