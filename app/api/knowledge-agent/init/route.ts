/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent Initialization API v6 (Streaming)
 *
 * V6 변경사항:
 * - SSE(Server-Sent Events) 스트리밍 지원
 * - 상품 데이터 실시간 전송 (5개씩 배치)
 * - 단계별 진행상황 실시간 업데이트
 *
 * 플로우:
 * [Phase 1] 병렬: 웹검색 + 상품크롤링 (스트리밍)
 * [Phase 2] Flash Lite 필터링
 * [Phase 3] 질문 생성 + 메모리 업데이트
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
    console.log(`[Step1] Web search cache HIT for: "${keyword}"`);
    return cached.data;
  }
  if (cached) {
    console.log(`[Step1] Web search cache EXPIRED for: "${keyword}"`);
    webSearchCache.delete(keyword); // 만료된 캐시 삭제
  }
  return null;
}

// 캐시 클리어 함수 (디버깅용)
export function clearWebSearchCache(): void {
  const size = webSearchCache.size;
  webSearchCache.clear();
  console.log(`[WebSearchCache] Cleared ${size} entries`);
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

  console.log(`[Step1] performWebSearchAnalysis called with keyword: "${searchKeyword}"`);

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
      tools: [{ google_search: {} } as never]
    });

    // 검색어를 명확하게 지정하는 프롬프트
    const analysisPrompt = `## 검색 지시사항
⚠️ 중요: 정확히 "${searchKeyword}"를 검색하세요. 유사한 단어나 다른 제품으로 바꾸지 마세요.
검색어: "${searchKeyword} ${year}년 추천 순위 및 실사용 후기"

📅 **오늘 날짜: ${timestamp}**

⚠️ **정보 신선도 주의사항:**
- 오늘은 ${year}년 ${today.getMonth() + 1}월입니다. 이미 출시되어 판매 중인 제품을 "출시 예정"이라고 하지 마세요.
- 검색 결과의 날짜를 확인하고, 1년 이상 지난 정보는 "과거 정보"로 표시하세요.
- 현재 쇼핑몰에서 판매 중인 모델은 "현재 인기", "판매 중"으로 표현하세요.
- 예: 아이폰 17이 이미 판매 중이라면 "2026년 출시 예정"이 아니라 "현재 인기 모델"로 표현

"${searchKeyword}" 제품에 대한 검색 결과를 분석 후 JSON 응답:

{
  "top10Summary": "${searchKeyword} 시장 현황 2-3문장 (현재 인기 브랜드, ${year}년 현재 트렌드 - 이미 출시된 제품 기준)",
  "trends": ["${year}년 ${today.getMonth() + 1}월 현재 핵심 트렌드 1", "현재 인기 기능/특징 2", "최신 기술 동향 3"],
  "pros": [
    "실제 사용자가 리뷰에서 가장 많이 칭찬하는 핵심 키워드 1 (예: '압도적인 흡입력', '가벼운 무게')",
    "리뷰 키워드 2",
    "리뷰 키워드 3"
  ],
  "cons": [
    "실제 사용자가 리뷰에서 가장 많이 불평하는 핵심 키워드 1 (예: '짧은 배터리', '느린 충전 속도')",
    "리뷰 키워드 2",
    "리뷰 키워드 3"
  ],
  "priceInsight": "현재 판매 중인 제품의 가격대별 특징 1-2문장 (엔트리/중급/프리미엄)"
}

주의:
- pros와 cons는 마치 수천 건의 실제 구매 리뷰에서 자연어 처리(NLP)로 추출한 것 같은 짧고 명확한 '키워드' 형태여야 합니다.
- "~해서 좋아요" 보다는 "뛰어난 가성비", "간편한 세척" 처럼 명사형 키워드를 선호합니다.
- "출시 예정", "발표 예정" 표현은 실제로 아직 출시되지 않은 제품에만 사용하세요.`;

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

    // 🔴 중요: 실제로 Gemini가 검색한 쿼리 로깅
    console.log(`[Step1] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Step1] 🔍 요청한 검색어: "${searchKeyword}"`);
    console.log(`[Step1] 🔍 실제 검색 쿼리: ${webSearchQueries.join(', ') || '(없음)'}`);

    // 검색어 불일치 경고
    if (webSearchQueries.length > 0) {
      const hasKeyword = webSearchQueries.some(q => q.includes(searchKeyword));
      if (!hasKeyword) {
        console.warn(`[Step1] ⚠️ 검색어 불일치! 요청: "${searchKeyword}" → 실제: "${webSearchQueries[0]}"`);
      }
    }
    console.log(`[Step1] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
// Step 2: Product Crawling (Danawa) - 스트리밍 지원
// ============================================================================

async function crawlProductsWithStreaming(
  _categoryKey: string,
  categoryName: string,
  onProductBatch?: (products: DanawaSearchListItem[], isComplete: boolean) => void
): Promise<{ products: DanawaSearchListItem[]; cached: boolean; searchUrl: string }> {
  console.log(`[Step2] Crawling products for: ${categoryName}`);

  // 캐시 확인
  const cached = getQueryCache(categoryName);
  if (cached && cached.items.length > 0) {
    console.log(`[Step2] Cache hit: ${cached.items.length} products`);
    // 캐시된 경우에도 배치로 스트리밍
    if (onProductBatch) {
      const batchSize = 5;
      for (let i = 0; i < cached.items.length; i += batchSize) {
        const batch = cached.items.slice(i, i + batchSize);
        const isComplete = i + batchSize >= cached.items.length;
        onProductBatch(batch, isComplete);
      }
    }
    return { products: cached.items, cached: true, searchUrl: cached.searchUrl };
  }

  // Lite 크롤러 사용 - 콜백으로 실시간 스트리밍
  const collectedProducts: DanawaSearchListItem[] = [];
  let pendingBatch: DanawaSearchListItem[] = [];
  const batchSize = 5;

  const response = await crawlDanawaSearchListLite(
    {
      query: categoryName,
      limit: 40,
      sort: 'saveDESC',
    },
    // onProductFound 콜백 - 상품이 발견될 때마다 호출
    (product, _index) => {
      collectedProducts.push(product);
      pendingBatch.push(product);

      // 5개가 모이면 배치 전송
      if (pendingBatch.length >= batchSize && onProductBatch) {
        onProductBatch([...pendingBatch], false);
        pendingBatch = [];
      }
    }
  );

  // 남은 배치 전송
  if (pendingBatch.length > 0 && onProductBatch) {
    onProductBatch(pendingBatch, true);
  } else if (onProductBatch && collectedProducts.length > 0) {
    onProductBatch([], true); // 완료 신호만
  }

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

  // 상품이 25개 이하면 필터링 스킵 (대부분 관련 상품일 확률 높음)
  if (products.length <= 25) {
    console.log(`[Step2.5] Skipping filter (${products.length} products - likely all relevant)`);
    return products;
  }

  console.log(`[Step2.5] Filtering ${products.length} products for relevance`);

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // 상품명 + 스펙 요약을 함께 제공 (더 정확한 판단을 위해)
    const productList = products.map((p, i) => {
      const spec = p.specSummary ? ` [${p.specSummary.slice(0, 50)}]` : '';
      return `${i + 1}. ${p.name}${spec}`;
    }).join('\n');

    const prompt = `사용자가 "${query}"를 검색했습니다.

아래 상품 목록에서 "${query}"와 **관련된 상품의 번호**를 모두 출력하세요.

## 관련 상품으로 포함할 것:
- "${query}" 제품 자체 (브랜드/모델 상관없이)
- "${query}"와 함께 사용하는 세트 상품
- "${query}"의 다양한 변형/버전

## 제외할 것 (명확히 다른 카테고리만):
- 완전히 다른 제품군 (예: 마우스 검색 시 키보드)
- 소모품/부품 단품 (예: 마우스 패드, 배터리, 케이블 단품)

상품 목록:
${productList}

관련 상품 번호만 콤마로 구분 (예: 1,2,3,5,7):`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    console.log(`[Step2.5] LLM response: ${response.slice(0, 100)}`);

    const relevantIndices = response
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= products.length)
      .map(n => n - 1);

    const filtered = relevantIndices.map(i => products[i]).filter(Boolean);

    console.log(`[Step2.5] Filtered: ${products.length} → ${filtered.length} products`);

    // 필터링 결과가 너무 적으면 (10개 미만) 원본 상품 사용
    if (filtered.length < 10) {
      console.log(`[Step2.5] Filter result too small (${filtered.length}), using original products`);
      return products.slice(0, 40);
    }

    return filtered;
  } catch (e) {
    console.error('[Step2.5] Filtering failed:', e);
    return products.slice(0, 40);
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
// SSE Helper Functions
// ============================================================================

function createSSEResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function formatSSEMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============================================================================
// Main Handler (Streaming)
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { categoryKey: rawCategoryKey, streaming = true } = await request.json();

    if (!rawCategoryKey) {
      return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    }

    // URL 인코딩된 키를 디코딩
    const categoryKey = decodeURIComponent(rawCategoryKey);
    const categoryName = CATEGORY_NAME_MAP[categoryKey] || categoryKey;

    console.log(`[Init] Raw categoryKey: "${rawCategoryKey}" → Decoded: "${categoryKey}" → categoryName: "${categoryName}"`);
    console.log(`\n========================================`);
    console.log(`[Init V6 Streaming] Starting for: ${categoryName}`);
    console.log(`========================================\n`);

    // 스트리밍 모드가 아니면 기존 방식으로 처리
    if (!streaming) {
      return handleNonStreamingRequest(categoryKey, categoryName, startTime);
    }

    // SSE 스트리밍 응답
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(formatSSEMessage(event, data)));
        };

        try {
          // 초기 이벤트 전송
          send('init', { categoryKey, categoryName, timestamp: Date.now() });

          // 수집된 상품 저장
          let allProducts: DanawaSearchListItem[] = [];
          let searchUrl = '';
          let wasCached = false;

          // Phase 1: 웹검색과 상품 크롤링 병렬 실행
          const phase1Start = Date.now();

          // 웹검색 Promise
          const webSearchPromise = performWebSearchAnalysis(categoryName);

          // 상품 크롤링 (스트리밍 콜백 사용)
          const crawlPromise = crawlProductsWithStreaming(
            categoryKey,
            categoryName,
            (products, isComplete) => {
              // 상품 배치가 도착할 때마다 전송
              if (products.length > 0) {
                allProducts = [...allProducts, ...products];
              }
              // isComplete가 true이거나 products가 있으면 전송 (빈 배열 + isComplete도 전송해야 완료 처리됨)
              if (products.length > 0 || isComplete) {
                send('products', {
                  batch: products.map(p => ({
                    pcode: p.pcode,
                    name: p.name,
                    brand: p.brand,
                    price: p.price,
                    thumbnail: p.thumbnail,
                    reviewCount: p.reviewCount || 0,
                    rating: p.rating || 0,
                    specSummary: p.specSummary,
                  })),
                  total: allProducts.length,
                  isComplete,
                });
              }
            }
          );

          // 병렬 실행 대기
          const [trendAnalysis, crawlResult] = await Promise.all([
            webSearchPromise,
            crawlPromise,
          ]);

          searchUrl = crawlResult.searchUrl;
          wasCached = crawlResult.cached;
          allProducts = crawlResult.products;

          const phase1Duration = Date.now() - phase1Start;

          // 웹검색 결과 전송
          if (trendAnalysis) {
            send('trend', {
              trendAnalysis,
              searchQueries: trendAnalysis.searchQueries,
              sources: trendAnalysis.sources,
            });
          }

          // Phase 2: 필터링
          const phase2Start = Date.now();
          let filteredProducts = allProducts;

          if (!wasCached && allProducts.length > 20) {
            filteredProducts = await filterRelevantProducts(categoryName, allProducts);
            send('filter_complete', {
              originalCount: allProducts.length,
              filteredCount: filteredProducts.length,
            });
          } else {
            filteredProducts = allProducts.slice(0, 40);
          }

          const phase2Duration = Date.now() - phase2Start;

          // Phase 3: 질문 생성 + 메모리 업데이트
          const phase3Start = Date.now();

          const [longTermData, knowledge] = await Promise.all([
            Promise.resolve(updateLongTermMemory(categoryKey, categoryName, filteredProducts, trendAnalysis)),
            Promise.resolve(loadKnowledgeMarkdown(categoryKey)),
          ]);

          const questionTodos = await generateQuestions(
            categoryKey,
            categoryName,
            filteredProducts,
            trendAnalysis,
            knowledge || generateLongTermMarkdown(longTermData)
          );

          const phase3Duration = Date.now() - phase3Start;

          // 질문 전송
          send('questions', {
            questionTodos,
            currentQuestion: questionTodos[0] || null,
          });

          // Short-term Memory 저장
          const shortTermMemory = initializeShortTermMemory(categoryKey, categoryName, filteredProducts.length);

          if (trendAnalysis) {
            const webSearchInsight: WebSearchInsight = {
              phase: 'init',
              query: trendAnalysis.searchQueries[0] || categoryName,
              insight: trendAnalysis.top10Summary,
              sources: trendAnalysis.sources.map((s: { title: string; url: string }) => ({ title: s.title, url: s.url })),
              timestamp: new Date().toISOString(),
            };
            shortTermMemory.webSearchInsights.push(webSearchInsight);
          }

          shortTermMemory.filteredCandidates = filteredProducts.slice(0, 20).map((p: DanawaSearchListItem) => ({
            pcode: p.pcode,
            name: p.name,
            brand: p.brand || '',
            price: p.price || 0,
            rating: p.rating || 0,
            reviewCount: p.reviewCount || 0,
            specs: {},
          }));

          saveShortTermMemory(categoryKey, shortTermMemory);

          // 가격/브랜드 통계
          const prices = filteredProducts.map((p: DanawaSearchListItem) => p.price).filter((p): p is number => p !== null && p > 0);
          const priceStats = {
            min: prices.length ? Math.min(...prices) : 0,
            max: prices.length ? Math.max(...prices) : 500000,
            avg: prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : 150000,
          };

          const brandCounts: Record<string, number> = {};
          filteredProducts.forEach((p: DanawaSearchListItem) => {
            if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
          });
          const topBrands = Object.entries(brandCounts)
            .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]: [string, number]) => name);

          const totalReviewCount = filteredProducts.reduce((sum: number, p: DanawaSearchListItem) => sum + (p.reviewCount || 0), 0);
          const avgRating = filteredProducts.filter((p: DanawaSearchListItem) => p.rating).reduce((sum: number, p: DanawaSearchListItem, _: number, arr: DanawaSearchListItem[]) => sum + (p.rating || 0) / arr.length, 0);

          const marketSummary = {
            productCount: filteredProducts.length,
            reviewCount: totalReviewCount,
            priceRange: priceStats,
            topBrands,
            topPros: (trendAnalysis?.pros || []).slice(0, 5).map((p: string) => ({ keyword: p, count: 0 })),
            topCons: (trendAnalysis?.cons || []).slice(0, 5).map((c: string) => ({ keyword: c, count: 0 })),
            avgRating: Math.round(avgRating * 10) / 10,
          };

          const totalTime = Date.now() - startTime;

          // 최종 완료 이벤트
          send('complete', {
            success: true,
            sessionId: shortTermMemory.sessionId,
            categoryKey,
            categoryName,
            timing: {
              phase1_webSearch_crawl: phase1Duration,
              phase2_filter: phase2Duration,
              phase3_questions: phase3Duration,
              total: totalTime,
            },
            marketSummary,
            trendAnalysis,
            memoryStatus: {
              hasLongTermMemory: true,
              longTermLastUpdated: longTermData.lastUpdated,
              shortTermSessionId: shortTermMemory.sessionId,
            },
            searchUrl,
            wasCached,
            questionTodos,
            currentQuestion: questionTodos[0] || null,
            products: filteredProducts.map((p: DanawaSearchListItem) => ({
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

          console.log(`[Init V6] Total time: ${totalTime}ms`);

        } catch (error) {
          console.error('[Init V6 Error]:', error);
          send('error', { error: 'Initialization failed' });
        } finally {
          controller.close();
        }
      },
    });

    return createSSEResponse(stream);

  } catch (error) {
    console.error('[Init V6 Parse Error]:', error);
    return NextResponse.json({ error: 'Request parsing failed' }, { status: 500 });
  }
}

// ============================================================================
// Non-Streaming Handler (기존 방식 호환)
// ============================================================================

async function handleNonStreamingRequest(
  categoryKey: string,
  categoryName: string,
  startTime: number
): Promise<Response> {
  const timings: StepTiming[] = [];

  // Phase 1: 병렬 실행
  const phase1Start = Date.now();
  const [trendAnalysis, crawlResult] = await Promise.all([
    performWebSearchAnalysis(categoryName),
    crawlProductsWithStreaming(categoryKey, categoryName),
  ]);

  const phase1Duration = Date.now() - phase1Start;
  timings.push({ step: 'phase1_parallel', duration: phase1Duration, details: '웹검색+크롤링' });

  let products = crawlResult.products;
  const wasCached = crawlResult.cached;
  const searchUrl = crawlResult.searchUrl;

  // Phase 2: 필터링
  const phase2Start = Date.now();
  if (!wasCached && products.length > 20) {
    products = await filterRelevantProducts(categoryName, products);
  } else {
    products = products.slice(0, 40);
  }
  const phase2Duration = Date.now() - phase2Start;
  timings.push({ step: 'phase2_filter', duration: phase2Duration, details: `${products.length}개 필터링` });

  // Phase 3: 질문 생성
  const phase3Start = Date.now();
  const [longTermData, knowledge] = await Promise.all([
    Promise.resolve(updateLongTermMemory(categoryKey, categoryName, products, trendAnalysis)),
    Promise.resolve(loadKnowledgeMarkdown(categoryKey)),
  ]);

  const questionTodos = await generateQuestions(
    categoryKey,
    categoryName,
    products,
    trendAnalysis,
    knowledge || generateLongTermMarkdown(longTermData)
  );
  const phase3Duration = Date.now() - phase3Start;
  timings.push({ step: 'phase3_questions', duration: phase3Duration, details: `${questionTodos.length}개 질문` });

  // Short-term Memory 저장
  const shortTermMemory = initializeShortTermMemory(categoryKey, categoryName, products.length);
  if (trendAnalysis) {
    const webSearchInsight: WebSearchInsight = {
      phase: 'init',
      query: trendAnalysis.searchQueries[0] || categoryName,
      insight: trendAnalysis.top10Summary,
      sources: trendAnalysis.sources.map((s: { title: string; url: string }) => ({ title: s.title, url: s.url })),
      timestamp: new Date().toISOString(),
    };
    shortTermMemory.webSearchInsights.push(webSearchInsight);
  }
  shortTermMemory.filteredCandidates = products.slice(0, 20).map((p: DanawaSearchListItem) => ({
    pcode: p.pcode,
    name: p.name,
    brand: p.brand || '',
    price: p.price || 0,
    rating: p.rating || 0,
    reviewCount: p.reviewCount || 0,
    specs: {},
  }));
  saveShortTermMemory(categoryKey, shortTermMemory);

  // 통계
  const prices = products.map((p: DanawaSearchListItem) => p.price).filter((p): p is number => p !== null && p > 0);
  const priceStats = {
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 500000,
    avg: prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : 150000,
  };

  const brandCounts: Record<string, number> = {};
  products.forEach((p: DanawaSearchListItem) => {
    if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
  });
  const topBrands = Object.entries(brandCounts)
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]: [string, number]) => name);

  const totalReviewCount = products.reduce((sum: number, p: DanawaSearchListItem) => sum + (p.reviewCount || 0), 0);
  const avgRating = products.filter((p: DanawaSearchListItem) => p.rating).reduce((sum: number, p: DanawaSearchListItem, _: number, arr: DanawaSearchListItem[]) => sum + (p.rating || 0) / arr.length, 0);

  const marketSummary = {
    productCount: products.length,
    reviewCount: totalReviewCount,
    priceRange: priceStats,
    topBrands,
    topPros: (trendAnalysis?.pros || []).slice(0, 5).map((p: string) => ({ keyword: p, count: 0 })),
    topCons: (trendAnalysis?.cons || []).slice(0, 5).map((c: string) => ({ keyword: c, count: 0 })),
    avgRating: Math.round(avgRating * 10) / 10,
  };

  const totalTime = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    sessionId: shortTermMemory.sessionId,
    categoryKey,
    categoryName,
    timing: {
      phase1_webSearch_crawl: phase1Duration,
      phase2_filter: phase2Duration,
      phase3_questions: phase3Duration,
      total: totalTime,
      steps: timings,
    },
    marketSummary,
    trendAnalysis,
    memoryStatus: {
      hasLongTermMemory: true,
      longTermLastUpdated: longTermData.lastUpdated,
      shortTermSessionId: shortTermMemory.sessionId,
    },
    searchQueries: trendAnalysis?.searchQueries || [],
    searchUrl,
    wasCached,
    questionTodos,
    currentQuestion: questionTodos[0] || null,
    products: products.map((p: DanawaSearchListItem) => ({
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
}
