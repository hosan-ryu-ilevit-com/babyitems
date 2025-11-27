import fs from 'fs';
import path from 'path';
import { Category, ProductSpec, ProductWithReviews } from './types';
import { CATEGORIES } from './constants';

// In-memory cache for spec data
let specCache: Map<Category, ProductSpec[]> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Load all spec data from JSON files into memory
 * @param forceReload Force reload even if cache exists
 */
export async function loadAllSpecs(forceReload: boolean = false): Promise<Map<Category, ProductSpec[]>> {
  const now = Date.now();

  // Return cached data if valid
  if (specCache && !forceReload && (now - cacheTimestamp < CACHE_TTL)) {
    console.log('📦 Using cached spec data');
    return specCache;
  }

  console.log('📦 Loading spec data from files...');
  const startTime = Date.now();

  const cache = new Map<Category, ProductSpec[]>();

  for (const category of CATEGORIES) {
    const filePath = path.join(process.cwd(), 'data', 'specs', `${category}.json`);

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const specs = JSON.parse(fileContent) as ProductSpec[];
        cache.set(category, specs);
        console.log(`   ✅ ${category}: ${specs.length} products`);
      } catch (error) {
        console.error(`   ❌ Failed to load ${category}:`, error);
        cache.set(category, []);
      }
    } else {
      console.warn(`   ⚠️  File not found: ${category}.json`);
      cache.set(category, []);
    }
  }

  const elapsed = Date.now() - startTime;
  const totalProducts = Array.from(cache.values()).reduce((sum, specs) => sum + specs.length, 0);

  console.log(`📦 Loaded ${totalProducts} products from ${cache.size} categories in ${elapsed}ms`);

  specCache = cache;
  cacheTimestamp = now;

  return cache;
}

/**
 * Get specs for a specific category
 * @param category Category name
 * @param autoLoad Auto-load if not cached (default: true)
 */
export async function getSpecsByCategory(
  category: Category,
  autoLoad: boolean = true
): Promise<ProductSpec[]> {
  if (!specCache && autoLoad) {
    await loadAllSpecs();
  }

  return specCache?.get(category) || [];
}

/**
 * Get a single product spec by category and productId
 * @param category Category name
 * @param productId Product ID
 */
export async function getProductSpec(
  category: Category,
  productId: string | number
): Promise<ProductSpec | null> {
  const specs = await getSpecsByCategory(category);
  const id = typeof productId === 'string' ? parseInt(productId, 10) : productId;

  return specs.find((spec) => spec.productId === id) || null;
}

/**
 * Filter products by budget
 * @param specs Array of product specs
 * @param maxBudget Maximum budget (inclusive)
 * @param minBudget Minimum budget (optional)
 */
export function filterByBudget(
  specs: ProductSpec[],
  maxBudget: number,
  minBudget: number = 0
): ProductSpec[] {
  return specs.filter((spec) => {
    const price = spec.최저가;
    if (price === null || price === undefined) return false;
    return price >= minBudget && price <= maxBudget;
  });
}

/**
 * Calculate popularity score (for ranking when no user criteria)
 * Strategy: Use 총점 (total score) and 순위 (ranking)
 * @param spec Product spec
 * @param reviewCount Optional review count (if available)
 */
export function calculatePopularityScore(
  spec: ProductSpec,
  reviewCount?: number
): number {
  let score = 0;

  // Base score from 총점 (total score)
  if (spec.총점 !== null && spec.총점 !== undefined) {
    score += spec.총점;
  }

  // Bonus for higher ranking (lower 순위 number = better)
  if (spec.순위 !== null && spec.순위 !== undefined && spec.총제품수) {
    const rankingScore = ((spec.총제품수 - spec.순위 + 1) / spec.총제품수) * 20;
    score += rankingScore;
  }

  // Bonus for review count (if provided)
  if (reviewCount) {
    const reviewBonus = Math.log10(reviewCount + 1) * 5; // Logarithmic scale
    score += reviewBonus;
  }

  return score;
}

/**
 * Get top N products by popularity
 * @param specs Array of product specs
 * @param n Number of products to return
 * @param reviewCounts Optional map of productId -> review count
 */
export function getTopByPopularity(
  specs: ProductSpec[],
  n: number,
  reviewCounts?: Map<number, number>
): ProductWithReviews[] {
  const withScores = specs.map((spec) => {
    const reviewCount = reviewCounts?.get(spec.productId);
    const popularityScore = calculatePopularityScore(spec, reviewCount);

    return {
      ...spec,
      reviewCount,
      popularityScore,
    };
  });

  return withScores
    .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
    .slice(0, n);
}

/**
 * Search products by keyword
 * @param specs Array of product specs
 * @param keyword Search keyword
 */
export function searchProducts(specs: ProductSpec[], keyword: string): ProductSpec[] {
  const lowerKeyword = keyword.toLowerCase();

  return specs.filter((spec) => {
    const searchText = [
      spec.브랜드,
      spec.제품명,
      spec.모델명,
      spec.검색어,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchText.includes(lowerKeyword);
  });
}

/**
 * Get the most popular (anchor) product in a category
 * Strategy: Highest popularity score
 * @param category Category name
 * @param reviewCounts Optional review counts map
 */
export async function getAnchorProduct(
  category: Category,
  reviewCounts?: Map<number, number>
): Promise<ProductWithReviews | null> {
  const specs = await getSpecsByCategory(category);
  if (specs.length === 0) return null;

  const top = getTopByPopularity(specs, 1, reviewCounts);
  return top[0] || null;
}
