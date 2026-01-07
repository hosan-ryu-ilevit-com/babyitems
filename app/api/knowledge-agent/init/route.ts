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
import type { DanawaSearchListItem, DanawaFilterSection } from '@/lib/danawa/search-crawler';
import { getQueryCache, setQueryCache } from '@/lib/knowledge-agent/cache-manager';
import { fetchReviewsBatchParallel, type ReviewCrawlResult } from '@/lib/danawa/review-crawler-lite';

// Vercel 서버리스 타임아웃 설정 (기본 10초 → 60초)
export const maxDuration = 60;

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
// JSON Repair Utility - LLM 출력 JSON 복구
// ============================================================================

/**
 * LLM이 출력한 잘못된 JSON을 복구 시도
 * 흔한 오류: trailing commas, unescaped quotes, control characters
 */
function repairJSON(jsonStr: string): string {
  let repaired = jsonStr;

  // 1. Control characters 제거 (newline, tab 제외)
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // 2. 문자열 내부의 이스케이프되지 않은 줄바꿈 처리
  // JSON 문자열 내부에서 실제 줄바꿈은 \n으로 이스케이프 필요
  repaired = repaired.replace(/"([^"]*)\n([^"]*)"/g, (_match, p1, p2) => {
    return `"${p1}\\n${p2}"`;
  });

  // 3. Trailing commas 제거 (배열/객체 끝의 불필요한 쉼표)
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // 4. 객체/배열 사이 누락된 쉼표 추가
  // }{ → },{  또는 ][ → ],[
  repaired = repaired.replace(/}(\s*){/g, '},$1{');
  repaired = repaired.replace(/](\s*)\[/g, '],$1[');

  // 5. 문자열 값 뒤 쉼표 누락 복구 (간단한 패턴만)
  // "value"  "nextKey" → "value", "nextKey"
  repaired = repaired.replace(/"(\s+)"/g, '", "');

  // 6. 중첩 따옴표 이스케이프 (예: "label": "이건 "중요" 합니다")
  // 복잡한 케이스는 처리 어려움, 간단한 패턴만

  return repaired;
}

/**
 * 잘린 JSON 배열에서 완전한 객체들만 추출
 * 마지막 불완전한 객체는 제거
 */
function extractCompleteObjects(brokenJSON: string): QuestionTodo[] | null {
  try {
    const trimmed = brokenJSON.trim();
    if (!trimmed.startsWith('[')) return null;

    const results: QuestionTodo[] = [];
    let depth = 0;
    let objectStart = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 1; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        if (depth === 0) objectStart = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && objectStart !== -1) {
          const objectStr = trimmed.slice(objectStart, i + 1);
          try {
            const obj = JSON.parse(objectStr);
            if (obj.id && obj.question && obj.options) {
              results.push(obj as QuestionTodo);
            }
          } catch {
            // 개별 객체 파싱 실패 - 스킵
          }
          objectStart = -1;
        }
      }
    }

    console.log(`[extractCompleteObjects] Extracted ${results.length} complete objects`);
    return results.length > 0 ? results : null;
  } catch (e) {
    console.error('[extractCompleteObjects] Failed:', e);
    return null;
  }
}

/**
 * LLM을 사용하여 잘못된 JSON을 정제
 * 먼저 완전한 객체 추출 시도 → 실패 시 LLM으로 복구
 */
async function repairJSONWithLLM(brokenJSON: string): Promise<QuestionTodo[] | null> {
  // 1차: 완전한 객체 추출 (LLM 없이 더 안전함)
  const extracted = extractCompleteObjects(brokenJSON);
  if (extracted && extracted.length >= 3) {
    console.log('[repairJSONWithLLM] Using extracted complete objects');
    return extracted;
  }

  if (!ai) return extracted;

  // 2차: LLM으로 JSON 복구 시도
  const model = ai.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 2500,
    }
  });

  const prompt = `아래 JSON 배열은 끝이 잘려서 문법 오류가 있습니다.

**규칙:**
1. 기존 내용(id, question, reason, options의 값들)을 절대 변경하지 마세요
2. 잘린 부분만 적절히 닫아서 유효한 JSON으로 만드세요
3. 불완전한 마지막 객체는 제거해도 됩니다
4. 설명 없이 수정된 JSON 배열만 출력하세요

잘린 JSON:
${brokenJSON.slice(0, 3500)}

수정된 JSON:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as QuestionTodo[];
      // 원본 내용 보존 확인
      if (parsed.length > 0 && parsed[0].id && brokenJSON.includes(parsed[0].id)) {
        return parsed;
      }
      console.warn('[repairJSONWithLLM] LLM changed content, using extracted objects');
    }
  } catch (e) {
    console.error('[repairJSONWithLLM] LLM repair failed:', e);
  }

  return extracted;
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
      model: 'gemini-2.5-flash-lite',
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

// 새 아키텍처: 120개 상품 + 리뷰 10개씩 병렬 크롤링
const PRODUCT_CRAWL_LIMIT = 120; // 40 → 120개로 확장
const REVIEWS_PER_PRODUCT = 10;  // 리뷰 10개씩
const FIRST_BATCH_COMPLETE_COUNT = 10; // 10개 도착 시 '실시간 인기상품 분석' 토글 완료

async function crawlProductsWithStreaming(
  _categoryKey: string,
  categoryName: string,
  onProductBatch?: (products: DanawaSearchListItem[], isComplete: boolean, isFirstBatchComplete?: boolean) => void
): Promise<{ products: DanawaSearchListItem[]; cached: boolean; searchUrl: string; filters?: DanawaFilterSection[] }> {
  console.log(`[Step2] Crawling products for: ${categoryName} (limit: ${PRODUCT_CRAWL_LIMIT})`);

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
        const isFirstBatchComplete = i + batchSize >= FIRST_BATCH_COMPLETE_COUNT && i < FIRST_BATCH_COMPLETE_COUNT;
        onProductBatch(batch, isComplete, isFirstBatchComplete);
      }
    }
    // 캐시에는 필터가 없을 수 있음
    return { products: cached.items, cached: true, searchUrl: cached.searchUrl, filters: cached.filters };
  }

  // Lite 크롤러 사용 - 콜백으로 실시간 스트리밍
  const collectedProducts: DanawaSearchListItem[] = [];
  let pendingBatch: DanawaSearchListItem[] = [];
  const batchSize = 5;
  let firstBatchNotified = false;

  const response = await crawlDanawaSearchListLite(
    {
      query: categoryName,
      limit: PRODUCT_CRAWL_LIMIT, // 120개로 확장
      sort: 'saveDESC',
    },
    // onProductFound 콜백 - 상품이 발견될 때마다 호출
    (product, _index) => {
      collectedProducts.push(product);
      pendingBatch.push(product);

      // 5개가 모이면 배치 전송
      if (pendingBatch.length >= batchSize && onProductBatch) {
        // 10개 도착 시점에 firstBatchComplete 플래그 전송
        const isFirstBatchComplete = !firstBatchNotified && collectedProducts.length >= FIRST_BATCH_COMPLETE_COUNT;
        if (isFirstBatchComplete) firstBatchNotified = true;
        
        onProductBatch([...pendingBatch], false, isFirstBatchComplete);
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
    console.log(`[Step2] Crawled ${response.items.length} products, ${response.filters?.length || 0} filters`);
    return { products: response.items, cached: false, searchUrl: response.searchUrl, filters: response.filters };
  }

  console.error('[Step2] Crawling failed:', response.error);
  return { products: [], cached: false, searchUrl: response.searchUrl };
}

/**
 * 병렬 리뷰 크롤링 (모든 상품에 대해 10개씩)
 */
async function crawlReviewsForProducts(
  products: DanawaSearchListItem[],
  onProgress?: (completed: number, total: number, reviewCount: number) => void
): Promise<{ reviews: Record<string, ReviewCrawlResult>; totalReviews: number }> {
  const pcodes = products.map(p => p.pcode);
  console.log(`[Step2.5] Starting review crawling for ${pcodes.length} products (${REVIEWS_PER_PRODUCT} reviews each)`);
  
  const startTime = Date.now();
  let totalReviewsCollected = 0;
  
  const results = await fetchReviewsBatchParallel(pcodes, {
    maxReviewsPerProduct: REVIEWS_PER_PRODUCT,
    concurrency: 12,           // 높은 동시성
    delayBetweenChunks: 150,   // 낮은 딜레이
    timeout: 5000,
    onProgress: (completed, total, result) => {
      totalReviewsCollected += result.reviews.length;
      if (onProgress && completed % 10 === 0) {
        onProgress(completed, total, totalReviewsCollected);
      }
    }
  });
  
  const elapsedMs = Date.now() - startTime;
  console.log(`[Step2.5] Review crawling complete: ${results.length} products, ${totalReviewsCollected} reviews (${(elapsedMs / 1000).toFixed(1)}s)`);
  
  // pcode → result 맵으로 변환
  const reviewMap: Record<string, ReviewCrawlResult> = {};
  results.forEach(r => {
    reviewMap[r.pcode] = r;
  });
  
  return { reviews: reviewMap, totalReviews: totalReviewsCollected };
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

    // 필터링 결과가 너무 적으면 (20개 미만) 원본 상품 사용
    if (filtered.length < 20) {
      console.log(`[Step2.5] Filter result too small (${filtered.length}), using original products`);
      return products; // 전체 반환 (120개 유지)
    }

    return filtered;
  } catch (e) {
    console.error('[Step2.5] Filtering failed:', e);
    return products; // 전체 반환 (120개 유지)
  }
}


// ============================================================================
// Step 3.5: Budget Options Generation (저가 상품 대응)
// ============================================================================

/**
 * 예산 옵션 생성 - 저가/고가 상품 모두 대응
 * - 1만원 이하: 천원 단위 표기
 * - 1만원~10만원: 만원 단위 표기
 * - 10만원 이상: 10만원 단위 표기
 * - 중복 방지 로직 포함
 */
function generateBudgetOptions(
  minPrice: number,
  avgPrice: number,
  maxPrice: number
): Array<{ value: string; label: string; description: string }> {
  // 가격 구간 계산
  const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
  const midMax = Math.round(avgPrice * 1.3);

  // 표기 단위 결정 (평균가 기준 - 저가 상품 대응)
  const useThousandUnit = avgPrice < 30000; // 평균 3만원 미만이면 천원 단위
  const useTenThousandUnit = avgPrice >= 30000 && avgPrice < 500000; // 평균 50만원 미만이면 만원 단위

  // 가격을 문자열로 변환하는 헬퍼
  const formatPrice = (price: number): string => {
    if (useThousandUnit) {
      // 천원 단위 (5천원, 1만원, 1만5천원 등)
      const thousands = Math.round(price / 1000);
      if (thousands >= 10 && thousands % 10 === 0) {
        return `${thousands / 10}만`;
      } else if (thousands >= 10) {
        const man = Math.floor(thousands / 10);
        const cheon = thousands % 10;
        return `${man}만${cheon}천`;
      }
      return `${thousands}천`;
    } else if (useTenThousandUnit) {
      // 만원 단위
      return `${Math.round(price / 10000)}만`;
    } else {
      // 10만원 단위
      return `${Math.round(price / 100000) * 10}만`;
    }
  };

  // 구간 레이블 생성
  const entryLabel = `${formatPrice(minPrice)}~${formatPrice(entryMax)}원대`;
  const midLabel = `${formatPrice(entryMax)}~${formatPrice(midMax)}원대`;
  const premiumLabel = `${formatPrice(midMax)}원 이상`;

  // 중복 체크 및 보정
  const options: Array<{ value: string; label: string; description: string }> = [];

  // Entry 옵션
  options.push({
    value: 'entry',
    label: entryLabel,
    description: '가성비 모델'
  });

  // Mid 옵션 - Entry와 중복되면 스킵
  if (midLabel !== entryLabel && formatPrice(entryMax) !== formatPrice(midMax)) {
    options.push({
      value: 'mid',
      label: midLabel,
      description: '인기 가격대'
    });
  }

  // Premium 옵션 - 이전 옵션과 시작 가격이 겹치지 않으면 추가
  const lastOption = options[options.length - 1];
  if (!lastOption.label.includes(formatPrice(midMax))) {
    options.push({
      value: 'premium',
      label: premiumLabel,
      description: '프리미엄'
    });
  }

  // 옵션이 2개 미만이면 단순 분할로 재생성
  if (options.length < 2) {
    const third = (maxPrice - minPrice) / 3;
    const lowMax = minPrice + third;
    const highMin = maxPrice - third;

    return [
      { value: 'low', label: `${formatPrice(minPrice)}~${formatPrice(lowMax)}원대`, description: '저가형' },
      { value: 'mid', label: `${formatPrice(lowMax)}~${formatPrice(highMin)}원대`, description: '중간 가격대' },
      { value: 'high', label: `${formatPrice(highMin)}원 이상`, description: '고가형' }
    ];
  }

  return options;
}

// ============================================================================
// Step 4: Question Generation (Data-Driven)
// ============================================================================

/**
 * Fallback: 정규식 기반 스펙 분포 분석
 * 상품들의 스펙 분포를 분석하여 "선택지가 갈리는 스펙"을 추출
 * 예: 용량이 1L/2L/3L로 나뉘면 → "용량: 1L, 2L, 3L" 반환
 */
function analyzeSpecDistributionFallback(products: DanawaSearchListItem[]): string {
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

// extractProductPatterns 함수는 프롬프트 간소화로 제거됨

/**
 * 선택지 정제 함수 - 중복/유사 선택지 병합 및 일관된 포맷으로 정규화
 */
async function refineQuestionOptions(
  questions: QuestionTodo[]
): Promise<QuestionTodo[]> {
  if (!ai || questions.length === 0) return questions;

  // 예산 질문은 별도 로직으로 처리되므로 제외
  const questionsToRefine = questions.filter(q =>
    !q.id.includes('budget') && !q.question.includes('예산') && !q.question.includes('가격')
  );

  if (questionsToRefine.length === 0) return questions;

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 800,
    }
  });

  // 질문별 선택지를 정제
  const questionsData = questionsToRefine.map(q => ({
    id: q.id,
    options: q.options.map(o => o.label)
  }));

  const refinePrompt = `선택지 정제: 중복 병합, 일관된 포맷, 3-4개 유지
입력: ${JSON.stringify(questionsData)}
출력 JSON만: {"질문id":["정제된 선택지1","정제된 선택지2"]}`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(refinePrompt);
    const text = result.response.text();
    console.log(`[Step3.5] Options refined in ${Date.now() - startTime}ms`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const refined = JSON.parse(jsonMatch[0]) as Record<string, string[]>;

      // 정제된 선택지를 원본 questions에 반영
      return questions.map(q => {
        if (refined[q.id] && Array.isArray(refined[q.id])) {
          const newLabels = refined[q.id];
          return {
            ...q,
            options: newLabels.map((label, i) => ({
              value: `opt_${i + 1}`,
              label,
              description: q.options[i]?.description || ''
            }))
          };
        }
        return q;
      });
    }
  } catch (e) {
    console.error('[Step3.5] Options refine failed:', e);
  }

  return questions;
}

/**
 * 모든 질문에 "상관없어요 (건너뛰기)" 옵션 추가
 * - 예산 질문은 제외 (예산은 명시적으로 선택해야 함)
 */
function addSkipOptionToQuestions(questions: QuestionTodo[]): QuestionTodo[] {
  return questions.map(q => {
    // 예산 질문은 건너뛰기 옵션 제외
    const isBudgetQuestion = q.id.includes('budget') ||
      q.question.includes('예산') ||
      q.question.includes('가격');

    if (isBudgetQuestion) {
      return q;
    }

    // 이미 "상관없어요" 옵션이 있는지 확인
    const hasSkipOption = q.options.some(o =>
      o.value === 'skip' ||
      o.label.includes('상관없') ||
      o.label.includes('건너뛰기')
    );

    if (hasSkipOption) {
      return q;
    }

    // "상관없어요" 옵션 추가
    return {
      ...q,
      options: [
        ...q.options,
        {
          value: 'skip',
          label: '상관없어요',
          description: '이 조건은 크게 신경 안 써요'
        }
      ]
    };
  });
}

async function generateQuestions(
  _categoryKey: string,
  categoryName: string,
  products: DanawaSearchListItem[],
  trendAnalysis: TrendAnalysis | null,
  _knowledge: string,
  filters?: DanawaFilterSection[]
): Promise<QuestionTodo[]> {
  if (!ai) return getDefaultQuestions(categoryName, products, trendAnalysis);

  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 500000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // 스펙 분포 분석을 별도 LLM 호출 대신 텍스트로 준비하여 메인 프롬프트에 포함 (시간 단축)
  const productSpecsForAnalysis = products.slice(0, 20).map((p, i) => {
    return `${i + 1}. ${p.name} | 스펙: ${p.specSummary || '(없음)'}`;
  }).join('\n');

  // productKeywords는 프롬프트 간소화로 사용 안함
  // const productKeywords = extractProductPatterns(products);

  // 다나와 필터 정보 (핵심 스펙 분류 기준)
  const filterSummary = filters && filters.length > 0
    ? filters.slice(0, 12).map(f => {
        const sampleOptions = f.options.slice(0, 5).map(o => o.name).join(', ');
        return `- **${f.title}**: ${sampleOptions}${f.options.length > 5 ? ` 외 ${f.options.length - 5}개` : ''}`;
      }).join('\n')
    : '(필터 정보 없음)';

  // 웹서치 트렌드
  const trendsText = trendAnalysis?.trends.map((t, i) => `${i + 1}. ${t}`).join('\n') || '';

  const prompt = `
당신은 "${categoryName}" 구매 결정을 돕는 전문 AI 쇼핑 컨시어지입니다.
당신의 목표는 방대한 정보를 나열하는 것이 아니라, **사용자가 가장 적은 문답으로 최적의 제품군으로 좁혀갈 수 있도록 돕는 것**입니다.

사용자는 제품을 탐색(Search)하는 것이 아니라, 당신의 제안을 승인(Approve)하고 싶어 합니다.
제공된 [시장 데이터]를 분석하여, 구매 결정에 가장 결정적인 영향을 미치는 **핵심 질문 4~5개**를 JSON 배열로 생성하세요.

## [시장 데이터]
<MarketContext>
- **카테고리:** ${categoryName}
- **웹 트렌드/리뷰 요약:** ${trendAnalysis ? `${trendsText || '-'} (주요 장점: ${(trendAnalysis.pros || []).slice(0,3).join(', ')} / 주요 단점: ${(trendAnalysis.cons || []).join(', ')})` : '정보 없음'}
- **가격 분포:** 최저 ${minPrice.toLocaleString()}원 ~ 최고 ${maxPrice.toLocaleString()}원 (평균 ${avgPrice.toLocaleString()}원)
- **주요 브랜드:** ${brands.slice(0, 6).join(', ')}
- **필터링 옵션(다나와):** ${filterSummary}
- **상위 제품 스펙 분석:** ${productSpecsForAnalysis}
</MarketContext>

## [질문 생성 전략 (Thinking Process)]
1. **결정적 요인 식별:** 상위 제품들의 스펙과 필터 정보를 대조하여, 제품이 가장 크게 갈리는 기준(Factor)을 찾으세요. (예: 가습기의 가열식 vs 초음파식)
2. **트렌드 반영:** '웹 트렌드'를 참고하여 사람들이 왜 그 옵션을 고민하는지 파악하고 \`reason\` 필드에 반영하세요. 단순한 사실 전달이 아닌, **"선택의 가이드"**가 되어야 합니다.
3. **사용자 언어:** 기술 용어보다는 사용자가 얻을 **효익(Benefit)이나 상황(Context)** 중심으로 질문하세요.
4. **옵션 설계:** 선택지는 3~4개로 제한하되, 서로 겹치지 않아야 합니다(MECE).

## [작성 규칙]
1. **Target Audience Check:**
   - "${categoryName}"이 아기용품(기저귀, 분유, 유모차, 카시트 등)이라면 **반드시** 첫 질문으로 '아기 월령/몸무게'를 물어보세요. (아기용품이 아니라면 생략)
2. **Spec Filtering:**
   - 모든 제품이 공통으로 가진 스펙은 질문하지 마세요. (변별력 없음)
   - 사용자 취향이나 환경에 따라 제품 추천이 달라지는 항목을 우선순위로 두세요.
3. **Budget Logic (Priority 99):**
   - 예산 질문은 반드시 포함하세요.
   - 단순 등분하지 말고, [가격 분포] 데이터를 참고하여 '입문형', '중급형', '프리미엄형' 구간이 나뉘는 지점을 포착하여 선택지를 구성하세요.
4. **Avoid Negatives (Priority 100, 가장 마지막 질문):**
   - 예산 질문 다음, **가장 마지막**에 "피하고 싶은 단점" 질문을 추가하세요.
   - id는 "avoid_negatives", type is "multi" (복수 선택 가능)
   - 옵션은 **웹 트렌드에서 자주 언급되는 단점/주의사항** 을 참고하여 4~5개 생성
   - **중요: 단순한 단점 나열이 아니라, 사용자의 걱정이나 불편함이 드러나는 구체적인 문장 형태로 작성하세요.**
   - **예시 (체온계의 경우):**
     - "삐- 소리가 너무 커서 자는 아기가 깰까 봐 걱정돼요"
     - "배터리 교체 주기가 너무 짧아서 매번 신경 쓰는 게 번거로워요"
     - "측정 후 닦아도 귀지나 이물질이 남을까 봐 위생적으로 찝찝해요"
     - "전용 위생 캡을 매번 새로 사야 하는 추가 비용이 부담스러워요"
5. **Constraint:**
   - 오직 JSON 배열만 출력하세요. 설명은 필요 없습니다.

## [출력 포맷 예시]
\`\`\`json
[
  {
    "id": "unique_key_name",
    "question": "질문은 대화하듯 자연스럽게 (예: 어떤 용도로 주로 쓰시나요?)",
    "reason": "💡 이 질문을 하는 이유와 팁 (트렌드 데이터를 기반으로 작성. 예: 신생아라면 00기능이 필수예요)",
    "options": [
      {"value": "option_val_1", "label": "사용자 친화적 라벨", "description": "해당 옵션의 특징이나 적합한 대상 요약"},
      {"value": "option_val_2", "label": "...", "description": "..."}
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "데이터 출처 (예: 웹 트렌드, 상위 스펙 분석)"
  },
  {
    "id": "budget",
    "question": "예산은 어느 정도로 생각하세요?",
    "reason": "💡 가격대별로 기능과 품질 차이가 있어요",
    "options": [{"value": "entry", "label": "입문형", "description": "..."}, {"value": "mid", "label": "중급형", "description": "..."}, {"value": "premium", "label": "프리미엄", "description": "..."}],
    "type": "single",
    "priority": 99,
    "dataSource": "가격 분포 분석"
  },
  {
    "id": "avoid_negatives",
    "question": "혹시 피하고 싶은 단점이 있으신가요?",
    "reason": "💡 선택하신 단점이 있는 상품은 추천에서 제외해드릴게요",
    "options": [
      {"value": "noise", "label": "소음이 커서 아기가 깰까 봐 걱정돼요", "description": "조용한 사용을 원하신다면"},
      {"value": "cleaning", "label": "필터 청소나 관리가 너무 번거로울 것 같아요", "description": "간편한 관리를 원하신다면"},
      {"value": "heavy", "label": "무게가 무거워 이동할 때 손목에 무리가 갈까 봐요", "description": "가벼운 무게를 원하신다면"},
      {"value": "size", "label": "부피가 너무 커서 공간을 많이 차지하는 건 싫어요", "description": "컴팩트한 크기를 원하신다면"}
    ],
    "type": "multi",
    "priority": 100,
    "dataSource": "웹 트렌드 단점 분석"
  }
]
\`\`\`

위 전략과 규칙에 따라 "${categoryName}"에 최적화된 질문 JSON을 생성하세요.
`;

  try {
    console.log(`[Step3] Generating questions for "${categoryName}" with ${products.length} products (Combined Spec Analysis)`);
    const startTime = Date.now();

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1500,
      }
    });
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log(`[Step3] LLM response received in ${Date.now() - startTime}ms`);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        // JSON 복구 시도
        let jsonStr = jsonMatch[0];
        jsonStr = repairJSON(jsonStr);

        let questions = JSON.parse(jsonStr) as QuestionTodo[];
        questions = questions.map(q => ({ ...q, completed: false }));
        
        // 예산 질문 보정 - 저가 상품 대응 개선
        const budgetQ = questions.find(q =>
          q.id.includes('budget') || q.question.includes('예산') || q.question.includes('가격')
        );
        if (budgetQ && prices.length > 0) {
          budgetQ.options = generateBudgetOptions(minPrice, avgPrice, maxPrice);
        }

        // 선택지 정제 (중복/유사 제거, 일관된 포맷)
        const refinedQuestions = await refineQuestionOptions(questions);

        // ✅ 모든 질문에 "상관없어요 (건너뛰기)" 옵션 추가
        const questionsWithSkip = addSkipOptionToQuestions(refinedQuestions);
        console.log(`[Step3] Successfully generated ${questionsWithSkip.length} questions`);
        return questionsWithSkip;
      } catch (e) {
        console.error('[Step3] JSON parse error:', e);
        console.error('[Step3] Failed JSON sample:', jsonMatch[0].slice(0, 500));

        // Flash Lite로 JSON 정제 시도
        try {
          console.log('[Step3] Attempting JSON repair with Flash Lite...');
          const repairedQuestions = await repairJSONWithLLM(jsonMatch[0]);
          if (repairedQuestions && repairedQuestions.length > 0) {
            const questions = repairedQuestions.map((q: QuestionTodo) => ({ ...q, completed: false }));

            const budgetQ = questions.find((q: QuestionTodo) =>
              q.id.includes('budget') || q.question.includes('예산') || q.question.includes('가격')
            );
            if (budgetQ && prices.length > 0) {
              budgetQ.options = generateBudgetOptions(minPrice, avgPrice, maxPrice);
            }

            const refinedQuestions = await refineQuestionOptions(questions);
            const questionsWithSkip = addSkipOptionToQuestions(refinedQuestions);
            console.log(`[Step3] JSON repair succeeded: ${questionsWithSkip.length} questions`);
            return questionsWithSkip;
          }
        } catch (repairError) {
          console.error('[Step3] JSON repair with LLM failed:', repairError);
        }
      }
    } else {
      console.error('[Step3] No JSON array found in LLM response');
      console.error('[Step3] Response sample:', text.slice(0, 300));
    }
  } catch (e) {
    console.error('[Step3] Question generation failed:', e);
  }

  return getDefaultQuestions(categoryName, products, trendAnalysis);
}

/**
 * LLM 호출 실패 시 fallback - 스펙 기반 질문만 생성
 * 하드코딩 질문 없이 상품 스펙 분포만 분석
 */
function getDefaultQuestions(
  categoryName: string,
  products: DanawaSearchListItem[],
  _trendAnalysis: TrendAnalysis | null
): QuestionTodo[] {
  const questions: QuestionTodo[] = [];

  // 스펙 분포 분석 - 선택지가 갈리는 스펙을 질문으로 변환
  const specMap: Record<string, Map<string, number>> = {};
  products.forEach(p => {
    if (!p.specSummary) return;
    const parts = p.specSummary.split(/[|\/,]/).map(s => s.trim());
    parts.forEach(part => {
      let key = '', value = '';
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        key = part.slice(0, colonIdx).trim();
        value = part.slice(colonIdx + 1).trim();
      }
      if (key && value && key.length < 15 && value.length < 30) {
        if (!specMap[key]) specMap[key] = new Map();
        specMap[key].set(value, (specMap[key].get(value) || 0) + 1);
      }
    });
  });

  // 선택지가 갈리는 스펙들 (2개 이상 다양한 값)
  const meaningfulSpecs = Object.entries(specMap)
    .filter(([, values]) => values.size >= 2 && values.size <= 6)
    .map(([key, values]) => ({
      key,
      values: [...values.entries()].sort((a, b) => b[1] - a[1])
    }))
    .slice(0, 5);

  // 1. 핵심 스펙 질문들 (스펙 분포 기반 - 최대 3개)
  const specPriority: Record<string, number> = {
    '단계': 1, '형태': 2, '타입': 2, '용량': 3, '사이즈': 3,
    '권장무게': 4, '대상': 4, '성별': 4,
  };

  const sortedSpecs = meaningfulSpecs.sort((a, b) => {
    const priorityA = specPriority[a.key] || 10;
    const priorityB = specPriority[b.key] || 10;
    return priorityA - priorityB;
  });

  sortedSpecs.slice(0, 3).forEach((spec, idx) => {
    const topOptions = spec.values.slice(0, 4);
    const totalCount = topOptions.reduce((sum, [, count]) => sum + count, 0);

    // 질문 텍스트 생성
    let questionText = '';
    let reasonText = '';

    if (spec.key === '단계' || spec.key.includes('단계')) {
      questionText = '현재 어느 단계를 찾으시나요?';
      reasonText = `💡 단계에 따라 기능이나 사이즈가 달라집니다. 본인 상황에 맞춰 선택해주세요.`;
    } else if (spec.key === '형태' || spec.key === '타입') {
      questionText = `${categoryName} 형태는 어떤 것을 선호하시나요?`;
      reasonText = `💡 형태에 따라 사용 편의성과 특징이 달라져요.`;
    } else if (spec.key.includes('무게') || spec.key.includes('권장')) {
      questionText = '어느 정도의 무게/하중 범위를 찾으시나요?';
      reasonText = `💡 권장 무게에 맞는 제품을 선택해야 안전하고 편리합니다.`;
    } else {
      questionText = `${spec.key}은(는) 어떤 것을 원하시나요?`;
      reasonText = `💡 ${spec.key}에 따라 제품 특성이 달라집니다. ${products.length}개 상품 분석 결과입니다.`;
    }

    questions.push({
      id: `spec_${spec.key.replace(/\s/g, '_')}_${idx}`,
      question: questionText,
      reason: reasonText,
      options: topOptions.map(([value, count]) => ({
        value: value.toLowerCase().replace(/\s/g, '_'),
        label: value,
        description: `${count}개 상품 (${Math.round(count / totalCount * 100)}%)`
      })),
      type: 'single',
      priority: idx + 1,
      dataSource: `${products.length}개 상품 스펙 분석`,
      completed: false
    });
  });

  // NOTE: 하드코딩 질문 (트레이드오프/브랜드/예산) 제거
  // - LLM이 웹서치 + 스펙 데이터 기반으로 동적 생성하도록 함
  // - fallback은 스펙 기반 질문만 제공

  console.log(`[DefaultQuestions] Generated ${questions.length} fallback questions from spec analysis only`);

  // ✅ fallback 질문에도 "상관없어요" 옵션 추가
  return addSkipOptionToQuestions(questions);
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
          let firstBatchComplete = false;

          // 웹검색 Promise
          const webSearchPromise = performWebSearchAnalysis(categoryName);

          // 상품 크롤링 (스트리밍 콜백 사용)
          const crawlPromise = crawlProductsWithStreaming(
            categoryKey,
            categoryName,
            (products, isComplete, isFirstBatchComplete) => {
              // 상품 배치가 도착할 때마다 전송
              if (products.length > 0) {
                allProducts = [...allProducts, ...products];
              }
              
              // 10개 도착 시 "실시간 인기상품 분석" 토글 완료 신호
              if (isFirstBatchComplete && !firstBatchComplete) {
                firstBatchComplete = true;
                send('first_batch_complete', {
                  count: allProducts.length,
                  message: '실시간 인기상품 분석 완료',
                });
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
          const crawledFilters = crawlResult.filters;

          const phase1Duration = Date.now() - phase1Start;
          
          // Phase 1.5: 리뷰 크롤링 (상품 크롤링 완료 후 병렬 실행)
          const phase15Start = Date.now();
          send('reviews_start', { 
            productCount: allProducts.length,
            reviewsPerProduct: REVIEWS_PER_PRODUCT,
          });
          
          let allReviews: Record<string, ReviewCrawlResult> = {};
          let totalReviewsCrawled = 0;
          
          try {
            const reviewResult = await crawlReviewsForProducts(
              allProducts,
              (completed, total, reviewCount) => {
                send('reviews_progress', { completed, total, reviewCount });
              }
            );
            allReviews = reviewResult.reviews;
            totalReviewsCrawled = reviewResult.totalReviews;
            
            send('reviews_complete', {
              productCount: Object.keys(allReviews).length,
              totalReviews: totalReviewsCrawled,
            });
          } catch (error) {
            console.error('[Phase1.5] Review crawling failed:', error);
            send('reviews_error', { error: 'Review crawling failed' });
          }
          
          const phase15Duration = Date.now() - phase15Start;
          
          // 리뷰 0개인 상품 필터링 (품질 향상)
          const productsBeforeFilter = allProducts.length;
          allProducts = allProducts.filter(p => {
            const review = allReviews[p.pcode];
            // 리뷰 데이터가 있고 리뷰가 1개 이상인 상품만 유지
            return review && review.reviews.length > 0;
          });
          console.log(`[Phase1.5] Filtered out ${productsBeforeFilter - allProducts.length} products with 0 reviews (${productsBeforeFilter} → ${allProducts.length})`);
          
          send('products_filtered', {
            before: productsBeforeFilter,
            after: allProducts.length,
            reason: '리뷰 0개 상품 제외',
          });

          // 필터 정보 전송 (인기상품 분석 토글에서 표시)
          if (crawledFilters && crawledFilters.length > 0) {
            console.log(`[Phase1] Extracted ${crawledFilters.length} filter sections`);
            send('filters', {
              filters: crawledFilters.slice(0, 15).map(f => ({
                title: f.title,
                options: f.options.slice(0, 6).map(o => o.name),
                optionCount: f.options.length,
              })),
              totalCount: crawledFilters.length,
            });
          }

          // 웹검색 결과 전송
          if (trendAnalysis) {
            send('trend', {
              trendAnalysis,
              searchQueries: trendAnalysis.searchQueries,
              sources: trendAnalysis.sources,
            });
          }

          // Phase 2: 카테고리 관련성 필터링 (불필요한 상품 제거, 120개 유지)
          const phase2Start = Date.now();
          let filteredProducts = allProducts;

          // 새 아키텍처: 120개 전체를 유지 (hard-cut 제거)
          // 카테고리 관련성 필터링만 수행 (예: 가습기 검색 시 가습기만 남김)
          if (!wasCached && allProducts.length > 30) {
            filteredProducts = await filterRelevantProducts(categoryName, allProducts);
            send('filter_complete', {
              originalCount: allProducts.length,
              filteredCount: filteredProducts.length,
            });
          }
          // 더 이상 40개로 제한하지 않음 - 전체 120개 유지

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
            knowledge || generateLongTermMarkdown(longTermData),
            crawledFilters
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
          
          // 리뷰 데이터를 간소화하여 전송 (full 리뷰 대신 리뷰 요약)
          const reviewSummaryByProduct: Record<string, {
            reviewCount: number;
            avgRating: number | null;
            reviews: Array<{ rating: number; content: string }>;
          }> = {};
          
          Object.entries(allReviews).forEach(([pcode, result]) => {
            reviewSummaryByProduct[pcode] = {
              reviewCount: result.reviewCount,
              avgRating: result.averageRating,
              reviews: result.reviews.map(r => ({
                rating: r.rating,
                content: r.content,
              })),
            };
          });

          // 최종 완료 이벤트
          send('complete', {
            success: true,
            sessionId: shortTermMemory.sessionId,
            categoryKey,
            categoryName,
            timing: {
              phase1_webSearch_crawl: phase1Duration,
              phase15_reviews: phase15Duration,
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
            // 모든 상품 + 리뷰 데이터 (hard-cut 제거로 120개 전체 전송)
            products: allProducts.map((p: DanawaSearchListItem) => ({
              pcode: p.pcode,
              name: p.name,
              brand: p.brand,
              price: p.price,
              thumbnail: p.thumbnail,
              reviewCount: p.reviewCount || 0,
              rating: p.rating || 0,
              specSummary: p.specSummary,
              productUrl: p.productUrl,
            })),
            // 리뷰 데이터 (pcode → 리뷰 배열)
            reviews: reviewSummaryByProduct,
            reviewStats: {
              productsWithReviews: Object.keys(allReviews).length,
              totalReviews: totalReviewsCrawled,
              avgReviewsPerProduct: Object.keys(allReviews).length > 0 
                ? Math.round(totalReviewsCrawled / Object.keys(allReviews).length * 10) / 10 
                : 0,
            },
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
  const crawledFilters = crawlResult.filters;
  
  // Phase 1.5: 리뷰 크롤링
  const phase15Start = Date.now();
  let allReviews: Record<string, ReviewCrawlResult> = {};
  let totalReviewsCrawled = 0;
  
  try {
    const reviewResult = await crawlReviewsForProducts(products);
    allReviews = reviewResult.reviews;
    totalReviewsCrawled = reviewResult.totalReviews;
  } catch (error) {
    console.error('[Non-streaming] Review crawling failed:', error);
  }
  
  const phase15Duration = Date.now() - phase15Start;
  timings.push({ step: 'phase15_reviews', duration: phase15Duration, details: `${totalReviewsCrawled}개 리뷰` });

  // Phase 2: 필터링 (120개 유지)
  const phase2Start = Date.now();
  if (!wasCached && products.length > 30) {
    products = await filterRelevantProducts(categoryName, products);
  }
  // 더 이상 40개로 제한하지 않음
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
    knowledge || generateLongTermMarkdown(longTermData),
    crawledFilters
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
  
  // 리뷰 데이터를 간소화하여 전송
  const reviewSummaryByProduct: Record<string, {
    reviewCount: number;
    avgRating: number | null;
    reviews: Array<{ rating: number; content: string }>;
  }> = {};
  
  Object.entries(allReviews).forEach(([pcode, result]) => {
    reviewSummaryByProduct[pcode] = {
      reviewCount: result.reviewCount,
      avgRating: result.averageRating,
      reviews: result.reviews.map(r => ({
        rating: r.rating,
        content: r.content,
      })),
    };
  });

  return NextResponse.json({
    success: true,
    sessionId: shortTermMemory.sessionId,
    categoryKey,
    categoryName,
    timing: {
      phase1_webSearch_crawl: phase1Duration,
      phase15_reviews: phase15Duration,
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
      productUrl: p.productUrl,
    })),
    reviews: reviewSummaryByProduct,
    reviewStats: {
      productsWithReviews: Object.keys(allReviews).length,
      totalReviews: totalReviewsCrawled,
      avgReviewsPerProduct: Object.keys(allReviews).length > 0 
        ? Math.round(totalReviewsCrawled / Object.keys(allReviews).length * 10) / 10 
        : 0,
    },
  });
}
