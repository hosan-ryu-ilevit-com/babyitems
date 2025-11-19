import { NextRequest } from 'next/server';
import { generatePersona, generatePersonaFromPriorityWithChat } from '@/lib/agents/personaGenerator';
import { evaluateMultipleProducts } from '@/lib/agents/productEvaluator';
import { generateTop3Recommendations } from '@/lib/agents/recommendationWriter';
import { generateContextSummary, generateContextSummaryFromPriorityWithChat } from '@/lib/agents/contextSummaryGenerator';
import { loadAllProducts } from '@/lib/data/productLoader';
import { selectTopProducts, filterByBudget } from '@/lib/filtering/initialFilter';
import { calculateAndRankProducts, selectTop3 } from '@/lib/filtering/scoreCalculator';
import { Message, PrioritySettings, BudgetRange, AttributeConversation, UserContextSummary } from '@/types';
import { generateTagContext, convertTagsToContextualNeeds } from '@/lib/utils/tagContext';

/**
 * POST /api/recommend
 *
 * 간소화된 추천 워크플로우 (스트리밍 방식)
 * 1. Persona Generation (Reflection 제거)
 * 2. Initial Filtering (Code-based Top 5)
 * 3. Product Evaluation (병렬 처리, Validation 제거)
 * 4. Final Score Calculation (overallScore 반영)
 * 5. Recommendation Generation (병렬 처리)
 */
export async function POST(request: NextRequest) {
  // request body를 먼저 읽어서 저장 (스트림 시작 전에 읽어야 함)
  const body = await request.json();
  const {
    messages,
    attributeAssessments,
    prioritySettings,
    budget,
    isQuickRecommendation,
    phase0Context,
    existingContextSummary,
    selectedProsTags,
    selectedConsTags
  } = body as {
    messages: Message[];
    attributeAssessments?: Record<string, string | null>;
    prioritySettings?: PrioritySettings;
    budget?: BudgetRange;
    isQuickRecommendation?: boolean;
    chatConversations?: AttributeConversation[];
    phase0Context?: string;
    existingContextSummary?: UserContextSummary;
    selectedProsTags?: string[];
    selectedConsTags?: string[];
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 진행 상황 전송 헬퍼 함수
      const sendProgress = (phase: string, progress: number, message: string) => {
        const data = JSON.stringify({ phase, progress, message });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        console.log(`[${progress}%] ${phase}: ${message}`);
      };

      const sendError = (error: string) => {
        const data = JSON.stringify({ error });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const sendComplete = (result: { persona: unknown; recommendations: unknown; contextSummary: unknown }) => {
        const data = JSON.stringify({ type: 'complete', ...result });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        console.log('\n=== API /recommend called ===');
        console.log('Request body:', {
          messagesLength: messages?.length,
          hasAttributeAssessments: !!attributeAssessments,
          hasPrioritySettings: !!prioritySettings,
          budget,
          isQuickRecommendation,
          phase0Context: phase0Context?.substring(0, 50) || 'none'
        });

        if (!messages || !Array.isArray(messages)) {
          console.error('❌ Invalid messages format');
          sendError('Invalid messages format');
          controller.close();
          return;
        }

        // Validation: attributeAssessments는 대화형 플로우에서만 필수
        if (!isQuickRecommendation && !attributeAssessments) {
          console.error('❌ Missing attributeAssessments for conversation-based recommendation');
          sendError('Missing attributeAssessments for conversation-based recommendation');
          controller.close();
          return;
        }

        // Validation: Quick recommendation에는 prioritySettings와 budget 필요
        if (isQuickRecommendation && !prioritySettings) {
          console.error('❌ Missing prioritySettings for quick recommendation');
          console.log('Priority Settings received:', prioritySettings);
          sendError('Missing prioritySettings for quick recommendation');
          controller.close();
          return;
        }

        // Phase 2: Persona Generation + Context Summary (병렬 처리) (0-20%)
        sendProgress('persona', 5, '고객님의 니즈를 분석하고 있습니다...');

        console.log('\n=== Phase 2: Persona Generation + Context Summary (Parallel) ===');
        console.log('Is Quick Recommendation:', isQuickRecommendation);
        console.log('Has Priority Settings:', !!prioritySettings);
        console.log('Budget:', budget);

        let persona;
        let contextSummary;
        const personaStartTime = Date.now();

        // Priority 플로우: Priority 설정 + Chat 이력 (선택적)
        if (prioritySettings) {
          console.log('📊 Using Priority-based persona generation (with optional chat enhancement)');
          sendProgress('persona', 10, '선택하신 기준을 분석하고 있습니다...');

          // 태그를 contextualNeeds로 직접 변환 (LLM 호출 스킵)
          let tagContextualNeeds: string[] | undefined;
          if (selectedProsTags && selectedProsTags.length > 0) {
            tagContextualNeeds = convertTagsToContextualNeeds(
              selectedProsTags,
              selectedConsTags || []
            );
            console.log('🏷️  Tag-based contextual needs:', tagContextualNeeds.length, 'items');
          }

          // Chat 이력 + phase0Context 준비 (태그는 제외 - 이미 contextualNeeds로 변환됨)
          let chatHistory: string | undefined;

          // 실제 대화 이력만 포함
          if (messages && messages.length > 0) {
            chatHistory = messages
              .map((msg: Message) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
              .join('\n\n');
          }

          // phase0Context만 chatHistory에 포함 (있으면)
          if (phase0Context) {
            const contextPrefix = `사용자의 추가 요청사항: ${phase0Context}`;
            chatHistory = chatHistory ? `${contextPrefix}\n\n${chatHistory}` : contextPrefix;
          }

          console.log('Priority settings:', prioritySettings);
          console.log('Budget:', budget);
          console.log('Chat history length:', chatHistory?.length || 0);
          console.log('Phase0 context:', phase0Context?.substring(0, 100) || 'none');
          console.log('Will skip LLM for Persona Profile:', !chatHistory || chatHistory.trim().length <= 50);

          // Persona와 Context Summary를 병렬로 생성
          [persona, contextSummary] = await Promise.all([
            generatePersonaFromPriorityWithChat(prioritySettings, budget, chatHistory, tagContextualNeeds),
            generateContextSummaryFromPriorityWithChat(
              prioritySettings,
              budget,
              messages,
              phase0Context,
              existingContextSummary,
              {
                pros: selectedProsTags,
                cons: selectedConsTags,
                additional: [] // ADDITIONAL_TAGS는 현재 사용 안 함
              }
            )
          ]);

        } else if (attributeAssessments) {
          // DEPRECATED: 기존 플로우 (attributeAssessments 기반)
          console.log('⚠️  Using DEPRECATED conversation-based persona generation');
          sendProgress('persona', 10, 'AI가 대화를 분석하고 있습니다...');

          const chatHistory = messages
            .map((msg: Message) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
            .join('\n\n');

          persona = await generatePersona(chatHistory, attributeAssessments as unknown as import('@/types').AttributeAssessment);
          // Context Summary는 나중에 생성 (DEPRECATED 플로우에서는 기존 방식 유지)

        } else {
          console.error('❌ Missing both prioritySettings and attributeAssessments');
          sendError('Missing both prioritySettings and attributeAssessments');
          controller.close();
          return;
        }

        console.log(`✓ Persona${contextSummary ? ' + Context Summary' : ''} generated in ${Date.now() - personaStartTime}ms`);
        console.log('Summary:', persona.summary);
        console.log('Weights:', persona.coreValueWeights);
        console.log('Budget:', persona.budget);
        if (contextSummary) {
          console.log('Context Summary generated in parallel:', contextSummary.priorityAttributes.length, 'attributes');
        }

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

        // Phase 4: Product Evaluation (35-60%) - 병렬 처리로 속도 최적화
        sendProgress('evaluation', 40, 'AI가 5개 제품을 동시에 평가하고 있습니다...');

        console.log('\n=== Phase 4: Product Evaluation (Parallel) ===');
        const evalStartTime = Date.now();
        const evaluations = await evaluateMultipleProducts(top5Products, persona);
        console.log(`✓ All 5 products evaluated in parallel in ${Date.now() - evalStartTime}ms`);
        console.log('Evaluation count:', evaluations.length);

        sendProgress('evaluation', 60, '제품 평가 완료');

        // Phase 5: Final Score Calculation (60-70%) - 빠른 코드 기반 계산
        sendProgress('scoring', 65, '최종 점수를 계산하고 있습니다...');

        console.log('\n=== Phase 5: Final Score Calculation (with overallScore) ===');
        const rankedProducts = calculateAndRankProducts(top5Products, evaluations, persona);
        const top3 = selectTop3(rankedProducts);
        console.log('✓ Final scores calculated (70% attributes + 30% overallScore)');
        console.log('Top 3:');
        top3.forEach((p, i) => {
          console.log(`  ${i + 1}. [${p.finalScore}%] ${p.product.title.substring(0, 40)}`);
        });

        sendProgress('scoring', 70, 'Top 3 제품 선정 완료');

        // Phase 6: Recommendation Generation (70-100%)
        sendProgress('recommendation', 75, 'Top 3 제품에 대한 맞춤 추천 이유를 작성하고 있습니다...');

        console.log('\n=== Phase 6: Recommendation Generation ===');
        const finalStartTime = Date.now();

        let recommendations;

        // Priority 플로우: Context Summary는 이미 Phase 2에서 생성됨, Recommendation만 생성
        if (prioritySettings && contextSummary) {
          console.log('📊 Priority flow: generating recommendations only (context summary already done)');
          recommendations = await generateTop3Recommendations(top3, persona);

        } else if (attributeAssessments) {
          // DEPRECATED 플로우: Recommendation과 Context Summary를 병렬로 생성 (기존 방식)
          console.log('⚠️  DEPRECATED flow: generating recommendations + context summary in parallel');
          [recommendations, contextSummary] = await Promise.all([
            generateTop3Recommendations(top3, persona),
            generateContextSummary(messages, attributeAssessments as unknown as import('@/types').AttributeAssessment)
          ]);

        } else {
          console.error('❌ Invalid flow state');
          sendError('Invalid flow state');
          controller.close();
          return;
        }

        console.log(`✓ Recommendations generated in ${Date.now() - finalStartTime}ms`);
        console.log('Recommendation count:', recommendations.length);
        console.log('Context summary priority attributes:', contextSummary!.priorityAttributes.length);

        sendProgress('recommendation', 100, '추천 완료!');

        console.log('\n=== Workflow Complete ===');
        console.log('Total recommendations:', recommendations.length);

        // 최종 결과 전송
        sendComplete({
          persona,
          recommendations,
          contextSummary,
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
