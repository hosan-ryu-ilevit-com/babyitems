/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Initialization API v5
 *
 * V5 변경사항:
 * - 리뷰 크롤링 제거 (속도 개선)
 * - 상품 스펙 크롤링 강화
 * - 웹검색 트렌드 기반 분석
 *
 * 플로우:
 * [Phase 1] 병렬: 웹검색 + 상품크롤링 (5-10초)
 * [Phase 2] Flash Lite 필터링 (1-2초)
 * [Phase 3] 질문 생성 + 메모리 업데이트 (2-4초)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// 메모리 시스템
import {
  loadLongTermMemory,
  saveShortTermMemory,
  saveLongTermMemory,
  initializeShortTermMemory,
} from '@/lib/knowledge-agent/memory-manager';
import { generateLongTermMarkdown } from '@/lib/knowledge-agent/markdown-parser';
import type { WebSearchInsight, ProductKnowledge, LongTermMemoryData } from '@/lib/knowledge-agent/types';
import { CATEGORY_NAME_MAP } from '@/lib/knowledge-agent/types';

// 다나와 크롤러
import { crawlDanawaSearchListLite } from '@/lib/danawa/search-crawler-lite';
import type { DanawaSearchListItem } from '@/lib/danawa/search-crawler';
import { getQueryCache, setQueryCache } from '@/lib/knowledge-agent/cache-manager';

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// ============================================================================
// Types
// ============================================================================

interface TrendAnalysis {
  timestamp: string;
  top10Summary: string;
  trends: string[];
  pros: string[];
  cons: string[];
  priceInsight: string;
  searchQueries: string[];
  sources: Array<{ title: string; url: string; snippet?: string }>;
}

interface QuestionTodo {
  id: string;
  question: string;
  reason: string;
  options: Array<{ value: string; label: string; description?: string }>;
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
  completed: boolean;
}

interface StepTiming {
  step: string;
  duration: number;
  details?: string;
}

// ============================================================================
// Step 1: Web Search (Google Search Grounding) - 캐싱 최적화
// ============================================================================

// 웹서치 캐시 (메모리 캐시, 1시간 유효)
const webSearchCache = new Map<string, { data: TrendAnalysis; expiry: number }>();
const WEB_SEARCH_CACHE_TTL = 60 * 60 * 1000; // 1시간

function getWebSearchCache(keyword: string): TrendAnalysis | null {
  const cached = webSearchCache.get(keyword);
  if (cached && cached.expiry > Date.now()) {
    console.log(`[Step1] Web search cache HIT for: ${keyword}`);
    return cached.data;
  }
  if (cached) {
    webSearchCache.delete(keyword); // 만료된 캐시 삭제
  }
  return null;
}

function setWebSearchCache(keyword: string, data: TrendAnalysis): void {
  webSearchCache.set(keyword, {
    data,
    expiry: Date.now() + WEB_SEARCH_CACHE_TTL,
  });
  console.log(`[Step1] Web search cached for: ${keyword} (expires in 1h)`);
}

async function performWebSearchAnalysis(searchKeyword: string): Promise<TrendAnalysis | null> {
  if (!ai) return null;

  // 캐시 확인
  const cached = getWebSearchCache(searchKeyword);
  if (cached) return cached;

  const today = new Date();
  const timestamp = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const year = today.getFullYear();

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
      tools: [{ google_search: {} } as never]
    });

    // 디테일한 프롬프트 (캐싱으로 속도 보완)
    const analysisPrompt = `"${searchKeyword} ${year}년 추천 순위" 검색하여 분석 후 JSON 응답:

{
  "top10Summary": "${searchKeyword} 시장 현황 2-3문장 (인기 브랜드, 주요 트렌드 포함)",
  "trends": ["${year}년 핵심 트렌드 1 (구체적)", "${year}년 핵심 트렌드 2", "최근 인기 기능/특징"],
  "pros": ["구매자들이 자주 언급하는 장점 1 (구체적)", "장점 2", "장점 3"],
  "cons": ["자주 언급되는 단점/주의점 1 (구체적)", "단점 2", "단점 3"],
  "priceInsight": "현재 가격대별 특징 1-2문장 (엔트리/중급/프리미엄)"
}`;

    const startTime = Date.now();
    const result = await model.generateContent(analysisPrompt);
    const response = result.response;
    const text = response.text();
    console.log(`[Step1] Web search completed in ${Date.now() - startTime}ms`);

    // groundingMetadata에서 검색 쿼리와 출처 추출
    const candidate = (response as any).candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const webSearchQueries: string[] = groundingMetadata?.webSearchQueries || [];
    const groundingChunks = groundingMetadata?.groundingChunks || [];

    const sources = groundingChunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web?.title || 'Unknown',
        url: chunk.web?.uri || '',
      }))
      .slice(0, 5);

    if (sources.length === 0) {
      sources.push({
        title: `다나와 ${searchKeyword} 인기순위`,
        url: `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(searchKeyword)}&sort=saveDESC`,
      });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const trendData: TrendAnalysis = {
        timestamp,
        top10Summary: parsed.top10Summary || '',
        trends: parsed.trends || [],
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        priceInsight: parsed.priceInsight || '',
        searchQueries: webSearchQueries.length > 0 ? webSearchQueries : [`${searchKeyword} ${year} 추천`],
        sources
      };

      // 캐시에 저장
      setWebSearchCache(searchKeyword, trendData);
      return trendData;
    }

    return { timestamp, top10Summary: '', trends: [], pros: [], cons: [], priceInsight: '', searchQueries: [], sources };
  } catch (e) {
    console.error('[Step1] Web search failed:', e);
    return null;
  }
}

// ============================================================================
// Step 2: Product Crawling (Danawa)
// ============================================================================

async function crawlProducts(
  _categoryKey: string,
  categoryName: string
): Promise<{ products: DanawaSearchListItem[]; cached: boolean; searchUrl: string }> {
  console.log(`[Step2] Crawling products for: ${categoryName}`);

  // 캐시 확인
  const cached = getQueryCache(categoryName);
  if (cached && cached.items.length > 0) {
    console.log(`[Step2] Cache hit: ${cached.items.length} products`);
    return { products: cached.items, cached: true, searchUrl: cached.searchUrl };
  }

  // Lite 크롤러 사용 (0.5-2초)
  const response = await crawlDanawaSearchListLite({
    query: categoryName,
    limit: 40,
    sort: 'saveDESC',
  });

  if (response.success && response.items.length > 0) {
    setQueryCache(response);
    console.log(`[Step2] Crawled ${response.items.length} products`);
    return { products: response.items, cached: false, searchUrl: response.searchUrl };
  }

  console.error('[Step2] Crawling failed:', response.error);
  return { products: [], cached: false, searchUrl: response.searchUrl };
}

// ============================================================================
// Step 2.5: Category Relevance Filtering (Flash Lite)
// ============================================================================

async function filterRelevantProducts(
  query: string,
  products: DanawaSearchListItem[]
): Promise<DanawaSearchListItem[]> {
  if (!ai || products.length === 0) return products;

  console.log(`[Step2.5] Filtering ${products.length} products for relevance`);

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const productList = products.map((p, i) => `${i + 1}. ${p.name}`).join('\n');

    const prompt = `사용자가 "${query}"를 검색했습니다.

아래 상품 목록에서 "${query}"와 관련된 상품의 번호만 콤마로 구분해서 출력하세요.
관련 없는 상품(다른 카테고리, 악세서리, 소모품, 부품)은 제외합니다.

상품 목록:
${productList}

관련 상품 번호 (예: 1,2,5,7):`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    const relevantIndices = response
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= products.length)
      .map(n => n - 1);

    const filtered = relevantIndices.map(i => products[i]).filter(Boolean);

    console.log(`[Step2.5] Filtered: ${products.length} → ${filtered.length} products`);
    return filtered.length > 0 ? filtered : products.slice(0, 20);
  } catch (e) {
    console.error('[Step2.5] Filtering failed:', e);
    return products.slice(0, 20);
  }
}


// ============================================================================
// Step 4: Question Generation (Data-Driven)
// ============================================================================

/**
 * 상품들의 스펙 분포를 분석하여 "선택지가 갈리는 스펙"을 추출
 * 예: 용량이 1L/2L/3L로 나뉘면 → "용량: 1L, 2L, 3L" 반환
 */
function analyzeSpecDistribution(products: DanawaSearchListItem[]): string {
  const specMap: Record<string, Map<string, number>> = {};

  products.forEach(p => {
    if (!p.specSummary) return;

    // specSummary 파싱: "용량: 2L / 무게: 1.5kg / ..." 또는 "용량:2L|무게:1.5kg" 형태
    const parts = p.specSummary.split(/[|\/,]/).map(s => s.trim());
    parts.forEach(part => {
      // "키:값" 또는 "키 값" 형태 처리
      let key = '', value = '';
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        key = part.slice(0, colonIdx).trim();
        value = part.slice(colonIdx + 1).trim();
      } else {
        // 첫 단어가 키, 나머지가 값
        const spaceIdx = part.indexOf(' ');
        if (spaceIdx > 0) {
          key = part.slice(0, spaceIdx).trim();
          value = part.slice(spaceIdx + 1).trim();
        }
      }

      if (key && value && key.length < 15 && value.length < 30) {
        if (!specMap[key]) specMap[key] = new Map();
        specMap[key].set(value, (specMap[key].get(value) || 0) + 1);
      }
    });
  });

  // 2개 이상 다양한 값이 있는 스펙만 (= 선택지가 갈리는 스펙)
  const meaningfulSpecs = Object.entries(specMap)
    .filter(([, values]) => values.size >= 2)
    .map(([key, values]) => {
      const sortedValues = [...values.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([v, count]) => `${v}(${count}개)`);
      return `- **${key}**: ${sortedValues.join(', ')}`;
    })
    .slice(0, 8)
    .join('\n');

  return meaningfulSpecs || '(스펙 데이터 분석 중)';
}

/**
 * 상품명에서 공통 키워드/패턴 추출 (카테고리 특성 파악용)
 */
function extractProductPatterns(products: DanawaSearchListItem[]): string[] {
  const wordCount: Record<string, number> = {};

  products.forEach(p => {
    // 상품명에서 의미있는 단어 추출 (2-10자)
    const words = p.name.match(/[가-힣a-zA-Z0-9]{2,10}/g) || [];
    words.forEach(word => {
      // 브랜드명, 숫자만 있는 것 제외
      if (!/^\d+$/.test(word) && word !== p.brand) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
  });

  // 30% 이상 상품에서 등장하는 키워드
  const threshold = Math.max(2, products.length * 0.3);
  return Object.entries(wordCount)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

async function generateQuestions(
  _categoryKey: string,
  categoryName: string,
  products: DanawaSearchListItem[],
  trendAnalysis: TrendAnalysis | null,
  knowledge: string
): Promise<QuestionTodo[]> {
  if (!ai) return getDefaultQuestions(categoryName, products, trendAnalysis);

  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 500000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // 스펙 분포 분석 (핵심!)
  const specDistribution = analyzeSpecDistribution(products);
  const productKeywords = extractProductPatterns(products);

  // 웹서치 트렌드
  const trendsText = trendAnalysis?.trends.map((t, i) => `${i + 1}. ${t}`).join('\n') || '';
  const prosFromWeb = trendAnalysis?.pros.map(p => `- ${p}`).join('\n') || '';
  const consFromWeb = trendAnalysis?.cons.map(c => `- ${c}`).join('\n') || '';

  // 상위 5개 상품 샘플 (LLM이 카테고리 특성 파악하도록)
  const topProductsSample = products.slice(0, 5)
    .map((p, i) => `${i + 1}. ${p.name} (${p.price?.toLocaleString()}원) - ${p.specSummary || ''}`)
    .join('\n');

  const prompt = `당신은 "${categoryName}" 구매 전문 컨설턴트입니다.

아래 **실시간 데이터**를 꼼꼼히 분석하여, 이 제품을 **처음 구매하는 사람**이 정말 도움받을 수 있는 핵심 질문들을 생성하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 실시간 분석 데이터 (${new Date().toLocaleDateString('ko-KR')})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1️⃣ 웹서치 트렌드
${trendAnalysis ? `
**요즘 트렌드:**
${trendsText || '(분석 중)'}

**구매자들이 좋아하는 점:**
${prosFromWeb || '(분석 중)'}

**주의해야 할 점:**
${consFromWeb || '(분석 중)'}

**가격 동향:** ${trendAnalysis.priceInsight || '(분석 중)'}
` : '(웹서치 데이터 없음)'}

### 2️⃣ 인기 상품 스펙 분석 (${products.length}개 상품)
- **가격대**: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원 (평균 ${avgPrice.toLocaleString()}원)
- **주요 브랜드**: ${brands.slice(0, 8).join(', ')}
- **상품명 키워드**: ${productKeywords.join(', ') || '(분석 중)'}

**📌 스펙별 분포 (선택지가 갈리는 부분):**
${specDistribution}

**상위 인기상품 예시:**
${topProductsSample}

### 3️⃣ 축적된 지식
${knowledge.slice(0, 1500) || '(신규 카테고리)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 질문 생성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ❌ 절대 하지 말 것
1. **위 데이터와 무관한 범용 질문 금지**
   - 나쁜 예: 스펙 분포에 "용량"이 없는데 "용량이 얼마나 필요하세요?" 질문
   - 나쁜 예: 개인용 제품인데 "몇 명이 사용하나요?" 질문 (카시트, 스마트폰, 이어폰 등)

2. **전문용어를 설명 없이 사용 금지**
   - 나쁜 예: "ISOFIX를 원하시나요?"
   - 좋은 예: "ISOFIX(카시트를 차에 단단히 고정하는 장치)가 필요하신가요?"

## ✅ 반드시 해야 할 것
1. **스펙 분포에서 선택지가 갈리는 부분 → 질문으로**
   - 예: 스펙에 "용량: 1L(5개), 2L(8개), 3L(7개)"가 있으면 → 용량 질문 생성

2. **웹서치 트렌드에서 장/단점이 갈리는 부분 → 트레이드오프 질문으로**
   - 예: 장점에 "가벼움", 단점에 "흔들림"이 있으면 → "가벼움 vs 안정감" 질문

3. **트렌드에서 중요한 기능 → 해당 기능 필요 여부 질문**
   - 예: 트렌드에 "360도 회전"이 있으면 → 회전 기능 필요 여부 질문

4. **reason(팁)에서 "왜 중요한지" 친절하게 설명**
   - 데이터 근거 포함: "최근 트렌드 분석 결과..."
   - 실용적 조언: "~한 분들은 ~를 선택하면 후회가 적어요"

## 📋 질문 우선순위
1. **핵심 스펙** - 스펙 분포에서 선택지가 명확히 갈리는 것 (데이터 기반!)
2. **사용 맥락** - 이 카테고리에 맞는 실제 사용 상황 (데이터 기반!)
3. **트레이드오프** - 웹서치에서 장단점이 갈리는 부분 (데이터 기반!)
4. **예산** - 실제 가격대 기반, 마지막 질문으로

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 JSON 출력 (3-5개 질문)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`\`\`json
[
  {
    "id": "영문_snake_case_id",
    "question": "쉽고 자연스러운 질문 (전문용어는 괄호 안에 쉬운 설명)",
    "reason": "💡 [데이터 근거] 왜 중요한지 친절하게 2문장. 예: 최근 트렌드 분석 결과, ~한 분들이 많았어요. ~를 선택하면 ~한 장점이 있어요.",
    "options": [
      { "value": "option1", "label": "선택지1 (쉬운 말)", "description": "어떤 분에게 맞는지" },
      { "value": "option2", "label": "선택지2 (쉬운 말)", "description": "어떤 분에게 맞는지" }
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "근거 출처 (예: 스펙 분포 분석, 리뷰 127건)"
  }
]
\`\`\`

위 데이터를 꼼꼼히 분석하여, "${categoryName}"을 처음 사는 사람이 **"아, 이런 것도 생각해야 하는구나!"** 하고 감동할 수 있는 질문을 만들어주세요.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let questions = JSON.parse(jsonMatch[0]) as QuestionTodo[];
      questions = questions.map(q => ({ ...q, completed: false }));

      // 예산 질문 보정
      const budgetQ = questions.find(q =>
        q.id.includes('budget') || q.question.includes('예산') || q.question.includes('가격')
      );
      if (budgetQ && prices.length > 0) {
        const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
        const midMax = Math.round(avgPrice * 1.3);
        budgetQ.options = [
          { value: 'entry', label: `${Math.round(minPrice/10000)}~${Math.round(entryMax/10000)}만원대`, description: '가성비 모델' },
          { value: 'mid', label: `${Math.round(entryMax/10000)}~${Math.round(midMax/10000)}만원대`, description: '인기 가격대' },
          { value: 'premium', label: `${Math.round(midMax/10000)}만원 이상`, description: '프리미엄' }
        ];
      }

      return questions;
    }
  } catch (e) {
    console.error('[Step4] Question generation failed:', e);
  }

  return getDefaultQuestions(categoryName, products, trendAnalysis);
}

/**
 * LLM 호출 실패 시 fallback - 데이터 기반 기본 질문 생성
 */
function getDefaultQuestions(
  categoryName: string,
  products: DanawaSearchListItem[],
  trendAnalysis: TrendAnalysis | null
): QuestionTodo[] {
  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 50000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;

  // 스펙 분포에서 가장 다양한 스펙 찾기
  const specDistribution = analyzeSpecDistribution(products);

  const questions: QuestionTodo[] = [];

  // 1. 웹서치 트렌드 기반 트레이드오프 질문 (장점 vs 단점이 있으면)
  const topPros = trendAnalysis?.pros || [];
  const topCons = trendAnalysis?.cons || [];

  if (topPros.length > 0 && topCons.length > 0) {
    questions.push({
      id: 'tradeoff_trend',
      question: `${categoryName} 선택 시 더 중요한 것은?`,
      reason: `💡 최근 트렌드 분석 결과, "${topPros[0]}"를 선호하는 분과 "${topCons[0]}"를 걱정하는 분이 많았어요.`,
      options: [
        { value: 'pro', label: topPros[0].slice(0, 20), description: '많은 분들이 선호' },
        { value: 'avoid_con', label: `${topCons[0].slice(0, 15)} 피하기`, description: '주의가 필요한 부분' }
      ],
      type: 'single',
      priority: 1,
      dataSource: '웹서치 트렌드 분석',
      completed: false
    });
  }

  // 2. 예산 질문 (실제 가격대 기반)
  const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
  const midMax = Math.round(avgPrice * 1.3);
  questions.push({
    id: 'budget',
    question: '예산은 어느 정도 생각하시나요?',
    reason: `💡 현재 ${categoryName} 가격대는 ${Math.round(minPrice/10000)}만원~${Math.round(prices.length ? Math.max(...prices)/10000 : avgPrice*2/10000)}만원이에요. 가격대별로 기능 차이가 있어요.`,
    options: [
      { value: 'entry', label: `${Math.round(minPrice/10000)}~${Math.round(entryMax/10000)}만원대`, description: '가성비 모델' },
      { value: 'mid', label: `${Math.round(entryMax/10000)}~${Math.round(midMax/10000)}만원대`, description: '인기 가격대' },
      { value: 'premium', label: `${Math.round(midMax/10000)}만원 이상`, description: '프리미엄' }
    ],
    type: 'single',
    priority: 5,
    dataSource: `${products.length}개 상품 가격 분석`,
    completed: false
  });

  console.log(`[DefaultQuestions] Generated ${questions.length} fallback questions (spec: ${specDistribution.slice(0, 50)}...)`);
  return questions;
}

// ============================================================================
// Helper: Update Long-term Memory (리뷰 없이 상품+트렌드만)
// ============================================================================

function updateLongTermMemory(
  categoryKey: string,
  categoryName: string,
  products: DanawaSearchListItem[],
  trendAnalysis: TrendAnalysis | null
): LongTermMemoryData {
  // 기존 장기기억 로드 또는 새로 생성
  let longTermData = loadLongTermMemory(categoryKey);

  if (!longTermData) {
    longTermData = {
      categoryKey,
      categoryName,
      lastUpdated: new Date().toISOString(),
      productCount: products.length,
      reviewCount: 0,
      trends: { items: [], pros: [], cons: [], priceInsight: '' },
      products: [],
      buyingGuide: { byUserType: {}, byBudget: {}, commonMistakes: [] },
      sources: [],
    };
  }

  // 상품 정보 업데이트 (리뷰 데이터 없이 상품 스펙만 활용)
  longTermData.products = products.slice(0, 20).map((p, index): ProductKnowledge => {
    // specSummary 파싱하여 specs 객체로 변환
    const specs: Record<string, string> = {};
    if (p.specSummary) {
      const parts = p.specSummary.split(/[|\/]/).map(s => s.trim());
      parts.forEach(part => {
        const colonIdx = part.indexOf(':');
        if (colonIdx > 0) {
          const key = part.slice(0, colonIdx).trim();
          const value = part.slice(colonIdx + 1).trim();
          if (key && value) specs[key] = value;
        }
      });
    }

    return {
      rank: index + 1,
      pcode: p.pcode,
      name: p.name,
      brand: p.brand || '',
      price: p.price || 0,
      rating: p.rating || 0,
      reviewCount: p.reviewCount || 0,
      specs,
      thumbnail: p.thumbnail || null,
      specSummary: p.specSummary || '',
      productUrl: p.productUrl || `https://prod.danawa.com/info/?pcode=${p.pcode}`,
      prosFromReviews: [],  // 리뷰 크롤링 제거로 빈 배열
      consFromReviews: [],  // 리뷰 크롤링 제거로 빈 배열
      recommendedFor: '',
    };
  });

  // 트렌드 정보 업데이트
  if (trendAnalysis) {
    longTermData.trends = {
      items: trendAnalysis.trends,
      pros: trendAnalysis.pros,
      cons: trendAnalysis.cons,
      priceInsight: trendAnalysis.priceInsight,
    };
    longTermData.sources = trendAnalysis.sources;
  }

  // 상품 수 업데이트 (리뷰 수는 PLP에서 가져온 값 합산)
  longTermData.reviewCount = products.reduce((sum, p) => sum + (p.reviewCount || 0), 0);
  longTermData.productCount = products.length;
  longTermData.lastUpdated = new Date().toISOString();

  // 저장
  saveLongTermMemory(categoryKey, longTermData);
  console.log(`[Memory] Long-term memory updated: ${longTermData.products.length} products`);

  return longTermData;
}

// ============================================================================
// Helper: Load Knowledge Markdown
// ============================================================================

function loadKnowledgeMarkdown(categoryKey: string): string {
  const indexPath = path.join(process.cwd(), 'data', 'knowledge', categoryKey, 'index.md');
  try {
    if (fs.existsSync(indexPath)) {
      return fs.readFileSync(indexPath, 'utf-8');
    }
  } catch (e) {
    console.error('[Init] Failed to load index.md:', e);
  }
  return '';
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const timings: StepTiming[] = [];

  try {
    const { categoryKey } = await request.json();

    if (!categoryKey) {
      return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    }

    const categoryName = CATEGORY_NAME_MAP[categoryKey] || categoryKey;
    console.log(`\n========================================`);
    console.log(`[Init V5] Starting for: ${categoryName}`);
    console.log(`========================================\n`);

    // ============================================================================
    // Phase 1: Parallel Execution (웹검색 + 상품크롤링)
    // ============================================================================
    const phase1Start = Date.now();
    console.log(`[Phase 1] Starting parallel: Web Search + Product Crawling`);

    const [trendAnalysis, crawlResult] = await Promise.all([
      performWebSearchAnalysis(categoryName),
      crawlProducts(categoryKey, categoryName),
    ]);

    const phase1Duration = Date.now() - phase1Start;
    timings.push({ step: 'phase1_parallel', duration: phase1Duration, details: `웹검색+크롤링` });
    console.log(`[Phase 1] Completed in ${phase1Duration}ms`);

    let products = crawlResult.products;
    const wasCached = crawlResult.cached;
    const searchUrl = crawlResult.searchUrl;

    // ============================================================================
    // Phase 2: Category Filtering (Flash Lite)
    // ============================================================================
    const phase2Start = Date.now();
    console.log(`\n[Phase 2] Starting: Category Filtering`);

    if (!wasCached && products.length > 20) {
      products = await filterRelevantProducts(categoryName, products);
    } else {
      products = products.slice(0, 40); // 캐시된 경우 상위 25개만
    }

    const phase2Duration = Date.now() - phase2Start;
    timings.push({ step: 'phase2_filter', duration: phase2Duration, details: `${products.length}개 필터링` });
    console.log(`[Phase 2] Completed in ${phase2Duration}ms - ${products.length} products`);

    // ============================================================================
    // Phase 3: Question Generation + Memory Update (리뷰 크롤링 제거)
    // ============================================================================
    const phase3Start = Date.now();
    console.log(`\n[Phase 3] Starting: Question Generation + Memory Update`);

    // 장기기억 업데이트 (병렬)
    const [longTermData, knowledge] = await Promise.all([
      Promise.resolve(updateLongTermMemory(categoryKey, categoryName, products, trendAnalysis)),
      Promise.resolve(loadKnowledgeMarkdown(categoryKey)),
    ]);

    // 질문 생성 (리뷰 데이터 없이 웹서치 트렌드 + 상품 스펙 기반)
    const questionTodos = await generateQuestions(
      categoryKey,
      categoryName,
      products,
      trendAnalysis,
      knowledge || generateLongTermMarkdown(longTermData)
    );

    const phase3Duration = Date.now() - phase3Start;
    timings.push({ step: 'phase3_questions', duration: phase3Duration, details: `${questionTodos.length}개 질문` });
    console.log(`[Phase 3] Completed in ${phase3Duration}ms - ${questionTodos.length} questions`);

    // ============================================================================
    // Finalize: Short-term Memory + Response
    // ============================================================================
    const shortTermMemory = initializeShortTermMemory(categoryKey, categoryName, products.length);

    if (trendAnalysis) {
      const webSearchInsight: WebSearchInsight = {
        phase: 'init',
        query: trendAnalysis.searchQueries[0] || categoryName,
        insight: trendAnalysis.top10Summary,
        sources: trendAnalysis.sources.map(s => ({ title: s.title, url: s.url })),
        timestamp: new Date().toISOString(),
      };
      shortTermMemory.webSearchInsights.push(webSearchInsight);
    }

    shortTermMemory.filteredCandidates = products.slice(0, 20).map(p => ({
      pcode: p.pcode,
      name: p.name,
      brand: p.brand || '',
      price: p.price || 0,
      rating: p.rating || 0,
      reviewCount: p.reviewCount || 0,
      specs: {},
    }));

    saveShortTermMemory(categoryKey, shortTermMemory);

    const totalTime = Date.now() - startTime;
    console.log(`\n========================================`);
    console.log(`[Init V5] Total time: ${totalTime}ms`);
    timings.forEach(t => console.log(`  - ${t.step}: ${t.duration}ms (${t.details})`));
    console.log(`========================================\n`);

    // 가격 통계
    const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
    const priceStats = {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 500000,
      avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000,
    };

    // 브랜드 통계
    const brandCounts: Record<string, number> = {};
    products.forEach(p => {
      if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
    });
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // 마켓 요약 (리뷰 크롤링 제거 - 웹서치 트렌드 기반)
    const totalReviewCount = products.reduce((sum, p) => sum + (p.reviewCount || 0), 0);
    const avgRating = products.filter(p => p.rating).reduce((sum, p, _, arr) => sum + (p.rating || 0) / arr.length, 0);

    const marketSummary = {
      productCount: products.length,
      reviewCount: totalReviewCount,
      priceRange: priceStats,
      topBrands,
      // 웹서치 트렌드에서 장단점 가져오기
      topPros: (trendAnalysis?.pros || []).slice(0, 5).map(p => ({ keyword: p, count: 0 })),
      topCons: (trendAnalysis?.cons || []).slice(0, 5).map(c => ({ keyword: c, count: 0 })),
      avgRating: Math.round(avgRating * 10) / 10,
    };

    return NextResponse.json({
      success: true,
      sessionId: shortTermMemory.sessionId,
      categoryKey,
      categoryName,

      // 타이밍 정보 (클라이언트 UI용)
      timing: {
        phase1_webSearch_crawl: phase1Duration,
        phase2_filter: phase2Duration,
        phase3_questions: phase3Duration,
        total: totalTime,
        steps: timings,
      },

      // 분석 결과
      marketSummary,
      trendAnalysis,

      // 메모리 상태
      memoryStatus: {
        hasLongTermMemory: true,
        longTermLastUpdated: longTermData.lastUpdated,
        shortTermSessionId: shortTermMemory.sessionId,
      },

      // UI용 데이터
      searchQueries: trendAnalysis?.searchQueries || [],
      searchUrl,
      wasCached,
      questionTodos,
      currentQuestion: questionTodos[0] || null,

      // 상품 목록
      products: products.map(p => ({
        pcode: p.pcode,
        name: p.name,
        brand: p.brand,
        price: p.price,
        thumbnail: p.thumbnail,
        reviewCount: p.reviewCount || 0,
        rating: p.rating || 0,
        specSummary: p.specSummary,
      })),
    });

  } catch (error) {
    console.error('[Init V5 Error]:', error);
    return NextResponse.json({ error: 'Initialization failed' }, { status: 500 });
  }
}
