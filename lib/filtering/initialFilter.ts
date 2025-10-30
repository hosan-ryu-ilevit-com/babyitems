import { Product, UserPersona, CoreValues } from '@/types';

/**
 * Phase 3: Initial Filtering (Code-based)
 *
 * 페르소나 가중치를 사용하여 제품들의 fit score를 계산하고 Top 5 선택
 */

/**
 * Fit Score 계산
 *
 * score = sum(product.coreValues[i] * persona.weights[i])
 */
export function calculateFitScore(product: Product, persona: UserPersona): number {
  const weights = persona.coreValueWeights;
  const values = product.coreValues;

  let score = 0;

  // 각 속성에 대해 가중치 * 제품 값을 합산
  score += values.temperatureControl * weights.temperatureControl;
  score += values.hygiene * weights.hygiene;
  score += values.material * weights.material;
  score += values.usability * weights.usability;
  score += values.portability * weights.portability;
  score += values.priceValue * weights.priceValue;
  score += values.durability * weights.durability;
  score += values.additionalFeatures * weights.additionalFeatures;

  return score;
}

/**
 * 제품 리스트에서 Top N 선택
 */
export function selectTopProducts(
  products: Product[],
  persona: UserPersona,
  topN: number = 5
): Array<Product & { fitScore: number }> {
  // 각 제품에 fit score 계산
  const productsWithScores = products.map((product) => ({
    ...product,
    fitScore: calculateFitScore(product, persona),
  }));

  // 점수 기준으로 내림차순 정렬
  productsWithScores.sort((a, b) => b.fitScore - a.fitScore);

  // Top N 선택
  return productsWithScores.slice(0, topN);
}

/**
 * 가격 필터링 (옵션)
 */
export function filterByBudget(products: Product[], maxBudget?: number | null): Product[] {
  if (!maxBudget) return products;

  return products.filter((product) => product.price <= maxBudget);
}
