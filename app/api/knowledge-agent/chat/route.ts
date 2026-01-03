/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Chat API v9 (Todo-based Dynamic Flow)
 *
 * 핵심 철학:
 * - Todo 리스트 기반 동적 질문 흐름
 * - 리뷰 기반 "내가 몰랐던 고려사항" 발굴
 * - 충분한 정보 수집 후 밸런스게임 → 결과
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const MODEL_NAME = 'gemini-2.5-flash-lite';

// ============================================================================
// Types
// ============================================================================

interface QuestionTodo {
  id: string;
  question: string;
  reason: string;
  options: Array<{ value: string; label: string; description?: string }>;
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
  completed: boolean;
  answer?: string | string[];
}

interface ToolExecution {
  tool: string;
  args: any;
  result: any;
  displayText: string;
}

// Global state for tool execution
let currentCategoryKey = '';
let allProducts: any[] = [];

// ============================================================================
// Tool Definitions
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
            min_price: { type: 'number', description: '최소 가격' },
            max_price: { type: 'number', description: '최대 가격' },
            brands: { type: 'array', items: { type: 'string' }, description: '브랜드 필터' },
            keywords: { type: 'array', items: { type: 'string' }, description: '키워드 필터' },
            limit: { type: 'number', description: '결과 개수' }
          }
        }
      },
      {
        name: 'get_product_reviews',
        description: '특정 상품의 리뷰를 가져옵니다.',
        parameters: {
          type: 'object',
          properties: {
            pcode: { type: 'string', description: '상품 코드' },
            filter: { type: 'string', enum: ['all', 'positive', 'negative'] },
            limit: { type: 'number' }
          },
          required: ['pcode']
        }
      },
      {
        name: 'analyze_reviews_for_criteria',
        description: '특정 기준에 대한 리뷰를 분석합니다.',
        parameters: {
          type: 'object',
          properties: {
            criteria: { type: 'string', description: '분석 기준' }
          },
          required: ['criteria']
        }
      }
    ]
  }
];

// ============================================================================
// Tool Execution
// ============================================================================

async function executeSearchProducts(args: any): Promise<{ result: any; displayText: string }> {
  let query = supabase
    .from('knowledge_products')
    .select('pcode, name, brand, price, thumbnail, rating, review_count, pros, cons, spec_summary_text, buying_point, popularity_rank')
    .eq('category_key', currentCategoryKey);

  if (args.min_price) query = query.gte('price', args.min_price);
  if (args.max_price) query = query.lte('price', args.max_price);
  if (args.brands?.length) query = query.in('brand', args.brands);

  query = query.order('popularity_rank', { ascending: true }).limit(args.limit || 10);

  const { data } = await query;
  let filtered = data || [];

  if (args.keywords?.length) {
    filtered = filtered.filter((p: any) => {
      const text = `${p.name} ${p.spec_summary_text} ${p.buying_point}`.toLowerCase();
      return args.keywords.some((kw: string) => text.includes(kw.toLowerCase()));
    });
  }

  return {
    result: filtered,
    displayText: `🔍 **${filtered.length}개 상품** 검색 완료`
  };
}

async function executeGetProductReviews(args: any): Promise<{ result: any; displayText: string }> {
  let query = supabase
    .from('knowledge_reviews')
    .select('content, rating, sentiment, mentioned_pros, mentioned_cons')
    .eq('pcode', args.pcode);

  if (args.filter === 'positive') query = query.eq('sentiment', 'positive');
  if (args.filter === 'negative') query = query.eq('sentiment', 'negative');

  query = query.limit(args.limit || 5);
  const { data } = await query;

  return {
    result: data || [],
    displayText: `📝 **${(data || []).length}개 리뷰** 확인`
  };
}

async function executeAnalyzeReviews(args: any): Promise<{ result: any; displayText: string }> {
  const criteria = args.criteria.toLowerCase();
  const pcodes = allProducts.slice(0, 10).map((p: any) => p.pcode);

  const { data: reviews } = await supabase
    .from('knowledge_reviews')
    .select('content, rating, sentiment')
    .in('pcode', pcodes)
    .ilike('content', `%${criteria}%`)
    .limit(20);

  const positive = (reviews || []).filter((r: any) => r.rating >= 4).length;
  const negative = (reviews || []).filter((r: any) => r.rating <= 2).length;

  return {
    result: { criteria, total: (reviews || []).length, positive, negative },
    displayText: `📊 **"${args.criteria}"** 리뷰 ${(reviews || []).length}건 분석`
  };
}

async function executeTool(name: string, args: any): Promise<ToolExecution> {
  let result: { result: any; displayText: string };

  switch (name) {
    case 'search_products':
      result = await executeSearchProducts(args);
      break;
    case 'get_product_reviews':
      result = await executeGetProductReviews(args);
      break;
    case 'analyze_reviews_for_criteria':
      result = await executeAnalyzeReviews(args);
      break;
    default:
      result = { result: null, displayText: `Unknown tool: ${name}` };
  }

  return { tool: name, args, result: result.result, displayText: result.displayText };
}

// ============================================================================
// Data Loaders
// ============================================================================

async function loadKnowledgeContext(categoryKey: string): Promise<string> {
  const indexPath = path.join(process.cwd(), 'data', 'knowledge', categoryKey, 'index.md');
  try {
    if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, 'utf-8');
  } catch (e) {
    console.error('[Knowledge] Failed to load:', e);
  }
  return '';
}

async function getProducts(categoryKey: string) {
  const { data } = await supabase
    .from('knowledge_products')
    .select('pcode, name, brand, price, thumbnail, product_url, spec_summary_text, buying_point, review_insight, pros, cons, rating, review_count, popularity_rank')
    .eq('category_key', categoryKey)
    .order('popularity_rank', { ascending: true })
    .limit(30);

  return data || [];
}

// ============================================================================
// Contextual Web Search (답변 기반 실시간 검색)
// ============================================================================

interface SearchContext {
  query: string;
  insight: string;
  relevantTip: string;
}

async function performContextualSearch(
  categoryName: string,
  userAnswer: string,
  questionContext: string
): Promise<SearchContext | null> {
  if (!ai) return null;

  try {
    const model = ai.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.3 }
    });

    // 검색 쿼리 및 인사이트 생성
    const searchPrompt = `
사용자가 ${categoryName} 구매 상담 중입니다.
질문: "${questionContext}"
사용자 답변: "${userAnswer}"

이 답변을 바탕으로:
1. 관련 검색어 생성 (예: "${categoryName} ${userAnswer} 추천")
2. 이 선택에 대한 전문가 인사이트 제공
3. 다음 질문에서 참고할 팁 제공

JSON 형식:
{
  "query": "검색 쿼리",
  "insight": "이 선택에 대한 전문가 코멘트 1문장",
  "relevantTip": "다음 단계에서 고려할 점 1문장"
}
`;

    const result = await model.generateContent(searchPrompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[Chat] Contextual search failed:', e);
  }

  return null;
}

// ============================================================================
// AI 기반 동적 질문 생성
// ============================================================================

async function generateDynamicBalanceQuestionsAI(
  categoryKey: string,
  categoryName: string,
  collectedInfo: Record<string, unknown>,
  knowledge: string,
  products: any[]
): Promise<any[]> {
  if (!ai) return [];

  try {
    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    // 상품들의 주요 특성 추출
    const productFeatures = products.slice(0, 10).map(p => ({
      name: p.name,
      brand: p.brand,
      price: p.price,
      pros: p.pros,
      cons: p.cons
    }));

    const prompt = `
당신은 ${categoryName} 전문 구매 상담사입니다.

## 사용자가 지금까지 선택한 정보
${JSON.stringify(collectedInfo, null, 2)}

## 카테고리 전문 지식
${knowledge.slice(0, 2000)}

## 현재 후보 상품들의 특성
${JSON.stringify(productFeatures.slice(0, 5), null, 2)}

## 과제
사용자의 선택을 기반으로, **트레이드오프가 있는** 밸런스 게임 질문 2-3개를 생성하세요.
- 이미 선택한 내용과 관련된 심화 질문
- 리뷰에서 의견이 갈리는 포인트
- 둘 다 장단점이 있어서 고민되는 선택지

## JSON 형식 (배열)
[
  {
    "id": "unique_id",
    "optionA": { "label": "A 선택지 (예: 소음이 좀 있어도 강력한 성능)", "ruleKey": "power_priority" },
    "optionB": { "label": "B 선택지 (예: 성능은 보통이지만 조용한 제품)", "ruleKey": "quiet_priority" },
    "insight": "이 질문의 배경 설명 (예: 리뷰에서 소음과 성능 사이 의견이 갈립니다)"
  }
]

2-3개의 질문을 JSON 배열로만 응답하세요.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[Chat] Dynamic balance generation failed:', e);
  }

  // Fallback: 기본 질문 반환
  return [
    {
      id: 'default_balance_1',
      optionA: { label: '가성비가 좋은 제품', ruleKey: 'value' },
      optionB: { label: '프리미엄 고급 제품', ruleKey: 'premium' },
      insight: '가격과 품질 사이의 균형점을 찾아드립니다'
    },
    {
      id: 'default_balance_2',
      optionA: { label: '기능이 다양한 제품', ruleKey: 'features' },
      optionB: { label: '사용이 간편한 제품', ruleKey: 'simple' },
      insight: '복잡한 기능 vs 직관적인 사용성'
    }
  ];
}

async function generateDynamicNegativeOptionsAI(
  categoryKey: string,
  categoryName: string,
  collectedInfo: Record<string, unknown>,
  knowledge: string,
  products: any[]
): Promise<any[]> {
  if (!ai) return [];

  try {
    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    // 상품들의 단점 추출
    const productCons = products.slice(0, 10)
      .flatMap(p => p.cons || [])
      .filter(Boolean);

    const prompt = `
당신은 ${categoryName} 전문 구매 상담사입니다.

## 사용자가 지금까지 선택한 정보
${JSON.stringify(collectedInfo, null, 2)}

## 카테고리 전문 지식 (자주 언급되는 단점)
${knowledge.slice(0, 1500)}

## 현재 후보 상품들에서 언급된 단점들
${[...new Set(productCons)].slice(0, 10).join(', ')}

## 과제
사용자가 **꼭 피하고 싶어할 만한 단점** 4-5개를 생성하세요.
- 리뷰에서 자주 언급되는 불만사항
- 특정 사용자에게 치명적일 수 있는 단점
- 구매 후 후회하는 포인트

## JSON 형식 (배열)
[
  {
    "id": "unique_id",
    "label": "피하고 싶은 단점 (예: 소음이 너무 큰 제품)",
    "ruleKey": "noise_issue",
    "excludeMode": "penalize"
  }
]

4-5개의 옵션을 JSON 배열로만 응답하세요.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[Chat] Dynamic negative generation failed:', e);
  }

  // Fallback: 기본 옵션 반환
  return [
    { id: 'neg_noise', label: '소음이 큰 제품', ruleKey: 'noise', excludeMode: 'penalize' },
    { id: 'neg_size', label: '크기가 너무 큰 제품', ruleKey: 'size', excludeMode: 'penalize' },
    { id: 'neg_clean', label: '세척이 불편한 제품', ruleKey: 'cleaning', excludeMode: 'penalize' },
    { id: 'neg_durability', label: '내구성이 약한 제품', ruleKey: 'durability', excludeMode: 'penalize' }
  ];
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      categoryKey,
      userMessage = '',
      questionTodos = [],
      collectedInfo = {},
      currentQuestionId = null,
      conversationHistory = [],
      phase = 'questions'  // 'questions' | 'balance' | 'result'
    } = body;

    if (!categoryKey) {
      return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    }

    currentCategoryKey = categoryKey;
    allProducts = await getProducts(categoryKey);

    // ============================================================================
    // Phase: Questions (Todo 기반 질문 흐름)
    // ============================================================================
    if (phase === 'questions') {
      // 현재 질문에 대한 답변 처리
      const updatedTodos = [...questionTodos];
      const updatedInfo = { ...collectedInfo };

      if (currentQuestionId && userMessage) {
        const todoIndex = updatedTodos.findIndex((t: QuestionTodo) => t.id === currentQuestionId);
        if (todoIndex >= 0) {
          const currentTodo = updatedTodos[todoIndex];

          // 자연어 응답인지 체크 (옵션과 정확히 일치하지 않는 경우)
          const isExactMatch = currentTodo.options.some(
            (o: any) => o.label === userMessage || o.value === userMessage
          );

          let processedAnswer = userMessage;

          // 자연어 응답이면 AI로 의도 파악
          if (!isExactMatch && ai) {
            try {
              const model = ai.getGenerativeModel({ model: MODEL_NAME });
              const parsePrompt = `
사용자가 질문 "${currentTodo.question}"에 대해 "${userMessage}"라고 답했습니다.

가능한 옵션:
${currentTodo.options.map((o: any) => `- ${o.label} (value: ${o.value})`).join('\n')}

사용자의 응답이 어떤 옵션에 해당하는지 분석하세요.
- 정확히 일치하지 않아도 의미상 가장 가까운 옵션을 선택
- 어떤 옵션에도 해당하지 않으면 가장 적절한 옵션을 추론

JSON 형식으로 응답:
{"matched_label": "선택된 옵션 label", "confidence": "high|medium|low", "interpretation": "사용자 의도 해석 1문장"}
`;
              const result = await model.generateContent(parsePrompt);
              const text = result.response.text();
              const jsonMatch = text.match(/\{[\s\S]*\}/);

              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                processedAnswer = parsed.matched_label || userMessage;
                console.log(`[Chat] Natural language parsed: "${userMessage}" → "${processedAnswer}" (${parsed.confidence})`);
              }
            } catch (e) {
              console.error('[Chat] Natural language parsing failed:', e);
              // 파싱 실패 시 원본 메시지 사용
            }
          }

          updatedTodos[todoIndex].completed = true;
          updatedTodos[todoIndex].answer = processedAnswer;
          updatedInfo[currentQuestionId] = processedAnswer;
        }
      }

      // 다음 미완료 질문 찾기
      const nextQuestion = updatedTodos
        .filter((t: QuestionTodo) => !t.completed)
        .sort((a: QuestionTodo, b: QuestionTodo) => a.priority - b.priority)[0];

      // 모든 질문 완료 → 밸런스 게임으로 전환 (순서: balance → negative_filter → result)
      if (!nextQuestion) {
        const categoryName = categoryKey === 'airfryer' ? '에어프라이어' : categoryKey;
        const knowledge = await loadKnowledgeContext(categoryKey);

        // AI 기반 동적 밸런스 질문 생성
        const balanceQuestions = await generateDynamicBalanceQuestionsAI(
          categoryKey,
          categoryName,
          updatedInfo,
          knowledge,
          allProducts
        );

        if (balanceQuestions.length > 0) {
          return NextResponse.json({
            success: true,
            phase: 'balance',
            content: `좋아요! 지금까지 말씀해주신 내용을 정리했어요.\n\n이제 **우선순위를 더 정확히 파악**하기 위해 간단한 선택 게임을 해볼게요. 직관적으로 골라주세요!`,
            tip: `💡 선택하신 조건을 기반으로 생성된 맞춤 질문입니다`,
            ui_type: 'balance_game',
            balanceQuestions,
            questionTodos: updatedTodos,
            collectedInfo: updatedInfo
          });
        }

        // 밸런스 게임 생성 실패 시 단점 필터로
        const negativeOptions = await generateDynamicNegativeOptionsAI(
          categoryKey,
          categoryName,
          updatedInfo,
          knowledge,
          allProducts
        );

        if (negativeOptions.length > 0) {
          const totalReviewCount = allProducts.reduce((sum, p) => sum + (p.review_count || 0), 0);

          return NextResponse.json({
            success: true,
            phase: 'negative_filter',
            content: `좋아요! 지금까지 말씀해주신 내용을 정리했어요.\n\n혹시 **꼭 피하고 싶은 단점**이 있으신가요? (복수 선택 가능)`,
            tip: `${allProducts.length}개 상품, ${totalReviewCount.toLocaleString()}개 리뷰 분석 결과입니다`,
            ui_type: 'negative_filter',
            negativeOptions,
            questionTodos: updatedTodos,
            collectedInfo: updatedInfo
          });
        }

        // 둘 다 없으면 바로 결과로
        return NextResponse.json({
          success: true,
          phase: 'result',
          content: '분석이 완료되었습니다. 추천 상품을 확인해주세요.',
          ui_type: 'result',
          products: allProducts.slice(0, 3),
          all_products: allProducts,
          collectedInfo: updatedInfo
        });
      }

      // 다음 질문 응답 생성
      const completedCount = updatedTodos.filter((t: QuestionTodo) => t.completed).length;
      const totalCount = updatedTodos.length;
      const categoryName = categoryKey === 'airfryer' ? '에어프라이어' : categoryKey;

      // 답변 기반 컨텍스트 검색 (병렬 실행)
      const currentTodo = updatedTodos.find((t: QuestionTodo) => t.id === currentQuestionId);
      const [searchContext, transitionResult] = await Promise.all([
        currentTodo ? performContextualSearch(categoryName, userMessage, currentTodo.question) : Promise.resolve(null),
        // AI로 자연스러운 전환 멘트 생성
        (async () => {
          if (completedCount > 0 && ai) {
            try {
              const model = ai.getGenerativeModel({ model: MODEL_NAME });
              const prompt = `
사용자가 ${categoryName} 구매 상담 중입니다.
질문: "${currentTodo?.question || ''}"
답변: "${userMessage}"

이 답변에 대해:
1. 짧은 공감/확인 멘트 (1문장)
2. 이 선택이 의미하는 바 간단히 설명 (1문장)

따옴표 없이 자연스럽게 2문장으로 응답하세요.
예: 3~4인 가족이시군요! 그 정도 인원이면 중형(10L 이상) 사이즈가 적당해요.
`;
              const result = await model.generateContent(prompt);
              return result.response.text().trim();
            } catch (e) {
              console.error('[Chat] Transition generation failed:', e);
            }
          }
          return '';
        })()
      ]);

      const transitionText = transitionResult ? transitionResult + '\n\n' : '';

      return NextResponse.json({
        success: true,
        phase: 'questions',
        content: `${transitionText}${nextQuestion.question}`,
        tip: nextQuestion.reason,
        options: nextQuestion.options.map((o: any) => o.label),
        ui_type: 'chat',
        currentQuestion: nextQuestion,
        progress: { current: completedCount + 1, total: totalCount },
        questionTodos: updatedTodos,
        collectedInfo: updatedInfo,
        dataSource: nextQuestion.dataSource,
        // 검색 컨텍스트 (UI에서 검색 프로세스 표시용)
        searchContext: searchContext ? {
          query: searchContext.query,
          insight: searchContext.insight
        } : null
      });
    }

    // ============================================================================
    // Phase: Balance Game (밸런스 게임 → 단점 필터로)
    // ============================================================================
    if (phase === 'balance') {
      // 밸런스 게임 결과 저장 후 단점 필터로
      const updatedInfo = { ...collectedInfo, balanceSelections: userMessage };
      const categoryName = categoryKey === 'airfryer' ? '에어프라이어' : categoryKey;
      const knowledge = await loadKnowledgeContext(categoryKey);

      // AI 기반 동적 단점 옵션 생성
      const negativeOptions = await generateDynamicNegativeOptionsAI(
        categoryKey,
        categoryName,
        updatedInfo,
        knowledge,
        allProducts
      );

      if (negativeOptions.length > 0) {
        const totalReviewCount = allProducts.reduce((sum, p) => sum + (p.review_count || 0), 0);

        return NextResponse.json({
          success: true,
          phase: 'negative_filter',
          content: `취향을 파악했어요!\n\n마지막으로 **꼭 피하고 싶은 단점**이 있으신가요? (복수 선택 가능)`,
          tip: `${allProducts.length}개 상품, ${totalReviewCount.toLocaleString()}개 리뷰 분석 결과입니다`,
          ui_type: 'negative_filter',
          negativeOptions,
          collectedInfo: updatedInfo
        });
      }

      // 단점 필터 없으면 바로 결과로 - 아래 result 생성 로직 사용
    }

    // ============================================================================
    // Phase: Negative Filter (피할 단점 → 결과로)
    // ============================================================================
    if (phase === 'negative_filter') {
      // 피할 단점 선택 저장 후 결과 단계로
      const selectedNegatives = userMessage ? userMessage.split(',').map((s: string) => s.trim()) : [];
      const updatedInfo = { ...collectedInfo, negativeSelections: selectedNegatives };

      // 결과 생성 로직으로 이동 (아래 balance → result 로직 재사용)
      // 최종 추천 생성
      const knowledge = await loadKnowledgeContext(categoryKey);

      if (!ai) {
        return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
      }

      const model = ai.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: `당신은 ${categoryKey} 전문가입니다. 수집된 정보를 바탕으로 최적의 상품 3개를 추천하세요.`
      });

      const productList = allProducts.slice(0, 15).map((p, i) =>
        `${i + 1}. [${p.pcode}] ${p.brand} ${p.name} - ${p.price?.toLocaleString()}원 (리뷰 ${p.review_count}개, ⭐${p.rating})`
      ).join('\n');

      const prompt = `
## 수집된 사용자 정보
${JSON.stringify(updatedInfo, null, 2)}

## 전문 지식
${knowledge.slice(0, 2000)}

## 상품 목록
${productList}

위 정보를 바탕으로 최적의 상품 3개를 추천하세요.

JSON 형식으로 응답:
{
  "content": "추천 요약 (리뷰 인용 포함, 2-3문장)",
  "recommended_pcodes": ["pcode1", "pcode2", "pcode3"],
  "reasons": {
    "pcode1": "추천 이유 (리뷰 기반)",
    "pcode2": "추천 이유",
    "pcode3": "추천 이유"
  }
}
`;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const recommendedProducts = allProducts.filter(p =>
            parsed.recommended_pcodes?.includes(p.pcode)
          );

          return NextResponse.json({
            success: true,
            phase: 'result',
            content: parsed.content || '추천 상품을 확인해주세요.',
            ui_type: 'result',
            products: recommendedProducts.length > 0 ? recommendedProducts : allProducts.slice(0, 3),
            all_products: allProducts,
            collectedInfo: updatedInfo
          });
        }
      } catch (e) {
        console.error('[Chat] Result generation failed:', e);
      }

      // Fallback
      return NextResponse.json({
        success: true,
        phase: 'result',
        content: '분석이 완료되었습니다. 추천 상품을 확인해주세요.',
        ui_type: 'result',
        products: allProducts.slice(0, 3),
        all_products: allProducts,
        collectedInfo: updatedInfo
      });
    }

    // ============================================================================
    // Phase: Balance Game → Result (단점 필터 없는 경우)
    // ============================================================================
    if (phase === 'balance') {
      // 단점 필터 건너뛰고 결과로 (위에서 단점 필터 있으면 이미 return됨)
      const updatedInfo = { ...collectedInfo, balanceSelections: userMessage };

      // 최종 추천 생성
      const knowledge = await loadKnowledgeContext(categoryKey);

      if (!ai) {
        return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
      }

      const model = ai.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: `당신은 ${categoryKey} 전문가입니다. 수집된 정보를 바탕으로 최적의 상품 3개를 추천하세요.`
      });

      const productList = allProducts.slice(0, 15).map((p, i) =>
        `${i + 1}. [${p.pcode}] ${p.brand} ${p.name} - ${p.price?.toLocaleString()}원 (리뷰 ${p.review_count}개, ⭐${p.rating})`
      ).join('\n');

      const prompt = `
## 수집된 사용자 정보
${JSON.stringify(updatedInfo, null, 2)}

## 전문 지식
${knowledge.slice(0, 2000)}

## 상품 목록
${productList}

위 정보를 바탕으로 최적의 상품 3개를 추천하세요.

JSON 형식으로 응답:
{
  "content": "추천 요약 (리뷰 인용 포함, 2-3문장)",
  "recommended_pcodes": ["pcode1", "pcode2", "pcode3"],
  "reasons": {
    "pcode1": "추천 이유 (리뷰 기반)",
    "pcode2": "추천 이유",
    "pcode3": "추천 이유"
  }
}
`;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const products = (parsed.recommended_pcodes || []).map((pcode: string) => {
            const p = allProducts.find(prod => prod.pcode === pcode);
            return p ? { ...p, recommendReason: parsed.reasons?.[pcode] || '' } : null;
          }).filter(Boolean);

          return NextResponse.json({
            success: true,
            phase: 'result',
            content: parsed.content,
            ui_type: 'result',
            products,
            all_products: allProducts,
            collectedInfo: updatedInfo
          });
        }
      } catch (e) {
        console.error('[Result] Generation failed:', e);
      }

      // Fallback
      return NextResponse.json({
        success: true,
        phase: 'result',
        content: '분석이 완료되었습니다. 추천 상품을 확인해주세요.',
        ui_type: 'result',
        products: allProducts.slice(0, 3),
        all_products: allProducts,
        collectedInfo: updatedInfo
      });
    }

    // ============================================================================
    // Phase: Free Chat (결과 이후 추가 질문)
    // ============================================================================

    // phase가 명시적으로 'free_chat'이거나 'result'인 경우만 처리
    if (phase !== 'free_chat' && phase !== 'result') {
      return NextResponse.json({
        success: false,
        error: `Unknown phase: ${phase}`
      }, { status: 400 });
    }

    const knowledge = await loadKnowledgeContext(categoryKey);

    if (!ai) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    try {
      const model = ai.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: `당신은 ${categoryKey} 전문 상담사입니다.
## 지식
${knowledge.slice(0, 2000)}

## 상품 ${allProducts.length}개 분석 완료

사용자 질문에 친절하고 전문적으로 답변하세요. 리뷰 기반 답변 권장.
JSON 형식: {"content": "답변", "options": ["후속 질문 옵션"]}`,
        tools: tools as any
      });

      // conversationHistory가 없거나 비어있으면 빈 배열 사용
      const safeHistory = (conversationHistory || []).filter((h: any) => h && h.role && h.content);

      const chatSession = model.startChat({
        history: safeHistory.map((h: any) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content || '' }]
        }))
      });

      const toolExecutions: ToolExecution[] = [];
      let response = await chatSession.sendMessage(userMessage || '안녕하세요');
      let maxIterations = 3;

      while (maxIterations > 0) {
        const functionCalls = response.response.functionCalls();
        if (!functionCalls?.length) break;

        const toolResults = [];
        for (const call of functionCalls) {
          const execution = await executeTool(call.name, call.args);
          toolExecutions.push(execution);
          toolResults.push({
            functionResponse: { name: call.name, response: execution.result }
          });
        }

        response = await chatSession.sendMessage(toolResults);
        maxIterations--;
      }

      const text = response.response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = { content: text, options: [] };
          }
        } else {
          parsed = { content: text, options: [] };
        }
      }

      return NextResponse.json({
        success: true,
        phase: 'free_chat',
        ui_type: 'chat',
        toolExecutions: toolExecutions.map(t => ({
          tool: t.tool,
          displayText: t.displayText,
          resultCount: Array.isArray(t.result) ? t.result.length : 0
        })),
        ...parsed
      });
    } catch (freeChatError) {
      console.error('[FreeChat] Error:', freeChatError);
      return NextResponse.json({
        success: true,
        phase: 'free_chat',
        ui_type: 'chat',
        content: '죄송합니다, 잠시 문제가 발생했어요. 다시 질문해주세요.',
        options: []
      });
    }

  } catch (error) {
    console.error('[Chat Error]:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
