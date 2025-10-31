import { Product, UserPersona, ProductEvaluation, EvaluationGrade } from '@/types';

/**
 * Phase 3: Initial Filtering (Code-based)
 *
 * 페르소나 가중치를 사용하여 제품들의 fit score를 계산하고 Top 5 선택
 */

/**
 * 평가 등급을 숫자로 변환
 */
export function gradeToScore(grade: EvaluationGrade): number {
  const gradeMap: Record<EvaluationGrade, number> = {
    '매우 충족': 5,
    '충족': 4,
    '보통': 3,
    '미흡': 2,
    '매우 미흡': 1,
  };
  return gradeMap[grade];
}

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
  console.log(`🔍 Calculating fit scores for ${products.length} products...`);

  // 각 제품에 fit score 계산
  const productsWithScores = products.map((product) => ({
    ...product,
    fitScore: calculateFitScore(product, persona),
  }));

  // 점수 기준으로 내림차순 정렬
  productsWithScores.sort((a, b) => b.fitScore - a.fitScore);

  // Top N 선택
  const topProducts = productsWithScores.slice(0, topN);

  console.log(`✓ Top ${topN} products selected by fit score:`);
  topProducts.forEach((p, i) => {
    console.log(`  ${i + 1}. [Score: ${Math.round(p.fitScore)}] ${p.title.substring(0, 50)}`);
  });

  return topProducts;
}

/**
 * 가격 필터링 (옵션)
 */
export function filterByBudget(products: Product[], maxBudget?: number | null): Product[] {
  if (!maxBudget) {
    console.log(`💰 No budget filter applied (${products.length} products)`);
    return products;
  }

  const filtered = products.filter((product) => product.price <= maxBudget);
  console.log(`💰 Budget filter applied (${maxBudget.toLocaleString()}원): ${products.length} → ${filtered.length} products`);

  return filtered;
}

/**
 * 최종 적합도 점수 계산 (0-100%)
 *
 * 계산식:
 * 1. 각 속성 평가 grade를 1-5 점수로 변환
 * 2. 각 점수에 페르소나 가중치를 곱함
 * 3. overallScore(1-5)도 추가 가중치로 반영
 * 4. 정규화하여 0-100% 범위로 변환
 */
export function calculateFinalScore(
  evaluation: ProductEvaluation,
  persona: UserPersona
): number {
  const weights = persona.coreValueWeights;

  // 1. 각 속성별 점수 계산 (grade * weight)
  let weightedSum = 0;
  let totalWeight = 0;

  evaluation.evaluations.forEach((evalItem) => {
    const score = gradeToScore(evalItem.grade);
    const weight = weights[evalItem.attribute];
    weightedSum += score * weight;
    totalWeight += weight;
  });

  // 2. 평균 점수 계산 (1-5 범위)
  const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 3. overallScore 반영 (30% 가중치)
  const combinedScore = avgScore * 0.7 + evaluation.overallScore * 0.3;

  // 4. 0-100% 범위로 정규화 (5점 만점 기준)
  const finalScore = (combinedScore / 5) * 100;

  return Math.round(finalScore);
}

/**
 * Top 3 선정
 *
 * 평가된 제품들을 최종 점수 기준으로 정렬하여 Top 3 선택
 */
export function selectTop3(
  evaluatedProducts: Array<{
    product: Product;
    evaluation: ProductEvaluation;
  }>,
  persona: UserPersona
): Array<{
  product: Product;
  evaluation: ProductEvaluation;
  finalScore: number;
}> {
  // 각 제품에 최종 점수 계산
  const productsWithFinalScores = evaluatedProducts.map((item) => ({
    ...item,
    finalScore: calculateFinalScore(item.evaluation, persona),
  }));

  // 최종 점수 기준 내림차순 정렬
  productsWithFinalScores.sort((a, b) => b.finalScore - a.finalScore);

  // Top 3 반환
  return productsWithFinalScores.slice(0, 3);
}
