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
import Image from 'next/image';
import { logKAExternalLinkClicked } from '@/lib/logging/clientLogger';
import {
  FcSearch,
  FcMindMap,
  FcElectricity,
  FcBullish,
  FcCheckmark,
  FcProcess,
  FcDataConfiguration
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
  // 로딩 중 상태 텍스트 (스켈레톤 위에 표시)
  loadingText?: string;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  options?: Array<{ label: string; value: string }>;
}

interface AgenticLoadingPhaseProps {
  categoryName: string;
  categoryKey: string;
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
    <span className="text-[13px] text-gray-300 font-medium tabular-nums">
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

/**
 * 인기상품 분석 컨텐츠 - 상품 리스트 형식 + 필터 정보
 */
function ProductAnalysisContent({
  step,
  crawledProducts,
}: {
  step: AnalysisStep;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
}) {
  const PREVIEW_COUNT = 10; // 미리보기 개수
  const products = crawledProducts || [];
  const count = step.analyzedCount || products.length; // 전체 수집 개수
  const filters = step.result?.filters || [];
  const filterCount = step.result?.filterCount || filters.length;

  // 로딩 상태 텍스트 (전환 효과용)
  const loadingTexts = [
    '판매 데이터 조회 중...',
    '인기 상품 분석 중...',
    '필터 정보 추출 중...',
    '브랜드 정보 수집 중...',
  ];
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  useEffect(() => {
    if (products.length > 0 || step.status === 'done') return;
    const interval = setInterval(() => {
      setLoadingTextIndex(prev => (prev + 1) % loadingTexts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [products.length, step.status, loadingTexts.length]);

  return (
    <AnimatePresence mode="wait">
      {(products.length === 0 && step.status !== 'done') ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2"
        >
          {/* 로딩 상태 텍스트 */}
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <FcProcess size={14} />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.span
                key={loadingTextIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-[12px] text-gray-500 font-medium"
              >
                {step.loadingText || loadingTexts[loadingTextIndex]}
              </motion.span>
            </AnimatePresence>
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
          className="space-y-3"
        >
          {/* 핵심 필터 정보 (상단) */}
          {filters.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <FcDataConfiguration size={14} className="grayscale opacity-70" />
                <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
                  핵심 스펙 필터 ({filterCount}개)
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filters.slice(0, 8).map((filter: { title: string; options: string[]; optionCount: number }, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="group relative"
                  >
                    <span className="px-2 py-1 bg-purple-50 border border-purple-100/50 rounded-lg text-[11px] font-semibold text-purple-700 cursor-default">
                      {filter.title}
                      <span className="text-purple-400 ml-1">({filter.optionCount})</span>
                    </span>
                    {/* 호버 시 옵션 표시 */}
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1.5 whitespace-nowrap shadow-lg">
                        {filter.options.slice(0, 4).join(', ')}
                        {filter.optionCount > 4 && ` 외 ${filter.optionCount - 4}개`}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {filters.length > 8 && (
                  <span className="px-2 py-1 text-[11px] text-gray-400">
                    +{filters.length - 8}개 더
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {/* 상품 리스트 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <FcBullish size={14} className="grayscale opacity-70" />
              <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
                수집된 상품 ({count}개)
              </p>
            </div>

            {/* 상품 리스트 - 최대 10개 미리보기 */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {products.slice(0, PREVIEW_COUNT).map((p, i) => (
                <motion.div
                  key={p.pcode || i}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* 순번 */}
                  <span className="text-[11px] text-gray-400 font-medium w-4 shrink-0">
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
                    <p className="text-[12px] text-gray-700 font-medium truncate leading-tight">
                      {p.name.length > 35 ? p.name.substring(0, 35) + '...' : p.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.brand && (
                        <span className="text-[11px] text-gray-400">{p.brand}</span>
                      )}
                      {p.price && (
                        <span className="text-[11px] text-blue-600 font-bold">
                          {p.price.toLocaleString()}원
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 더 보기 - 전체 수집 개수 기준 */}
            {count > PREVIEW_COUNT && (
              <p className="text-[11px] text-gray-400 text-center">
                +{count - PREVIEW_COUNT}개 더 분석됨
              </p>
            )}
          </div>

          {/* 인기 브랜드 */}
          {step.analyzedItems && step.analyzedItems.length > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
              <span className="text-[11px] text-gray-400">인기:</span>
              {step.analyzedItems.slice(0, 4).map((brand, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5 bg-blue-50 rounded text-blue-600">
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
function WebSearchContent({ step, categoryKey }: { step: AnalysisStep; categoryKey: string }) {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const sources = step.searchResults || [];
  const queries = step.searchQueries || [];
  const thinking = step.thinking || '';

  // 로딩 상태 텍스트 (전환 효과용)
  const loadingTexts = [
    '웹에서 트렌드 검색 중...',
    '최신 리뷰 정보 수집 중...',
    '전문가 의견 분석 중...',
    '트렌드 데이터 정리 중...',
  ];
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  // 로딩 텍스트 전환
  useEffect(() => {
    if (sources.length > 0 || step.status === 'done') return;
    const interval = setInterval(() => {
      setLoadingTextIndex(prev => (prev + 1) % loadingTexts.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [sources.length, step.status, loadingTexts.length]);

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
          {/* 로딩 상태 텍스트 */}
          <div className="flex items-center gap-2 mb-1">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <FcProcess size={14} />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.span
                key={loadingTextIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-[12px] text-gray-500 font-medium"
              >
                {step.loadingText || loadingTexts[loadingTextIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
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
                  <span className="text-gray-500 font-medium">"{query.length > 25 ? query.substring(0, 25) + '...' : query}" 검색 중...</span>
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
                    <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
                      트렌드 요약
                    </p>
                  </div>
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line pl-1">
                    {thinking}
                  </p>
                </div>
              )}

              {/* 출처 목록 (정적) */}
              {sources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FcSearch size={14} className="grayscale opacity-70" />
                    <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
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
                        onClick={() => logKAExternalLinkClicked(categoryKey, '', source.title, '출처', source.url)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 text-gray-600 text-[11px] hover:bg-gray-100 transition-colors"
                      >
                        <Favicon url={source.url} title={source.title} />
                        <span className="truncate max-w-24">
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
                      <span className="text-gray-500">"{query.length > 25 ? query.substring(0, 25) + '...' : query}"</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 출처 - 전환 효과 */}
              {sources.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <FcSearch size={14} className="grayscale opacity-70" />
                    <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
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
                          <p className="text-[12px] font-medium text-gray-700 line-clamp-1">
                            {sources[activeSourceIndex].title || sources[activeSourceIndex].url}
                          </p>
                          <p className="text-[11px] text-gray-400 line-clamp-1">
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
                            className={`w-1 h-1 rounded-full transition-colors ${i === activeSourceIndex ? 'bg-blue-500' : 'bg-gray-300'
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
              <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
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
                  className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold ${i < 3
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
            <p className="text-[12px] text-gray-500 italic">
              {thinking}
            </p>
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
            <p className="text-[12px] uppercase tracking-wider text-gray-400 font-medium">
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
                <span className="text-[13px] text-gray-700 leading-relaxed">
                  {q.question}
                </span>
              </motion.div>
            ))}
            {questions.length > 5 && (
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-2">
                <Circle size={14} className="text-gray-300 shrink-0" />
                <span className="text-[11px] text-gray-400">
                  +{questions.length - 5}개 더
                </span>
              </div>
            )}
          </div>

          {/* 분석 결과 메시지 */}
          {step.thinking && (
            <p className="text-[12px] text-gray-500 italic">
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
  categoryKey,
  onRefChange,
}: {
  step: AnalysisStep;
  isExpanded: boolean;
  onToggle: () => void;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions?: GeneratedQuestion[];
  categoryKey: string;
  onRefChange?: (el: HTMLDivElement | null) => void;
}) {
  // 로컬 타이머 시작 시간 (펼쳐진 순간부터 시작)
  const [localStartTime, setLocalStartTime] = useState<number | null>(null);

  // 펼쳐지고 아직 완료되지 않았을 때 로컬 타이머 시작
  useEffect(() => {
    if (isExpanded && step.status !== 'done' && !localStartTime) {
      setLocalStartTime(Date.now());
    }
    // 완료되면 로컬 타이머 초기화
    if (step.status === 'done') {
      setLocalStartTime(null);
    }
  }, [isExpanded, step.status, localStartTime]);

  const duration = step.endTime && step.startTime
    ? ((step.endTime - step.startTime) / 1000).toFixed(1)
    : null;

  // 타이머에 사용할 시작 시간 (API startTime 우선, 없으면 로컬)
  const effectiveStartTime = step.startTime || localStartTime;
  const shouldShowTimer = isExpanded && step.status !== 'done' && effectiveStartTime;

  const getStatusIcon = () => {
    // 펼쳐져 있고 완료되지 않았으면 로딩 아이콘 표시
    if (isExpanded && step.status !== 'done') {
      return (
        <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-purple-300" />
      );
    }

    switch (step.status) {
      case 'done':
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center w-5 h-5"
          >
            <Image src="/icons/check.png" alt="" width={20} height={20} />
          </motion.div>
        );
      case 'active':
        return <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-purple-300" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-purple-300" />;
    }
  };

  return (
    <motion.div
      ref={onRefChange}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group transition-all duration-300 overflow-hidden bg-white ${step.id === 'question_generation' ? '' : 'border-b border-gray-200'}`}
    >
      {/* 헤더 */}
      <button
        onClick={onToggle}
        className="w-full py-4 flex items-center gap-3 text-left transition-colors"
      >
        {/* 상태 아이콘 */}
        <div className="shrink-0">
          {getStatusIcon()}
        </div>

        {/* 타입 아이콘 + 레이블 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[14px] font-semibold text-gray-600 truncate">
            {step.label}
          </span>
          {shouldShowTimer && effectiveStartTime ? (
            <RealTimeTimer startTime={effectiveStartTime} />
          ) : duration ? (
            <span className="text-[13px] font-medium text-gray-300 tabular-nums">
              {duration}s
            </span>
          ) : null}
        </div>

        {/* 소요 시간 / 상태 정보 */}
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-gray-500 transition-colors"
        >
          <CaretDown size={16} weight="bold" />
        </motion.span>
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
            <div className="pb-4 pt-0 space-y-3">
              {/* 웹검색 - 쿼리 스트리밍 + 출처 전환 효과 */}
              {step.id === 'web_search' && (
                <WebSearchContent step={step} categoryKey={categoryKey} />
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
// Summary Card Component (완료 후 4단계를 감싸는 부모 토글)
// ============================================================================

function CompletedSummaryCard({
  categoryName,
  steps,
  crawledProducts,
  generatedQuestions,
  categoryKey,
}: {
  categoryName: string;
  steps: AnalysisStep[];
  crawledProducts: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions: AgenticLoadingPhaseProps['generatedQuestions'];
  categoryKey: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 내부 단계들의 개별 확장 상태 관리
  // (부모가 펼쳐질 때 내부는 접힌 상태로 시작하거나, 필요하면 로직 추가)
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());

  // 파비콘 표시를 위한 소스 추출
  const searchStep = steps.find(s => s.id === 'web_search');
  const searchResults = searchStep?.searchResults || [];

  // URL 기준 중복 제거 및 최대 7개 추출 (도메인 중복 허용하여 아이콘 개수 확보)
  const uniqueSources = useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [];

    // URL 기준으로만 중복 제거
    const seen = new Set();
    return searchResults.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    }).slice(0, 7);
  }, [searchResults]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group transition-all duration-300 rounded-2xl overflow-hidden bg-white"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-3.5 flex items-start gap-3 text-left transition-colors hover:bg-gray-50/50"
      >
        <div className="shrink-0 w-[16px] h-[16px] mt-0.5 flex items-center justify-center">
          <Image src="/icons/ic-ai.svg" alt="" width={16} height={16} />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[16px] font-medium ai-gradient-text">
              {categoryName} AI 실시간 분석
            </span>
            <span className="text-[13px] text-gray-400 font-medium">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}{' '}
              {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </div>

          {!isExpanded && uniqueSources.length > 0 && (
            <div className="mt-2 bg-gray-100 rounded-[20px] px-3 py-2 w-fit flex items-center gap-3">
              <div className="flex -space-x-1.5">
                {uniqueSources.map((source, i) => (
                  <div
                    key={i}
                    className="relative z-0 w-5 h-5 rounded-full overflow-hidden ring-2 ring-gray-100 bg-white flex items-center justify-center shrink-0"
                    title={source.title}
                  >
                    <Favicon url={source.url} title={source.title} />
                  </div>
                ))}
              </div>
              <span className="text-[13px] text-gray-500 font-medium tracking-tight">
                {uniqueSources.length}개 출처·{110 + (categoryName.length % 10)}개 상품
              </span>
            </div>
          )}
        </div>

        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-gray-600 transition-colors mt-0.5"
        >
          <CaretDown size={16} weight="bold" />
        </motion.span>
      </button>

      {!isExpanded && <div className="border-b border-gray-200" />}

      {/* 내부: 4단계 리스트 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white"
          >
            <div className="space-y-2 border-t border-gray-200">
              {steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  isExpanded={expandedStepIds.has(step.id)}
                  onToggle={() => setExpandedStepIds(prev => {
                    const next = new Set(prev);
                    if (next.has(step.id)) next.delete(step.id);
                    else next.add(step.id);
                    return next;
                  })}
                  crawledProducts={step.id === 'product_analysis' ? crawledProducts : undefined}
                  generatedQuestions={step.id === 'question_generation' ? generatedQuestions : undefined}
                  categoryKey={categoryKey}
                />
              ))}
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
  categoryKey,
  steps,
  crawledProducts = [],
  generatedQuestions = [],
  isComplete = false,
  summary,
}: AgenticLoadingPhaseProps) {
  // 첫 번째 단계(인기상품 분석)는 시작부터 펼쳐진 상태
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set(['product_analysis']));
  const [autoExpandedStepIds, setAutoExpandedStepIds] = useState<Set<string>>(new Set(['product_analysis']));

  // 디버그 로그
  console.log('[AgenticLoadingPhase] crawledProducts:', crawledProducts?.length);
  console.log('[AgenticLoadingPhase] generatedQuestions:', generatedQuestions?.length, generatedQuestions);

  // 활성 단계 및 완료된 단계 → 순차적으로 확장 (이미 완료된 단계도 누락 없이 확장)
  // 완료된 단계는 자동 접기
  useEffect(() => {
    // 자동 확장해야 할 단계들
    const stepsToAutoExpand = steps.filter(s => s.status === 'active' || s.status === 'done');

    // 아직 자동 확장된 적 없는 단계들 중 가장 빠른 순서의 단계 찾기
    const nextStepToExpand = stepsToAutoExpand.find(s => !autoExpandedStepIds.has(s.id));

    // 완료된 상태면 더 이상 자동확장 안 함 (이미 SummaryCard로 넘어감)
    if (isComplete) return;

    if (nextStepToExpand) {
      const timer = setTimeout(() => {
        setAutoExpandedStepIds(prev => new Set([...prev, nextStepToExpand.id]));
        // 완료 안됐을 때만 확장 (개별 단계 진행 중에는 스크롤하지 않음)
        if (!isComplete) {
          setExpandedStepIds(prev => new Set([...prev, nextStepToExpand.id]));
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [steps, autoExpandedStepIds, isComplete]);

  // 개별 단계 완료 시 자동 접기 (다음 단계가 active 되면 이전 단계 접기)
  useEffect(() => {
    if (isComplete) return;

    // 현재 active인 단계 찾기
    const activeStep = steps.find(s => s.status === 'active');
    if (!activeStep) return;

    // active 단계 이전의 done 단계들 접기
    const stepOrder = ['product_analysis', 'web_search', 'review_extraction', 'question_generation'];
    const activeIndex = stepOrder.indexOf(activeStep.id);

    if (activeIndex > 0) {
      const stepsToCollapse = stepOrder.slice(0, activeIndex);
      // 사용자가 결과를 확인할 수 있도록 1.5초 딜레이 후 접기
      const timer = setTimeout(() => {
        setExpandedStepIds(prev => {
          const next = new Set(prev);
          stepsToCollapse.forEach(stepId => {
            const step = steps.find(s => s.id === stepId);
            if (step?.status === 'done') {
              next.delete(stepId);
            }
          });
          return next;
        });
      }, 700); // 결과 확인 시간 확보

      return () => clearTimeout(timer);
    }
  }, [steps, isComplete]);

  // 완료 시 맨 위로 스크롤 (여기서는 접는 로직 불필요 -> SummaryCard가 렌더링되므로)
  useEffect(() => {
    const isAllStepsDone = steps.length > 0 && steps.every(s => s.status === 'done');

    if (isComplete || isAllStepsDone) {
      // 모바일에서 이전 스크롤과 충돌 방지를 위해 충분한 딜레이
      // - 이전 auto-expand 스크롤이 끝날 때까지 대기 (smooth scroll ~400ms)
      // - AnimatePresence 전환 완료 대기
      const scrollDelay = 600;  // 300ms → 600ms (모바일 안정성)

      const timer = setTimeout(() => {
        // 1. 모든 단계 접기 (비동기로 처리하여 cascading render 방지)
        setExpandedStepIds(new Set());

        // 2. requestAnimationFrame으로 DOM 렌더링 완료 보장 후 스크롤
        requestAnimationFrame(() => {
          const scrollContainer = document.querySelector('main');
          if (scrollContainer) {
            scrollContainer.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }
        });
      }, scrollDelay);

      return () => clearTimeout(timer);
    }
  }, [isComplete, steps]);

  // 진행률 계산
  const progress = useMemo(() => {
    const done = steps.filter(s => s.status === 'done').length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

  // 완료 여부 체크 (isComplete prop 혹은 모든 스텝 done)
  // 단, isComplete prop이 true여야만 Parent toggle로 전환 (중간에 깜빡임 방지)
  const showSummary = isComplete && steps.length > 0 && steps.every(s => s.status === 'done');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 단계 목록 또는 완료 요약 카드 */}
      <div className="space-y-2.5">
        <AnimatePresence mode="wait">
          {showSummary ? (
            <CompletedSummaryCard
              key="summary"
              categoryName={categoryName}
              steps={steps}
              crawledProducts={crawledProducts}
              generatedQuestions={generatedQuestions}
              categoryKey={categoryKey}
            />
          ) : (
            <motion.div
              key="list"
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-2.5"
            >
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
                  categoryKey={categoryKey}
                />
              ))}
            </motion.div>
          )}
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
      label: '판매랭킹 TOP 100 분석',
      type: 'analyze',
      status: 'pending',
    },
    {
      id: 'web_search',
      label: '웹검색 트렌드 수집',
      type: 'search',
      status: 'pending',
    },
    {
      id: 'review_extraction',
      label: '내돈내산 리뷰 분석',
      type: 'analyze',
      status: 'pending',
    },
    {
      id: 'question_generation',
      label: '맞춤 구매질문 생성',
      type: 'generate',
      status: 'pending',
    },
  ];
}
