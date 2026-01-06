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
  BalanceSelection, 
  Recommendation,
  BalanceQuestion,
  NegativeOption,
  QuestionTodo
} from '@/lib/knowledge-agent/types';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';

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
  const prompt = `당신은 "${categoryName}" 상담 챗봇입니다.\n질문: "${question}"\n선택지: ${options.map(o => `"${o.label}"`).join(', ')}\n사용자: "${userMessage}"\n\nA(선택), B(질문), C(무관) 분류하여 JSON 응답: {"type":"A"|"B"|"C", "matchedOption":"A일때 label", "interpretation":"해석", "followUpQuestion":"B일때", "suggestedSearchQuery":"B일때 검색어"}`;
  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { type: 'A', matchedOption: options[0]?.label };
}

async function performContextualSearch(categoryName: string, userAnswer: string, questionContext: string, dynamicSearchQuery?: string, intentType: 'A' | 'B' = 'A'): Promise<SearchContext | null> {
  if (!ai) return null;
  const searchQuery = dynamicSearchQuery || `${categoryName} ${userAnswer}`;
  const model = ai.getGenerativeModel({ model: MODEL_NAME, generationConfig: { temperature: 0.3 }, tools: [{ google_search: {} } as any] });
  const prompt = intentType === 'B' 
    ? `"${categoryName}" 관련 "${userAnswer}" 검색하여 답변 JSON: {"query":"...","insight":"답변 2-3문장","relevantTip":"팁","followUpQuestion":"추가질문"}`
    : `"${categoryName}" ${userAnswer} 선택 인사이트 검색 JSON: {"query":"...","insight":"전문가 코멘트","relevantTip":"팁"}`;
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

async function generateDynamicQuestionsAI(categoryKey: string, collectedInfo: any, products: any[]) {
  if (!ai) return { balance_questions: [], negative_filter_options: [] };
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `후보 상품 분석하여 밸런스 게임(1-3개)과 단점 옵션(4-6개) JSON 생성.\n정보: ${JSON.stringify(collectedInfo)}\n상품: ${products.slice(0,10).map(p=>p.name).join(', ')}`;
  try {
    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { balance_questions: [], negative_filter_options: [] };
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
        
        send('status', { message: '사용자 의도 분석 중...' });
        let intentResult: UserIntentResult = { type: 'A', matchedOption: userMessage };
        if (!isExactMatch) intentResult = await classifyUserIntent(userMessage, currentTodo.question, currentTodo.options, searchKeyword);

        if (intentResult.type === 'C') {
          return { success: true, phase: 'questions', content: `음, 질문과 조금 다른 내용인 것 같아요! 😊\n\n다시 질문드릴게요.\n\n${currentTodo.question}`, options: currentTodo.options.map((o:any)=>o.label), currentQuestion: currentTodo, questionTodos: updatedTodos, collectedInfo: updatedInfo };
        }

        if (intentResult.type === 'B') {
          const query = intentResult.suggestedSearchQuery || `${searchKeyword} ${userMessage}`;
          send('status', { message: `"${query}" 관련 정보 검색 중...`, query });
          webSearchResult = await performContextualSearch(searchKeyword, userMessage, currentTodo.question, intentResult.suggestedSearchQuery, 'B');
          const responseContent = `${webSearchResult?.insight || '정보를 찾지 못했어요.'}${webSearchResult?.relevantTip ? `\n\n💡 ${webSearchResult.relevantTip}` : ''}\n\n---\n\n다시 질문드릴게요!\n\n${currentTodo.question}`;
          return { success: true, phase: 'questions', content: responseContent, options: currentTodo.options.map((o:any)=>o.label), currentQuestion: currentTodo, questionTodos: updatedTodos, collectedInfo: updatedInfo, searchContext: webSearchResult };
        }

        const processedAnswer = isExactMatch ? userMessage : (intentResult.matchedOption || userMessage);
        updatedTodos[todoIndex].completed = true;
        updatedTodos[todoIndex].answer = processedAnswer;
        updatedInfo[currentQuestionId] = processedAnswer;

        const dynamicSearchQuery = `${searchKeyword} ${processedAnswer} 추천 ${new Date().getFullYear()}`;
        send('status', { message: `"${dynamicSearchQuery}" 분석 중...`, query: dynamicSearchQuery });
        webSearchResult = await performContextualSearch(searchKeyword, processedAnswer, currentTodo.question, dynamicSearchQuery, 'A');
        
        const shortTermMemory = loadShortTermMemory(categoryKey);
        if (shortTermMemory) {
          shortTermMemory.collectedInfo = { ...shortTermMemory.collectedInfo, ...updatedInfo };
          if (webSearchResult) shortTermMemory.webSearchInsights.push({ phase: 'question', questionId: currentQuestionId, question: currentTodo.question, userAnswer: processedAnswer, query: webSearchResult.query, insight: webSearchResult.insight, sources: webSearchResult.sources || [], timestamp: new Date().toISOString() });
          saveShortTermMemory(categoryKey, shortTermMemory);
        }
      }
    }

    const nextQuestion = updatedTodos.filter((t: any) => !t.completed).sort((a: any, b: any) => a.priority - b.priority)[0];
    if (!nextQuestion) {
      send('status', { message: '밸런스게임 생성 중...' });
      const { balance_questions, negative_filter_options } = await generateDynamicQuestionsAI(categoryKey, updatedInfo, allProducts);
      
      // 메모리에 저장
      const sm = loadShortTermMemory(categoryKey);
      if (sm) { 
        sm.balanceQuestions = balance_questions || []; 
        sm.negativeOptions = negative_filter_options || []; 
        saveShortTermMemory(categoryKey, sm); 
      }
      
      // ⚠️ 항상 phase: 'balance' 반환 (프론트엔드 V2 플로우에서 밸런스/단점 질문을 별도 API로 생성)
      // 밸런스 질문이 비어있어도 V2 플로우가 시작되어야 함
      return { 
        success: true, 
        phase: 'balance', 
        content: balance_questions?.length > 0 
          ? '좋아요! 이제 우선순위를 파악하기 위해 간단한 선택 게임을 해볼게요.' 
          : '입력해주신 정보를 바탕으로 최적의 상품을 찾고 있어요.',
        ui_type: 'balance_game', 
        balanceQuestions: balance_questions || [], 
        negativeOptions: negative_filter_options || [],
        questionTodos: updatedTodos, 
        collectedInfo: updatedInfo 
      };
    }

    send('status', { message: '자연스러운 답변 생성 중...' });
    let transitionText = '';
    if (ai) {
      try {
        const model = ai.getGenerativeModel({ model: MODEL_NAME });
        const prompt = `사용자 답변에 대해 공감과 설명 2문장 응답. 답변: "${userMessage}" 인사이트: "${webSearchResult?.insight || ''}"`;
        const result = await model.generateContent(prompt);
        transitionText = result.response.text().trim() + '\n\n';
      } catch (e) {}
    }
    return { success: true, phase: 'questions', content: `${transitionText}${nextQuestion.question}`, tip: nextQuestion.reason, options: nextQuestion.options.map((o: any) => o.label), ui_type: 'chat', currentQuestion: nextQuestion, questionTodos: updatedTodos, collectedInfo: updatedInfo, searchContext: webSearchResult };
  }

  if (phase === 'balance' || phase === 'negative_filter') {
    const updatedInfo = { ...collectedInfo };
    if (phase === 'balance') updatedInfo.balanceSelections = userMessage;
    else updatedInfo.negativeSelections = userMessage?.split(',').map((s:string)=>s.trim());

    send('status', { message: '최적의 상품 선정 중...' });
    const model = ai!.getGenerativeModel({ model: MODEL_NAME, systemInstruction: '추천 전문가입니다.' });
    const prompt = `정보 기반 3개 추천 JSON: {"content":"요약","recommended_pcodes":["..."]}\n정보: ${JSON.stringify(updatedInfo)}`;
    try {
      const res = await model.generateContent(prompt);
      const json = JSON.parse(res.response.text().match(/\{[\s\S]*\}/)![0]);
      const products = allProducts.filter(p => json.recommended_pcodes?.includes(p.pcode)).slice(0, 3);
      const specs = await normalizeSpecsForComparison(products, searchKeyword);
      const final = products.map(p => {
        const s: any = {}; specs.forEach((sp: any) => { if (sp.values[p.pcode]) s[sp.key] = sp.values[p.pcode]; });
        return { ...p, specs: s };
      });
      return { success: true, phase: 'result', ui_type: 'result', content: json.content, products: final, all_products: allProducts, collectedInfo: updatedInfo };
    } catch (e) {}
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
