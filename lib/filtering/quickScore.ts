import { Product, PrioritySettings, BudgetRange } from '@/types';

/**
 * Quick Score Calculator for Step 3 Product Preview
 *
 * 사용자의 Priority 설정과 예산을 기반으로 빠르게 상위 10개 제품을 선택합니다.
 * Persona 생성 없이 직접 Priority level을 가중치로 변환하여 사용합니다.
 */

/**
 * Priority level을 가중치로 변환
 * high → 10, medium → 7, low → 5
 */
function priorityToWeight(priority?: 'low' | 'medium' | 'high'): number {
  if (!priority) return 5; // default: low
  switch (priority) {
    case 'high':
      return 10;
    case 'medium':
      return 7;
    case 'low':
      return 5;
    default:
      return 5;
  }
}

/**
 * Budget 범위를 최대 가격으로 변환
 */
function budgetToMaxPrice(budget: BudgetRange): number | null {
  switch (budget) {
    case '0-50000':
      return 50000;
    case '0-100000':
      return 100000;
    case '0-150000':
      return 150000;
    case '150000+':
      return null; // no limit
    default:
      // 커스텀 예산 (숫자 문자열)
      const parsed = parseInt(budget, 10);
      return isNaN(parsed) ? null : parsed;
  }
}

/**
 * Priority settings를 가중치로 변환
 * Note: priceValue는 예산으로 처리되므로 가중치는 1로 설정
 */
function settingsToWeights(settings: PrioritySettings) {
  return {
    temperatureControl: priorityToWeight(settings.temperatureControl),
    hygiene: priorityToWeight(settings.hygiene),
    material: priorityToWeight(settings.material),
    usability: priorityToWeight(settings.usability),
    portability: priorityToWeight(settings.portability),
    priceValue: 1, // 예산으로 처리되므로 낮은 가중치
    durability: 5, // UI에서 설정 안 됨, 기본값
    additionalFeatures: priorityToWeight(settings.additionalFeatures),
  };
}

/**
 * 제품의 적합도 점수 계산
 */
function calculateQuickScore(
  product: Product,
  weights: ReturnType<typeof settingsToWeights>
): number {
  const values = product.coreValues;

  let score = 0;
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
 * 예산 내 제품 필터링
 */
function filterByBudget(products: Product[], budget: BudgetRange): Product[] {
  const maxPrice = budgetToMaxPrice(budget);

  if (maxPrice === null) {
    return products; // no budget limit
  }

  return products.filter((p) => p.price <= maxPrice);
}

export interface ScoredProduct extends Product {
  fitScore: number;
}

/**
 * Quick scoring: Priority + Budget 기반으로 Top 10 제품 선택
 *
 * @param allProducts - 전체 제품 리스트
 * @param prioritySettings - 사용자가 선택한 Priority 설정
 * @param budget - 예산 범위
 * @param tagContext - 선택된 장점/단점 태그 컨텍스트 (optional, 세션 저장용)
 * @returns Top 10 scored products
 */
export function calculateQuickTop10(
  allProducts: Product[],
  prioritySettings: PrioritySettings,
  budget: BudgetRange,
  tagContext?: string
): ScoredProduct[] {
  console.log('🚀 Quick Score: Calculating top 10 products...');
  console.log('  Priority settings:', prioritySettings);
  console.log('  Budget:', budget);

  // 1. 예산 필터링
  const budgetFiltered = filterByBudget(allProducts, budget);
  console.log(`  💰 Budget filter: ${allProducts.length} → ${budgetFiltered.length} products`);

  if (budgetFiltered.length === 0) {
    console.warn('⚠️ No products within budget!');
    return [];
  }

  // 2. Priority를 가중치로 변환
  const weights = settingsToWeights(prioritySettings);
  console.log('  ⚖️ Weights:', weights);

  // 3. 점수 계산
  const scored = budgetFiltered.map((product) => ({
    ...product,
    fitScore: calculateQuickScore(product, weights),
  }));

  // 4. 점수 기준 내림차순 정렬
  scored.sort((a, b) => b.fitScore - a.fitScore);

  // 5. Top 10 선택
  const top10 = scored.slice(0, 10);

  console.log('✅ Top 10 products:');
  top10.forEach((p, i) => {
    console.log(`  ${i + 1}. [Score: ${Math.round(p.fitScore)}] ${p.title.substring(0, 40)}... (${p.price.toLocaleString()}원)`);
  });

  return top10;
}

/**
 * 가격 기준으로 정렬 (낮은 가격순)
 */
export function sortByPrice(products: ScoredProduct[]): ScoredProduct[] {
  return [...products].sort((a, b) => a.price - b.price);
}

/**
 * 적합도 기준으로 정렬 (높은 점수순)
 */
export function sortByScore(products: ScoredProduct[]): ScoredProduct[] {
  return [...products].sort((a, b) => b.fitScore - a.fitScore);
}
