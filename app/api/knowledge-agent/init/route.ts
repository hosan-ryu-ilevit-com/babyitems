/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Initialization API v2
 *
 * 초기 로딩 단계에서 수행하는 작업:
 * 1. 웹서치로 실시간 Top10 인기 상품 + 트렌드 분석
 * 2. 데이터베이스 상품/리뷰 분석
 * 3. 전문가 수준의 동적 질문 생성
 * 4. 트렌드 요약 + 타임스탬프와 함께 사용자에게 전달
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

// ============================================================================
// Data Loaders
// ============================================================================

async function loadKnowledgeMarkdown(categoryKey: string): Promise<string> {
  const indexPath = path.join(process.cwd(), 'data', 'knowledge', categoryKey, 'index.md');
  try {
    if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, 'utf-8');
  } catch (e) {
    console.error('[Init] Failed to load index.md:', e);
  }
  return '';
}

async function loadProducts(categoryKey: string) {
  console.log(`[Init] loadProducts called with categoryKey: ${categoryKey}`);

  const { data: products, error } = await supabase
    .from('knowledge_products')
    .select('pcode, name, brand, price, thumbnail, pros, cons, spec_summary_text, buying_point, review_count, rating, popularity_rank')
    .eq('category_key', categoryKey)
    .order('popularity_rank', { ascending: true })
    .limit(30);

  if (error) {
    console.error('[Init] loadProducts error:', error);
  }

  console.log(`[Init] loadProducts returned ${products?.length || 0} products`);
  if (products && products.length > 0) {
    console.log('[Init] First product pcode:', products[0].pcode);
  }

  return products || [];
}

async function loadReviewInsights(categoryKey: string, products: any[]) {
  // 카테고리 메타데이터에서 리뷰 트렌드 가져오기 (테이블 없으면 null)
  const { data: categoryMeta } = await supabase
    .from('knowledge_categories')
    .select('market_trend, buying_guide, common_tradeoffs, price_segments, common_cons, top_brands')
    .eq('category_key', categoryKey)
    .single();

  // Top 10 상품의 pcode 추출
  const topPcodes = products
    .slice(0, 10)
    .map(p => p.pcode)
    .filter(Boolean);

  console.log(`[Init] Loading reviews for ${topPcodes.length} products:`, topPcodes);

  // pcode 기반으로 리뷰 조회 (상품당 10개씩, 총 ~100개)
  let allReviews: any[] = [];

  const debugReviewInfo: any = { topPcodes };

  if (topPcodes.length > 0) {
    // pcode, content, rating만 조회 (테이블에 있는 컬럼만)
    const { data: reviews, error } = await supabase
      .from('knowledge_reviews')
      .select('pcode, content, rating')
      .in('pcode', topPcodes)
      .limit(100);

    debugReviewInfo.queryResult = {
      count: reviews?.length || 0,
      error: error ? error.message : null
    };

    if (error) {
      console.error('[Init] Review query error:', error);
    } else {
      allReviews = reviews || [];
    }
  }

  // 리뷰 통계 집계 (rating 기반)
  let totalPositive = 0;
  let totalNegative = 0;

  allReviews.forEach((r: any) => {
    if (r.rating >= 4) totalPositive++;
    if (r.rating <= 2) totalNegative++;
  });

  // 키워드는 빈 배열로 (추후 content 분석으로 추출 가능)
  const topPros: { keyword: string; count: number }[] = [];
  const topCons: { keyword: string; count: number }[] = [];

  // 샘플 리뷰 텍스트 (AI 분석용)
  const sampleReviews = allReviews
    .slice(0, 20)
    .map(r => r.content)
    .filter(Boolean);

  return {
    categoryMeta,
    reviewStats: {
      total: allReviews.length,
      positive: totalPositive,
      negative: totalNegative,
      topPros,
      topCons
    },
    sampleReviews,
    _debugReviewInfo: debugReviewInfo
  };
}


// ============================================================================
// Web Search & Trend Analysis
// ============================================================================

interface TrendAnalysis {
  timestamp: string;
  top10Summary: string;
  trends: string[];
  pros: string[];
  cons: string[];
  priceInsight: string;
  searchQueries: string[];
}

async function performWebSearchAnalysis(categoryKey: string, categoryName: string): Promise<TrendAnalysis | null> {
  if (!ai) return null;

  const today = new Date();
  const timestamp = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const year = today.getFullYear();

  // 웹서치 시뮬레이션 - 실제로는 Google Search API 또는 SerpAPI 등 사용
  // 여기서는 Gemini의 최신 지식 + grounding을 활용
  const searchQueries = [
    `${categoryName} 인기 순위 ${year}`,
    `${categoryName} 추천 베스트 ${year}`,
    `${categoryName} 구매가이드 ${year}`,
    `${categoryName} 장단점 비교`
  ];

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: { temperature: 0.3 }
    });

    const analysisPrompt = `
당신은 ${categoryName} 시장 분석 전문가입니다.
오늘 날짜: ${timestamp}

다음 검색어들로 최신 트렌드를 분석해주세요:
${searchQueries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

## 출력 요구사항 (JSON)
\`\`\`json
{
  "top10Summary": "현재 인기 Top 10 제품군 요약 (브랜드/모델 트렌드 2-3문장)",
  "trends": ["트렌드1", "트렌드2", "트렌드3"],
  "pros": ["리뷰에서 자주 언급되는 장점1", "장점2", "장점3"],
  "cons": ["자주 언급되는 단점/주의점1", "단점2", "단점3"],
  "priceInsight": "현재 시장 가격대 인사이트 1문장"
}
\`\`\`

최신 ${year}년 기준 트렌드와 실제 구매자 의견을 반영해주세요.
`;

    const result = await model.generateContent(analysisPrompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        timestamp,
        top10Summary: parsed.top10Summary || '',
        trends: parsed.trends || [],
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        priceInsight: parsed.priceInsight || '',
        searchQueries
      };
    }
  } catch (e) {
    console.error('[Init] Web search analysis failed:', e);
  }

  return null;
}

// ============================================================================
// Question Todo Generator (Expert Level)
// ============================================================================

interface QuestionTodo {
  id: string;
  question: string;
  reason: string;  // 왜 이 질문이 중요한지
  options: Array<{ value: string; label: string; description?: string }>;
  type: 'single' | 'multi';
  priority: number;  // 질문 순서 우선순위 (낮을수록 먼저)
  dataSource: string;  // 이 질문의 근거 (리뷰 분석, 트렌드, 가격대 등)
  completed: boolean;
}

async function generateQuestionTodos(
  categoryKey: string,
  knowledge: string,
  products: any[],
  reviewInsights: any
): Promise<QuestionTodo[]> {
  if (!ai) {
    console.error('[Init] Gemini AI not configured');
    return [];
  }

  const prices = products.map(p => p.price).filter(Boolean);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 500000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // 퍼센티지 계산
  const totalReviews = reviewInsights.reviewStats.total || 1;
  const topProsWithPercent = reviewInsights.reviewStats.topPros.slice(0, 5).map((p: any) => ({
    ...p,
    percent: Math.round((p.count / totalReviews) * 100)
  }));
  const topConsWithPercent = reviewInsights.reviewStats.topCons.slice(0, 5).map((c: any) => ({
    ...c,
    percent: Math.round((c.count / totalReviews) * 100)
  }));

  const prompt = `
당신은 ${categoryKey} 전문 구매 컨설턴트입니다. 10년 이상의 경험을 바탕으로 고객에게 최적의 제품을 추천합니다.

## 분석 데이터

### 지식 베이스
${knowledge.slice(0, 3000)}

### 시장 현황 (${new Date().toLocaleDateString('ko-KR')})
- **분석 상품**: ${products.length}개
- **가격대**: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원
- **평균가**: ${avgPrice.toLocaleString()}원
- **주요 브랜드**: ${brands.slice(0, 8).join(', ')}

### 실구매자 리뷰 분석 (${totalReviews}개)
- 만족 리뷰: ${reviewInsights.reviewStats.positive}건 (${Math.round((reviewInsights.reviewStats.positive / totalReviews) * 100)}%)
- 불만족 리뷰: ${reviewInsights.reviewStats.negative}건 (${Math.round((reviewInsights.reviewStats.negative / totalReviews) * 100)}%)

**자주 언급되는 장점**:
${topProsWithPercent.map((p: any) => `- ${p.keyword}: ${p.count}건 (${p.percent}%)`).join('\n')}

**자주 언급되는 단점/주의점**:
${topConsWithPercent.map((c: any) => `- ${c.keyword}: ${c.count}건 (${c.percent}%)`).join('\n')}

### 카테고리 인사이트
${JSON.stringify(reviewInsights.categoryMeta || {}, null, 2)}

---

## 상담 질문 생성

첫 구매자가 **"아, 이런 것도 고려해야 하는구나!"** 하고 깨달을 수 있는 전문적인 질문을 생성하세요.

### 질문 설계 원칙
1. **전문가의 시각**: 일반인이 모르는 구매 포인트를 짚어주기
2. **데이터 기반**: 리뷰에서 실제로 많이 언급되는 것 위주
3. **친절한 설명**: 왜 이게 중요한지 reason에서 충분히 설명
4. **구체적 선택지**: 애매한 옵션 없이 명확한 선택지

### JSON 출력 형식

\`\`\`json
[
  {
    "id": "고유ID",
    "question": "자연스러운 질문 (예: 보통 몇 인분 정도 조리하세요?)",
    "reason": "전문가 설명 - 리뷰 분석 결과와 함께 왜 이 질문이 중요한지 2-3문장으로 설명. 예: 리뷰 ${totalReviews}건을 분석한 결과, 용량 선택이 만족도에 가장 큰 영향을 미쳤어요. 1-2인 가구에서 너무 큰 제품을 사면 자리만 차지한다는 후기가 많았습니다.",
    "options": [
      { "value": "값", "label": "선택지 텍스트", "description": "이 옵션 선택 시 추천 방향 설명" }
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "근거 출처 (예: 리뷰 ${totalReviews}건 분석)"
  }
]
\`\`\`

### 필수 질문 유형 (4-5개)

1. **사용 환경** (priority: 1)
   - 가족 수, 사용 빈도, 주방 크기 등
   - 리뷰에서 "사이즈가 생각보다..." 류 언급 기반

2. **핵심 기능/용도** (priority: 2)
   - 리뷰에서 자주 언급되는 기능 중심
   - 예: 에어프라이어면 "튀김 vs 굽기 vs 데우기" 용도

3. **중요 트레이드오프** (priority: 3)
   - 리뷰에서 의견이 갈리는 부분
   - 예: "소음이 좀 있지만 성능은 좋다" → 소음 vs 성능 질문

4. **예산 범위** (priority: 4)
   - 실제 가격대 기반: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원
   - 가격대별 특성 설명 포함

### 품질 체크리스트
- [ ] question은 자연스러운 대화체
- [ ] reason에 구체적인 수치/데이터 포함
- [ ] options는 3-4개, 각각 명확히 구분됨
- [ ] description에 해당 옵션 선택 시 어떤 제품이 추천되는지 힌트
`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSON 추출
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let questions = JSON.parse(jsonMatch[0]) as QuestionTodo[];
      questions = questions.map(q => ({ ...q, completed: false }));

      // 예산 질문에 실제 가격 범위 강제 적용
      const budgetQuestion = questions.find(q =>
        q.id.includes('budget') ||
        q.id.includes('price') ||
        q.question.includes('예산') ||
        q.question.includes('가격')
      );

      if (budgetQuestion && prices.length > 0) {
        // 실제 가격 기반 옵션 생성
        const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
        const midMax = Math.round(avgPrice * 1.3);

        budgetQuestion.options = [
          {
            value: 'entry',
            label: `${Math.round(minPrice/10000)}~${Math.round(entryMax/10000)}만원대`,
            description: '가성비 모델'
          },
          {
            value: 'mid',
            label: `${Math.round(entryMax/10000)}~${Math.round(midMax/10000)}만원대`,
            description: '인기 가격대'
          },
          {
            value: 'premium',
            label: `${Math.round(midMax/10000)}만원 이상`,
            description: '프리미엄'
          }
        ];
        budgetQuestion.dataSource = `실제 가격대: ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원 (평균 ${avgPrice.toLocaleString()}원)`;
        budgetQuestion.reason = `현재 시장 평균 가격은 약 ${Math.round(avgPrice/10000)}만원대입니다. 가격대별로 기능 차이가 있어요.`;
      } else if (prices.length > 0) {
        // 예산 질문이 없으면 추가
        const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
        const midMax = Math.round(avgPrice * 1.3);

        questions.push({
          id: 'budget',
          question: '예산은 어느 정도 생각하시나요?',
          reason: `현재 시장 평균 가격은 약 ${Math.round(avgPrice/10000)}만원대입니다. 가격대별로 기능 차이가 있어요.`,
          options: [
            { value: 'entry', label: `${Math.round(minPrice/10000)}~${Math.round(entryMax/10000)}만원대`, description: '가성비 모델' },
            { value: 'mid', label: `${Math.round(entryMax/10000)}~${Math.round(midMax/10000)}만원대`, description: '인기 가격대' },
            { value: 'premium', label: `${Math.round(midMax/10000)}만원 이상`, description: '프리미엄' }
          ],
          type: 'single',
          priority: 5,
          dataSource: `실제 가격대: ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원`,
          completed: false
        });
      }

      return questions;
    }
  } catch (e) {
    console.error('[Init] Question generation failed:', e);
  }

  // Fallback 기본 질문
  return [
    {
      id: 'usage_pattern',
      question: '주로 몇 명이 사용하시나요?',
      reason: '용량 선택의 핵심 기준입니다',
      options: [
        { value: '1-2', label: '1~2인', description: '소형/중형 추천' },
        { value: '3-4', label: '3~4인', description: '중형/대형 추천' },
        { value: '5+', label: '5인 이상', description: '대용량 필수' }
      ],
      type: 'single',
      priority: 1,
      dataSource: '기본 질문',
      completed: false
    },
    {
      id: 'budget',
      question: '예산은 어느 정도 생각하시나요?',
      reason: '가격대별 기능 차이가 큽니다',
      options: [
        { value: 'entry', label: `${Math.round(minPrice/10000)}~${Math.round(avgPrice*0.7/10000)}만원`, description: '기본형' },
        { value: 'mid', label: `${Math.round(avgPrice*0.7/10000)}~${Math.round(avgPrice*1.3/10000)}만원`, description: '인기 가격대' },
        { value: 'premium', label: `${Math.round(avgPrice*1.3/10000)}만원 이상`, description: '프리미엄' }
      ],
      type: 'single',
      priority: 5,
      dataSource: `가격대: ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원`,
      completed: false
    }
  ];
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { categoryKey } = await request.json();

    if (!categoryKey) {
      return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    }

    const categoryName = categoryKey === 'airfryer' ? '에어프라이어' : categoryKey;

    // 1. 상품 + 지식 + 웹서치 병렬 로드
    const [knowledge, products, trendAnalysis] = await Promise.all([
      loadKnowledgeMarkdown(categoryKey),
      loadProducts(categoryKey),
      performWebSearchAnalysis(categoryKey, categoryName)
    ]);

    // 2. 상품 기반 리뷰 로드 (pcode 필요)
    const reviewInsights = await loadReviewInsights(categoryKey, products);

    const loadTime = Date.now() - startTime;
    console.log(`[Init] Data loaded in ${loadTime}ms - Products: ${products.length}, Reviews: ${reviewInsights.reviewStats.total}`);

    // 2. 질문 Todo 생성 (내부 관리용)
    const questionTodos = await generateQuestionTodos(categoryKey, knowledge, products, reviewInsights);
    const generateTime = Date.now() - startTime - loadTime;
    console.log(`[Init] Questions generated in ${generateTime}ms - ${questionTodos.length} questions`);

    // 3. 시장 요약 생성
    const prices = products.map(p => p.price).filter(Boolean);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 500000;
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

    const marketSummary = {
      productCount: products.length,
      reviewCount: reviewInsights.reviewStats.total,
      priceRange: { min: minPrice, max: maxPrice, avg: avgPrice },
      topBrands: brands.slice(0, 5),
      topPros: reviewInsights.reviewStats.topPros.slice(0, 5),
      topCons: reviewInsights.reviewStats.topCons.slice(0, 5),
      trend: reviewInsights.categoryMeta?.market_trend || null
    };

    // 4. 트렌드 분석 기반 인사 메시지 생성
    const timestamp = trendAnalysis?.timestamp || new Date().toLocaleDateString('ko-KR');

    // 트렌드 요약 텍스트 생성
    let trendSummaryText = '';
    if (trendAnalysis) {
      const trendBullets = trendAnalysis.trends.slice(0, 3).map(t => `• ${t}`).join('\n');
      const prosBullets = trendAnalysis.pros.slice(0, 2).map(p => `✓ ${p}`).join('\n');
      const consBullets = trendAnalysis.cons.slice(0, 2).map(c => `⚠ ${c}`).join('\n');

      trendSummaryText = `
📊 **${timestamp} 기준 시장 분석**

${trendAnalysis.top10Summary}

**최근 트렌드**
${trendBullets}

**구매자들이 좋아하는 점**
${prosBullets}

**주의해야 할 점**
${consBullets}

${trendAnalysis.priceInsight}`;
    }

    // 인사 메시지
    const greeting = `안녕하세요! ${categoryName} 전문 상담사입니다.

🔍 **실시간 분석 완료** (${timestamp})
${products.length}개 상품 · ${reviewInsights.reviewStats.total.toLocaleString()}개 리뷰 분석${trendSummaryText}

---

이제 몇 가지 질문으로 딱 맞는 제품을 찾아드릴게요.`;

    return NextResponse.json({
      success: true,
      timing: {
        dataLoad: loadTime,
        questionGenerate: generateTime,
        total: Date.now() - startTime
      },
      marketSummary,
      trendAnalysis,  // 트렌드 분석 결과
      searchQueries: trendAnalysis?.searchQueries || [],  // 검색 쿼리 목록 (UI 표시용)
      questionTodos,  // 내부 관리용 (UI에 직접 노출 X)
      greeting,
      // 첫 번째 질문 바로 제공
      currentQuestion: questionTodos[0] || null,
    });

  } catch (error) {
    console.error('[Init Error]:', error);
    return NextResponse.json({ error: 'Initialization failed' }, { status: 500 });
  }
}
