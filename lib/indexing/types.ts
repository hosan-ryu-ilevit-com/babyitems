/**
 * 인덱싱 시스템 타입 정의
 * - 맞춤질문 생성 및 저장
 * - Product Info 인덱싱
 */

import { QuestionTodo, QuestionOption } from '../knowledge-agent/types';

// ============================================================================
// 맞춤질문 저장 관련 타입
// ============================================================================

export interface StoredCustomQuestions {
  version: number;
  generatedAt: string;
  categoryName: string;
  productCount: number;
  reviewCount: number;
  llmModel: string;
  questions: QuestionTodo[];
}

export interface CustomQuestionsMetadata {
  categoryName: string;
  generatedAt: string;
  productCount: number;
  reviewCount: number;
  llmModel: string;
}

// ============================================================================
// Product Info 관련 타입
// ============================================================================

export interface ProductInfo {
  version: number;
  indexedAt: string;

  // 스펙 정보
  specs: {
    raw: string;
    parsed: Record<string, string>;
    highlights: string[];
  };

  // 맞춤질문 옵션 매핑 (핵심)
  questionMapping: QuestionMapping;

  // 웹검색 보강 정보
  webEnriched: WebEnrichedData | null;

  // LLM 분석 결과
  analysis: ProductAnalysis | null;
}

export interface QuestionMapping {
  [questionId: string]: QuestionOptionMapping;
}

export interface QuestionOptionMapping {
  matchedOption: string;              // 매칭된 옵션 value
  confidence: 'high' | 'medium' | 'low';
  evidence: string;                   // 매칭 근거
}

export interface WebEnrichedData {
  searchedAt: string;
  pros: string[];
  cons: string[];
  targetUsers: string[];
  keyFeatures: string[];
  sources?: string[];
  // 웹검색 단계에서 직접 매핑한 결과 (옵션 제공 시)
  questionMapping?: QuestionMapping;
  // 웹검색 단계에서 생성한 분석 (API 호출 최적화)
  analysis?: ProductAnalysis;
}

export interface ProductAnalysis {
  oneLiner: string;
  buyingPoint: string;
  cautions: string[];
}

// ============================================================================
// 인덱싱 프로세스 관련 타입
// ============================================================================

export interface IndexingConfig {
  categoryName: string;
  concurrency: number;
  batchDelayMs: number;
  maxRetries: number;
  enableWebSearch: boolean;
}

export interface IndexingProgress {
  total: number;
  completed: number;
  failed: number;
  currentProduct?: string;
}

export interface IndexingResult {
  success: boolean;
  pcode: string;
  productName: string;
  error?: string;
  retryCount: number;
  processingTimeMs: number;
}

export interface BatchIndexingResult {
  categoryName: string;
  totalProducts: number;
  successCount: number;
  failedCount: number;
  failedProducts: Array<{ pcode: string; error: string }>;
  totalTimeMs: number;
}

// ============================================================================
// Supabase 테이블 타입 (확장)
// ============================================================================

export interface KnowledgeCategoryRow {
  query: string;
  product_count: number;
  crawled_at: string | null;
  is_active?: boolean;
  custom_questions?: string;  // TEXT (MD 포맷)
}

export interface KnowledgeProductCacheRow {
  pcode: string;
  query: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  review_count: number;
  rating: number | null;
  spec_summary: string;
  product_url: string;
  rank: number;
  crawled_at: string;
  product_info?: ProductInfo;  // JSONB
}

// ============================================================================
// 웹검색 관련 타입
// ============================================================================

export interface WebSearchQuery {
  query: string;
  purpose: string;
}

export interface WebSearchResult {
  query: string;
  content: string;
  sources: string[];
}

// ============================================================================
// MD 파싱 관련 타입
// ============================================================================

export interface ParsedQuestion {
  id: string;
  question: string;
  reason?: string;
  type: 'single' | 'multi';
  priority: number;
  options: ParsedOption[];
}

export interface ParsedOption {
  value: string;
  label: string;
  description: string;
  isPopular: boolean;
}

// Re-export for convenience
export type { QuestionTodo, QuestionOption };
