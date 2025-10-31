import { Product, UserPersona, Recommendation, AttributeAssessment } from '@/types';
import { generatePersona } from '../agents/personaGenerator';
import { evaluateMultipleProducts } from '../agents/productEvaluator';
import { generateTop3Recommendations } from '../agents/recommendationWriter';
import { selectTopProducts, filterByBudget } from '../filtering/initialFilter';
import { calculateAndRankProducts, selectTop3 } from '../filtering/scoreCalculator';

/**
 * ⚠️ DEPRECATED: This workflow is no longer used.
 * The API route (app/api/recommend/route.ts) directly calls each phase for better control.
 *
 * This file is kept for reference only.
 */

/**
 * 전체 추천 워크플로우
 *
 * 워크플로우:
 * 1. Persona Generation (페르소나 생성)
 * 2. Initial Filtering (코드 기반 Top 5 선정)
 * 3. AI Evaluation (병렬 처리로 5개 제품 평가)
 * 4. Final Scoring & Top 3 Selection (점수 계산 및 Top 3 선정)
 * 5. Recommendation Generation (병렬 처리로 추천 이유 생성)
 */

export interface WorkflowResult {
  persona: UserPersona;
  recommendations: Recommendation[];
  processingTime: number;
}

export async function runRecommendationWorkflow(
  chatHistory: string,
  allProducts: Product[],
  attributeAssessments: AttributeAssessment
): Promise<WorkflowResult> {
  const startTime = Date.now();

  console.log('🚀 Starting recommendation workflow...');

  // Phase 1: Persona Generation
  console.log('📝 Phase 1: Generating persona...');
  const persona = await generatePersona(chatHistory, attributeAssessments);
  console.log(`✓ Persona generated: ${persona.summary}`);

  // Phase 2: Budget Filtering (optional)
  let filteredProducts = allProducts;
  if (persona.budget) {
    filteredProducts = filterByBudget(allProducts, persona.budget);
    console.log(`💰 Budget filter applied: ${filteredProducts.length} products remain`);
  }

  // Phase 3: Initial Filtering (Code-based Top 5)
  console.log('🔍 Phase 2: Calculating fit scores and selecting Top 5...');
  const top5Products = selectTopProducts(filteredProducts, persona, 5);
  console.log(`✓ Top 5 candidates selected`);
  console.log(
    top5Products.map((p, i) => `  ${i + 1}. ${p.title} (fit: ${p.fitScore})`).join('\n')
  );

  // Phase 4: AI Evaluation (병렬 처리 - 가장 시간 많이 걸리는 부분)
  console.log('🤖 Phase 3: Evaluating Top 5 products in parallel...');
  const evaluations = await evaluateMultipleProducts(
    top5Products.map((p) => ({ ...p })),
    persona
  );
  console.log(`✓ All 5 products evaluated`);

  // Phase 5: Final Scoring & Top 3 Selection
  console.log('🎯 Phase 4: Calculating final scores and selecting Top 3...');
  const rankedProducts = calculateAndRankProducts(
    top5Products.map(p => ({ ...p })),
    evaluations,
    persona
  );
  const top3WithScores = selectTop3(rankedProducts);
  console.log(`✓ Top 3 finalized`);
  console.log(
    top3WithScores
      .map((p, i) => `  ${i + 1}. ${p.product.title} (${p.finalScore}%)`)
      .join('\n')
  );

  // Phase 6: Recommendation Generation (병렬 처리)
  console.log('✍️  Phase 5: Generating personalized recommendations in parallel...');
  const recommendations = await generateTop3Recommendations(top3WithScores, persona);
  console.log(`✓ Recommendations generated`);

  const processingTime = Date.now() - startTime;
  console.log(`🎉 Workflow completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    persona,
    recommendations,
    processingTime,
  };
}

/**
 * 워크플로우 속도 최적화 버전 (Reflection 제거)
 *
 * 속도 우선 버전으로, Persona Reflection과 Evaluation Validation을 생략합니다.
 */
export async function runFastRecommendationWorkflow(
  chatHistory: string,
  allProducts: Product[],
  attributeAssessments: AttributeAssessment
): Promise<WorkflowResult> {
  // 동일한 로직이지만 Reflection 없이 빠르게 처리
  return runRecommendationWorkflow(chatHistory, allProducts, attributeAssessments);
}
