/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Chat API v12 (Memory System Integration)
 *
 * V12 변경사항:
 * - 단기기억 시스템 통합
 * - 질문 답변 → 단기기억에 저장
 * - 웹서치 인사이트 → 단기기억에 저장
 * - 밸런스/단점 선택 → 단기기억에 저장
 * - 최종 추천 → 단기기억에 저장
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

// ============================================================================
// Types
// ============================================================================

interface ToolExecution {
  tool: string;
  args: any;
  result: any;
  displayText: string;
}

// Global state for tool execution
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
// Tool Execution (크롤링 데이터 기반)
// ============================================================================

async function executeSearchProducts(args: any): Promise<{ result: any; displayText: string }> {
  // 크롤링된 allProducts에서 필터링
  let filtered = [...allProducts];

  if (args.min_price) {
    filtered = filtered.filter((p: any) => p.price && p.price >= args.min_price);
  }
  if (args.max_price) {
    filtered = filtered.filter((p: any) => p.price && p.price <= args.max_price);
  }
  if (args.brands?.length) {
    filtered = filtered.filter((p: any) =>
      args.brands.some((b: string) => p.brand?.toLowerCase().includes(b.toLowerCase()))
    );
  }
  if (args.keywords?.length) {
    filtered = filtered.filter((p: any) => {
      const text = `${p.name} ${p.specSummary || ''}`.toLowerCase();
      return args.keywords.some((kw: string) => text.includes(kw.toLowerCase()));
    });
  }

  // 리뷰 수 기준 정렬
  filtered.sort((a: any, b: any) => (b.reviewCount || 0) - (a.reviewCount || 0));
  filtered = filtered.slice(0, args.limit || 10);

  return {
    result: filtered,
    displayText: `🔍 **${filtered.length}개 상품** 검색 완료`
  };
}

async function executeGetProductReviews(args: any): Promise<{ result: any; displayText: string }> {
  // Phase 2에서 pcode 기반 리뷰 크롤러 추가 예정
  // 현재는 크롤링 데이터의 기본 정보만 반환
  const product = allProducts.find((p: any) => p.pcode === args.pcode);

  if (!product) {
    return {
      result: [],
      displayText: `📝 상품을 찾을 수 없습니다`
    };
  }

  // 크롤링된 기본 정보로 대체
  const mockReview = {
    content: `${product.name} - 리뷰 ${product.reviewCount}개, 평점 ${product.rating || 'N/A'}`,
    rating: product.rating || 0,
    sentiment: (product.rating || 0) >= 4 ? 'positive' : 'neutral',
    specSummary: product.specSummary || ''
  };

  return {
    result: [mockReview],
    displayText: `📝 **${product.name}** 기본 정보 확인 (리뷰 ${product.reviewCount}개)`
  };
}

async function executeAnalyzeReviews(args: any): Promise<{ result: any; displayText: string }> {
  const criteria = args.criteria.toLowerCase();

  // 크롤링 데이터에서 키워드 매칭
  const matchedProducts = allProducts.filter((p: any) => {
    const text = `${p.name} ${p.specSummary || ''}`.toLowerCase();
    return text.includes(criteria);
  });

  const totalReviewCount = matchedProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0);
  const avgRating = matchedProducts.length > 0
    ? matchedProducts.reduce((sum: number, p: any) => sum + (p.rating || 0), 0) / matchedProducts.length
    : 0;

  return {
    result: {
      criteria,
      matchedProducts: matchedProducts.length,
      totalReviewCount,
      avgRating: Math.round(avgRating * 10) / 10
    },
    displayText: `📊 **"${args.criteria}"** 관련 상품 ${matchedProducts.length}개 (리뷰 ${totalReviewCount}개)`
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

/**
 * 상품 목록 가져오기 (캐시 또는 크롤링)
 */
async function getProducts(categoryKey: string, searchOptions?: Partial<DanawaSearchOptions>): Promise<any[]> {
  // 카테고리 키를 검색어로 변환
  const categoryNameMap: Record<string, string> = {
    airfryer: '에어프라이어',
    robotcleaner: '로봇청소기',
    humidifier: '가습기',
    airpurifier: '공기청정기',
    // 필요시 추가
  };

  const query = searchOptions?.query || categoryNameMap[categoryKey] || categoryKey;

  // 캐시 확인
  const cached = getQueryCache(query);
  if (cached && cached.items.length > 0) {
    console.log(`[Chat] Using cached products for "${query}": ${cached.items.length} items`);
    return cached.items;
  }

  // 캐시 미스 → 크롤링
  console.log(`[Chat] Cache miss, crawling for "${query}"...`);
  const crawlOptions: DanawaSearchOptions = {
    query,
    limit: searchOptions?.limit || 40,
    sort: searchOptions?.sort || 'saveDESC',
    minPrice: searchOptions?.minPrice,
    maxPrice: searchOptions?.maxPrice,
  };

  try {
    const response = await crawlDanawaSearchList(crawlOptions);

    if (response.success && response.items.length > 0) {
      // 캐시 저장
      setQueryCache(response);
      return response.items;
    }
  } catch (error) {
    console.error('[Chat] Crawling failed:', error);
  }

  return [];
}


// ============================================================================
// Contextual Web Search (답변 기반 실시간 웹서치 - Google Search Grounding)
// ============================================================================

interface SearchContext {
  query: string;
  insight: string;
  relevantTip: string;
  sources?: Array<{ title: string; url: string }>;
}

/**
 * 사용자 답변 기반 실시간 웹서치 (Google Search Grounding 활용)
 */
async function performContextualSearch(
  categoryName: string,
  userAnswer: string,
  questionContext: string
): Promise<SearchContext | null> {
  if (!ai) return null;

  try {
    // Google Search Grounding 활성화
    const model = ai.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.3 },
      tools: [{ google_search: {} } as never]  // 실제 웹서치 활성화
    });

    const year = new Date().getFullYear();
    const searchPrompt = `
사용자가 ${categoryName} 구매 상담 중입니다.
질문: "${questionContext}"
사용자 답변: "${userAnswer}"

${year}년 최신 정보를 검색하여:
1. "${userAnswer}" 선택에 대한 전문가 인사이트
2. 이 선택 시 주의해야 할 점
3. 관련 추천 팁

JSON 형식으로 응답:
{
  "query": "실제 검색한 쿼리",
  "insight": "웹 검색 결과 기반 전문가 코멘트 1-2문장",
  "relevantTip": "다음 단계에서 고려할 점 1문장"
}
`;

    const result = await model.generateContent(searchPrompt);
    const response = result.response;
    const text = response.text();

    // groundingMetadata에서 실제 검색 정보 추출
    const candidate = (response as { candidates?: Array<{ groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    } }> }).candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    
    // 실제 사용된 검색 쿼리
    const webSearchQueries = groundingMetadata?.webSearchQueries || [];
    
    // 실제 출처 추출
    const groundingChunks = groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => ({
        title: chunk.web?.title || 'Unknown',
        url: chunk.web?.uri || ''
      }))
      .slice(0, 3);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      console.log(`[Chat] Real web search queries: ${webSearchQueries.join(', ')}`);
      console.log(`[Chat] Sources found: ${sources.length}`);
      
      return {
        query: webSearchQueries[0] || parsed.query || `${categoryName} ${userAnswer}`,
        insight: parsed.insight || '',
        relevantTip: parsed.relevantTip || '',
        sources
      };
    }
  } catch (e) {
    console.error('[Chat] Contextual web search failed:', e);
  }

  return null;
}

// ============================================================================
// AI 기반 동적 질문 생성 (밸런스 게임 & 단점 필터 통합)
// ============================================================================

/**
 * 후보군 상품 리스트를 LLM이 분석할 수 있는 텍스트로 변환
 */
function formatProductsForLLM(products: any[], maxCount: number = 20): string {
  if (!products || products.length === 0) return '(후보 상품 없음)';
  
  return products.slice(0, maxCount).map((p, i) => {
    const specs = p.specSummary || p.specs?.map((s: any) => `${s.label}: ${s.value}`).join(', ') || '';
    return `${i + 1}. [${p.brand || '브랜드미상'}] ${p.name} (${p.price?.toLocaleString()}원)
   - 주요스펙: ${specs.slice(0, 100)}...
   - 리뷰요약: ${p.reviewSummary?.slice(0, 50) || '정보 없음'}`;
  }).join('\n\n');
}

async function generateDynamicQuestionsAI(
  categoryKey: string,
  collectedInfo: Record<string, unknown>,
  products: any[]
): Promise<{ balance_questions: BalanceQuestion[]; negative_filter_options: NegativeOption[] }> {
  if (!ai) return { balance_questions: [], negative_filter_options: [] };

  try {
    const insights = await loadCategoryInsights(categoryKey);
    // insights 없어도 계속 진행 - 웹서치 데이터 + 상품 데이터 기반으로 생성

    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    // 카테고리 이름 (insights 없으면 categoryKey 디코딩해서 사용)
    const categoryName = insights?.category_name || decodeURIComponent(categoryKey);

    // 1. 사용자 컨텍스트 텍스트 생성 (설문 응답 + 주관식 답변)
    const hardFilterLines = Object.entries(collectedInfo)
      .map(([key, value]) => `- ${key}: ${value}`);
    const userContextText = hardFilterLines.length > 0 ? hardFilterLines.join('\n') : '(선택된 조건 없음)';

    // 2. 단기 기억에서 데이터 가져오기 (밸런스 선택, 웹서치 결과 등)
    const shortTermMemory = loadShortTermMemory(categoryKey);
    const balanceSelectionsText = shortTermMemory?.balanceSelections?.length
      ? shortTermMemory.balanceSelections.map(s => `- ${s.selectedLabel} 선택`).join('\n')
      : '(아직 선택 없음)';

    // 2-1. 웹서치 인사이트 데이터 (init 단계에서 수집됨)
    const webInsights = shortTermMemory?.webSearchInsights || [];
    const latestInsight = webInsights[0]; // 가장 최근 인사이트
    const webInsightText = latestInsight?.insight || '';
    const webSources = latestInsight?.sources?.slice(0, 3) || [];

    // 3. 상품 텍스트
    const productsText = formatProductsForLLM(products);

    // 4. 트레이드오프 텍스트 (insights 있으면 사용, 없으면 웹서치/상품 기반 생성 유도)
    const tradeoffsText = insights?.tradeoffs?.length
      ? insights.tradeoffs.map((t, i) => `${i+1}. ${t.title}: A(${t.option_a.text}) vs B(${t.option_b.text})`).join('\n')
      : '(사전 정의 없음 → 상품 스펙/가격대/브랜드 차이를 분석해서 트레이드오프 생성 필요)';

    // 5. 단점 텍스트 (insights 있으면 사용, 없으면 기본 안내)
    let consText: string;
    if (insights?.cons?.length) {
      consText = insights.cons.slice(0, 8).map((c, i) => `${i+1}. ${c.text}`).join('\n');
    } else {
      consText = '(사전 정의 없음 → 상품 리뷰/스펙에서 일반적인 단점 추출 필요)';
    }

    // 6. 웹서치 컨텍스트 (insights 없을 때 추가 정보 제공)
    const webSearchContext = !insights && webInsightText ? `
═══════════════════════════════════════
🌐 웹서치 기반 시장 분석 (최신)
═══════════════════════════════════════
${webInsightText}

${webSources.length > 0 ? `📎 참고 출처: ${webSources.map(s => s.title).join(', ')}` : ''}
` : '';

    const prompt = `당신은 ${categoryName} 구매 상담 전문가입니다.
사용자가 하드필터로 후보군을 좁힌 상태입니다. 이제 **후보군 상품들을 직접 분석**해서 의미있는 질문을 생성해주세요.

═══════════════════════════════════════
👤 사용자가 이미 선택한 조건 (하드필터)
═══════════════════════════════════════
${userContextText}

═══════════════════════════════════════
🎮 사용자가 밸런스 게임에서 선택한 결과
═══════════════════════════════════════
${balanceSelectionsText}

═══════════════════════════════════════
📦 현재 후보군 상품 (하드필터 통과)
═══════════════════════════════════════
${productsText}

═══════════════════════════════════════
💡 참고: 이 카테고리의 일반적인 트레이드오프
═══════════════════════════════════════
${tradeoffsText}

═══════════════════════════════════════
⚠️ 참고: 이 카테고리의 주요 단점/불만 (리뷰 기반)
═══════════════════════════════════════
${consText}
${webSearchContext}
═══════════════════════════════════════
🎯 생성 규칙 (매우 중요!)
═══════════════════════════════════════

**[공통 규칙]**
1. ❌ 가격/예산 관련 질문 절대 금지 (따로 필터링함)
2. 전문용어나 일상에서 안 쓰는 단어는 풀어서 설명
   예: "PPSU(열에 강한 플라스틱) 소재", "BPA-free(환경호르몬 없는)"
3. 초보 부모도 바로 이해할 수 있는 쉬운 말로 작성

**[밸런스 게임 질문 - 1~3개]**

⚠️ **Rule 1. 하드필터 중복 질문 절대 금지**
위 '사용자가 이미 선택한 조건(하드필터)'을 확인하세요. 사용자가 이미 명확히 의사를 밝힌 속성은 밸런스 게임에서 다시 묻지 마세요.
- ❌ 상황: 하드필터에서 "가벼운 무게(휴대용)"를 이미 선택함
- ❌ 금지된 질문: "가벼움 vs 튼튼함" (사용자는 이미 가벼움을 선택했으므로 이 질문은 불필요)
- ✅ 행동: 이미 선택된 속성과 관련된 트레이드오프는 건너뛰고, 아직 결정하지 않았지만 구매에 중요한 다른 속성을 물어보세요.

⚠️ **Rule 1-1. 복수 선택 속성 처리 (중요!)**
사용자가 같은 질문에서 2개 이상 선택한 경우 "둘 다 괜찮아요"라는 의미입니다.
- ✅ **올바른 행동**:
  1. 다른 질문이 충분하면(2개 이상) → 해당 트레이드오프 질문 생략
  2. 다른 질문이 부족하면(1개 이하) → 질문을 변형하여 포함:
     - option_A.text와 option_B.text 앞에 "둘 다 좋다고 하셨는데, 정말 하나만 고르자면 " 추가

⚠️ **Rule 2. 물리적/직관적 트레이드오프만 허용 (Strong)**
부모들이 실제로 고민하는 **물리적/구조적 상반 관계**만 질문하세요. 기술적으로 둘 다 만족시킬 수 있는 "좋은 기능 vs 좋은 기능"은 가짜 트레이드오프입니다.

형식 요구사항:
- id: "balance_1", "balance_2" 등
- type: "tradeoff" (기본)
- title: 상반 관계가 명확히 드러나는 제목 (예: "무게 vs 안정감")
- option_A.text: **A를 선택하면 B를 포기해야 함이 암시된 문장** (30~50자)
- option_B.text: **B를 선택하면 A를 포기해야 함이 암시된 문장** (30~50자)
- target_rule_key: 영문 소문자+언더스코어 (⚠️ 필수: A와 B는 서로 다른 고유한 키여야 함)

**[피하고 싶은 단점 옵션 - 4~6개]**

⚠️ **Rule 3. 충돌/중복 방지**
- 밸런스 게임에서 이미 선택한 긍정적 가치와 정반대되는 단점은 제외하세요.
  예: 밸런스 게임에서 "작고 가벼움"을 선택했는데, 단점 옵션에 "크기가 큼"을 넣지 마세요.
- 하드필터에서 선택한 조건과 상충하는 옵션은 제외하세요.

형식 요구사항:
- id: "neg_1", "neg_2" 등
- label: "소음이 크다는 후기가 많아요", "세척이 번거로워요" 등 구체적인 문장
- target_rule_key: 필터링에 사용할 rule_key (insights.cons의 rule_key 활용)
- exclude_mode: "drop_if_has" | "drop_if_lacks" | "penalize" 중 하나

═══════════════════════════════════════
최종 응답은 반드시 아래 JSON 형식을 지키세요:
{
  "balance_questions": [ ... ],
  "negative_filter_options": [ ... ]
}
═══════════════════════════════════════`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        balance_questions: (parsed.balance_questions || []).map((q: any) => ({
          ...q,
          option_A: q.option_A || { text: q.optionA?.label || '', target_rule_key: q.optionA?.ruleKey || '' },
          option_B: q.option_B || { text: q.optionB?.label || '', target_rule_key: q.optionB?.ruleKey || '' }
        })),
        negative_filter_options: parsed.negative_filter_options || []
      };
    }
  } catch (e) {
    console.error('[Chat] Dynamic questions generation failed:', e);
  }

  // Fallback: 기본 질문 반환
  return {
    balance_questions: [
      {
        id: 'default_balance_1',
        type: 'tradeoff',
        title: '가성비 vs 프리미엄',
        option_A: { text: '가성비가 좋은 실속 있는 제품이 좋아요', target_rule_key: 'value' },
        option_B: { text: '가격이 비싸더라도 품질이 좋은 프리미엄 제품이 좋아요', target_rule_key: 'premium' }
      }
    ],
    negative_filter_options: []
  };
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

    // 사용자가 입력한 키워드를 그대로 검색어로 사용
    const searchKeyword = categoryKey;

    // 상품 로드 (캐시 또는 크롤링)
    allProducts = await getProducts(categoryKey, { query: searchKeyword });

    // ============================================================================
    // Phase: Questions (Todo 기반 질문 흐름 + 실시간 웹서치)
    // ============================================================================
    if (phase === 'questions') {
      // 현재 질문에 대한 답변 처리
      const updatedTodos = [...questionTodos];
      const updatedInfo = { ...collectedInfo };

      // 웹서치 결과 (답변 기반)
      let webSearchResult: SearchContext | null = null;

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

          // ============================================================================
          // 실시간 웹서치 (Google Search Grounding) - 답변 기반 인사이트 수집
          // ============================================================================
          webSearchResult = await performContextualSearch(
            searchKeyword,
            processedAnswer,
            currentTodo.question
          );

          if (webSearchResult) {
            console.log(`[Chat] Web search completed: "${webSearchResult.query}"`);
            if (webSearchResult.sources?.length) {
              console.log(`[Chat] Sources: ${webSearchResult.sources.map(s => s.title).join(', ')}`);
            }
          }

          // ============================================================================
          // V12: 단기기억 업데이트 (질문 답변 + 웹서치 인사이트)
          // ============================================================================
          const shortTermMemory = loadShortTermMemory(categoryKey);
          if (shortTermMemory) {
            // collectedInfo 업데이트
            shortTermMemory.collectedInfo = { ...shortTermMemory.collectedInfo, ...updatedInfo };

            // 웹서치 인사이트 저장
            if (webSearchResult) {
              const webInsight: WebSearchInsight = {
                phase: 'question',
                questionId: currentQuestionId,
                question: currentTodo.question,
                userAnswer: processedAnswer,
                query: webSearchResult.query,
                insight: webSearchResult.insight,
                sources: webSearchResult.sources?.map(s => ({ title: s.title, url: s.url })) || [],
                timestamp: new Date().toISOString(),
              };
              shortTermMemory.webSearchInsights.push(webInsight);
            }

            // 저장
            saveShortTermMemory(categoryKey, shortTermMemory);
            console.log(`[Chat V12] Short-term memory updated with Q: ${currentQuestionId}`);
          }
        }
      }

      // 다음 미완료 질문 찾기
      const nextQuestion = updatedTodos
        .filter((t: QuestionTodo) => !t.completed)
        .sort((a: QuestionTodo, b: QuestionTodo) => a.priority - b.priority)[0];

      // 모든 질문 완료 → 밸런스 게임으로 전환 (순서: balance → negative_filter → result)
      if (!nextQuestion) {
        // AI 기반 동적 밸런스/단점 질문 생성
        const { balance_questions, negative_filter_options } = await generateDynamicQuestionsAI(
          categoryKey,
          updatedInfo,
          allProducts
        );

        if (balance_questions.length > 0) {
          // V12: 단기기억 업데이트 (밸런스 질문 + 나중을 위해 단점 옵션도 미리 저장)
          const shortTermMemory = loadShortTermMemory(categoryKey);
          if (shortTermMemory) {
            shortTermMemory.balanceQuestions = balance_questions;
            shortTermMemory.negativeOptions = negative_filter_options;
            saveShortTermMemory(categoryKey, shortTermMemory);
          }

          return NextResponse.json({
            success: true,
            phase: 'balance',
            content: `좋아요! 지금까지 말씀해주신 내용을 정리했어요.\n\n이제 **우선순위를 더 정확히 파악**하기 위해 간단한 선택 게임을 해볼게요. 직관적으로 골라주세요!`,
            tip: `💡 선택하신 조건을 기반으로 생성된 맞춤 질문입니다`,
            ui_type: 'balance_game',
            balanceQuestions: balance_questions,
            questionTodos: updatedTodos,
            collectedInfo: updatedInfo
          });
        }

        // 밸런스 게임 생성 실패 시 단점 필터로 (이미 위에서 생성되었을 수 있으므로 확인)
        if (negative_filter_options.length > 0) {
          const totalReviewCount = allProducts.reduce((sum, p) => sum + (p.review_count || 0), 0);

          return NextResponse.json({
            success: true,
            phase: 'negative_filter',
            content: `좋아요! 지금까지 말씀해주신 내용을 정리했어요.\n\n혹시 **꼭 피하고 싶은 단점**이 있으신가요? (복수 선택 가능)`,
            tip: `${allProducts.length}개 상품, ${totalReviewCount.toLocaleString()}개 리뷰 분석 결과입니다`,
            ui_type: 'negative_filter',
            negativeOptions: negative_filter_options,
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

      // AI로 자연스러운 전환 멘트 생성 (웹서치 인사이트 포함)
      const currentTodo = updatedTodos.find((t: QuestionTodo) => t.id === currentQuestionId);
      let transitionText = '';

      if (completedCount > 0 && ai) {
        try {
          const model = ai.getGenerativeModel({ model: MODEL_NAME });
          
          // 웹서치 결과가 있으면 인사이트 포함
          const searchInsight = webSearchResult?.insight || '';
          
          const prompt = `
사용자가 ${searchKeyword} 구매 상담 중입니다.
질문: "${currentTodo?.question || ''}"
답변: "${userMessage}"
${searchInsight ? `\n웹서치 인사이트: ${searchInsight}` : ''}

이 답변에 대해:
1. 짧은 공감/확인 멘트 (1문장)
2. ${searchInsight ? '웹서치 결과 기반' : '이 선택이 의미하는 바'} 간단히 설명 (1문장)

따옴표 없이 자연스럽게 2문장으로 응답하세요.
예: 3~4인 가족이시군요! 그 정도 인원이면 중형(10L 이상) 사이즈가 적당해요.
`;
          const result = await model.generateContent(prompt);
          transitionText = result.response.text().trim() + '\n\n';
        } catch (e) {
          console.error('[Chat] Transition generation failed:', e);
        }
      }

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
        // 실시간 웹서치 결과 (UI에서 검색 프로세스 & 출처 표시용)
        searchContext: webSearchResult ? {
          query: webSearchResult.query,
          insight: webSearchResult.insight,
          sources: webSearchResult.sources || []
        } : null,
        productCount: allProducts.length
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

      // ============================================================================
      // V12: 단기기억 업데이트 (밸런스 선택)
      // ============================================================================
      const shortTermMemory = loadShortTermMemory(categoryKey);
      if (shortTermMemory) {
        // 밸런스 질문들 저장 (body에서 전달받은 경우)
        const balanceQuestions = body.balanceQuestions || [];
        if (balanceQuestions.length > 0) {
          shortTermMemory.balanceQuestions = balanceQuestions.map((q: any): BalanceQuestion => ({
            id: q.id,
            type: q.type || 'tradeoff',
            title: q.title || '',
            option_A: { text: q.option_A?.text || q.optionA?.label || '', target_rule_key: q.option_A?.target_rule_key || q.optionA?.ruleKey || '' },
            option_B: { text: q.option_B?.text || q.optionB?.label || '', target_rule_key: q.option_B?.target_rule_key || q.optionB?.ruleKey || '' },
          }));
        }

        // 밸런스 선택 결과 저장 (userMessage가 배열 또는 JSON 형태)
        try {
          const selections = typeof userMessage === 'string' && (userMessage.startsWith('[') || userMessage.startsWith('{')) 
            ? JSON.parse(userMessage) 
            : userMessage;
          
          if (Array.isArray(selections)) {
            shortTermMemory.balanceSelections = selections.map((s: any): BalanceSelection => ({
              questionId: s.questionId || s.id || '',
              selected: s.selected || 'A',
              selectedLabel: s.selectedLabel || s.label || '',
              selectedRuleKey: s.selectedRuleKey || s.ruleKey,
            }));
          } else if (typeof selections === 'object' && selections !== null) {
            // Map 형태의 Map<string, 'A' | 'B'> 가 JSON으로 넘어올 때 처리
            shortTermMemory.balanceSelections = Object.entries(selections).map(([id, choice]) => {
              const q = shortTermMemory.balanceQuestions.find(bq => bq.id === id);
              return {
                questionId: id,
                selected: choice as 'A' | 'B',
                selectedLabel: choice === 'A' ? q?.option_A.text || '' : q?.option_B.text || '',
                selectedRuleKey: choice === 'A' ? q?.option_A.target_rule_key : q?.option_B.target_rule_key
              };
            });
          }
        } catch (e) {
          console.error('[Chat] Failed to parse balance selections:', e);
          // 단순 문자열인 경우 - 단일 선택으로 처리
          if (typeof userMessage === 'string' && userMessage.trim()) {
            shortTermMemory.balanceSelections = [{
              questionId: 'balance_1',
              selected: 'A',
              selectedLabel: userMessage,
            }];
          }
        }

        saveShortTermMemory(categoryKey, shortTermMemory);
        console.log(`[Chat V12] Short-term memory updated with balance selections`);
      }

      // 저장된 단점 옵션이 있으면 사용
      const negativeOptions = shortTermMemory?.negativeOptions || [];

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

      // ============================================================================
      // V12: 단기기억 업데이트 (단점 선택)
      // ============================================================================
      const shortTermMemory = loadShortTermMemory(categoryKey);
      if (shortTermMemory) {
        shortTermMemory.negativeSelections = selectedNegatives;
        saveShortTermMemory(categoryKey, shortTermMemory);
        console.log(`[Chat V12] Short-term memory updated with negative selections: ${selectedNegatives.join(', ')}`);
      }

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
          const finalProducts = recommendedProducts.length > 0 ? recommendedProducts : allProducts.slice(0, 3);

          // ============================================================================
          // V12: 단기기억 업데이트 (최종 추천)
          // ============================================================================
          const shortTermMemoryForResult = loadShortTermMemory(categoryKey);
          if (shortTermMemoryForResult) {
            shortTermMemoryForResult.finalRecommendations = finalProducts.slice(0, 3).map((p: any, idx: number): Recommendation => ({
              rank: idx + 1,
              pcode: p.pcode,
              name: p.name,
              brand: p.brand || '',
              price: p.price || 0,
              score: 0,
              reason: parsed.reasons?.[p.pcode] || '',
            }));
            saveShortTermMemory(categoryKey, shortTermMemoryForResult);
            console.log(`[Chat V12] Short-term memory updated with final recommendations`);
          }

          return NextResponse.json({
            success: true,
            phase: 'result',
            content: parsed.content || '추천 상품을 확인해주세요.',
            ui_type: 'result',
            products: finalProducts,
            all_products: allProducts,
            collectedInfo: updatedInfo
          });
        }
      } catch (e) {
        console.error('[Chat] Result generation failed:', e);
      }

      // Fallback
      const fallbackProducts = allProducts.slice(0, 3);

      // Fallback에서도 단기기억 업데이트
      const shortTermMemoryFallback = loadShortTermMemory(categoryKey);
      if (shortTermMemoryFallback) {
        shortTermMemoryFallback.finalRecommendations = fallbackProducts.map((p: any, idx: number): Recommendation => ({
          rank: idx + 1,
          pcode: p.pcode,
          name: p.name,
          brand: p.brand || '',
          price: p.price || 0,
          score: 0,
          reason: '자동 추천',
        }));
        saveShortTermMemory(categoryKey, shortTermMemoryFallback);
      }

      return NextResponse.json({
        success: true,
        phase: 'result',
        content: '분석이 완료되었습니다. 추천 상품을 확인해주세요.',
        ui_type: 'result',
        products: fallbackProducts,
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

          // ============================================================================
          // V12: 단기기억 업데이트 (최종 추천 - balance fallback)
          // ============================================================================
          const shortTermMemoryBalance = loadShortTermMemory(categoryKey);
          if (shortTermMemoryBalance) {
            shortTermMemoryBalance.finalRecommendations = products.slice(0, 3).map((p: any, idx: number): Recommendation => ({
              rank: idx + 1,
              pcode: p.pcode,
              name: p.name,
              brand: p.brand || '',
              price: p.price || 0,
              score: 0,
              reason: p.recommendReason || '',
            }));
            saveShortTermMemory(categoryKey, shortTermMemoryBalance);
            console.log(`[Chat V12] Short-term memory updated with final recommendations (balance fallback)`);
          }

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
      const fallbackProductsBalance = allProducts.slice(0, 3);

      // Fallback에서도 단기기억 업데이트
      const shortTermMemoryBalanceFallback = loadShortTermMemory(categoryKey);
      if (shortTermMemoryBalanceFallback) {
        shortTermMemoryBalanceFallback.finalRecommendations = fallbackProductsBalance.map((p: any, idx: number): Recommendation => ({
          rank: idx + 1,
          pcode: p.pcode,
          name: p.name,
          brand: p.brand || '',
          price: p.price || 0,
          score: 0,
          reason: '자동 추천',
        }));
        saveShortTermMemory(categoryKey, shortTermMemoryBalanceFallback);
      }

      return NextResponse.json({
        success: true,
        phase: 'result',
        content: '분석이 완료되었습니다. 추천 상품을 확인해주세요.',
        ui_type: 'result',
        products: fallbackProductsBalance,
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
        ...(parsed || {})
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
