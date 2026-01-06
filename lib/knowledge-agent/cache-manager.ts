/**
 * Knowledge Agent 크로스 세션 캐시 매니저
 *
 * 파일 시스템 기반 캐싱 (Manus 철학 적용)
 * - 검색 결과: 24시간 캐싱
 * - LLM 요약: 1주일 캐싱
 * - 트렌드 분석: 1주일 캐싱
 *
 * 디렉토리 구조:
 * /data/knowledge-cache/
 * ├── queries/
 * │   └── {query}_{date}.json       # 검색 결과 (24시간 유효)
 * ├── summaries/
 * │   └── {query}_summary.json      # LLM 요약 (1주일 유효)
 * └── trends/
 *     └── {yearMonth}_trends.json   # 트렌드 분석 (1주일 유효)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import type { DanawaSearchListItem, DanawaSearchListResponse } from '@/lib/danawa/search-crawler';

// 캐시 디렉토리 경로
const CACHE_BASE_DIR = join(process.cwd(), 'data', 'knowledge-cache');
const QUERIES_DIR = join(CACHE_BASE_DIR, 'queries');
const SUMMARIES_DIR = join(CACHE_BASE_DIR, 'summaries');
const TRENDS_DIR = join(CACHE_BASE_DIR, 'trends');

// 캐시 TTL (밀리초)
const QUERY_CACHE_TTL = 24 * 60 * 60 * 1000;     // 24시간
const SUMMARY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1주일
const TREND_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;   // 1주일

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 디렉토리 생성 (없으면)
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`📁 Created cache directory: ${dir}`);
  }
}

/**
 * 쿼리를 파일명으로 변환 (특수문자 제거)
 * URL 인코딩된 쿼리도 자동으로 디코딩
 */
function sanitizeQuery(query: string): string {
  // URL 인코딩된 경우 디코딩 시도
  let decodedQuery = query;
  try {
    // %로 시작하는 패턴이 있으면 URL 인코딩된 것으로 간주
    if (query.includes('%')) {
      decodedQuery = decodeURIComponent(query);
    }
  } catch {
    // 디코딩 실패시 원본 사용
    decodedQuery = query;
  }

  return decodedQuery
    .toLowerCase()
    .replace(/[^가-힣a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

/**
 * 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 이번 달 문자열 (YYYY-MM)
 */
function getYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 파일이 만료되었는지 확인
 */
function isExpired(filePath: string, ttlMs: number): boolean {
  if (!existsSync(filePath)) return true;

  try {
    const stats = statSync(filePath);
    const age = Date.now() - stats.mtime.getTime();
    return age > ttlMs;
  } catch {
    return true;
  }
}

// ============================================================================
// 검색 결과 캐시
// ============================================================================

interface QueryCacheEntry {
  query: string;
  items: DanawaSearchListItem[];
  searchUrl: string;
  totalCount: number;
  cachedAt: string;
  expiresAt: string;
}

/**
 * 검색 결과 캐시 가져오기
 */
export function getQueryCache(query: string): DanawaSearchListResponse | null {
  ensureDir(QUERIES_DIR);

  const sanitized = sanitizeQuery(query);
  const today = getToday();
  const fileName = `${sanitized}_${today}.json`;
  const filePath = join(QUERIES_DIR, fileName);

  if (isExpired(filePath, QUERY_CACHE_TTL)) {
    console.log(`⚠️ [Cache] Query cache miss or expired: "${query}"`);
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as QueryCacheEntry;
    console.log(`✅ [Cache] Query cache hit: "${query}" (${data.items.length} items)`);

    return {
      success: true,
      query: data.query,
      totalCount: data.totalCount,
      items: data.items,
      searchUrl: data.searchUrl,
      cached: true,
      cachedAt: data.cachedAt,
    };
  } catch (error) {
    console.error(`❌ [Cache] Error reading query cache:`, error);
    return null;
  }
}

/**
 * 검색 결과 캐시 저장
 */
export function setQueryCache(response: DanawaSearchListResponse): boolean {
  if (!response.success || response.items.length === 0) {
    return false;
  }

  ensureDir(QUERIES_DIR);

  const sanitized = sanitizeQuery(response.query);
  const today = getToday();
  const fileName = `${sanitized}_${today}.json`;
  const filePath = join(QUERIES_DIR, fileName);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUERY_CACHE_TTL);

  const cacheEntry: QueryCacheEntry = {
    query: response.query,
    items: response.items,
    searchUrl: response.searchUrl,
    totalCount: response.totalCount,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    console.log(`💾 [Cache] Query cache saved: "${response.query}" → ${fileName}`);
    return true;
  } catch (error) {
    console.error(`❌ [Cache] Error saving query cache:`, error);
    return false;
  }
}

// ============================================================================
// LLM 요약 캐시
// ============================================================================

export interface SummaryCacheEntry {
  query: string;
  summary: string;
  productCount: number;
  cachedAt: string;
  expiresAt: string;
}

/**
 * LLM 요약 캐시 가져오기
 */
export function getSummaryCache(query: string): SummaryCacheEntry | null {
  ensureDir(SUMMARIES_DIR);

  const sanitized = sanitizeQuery(query);
  const fileName = `${sanitized}_summary.json`;
  const filePath = join(SUMMARIES_DIR, fileName);

  if (isExpired(filePath, SUMMARY_CACHE_TTL)) {
    console.log(`⚠️ [Cache] Summary cache miss or expired: "${query}"`);
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as SummaryCacheEntry;
    console.log(`✅ [Cache] Summary cache hit: "${query}"`);
    return data;
  } catch (error) {
    console.error(`❌ [Cache] Error reading summary cache:`, error);
    return null;
  }
}

/**
 * LLM 요약 캐시 저장
 */
export function setSummaryCache(query: string, summary: string, productCount: number): boolean {
  ensureDir(SUMMARIES_DIR);

  const sanitized = sanitizeQuery(query);
  const fileName = `${sanitized}_summary.json`;
  const filePath = join(SUMMARIES_DIR, fileName);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUMMARY_CACHE_TTL);

  const cacheEntry: SummaryCacheEntry = {
    query,
    summary,
    productCount,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    console.log(`💾 [Cache] Summary cache saved: "${query}"`);
    return true;
  } catch (error) {
    console.error(`❌ [Cache] Error saving summary cache:`, error);
    return false;
  }
}

// ============================================================================
// 트렌드 분석 캐시
// ============================================================================

export interface TrendCacheEntry {
  category: string;
  yearMonth: string;
  trends: {
    topKeywords: string[];
    priceRanges: { label: string; min: number; max: number; count: number }[];
    topBrands: { name: string; count: number }[];
  };
  cachedAt: string;
  expiresAt: string;
}

/**
 * 트렌드 캐시 가져오기
 */
export function getTrendCache(category: string): TrendCacheEntry | null {
  ensureDir(TRENDS_DIR);

  const sanitized = sanitizeQuery(category);
  const yearMonth = getYearMonth();
  const fileName = `${sanitized}_${yearMonth}_trends.json`;
  const filePath = join(TRENDS_DIR, fileName);

  if (isExpired(filePath, TREND_CACHE_TTL)) {
    console.log(`⚠️ [Cache] Trend cache miss or expired: "${category}"`);
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as TrendCacheEntry;
    console.log(`✅ [Cache] Trend cache hit: "${category}"`);
    return data;
  } catch (error) {
    console.error(`❌ [Cache] Error reading trend cache:`, error);
    return null;
  }
}

/**
 * 트렌드 캐시 저장
 */
export function setTrendCache(category: string, trends: TrendCacheEntry['trends']): boolean {
  ensureDir(TRENDS_DIR);

  const sanitized = sanitizeQuery(category);
  const yearMonth = getYearMonth();
  const fileName = `${sanitized}_${yearMonth}_trends.json`;
  const filePath = join(TRENDS_DIR, fileName);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TREND_CACHE_TTL);

  const cacheEntry: TrendCacheEntry = {
    category,
    yearMonth,
    trends,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    console.log(`💾 [Cache] Trend cache saved: "${category}"`);
    return true;
  } catch (error) {
    console.error(`❌ [Cache] Error saving trend cache:`, error);
    return false;
  }
}

// ============================================================================
// 캐시 관리 유틸리티
// ============================================================================

/**
 * 만료된 캐시 정리
 */
export function cleanupExpiredCache(): { queries: number; summaries: number; trends: number } {
  const result = { queries: 0, summaries: 0, trends: 0 };

  // 검색 결과 캐시 정리
  if (existsSync(QUERIES_DIR)) {
    const files = readdirSync(QUERIES_DIR);
    for (const file of files) {
      const filePath = join(QUERIES_DIR, file);
      if (isExpired(filePath, QUERY_CACHE_TTL)) {
        try {
          unlinkSync(filePath);
          result.queries++;
        } catch (e) {
          console.error(`Error deleting ${file}:`, e);
        }
      }
    }
  }

  // 요약 캐시 정리
  if (existsSync(SUMMARIES_DIR)) {
    const files = readdirSync(SUMMARIES_DIR);
    for (const file of files) {
      const filePath = join(SUMMARIES_DIR, file);
      if (isExpired(filePath, SUMMARY_CACHE_TTL)) {
        try {
          unlinkSync(filePath);
          result.summaries++;
        } catch (e) {
          console.error(`Error deleting ${file}:`, e);
        }
      }
    }
  }

  // 트렌드 캐시 정리
  if (existsSync(TRENDS_DIR)) {
    const files = readdirSync(TRENDS_DIR);
    for (const file of files) {
      const filePath = join(TRENDS_DIR, file);
      if (isExpired(filePath, TREND_CACHE_TTL)) {
        try {
          unlinkSync(filePath);
          result.trends++;
        } catch (e) {
          console.error(`Error deleting ${file}:`, e);
        }
      }
    }
  }

  console.log(`🧹 [Cache] Cleanup: ${result.queries} queries, ${result.summaries} summaries, ${result.trends} trends removed`);
  return result;
}

/**
 * 특정 쿼리의 모든 캐시 무효화
 */
export function invalidateQueryCache(query: string): boolean {
  const sanitized = sanitizeQuery(query);

  let invalidated = false;

  // 검색 결과 캐시 삭제
  if (existsSync(QUERIES_DIR)) {
    const files = readdirSync(QUERIES_DIR);
    for (const file of files) {
      if (file.startsWith(sanitized)) {
        try {
          unlinkSync(join(QUERIES_DIR, file));
          invalidated = true;
          console.log(`🗑️ [Cache] Invalidated: ${file}`);
        } catch (e) {
          console.error(`Error deleting ${file}:`, e);
        }
      }
    }
  }

  // 요약 캐시 삭제
  const summaryPath = join(SUMMARIES_DIR, `${sanitized}_summary.json`);
  if (existsSync(summaryPath)) {
    try {
      unlinkSync(summaryPath);
      invalidated = true;
      console.log(`🗑️ [Cache] Invalidated summary: ${sanitized}`);
    } catch (e) {
      console.error(`Error deleting summary:`, e);
    }
  }

  return invalidated;
}

/**
 * 캐시 통계 가져오기
 */
export function getCacheStats(): {
  queries: { count: number; totalSize: number };
  summaries: { count: number; totalSize: number };
  trends: { count: number; totalSize: number };
} {
  const stats = {
    queries: { count: 0, totalSize: 0 },
    summaries: { count: 0, totalSize: 0 },
    trends: { count: 0, totalSize: 0 },
  };

  if (existsSync(QUERIES_DIR)) {
    const files = readdirSync(QUERIES_DIR);
    stats.queries.count = files.length;
    for (const file of files) {
      const filePath = join(QUERIES_DIR, file);
      stats.queries.totalSize += statSync(filePath).size;
    }
  }

  if (existsSync(SUMMARIES_DIR)) {
    const files = readdirSync(SUMMARIES_DIR);
    stats.summaries.count = files.length;
    for (const file of files) {
      const filePath = join(SUMMARIES_DIR, file);
      stats.summaries.totalSize += statSync(filePath).size;
    }
  }

  if (existsSync(TRENDS_DIR)) {
    const files = readdirSync(TRENDS_DIR);
    stats.trends.count = files.length;
    for (const file of files) {
      const filePath = join(TRENDS_DIR, file);
      stats.trends.totalSize += statSync(filePath).size;
    }
  }

  return stats;
}
