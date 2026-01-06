'use client';

/**
 * Agentic Loading Phase Component
 *
 * Claude Code 스타일의 투명한 분석 과정 UI
 * - 단계별 체인 오브 쏘트
 * - 웹검색 쿼리/결과/출처
 * - 분석 결과 상세
 * - 실시간 0.1초 타이머
 * - 스트리밍 + Shimmer 효과
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretDown,
  Clock,
  Link,
  CheckCircle,
  Circle,
  Globe,
} from '@phosphor-icons/react/dist/ssr';
import {
  FcSearch,
  FcMindMap,
  FcElectricity,
  FcBullish,
  FcCheckmark,
  FcProcess
} from "react-icons/fc";

// ============================================================================
// Types
// ============================================================================

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface AnalysisStep {
  id: string;
  label: string;
  type: 'search' | 'analyze' | 'think' | 'generate';
  status: 'pending' | 'active' | 'done';
  startTime?: number;
  endTime?: number;
  // 검색 관련
  searchQueries?: string[];
  searchResults?: SearchSource[];
  // 분석 관련
  analyzedCount?: number;
  analyzedItems?: string[];
  // 생각 과정
  thinking?: string;
  // 결과 데이터
  result?: any;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  options?: Array<{ label: string; value: string }>;
}

interface AgenticLoadingPhaseProps {
  categoryName: string;
  // 단계별 데이터
  steps: AnalysisStep[];
  // 크롤링된 상품 미리보기
  crawledProducts?: Array<{
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    thumbnail: string | null;
  }>;
  // 생성된 질문 (맞춤 질문 생성 단계에서 표시)
  generatedQuestions?: GeneratedQuestion[];
  // 완료 여부
  isComplete?: boolean;
  // 완료 후 요약 데이터
  summary?: {
    productCount: number;
    reviewCount: number;
    topBrands: string[];
    trends: string[];
    sources: SearchSource[];
  };
}

// ============================================================================
// Sub Components
// ============================================================================

/**
 * Shimmer 효과 컴포넌트
 */
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-100/80 rounded ${className}`}>
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
        animate={{ x: ['0%', '200%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

/**
 * 스트리밍 텍스트 (타이핑 효과)
 */
function StreamingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) return;
    setDisplayText('');
    setIsComplete(false);

    const timeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1));
          index++;
        } else {
          setIsComplete(true);
          clearInterval(interval);
        }
      }, 15); // 글자당 15ms
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, delay]);

  return (
    <span>
      {displayText}
      {!isComplete && <span className="animate-pulse">|</span>}
    </span>
  );
}

/**
 * 파비콘 가져오기 (Google Favicon API 사용)
 * - vertexaisearch URL인 경우 title에서 도메인 추출 시도
 */
function Favicon({ url, title }: { url: string; title?: string }) {
  const [error, setError] = useState(false);

  try {
    let domain = new URL(url).hostname;

    // vertexaisearch 또는 google 내부 URL인 경우 title에서 도메인 추출 시도
    if (domain.includes('vertexaisearch') || domain.includes('googleapis')) {
      // title에서 도메인 추출 시도 (예: "다나와 - xxx" -> "danawa.com")
      if (title) {
        const domainMatch = title.match(/(?:^|\s)([\w-]+\.(?:com|co\.kr|net|org|io|kr|co))(?:\s|$|\/|-)/i);
        if (domainMatch) {
          domain = domainMatch[1];
        } else {
          // 한글 사이트명 매핑
          const knownSites: Record<string, string> = {
            '다나와': 'danawa.com',
            '네이버': 'naver.com',
            '쿠팡': 'coupang.com',
            '에누리': 'enuri.com',
            '11번가': '11st.co.kr',
            'G마켓': 'gmarket.co.kr',
            '옥션': 'auction.co.kr',
            '롯데ON': 'lotteon.com',
            'SSG': 'ssg.com',
            '맘카페': 'cafe.naver.com',
            '육아': 'naver.com',
            '블로그': 'blog.naver.com',
          };
          for (const [name, site] of Object.entries(knownSites)) {
            if (title.includes(name)) {
              domain = site;
              break;
            }
          }
        }
      }

      // 여전히 vertexaisearch면 기본 아이콘 표시
      if (domain.includes('vertexaisearch') || domain.includes('googleapis')) {
        return <Globe size={14} className="text-blue-400" />;
      }
    }

    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    if (error) {
      return <Globe size={14} className="text-gray-400" />;
    }

    return (
      <img
        src={faviconUrl}
        alt=""
        className="w-4 h-4 rounded-sm"
        onError={() => setError(true)}
      />
    );
  } catch {
    return <Globe size={14} className="text-gray-400" />;
  }
}

/**
 * 실시간 타이머 (0.1초 단위)
 */
function RealTimeTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="flex items-center gap-1 text-xs text-blue-500 font-medium tabular-nums">
      <Clock size={12} className="animate-pulse" />
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

/**
 * 인기상품 분석 컨텐츠 - 상품 리스트 형식
 */
function ProductAnalysisContent({
  step,
  crawledProducts,
}: {
  step: AnalysisStep;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
}) {
  const products = crawledProducts || [];
  const count = step.analyzedCount || products.length;

  return (
    <AnimatePresence mode="wait">
      {products.length === 0 && step.status === 'active' ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <Shimmer className="h-3 w-24" />
          </div>
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Shimmer className="w-8 h-8 rounded" />
                <div className="flex-1 space-y-1">
                  <Shimmer className="h-3 w-full" />
                  <Shimmer className="h-2 w-20" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <FcBullish size={14} className="grayscale opacity-70" />
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              수집된 상품 ({count}개)
            </p>
          </div>

          {/* 상품 리스트 - 최대 8개 */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {products.slice(0, 8).map((p, i) => (
              <motion.div
                key={p.pcode || i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* 순번 */}
                <span className="text-[9px] text-gray-400 font-medium w-3 shrink-0">
                  {i + 1}
                </span>
                {/* 썸네일 */}
                <div className="w-8 h-8 rounded overflow-hidden bg-gray-100 border border-gray-100 shrink-0">
                  {p.thumbnail ? (
                    <img
                      src={p.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[7px] text-gray-400">{p.brand?.substring(0, 2) || '?'}</span>
                    </div>
                  )}
                </div>
                {/* 상품 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-700 font-medium truncate leading-tight">
                    {p.name.length > 35 ? p.name.substring(0, 35) + '...' : p.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.brand && (
                      <span className="text-[9px] text-gray-400">{p.brand}</span>
                    )}
                    {p.price && (
                      <span className="text-[9px] text-blue-600 font-bold">
                        {p.price.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* 더 보기 */}
          {products.length > 8 && (
            <p className="text-[9px] text-gray-400 text-center">
              +{products.length - 8}개 더 분석됨
            </p>
          )}

          {/* 인기 브랜드 */}
          {step.analyzedItems && step.analyzedItems.length > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
              <span className="text-[9px] text-gray-400">인기:</span>
              {step.analyzedItems.slice(0, 4).map((brand, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-blue-50 rounded text-blue-600">
                  {brand}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 웹검색 컨텐츠 - 완료 시 요약 보고서, 진행 중 전환 효과
 */
function WebSearchContent({ step }: { step: AnalysisStep }) {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const sources = step.searchResults || [];
  const queries = step.searchQueries || [];
  const thinking = step.thinking || '';

  // 진행 중일 때만 출처 전환 효과
  useEffect(() => {
    if (step.status === 'done' || sources.length <= 1) return;

    const interval = setInterval(() => {
      setActiveSourceIndex(prev => (prev + 1) % sources.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [sources.length, step.status]);

  return (
    <AnimatePresence mode="wait">
      {step.status === 'active' && sources.length === 0 ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-3"
        >
          {queries.length > 0 && (
            <div className="space-y-1.5">
              {queries.slice(0, 2).map((query, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.2 }}
                  className="flex items-center gap-2 text-[12px]"
                >
                  <FcSearch size={12} className="shrink-0 grayscale opacity-70" />
                  <span className="text-gray-500 font-medium">"{query}" 검색 중...</span>
                </motion.div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Shimmer className="h-3 w-32" />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Shimmer className="w-4 h-4 rounded" />
                <Shimmer className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {/* 완료 상태: 요약 보고서 + 출처 목록 (애니메이션 없음) */}
          {step.status === 'done' ? (
            <>
              {/* 요약 보고서 */}
              {thinking && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FcBullish size={14} className="grayscale opacity-70" />
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      트렌드 요약
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-line pl-1">
                    {thinking}
                  </p>
                </div>
              )}

              {/* 출처 목록 (정적) */}
              {sources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FcSearch size={14} className="grayscale opacity-70" />
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      참고 자료 ({sources.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.slice(0, 5).map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 text-gray-600 text-[10px] hover:bg-gray-100 transition-colors"
                      >
                        <Favicon url={source.url} title={source.title} />
                        <span className="truncate max-w-20">
                          {(() => {
                            try {
                              const hostname = new URL(source.url).hostname.replace('www.', '');
                              // vertexaisearch인 경우 title 사용
                              if (hostname.includes('vertexaisearch') || hostname.includes('googleapis')) {
                                return source.title?.slice(0, 15) || '웹';
                              }
                              return hostname;
                            } catch {
                              return source.title || '출처';
                            }
                          })()}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 진행 중: 전환 애니메이션 */}
              {/* 검색 쿼리 */}
              {queries.length > 0 && (
                <div className="space-y-1">
                  {queries.slice(0, 2).map((query, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <FcSearch size={11} className="shrink-0 grayscale opacity-70" />
                      <span className="text-gray-500">"{query}"</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 출처 - 전환 효과 */}
              {sources.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <FcSearch size={14} className="grayscale opacity-70" />
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      수집 중... ({sources.length})
                    </p>
                  </div>

                  {/* 메인 출처 - 전환 애니메이션 */}
                  <div className="relative h-14 overflow-hidden rounded-xl bg-gray-50 border border-gray-100">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeSourceIndex}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 p-2.5 flex items-center gap-2.5"
                      >
                        <Favicon url={sources[activeSourceIndex].url} title={sources[activeSourceIndex].title} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-gray-700 line-clamp-1">
                            {sources[activeSourceIndex].title || sources[activeSourceIndex].url}
                          </p>
                          <p className="text-[9px] text-gray-400 line-clamp-1">
                            {(() => {
                              try {
                                const hostname = new URL(sources[activeSourceIndex].url).hostname;
                                // vertexaisearch인 경우 "웹 검색 결과" 표시
                                if (hostname.includes('vertexaisearch') || hostname.includes('googleapis')) {
                                  return '웹 검색 결과';
                                }
                                return hostname;
                              } catch {
                                return '';
                              }
                            })()}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* 인디케이터 */}
                    {sources.length > 1 && (
                      <div className="absolute bottom-1.5 right-2 flex gap-1">
                        {sources.slice(0, 5).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1 h-1 rounded-full transition-colors ${
                              i === activeSourceIndex ? 'bg-blue-500' : 'bg-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 리뷰 키워드 추출 컨텐츠
 */
function ReviewExtractionContent({ step }: { step: AnalysisStep }) {
  const keywords = step.analyzedItems || [];
  const count = step.analyzedCount || 0;
  const thinking = step.thinking || '';

  return (
    <AnimatePresence mode="wait">
      {step.status === 'active' && keywords.length === 0 ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <Shimmer className="h-3 w-32" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <Shimmer key={i} className="h-6 w-16 rounded-[6px]" />
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          {count > 0 && (
            <div className="flex items-center gap-1.5">
              <FcMindMap size={14} className="grayscale opacity-70" />
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                리뷰 {count.toLocaleString()}개 분석
              </p>
            </div>
          )}

          {/* 키워드 태그 */}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.slice(0, 10).map((keyword, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`px-2.5 py-1 rounded-[6px] text-[10px] font-semibold ${
                    i < 3
                      ? 'bg-green-50 text-green-800 border border-green-200/50'
                      : i < 5
                      ? 'bg-rose-50 text-rose-700 border border-rose-200/50'
                      : 'bg-gray-50 text-gray-500 border border-gray-200/50'
                  }`}
                >
                  {i < 3 ? '👍 ' : i < 5 ? '👎 ' : ''}{keyword}
                </motion.span>
              ))}
            </div>
          )}

          {/* 분석 결과 */}
          {thinking && (
            <div className="bg-gray-50 rounded-lg p-2 mt-2">
              <p className="text-[10px] text-gray-600 leading-relaxed">
                {thinking}
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 맞춤 질문 생성 컨텐츠 - Todo List 형식
 */
function QuestionGenerationContent({
  step,
  generatedQuestions,
}: {
  step: AnalysisStep;
  generatedQuestions?: GeneratedQuestion[];
}) {
  const questions = generatedQuestions || [];

  return (
    <AnimatePresence mode="wait">
      {step.status === 'active' && questions.length === 0 ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <Shimmer className="h-3 w-28" />
          </div>
          <div className="space-y-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Shimmer className="w-4 h-4 rounded" />
                <Shimmer className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <FcElectricity size={14} className="grayscale opacity-70" />
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              생성된 질문 ({questions.length}개)
            </p>
          </div>

          {/* Todo List 형식 */}
          <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
            {questions.slice(0, 5).map((q, i) => (
              <motion.div
                key={q.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2 group"
              >
                {step.status === 'done' ? (
                  <CheckCircle size={14} weight="fill" className="text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle size={14} className="text-gray-300 mt-0.5 shrink-0" />
                )}
                <span className="text-[11px] text-gray-700 leading-relaxed">
                  {q.question}
                </span>
              </motion.div>
            ))}
            {questions.length > 5 && (
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-2">
                <Circle size={14} className="text-gray-300 shrink-0" />
                <span className="text-[10px] text-gray-400">
                  +{questions.length - 5}개 더
                </span>
              </div>
            )}
          </div>

          {/* 분석 결과 메시지 */}
          {step.thinking && (
            <p className="text-[10px] text-gray-500 italic">
              {step.thinking}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 단일 분석 단계 카드
 */
function StepCard({
  step,
  isExpanded,
  onToggle,
  crawledProducts,
  generatedQuestions,
}: {
  step: AnalysisStep;
  isExpanded: boolean;
  onToggle: () => void;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions?: GeneratedQuestion[];
}) {
  const duration = step.endTime && step.startTime
    ? ((step.endTime - step.startTime) / 1000).toFixed(1)
    : null;

  const getStatusIcon = () => {
    switch (step.status) {
      case 'done':
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-green-50"
          >
            <FcCheckmark size={12} />
          </motion.div>
        );
      case 'active':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="flex items-center justify-center w-5 h-5"
          >
            <FcProcess size={16} />
          </motion.div>
        );
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-100" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group transition-all duration-300 rounded-2xl overflow-hidden ${
        step.status === 'active'
          ? 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-100'
          : step.status === 'done'
          ? 'bg-white border border-gray-100/80 shadow-sm'
          : 'bg-gray-50/50 border border-transparent'
      }`}
    >
      {/* 헤더 */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors"
      >
        {/* 상태 아이콘 */}
        <div className="shrink-0">
          {getStatusIcon()}
        </div>

        {/* 타입 아이콘 + 레이블 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-[14px] font-semibold truncate ${
            step.status === 'done' ? 'text-gray-700' :
            step.status === 'active' ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {step.label}
          </span>
        </div>

        {/* 소요 시간 / 상태 정보 */}
        <div className="flex items-center gap-2 shrink-0">
          {step.status === 'active' && step.startTime ? (
            <RealTimeTimer startTime={step.startTime} />
          ) : duration ? (
            <span className="text-[11px] font-medium text-gray-400 tabular-nums">
              {duration}s
            </span>
          ) : null}
          
          <motion.span 
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-gray-300 group-hover:text-gray-400 transition-colors"
          >
            <CaretDown size={14} weight="bold" />
          </motion.span>
        </div>
      </button>

      {/* 상세 내용 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 space-y-3">
              <div className="h-px bg-gray-50 -mx-4 mb-3" />
              
              {/* 웹검색 - 쿼리 스트리밍 + 출처 전환 효과 */}
              {step.id === 'web_search' && (
                <WebSearchContent step={step} />
              )}

              {/* 리뷰 키워드 추출 - 키워드 표시 */}
              {step.id === 'review_extraction' && (
                <ReviewExtractionContent step={step} />
              )}

              {/* 인기상품 분석 - 스트리밍 타이틀 + 썸네일 */}
              {step.id === 'product_analysis' && (
                <ProductAnalysisContent step={step} crawledProducts={crawledProducts} />
              )}

              {/* 맞춤 질문 생성 - Todo List 형식 */}
              {step.id === 'question_generation' && (
                <QuestionGenerationContent step={step} generatedQuestions={generatedQuestions} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ============================================================================
// Main Component
// ============================================================================

export function AgenticLoadingPhase({
  categoryName,
  steps,
  crawledProducts = [],
  generatedQuestions = [],
  isComplete = false,
  summary,
}: AgenticLoadingPhaseProps) {
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());

  // 디버그 로그
  console.log('[AgenticLoadingPhase] crawledProducts:', crawledProducts?.length);
  console.log('[AgenticLoadingPhase] generatedQuestions:', generatedQuestions?.length, generatedQuestions);

  // 활성 단계 및 방금 완료된 단계 → 다음 단계 자동 확장
  useEffect(() => {
    const stepOrder = ['product_analysis', 'web_search', 'review_extraction', 'question_generation'];
    const newExpandedIds: string[] = [];

    steps.forEach((step) => {
      // active 상태인 step 확장
      if (step.status === 'active') {
        newExpandedIds.push(step.id);
      }

      // done 상태가 되면, 다음 순서의 step이 있으면 그것도 확장
      if (step.status === 'done') {
        const currentOrderIndex = stepOrder.indexOf(step.id);
        if (currentOrderIndex !== -1 && currentOrderIndex < stepOrder.length - 1) {
          const nextStepId = stepOrder[currentOrderIndex + 1];
          const nextStep = steps.find(s => s.id === nextStepId);
          // 다음 단계가 pending이 아닌 경우(active 또는 done)만 확장
          if (nextStep && nextStep.status !== 'pending') {
            newExpandedIds.push(nextStepId);
          }
        }
      }
    });

    // 새로 확장할 ID가 있으면 추가 (기존 확장 상태 유지)
    if (newExpandedIds.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedStepIds(prev => {
        const next = new Set(prev);
        newExpandedIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [steps]);

  // 진행률 계산
  const progress = useMemo(() => {
    const done = steps.filter(s => s.status === 'done').length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
              {categoryName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                실시간 분석 • {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}분
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 단계 목록 */}
      <div className="space-y-2.5">
        <AnimatePresence mode="popLayout">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              isExpanded={expandedStepIds.has(step.id)}
              onToggle={() => setExpandedStepIds(prev => {
                const next = new Set(prev);
                if (next.has(step.id)) {
                  next.delete(step.id);
                } else {
                  next.add(step.id);
                }
                return next;
              })}
              crawledProducts={step.id === 'product_analysis' ? crawledProducts : undefined}
              generatedQuestions={step.id === 'question_generation' ? generatedQuestions : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Helper: 기본 단계 템플릿 생성
// ============================================================================

export function createDefaultSteps(categoryName: string): AnalysisStep[] {
  return [
    {
      id: 'product_analysis',
      label: '실시간 인기상품 분석',
      type: 'analyze',
      status: 'pending',
    },
    {
      id: 'web_search',
      label: '웹검색으로 트렌드 수집',
      type: 'search',
      status: 'pending',
    },
    {
      id: 'review_extraction',
      label: '리뷰 키워드 추출',
      type: 'analyze',
      status: 'pending',
    },
    {
      id: 'question_generation',
      label: '맞춤 질문 생성',
      type: 'generate',
      status: 'pending',
    },
  ];
}
