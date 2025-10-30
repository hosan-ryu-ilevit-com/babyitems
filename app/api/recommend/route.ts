import { NextRequest } from 'next/server';
import { generatePersona } from '@/lib/agents/personaGenerator';
import { evaluateMultipleProducts } from '@/lib/agents/productEvaluator';
import { validateMultipleEvaluations } from '@/lib/agents/evaluationValidator';
import { generateTop3Recommendations } from '@/lib/agents/recommendationWriter';
import { loadAllProducts } from '@/lib/data/productLoader';
import { selectTopProducts, filterByBudget } from '@/lib/filtering/initialFilter';
import { calculateAndRankProducts, selectTop3 } from '@/lib/filtering/scoreCalculator';
import { Message } from '@/types';

/**
 * POST /api/recommend
 *
 * Phase 2-6: 전체 추천 워크플로우 실행 (스트리밍 방식)
 * 1. Persona Generation + Reflection
 * 2. Initial Filtering (Code-based)
 * 3. Product Evaluation + Validation
 * 4. Final Score Calculation
 * 5. Recommendation Generation
 */
export async function POST(request: NextRequest) {
  // request body를 먼저 읽어서 저장 (스트림 시작 전에 읽어야 함)
  const body = await request.json();
  const { messages, attributeAssessments } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 진행 상황 전송 헬퍼 함수
      const sendProgress = (phase: string, progress: number, message: string) => {
        const data = JSON.stringify({ phase, progress, message }) + '\n';
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        console.log(`[${progress}%] ${phase}: ${message}`);
      };

      const sendError = (error: string) => {
        const data = JSON.stringify({ error }) + '\n';
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const sendComplete = (result: any) => {
        const data = JSON.stringify({ type: 'complete', ...result }) + '\n';
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {

        if (!messages || !Array.isArray(messages)) {
          sendError('Invalid messages format');
          controller.close();
          return;
        }

        // Phase 2: Persona Generation (0-20%)
        sendProgress('persona', 5, '고객님의 니즈를 분석하고 있습니다...');

        const chatHistory = messages
          .map((msg: Message) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
          .join('\n\n');

        console.log('\n=== Phase 2: Persona Generation ===');
        console.log('Chat history length:', chatHistory.length);

        const personaStartTime = Date.now();
        const persona = await generatePersona(chatHistory);
        console.log(`✓ Persona generated in ${Date.now() - personaStartTime}ms`);
        console.log('Summary:', persona.summary);
        console.log('Weights:', persona.coreValueWeights);
        console.log('Budget:', persona.budget);

        sendProgress('persona', 20, '페르소나 생성 완료');

        // Phase 3: Initial Filtering (20-35%)
        sendProgress('filtering', 25, '제품 데이터를 불러오고 있습니다...');

        console.log('\n=== Phase 3: Initial Filtering ===');
        const allProducts = await loadAllProducts();
        console.log(`Loaded ${allProducts.length} products`);

        sendProgress('filtering', 30, '예산에 맞는 제품을 선별하고 있습니다...');

        const budgetFilteredProducts = filterByBudget(allProducts, persona.budget);
        console.log(`After budget filter: ${budgetFilteredProducts.length} products`);

        const top5WithScores = selectTopProducts(budgetFilteredProducts, persona, 5);
        const top5Products = top5WithScores.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          reviewCount: p.reviewCount,
          reviewUrl: p.reviewUrl,
          ranking: p.ranking,
          thumbnail: p.thumbnail,
          coreValues: p.coreValues
        }));
        console.log('✓ Top 5 products selected:', top5Products.map(p => p.title.substring(0, 30)));

        sendProgress('filtering', 35, 'Top 5 후보 선정 완료');

        // Phase 4: Product Evaluation + Validation (35-70%)
        sendProgress('evaluation', 40, 'AI가 각 제품을 평가하고 있습니다... (1/2)');

        console.log('\n=== Phase 4: Product Evaluation ===');
        const evalStartTime = Date.now();
        const evaluations = await evaluateMultipleProducts(top5Products, persona);
        console.log(`✓ Products evaluated in ${Date.now() - evalStartTime}ms`);
        console.log('Evaluation count:', evaluations.length);

        sendProgress('evaluation', 55, 'AI가 각 제품을 평가하고 있습니다... (2/2)');

        console.log('\n=== Phase 4: Evaluation Validation ===');
        const validationStartTime = Date.now();
        const validations = await validateMultipleEvaluations(evaluations, persona);
        console.log(`✓ Evaluations validated in ${Date.now() - validationStartTime}ms`);

        const invalidEvaluations = validations.filter(v => !v.isValid);
        if (invalidEvaluations.length > 0) {
          console.log(`⚠️ ${invalidEvaluations.length} evaluations flagged for review`);
          invalidEvaluations.forEach(inv => {
            console.log(`  - Product ${inv.productId}:`, inv.invalidEvaluations);
          });
        }

        sendProgress('evaluation', 70, '제품 평가 완료');

        // Phase 5: Final Score Calculation (70-80%)
        sendProgress('scoring', 75, '최종 점수를 계산하고 있습니다...');

        console.log('\n=== Phase 5: Final Score Calculation ===');
        const rankedProducts = calculateAndRankProducts(top5Products, evaluations, persona);
        const top3 = selectTop3(rankedProducts);
        console.log('✓ Final scores calculated');
        console.log('Top 3:');
        top3.forEach((p, i) => {
          console.log(`  ${i + 1}. [${p.finalScore}%] ${p.product.title.substring(0, 40)}`);
        });

        sendProgress('scoring', 80, 'Top 3 제품 선정 완료');

        // Phase 6: Recommendation Generation (80-100%)
        sendProgress('recommendation', 85, '개인 맞춤형 추천 이유를 작성하고 있습니다...');

        console.log('\n=== Phase 6: Recommendation Generation ===');
        const recStartTime = Date.now();
        const recommendations = await generateTop3Recommendations(top3, persona);
        console.log(`✓ Recommendations generated in ${Date.now() - recStartTime}ms`);
        console.log('Recommendation count:', recommendations.length);

        sendProgress('recommendation', 100, '추천 완료!');

        console.log('\n=== Workflow Complete ===');
        console.log('Total recommendations:', recommendations.length);

        // 최종 결과 전송
        sendComplete({
          persona,
          recommendations,
        });

        controller.close();
      } catch (error) {
        console.error('\n=== Recommendation API Error ===');
        console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
        console.error('Error message:', error instanceof Error ? error.message : String(error));
        console.error('Stack trace:', error instanceof Error ? error.stack : 'N/A');

        sendError(`Failed to generate recommendation: ${error instanceof Error ? error.message : String(error)}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
