import { Product, UserPersona, CoreValues } from '@/types';

// Hard constraints 적용 - 극단적 케이스 필터링
export function applyHardConstraints(
  products: Product[],
  persona: UserPersona
): Product[] {
  return products.filter((product) => {
    // Constraint 1: 최우선 속성은 최소 7점 이상
    const topPriorityAttr = getTopPriorityAttribute(persona);
    if (product.coreValues[topPriorityAttr] < 7) {
      return false;
    }

    // Constraint 2: 예산 설정이 있는 경우 초과 제품 제거
    if (persona.budget && product.price > persona.budget * 1.2) {
      return false;
    }

    // Constraint 3: 맥락 기반 필수 조건
    // 야간 수유가 중요한 경우 온도조절 성능 필수
    if (
      persona.contextualNeeds.some(
        (need) => need.includes('야간') || need.includes('새벽')
      ) &&
      product.coreValues.temperatureControl < 8
    ) {
      return false;
    }

    // 여행/외출이 중요한 경우 휴대성 필수
    if (
      persona.contextualNeeds.some(
        (need) => need.includes('여행') || need.includes('외출') || need.includes('휴대')
      ) &&
      product.coreValues.portability < 7
    ) {
      return false;
    }

    // 쌍둥이의 경우 용량 고려 (제목에서 대용량 또는 1.5L 이상 확인)
    if (persona.contextualNeeds.some((need) => need.includes('쌍둥이'))) {
      // 용량 정보는 제목이나 별도 필드에서 확인 필요
      // 현재는 usability 점수로 대체
      if (product.coreValues.usability < 7) {
        return false;
      }
    }

    return true;
  });
}

// 최우선 속성 찾기
function getTopPriorityAttribute(persona: UserPersona): keyof CoreValues {
  const weights = persona.coreValueWeights;
  let maxWeight = 0;
  let topAttr: keyof CoreValues = 'temperatureControl';

  (Object.keys(weights) as Array<keyof CoreValues>).forEach((attr) => {
    if (weights[attr] > maxWeight) {
      maxWeight = weights[attr];
      topAttr = attr;
    }
  });

  return topAttr;
}

// 가중치 기반 적합도 점수 계산
export function calculateFitScore(
  product: Product,
  persona: UserPersona
): number {
  const weights = persona.coreValueWeights;
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

// Top N 제품 선정
export function selectTopProducts(
  products: Product[],
  persona: UserPersona,
  topN: number = 5
): Array<{ product: Product; score: number }> {
  // 1. Hard constraints 적용
  const filteredProducts = applyHardConstraints(products, persona);

  // 2. 적합도 점수 계산
  const scoredProducts = filteredProducts.map((product) => ({
    product,
    score: calculateFitScore(product, persona),
  }));

  // 3. 점수 순으로 정렬하고 Top N 선정
  return scoredProducts
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(topN, scoredProducts.length));
}
