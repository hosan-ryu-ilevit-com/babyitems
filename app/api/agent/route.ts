/**
 * Agent API Endpoint
 *
 * Unified agent endpoint with SSE streaming
 * Handles: REFILTER_WITH_ANCHOR, REFILTER, PRODUCT_QA, COMPARE, GENERAL
 */

import { NextRequest } from 'next/server';
import type { AgentRequest } from '@/lib/agents/types';
import { classifyIntent } from '@/lib/agents/intentRouter';
import { executeRefilterWithAnchor } from '@/lib/agents/tools/refilterWithAnchor';
import { executeProductQA } from '@/lib/agents/tools/productQA';
import { executeCompare } from '@/lib/agents/tools/compare';
import { executeGeneral } from '@/lib/agents/tools/general';
import { CLARIFICATION_PROMPTS } from '@/lib/agents/systemPrompt';
import { needsBudgetClarification, parseBudgetFromNaturalLanguage } from '@/lib/agents/utils/budgetAdjustment';

/**
 * POST /api/agent
 *
 * SSE streaming endpoint for agent responses
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request
        const body: AgentRequest = await req.json();
        const { userInput, sessionId, context, anchorProductId } = body;

        console.log(`\n🤖 Agent API: New request`);
        console.log(`   Session: ${sessionId}`);
        console.log(`   Input: "${userInput}"`);
        console.log(`   Anchor ID: ${anchorProductId || 'none'}`);

        // Helper: Send SSE message
        const sendSSE = (type: string, data: any) => {
          const message = `data: ${JSON.stringify({ type, data })}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Step 1: Classify intent
        sendSSE('thinking', 'Analyzing your request...');

        const intent = await classifyIntent(userInput, context, anchorProductId);

        sendSSE('intent', {
          tool: intent.tool,
          confidence: intent.confidence,
        });

        console.log(`   Intent: ${intent.tool} (${intent.confidence}% confidence)`);

        // Step 2: Handle ASK_CLARIFICATION
        if (intent.tool === 'ASK_CLARIFICATION') {
          const clarificationMsg = intent.args?.clarificationQuestion ||
            CLARIFICATION_PROMPTS.budget(context.currentSession.budget);

          sendSSE('clarification', clarificationMsg);
          sendSSE('done', {});
          controller.close();
          return;
        }

        // Step 3: Execute tool
        sendSSE('thinking', 'Processing...');

        switch (intent.tool) {
          case 'REFILTER_WITH_ANCHOR': {
            const result = await executeRefilterWithAnchor(intent, context);

            if (!result.success) {
              sendSSE('error', result.error || 'Failed to refilter');
              sendSSE('done', {});
              controller.close();
              return;
            }

            // Send message
            sendSSE('message', result.message);

            // Send new recommendations
            if (result.recommendations) {
              sendSSE('recommendations', {
                recommendations: result.recommendations,
                updatedSession: result.updatedSession,
              });
            }

            break;
          }

          case 'REFILTER': {
            // Similar to REFILTER_WITH_ANCHOR but without changing anchor
            // Keep existing anchor by passing current anchor ID
            if (!context.currentSession.anchorProduct?.productId) {
              sendSSE('error', '죄송해요, 기준 제품 정보를 찾을 수 없어요. 처음부터 다시 시작해주세요.');
              sendSSE('done', {});
              controller.close();
              return;
            }

            // Add current anchor ID to intent args (convert to string)
            if (!intent.args) intent.args = {};
            intent.args.newAnchorProductId = String(context.currentSession.anchorProduct.productId);

            const result = await executeRefilterWithAnchor(intent, context);

            if (!result.success) {
              sendSSE('error', result.error || 'Failed to refilter');
              sendSSE('done', {});
              controller.close();
              return;
            }

            sendSSE('message', result.message);

            if (result.recommendations) {
              sendSSE('recommendations', {
                recommendations: result.recommendations,
                updatedSession: result.updatedSession,
              });
            }

            break;
          }

          case 'PRODUCT_QA': {
            const result = await executeProductQA(intent, context);

            if (!result.success) {
              sendSSE('error', result.error || 'Failed to answer question');
            }

            sendSSE('message', result.answer);

            break;
          }

          case 'COMPARE': {
            const result = await executeCompare(intent, context);

            if (!result.success) {
              sendSSE('error', result.error || 'Failed to compare products');
            }

            sendSSE('message', result.comparison);

            break;
          }

          case 'GENERAL': {
            const result = await executeGeneral(intent, context, userInput);
            sendSSE('message', result.message);

            break;
          }

          default: {
            sendSSE('error', 'Unknown intent type');
            break;
          }
        }

        // Done
        sendSSE('done', {});
        controller.close();
      } catch (error) {
        console.error('Agent API error:', error);

        const message = `data: ${JSON.stringify({
          type: 'error',
          data: String(error),
        })}\n\n`;
        controller.enqueue(encoder.encode(message));

        const doneMessage = `data: ${JSON.stringify({ type: 'done', data: {} })}\n\n`;
        controller.enqueue(encoder.encode(doneMessage));

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
