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
import { logKAQuestionGenerated } from '@/lib/logging/clientLogger';

// 메모리 시스템
import {
  loadLongTermMemory,
  saveShortTermMemory,
  saveLongTermMemory,
  initializeShortTermMemory,
} from '@/lib/knowledge-agent/memory-manager';
import { generateLongTermMarkdown } from '@/lib/knowledge-agent/markdown-parser';
import type { WebSearchInsight, ProductKnowledge, LongTermMemoryData } from '@/lib/knowledge-agent/types';
import { deduplicateQuestions, generateReplacementQuestions, type QuestionForDedup } from '@/lib/knowledge-agent/question-dedup';
import { CATEGORY_NAME_MAP } from '@/lib/knowledge-agent/types';

// 다나와 크롤러
import { crawlDanawaSearchListLite } from '@/lib/danawa/search-crawler-lite';
import type { DanawaSearchListItem, DanawaFilterSection } from '@/lib/danawa/search-crawler';
import { getQueryCache, setQueryCache } from '@/lib/knowledge-agent/cache-manager';
import { fetchReviewsBatchParallel, type ReviewCrawlResult } from '@/lib/danawa/review-crawler-lite';

// Supabase 캐시 (프리페치된 데이터)
import { getProductsFromCache, getReviewsFromCache, getFiltersFromCache, getCategoryInfo } from '@/lib/knowledge-agent/supabase-cache';

// Gemini 헬퍼
import { callGeminiWithRetry } from '@/lib/ai/gemini';

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
  // 추가: 병렬 웹검색 결과
  topBrands: string[];      // 인기 브랜드
  buyingFactors: string[];  // 구매 고려사항 (질문 생성 핵심!)
}

interface QuestionTodo {
  id: string;
  question: string;
  options: Array<{ value: string; label: string; description?: string; isPopular?: boolean; isRecommend?: boolean }>;
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
    model: 'gemini-2.5-flash-lite',
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
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
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

/**
 * 4개 병렬 웹검색으로 트렌드 데이터 수집
 * 1. 추천 순위 및 실사용 후기 → top10Summary, trends, pros, cons
 * 2. 트렌드 → trends 보강
 * 3. 인기 브랜드 → topBrands
 * 4. 구매 고려사항 → buyingFactors (⭐질문 생성 핵심!)
 */
// 웹검색 진행 상황 콜백 타입
type WebSearchProgressCallback = (event: {
  type: 'query_start' | 'query_done' | 'all_done';
  queryName?: string;
  queryText?: string;
  result?: { trends?: string[]; pros?: string[]; cons?: string[]; buyingFactors?: string[] };
}) => void;

async function performWebSearchAnalysis(
  searchKeyword: string,
  onProgress?: WebSearchProgressCallback
): Promise<TrendAnalysis | null> {
  if (!ai) return null;

  // 캐시 확인
  const cached = getWebSearchCache(searchKeyword);
  if (cached) {
    // 캐시 히트 시에도 결과 전송
    onProgress?.({
      type: 'all_done',
      result: {
        trends: cached.trends,
        pros: cached.pros,
        cons: cached.cons,
        buyingFactors: cached.buyingFactors,
      }
    });
    return cached;
  }

  const today = new Date();
  const timestamp = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const year = today.getFullYear();

  console.log(`[Step1] 🚀 병렬 웹검색 시작: "${searchKeyword}" (3개 쿼리)`);
  const startTime = Date.now();

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 600,
      },
      tools: [{ google_search: {} } as never]
    });

    // 3개 검색 쿼리 정의 (brands, priceInsight 제거 - 효용 낮음)
    const queries = [
      {
        name: 'main',
        query: `${searchKeyword} ${year}년 추천 순위 및 실사용 후기`,
        prompt: `"${searchKeyword}" 제품 검색 후 JSON 응답:
{
  "top10Summary": "${searchKeyword} 시장 현황 2-3문장",
  "trends": ["트렌드1", "트렌드2", "트렌드3"],
  "pros": ["리뷰 장점 키워드1", "키워드2", "키워드3"],
  "cons": ["리뷰 단점 키워드1", "키워드2", "키워드3"]
}
- pros/cons는 "뛰어난 가성비", "짧은 배터리" 같은 명사형 키워드로 작성`
      },
      {
        name: 'trends',
        query: `${year}년 ${searchKeyword} 트렌드`,
        prompt: `"${year}년 ${searchKeyword} 트렌드" 검색 후 JSON 응답:
{
  "trends": ["${year}년 핵심 트렌드1", "트렌드2", "트렌드3", "트렌드4", "트렌드5"]
}
- 기술 발전, 소비자 선호 변화, 신기능 등 최신 트렌드 5개`
      },
      {
        name: 'buyingFactors',
        query: `${searchKeyword} 구매 고려사항`,
        prompt: `"${searchKeyword} 구매 시 고려사항" 검색 후 JSON 응답:
{
  "buyingFactors": [
    "고려사항1 (예: 스위치 종류 - 청축/갈축/적축)",
    "고려사항2 (예: 노이즈캔슬링 유무)",
    "고려사항3",
    "고려사항4",
    "고려사항5"
  ]
}
⚠️ 중요: 이 카테고리 제품을 구매할 때 반드시 확인해야 하는 핵심 스펙/기능을 구체적으로 작성
- 예시) 기계식키보드: 스위치종류, 키캡재질, 연결방식, 배열, 텐키유무
- 예시) 에어팟: 노이즈캔슬링, 공간음향, 배터리, 방수등급, 무선충전
- 예시) 아기물티슈: 성분(무향/저자극), 두께, 매수, 휴대성, 엠보싱유무`
      }
    ];

    // 쿼리별 UI 표시 텍스트
    const queryDisplayTexts: Record<string, string> = {
      main: `"${searchKeyword} ${year}년 추천" 검색 중...`,
      trends: `"${year}년 ${searchKeyword} 트렌드" 검색 중...`,
      buyingFactors: `"${searchKeyword} 구매 고려사항" 검색 중...`,
    };

    // 3개 쿼리 병렬 실행 (개별 시간 측정)
    const queryTimings: { name: string; duration: number }[] = [];

    const results = await Promise.allSettled(
      queries.map(async (q) => {
        // 쿼리 시작 알림
        onProgress?.({
          type: 'query_start',
          queryName: q.name,
          queryText: queryDisplayTexts[q.name] || q.query,
        });

        const queryStart = Date.now();
        const result = await callGeminiWithRetry(() => model.generateContent(q.prompt));
        const queryDuration = Date.now() - queryStart;
        queryTimings.push({ name: q.name, duration: queryDuration });

        const response = result.response;
        const text = response.text();

        // 출처 추출
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
          .slice(0, 3);

        console.log(`[Step1] ✅ ${q.name} 완료: ${queryDuration}ms (쿼리: ${webSearchQueries[0] || q.query})`);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

        // 쿼리 완료 알림 (결과 포함)
        onProgress?.({
          type: 'query_done',
          queryName: q.name,
          result: parsedData,
        });

        return {
          name: q.name,
          data: parsedData,
          sources,
          searchQueries: webSearchQueries
        };
      })
    );

    // 개별 쿼리 시간 정렬 출력
    const sortedTimings = queryTimings.sort((a, b) => b.duration - a.duration);
    console.log(`[Step1] ⏱️ 쿼리별 소요시간 (느린 순):`);
    sortedTimings.forEach((t, i) => {
      const bar = '█'.repeat(Math.ceil(t.duration / 200));
      console.log(`[Step1]   ${i + 1}. ${t.name.padEnd(14)} ${t.duration.toString().padStart(4)}ms ${bar}`);
    });
    console.log(`[Step1] 🏁 병렬 웹검색 완료: ${Date.now() - startTime}ms (병목: ${sortedTimings[0]?.name})`);

    // 결과 병합
    const allSources: Array<{ title: string; url: string }> = [];
    const allSearchQueries: string[] = [];
    let mainData: any = {};
    let trendsData: string[] = [];
    let buyingFactors: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { name, data, sources, searchQueries } = result.value;
        allSources.push(...sources);
        allSearchQueries.push(...searchQueries);

        switch (name) {
          case 'main':
            mainData = data;
            break;
          case 'trends':
            trendsData = data.trends || [];
            break;
          case 'buyingFactors':
            buyingFactors = data.buyingFactors || [];
            break;
        }
      } else {
        console.warn(`[Step1] ⚠️ ${(result as PromiseRejectedResult).reason}`);
      }
    }

    // 트렌드 병합 (중복 제거)
    const mergedTrends = [...new Set([
      ...(mainData.trends || []),
      ...trendsData
    ])].slice(0, 5);

    // 출처가 없으면 다나와 기본 링크 추가
    if (allSources.length === 0) {
      allSources.push({
        title: `다나와 ${searchKeyword} 인기순위`,
        url: `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(searchKeyword)}&sort=saveDESC`,
      });
    }

    const trendData: TrendAnalysis = {
      timestamp,
      top10Summary: mainData.top10Summary || '',
      trends: mergedTrends,
      pros: mainData.pros || [],
      cons: mainData.cons || [],
      priceInsight: '',  // 제거됨
      searchQueries: allSearchQueries.length > 0 ? allSearchQueries : queries.map(q => q.query),
      sources: allSources.slice(0, 8),
      topBrands: [],  // 제거됨 (효용 낮음)
      buyingFactors,
    };

    // 결과 로깅
    console.log(`[Step1] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Step1] 📊 트렌드: ${mergedTrends.join(', ')}`);
    console.log(`[Step1] ⭐ 구매고려사항: ${buyingFactors.join(', ')}`);
    console.log(`[Step1] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // 최종 결과 콜백
    onProgress?.({
      type: 'all_done',
      result: {
        trends: mergedTrends,
        pros: mainData.pros || [],
        cons: mainData.cons || [],
        buyingFactors,
      }
    });

    // 캐시에 저장
    setWebSearchCache(searchKeyword, trendData);
    return trendData;

  } catch (e) {
    console.error('[Step1] Web search failed:', e);
    return null;
  }
}

// 빈 TrendAnalysis 생성 헬퍼
function createEmptyTrendAnalysis(timestamp: string): TrendAnalysis {
  return {
    timestamp,
    top10Summary: '',
    trends: [],
    pros: [],
    cons: [],
    priceInsight: '',
    searchQueries: [],
    sources: [],
    topBrands: [],
    buyingFactors: [],
  };
}

// ============================================================================
// Step 2: Product Crawling (Danawa) - 스트리밍 지원
// ============================================================================

// 새 아키텍처: 120개 상품 + 리뷰 10개씩 병렬 크롤링
const PRODUCT_CRAWL_LIMIT = 120; // 40 → 120개로 확장
const REVIEWS_PER_PRODUCT = 10;  // 리뷰 10개씩
const FIRST_BATCH_COMPLETE_COUNT = 5; // 5개 도착 시 '실시간 인기상품 분석' 토글 완료

// 🆕 멀티 정렬 크롤링: 인기상품순 + 상품평순 합집합으로 더 다양한 아이템풀 구성
const USE_MULTI_SORT_CRAWL = true; // true: saveDESC + opinionDESC 합집합, false: saveDESC만

async function crawlProductsWithStreaming(
  _categoryKey: string,
  categoryName: string,
  onProductBatch?: (products: DanawaSearchListItem[], isComplete: boolean, isFirstBatchComplete?: boolean) => void,
  onHeaderParsed?: (data: { searchUrl: string; filters?: DanawaFilterSection[] }) => void
): Promise<{ products: DanawaSearchListItem[]; cached: boolean; searchUrl: string; filters?: DanawaFilterSection[] }> {
  console.log(`[Step2] Crawling products for: ${categoryName} (limit: ${PRODUCT_CRAWL_LIMIT})`);

  // 1. Supabase 캐시에서 제품 + 필터 조회 (캐시 전용 - 신선도 체크 제거)
  const [supabaseCache, filterCache] = await Promise.all([
    getProductsFromCache(categoryName, PRODUCT_CRAWL_LIMIT),
    getFiltersFromCache(categoryName),
  ]);

  if (supabaseCache.hit && supabaseCache.products.length > 0) {
    console.log(`[Step2] Supabase cache HIT: ${supabaseCache.products.length} products`);

    if (filterCache.hit) {
      console.log(`[Step2] Filter cache HIT: ${filterCache.filters.length} sections`);
    }

    const searchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(categoryName)}`;
    const cachedFilters = filterCache.hit ? filterCache.filters : undefined;

    // 캐시 히트 시 헤더 정보 즉시 전달 (필터 포함)
    if (onHeaderParsed) {
      onHeaderParsed({ searchUrl, filters: cachedFilters });
    }

    // 캐시된 경우: 첫 배치 + 전체 완료 신호만 전송 (빠른 UI 업데이트)
    if (onProductBatch) {
      // 첫 5개로 product_analysis 완료 신호
      const firstBatch = supabaseCache.products.slice(0, FIRST_BATCH_COMPLETE_COUNT);
      onProductBatch(firstBatch, false, true);
      // 나머지 한번에 전송 + 완료 신호
      const rest = supabaseCache.products.slice(FIRST_BATCH_COMPLETE_COUNT);
      if (rest.length > 0) {
        onProductBatch(rest, true, false);
      } else {
        onProductBatch([], true, false);
      }
    }
    return { products: supabaseCache.products, cached: true, searchUrl, filters: cachedFilters };
  }

  // 2. 파일 기반 캐시 확인 (기존 로직)
  const cached = getQueryCache(categoryName);
  if (cached && cached.items.length > 0) {
    console.log(`[Step2] File cache hit: ${cached.items.length} products`);

    // 캐시 히트 시 헤더 정보 즉시 전달
    if (onHeaderParsed) {
      onHeaderParsed({ searchUrl: cached.searchUrl, filters: cached.filters });
    }

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
  let headerParsedCalled = false;

  // 🆕 멀티 정렬 크롤링: 인기상품순 + 상품평순 병렬 실행
  if (USE_MULTI_SORT_CRAWL) {
    console.log(`[Step2] 🔀 Multi-sort crawling: saveDESC + opinionDESC (${PRODUCT_CRAWL_LIMIT} each)`);

    // 두 정렬을 병렬로 실행
    const [popularResponse, reviewResponse] = await Promise.all([
      // 1. 인기상품순 (saveDESC) - 스트리밍 콜백 포함
      crawlDanawaSearchListLite(
        { query: categoryName, limit: PRODUCT_CRAWL_LIMIT, sort: 'saveDESC' },
        (product, _index) => {
          collectedProducts.push(product);
          pendingBatch.push(product);
          if (pendingBatch.length >= batchSize && onProductBatch) {
            const isFirstBatchComplete = !firstBatchNotified && collectedProducts.length >= FIRST_BATCH_COMPLETE_COUNT;
            if (isFirstBatchComplete) firstBatchNotified = true;
            onProductBatch([...pendingBatch], false, isFirstBatchComplete);
            pendingBatch = [];
          }
        },
        (header) => {
          if (onHeaderParsed && !headerParsedCalled) {
            headerParsedCalled = true;
            onHeaderParsed({ searchUrl: header.searchUrl, filters: header.filters });
          }
        }
      ),
      // 2. 상품평 많은 순 (opinionDESC) - 콜백 없이 조용히 실행
      crawlDanawaSearchListLite(
        { query: categoryName, limit: PRODUCT_CRAWL_LIMIT, sort: 'opinionDESC' }
      ),
    ]);

    // pcode 기준 합집합 생성 (인기상품순 우선)
    const seenPcodes = new Set<string>();
    const mergedProducts: DanawaSearchListItem[] = [];

    // 인기상품순 먼저 추가
    for (const product of popularResponse.items) {
      if (!seenPcodes.has(product.pcode)) {
        seenPcodes.add(product.pcode);
        mergedProducts.push(product);
      }
    }
    const popularCount = mergedProducts.length;

    // 상품평순에서 새로운 상품만 추가
    let addedFromReview = 0;
    for (const product of reviewResponse.items) {
      if (!seenPcodes.has(product.pcode)) {
        seenPcodes.add(product.pcode);
        mergedProducts.push(product);
        addedFromReview++;
      }
    }

    console.log(`[Step2] 📊 Merge result: ${popularCount} (인기순) + ${addedFromReview} (상품평순 추가) = ${mergedProducts.length} total`);

    // 상품평순에서 추가된 상품들을 배치로 전송
    if (addedFromReview > 0 && onProductBatch) {
      const newProducts = mergedProducts.slice(popularCount);
      onProductBatch(newProducts, false, false);
    }

    // 완료 신호 전송
    if (onProductBatch) {
      if (pendingBatch.length > 0) {
        onProductBatch(pendingBatch, true);
      } else {
        onProductBatch([], true);
      }
    }

    if (mergedProducts.length > 0) {
      // 캐시는 인기순 응답 기준으로 저장 (필터 정보 포함)
      setQueryCache({ ...popularResponse, items: mergedProducts, totalCount: mergedProducts.length });
      console.log(`[Step2] ✅ Multi-sort crawl complete: ${mergedProducts.length} products`);
      return { products: mergedProducts, cached: false, searchUrl: popularResponse.searchUrl, filters: popularResponse.filters };
    }

    console.error('[Step2] Multi-sort crawling failed');
    return { products: [], cached: false, searchUrl: popularResponse.searchUrl };
  }

  // 기존 단일 정렬 크롤링 (USE_MULTI_SORT_CRAWL = false인 경우)
  const response = await crawlDanawaSearchListLite(
    {
      query: categoryName,
      limit: PRODUCT_CRAWL_LIMIT,
      sort: 'saveDESC',
    },
    (product, _index) => {
      collectedProducts.push(product);
      pendingBatch.push(product);
      if (pendingBatch.length >= batchSize && onProductBatch) {
        const isFirstBatchComplete = !firstBatchNotified && collectedProducts.length >= FIRST_BATCH_COMPLETE_COUNT;
        if (isFirstBatchComplete) firstBatchNotified = true;
        onProductBatch([...pendingBatch], false, isFirstBatchComplete);
        pendingBatch = [];
      }
    },
    (header) => {
      if (onHeaderParsed) {
        onHeaderParsed({ searchUrl: header.searchUrl, filters: header.filters });
      }
    }
  );

  // 남은 배치 전송
  if (pendingBatch.length > 0 && onProductBatch) {
    onProductBatch(pendingBatch, true);
  } else if (onProductBatch && collectedProducts.length > 0) {
    onProductBatch([], true);
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
 * Supabase 캐시 우선 조회 후, 캐시 미스인 경우에만 크롤링
 */
async function crawlReviewsForProducts(
  products: DanawaSearchListItem[],
  onProgress?: (completed: number, total: number, reviewCount: number) => void
): Promise<{ reviews: Record<string, ReviewCrawlResult>; totalReviews: number }> {
  const pcodes = products.map(p => p.pcode);
  console.log(`[Step2.5] Starting review crawling for ${pcodes.length} products (${REVIEWS_PER_PRODUCT} reviews each)`);

  const startTime = Date.now();

  // 1. Supabase 캐시에서 리뷰 조회
  const cacheResult = await getReviewsFromCache(pcodes);
  if (cacheResult.hit && cacheResult.totalReviews > 0) {
    console.log(`[Step2.5] Supabase review cache HIT: ${cacheResult.totalReviews} reviews`);

    // 캐시된 리뷰를 ReviewCrawlResult 형식으로 변환
    const reviewMap: Record<string, ReviewCrawlResult> = {};
    for (const pcode of pcodes) {
      const cachedReviews = cacheResult.reviews[pcode] || [];
      // 평균 평점 계산
      const avgRating = cachedReviews.length > 0
        ? cachedReviews.reduce((sum, r) => sum + r.rating, 0) / cachedReviews.length
        : null;
      reviewMap[pcode] = {
        pcode,
        success: cachedReviews.length > 0,
        reviews: cachedReviews,
        reviewCount: cachedReviews.length,
        averageRating: avgRating,
      };
    }

    // 진행 콜백 호출 (즉시 완료)
    if (onProgress) {
      onProgress(pcodes.length, pcodes.length, cacheResult.totalReviews);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[Step2.5] Review cache complete: ${Object.keys(cacheResult.reviews).length} products, ${cacheResult.totalReviews} reviews (${(elapsedMs / 1000).toFixed(1)}s)`);

    return { reviews: reviewMap, totalReviews: cacheResult.totalReviews };
  }

  // 2. 캐시 미스 - 실시간 크롤링
  console.log(`[Step2.5] Cache miss, starting live crawl...`);
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
// Step 2.6: Review Analysis (실제 리뷰 분석)
// ============================================================================

export interface ReviewAnalysis {
  positiveKeywords: string[];   // 긍정 키워드 (예: "세척 편함", "조용함")
  negativeKeywords: string[];   // 부정 키워드 (예: "물때", "소음")
  commonConcerns: string[];     // 주요 구매 고려사항
  prosTags: string[];           // 프론트엔드용 장점 태그
  consTags: string[];           // 프론트엔드용 단점 태그
  analyzedCount: number;        // 분석된 리뷰 수
}

/**
 * 리뷰 샘플링: 긍정 25개 + 부정 25개 (길이 긴 순)
 */
function sampleReviewsForAnalysis(
  allReviews: Record<string, ReviewCrawlResult>
): { positive: Array<{ content: string; rating: number }>; negative: Array<{ content: string; rating: number }> } {
  // 모든 리뷰를 하나의 배열로 합침
  const allReviewsList: Array<{ content: string; rating: number; length: number }> = [];

  Object.values(allReviews).forEach(result => {
    if (!result.success) return;
    result.reviews.forEach(r => {
      if (r.content && r.content.length >= 20) { // 최소 20자 이상
        allReviewsList.push({
          content: r.content,
          rating: r.rating,
          length: r.content.length,
        });
      }
    });
  });

  // 긍정 리뷰 (4-5점) - 길이 긴 순으로 정렬 후 30개
  const positiveReviews = allReviewsList
    .filter(r => r.rating >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 30)
    .map(r => ({ content: r.content, rating: r.rating }));

  // 부정 리뷰 (1-3점) - 길이 긴 순으로 정렬 후 30개
  const negativeReviews = allReviewsList
    .filter(r => r.rating <= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 30)
    .map(r => ({ content: r.content, rating: r.rating }));

  console.log(`[ReviewAnalysis] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[ReviewAnalysis] 📊 리뷰 샘플링 결과`);
  console.log(`[ReviewAnalysis]   전체 리뷰: ${allReviewsList.length}개`);
  console.log(`[ReviewAnalysis]   긍정 리뷰 (4-5점): ${positiveReviews.length}개`);
  console.log(`[ReviewAnalysis]   부정 리뷰 (1-3점): ${negativeReviews.length}개`);

  // 샘플 리뷰 출력 (각 3개씩)
  if (positiveReviews.length > 0) {
    console.log(`[ReviewAnalysis] ✅ 긍정 리뷰 샘플 (상위 3개):`);
    positiveReviews.slice(0, 3).forEach((r, i) => {
      console.log(`[ReviewAnalysis]   ${i + 1}. [${r.rating}점] ${r.content.slice(0, 100)}...`);
    });
  }

  if (negativeReviews.length > 0) {
    console.log(`[ReviewAnalysis] ❌ 부정 리뷰 샘플 (상위 3개):`);
    negativeReviews.slice(0, 3).forEach((r, i) => {
      console.log(`[ReviewAnalysis]   ${i + 1}. [${r.rating}점] ${r.content.slice(0, 100)}...`);
    });
  }
  console.log(`[ReviewAnalysis] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return { positive: positiveReviews, negative: negativeReviews };
}

/**
 * LLM으로 리뷰 분석 (장단점 키워드 추출)
 */
async function analyzeReviews(
  categoryName: string,
  allReviews: Record<string, ReviewCrawlResult>
): Promise<ReviewAnalysis | null> {
  if (!ai) return null;

  const sampled = sampleReviewsForAnalysis(allReviews);

  // 리뷰가 너무 적으면 분석 스킵
  if (sampled.positive.length + sampled.negative.length < 10) {
    console.log(`[ReviewAnalysis] Skipping - not enough reviews (${sampled.positive.length + sampled.negative.length})`);
    return null;
  }

  const positiveText = sampled.positive
    .map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 300)}`)
    .join('\n');

  const negativeText = sampled.negative
    .map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 300)}`)
    .join('\n');

  const prompt = `
당신은 "${categoryName}" 제품 리뷰 분석 전문가입니다.
아래 실제 구매자 리뷰를 분석하여 핵심 키워드를 추출하세요.

## 긍정 리뷰 (4-5점)
${positiveText || '(없음)'}

## 부정 리뷰 (1-3점)
${negativeText || '(없음)'}

## 분석 규칙
1. 여러 리뷰에서 **반복적으로 언급되는** 내용만 추출하세요
2. 키워드는 2-5단어로 간결하게 (예: "세척 편함", "소음 큼", "가성비 좋음")
3. 제품 카테고리에 특화된 키워드 위주로 (일반적인 "배송 빠름" 등 제외)
4. 각 항목 최대 8개까지

## 출력 (JSON만)
\`\`\`json
{
  "positiveKeywords": ["키워드1", "키워드2", ...],
  "negativeKeywords": ["키워드1", "키워드2", ...],
  "commonConcerns": ["구매 시 고려할 점1", "고려할 점2", ...]
}
\`\`\`
`;

  try {
    console.log(`[ReviewAnalysis] Analyzing ${sampled.positive.length + sampled.negative.length} reviews...`);
    const startTime = Date.now();

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
      }
    });

    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[ReviewAnalysis] Failed to parse JSON response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const elapsed = Date.now() - startTime;

    console.log(`[ReviewAnalysis] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[ReviewAnalysis] 🎯 LLM 분석 결과 (${elapsed}ms)`);
    console.log(`[ReviewAnalysis]   ✅ 긍정 키워드: ${(parsed.positiveKeywords || []).join(', ')}`);
    console.log(`[ReviewAnalysis]   ❌ 부정 키워드: ${(parsed.negativeKeywords || []).join(', ')}`);
    console.log(`[ReviewAnalysis]   💡 구매 고려사항: ${(parsed.commonConcerns || []).join(', ')}`);
    console.log(`[ReviewAnalysis] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
      positiveKeywords: parsed.positiveKeywords || [],
      negativeKeywords: parsed.negativeKeywords || [],
      commonConcerns: parsed.commonConcerns || [],
      prosTags: (parsed.positiveKeywords || []).slice(0, 6),
      consTags: (parsed.negativeKeywords || []).slice(0, 6),
      analyzedCount: sampled.positive.length + sampled.negative.length,
    };
  } catch (error) {
    console.error(`[ReviewAnalysis] Error:`, error);
    return null;
  }
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

    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
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
 * - "~원 이하" 형식으로 최대치만 표시 (더 직관적)
 * - 가격 분포 정보 (평균, 중앙값, 프리미엄 라인) 포함
 * - 1만원 이하: 천원 단위 표기
 * - 1만원~10만원: 만원 단위 표기
 * - 10만원 이상: 10만원 단위 표기
 */
function generateBudgetOptions(
  minPrice: number,
  avgPrice: number,
  maxPrice: number
): Array<{ value: string; label: string; description: string; isPopular?: boolean }> {
  // 가격 구간 계산
  const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
  const midMax = Math.round(avgPrice * 1.3);
  const premiumStart = Math.round(avgPrice * 1.5);

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
        return `${man}만 ${cheon}천`;
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

  // 숫자 포맷 헬퍼 (description용)
  const formatPriceNum = (price: number): string => {
    if (price >= 10000) {
      const man = Math.floor(price / 10000);
      const cheon = Math.round((price % 10000) / 1000);
      if (cheon > 0) {
        return `${man}만${cheon}천`;
      }
      return `${man}만`;
    }
    return `${Math.round(price / 1000)}천`;
  };

  // 구간 레이블 생성 - "~원 이하" 형식 (최대치만 표시)
  const entryLabel = `${formatPrice(entryMax)}원 이하`;
  const midLabel = `${formatPrice(midMax)}원 이하`;
  const premiumLabel = `${formatPrice(premiumStart)}원 이상`;

  // 중복 체크 및 보정
  const options: Array<{ value: string; label: string; description: string; isPopular?: boolean }> = [];

  // Entry 옵션 - 가격 분포 정보 포함
  options.push({
    value: 'entry',
    label: entryLabel,
    description: `가성비 모델 · 최저가 ${formatPriceNum(minPrice)}원부터`
  });

  // Mid 옵션 - Entry와 중복되면 스킵
  if (entryLabel !== midLabel && formatPrice(entryMax) !== formatPrice(midMax)) {
    options.push({
      value: 'mid',
      label: midLabel,
      description: `평균가 ${formatPriceNum(avgPrice)}원 · 인기 가격대`,
      isPopular: true
    });
  }

  // Premium 옵션 - 이전 옵션과 시작 가격이 겹치지 않으면 추가
  const lastOption = options[options.length - 1];
  if (!lastOption.label.includes(formatPrice(premiumStart))) {
    options.push({
      value: 'premium',
      label: premiumLabel,
      description: `프리미엄 라인 · 최고가 ${formatPriceNum(maxPrice)}원`
    });
  }

  // 옵션이 2개 미만이면 단순 분할로 재생성
  if (options.length < 2) {
    const third = (maxPrice - minPrice) / 3;
    const lowMax = minPrice + third;
    const highMin = maxPrice - third;

    return [
      { value: 'low', label: `${formatPrice(lowMax)}원 이하`, description: `가성비 · 최저가 ${formatPriceNum(minPrice)}원부터` },
      { value: 'mid', label: `${formatPrice(highMin)}원 이하`, description: `평균가 ${formatPriceNum(avgPrice)}원 · 인기 가격대`, isPopular: true },
      { value: 'high', label: `${formatPrice(highMin)}원 이상`, description: `프리미엄 · 최고가 ${formatPriceNum(maxPrice)}원` }
    ];
  }

  return options;
}

// ============================================================================
// Step 3.6: Required Questions Generation (예산 + 피하고 싶은 단점)
// ============================================================================

/**
 * 예산 질문 생성 (LLM 기반 - 가격 분포 분석으로 신빙성 있는 설명 생성)
 */
async function generateBudgetQuestion(
  categoryName: string,
  minPrice: number,
  avgPrice: number,
  maxPrice: number
): Promise<QuestionTodo> {
  // 기본 옵션 (LLM 실패 시 폴백용)
  const fallbackOptions = generateBudgetOptions(minPrice, avgPrice, maxPrice);
  
  // 가격 구간 계산
  const entryMax = Math.round(minPrice + (avgPrice - minPrice) * 0.5);
  const midMax = Math.round(avgPrice * 1.3);
  const premiumStart = Math.round(avgPrice * 1.5);

  // 숫자 포맷 헬퍼 (원 단위 그대로 - LLM이 적절한 형식으로 변환)
  const formatPriceRaw = (price: number): string => {
    return price.toLocaleString() + '원';
  };

  // 질문 텍스트는 LLM이 생성하도록 (가격대에 맞는 자연스러운 표현)
  const defaultQuestionText = `예산은 어느 정도로 생각하세요?`;

  if (!ai) {
    // '상관없어요' 옵션 추가
    const optionsWithSkip = [
      ...fallbackOptions,
      { value: 'skip', label: '상관없어요', description: '예산에 상관없이 추천받을게요' }
    ];
    return {
      id: 'budget',
      question: defaultQuestionText,
      options: optionsWithSkip,
      type: 'single',
      priority: 99,
      dataSource: '가격 분포 분석',
      completed: false,
    };
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      }
    });

    const prompt = `"${categoryName}" 제품의 가격 분포를 분석하여 예산 질문을 생성해주세요.

## 가격 분포 데이터 (원 단위)
- **최저가:** ${formatPriceRaw(minPrice)}
- **평균가:** ${formatPriceRaw(avgPrice)}  
- **최고가:** ${formatPriceRaw(maxPrice)}
- **가성비 라인 상한:** ${formatPriceRaw(entryMax)}
- **중간 라인 상한:** ${formatPriceRaw(midMax)}
- **프리미엄 라인 시작:** ${formatPriceRaw(premiumStart)}

## 생성 규칙

### 1. question (질문)
- 형식: "예산은 어느 정도로 생각하세요? (평균 XX원, YY~ZZ가 가장 많아요)"
- 평균가와 인기 가격대 정보를 자연스럽게 포함

### 2. 가격 표기 방식 (중요!)
가격대에 따라 자연스러운 단위 선택:
- **평균가 1만원 미만:** 천원 단위 (예: "5천원 이하", "8천원대", "1만 2천원")
- **평균가 1~5만원:** 천원/만원 혼용 (예: "1만 5천원 이하", "3만원대")
- **평균가 5만원 이상:** 만원 단위 (예: "30만원 이하", "50만원대")
- 절대 "37만10천원" 같은 어색한 표현 금지! 자연스럽게!

### 3. options (3개)
- entry: 가성비 라인
- mid: 평균/인기 가격대
- premium: 프리미엄 라인
- description: 해당 가격대 제품의 특징 (간결하게)
- isPopular: 가장 많이 선택되는 가격대 1개에만 true (보통 mid)

## 출력 JSON 형식
{
  "question": "예산은 어느 정도로 생각하세요? (평균 OO원, XX~YY가 가장 많아요)",
  "options": [
    {"value": "entry", "label": "자연스러운 가격 표현", "description": "특징"},
    {"value": "mid", "label": "자연스러운 가격 표현", "description": "특징", "isPopular": true},
    {"value": "premium", "label": "자연스러운 가격 표현", "description": "특징"}
  ]
}

JSON만 출력하세요:`;

    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        question?: string;
        options: Array<{ value: string; label: string; description: string; isPopular?: boolean }>
      };
      
      if (parsed.options && parsed.options.length >= 2) {
        console.log(`[Step3.6] Generated budget question with LLM-enhanced descriptions`);
        // '상관없어요' 옵션 추가 (스킵 가능하도록)
        const optionsWithSkip = [
          ...parsed.options,
          { value: 'skip', label: '상관없어요', description: '예산에 상관없이 추천받을게요' }
        ];
        return {
          id: 'budget',
          question: parsed.question || defaultQuestionText,
          options: optionsWithSkip,
          type: 'single',
          priority: 99,
          dataSource: '가격 분포 분석 (LLM)',
          completed: false,
        };
      }
    }
  } catch (e) {
    console.error('[Step3.6] Budget question LLM generation failed, using fallback:', e);
  }

  // LLM 실패 시 기본값 ('상관없어요' 옵션 추가)
  const fallbackWithSkip = [
    ...fallbackOptions,
    { value: 'skip', label: '상관없어요', description: '예산에 상관없이 추천받을게요' }
  ];
  return {
    id: 'budget',
    question: defaultQuestionText,
    options: fallbackWithSkip,
    type: 'single',
    priority: 99,
    dataSource: '가격 분포 분석',
    completed: false,
  };
}

/**
 * 피하고 싶은 단점 질문 생성 (placeholder만 - 옵션은 런타임에 동적 생성)
 *
 * 옵션 생성은 사용자가 해당 질문에 도달했을 때 /api/knowledge-agent/generate-negative-options 호출
 * → 카테고리 + 앞선 답변 맥락을 반영한 맞춤 옵션 생성
 */
function generateAvoidNegativesQuestion(): QuestionTodo {
  console.log(`[Step3.6] Created avoid_negatives placeholder (options will be generated dynamically)`);
  return {
    id: 'avoid_negatives',
    question: '혹시 꼭 피하고 싶은 단점이 있으신가요?',
    options: [],  // 빈 배열 - 런타임에 동적으로 채워짐
    type: 'multi',
    priority: 100,
    dataSource: '맞춤 분석',
    completed: false,
    dynamicOptions: true,  // 동적 옵션 필요 플래그
  } as QuestionTodo & { dynamicOptions: boolean };
}

/**
 * 필수 질문(예산) 생성
 * - 맞춤질문과 분리하여 항상 생성됨을 보장
 */
/**
 * 온보딩 기반 첫 질문 생성
 */
async function generateOnboardingQuestion(
  categoryName: string,
  onboarding?: { purchaseSituation?: string; replaceReasons?: string[]; replaceOther?: string; firstSituations?: string[]; firstSituationOther?: string } | null,
  babyInfo?: { gender?: string; calculatedMonths?: number; expectedDate?: string; isBornYet?: boolean } | null
): Promise<QuestionTodo | null> {
  // 온보딩 데이터가 없거나 의미있는 정보가 없으면 null 반환
  if (!onboarding || (!onboarding.replaceReasons?.length && !onboarding.firstSituations?.length && !onboarding.replaceOther && !onboarding.firstSituationOther)) {
    return null;
  }

  // "상관없어요"만 선택한 경우도 스킵
  const hasOnlyDontCare =
    (onboarding.replaceReasons?.length === 1 && onboarding.replaceReasons[0] === '상관없어요') ||
    (onboarding.firstSituations?.length === 1 && onboarding.firstSituations[0] === '상관없어요');

  if (hasOnlyDontCare) {
    return null;
  }

  if (!ai) {
    return null;
  }

  try {
    console.log(`[Step3.5] Generating onboarding-based question`);

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
      },
    });

    // 온보딩 정보 정리
    const onboardingContext: string[] = [];

    if (onboarding.purchaseSituation) {
      const situationMap: Record<string, string> = {
        first: '첫 구매',
        replace: '기존 제품 교체/업그레이드',
        gift: '선물용/둘러보기',
      };
      onboardingContext.push(`구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}`);
    }

    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0 && !onboarding.replaceReasons.includes('상관없어요')) {
      onboardingContext.push(`기존 제품 불만사항: ${onboarding.replaceReasons.join(', ')}`);
    }

    if (onboarding.replaceOther) {
      onboardingContext.push(`기타 불만: ${onboarding.replaceOther}`);
    }

    if (onboarding.firstSituations && onboarding.firstSituations.length > 0 && !onboarding.firstSituations.includes('상관없어요')) {
      onboardingContext.push(`구매 니즈/상황: ${onboarding.firstSituations.join(', ')}`);
    }

    if (onboarding.firstSituationOther) {
      onboardingContext.push(`기타 상황: ${onboarding.firstSituationOther}`);
    }

    if (babyInfo?.calculatedMonths !== undefined) {
      onboardingContext.push(`아기 월령: ${babyInfo.calculatedMonths}개월`);
    }

    const onboardingText = onboardingContext.join('\n');

    const prompt = `당신은 "${categoryName}" 구매 전문가입니다.

## 사용자가 온보딩에서 입력한 정보
${onboardingText}

## 목표
위 온보딩 정보를 기반으로 **딱 1개의 첫 질문**을 생성하세요.

## 생성 규칙
1. **온보딩 정보와 직접 연관된 질문만 생성**
   - 예: "기존 제품 불만: 소음이 커서" → "소음 레벨은 어느 정도가 좋으신가요?"
   - 예: "구매 니즈: 목욕 시 안전한 제품" → "목욕 시 안전 기능은 어떤 게 중요하신가요?"
   - 예: "기존 제품 불만: 세척이 번거로웠어요" → "세척 편의성은 어느 정도로 중요하신가요?"

2. **여러 불만/니즈가 있다면 가장 구체적이고 중요한 것 1개만 선택**
   - 우선순위: 구체적 스펙/기능 > 일반적 니즈

3. **옵션 설계 (3-4개)**
   - 온보딩 정보와 직접 연관된 구체적인 선택지
   - 모든 옵션에 소괄호 설명 필수. ex: ISOFIX (국제 표준 카시트 안전장치 인증)
   - **⛔ "둘 다", "모두", "기타", "직접 입력", "상관없어요", "잘 모르겠어요", "아무거나", "둘다 좋아요", "다 괜찮아요", "별로 안 중요해요" 등 회피성 옵션 절대 생성 금지** (복수선택 가능 + '상관없어요'는 시스템이 자동 추가함)

4. **질문 형태**
   - 자연스럽고 친근한 말투
   - 온보딩에서 언급한 키워드를 그대로 활용
   - 되도록이면 1문장으로 간결하게 

## 출력 형식
단일 질문 객체만 출력 (배열 아님):

{
  "id": "onboarding_1",
  "question": "질문 내용 (온보딩 키워드 포함)",
  "options": [
    {"value": "opt1", "label": "선택지1 (구체적 설명)", "description": "부가 설명"},
    {"value": "opt2", "label": "선택지2 (구체적 설명)", "description": "부가 설명"},
    {"value": "opt3", "label": "선택지3 (구체적 설명)", "description": "부가 설명"}
  ],
  "type": "single",
  "priority": 0,
  "dataSource": "온보딩 기반"
}

⚠️ JSON 객체만 출력 (배열 아님, 설명 없음)`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    console.log('[Step3.5] LLM response:', text.slice(0, 200));

    // JSON 파싱
    let question: QuestionTodo | null = null;
    try {
      question = JSON.parse(text);
    } catch (parseError) {
      console.error('[Step3.5] JSON parse error:', parseError);
      // JSON 추출 시도
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          question = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('[Step3.5] Failed to extract JSON');
        }
      }
    }

    if (!question || !question.question || !question.options || question.options.length === 0) {
      console.log('[Step3.5] Invalid question generated, skipping');
      return null;
    }

    // 유효성 검사 및 필드 강제 설정
    question.id = 'onboarding_1';
    question.type = 'single';
    question.priority = 0; // 가장 높은 우선순위
    question.dataSource = '온보딩 기반';
    question.completed = false;

    console.log(`[Step3.5] ✅ Generated onboarding question: ${question.question}`);
    return question;

  } catch (error) {
    console.error('[Step3.5] Error generating onboarding question:', error);
    return null;
  }
}

async function generateRequiredQuestions(
  categoryName: string,
  minPrice: number,
  avgPrice: number,
  maxPrice: number,
): Promise<{ budgetQuestion: QuestionTodo }> {
  console.log(`[Step3.6] Generating required questions (budget)`);

  // 예산 질문은 LLM 호출
  const budgetQuestion = await generateBudgetQuestion(categoryName, minPrice, avgPrice, maxPrice);
  // const avoidNegativesQuestion = generateAvoidNegativesQuestion();

  return { budgetQuestion };
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

⚠️ [필수] 소괄호 부가설명 유지/추가:
- 전문용어나 생소한 단어는 반드시 소괄호 설명 포함
- 예: "IH 압력 방식" → "IH 압력 방식 (밥맛 좋고 빠름)"
- 예: "초음파식" → "초음파식 (조용하지만 세균 주의)"
- 이미 소괄호 설명이 있으면 그대로 유지

입력: ${JSON.stringify(questionsData)}
출력 JSON만: {"질문id":["정제된 선택지1 (설명)","정제된 선택지2 (설명)"]}`;

  try {
    const startTime = Date.now();
    const result = await callGeminiWithRetry(() => model.generateContent(refinePrompt));
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
            options: newLabels.map((label, i) => {
              // 원본 옵션에서 유사한 label을 찾아 isPopular 유지
              const originalOpt = q.options.find(o =>
                o.label.includes(label) || label.includes(o.label) || o.label === label
              ) || q.options[i];
              return {
                value: `opt_${i + 1}`,
                label,
                description: originalOpt?.description || '',
                isPopular: originalOpt?.isPopular,  // isPopular 유지
                isRecommend: originalOpt?.isRecommend  // isRecommend 유지
              };
            })
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

// ============================================================================
// Brand Analysis Functions
// ============================================================================

interface BrandImportanceResult {
  shouldGenerateBrandQuestion: boolean;
  score: number; // 0-100
  involvement: 'high' | 'trust' | 'low'; // 카테고리 관여도
  topBrands: Array<{
    name: string;
    count: number;
    avgPrice: number;
    totalReviews: number;
    avgRating: number;
    popularityScore: number;
  }>;
  reasoning: string;
}

/**
 * 브랜드 중요도 자동 감지
 * - 브랜드 다양성, 구매 고려사항 키워드, 가격 분포, 카테고리 관여도를 분석하여 브랜드 질문 생성 여부 결정
 */
/**
 * 브랜드 중요도 분석 (100점 만점, 임계값 50점)
 *
 * 점수 체계:
 * 1. 브랜드 다양성: 0-30점
 * 2. 키워드 매칭: 0-15점 (저관여 제품은 10점)
 * 3. 가격 분포: 0-20점
 * 4. 카테고리 관여도: 0-30점 (high: 30, trust: 15, low: 0)
 */
function analyzeBrandImportance(
  products: DanawaSearchListItem[],
  categoryName: string,
  trendAnalysis: TrendAnalysis | null,
  reviewAnalysis: ReviewAnalysis | null
): BrandImportanceResult {
  let score = 0;
  const reasons: string[] = [];

  // 브랜드 데이터 수집
  const brandCounts: Record<string, number> = {};
  const brandPrices: Record<string, number[]> = {};

  products.forEach(p => {
    if (p.brand) {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
      if (!brandPrices[p.brand]) brandPrices[p.brand] = [];
      if (p.price) brandPrices[p.brand].push(p.price);
    }
  });

  const uniqueBrands = Object.keys(brandCounts).length;
  const totalProducts = products.length;

  // 브랜드가 2개 이하면 의미 없음
  if (uniqueBrands <= 2) {
    return {
      shouldGenerateBrandQuestion: false,
      score: 0,
      involvement: 'low',
      topBrands: [],
      reasoning: `브랜드 다양성 부족 (${uniqueBrands}개만 존재)`
    };
  }

  // 1. 브랜드 다양성 분석 (30점 만점) - 배점 조정
  const brandConcentration = Math.max(...Object.values(brandCounts)) / totalProducts;

  if (uniqueBrands >= 8 && brandConcentration < 0.5) {
    score += 30;
    reasons.push(`브랜드 다양성 높음 (${uniqueBrands}개, 집중도 ${Math.round(brandConcentration * 100)}%)`);
  } else if (uniqueBrands >= 5 && brandConcentration < 0.55) {
    score += 20;
    reasons.push(`브랜드 선택지 있음 (${uniqueBrands}개, 집중도 ${Math.round(brandConcentration * 100)}%)`);
  } else if (uniqueBrands >= 4) {
    score += 10;
    reasons.push(`브랜드 다양성 보통 (${uniqueBrands}개, 집중도 ${Math.round(brandConcentration * 100)}%)`);
  } else {
    reasons.push(`브랜드 다양성 낮음 (${uniqueBrands}개)`);
  }

  // 2. 구매 고려사항 키워드 매칭 (15점 만점) - 배점 조정
  const brandKeywords = ['브랜드', '제조사', '메이커', 'brand', '회사', '기업', '브랜'];
  const buyingFactors = [
    ...(trendAnalysis?.buyingFactors || []),
    ...(reviewAnalysis?.commonConcerns || [])
  ].join(' ').toLowerCase();

  const matchedKeywords = brandKeywords.filter(k => buyingFactors.includes(k.toLowerCase()));
  let keywordScore = 0;
  if (matchedKeywords.length > 0) {
    keywordScore = 15;
  }

  // 3. 브랜드별 가격 분포 차이 (20점 만점) - 배점 조정
  const brandPriceInfo: Array<{ brand: string; avg: number; variance: number }> = [];

  for (const [brand, prices] of Object.entries(brandPrices)) {
    if (prices.length >= 1) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.length > 1
        ? prices.reduce((sum, p) => sum + Math.abs(p - avg), 0) / prices.length
        : 0;
      brandPriceInfo.push({ brand, avg, variance });
    }
  }

  // 브랜드 간 평균 가격 차이 계산
  if (brandPriceInfo.length >= 3) {
    const avgPrices = brandPriceInfo.map(b => b.avg);
    const minAvg = Math.min(...avgPrices);
    const maxAvg = Math.max(...avgPrices);
    const priceSpread = (maxAvg - minAvg) / minAvg;

    if (priceSpread > 2.0) { // 3배 이상 차이
      score += 20;
      reasons.push('브랜드별 가격대 차별화 명확');
    } else if (priceSpread > 0.8) { // 1.8배 이상 차이
      score += 15;
      reasons.push('브랜드별 일부 가격 차이');
    } else if (priceSpread > 0.3) {
      score += 8;
      reasons.push('브랜드별 소폭 가격 차이');
    }
  }

  // 4. 카테고리 관여도 (30점 만점) - 신규 추가
  let involvement: 'high' | 'trust' | 'low' = 'low';
  let involvementScore = 0;

  // 고관여 키워드
  const highKeywords = ['유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루'];
  // 신뢰기반 키워드
  const trustKeywords = ['기저귀', '물티슈', '로션', '크림', '젖병', '젖꼭지', '쪽쪽이', '치발기', '분유', '이유식', '유산균', '비타민'];
  // 저관여 키워드 (명시적 체크용)
  const lowKeywords = ['양말', '내복', '턱받이', '손수건', '욕조', '장난감', '완구'];

  if (highKeywords.some(k => categoryName.includes(k))) {
    involvement = 'high';
    involvementScore = 30;
    reasons.push('고관여 제품 (안전/과시/장기사용)');
  } else if (trustKeywords.some(k => categoryName.includes(k))) {
    involvement = 'trust';
    involvementScore = 15;
    reasons.push('신뢰기반 제품 (피부접촉/발진우려)');
  } else if (lowKeywords.some(k => categoryName.includes(k))) {
    involvement = 'low';
    involvementScore = 0;
    reasons.push('저관여 제품 (단기사용/가성비)');
  } else {
    // 키워드 매칭 실패 시 기본값 trust (중간)
    involvement = 'trust';
    involvementScore = 15;
    reasons.push('기본 신뢰기반 (키워드 미매칭)');
  }

  score += involvementScore;

  // 5. 키워드 매칭 점수 적용 (저관여 제품은 감소)
  if (keywordScore > 0) {
    if (involvement === 'low') {
      // 저관여 제품은 키워드 점수 10점으로 감소
      score += 10;
      reasons.push('구매 고려사항에 브랜드 언급 (저관여 감소)');
    } else {
      score += keywordScore;
      reasons.push('구매 고려사항에 브랜드 언급');
    }
  }

  // 6. Top Brands 정렬 (인기도 점수: 제품 개수 + 리뷰 수 + 평점)
  const topBrands = Object.entries(brandCounts)
    .map(([name, count]) => {
      // 해당 브랜드의 모든 제품
      const brandProducts = products.filter(p => p.brand === name);

      // 총 리뷰 수
      const totalReviews = brandProducts.reduce((sum, p) => sum + (p.reviewCount || 0), 0);

      // 평균 평점
      const avgRating = brandProducts.length > 0
        ? brandProducts.reduce((sum, p) => sum + (p.rating || 0), 0) / brandProducts.length
        : 0;

      // 인기도 점수 계산 (제품 개수 우선, 동점 시 리뷰 수와 평점)
      // - 제품 개수: 100점 단위 (가장 중요)
      // - 리뷰 수: 0.1점 단위 (많은 리뷰 = 검증된 브랜드)
      // - 평점: 10점 단위 (품질 지표)
      const popularityScore = count * 100 + totalReviews * 0.1 + avgRating * 10;

      return {
        name,
        count,
        avgPrice: brandPrices[name] && brandPrices[name].length > 0
          ? Math.round(brandPrices[name].reduce((a, b) => a + b) / brandPrices[name].length)
          : 0,
        totalReviews,
        avgRating,
        popularityScore
      };
    })
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, 5);

  return {
    shouldGenerateBrandQuestion: score >= 60,
    score,
    involvement,
    topBrands,
    reasoning: reasons.join(' / ')
  };
}

/**
 * 브랜드별 특징 추출 (가격대, 시장 점유율 기반)
 */
function extractBrandCharacteristics(
  topBrands: Array<{ name: string; count: number; avgPrice: number; totalReviews?: number; avgRating?: number }>,
  trendAnalysis: TrendAnalysis | null,
  reviewAnalysis: ReviewAnalysis | null
): Record<string, string> {
  const brandDescriptions: Record<string, string> = {};

  topBrands.forEach(brand => {
    const parts: string[] = [];

    // 가격 포지셔닝
    const avgPrice = brand.avgPrice;
    if (avgPrice > 500000) {
      parts.push('프리미엄 라인');
    } else if (avgPrice > 200000) {
      parts.push('중고가');
    } else if (avgPrice > 100000) {
      parts.push('중가');
    } else if (avgPrice > 50000) {
      parts.push('보급형');
    } else if (avgPrice > 0) {
      parts.push('가성비');
    }

    // 시장 점유율 & 검증도 (리뷰 수 기반)
    if (brand.totalReviews && brand.totalReviews > 1000) {
      parts.push('검증된 브랜드');
    } else if (brand.count >= 5) {
      parts.push('인기 브랜드');
    } else if (brand.count >= 3) {
      parts.push('주요 브랜드');
    }

    // 평점 정보
    if (brand.avgRating && brand.avgRating >= 4.8) {
      parts.push('고평점');
    } else if (brand.avgRating && brand.avgRating >= 4.5) {
      parts.push('우수');
    }

    // 트렌드/리뷰 언급 확인
    const mentionContext = [
      trendAnalysis?.trends || [],
      trendAnalysis?.pros || [],
      reviewAnalysis?.positiveKeywords || []
    ].flat().join(' ').toLowerCase();

    if (mentionContext.includes(brand.name.toLowerCase())) {
      parts.push('트렌드');
    }

    // 제품 개수 정보
    parts.push(`${brand.count}개 제품`);

    // 가격 정보 (만원 단위)
    if (avgPrice > 10000) {
      parts.push(`${Math.round(avgPrice / 10000)}만원대`);
    } else if (avgPrice > 0) {
      parts.push(`${Math.round(avgPrice / 1000)}천원대`);
    }

    // 리뷰 수 정보 (많을 경우만 표시)
    if (brand.totalReviews && brand.totalReviews > 500) {
      parts.push(`${Math.round(brand.totalReviews / 100) / 10}k 리뷰`);
    }

    brandDescriptions[brand.name] = parts.slice(0, 4).join(' / ');
  });

  return brandDescriptions;
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

    // 동적 옵션 질문은 건너뛰기 옵션 제외 (런타임에 옵션 생성됨)
    if ((q as any).dynamicOptions) {
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
  filters?: DanawaFilterSection[],
  reviewAnalysis?: ReviewAnalysis | null,  // 🔥 리뷰 분석 결과 (선택적)
  personalizationContext?: string | null,  // 🆕 개인화 메모리 컨텍스트
  onboarding?: { purchaseSituation?: string; replaceReasons?: string[]; replaceOther?: string; firstSituations?: string[]; firstSituationOther?: string } | null,  // 🆕 온보딩 데이터
  babyInfo?: { gender?: string; calculatedMonths?: number; expectedDate?: string; isBornYet?: boolean } | null  // 🆕 아기 정보
): Promise<QuestionTodo[]> {
  if (!ai) return getDefaultQuestions(categoryName, products, trendAnalysis);

  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 500000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 150000;
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // 스펙 분포 분석을 별도 LLM 호출 대신 텍스트로 준비하여 메인 프롬프트에 포함 (시간 단축)
  const productSpecsForAnalysis = products.slice(0, 10).map((p, i) => {
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

  // 🔍 질문 생성에 전달되는 데이터 확인 (웹검색 데이터 기반 - 리뷰 분석은 병렬 실행 중)
  console.log(`[Step3] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[Step3] 📊 질문 생성 데이터 (웹검색 기반):`);
  console.log(`[Step3]   트렌드: ${trendAnalysis?.trends?.join(', ') || '(없음)'}`);
  console.log(`[Step3]   장점: ${trendAnalysis?.pros?.join(', ') || '(없음)'}`);
  console.log(`[Step3]   단점: ${trendAnalysis?.cons?.join(', ') || '(없음)'}`);
  console.log(`[Step3]   ⭐구매고려사항: ${trendAnalysis?.buyingFactors?.join(' / ') || '(없음)'}`);
  console.log(`[Step3] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // 🔥 브랜드 중요도 분석
  const brandImportance = analyzeBrandImportance(products, categoryName, trendAnalysis, reviewAnalysis || null);
  console.log(`[Step3] 📊 브랜드 중요도 분석: ${brandImportance.score}점 (${brandImportance.involvement}) - ${brandImportance.reasoning}`);
  if (brandImportance.shouldGenerateBrandQuestion) {
    console.log(`[Step3]   ⭐ 브랜드 질문 생성 권장 (임계값 50점 초과)`);
    console.log(`[Step3]   주요 브랜드: ${brandImportance.topBrands.map(b => `${b.name}(${b.count}개)`).join(', ')}`);
  }

  // 브랜드 특징 추출
  const brandCharacteristics = extractBrandCharacteristics(
    brandImportance.topBrands,
    trendAnalysis,
    reviewAnalysis || null
  );

  // 리뷰 분석 결과 (현재는 병렬 실행으로 null, 웹검색 데이터만 활용)
  const reviewInsightsText = reviewAnalysis
    ? `
- **🔍 실사용 리뷰 분석 (${reviewAnalysis.analyzedCount || 0}개 분석):**
  - 긍정 키워드: ${reviewAnalysis.positiveKeywords?.join(', ') || '(분석중)'}
  - 부정 키워드: ${reviewAnalysis.negativeKeywords?.join(', ') || '(분석중)'}
  - ⭐ 구매 시 고려사항: ${reviewAnalysis.commonConcerns?.join(' / ') || '(분석중)'}`
    : '';

  // ✅ 온보딩 기반 첫 질문 생성 (프롬프트 구성 전에 먼저 생성 - 중복 방지 위해)
  console.log(`[Step3] 🎯 Generating onboarding-based question first...`);
  const onboardingQuestion = await generateOnboardingQuestion(categoryName, onboarding, babyInfo);

  // 온보딩 질문이 생성되었다면 프롬프트에 추가할 섹션 준비
  let onboardingQuestionSection = '';
  if (onboardingQuestion) {
    console.log(`[Step3] ✅ Onboarding question generated: "${onboardingQuestion.question}"`);
    onboardingQuestionSection = `
## [⚠️ 온보딩 기반 질문 - 이미 생성됨, 절대 중복 금지!]
다음 질문은 이미 온보딩 정보를 기반으로 생성되었습니다. **이 질문과 의미적으로 중복되는 질문은 절대 생성하지 마세요!**

- **이미 질문함:** "${onboardingQuestion.question}"
- **질문 주제:** ${onboardingQuestion.options.map(o => o.label).join(', ')}

⚠️ **중복 방지:** 위 질문과 같은 주제(용량, 크기, 소재, 기능 등)를 다시 묻지 마세요!
`;
  }

  // 🆕 개인화 정보 컨텍스트
  const personalizationSection = personalizationContext
    ? `
## [사용자 정보 - 개인화 메모리]
<PersonalizationContext>
${personalizationContext}
</PersonalizationContext>

⚠️ **중요: 위 개인화 정보에 이미 포함된 내용은 질문하지 마세요!**
- 이미 알고 있는 정보를 다시 묻는 것은 사용자 경험을 해칩니다.
- 개인화 정보를 바탕으로 더 맞춤화된 질문을 생성하세요.
- 예: 아기 월령을 이미 알고 있다면 "8개월 아기에게 맞는 ○○○"처럼 맥락화하세요.
`
    : '';

  // 🆕 온보딩/아기정보 컨텍스트 (수집된 정보로 질문 최적화)
  let userContextSection = '';
  if (onboarding || babyInfo) {
    const contextParts: string[] = [];

    if (onboarding) {
      const situationMap: Record<string, string> = {
        first: '처음 구매하는 사용자',
        replace: '기존 제품 교체/업그레이드 목적',
        gift: '선물용 구매',
      };
      contextParts.push(`- 구매 상황: ${situationMap[onboarding.purchaseSituation || ''] || onboarding.purchaseSituation || '(미입력)'}`);

      if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
        contextParts.push(`- 기존 제품 불만사항: ${onboarding.replaceReasons.join(', ')}`);
      }
      if (onboarding.replaceOther) {
        contextParts.push(`- 기타 불만: ${onboarding.replaceOther}`);
      }
      // 첫구매/둘러보기 상황 (복수선택)
      if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
        contextParts.push(`- 구매 상황/니즈: ${onboarding.firstSituations.join(', ')}`);
      }
      if (onboarding.firstSituationOther) {
        contextParts.push(`- 기타 상황: ${onboarding.firstSituationOther}`);
      }
    }

    if (babyInfo) {
      if (babyInfo.calculatedMonths !== undefined && babyInfo.calculatedMonths !== null) {
        contextParts.push(`- ⭐ 아기 월령: ${babyInfo.calculatedMonths}개월 (이미 수집됨 - 월령 질문 생성 금지!)`);
      } else if (babyInfo.expectedDate) {
        contextParts.push(`- 출산예정일: ${babyInfo.expectedDate} (예비맘)`);
      }
      if (babyInfo.gender) {
        const genderMap: Record<string, string> = { male: '남아', female: '여아', unknown: '아직 모름' };
        contextParts.push(`- 아기 성별: ${genderMap[babyInfo.gender] || babyInfo.gender}`);
      }
    }

    if (contextParts.length > 0) {
      userContextSection = `
## [⚠️ 사용자가 이미 입력한 정보 - 절대 다시 질문하지 마세요!]
<CollectedUserInfo>
${contextParts.join('\n')}
</CollectedUserInfo>

⚠️ **[중요] 위 정보에 대해 다시 질문하면 안 됩니다!**
- **아기 월령이 이미 수집되었다면**: "아기 개월수", "아기 월령", "아기 나이" 등의 질문 생성 금지
- **기존 제품 불만사항이 있다면**: 해당 불만사항을 해결하는 방향으로 질문 설계 (예: "소음" 불만 → "소음 민감도" 질문 스킵)
- **교체 목적이라면**: "첫 구매인가요?" 같은 질문 생성 금지
- **⭐ 구매 상황/니즈나 기타 상황에서 구체적인 제품 타입/스펙을 언급했다면**: 해당 항목에 대한 선택 질문 생성 금지
  - 예시: "밴드형 기저귀 찾아요" → "팬티형/밴드형 중 어떤 걸 선호하세요?" 질문 생성 금지 (사용자가 이미 밴드형을 원한다고 명시함)
  - 예시: "대용량 제품 필요해요" → "용량은 어떤 걸 선호하세요?" 질문 생성 금지 (사용자가 이미 대용량을 원한다고 명시함)
  - 예시: "조용한 제품 찾아요" → "소음은 신경 쓰시나요?" 질문 생성 금지 (사용자가 이미 저소음을 원한다고 명시함)
  - **⚠️ 주의**: 위 정보를 꼼꼼히 읽고, 사용자가 이미 결정한 스펙/타입/특징에 대해서는 절대 다시 질문하지 마세요!

⚠️ **[스타일 주의] 질문에 나이/성별을 억지로 언급하지 마세요!**
- ❌ 잘못된 예: "20개월 남아에게 적합한 디자인은?"
- ✅ 올바른 예: "어떤 디자인 스타일을 선호하시나요?"
- **이유**: 나이/성별 정보는 이미 수집되어 내부적으로 추천에 활용됩니다. 질문에 굳이 언급하면 어색합니다.
- **원칙**: 질문은 일반적이고 자연스럽게, 수집된 정보는 뒤에서 필터링에만 활용
`;
    }
  }

  const prompt = `
당신은 "${categoryName}" 구매 결정을 돕는 전문 AI 쇼핑 컨시어지입니다.
당신의 목표는 방대한 정보를 나열하는 것이 아니라, **사용자가 가장 적은 문답으로 최적의 제품군으로 좁혀갈 수 있도록 돕는 것**입니다.

사용자는 제품을 탐색(Search)하는 것이 아니라, 당신의 제안을 승인(Approve)하고 싶어 합니다.
제공된 [시장 데이터]를 분석하여, 구매 결정에 가장 결정적인 영향을 미치는 **핵심 질문 3~4개**를 JSON 배열로 생성하세요.

⚠️ **중요: 예산 질문과 "피하고 싶은 단점" 질문은 별도로 생성되므로, 여기서는 생성하지 마세요!**
${personalizationSection}${userContextSection}${onboardingQuestionSection}
## [시장 데이터]
<MarketContext>
- **카테고리:** ${categoryName}
- **웹 트렌드/리뷰 요약:** ${trendAnalysis ? `${trendsText || '-'} (주요 장점: ${(trendAnalysis.pros || []).slice(0,3).join(', ')} / 주요 단점: ${(trendAnalysis.cons || []).join(', ')})` : '정보 없음'}
- **⭐ 핵심 구매 고려사항 (웹검색):** ${trendAnalysis?.buyingFactors?.length ? trendAnalysis.buyingFactors.join(' / ') : '정보 없음'}${reviewInsightsText}
- **가격 분포:** 최저 ${minPrice.toLocaleString()}원 ~ 최고 ${maxPrice.toLocaleString()}원 (평균 ${avgPrice.toLocaleString()}원)
- **주요 브랜드:** ${brands.slice(0, 6).join(', ')}
${brandImportance.shouldGenerateBrandQuestion ? `- **⭐ 브랜드 선택 중요 (${brandImportance.score}점):**
  - 관여도: ${brandImportance.involvement} (${brandImportance.involvement === 'high' ? '안전/과시/장기사용' : brandImportance.involvement === 'trust' ? '피부접촉/발진우려' : '단기사용/가성비'})
  - 주요 브랜드: ${brandImportance.topBrands.map(b => `${b.name}(${b.count}개, ${Math.round(b.avgPrice/10000)}만원대)`).join(', ')}
  - 선택 기준: ${brandImportance.reasoning}
  - 브랜드별 특징: ${Object.entries(brandCharacteristics).map(([brand, desc]) => `${brand}=${desc}`).join(' | ')}
  - **→ 질문 생성 시 브랜드 선호도 질문을 반드시 포함하세요!**` : `- **브랜드 중요도: 낮음 (${brandImportance.score}점, ${brandImportance.involvement})** - ${brandImportance.reasoning}`}
- **필터링 옵션(다나와):** ${filterSummary}
- **상위 제품 스펙 분석:** ${productSpecsForAnalysis}
</MarketContext>

## [질문 생성 전략 (Thinking Process)]
1. **⭐ 핵심 구매 고려사항 우선:** '핵심 구매 고려사항'에 나열된 항목을 **반드시** 질문에 반영하세요. 이것이 이 카테고리에서 가장 중요한 선택 기준입니다.
   - 예: 기계식키보드 → 스위치종류 질문 필수 / 에어팟 → 노이즈캔슬링 질문 필수 / 아기물티슈 → 성분/두께 질문 필수
2. **결정적 요인 식별:** 상위 제품들의 스펙과 필터 정보를 대조하여, 제품이 가장 크게 갈리는 기준(Factor)을 찾으세요. (예: 가습기의 가열식 vs 초음파식)
3. **트렌드 반영:** '웹 트렌드'를 참고하여 사람들이 왜 그 옵션을 고민하는지 파악하고 \`reason\` 필드에 반영하세요. 단순한 사실 전달이 아닌, **"선택의 가이드"**가 되어야 합니다.
4. **사용자 언어:** 기술 용어보다는 사용자가 얻을 **효익(Benefit)이나 상황(Context)** 중심으로 질문하세요.
5. **옵션 설계:** 선택지는 3~4개로 제한하되, 서로 겹치지 않아야 합니다(MECE). **⛔ "둘 다", "모두", "기타", "직접 입력", "상관없어요", "잘 모르겠어요", "아무거나", "둘다 좋아요", "다 괜찮아요", "별로 안 중요해요" 등 회피성 옵션 절대 생성 금지** (복수선택 가능 + '상관없어요'는 시스템이 자동 추가함)
   - **[MUST]⭐⭐ 소괄호 부가설명 필수 (매우 중요!)[MUST]:**
     * **원칙: 모든 옵션에 소괄호 안에 친절한 부가설명을 추가하세요.** 디테일하고 친절한 가이드처럼 작성해주세요.
     * **일반인이 바로 이해하기 어려운 단어는 반드시 설명 추가** (전문 용어뿐만 아니라 업계 용어, 기술 용어, 생소한 단어 모두 포함)
     * **예외: "정말 누구나 아는 초등학생 수준의 단어"만 제외** (예: 흰색, 검은색, 작음, 큼 등 - 이런 경우에도 웬만하면 효익 추가 권장)
     * **반드시 포함해야 하는 경우:**
       - 수치/스펙: "도톰한 두께 (70gsm 이상)", "대용량 (5L 이상)", "저소음 (40dB 이하)"
       - 전문/기술 용어: "A2 단백질 (배앓이 줄임)", "EWG 그린 등급 (유해성분 무첨가)", "HEPA 필터 (미세먼지 99.9% 제거)"
       - 업계 용어: "청축 (타건감 좋고 소리 큼)", "갈축 (조용하고 부드러움)", "적축 (게임용, 빠른 반응)"
       - 방식/타입: "초음파식 (조용하지만 세균 번식)", "가열식 (위생적이지만 전기료)", "IH 방식 (밥맛 좋음)"
       - 소재/재질: "스테인리스 내솥 (코팅 벗겨짐 없음)", "세라믹 코팅 (논스틱)", "티타늄 (가볍고 내구성)"
       - 기능/효익: "자동 세척 (관리 편함)", "타이머 기능 (예약 가능)", "분리형 물통 (청소 쉬움)"
6. **인기 옵션 표시:** 시장 데이터(판매 순위, 리뷰 수, 트렌드)를 기반으로 가장 많이 선택되는 옵션에 \`isPopular: true\`를 표시하세요. **한 질문당 인기 옵션은 반드시 0~2개 사이여야 합니다 (3개 이상 절대 금지).** 인기 옵션이 명확하지 않으면 표시하지 않아도 됩니다.
7. **⭐⭐ 개인화 추천 옵션 표시 (isRecommend):**
   - **사용자의 개인 상황**을 고려하여 가장 적합한 옵션에 \`isRecommend: true\`를 표시하세요.
   - **고려할 사용자 정보:**
     * 아기 월령 (예: 신생아 0-3개월 → 저자극/무향/신생아용)
     * 성별 (필요한 경우에만)
     * 온보딩 상황 (교체 이유, 기존 불만, 구매 니즈)
     * 구매 목적 (첫 구매 vs 교체 vs 선물)
   - **한 질문당 0~1개 표시** (2개 이상 절대 금지)
   - **예시:**
     * 아기 3개월 + 기저귀 질문 → "소형 (3-6개월용)" 옵션에 isRecommend: true
     * 온보딩 "기존 제품 불만: 소음" + 소음 질문 → "초저소음 (40dB 이하)" 옵션에 isRecommend: true
     * 온보딩 "첫 구매" + 용량 질문 → "중간 용량 (가성비 좋음)" 옵션에 isRecommend: true
   - **⚠️ 주의:**
     * isPopular와 isRecommend는 **별개**입니다 (둘 다 true일 수도 있음)
     * 사용자 상황을 고려했을 때 적합한 옵션이 있다면 반드시 표시하세요
8. **브랜드 질문 생성 조건:**
   - **⭐ 표시가 있을 경우 (브랜드 중요도 높음)**, 반드시 브랜드 선호도 질문을 생성하세요.
   - 질문 형태는 카테고리 특성에 맞춰 자연스럽게:
     * 아기용품: "믿고 쓰는 브랜드가 있으신가요?" 또는 "선호하는 브랜드가 있으신가요?"
     * 가전제품: "선호하는 제조사가 있으신가요?"
     * 생활용품: "찾으시는 브랜드가 있으신가요?"
   - 주요 브랜드 3~5개를 선택지로 제시하고, "브랜드별 특징" 정보를 description에 활용하세요.
   - **반드시** "상관없어요" 옵션 포함 (value: "any", label: "상관없어요", description: "브랜드보다 스펙/기능 중시")
   - id는 "brand_preference" 또는 "brand"로 설정
   - 브랜드 중요도가 낮을 경우 (⭐ 표시 없음) 브랜드 질문을 생성하지 마세요.

## [작성 규칙]
1. **⭐ 중복 방지 - 최우선 규칙 (가장 중요!):**
   - **질문 생성 전에 반드시 [사용자가 이미 입력한 정보]를 꼼꼼히 확인하세요!**
   - 위 섹션에 언급된 정보는 **이미 사용자가 결정한 것**이므로 절대 다시 질문하지 마세요.
   - **Target Audience Check:**
     * "${categoryName}"이 아기용품이고 **아기 월령 정보가 아직 수집되지 않은 경우에만** 첫 질문으로 아기 월령을 물어보세요.
     * ⚠️ **[사용자가 이미 입력한 정보]에 아기 월령이 있다면 월령 질문을 생성하지 마세요!** (이미 수집됨)
   - **Preference Check:**
     * 사용자가 "밴드형", "대용량", "저소음" 등 **구체적인 스펙/타입/특징**을 이미 언급했다면, 해당 항목에 대한 질문 생성 금지
     * 예: "밴드형 기저귀 찾아요" → 팬티형/밴드형 질문 생성 금지
     * 예: "조용한 제품 필요해요" → 소음 관련 질문 생성 금지
2. **Spec Filtering:**
   - 모든 제품이 공통으로 가진 스펙은 질문하지 마세요. (변별력 없음)
   - 사용자 취향이나 환경에 따라 제품 추천이 달라지는 항목을 우선순위로 두세요.
3. **예산/단점 질문 생성 금지:**
   - 예산 질문과 "피하고 싶은 단점" 질문은 별도 시스템에서 생성하므로, 여기서는 생성하지 마세요.
4. **⚠️ 최종 체크: 소괄호 부가설명 누락 확인!**
   - JSON 생성 후, 모든 옵션의 label을 다시 확인하세요.
   - **일반인이 바로 이해하기 어려운 단어가 있다면 반드시 소괄호 설명 추가!**
   - "청축", "갈축", "초음파식", "가열식", "A2", "HEPA" 같은 용어는 절대 설명 없이 사용 금지!
   - 의심스러우면 설명을 추가하는 것이 안전합니다. (과잉 친절이 부족보다 낫습니다)
5. **간결함:**
   - 오직 JSON 배열만 출력하세요. 설명은 필요 없습니다.

## [출력 포맷 예시]

### ✅ 좋은 예시 (소괄호 설명 포함)
\`\`\`json
[
  {
    "id": "protein_type",
    "question": "분유의 단백질 타입은 어떤 걸 선호하시나요?",
    "options": [
      {"value": "a2", "label": "A2 단백질 (배앓이 줄임)", "description": "소화가 편하고 복통 완화", "isPopular": true, "isRecommend": true},
      {"value": "hydrolyzed", "label": "가수분해 단백질 (알레르기 예방)", "description": "알레르기 위험이 있는 아기에게 적합"},
      {"value": "standard", "label": "일반 단백질 (A1+A2 혼합)", "description": "가성비 좋고 대부분 아기에게 무난", "isPopular": true}
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "웹 트렌드",
    "_comment": "신생아(0-3개월)라면 A2 단백질에 isRecommend: true 적용"
  },
  {
    "id": "switch_type",
    "question": "키보드 스위치는 어떤 타입을 선호하시나요?",
    "options": [
      {"value": "blue", "label": "청축 (타건감 좋고 소리 큼)", "description": "딸깍 소리와 강한 클릭감, 타이핑 많은 분께 추천", "isPopular": true},
      {"value": "brown", "label": "갈축 (조용하고 부드러움)", "description": "사무실이나 밤에 사용하기 좋은 저소음", "isPopular": true},
      {"value": "red", "label": "적축 (게임용, 빠른 반응)", "description": "부드럽고 빠른 입력, 게이머에게 인기"},
      {"value": "silent", "label": "저소음 (도서관 수준)", "description": "거의 무음, 공공장소나 집에서 사용"}
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "핵심 구매 고려사항"
  },
  {
    "id": "humidifier_type",
    "question": "가습기 방식은 어떤 걸 선호하시나요?",
    "options": [
      {"value": "ultrasonic", "label": "초음파식 (조용하지만 세균 주의)", "description": "소음 거의 없고 전기료 저렴하나 물 관리 필수"},
      {"value": "heated", "label": "가열식 (위생적이지만 전기료 높음)", "description": "끓여서 분사하여 세균 걱정 없으나 전력 소모", "isPopular": true},
      {"value": "natural", "label": "자연 기화식 (안전하고 쾌적)", "description": "아기 방에 안전하고 과습 걱정 없음"}
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "핵심 구매 고려사항"
  }
]
\`\`\`

### ❌ 나쁜 예시 (설명 없음 - 절대 이렇게 하지 마세요!)
\`\`\`json
[
  {
    "id": "switch_type",
    "question": "키보드 스위치는 어떤 타입을 선호하시나요?",
    "options": [
      {"value": "blue", "label": "청축", "description": "딸깍 소리와 강한 클릭감"},
      {"value": "brown", "label": "갈축", "description": "사무실이나 밤에 사용하기 좋음"},
      {"value": "red", "label": "적축", "description": "부드럽고 빠른 입력"}
    ]
  }
]
\`\`\`
**문제점: "청축", "갈축", "적축"이 무엇인지 일반인은 모릅니다. 반드시 소괄호 설명을 추가하세요!**

위 전략과 규칙에 따라 "${categoryName}"에 최적화된 질문 JSON을 생성하세요.
`;

  // ✅ 필수 질문(예산 + 단점)을 맞춤질문과 병렬로 생성 시작
  // 단점 옵션은 placeholder만 생성 (런타임에 동적 생성됨)
  const requiredQuestionsPromise = generateRequiredQuestions(
    categoryName,
    minPrice,
    avgPrice,
    maxPrice,
  );

  let customQuestions: QuestionTodo[] = [];

  try {
    const promptLength = prompt.length;
    console.log(`[Step3] Generating questions for "${categoryName}" with ${products.length} products`);
    console.log(`[Step3] 📝 프롬프트 길이: ${promptLength}자 (~${Math.ceil(promptLength / 4)} tokens)`);
    const startTime = Date.now();

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 3000,
        responseMimeType: 'application/json',
      }
    });

    console.log(`[Step3] ⏳ LLM 호출 시작...`);
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    const text = result.response.text();

    console.log(`[Step3] ✅ LLM 응답 완료: ${Date.now() - startTime}ms (응답 ${text.length}자)`);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        // JSON 복구 시도
        let jsonStr = jsonMatch[0];
        jsonStr = repairJSON(jsonStr);

        let questions = JSON.parse(jsonStr) as QuestionTodo[];
        questions = questions.map(q => {
          // 인기 옵션이 2개 초과인 경우, 상위 2개만 유지
          const popularCount = q.options.filter(o => o.isPopular).length;
          if (popularCount > 2) {
            let count = 0;
            const fixedOptions = q.options.map(o => {
              if (o.isPopular) {
                count++;
                return { ...o, isPopular: count <= 2 };
              }
              return o;
            });
            return { ...q, options: fixedOptions, completed: false };
          }
          return { ...q, completed: false };
        });
        
        // ✅ LLM이 혹시 예산/단점 질문을 생성했다면 제거 (별도 생성되므로)
        questions = questions.filter(q => {
          const isBudget = q.id.includes('budget') || q.question.includes('예산') || q.question.includes('가격');
          const isNegative = q.id.includes('negative') || q.id.includes('avoid') || q.question.includes('단점') || q.question.includes('피하고');
          return !isBudget && !isNegative;
        });

        // 선택지 정제 (중복/유사 제거, 일관된 포맷)
        customQuestions = await refineQuestionOptions(questions);

        // 🔍 Flash Lite 중복 검증: 온보딩 질문 vs 맞춤질문 + 맞춤질문 상호 간
        if (onboardingQuestion && customQuestions.length > 0) {
          const toDedup: QuestionForDedup[] = customQuestions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options.map(o => o.label),
          }));
          const existingQ: QuestionForDedup[] = [{
            id: onboardingQuestion.id,
            question: onboardingQuestion.question,
            options: onboardingQuestion.options.map((o: any) => o.label),
          }];
          const dedupResult = await deduplicateQuestions(toDedup, { existingQuestions: existingQ }, { categoryName, verbose: true });
          if (dedupResult.removedIds.length > 0) {
            customQuestions = customQuestions.filter(q => !dedupResult.removedIds.includes(q.id));
            console.log(`[Step3] 🔍 Dedup: ${dedupResult.removedIds.length}개 중복 제거 → ${customQuestions.length}개 유지`);

            // 🔄 제거된 수만큼 대체 질문 재생성
            const survivingQ: QuestionForDedup[] = [
              ...existingQ,
              ...customQuestions.map(q => ({ id: q.id, question: q.question, options: q.options.map(o => o.label) })),
            ];
            const marketCtx = `카테고리: ${categoryName}\n가격: ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원\n브랜드: ${brands.slice(0, 6).join(', ')}\n상위 제품:\n${productSpecsForAnalysis}`;
            const replacements = await generateReplacementQuestions(
              dedupResult.removedIds.length,
              categoryName,
              survivingQ,
              marketCtx,
            );
            if (replacements.length > 0) {
              customQuestions.push(...(replacements as QuestionTodo[]));
              console.log(`[Step3] 🔄 대체 질문 ${replacements.length}개 추가 → 총 ${customQuestions.length}개`);
            }
          }
        }

        console.log(`[Step3] Successfully generated ${customQuestions.length} custom questions`);
      } catch (e) {
        console.error('[Step3] JSON parse error:', e);
        console.error('[Step3] Failed JSON sample:', jsonMatch[0].slice(0, 500));

        // Flash Lite로 JSON 정제 시도
        try {
          console.log('[Step3] Attempting JSON repair with Flash Lite...');
          const repairedQuestions = await repairJSONWithLLM(jsonMatch[0]);
          if (repairedQuestions && repairedQuestions.length > 0) {
            let questions = repairedQuestions.map((q: QuestionTodo) => {
              // 인기 옵션이 2개 초과인 경우, 상위 2개만 유지
              const popularCount = q.options.filter(o => o.isPopular).length;
              if (popularCount > 2) {
                let count = 0;
                const fixedOptions = q.options.map(o => {
                  if (o.isPopular) {
                    count++;
                    return { ...o, isPopular: count <= 2 };
                  }
                  return o;
                });
                return { ...q, options: fixedOptions, completed: false };
              }
              return { ...q, completed: false };
            });

            // 예산/단점 질문 제거
            questions = questions.filter((q: QuestionTodo) => {
              const isBudget = q.id.includes('budget') || q.question.includes('예산') || q.question.includes('가격');
              const isNegative = q.id.includes('negative') || q.id.includes('avoid') || q.question.includes('단점') || q.question.includes('피하고');
              return !isBudget && !isNegative;
            });

            customQuestions = await refineQuestionOptions(questions);

            // 🔍 Flash Lite 중복 검증 (repair 경로)
            if (onboardingQuestion && customQuestions.length > 0) {
              const toDedup: QuestionForDedup[] = customQuestions.map(q => ({
                id: q.id,
                question: q.question,
                options: q.options.map(o => o.label),
              }));
              const existingQ: QuestionForDedup[] = [{
                id: onboardingQuestion.id,
                question: onboardingQuestion.question,
                options: onboardingQuestion.options.map((o: any) => o.label),
              }];
              const dedupResult = await deduplicateQuestions(toDedup, { existingQuestions: existingQ }, { categoryName, verbose: true });
              if (dedupResult.removedIds.length > 0) {
                customQuestions = customQuestions.filter(q => !dedupResult.removedIds.includes(q.id));

                // 🔄 제거된 수만큼 대체 질문 재생성 (repair 경로)
                const survivingQ: QuestionForDedup[] = [
                  ...existingQ,
                  ...customQuestions.map(q => ({ id: q.id, question: q.question, options: q.options.map(o => o.label) })),
                ];
                const marketCtx = `카테고리: ${categoryName}\n가격: ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원\n브랜드: ${brands.slice(0, 6).join(', ')}\n상위 제품:\n${productSpecsForAnalysis}`;
                const replacements = await generateReplacementQuestions(
                  dedupResult.removedIds.length,
                  categoryName,
                  survivingQ,
                  marketCtx,
                );
                if (replacements.length > 0) {
                  customQuestions.push(...(replacements as QuestionTodo[]));
                }
              }
            }

            console.log(`[Step3] JSON repair succeeded: ${customQuestions.length} custom questions`);
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

  // 맞춤질문 생성 실패 시 fallback
  if (customQuestions.length === 0) {
    customQuestions = getDefaultQuestions(categoryName, products, trendAnalysis);
  }

  // 🔥 브랜드 질문 Fallback: LLM이 생성 안 했으면 강제 주입 (중요도 60점 이상일 때만)
  if (brandImportance.shouldGenerateBrandQuestion && brandImportance.score >= 60) {
    const hasBrandQuestion = customQuestions.some(q =>
      q.id.includes('brand') || q.question.includes('브랜드') || q.question.includes('제조사')
    );

    if (!hasBrandQuestion) {
      console.log(`[Step3] ⚠️ LLM이 브랜드 질문 생성 실패 → Fallback 브랜드 질문 주입`);

      const fallbackBrandQuestion: QuestionTodo = {
        id: 'brand_preference',
        question: categoryName.includes('아기') || categoryName.includes('유아') || categoryName.includes('베이비')
          ? '믿고 쓰는 브랜드가 있으신가요?'
          : categoryName.includes('가전') || categoryName.includes('전자')
          ? '선호하는 제조사가 있으신가요?'
          : '선호하는 브랜드가 있으신가요?',
        options: [
          ...brandImportance.topBrands.slice(0, 5).map(b => ({
            value: b.name.toLowerCase(),
            label: b.name,
            description: brandCharacteristics[b.name] || `${b.count}개 제품 / ${Math.round(b.avgPrice/10000)}만원대`
          })),
          {
            value: 'any',
            label: '상관없어요',
            description: '브랜드보다 스펙/기능 중시'
          }
        ],
        type: 'single' as const,
        priority: 2,
        dataSource: '브랜드 중요도 분석',
        completed: false
      };

      customQuestions.unshift(fallbackBrandQuestion);
      console.log(`[Step3] ✅ Fallback 브랜드 질문 추가: ${fallbackBrandQuestion.options.length - 1}개 브랜드 옵션`);
    } else {
      console.log(`[Step3] ✅ LLM이 브랜드 질문 정상 생성됨`);
    }
  }

  // ✅ 필수 질문 대기 및 합치기
  const { budgetQuestion } = await requiredQuestionsPromise;

  // 온보딩 질문(맨 앞) + 맞춤질문 + 예산(priority 99) 순서로 합치기
  const allQuestions = [
    ...(onboardingQuestion ? [onboardingQuestion] : []),
    ...customQuestions,
    budgetQuestion,
  ];

  // ✅ 모든 질문에 "상관없어요 (건너뛰기)" 옵션 추가
  const questionsWithSkip = addSkipOptionToQuestions(allQuestions);
  console.log(`[Step3] Final questions: ${questionsWithSkip.length} (onboarding: ${onboardingQuestion ? 1 : 0}, custom: ${customQuestions.length}, required: 1)`);

  return questionsWithSkip;
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

    if (spec.key === '단계' || spec.key.includes('단계')) {
      questionText = '현재 어느 단계를 찾으시나요?';
    } else if (spec.key === '형태' || spec.key === '타입') {
      questionText = `${categoryName} 형태는 어떤 것을 선호하시나요?`;
    } else if (spec.key.includes('무게') || spec.key.includes('권장')) {
      questionText = '어느 정도의 무게/하중 범위를 찾으시나요?';
    } else {
      questionText = `${spec.key}은(는) 어떤 것을 원하시나요?`;
    }

    questions.push({
      id: `spec_${spec.key.replace(/\s/g, '_')}_${idx}`,
      question: questionText,
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
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Vercel/Nginx 버퍼링 비활성화
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
    const {
      categoryKey: rawCategoryKey,
      streaming = true,
      personalizationContext,
      onboarding,  // 온보딩 데이터 (구매 상황, 불편사항 등)
      babyInfo,    // 아기 정보 (성별, 개월수)
    } = await request.json();

    if (!rawCategoryKey) {
      return NextResponse.json({ error: 'categoryKey required' }, { status: 400 });
    }

    // URL 인코딩된 키를 디코딩
    const categoryKey = decodeURIComponent(rawCategoryKey);
    const categoryName = CATEGORY_NAME_MAP[categoryKey] || categoryKey;

    // 🆕 온보딩/아기정보 컨텍스트 로깅
    if (onboarding || babyInfo) {
      console.log(`[Init] User context: onboarding=${JSON.stringify(onboarding)}, babyInfo=${JSON.stringify(babyInfo)}`);
    }

    console.log(`[Init] Raw categoryKey: "${rawCategoryKey}" → Decoded: "${categoryKey}" → categoryName: "${categoryName}"`);
    console.log(`\n========================================`);
    console.log(`[Init V6 Streaming] Starting for: ${categoryName}`);
    console.log(`========================================\n`);

    // 스트리밍 모드가 아니면 기존 방식으로 처리
    if (!streaming) {
      const earlyWebSearchPromise = performWebSearchAnalysis(categoryName);
      return handleNonStreamingRequest(categoryKey, categoryName, startTime, earlyWebSearchPromise, personalizationContext, onboarding, babyInfo);
    }

    // SSE 스트리밍 응답
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(formatSSEMessage(event, data)));
        };

        try {
          // 카테고리 정보 조회 (product_count 가져오기)
          const categoryInfo = await getCategoryInfo(categoryName);
          const dbProductCount = categoryInfo?.productCount || 120;
          console.log(`[Init] Category product_count from DB: ${dbProductCount}`);

          // 초기 이벤트 전송
          send('init', { categoryKey, categoryName, timestamp: Date.now(), productCount: dbProductCount });

          // 수집된 상품 저장
          let allProducts: DanawaSearchListItem[] = [];
          let searchUrl = '';
          let wasCached = false;

          // UI 표시용: DB의 product_count 사용
          const displayProductCount = dbProductCount;

          // Phase 1: 웹검색과 상품 크롤링 병렬 실행
          const phase1Start = Date.now();
          let firstBatchComplete = false;

          // 🔴 개선: 웹검색 진행 상황을 SSE로 실시간 전송
          const webSearchPromise = performWebSearchAnalysis(categoryName, (event) => {
            // 쿼리 시작/완료 시 UI에 실시간 전송
            send('web_search_progress', event);
          }).then((data: TrendAnalysis | null) => {
            if (data) {
              console.log(`[Phase1] Web search finished, sending trend event`);
              send('trend', {
                trendAnalysis: data,
                searchQueries: data.searchQueries,
                sources: data.sources,
              });
            }
            return data;
          });

          // 🔴 조기 데이터용 Promise (20개 상품 + 필터 + URL)
          let resolveInitialData: (data: { products: DanawaSearchListItem[], filters: DanawaFilterSection[], searchUrl: string }) => void;
          const initialDataPromise = new Promise<{ products: DanawaSearchListItem[], filters: DanawaFilterSection[], searchUrl: string }>(resolve => {
            resolveInitialData = resolve;
          });

          let currentFilters: DanawaFilterSection[] = [];
          let currentSearchUrl = '';
          let initialDataResolved = false;

          const checkAndResolveInitialData = (force = false) => {
            if (initialDataResolved) return;
            if (force || (allProducts.length >= 20 && currentSearchUrl)) {
              initialDataResolved = true;
              console.log(`[Phase1] Resolving initial data for questions: ${allProducts.length} products`);
              resolveInitialData({
                products: allProducts.slice(0, 20),
                filters: currentFilters,
                searchUrl: currentSearchUrl,
              });
            }
          };

          // 상품 크롤링 (스트리밍 콜백 사용)
          const crawlPromise = crawlProductsWithStreaming(
            categoryKey,
            categoryName,
            (products, isComplete, isFirstBatchComplete) => {
              // 상품 배치가 도착할 때마다 전송
              if (products.length > 0) {
                allProducts = [...allProducts, ...products];
              }
              
              // 5개 도착 시 "실시간 인기상품 분석" 토글 완료 신호
              if (isFirstBatchComplete && !firstBatchComplete) {
                firstBatchComplete = true;
                send('first_batch_complete', {
                  count: displayProductCount,  // DB의 product_count 사용
                  message: '실시간 인기상품 분석 완료',
                });
              }
              
              // 🔴 20개 시점 체크
              checkAndResolveInitialData();

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
                    danawaRank: p.danawaRank || null,
                  })),
                  total: Math.min(allProducts.length, displayProductCount), // UI 표시용: DB product_count
                  isComplete,
                });
              }

              if (isComplete) {
                checkAndResolveInitialData(true);
              }
            },
            // 🔴 헤더/필터 파싱 즉시 호출됨
            (header) => {
              currentFilters = header.filters || [];
              currentSearchUrl = header.searchUrl;
              
              // 필터 정보 전송 (인기상품 분석 토글에서 표시)
              if (currentFilters.length > 0) {
                console.log(`[Phase1] Extracted ${currentFilters.length} filter sections (Early)`);
                send('filters', {
                  filters: currentFilters.slice(0, 15).map(f => ({
                    title: f.title,
                    options: f.options.slice(0, 6).map(o => o.name),
                    optionCount: f.options.length,
                  })),
                  totalCount: currentFilters.length,
                });
              }
              
              checkAndResolveInitialData();
            }
          );

          // 🔴 개선 3: 질문 생성을 위한 최소 요건(상품 20개 + 웹서치 완료) 대기
          const waitStartTime = Date.now();
          const [trendAnalysis, initialData] = await Promise.all([
            webSearchPromise,
            initialDataPromise,
          ]);
          console.log(`[Timing] ⏱️ 웹검색+상품20개 대기 완료: ${Date.now() - waitStartTime}ms`);

          searchUrl = initialData.searchUrl;
          const top20ForQuestions = initialData.products;
          const crawledFilters = initialData.filters;

          // Phase 1.5 준비 (백그라운드에서 crawlPromise는 계속 진행 중)
          const phase15Start = Date.now();
          console.log(`[Phase1.5] Starting: review crawling + analysis (will generate questions after)`);

          // 🔥 개선: 질문 생성은 리뷰 분석 완료 후에 실행
          // (웹검색 + 리뷰분석 데이터를 모두 활용하여 더 정교한 질문 생성)

          // 리뷰 크롤링 + 분석 Promise (나머지 상품들이 다 올 때까지 기다린 후 시작)
          const reviewPromise = (async () => {
            // 나머지 120개 수집 완료 대기
            const crawlResult = await crawlPromise;
            allProducts = crawlResult.products;
            searchUrl = crawlResult.searchUrl;
            wasCached = crawlResult.cached;

            send('reviews_start', {
              productCount: allProducts.length,
              reviewsPerProduct: REVIEWS_PER_PRODUCT,
            });

            let allReviews: Record<string, ReviewCrawlResult> = {};
            let totalReviewsCrawled = 0;
            let reviewAnalysis: ReviewAnalysis | null = null;

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

              // 전체 리뷰 수 계산 (제품별 reviewCount 합산 - PLP에서 가져온 값)
              const totalProductReviewCount = allProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0);

              // 리뷰 분석 시작 - 샘플 미리 추출해서 프론트엔드에 전달
              const reviewSamples = sampleReviewsForAnalysis(allReviews);
              send('review_analysis_start', {
                reviewCount: totalProductReviewCount,
                // 프론트엔드에 샘플 리뷰 전달 (각 3개씩)
                positiveSamples: reviewSamples.positive.slice(0, 3).map(r => ({
                  rating: r.rating,
                  preview: r.content.slice(0, 80) + (r.content.length > 80 ? '...' : ''),
                })),
                negativeSamples: reviewSamples.negative.slice(0, 3).map(r => ({
                  rating: r.rating,
                  preview: r.content.slice(0, 80) + (r.content.length > 80 ? '...' : ''),
                })),
              });
              reviewAnalysis = await analyzeReviews(categoryName, allReviews);

              if (reviewAnalysis) {
                send('review_analysis_complete', {
                  // 전체 리뷰 수 사용 (제품별 reviewCount 합산)
                  analyzedCount: totalProductReviewCount,
                  prosTags: reviewAnalysis.prosTags,
                  consTags: reviewAnalysis.consTags,
                  // 전체 분석 결과
                  positiveKeywords: reviewAnalysis.positiveKeywords,
                  negativeKeywords: reviewAnalysis.negativeKeywords,
                  commonConcerns: reviewAnalysis.commonConcerns,
                });
              }
            } catch (error) {
              console.error('[Phase1.5] Review crawling/analysis failed:', error);
              send('reviews_error', { error: 'Review crawling failed' });
            }

            return { allReviews, totalReviewsCrawled, reviewAnalysis };
          })();

          // 🔥 Phase 3: 질문 생성 (웹검색 데이터로 시작, 리뷰 분석과 병렬 실행)
          const phase3Start = Date.now();
          console.log(`[Phase3] Starting question generation with web search data (parallel with review analysis)`);

          const [longTermData, knowledge] = await Promise.all([
            Promise.resolve(updateLongTermMemory(categoryKey, categoryName, top20ForQuestions, trendAnalysis)),
            Promise.resolve(loadKnowledgeMarkdown(categoryKey)),
          ]);

          // 질문 생성과 리뷰 분석을 병렬로 실행 (질문 생성은 웹검색 데이터만 활용)
          const [questionTodos, reviewResult] = await Promise.all([
            generateQuestions(
              categoryKey,
              categoryName,
              top20ForQuestions,
              trendAnalysis,
              knowledge || generateLongTermMarkdown(longTermData),
              crawledFilters,
              null,  // 리뷰 분석 없이 웹검색 + 상품 데이터만 활용 (속도 최적화)
              personalizationContext,  // 🆕 개인화 메모리 컨텍스트
              onboarding,  // 🆕 온보딩 데이터
              babyInfo     // 🆕 아기 정보
            ),
            reviewPromise,
          ]);

          const { allReviews, totalReviewsCrawled, reviewAnalysis } = reviewResult;
          const phase3Duration = Date.now() - phase3Start;
          const phase15Duration = Date.now() - phase15Start;
          const phase1Duration = Date.now() - phase1Start; // Phase 1 전체 시간 (120개 포함)

          console.log(`[Phase3] Question generation completed in ${phase3Duration}ms (${questionTodos.length} questions)`);

          // ✅ 질문 생성 완료 후 전송
          send('questions', {
            questionTodos,
            currentQuestion: questionTodos[0] || null,
          });

          // ✅ [로깅] AI가 생성한 질문들과 옵션들 로깅
          questionTodos.forEach((q: any) => {
            logKAQuestionGenerated(
              categoryKey,
              categoryName,
              q.id,
              q.question,
              q.options.map((opt: any) => opt.label)
            );
          });

          // 리뷰 0개인 상품 필터링 (품질 향상) - review_count 우선 사용
          const productsBeforeFilter = allProducts.length;
          const productsWithReviews = allProducts.filter(p => {
            // Supabase 캐시 review_count가 있으면 우선 사용
            if (typeof p.reviewCount === 'number') {
              return p.reviewCount > 0;
            }
            // fallback: 리뷰 크롤링 결과
            const review = allReviews[p.pcode];
            return review && review.reviews.length > 0;
          });
          // 리뷰 있는 상품이 너무 적으면 필터링을 건너뜀 (특정 카테고리에서 과도한 축소 방지)
          if (productsWithReviews.length >= 20) {
            allProducts = productsWithReviews;
            console.log(`[Phase1.5] Filtered out ${productsBeforeFilter - allProducts.length} products with 0 reviews (${productsBeforeFilter} → ${allProducts.length})`);
            send('products_filtered', {
              before: productsBeforeFilter,
              after: allProducts.length,
              reason: '리뷰 0개 상품 제외',
            });
          } else {
            console.log(`[Phase1.5] Skipping review=0 filter (productsWithReviews=${productsWithReviews.length}, total=${productsBeforeFilter})`);
            send('products_filtered', {
              before: productsBeforeFilter,
              after: productsBeforeFilter,
              reason: '리뷰 부족으로 필터링 건너뜀',
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

          // 장단점 태그: 리뷰 분석 결과 우선, 없으면 웹검색 트렌드 사용
          const prosKeywords = reviewAnalysis?.prosTags?.length
            ? reviewAnalysis.prosTags
            : (trendAnalysis?.pros || []).slice(0, 5);
          const consKeywords = reviewAnalysis?.consTags?.length
            ? reviewAnalysis.consTags
            : (trendAnalysis?.cons || []).slice(0, 5);

          const marketSummary = {
            productCount: filteredProducts.length,
            reviewCount: totalReviewCount,
            priceRange: priceStats,
            topBrands,
            topPros: prosKeywords.map((p: string) => ({ keyword: p, count: 0 })),
            topCons: consKeywords.map((c: string) => ({ keyword: c, count: 0 })),
            avgRating: Math.round(avgRating * 10) / 10,
          };

          const totalTime = Date.now() - startTime;
          
          // 리뷰 데이터를 간소화하여 전송 (full 리뷰 대신 리뷰 요약)
          const reviewSummaryByProduct: Record<string, {
            reviewCount: number;
            avgRating: number | null;
            reviews: Array<{ rating: number; content: string; imageUrls?: string[] }>;
          }> = {};

          Object.entries(allReviews).forEach(([pcode, result]) => {
            reviewSummaryByProduct[pcode] = {
              reviewCount: result.reviewCount,
              avgRating: result.averageRating,
              reviews: result.reviews.map(r => ({
                rating: r.rating,
                content: r.content,
                imageUrls: r.imageUrls,  // 포토 리뷰 이미지 URL
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
            // 리뷰 분석 결과 (장단점 키워드)
            reviewAnalysis: reviewAnalysis ? {
              prosTags: reviewAnalysis.prosTags,
              consTags: reviewAnalysis.consTags,
              positiveKeywords: reviewAnalysis.positiveKeywords,
              negativeKeywords: reviewAnalysis.negativeKeywords,
              commonConcerns: reviewAnalysis.commonConcerns,
              analyzedCount: reviewAnalysis.analyzedCount,
            } : null,
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
  startTime: number,
  earlyWebSearchPromise?: Promise<TrendAnalysis | null>,
  personalizationContext?: string | null,  // 🆕 개인화 메모리 컨텍스트
  onboarding?: { purchaseSituation?: string; replaceReasons?: string[]; replaceOther?: string; firstSituations?: string[]; firstSituationOther?: string } | null,  // 🆕 온보딩 데이터
  babyInfo?: { gender?: string; calculatedMonths?: number; expectedDate?: string; isBornYet?: boolean } | null  // 🆕 아기 정보
): Promise<Response> {
  const timings: StepTiming[] = [];

  // Phase 1: 병렬 실행
  const phase1Start = Date.now();
  const [trendAnalysis, crawlResult] = await Promise.all([
    earlyWebSearchPromise || performWebSearchAnalysis(categoryName),
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
    crawledFilters,
    null,  // reviewAnalysis
    personalizationContext,  // 🆕 개인화 메모리 컨텍스트
    onboarding,  // 🆕 온보딩 데이터
    babyInfo     // 🆕 아기 정보
  );
  const phase3Duration = Date.now() - phase3Start;
  timings.push({ step: 'phase3_questions', duration: phase3Duration, details: `${questionTodos.length}개 질문` });

  // 브랜드 관여도 추출 (generateQuestions 내부에서 이미 계산됨)
  // Non-streaming 경로에서는 reviewAnalysis가 없으므로 null 전달
  const brandImportanceForResponse = analyzeBrandImportance(products, categoryName, trendAnalysis, null);

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
    reviews: Array<{ rating: number; content: string; imageUrls?: string[] }>;
  }> = {};

  Object.entries(allReviews).forEach(([pcode, result]) => {
    reviewSummaryByProduct[pcode] = {
      reviewCount: result.reviewCount,
      avgRating: result.averageRating,
      reviews: result.reviews.map(r => ({
        rating: r.rating,
        content: r.content,
        imageUrls: r.imageUrls,  // 포토 리뷰 이미지 URL
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
    categoryInvolvement: brandImportanceForResponse.involvement, // 카테고리 관여도
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
      danawaRank: p.danawaRank || null,
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
