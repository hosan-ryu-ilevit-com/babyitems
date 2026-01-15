/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Chat API v13 (Streaming Status Updates)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import {
  crawlDanawaSearchList,
  type DanawaSearchListItem,
  type DanawaSearchOptions
} from '@/lib/danawa/search-crawler';
import {
  getQueryCache,
  setQueryCache
} from '@/lib/knowledge-agent/cache-manager';
import { getModel, parseJSONResponse } from '@/lib/ai/gemini';

// 메모리 시스템
import { loadShortTermMemory, saveShortTermMemory } from '@/lib/knowledge-agent/memory-manager';
import type { 
  WebSearchInsight, 
  QuestionTodo
} from '@/lib/knowledge-agent/types';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';

// Vercel 서버리스 타임아웃 설정
export const maxDuration = 30;

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const MODEL_NAME = 'gemini-2.5-flash-lite';

// SSE Helpers
function formatSSEMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSSEResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ============================================================================
// Types & State
// ============================================================================

interface ToolExecution {
  tool: string;
  args: any;
  result: any;
  displayText: string;
}

interface SearchContext {
  query: string;
  insight: string;
  relevantTip: string;
  sources?: Array<{ title: string; url: string }>;
  followUpQuestion?: string;
}

type UserIntentType = 'A' | 'B' | 'C';

interface UserIntentResult {
  type: UserIntentType;
  matchedOption?: string;
  interpretation?: string;
  followUpQuestion?: string;
  suggestedSearchQuery?: string;
}

let allProducts: any[] = [];

// ============================================================================
// Tool Definitions & Execution
// ============================================================================

const tools = [
  {
    functionDeclarations: [
      {
        name: 'search_products',
        description: '조건에 맞는 상품을 검색합니다.',
        parameters: {
          type: 'object',
          properties: {
            min_price: { type: 'number' },
            max_price: { type: 'number' },
            brands: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'get_product_reviews',
        description: '특정 상품의 리뷰를 가져옵니다.',
        parameters: {
          type: 'object',
          properties: {
            pcode: { type: 'string' },
            filter: { type: 'string', enum: ['all', 'positive', 'negative'] },
            limit: { type: 'number' }
          },
          required: ['pcode']
        }
      }
    ]
  }
];

async function executeTool(name: string, args: any): Promise<ToolExecution> {
  if (name === 'search_products') {
    let filtered = [...allProducts];
    if (args.min_price) filtered = filtered.filter(p => p.price >= args.min_price);
    if (args.max_price) filtered = filtered.filter(p => p.price <= args.max_price);
    if (args.brands?.length) filtered = filtered.filter(p => args.brands.some((b: string) => p.brand?.toLowerCase().includes(b.toLowerCase())));
    filtered.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    filtered = filtered.slice(0, args.limit || 10);
    return { tool: name, args, result: filtered, displayText: `🔍 **${filtered.length}개 상품** 검색 완료` };
  }
  return { tool: name, args, result: null, displayText: `Unknown tool: ${name}` };
}

// ============================================================================
// Data Loaders
// ============================================================================

async function loadKnowledgeContext(categoryKey: string): Promise<string> {
  const indexPath = path.join(process.cwd(), 'data', 'knowledge', categoryKey, 'index.md');
  try { if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, 'utf-8'); } catch (e) {}
  return '';
}

async function getProducts(categoryKey: string, searchOptions?: Partial<DanawaSearchOptions>): Promise<any[]> {
  const query = searchOptions?.query || categoryKey;
  const cached = getQueryCache(query);
  if (cached && cached.items.length > 0) return cached.items;
  try {
    const response = await crawlDanawaSearchList({ query, limit: 40, sort: 'saveDESC' });
    if (response.success && response.items.length > 0) { setQueryCache(response); return response.items; }
  } catch (error) {}
  return [];
}

// ============================================================================
// AI Helpers
// ============================================================================

async function classifyUserIntent(userMessage: string, question: string, options: any[], categoryName: string): Promise<UserIntentResult> {
  if (!ai) return { type: 'A', matchedOption: options[0]?.label };
  const model = ai.getGenerativeModel({ model: MODEL_NAME, generationConfig: { temperature: 0.2 } });

  const optionsText = options.map((o, i) => `${i + 1}. "${o.label}"`).join('\n');
  const prompt = `당신은 "${categoryName}" 상담 챗봇입니다.

[현재 질문]: "${question}"
[선택지]:
${optionsText}
[사용자 입력]: "${userMessage}"

## 분류 기준
- **A (선택)**: 선택지 중 하나를 선택하려는 의도
  - 정확히 일치하지 않아도 의미상 매칭 가능하면 A
  - 예: "첫번째요", "위에꺼", "가벼운게 좋아요" → A

- **B (관련 질문)**: 현재 질문/선택지에 대한 추가 정보 요청
  - 선택지 간 차이 질문 → B (예: "LCD랑 LED 뭐가 달라요?")
  - 현재 질문 맥락의 조언 요청 → B (예: "뭐가 좋을까요?", "추천해줘")
  - 잘 모르겠다는 표현 → B (예: "잘 모르겠어요", "어떤게 나아요?")
  - 현재 카테고리(${categoryName}) 관련 질문 → B

- **C (무관)**: 현재 질문과 전혀 상관없는 주제
  - 완전히 다른 제품/주제 질문 → C
  - 단순 인사, 잡담 → C

⚠️ 애매하면 B로 분류 (웹서치로 도움 제공)

JSON만 응답: {"type":"A"|"B"|"C", "matchedOption":"A일때 매칭된 label", "interpretation":"사용자 의도 1줄 해석", "suggestedSearchQuery":"B일때 검색어"}`;

  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { type: 'A', matchedOption: options[0]?.label };
}

async function generateNaturalRedirect(userMessage: string, question: string, categoryName: string): Promise<string> {
  if (!ai) return `다시 질문드릴게요!\n\n${question}`;

  const model = ai.getGenerativeModel({ model: MODEL_NAME, generationConfig: { temperature: 0.5 } });
  const prompt = `사용자가 "${userMessage}"라고 했는데, 현재 "${categoryName}" 추천을 위해 "${question}"을 물어보는 중입니다.

사용자 입력이 현재 질문과 관련 없어 보입니다. 친절하고 자연스럽게 다시 질문으로 유도하는 1-2문장 응답을 작성하세요.
- 딱딱하지 않게, 공감하는 톤으로
- 사용자 입력을 부정하지 않고
- "다시 질문드릴게요" 같은 표현으로 마무리
- 이모지 1개 정도 사용 OK

응답만 출력 (설명 없이):`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    return `다시 질문드릴게요!\n\n${question}`;
  }
}

async function performContextualSearch(categoryName: string, userSelection: string, questionContext: string, dynamicSearchQuery?: string, intentType: 'A' | 'B' = 'A'): Promise<SearchContext | null> {
  if (!ai) return null;
  const searchQuery = dynamicSearchQuery || `${categoryName} ${userSelection}`;
  const model = ai.getGenerativeModel({ model: MODEL_NAME, generationConfig: { temperature: 0.3 }, tools: [{ google_search: {} } as any] });
  const prompt = intentType === 'B'
    ? `"${categoryName}" 관련 "${userSelection}" 키워드로 웹 검색하여 정보를 찾아주세요. JSON 형식: {"query":"검색어","insight":"웹에서 찾은 정보 2-3문장","relevantTip":"관련 팁","followUpQuestion":"추가질문"}`
    : `"${categoryName}" "${userSelection}" 선택에 대해 웹 검색으로 전문가 정보를 찾아주세요. JSON 형식: {"query":"검색어","insight":"웹에서 찾은 전문가 코멘트","relevantTip":"관련 팁"}`;
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const metadata = (result.response as any).candidates?.[0]?.groundingMetadata;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        query: metadata?.webSearchQueries?.[0] || parsed.query || searchQuery,
        insight: parsed.insight || '',
        relevantTip: parsed.relevantTip || '',
        sources: metadata?.groundingChunks?.filter((c:any) => c.web?.uri).map((c:any) => ({ title: c.web?.title, url: c.web?.uri })).slice(0, 3),
        followUpQuestion: parsed.followUpQuestion || ''
      };
    }
  } catch (e) {}
  return null;
}

async function normalizeSpecsForComparison(products: any[], categoryName: string): Promise<any[]> {
  if (!ai || products.length === 0) return [];
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `${categoryName} 제품들 스펙 비교표 형식 정규화 JSON: {"normalizedSpecs": [{"key":"용량", "values":{"pcode":"값"}}]} \n상품: ${JSON.stringify(products.map(p=>({pcode:p.pcode, specs:p.specSummary})))}`;
  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]).normalizedSpecs || [];
  } catch (e) {}
  return [];
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryKey: rawCategoryKey, streaming = true } = body;
    if (!rawCategoryKey) return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    const categoryKey = decodeURIComponent(rawCategoryKey);
    const searchKeyword = categoryKey;

    if (!streaming) return handleNonStreamingRequest(body, categoryKey, searchKeyword);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: any) => controller.enqueue(encoder.encode(formatSSEMessage(event, data)));
        try {
          send('status', { message: '답변 분석 및 정보 로드 중...' });
          // 클라이언트에서 전송한 products 우선 사용 (Vercel 배포 환경 호환)
          if (body.products && body.products.length > 0) {
            allProducts = body.products;
            console.log(`[Chat] Using ${allProducts.length} products from client`);
          } else {
            allProducts = await getProducts(categoryKey, { query: searchKeyword });
          }
          const response = await processChatLogic(body, categoryKey, searchKeyword, send);
          if (response) send('complete', response);
        } catch (error) {
          console.error('[Chat Stream Error]:', error);
          send('error', { message: '오류가 발생했습니다.' });
        } finally { controller.close(); }
      },
    });
    return createSSEResponse(stream);
  } catch (error) {
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}

async function processChatLogic(body: any, categoryKey: string, searchKeyword: string, sendStatus?: (ev: string, d: any) => void) {
  const { userMessage = '', questionTodos = [], collectedInfo = {}, currentQuestionId = null, phase = 'questions' } = body;
  const send = sendStatus || (() => {});

  if (phase === 'questions') {
    const updatedTodos = [...questionTodos];
    const updatedInfo = { ...collectedInfo };
    let webSearchResult: SearchContext | null = null;

    if (currentQuestionId && userMessage) {
      const todoIndex = updatedTodos.findIndex((t: any) => t.id === currentQuestionId);
      if (todoIndex >= 0) {
        const currentTodo = updatedTodos[todoIndex];
        const isExactMatch = currentTodo.options.some((o: any) => o.label === userMessage || o.value === userMessage);

        // ✅ 다중 선택 체크: 쉼표로 구분된 옵션들이 모두 유효한 옵션인지 확인
        const isMultiSelectMatch = (() => {
          if (isExactMatch) return false; // 이미 단일 매칭됨
          const selectedOptions = userMessage.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (selectedOptions.length <= 1) return false; // 다중 선택 아님
          const optionLabels = currentTodo.options.map((o: any) => o.label || o.value);
          return selectedOptions.every((sel: string) => optionLabels.includes(sel));
        })();

        send('status', { message: '사용자 의도 분석 중...' });
        let intentResult: UserIntentResult = { type: 'A', matchedOption: userMessage };
        if (!isExactMatch && !isMultiSelectMatch) intentResult = await classifyUserIntent(userMessage, currentTodo.question, currentTodo.options, searchKeyword);

        if (intentResult.type === 'C') {
          send('status', { message: '자연스러운 응답 생성 중...' });
          const naturalResponse = await generateNaturalRedirect(userMessage, currentTodo.question, searchKeyword);
          const completedCount = updatedTodos.filter((t: any) => t.completed).length;
          return { success: true, phase: 'questions', content: `${naturalResponse}\n\n${currentTodo.question}`, options: currentTodo.options.map((o:any)=>o.label), currentQuestion: currentTodo, questionTodos: updatedTodos, collectedInfo: updatedInfo, progress: { current: completedCount + 1, total: updatedTodos.length } };
        }

        // ✅ 단점 선택(avoid_negatives) 질문에서는 웹서치 건너뛰기
        const isNegativeQuestion = currentQuestionId === 'avoid_negatives' ||
          currentTodo.id === 'avoid_negatives' ||
          currentTodo.question?.includes('피하고 싶은 단점') ||
          currentTodo.question?.includes('피할');

        if (intentResult.type === 'B' && !isNegativeQuestion) {
          const query = intentResult.suggestedSearchQuery || `${searchKeyword} ${userMessage}`;
          send('status', { message: `"${query}" 관련 정보 검색 중...`, query });
          webSearchResult = await performContextualSearch(searchKeyword, userMessage, currentTodo.question, intentResult.suggestedSearchQuery, 'B');
          const responseContent = `${webSearchResult?.insight || '정보를 찾지 못했어요.'}${webSearchResult?.relevantTip ? `\n\n💡 ${webSearchResult.relevantTip}` : ''}\n\n---\n\n다시 질문드릴게요!\n\n${currentTodo.question}`;
          const completedCountB = updatedTodos.filter((t: any) => t.completed).length;
          return { success: true, phase: 'questions', content: responseContent, options: currentTodo.options.map((o:any)=>o.label), currentQuestion: currentTodo, questionTodos: updatedTodos, collectedInfo: updatedInfo, searchContext: webSearchResult, progress: { current: completedCountB + 1, total: updatedTodos.length } };
        }

        // ✅ 수정: 자연어 응답은 원본 그대로 저장 (LLM이 의미론적으로 해석)
        // matchedOption은 옵션 매칭 확인용으로만 사용, 저장 시에는 원본 userMessage 사용
        const processedAnswer = userMessage;
        updatedTodos[todoIndex].completed = true;
        updatedTodos[todoIndex].answer = processedAnswer;
        
        // ✅ 단점 질문(avoid_negatives)은 '회피조건'으로 별도 저장
        const isAvoidNegativesQuestion = currentQuestionId === 'avoid_negatives' || 
          currentTodo.id === 'avoid_negatives' ||
          currentTodo.question?.includes('피하고 싶은 단점');
        
        if (isAvoidNegativesQuestion) {
          // 회피조건으로 별도 저장 (multi 선택이므로 배열로 처리)
          const negativeSelections = processedAnswer.split(',').map((s: string) => s.trim()).filter(Boolean);
          updatedInfo['__avoid_negatives__'] = negativeSelections;
          console.log(`[Chat] Avoid negatives saved:`, negativeSelections);
        } else {
          // ✅ 수정: 질문 ID 대신 질문 텍스트를 키로 사용 (LLM이 맥락 이해 가능)
          updatedInfo[currentTodo.question] = processedAnswer;
        }

        // ✅ Type A (선택)에서는 웹검색 제거 - init에서 충분한 컨텍스트를 이미 수집했음
        // 웹검색은 Type B (사용자가 질문할 때)에서만 수행

        const shortTermMemory = loadShortTermMemory(categoryKey);
        if (shortTermMemory) {
          shortTermMemory.collectedInfo = { ...shortTermMemory.collectedInfo, ...updatedInfo };
          if (isAvoidNegativesQuestion) {
            shortTermMemory.negativeSelections = updatedInfo['__avoid_negatives__'] || [];
          }
          saveShortTermMemory(categoryKey, shortTermMemory);
        }
      }
    }

    const nextQuestion = updatedTodos.filter((t: any) => !t.completed).sort((a: any, b: any) => a.priority - b.priority)[0];
    if (!nextQuestion) {
      // ✅ 모든 맞춤 질문 완료 (단점 질문 포함) → 바로 hard-cut 단계로 진행
      send('status', { message: '입력해주신 정보를 바탕으로 최적의 상품을 찾고 있어요...' });

      // 메모리에 최종 수집 정보 저장
      const sm = loadShortTermMemory(categoryKey);
      if (sm) {
        sm.collectedInfo = updatedInfo;
        saveShortTermMemory(categoryKey, sm);
      }

      // phase: 'complete'로 반환 → 프론트엔드에서 hard-cut API 호출
      return {
        success: true,
        phase: 'complete',
        content: '모든 질문이 완료되었어요! 맞춤 상품을 찾고 있습니다.',
        ui_type: 'loading',
        questionTodos: updatedTodos,
        collectedInfo: updatedInfo
      };
    }

    // ✅ 전환 텍스트 - 웹검색 없이 컨텍스트 기반 공감 + 설명
    let transitionText = '';
    if (ai && userMessage) {
      try {
        const categoryName = loadShortTermMemory(categoryKey)?.categoryName || categoryKey;
        const completedQuestion = updatedTodos.find((t: any) => t.id === currentQuestionId);
        const currentQ = completedQuestion?.question || '';

        const model = ai.getGenerativeModel({
          model: MODEL_NAME,
          generationConfig: { temperature: 0.6, maxOutputTokens: 250 }
        });
        const prompt = `## 역할
${categoryName} 구매 상담 어시스턴트입니다.

## 상황
- 질문: "${currentQ}"
- 사용자 선택: "${userMessage}"

## 요청
1. 사용자의 선택에 공감 (1문장)
2. 이 선택이 ${categoryName} 선택에 어떤 의미인지 간단히 설명 (1-2문장)

⚠️ 총 2-3문장. 다음 질문은 별도로 표시되니 연결 문장 불필요. 이모지 금지.`;
        const result = await model.generateContent(prompt);
        transitionText = result.response.text().trim() + '\n\n';
      } catch (e) {
        console.error('[TransitionText] Generation failed:', e);
      }
    }
    const completedCountNext = updatedTodos.filter((t: any) => t.completed).length;
    return { success: true, phase: 'questions', content: `${transitionText}${nextQuestion.question}`, tip: nextQuestion.reason, options: nextQuestion.options.map((o: any) => o.label), ui_type: 'chat', currentQuestion: nextQuestion, questionTodos: updatedTodos, collectedInfo: updatedInfo, progress: { current: completedCountNext + 1, total: updatedTodos.length } };
  }

  // Free chat fallback
  const model = ai!.getGenerativeModel({ model: MODEL_NAME, systemInstruction: '전문 상담사입니다.' });
  const chat = model.startChat({ history: (body.conversationHistory || []).map((h: any) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })) });
  const result = await chat.sendMessage(userMessage || '안녕하세요');
  return { success: true, phase: 'free_chat', ui_type: 'chat', content: result.response.text(), options: [] };
}

async function handleNonStreamingRequest(body: any, categoryKey: string, searchKeyword: string) {
  const result = await processChatLogic(body, categoryKey, searchKeyword);
  return NextResponse.json(result);
}
