import { Product, UserPersona, ProductEvaluation, EvaluationGrade } from '@/types';

/**
 * Phase 5: Final Score Calculation
 *
 * AI 평가 등급을 수치로 변환하고 페르소나 가중치를 곱하여 최종 점수 계산
 * 최종 점수는 0-100% 범위로 정규화
 */

// 평가 등급을 수치로 변환
const GRADE_TO_SCORE: Record<EvaluationGrade, number> = {
  '매우 충족': 10,
  '충족': 8,
  '보통': 6,
  '미흡': 4,
  '매우 미흡': 2,
};

/**
 * 단일 속성의 가중 점수 계산
 */
function calculateAttributeScore(grade: EvaluationGrade, weight: number): number {
  const baseScore = GRADE_TO_SCORE[grade];
  return baseScore * weight;
}

/**
 * 최종 적합도 점수 계산 (0-100% 범위)
 *
 * 1. 각 속성의 평가 등급을 수치로 변환 (2-10)
 * 2. 페르소나 가중치(1-10)를 곱함
 * 3. overallScore(1-5)를 추가 가중치로 반영 (30%)
 * 4. 합산한 점수를 정규화하여 0-100% 범위로 변환
 *
 * 최대 가능 점수: 10 (매우 충족) × 10 (최대 가중치) × 8 (속성 수) = 800
 * 최소 가능 점수: 2 (매우 미흡) × 1 (최소 가중치) × 8 (속성 수) = 16
 */
export function calculateFinalScore(
  evaluation: ProductEvaluation,
  persona: UserPersona
): number {
  const weights = persona.coreValueWeights;
  let totalScore = 0;
  let maxPossibleScore = 0;

  // 각 속성별 가중 점수 계산
  for (const attrEval of evaluation.evaluations) {
    const attribute = attrEval.attribute;
    const grade = attrEval.grade;
    const weight = weights[attribute];

    totalScore += calculateAttributeScore(grade, weight);
    maxPossibleScore += 10 * weight; // 최대 점수 (매우 충족 기준)
  }

  // 0-100% 범위로 정규화
  const attributeScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

  // overallScore를 0-100 범위로 변환 (1-5 -> 0-100)
  const overallScoreNormalized = ((evaluation.overallScore - 1) / 4) * 100;

  // 속성 점수 70% + 전체 점수 30% 가중 평균
  const finalScore = attributeScore * 0.7 + overallScoreNormalized * 0.3;

  return Math.round(finalScore); // 정수로 반올림
}

/**
 * 여러 제품의 최종 점수를 계산하고 정렬
 */
export interface ProductWithScore {
  product: Product;
  evaluation: ProductEvaluation;
  finalScore: number; // 0-100%
}

export function calculateAndRankProducts(
  products: Product[],
  evaluations: ProductEvaluation[],
  persona: UserPersona
): ProductWithScore[] {
  console.log(`🧮 Calculating final scores for ${products.length} products...`);

  // 제품과 평가를 매칭하여 점수 계산
  const productsWithScores: ProductWithScore[] = products.map((product) => {
    const evaluation = evaluations.find(e => e.productId === product.id);

    if (!evaluation) {
      throw new Error(`Evaluation not found for product ${product.id}`);
    }

    const finalScore = calculateFinalScore(evaluation, persona);

    console.log(`  [${finalScore}%] ${product.title.substring(0, 50)}`);

    return {
      product,
      evaluation,
      finalScore,
    };
  });

  // 점수 기준 내림차순 정렬
  productsWithScores.sort((a, b) => b.finalScore - a.finalScore);

  console.log(`✓ Products ranked by final score`);

  return productsWithScores;
}

/**
 * Top 3 제품 선택
 */
export function selectTop3(productsWithScores: ProductWithScore[]): ProductWithScore[] {
  const top3 = productsWithScores.slice(0, 3);

  console.log(`🏆 Top 3 products selected:`);
  top3.forEach((p, i) => {
    console.log(`  ${i + 1}위. [${p.finalScore}%] ${p.product.title.substring(0, 50)}`);
  });

  return top3;
}
