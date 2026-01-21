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

import { useState, useEffect, useMemo, useRef } from 'react';
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
  // 로딩 중 상태 텍스트 (스켈레톤 위에 표시)
  loadingText?: string;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  options?: Array<{ label: string; value: string }>;
}

// 웹검색 진행 상황 타입
export interface WebSearchProgressData {
  currentQuery?: string;
  completedQueries: string[];
  results: {
    trends?: string[];
    pros?: string[];
    cons?: string[];
    buyingFactors?: string[];
  };
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
  // 요약 카드(토글)로 접힐 때 호출되는 콜백
  onSummaryShow?: () => void;
  // 웹검색 실시간 진행 상황
  webSearchProgress?: WebSearchProgressData;
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
function Favicon({ url, title, size = 16 }: { url: string; title?: string; size?: number }) {
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
        return <Globe size={size} className="text-blue-400" />;
      }
    }

    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    if (error) {
      return <Globe size={size} className="text-gray-400" />;
    }

    return (
      <img
        src={faviconUrl}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-sm shrink-0"
        onError={() => setError(true)}
      />
    );
  } catch {
    return <Globe size={size} className="text-gray-400" />;
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
              <div className="flex items-center">
                <p className="text-[14px] tracking-tight font-medium">
                  <span className="text-gray-400">핵심 스펙 필터 </span>
                  <span className="text-gray-500">{filterCount}개</span>
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
            <div className="flex items-center">
              <p className="text-[14px] tracking-tight font-medium">
                <span className="text-gray-400">수집된 상품 </span>
                <span className="text-gray-500">{count}개</span>
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
                  className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* 순번 */}
                  <span className="text-[14px] text-gray-600 font-medium w-4 shrink-0">
                    {i + 1}
                  </span>
                  {/* 썸네일 */}
                  <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 border border-gray-100 shrink-0">
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
                    <p className="text-[13px] text-gray-600 font-medium truncate leading-tight">
                      {p.name.length > 35 ? p.name.substring(0, 35) + '...' : p.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.brand && (
                        <span className="text-[13px] text-gray-400 font-medium">{p.brand}</span>
                      )}
                      {p.price && (
                        <span className="text-[13px] text-blue-500 font-medium">
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
function WebSearchContent({
  step,
  categoryKey,
  webSearchProgress
}: {
  step: AnalysisStep;
  categoryKey: string;
  webSearchProgress?: WebSearchProgressData;
}) {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const sources = step.searchResults || [];
  const queries = step.searchQueries || [];
  const thinking = step.thinking || '';

  // 실시간 결과 표시용 인덱스
  const [resultDisplayIndex, setResultDisplayIndex] = useState(0);

  // 표시할 결과 목록 생성 (트렌드, 장점, 단점, 구매고려사항 순)
  const { trends, pros, cons, buyingFactors } = webSearchProgress?.results || {};
  const resultsToShow = useMemo(() => {
    const items: { type: string; text: string }[] = [];

    trends?.slice(0, 2).forEach(t =>
      items.push({ type: '트렌드', text: t })
    );
    pros?.slice(0, 2).forEach(p =>
      items.push({ type: '장점', text: p })
    );
    cons?.slice(0, 2).forEach(c =>
      items.push({ type: '주의사항', text: c })
    );
    buyingFactors?.slice(0, 2).forEach(b =>
      items.push({ type: '고려사항', text: b })
    );

    return items;
  }, [trends, pros, cons, buyingFactors]);

  // 결과 전환 효과 (완료된 결과가 있을 때만)
  useEffect(() => {
    if (resultsToShow.length <= 1 || step.status === 'done') return;
    const interval = setInterval(() => {
      setResultDisplayIndex(prev => (prev + 1) % resultsToShow.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [resultsToShow.length, step.status]);

  // 진행 중일 때만 출처 전환 효과
  useEffect(() => {
    if (step.status === 'done' || sources.length <= 1) return;

    const interval = setInterval(() => {
      setActiveSourceIndex(prev => (prev + 1) % sources.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [sources.length, step.status]);

  // 현재 검색 중인 쿼리 또는 기본 텍스트
  const currentLoadingText = webSearchProgress?.currentQuery || '웹에서 트렌드 검색 중...';
  const completedCount = webSearchProgress?.completedQueries?.length || 0;

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
          {/* 현재 검색 중인 쿼리 */}
          <div className="flex items-center gap-2 mb-1">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <FcProcess size={14} />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.span
                key={currentLoadingText}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-[12px] text-gray-500 font-medium"
              >
                {currentLoadingText}
                {completedCount > 0 && (
                  <span className="ml-2 text-green-600 font-semibold">({completedCount}/3 완료)</span>
                )}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* 실시간 수집 결과 표시 */}
          {resultsToShow.length > 0 && (
            <div className="mt-2 p-2 bg-gray-50 rounded-lg">
              <AnimatePresence mode="wait">
                <motion.div
                  key={resultDisplayIndex}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.3 }}
                  className="text-[11px]"
                >
                  <span className="text-blue-500 font-medium">{resultsToShow[resultDisplayIndex]?.type}</span>
                  <span className="text-gray-600 ml-1.5">
                    {resultsToShow[resultDisplayIndex]?.text.length > 50
                      ? resultsToShow[resultDisplayIndex]?.text.substring(0, 50) + '...'
                      : resultsToShow[resultDisplayIndex]?.text}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* 기존 쿼리 표시 (webSearchProgress가 없을 때 fallback) */}
          {!webSearchProgress && queries.length > 0 && (
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
          {/* 완료 상태: 웹검색 수집 데이터 + 출처 목록 (애니메이션 없음) */}
          {step.status === 'done' ? (
            <>
              {/* 웹검색 수집 데이터 - 트렌드, 장점, 단점, 구매고려사항 */}
              {(trends?.length || pros?.length || cons?.length || buyingFactors?.length) ? (
                <div className="space-y-2.5">
                  {/* 트렌드 */}
                  {trends && trends.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[12px] text-blue-500 font-semibold">트렌드</p>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 text-blue-400 leading-[18px]">•</span>
                        <span className="text-[12px] text-gray-600 leading-[18px]">{trends.slice(0, 4).join(', ')}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 장점 */}
                  {pros && pros.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[12px] text-emerald-600 font-semibold">장점</p>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 text-emerald-500 leading-[18px]">•</span>
                        <span className="text-[12px] text-gray-600 leading-[18px]">{pros.slice(0, 4).join(', ')}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 단점/주의사항 */}
                  {cons && cons.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[12px] text-amber-600 font-semibold">주의사항</p>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 text-amber-400 leading-[18px]">•</span>
                        <span className="text-[12px] text-gray-600 leading-[18px]">{cons.slice(0, 3).join(', ')}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 구매 고려사항 */}
                  {buyingFactors && buyingFactors.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[12px] text-purple-600 font-semibold">구매 고려사항</p>
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0 text-purple-400 leading-[18px]">•</span>
                        <span className="text-[12px] text-gray-600 leading-[18px]">{buyingFactors.slice(0, 4).join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : thinking && (
                // fallback: 기존 요약 표시 (웹검색 결과가 없을 경우)
                <div className="space-y-1.5">
                  <div className="flex items-center">
                    <p className="text-[14px] tracking-tight font-medium text-gray-400">
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
                  <div className="flex items-center">
                    <p className="text-[14px] tracking-tight font-medium">
                      <span className="text-gray-400">참고 자료 </span>
                      <span className="text-gray-500">{sources.length}개</span>
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
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-medium hover:bg-gray-200 transition-colors"
                      >
                        <Favicon url={source.url} title={source.title} size={14} />
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
                  <div className="flex items-center">
                    <p className="text-[14px] tracking-tight font-medium">
                      <span className="text-gray-400">수집 중... </span>
                      <span className="text-gray-500">{sources.length}개</span>
                    </p>
                  </div>

                  {/* 메인 출처 - 전환 애니메이션 */}
                  <div className="relative h-14 overflow-hidden rounded-xl bg-gray-100 border border-gray-100">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeSourceIndex}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 p-2.5 flex items-center gap-2.5"
                      >
                        <Favicon url={sources[activeSourceIndex].url} title={sources[activeSourceIndex].title} size={14} />
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
 * 리뷰 키워드 추출 컨텐츠 - 웹검색 스타일 슬라이드 + 태그 형태 결과
 */
function ReviewExtractionContent({ step }: { step: AnalysisStep }) {
  // 리뷰 분석 결과 (step.result에서 가져옴)
  const positiveKeywords = step.result?.positiveKeywords || [];
  const negativeKeywords = step.result?.negativeKeywords || [];
  const commonConcerns = step.result?.commonConcerns || [];
  const analyzedCount = step.result?.analyzedCount || step.analyzedCount || 0;

  // 폴백용 태그
  const prosTags = step.result?.prosTags || positiveKeywords;
  const consTags = step.result?.consTags || negativeKeywords;

  // 완료 후 표시용 샘플 리뷰
  const reviewSamples = useMemo(() => {
    const positiveSamples = step.result?.positiveSamples || [];
    const negativeSamples = step.result?.negativeSamples || [];
    const samples: Array<{ rating: number; preview: string; type: 'positive' | 'negative' }> = [];
    const maxLen = Math.max(positiveSamples.length, negativeSamples.length);
    for (let i = 0; i < maxLen; i++) {
      if (positiveSamples[i]) samples.push({ ...positiveSamples[i], type: 'positive' });
      if (negativeSamples[i]) samples.push({ ...negativeSamples[i], type: 'negative' });
    }
    return samples;
  }, [step.result?.positiveSamples, step.result?.negativeSamples]);

  // 스켈레톤 너비 (고정값)
  const skeletonWidths = [72, 88, 64, 96, 80, 68];

  // 스켈레톤은 active일 때
  const showSkeleton = step.status === 'active';
  const showResults = step.status === 'done';

  return (
    <AnimatePresence mode="wait">
      {showSkeleton ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-3"
        >
          {/* 분석 중 헤더 */}
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <FcProcess size={14} />
            </motion.div>
            <span className="text-[12px] text-gray-500 font-medium">
              실제 구매 리뷰 분석 중...
            </span>
          </div>

          {/* 로딩 스켈레톤 */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {skeletonWidths.map((width, i) => (
                <div
                  key={i}
                  className="h-6 rounded-lg bg-gray-100 animate-pulse"
                  style={{ width: `${width}px` }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      ) : showResults ? (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2.5"
        >
          {/* 분석 완료 헤더 */}
          {analyzedCount > 0 && (
            <p className="text-[12px] text-gray-400 font-medium">
              리뷰 {analyzedCount.toLocaleString()}개 분석 완료
            </p>
          )}

          {/* 리뷰 샘플 미리보기 */}
          {reviewSamples.length > 0 && (
            <div className="space-y-1">
              {reviewSamples.slice(0, 3).map((sample, i) => (
                <div key={i} className="px-2 py-1.5 bg-gray-50 rounded-lg">
                  <span className="block text-[11px] text-gray-600 leading-[1.4]">
                    {sample.preview.length > 60
                      ? sample.preview.substring(0, 60) + '...'
                      : sample.preview}
                  </span>
                </div>
              ))}
              {analyzedCount > 3 && (
                <p className="text-[11px] text-gray-400 text-center">
                  +{(analyzedCount - 3).toLocaleString()}개 더 분석됨
                </p>
              )}
            </div>
          )}

          {/* 모든 태그 한 줄로 나열 (긍정 → 부정 → 고려사항) */}
          <div className="flex flex-wrap gap-1.5">
            {/* 긍정 태그 */}
            {(positiveKeywords.length > 0 ? positiveKeywords : prosTags).map((keyword: string, i: number) => (
              <motion.span
                key={`pos-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="px-2 py-1 bg-green-50 border border-green-100/50 rounded-lg text-[11px] font-semibold text-green-700"
              >
                {keyword}
              </motion.span>
            ))}
            {/* 부정 태그 */}
            {(negativeKeywords.length > 0 ? negativeKeywords : consTags).map((keyword: string, i: number) => (
              <motion.span
                key={`neg-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (positiveKeywords.length + i) * 0.03 }}
                className="px-2 py-1 bg-rose-50 border border-rose-100/50 rounded-lg text-[11px] font-semibold text-rose-600"
              >
                {keyword}
              </motion.span>
            ))}
            {/* 구매 고려사항 태그 */}
            {commonConcerns.map((concern: string, i: number) => (
              <motion.span
                key={`con-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (positiveKeywords.length + negativeKeywords.length + i) * 0.03 }}
                className="px-2 py-1 bg-purple-50 border border-purple-100/50 rounded-lg text-[11px] font-semibold text-purple-700"
              >
                {concern}
              </motion.span>
            ))}
          </div>
        </motion.div>
      ) : null}
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
          <div className="flex items-center">
            <p className="text-[14px] tracking-tight font-medium">
              <span className="text-gray-400">생성된 질문 </span>
              <span className="text-gray-500">{questions.length}개</span>
            </p>
          </div>

          {/* 질문 리스트 */}
          <div className="space-y-1.5">
            {questions.slice(0, 5).map((q, i) => (
                <motion.div
                key={q.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[12px] font-medium"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0 mt-[3px] text-gray-300">
                  <path d="M2.5 1.5V8.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="leading-[1.5]">
                  {q.question}
                </span>
              </motion.div>
            ))}
            {questions.length > 5 && (
              <div className="px-3">
                <span className="text-[11px] text-gray-400 font-medium">
                  외 {questions.length - 5}개의 질문이 더 생성되었습니다.
                </span>
              </div>
            )}
          </div>

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
  webSearchProgress,
}: {
  step: AnalysisStep;
  isExpanded: boolean;
  onToggle: () => void;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions?: GeneratedQuestion[];
  categoryKey: string;
  onRefChange?: (el: HTMLDivElement | null) => void;
  webSearchProgress?: WebSearchProgressData;
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
    if (step.status === 'done') {
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center justify-center w-5 h-5"
        >
          <Image src="/icons/check.png" alt="" width={20} height={20} />
        </motion.div>
      );
    }

    if (step.status === 'active' || isExpanded) {
      return (
        <div className="flex items-center justify-center w-4 h-4 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />
      );
    }

    return <div className="w-4 h-4 rounded-full border-[1.5px] border-purple-500" />;
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
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
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
            className="overflow-hidden relative"
          >
      {/* 세로 디바이더 라인 - 아이콘 중심 (10px), 하단 16px 간격 */}
            <div className="absolute left-[10px] top-0 bottom-4 w-px bg-gray-200" />
            
            {/* 내용 - 세로선 우측 배치를 위해 좌측 패딩 추가, 하단 16px */}
            <div className="pl-8 pb-4 space-y-3">
              {/* 웹검색 - 쿼리 스트리밍 + 출처 전환 효과 */}
              {step.id === 'web_search' && (
                <WebSearchContent step={step} categoryKey={categoryKey} webSearchProgress={webSearchProgress} />
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
// Static Step Card (바텀시트용 - 항상 펼쳐진 상태, 토글 없음)
// ============================================================================

function StaticStepCard({
  step,
  crawledProducts,
  generatedQuestions,
  categoryKey,
  webSearchProgress,
}: {
  step: AnalysisStep;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions?: GeneratedQuestion[];
  categoryKey: string;
  webSearchProgress?: WebSearchProgressData;
}) {
  const duration = step.endTime && step.startTime
    ? ((step.endTime - step.startTime) / 1000).toFixed(1)
    : null;

  return (
    <div className={`bg-white ${step.id === 'question_generation' ? '' : 'border-b border-gray-200'}`}>
      {/* 헤더 - 클릭 불가 */}
      <div className="py-4 flex items-center gap-3">
        {/* 상태 아이콘 */}
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
          <Image src="/icons/check.png" alt="" width={20} height={20} />
        </div>

        {/* 레이블 + 소요시간 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[14px] font-semibold text-gray-600 truncate">
            {step.label}
          </span>
          {duration && (
            <span className="text-[13px] font-medium text-gray-300 tabular-nums">
              {duration}s
            </span>
          )}
        </div>
      </div>

      {/* 상세 내용 - 항상 표시 */}
      <div className="relative">
        <div className="absolute left-[10px] top-0 bottom-4 w-px bg-gray-200" />
        <div className="pl-8 pb-4 space-y-3">
          {step.id === 'web_search' && (
            <WebSearchContent step={step} categoryKey={categoryKey} webSearchProgress={webSearchProgress} />
          )}
          {step.id === 'review_extraction' && (
            <ReviewExtractionContent step={step} />
          )}
          {step.id === 'product_analysis' && (
            <ProductAnalysisContent step={step} crawledProducts={crawledProducts} />
          )}
          {step.id === 'question_generation' && (
            <QuestionGenerationContent step={step} generatedQuestions={generatedQuestions} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Analysis Detail Bottom Sheet (바텀시트 - 4단계 내용 펼쳐진 상태로 표시)
// ============================================================================

function AnalysisDetailBottomSheet({
  isOpen,
  onClose,
  steps,
  crawledProducts,
  generatedQuestions,
  categoryKey,
  webSearchProgress,
}: {
  isOpen: boolean;
  onClose: () => void;
  steps: AnalysisStep[];
  crawledProducts: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions: AgenticLoadingPhaseProps['generatedQuestions'];
  categoryKey: string;
  webSearchProgress?: WebSearchProgressData;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-full max-w-[480px] bg-white rounded-t-[16px] overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white z-10 px-4 pt-5 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.img
                    src="/icons/ic-ai.svg"
                    alt=""
                    className="w-5 h-5"
                    animate={{
                      rotate: [0, -15, 15, -15, 0],
                      y: [0, -2.5, 0],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      repeatDelay: 2,
                      ease: "easeInOut"
                    }}
                  />
                  <h3 className="text-[18px] font-bold text-[#6366F1] leading-tight">
                    AI 실시간 분석
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 text-gray-400 hover:text-gray-500 transition-colors rounded-full hover:bg-gray-50"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content - 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">
              <div className="space-y-0">
                {steps.map((step) => (
                  <StaticStepCard
                    key={step.id}
                    step={step}
                    crawledProducts={step.id === 'product_analysis' ? crawledProducts : undefined}
                    generatedQuestions={step.id === 'question_generation' ? generatedQuestions : undefined}
                    categoryKey={categoryKey}
                    webSearchProgress={step.id === 'web_search' ? webSearchProgress : undefined}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Summary Card Component (완료 후 4단계를 감싸는 부모 토글 - 바텀시트 오픈)
// ============================================================================

function CompletedSummaryCard({
  categoryName,
  steps,
  crawledProducts,
  generatedQuestions,
  categoryKey,
  webSearchProgress,
}: {
  categoryName: string;
  steps: AnalysisStep[];
  crawledProducts: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions: AgenticLoadingPhaseProps['generatedQuestions'];
  categoryKey: string;
  webSearchProgress?: WebSearchProgressData;
}) {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  // 총 소요 시간 계산 (첫 단계 startTime ~ 마지막 단계 endTime)
  const totalDuration = useMemo(() => {
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    if (!firstStep?.startTime || !lastStep?.endTime) return null;
    return ((lastStep.endTime - firstStep.startTime) / 1000).toFixed(1);
  }, [steps]);

  // URL 기준 중복 제거 및 최대 7개 추출 (도메인 중복 허용하여 아이콘 개수 확보)
  const uniqueSources = useMemo(() => {
    const searchStep = steps.find(s => s.id === 'web_search');
    const searchResults = searchStep?.searchResults || [];
    if (searchResults.length === 0) return [];

    // URL 기준으로만 중복 제거
    const seen = new Set();
    return searchResults.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    }).slice(0, 7);
  }, [steps]);

  return (
    <>
      <div className="group transition-all duration-300 bg-white">
        <button
          onClick={() => setIsBottomSheetOpen(true)}
          className="w-full py-3.5 flex items-start gap-3 text-left transition-colors hover:bg-gray-50/50"
        >
          <div className="shrink-0 w-[16px] h-[16px] mt-0.5 flex items-center justify-center">
            <Image src="/icons/ic-ai.svg" alt="" width={16} height={16} />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-medium ai-gradient-text">
                  {categoryName} AI 실시간 분석
                </span>
                {totalDuration && (
                  <span className="text-[13px] text-gray-400 font-medium tabular-nums">
                    {totalDuration}s
                  </span>
                )}
              </div>
              <span className="text-[13px] text-gray-400 font-medium">
                {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}{' '}
                {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>

            {uniqueSources.length > 0 && (
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

          <CaretDown size={16} weight="bold" className="text-gray-600 mt-0.5" />
        </button>

        <div className="border-b border-gray-200" />
      </div>

      {/* 바텀시트 */}
      <AnalysisDetailBottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        steps={steps}
        crawledProducts={crawledProducts}
        generatedQuestions={generatedQuestions}
        categoryKey={categoryKey}
        webSearchProgress={webSearchProgress}
      />
    </>
  );
}

// ============================================================================
// Slide Step Content (슬라이드용 - 한 단계씩 보여줌)
// ============================================================================

function SlideStepContent({
  step,
  crawledProducts,
  generatedQuestions,
  categoryKey,
  globalStartTime,
  stepIndex,
  totalSteps,
  webSearchProgress,
}: {
  step: AnalysisStep;
  crawledProducts?: AgenticLoadingPhaseProps['crawledProducts'];
  generatedQuestions?: GeneratedQuestion[];
  categoryKey: string;
  globalStartTime?: number; // 전체 분석 시작 시간 (연속 타이머용)
  stepIndex: number; // 현재 단계 인덱스 (0-based)
  totalSteps: number; // 전체 단계 수
  webSearchProgress?: WebSearchProgressData;
}) {
  const getStatusIcon = () => {
    if (step.status === 'done') {
      return <Image src="/icons/check.png" alt="" width={20} height={20} />;
    }
    // 슬라이드로 표시 중인 단계는 활성 상태(active)이거나 
    // 아직 시작 전(pending)이라도 분석 중임을 나타내기 위해 스피너 표시
    return <div className="w-4 h-4 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />;
  };

  return (
    <div className="bg-white">
      {/* 헤더 */}
      <div className="py-3 flex items-center gap-3">
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
          {getStatusIcon()}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[14px] font-semibold text-gray-600 truncate">
            {step.label}
          </span>
          {/* 전체 분석 시작 시간 기준 연속 타이머 */}
          {(globalStartTime || step.startTime) && (
            <RealTimeTimer startTime={globalStartTime || step.startTime!} />
          )}
        </div>
        {/* n/4 진행 태그 */}
        <span className="text-[12px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-[6px]">
          {stepIndex + 1}/{totalSteps}
        </span>
      </div>

      {/* 상세 내용 - 슬라이드 전환 시 애니메이션 리트리거 */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="absolute left-[10px] top-0 bottom-4 w-px bg-gray-200" />
        <div className="pl-8 pb-4 space-y-3">
          {step.id === 'web_search' && (
            <WebSearchContent step={step} categoryKey={categoryKey} webSearchProgress={webSearchProgress} />
          )}
          {step.id === 'review_extraction' && (
            <ReviewExtractionContent step={step} />
          )}
          {step.id === 'product_analysis' && (
            <ProductAnalysisContent step={step} crawledProducts={crawledProducts} />
          )}
          {step.id === 'question_generation' && (
            <QuestionGenerationContent step={step} generatedQuestions={generatedQuestions} />
          )}
        </div>
      </motion.div>
    </div>
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
  onSummaryShow,
  webSearchProgress,
}: AgenticLoadingPhaseProps) {
  // 최소 표시 시간 (결과를 사용자가 인지할 수 있도록)
  const MIN_DISPLAY_TIME = 1600; // 1.6초

  // 현재 화면에 표시되는 단계 인덱스
  const [displayIndex, setDisplayIndex] = useState(0);

  // 데이터 상으로 진행되어야 할 단계 인덱스
  const dataIndex = useMemo(() => {
    const activeIdx = steps.findIndex(s => s.status === 'active');
    if (activeIdx !== -1) return activeIdx;

    // 모든 단계가 done이면 완료 상태
    if (steps.every(s => s.status === 'done')) return steps.length;

    // done인 단계 다음 인덱스
    const lastDoneIdx = [...steps].reverse().findIndex(s => s.status === 'done');
    if (lastDoneIdx !== -1) {
      return steps.length - lastDoneIdx;
    }

    return 0;
  }, [steps]);

  // displayIndex가 dataIndex보다 뒤처져 있으면, 타이머로 따라잡기
  useEffect(() => {
    // 이미 따라잡았거나 앞서있으면 스킵
    if (displayIndex >= dataIndex) return;

    const currentStepData = steps[displayIndex];

    // 현재 표시 단계가 done이면 최소 시간 후 다음으로
    // active 단계면 짧은 딜레이 후 이동 (cascading render 방지)
    const delay = currentStepData?.status === 'done' ? MIN_DISPLAY_TIME : 50;

    const timer = setTimeout(() => {
      setDisplayIndex(prev => Math.min(prev + 1, steps.length));
    }, delay);

    return () => clearTimeout(timer);
  }, [steps, displayIndex, dataIndex]);

  // 현재 표시할 단계
  const currentStep = steps[displayIndex] || null;

  // 전체 분석 시작 시간 (첫 번째 단계의 startTime)
  const globalStartTime = useMemo(() => {
    return steps[0]?.startTime || undefined;
  }, [steps]);

  // 완료 여부 체크 (모든 단계 done + displayIndex가 끝까지 도달)
  const showSummary = isComplete && steps.length > 0 && steps.every(s => s.status === 'done') && displayIndex >= steps.length;

  // 요약 카드로 전환될 때 콜백 호출 (ref로 중복 호출 방지)
  const summaryShownRef = useRef(false);
  useEffect(() => {
    if (showSummary && !summaryShownRef.current) {
      summaryShownRef.current = true;
      onSummaryShow?.();
    }
  }, [showSummary, onSummaryShow]);

  return (
    <div>
      <AnimatePresence mode="wait">
        {showSummary ? (
          <CompletedSummaryCard
            key="summary"
            categoryName={categoryName}
            steps={steps}
            crawledProducts={crawledProducts}
            generatedQuestions={generatedQuestions}
            categoryKey={categoryKey}
            webSearchProgress={webSearchProgress}
          />
        ) : currentStep ? (
          <motion.div
            key={currentStep.id}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
          >
            <SlideStepContent
              step={currentStep}
              crawledProducts={currentStep.id === 'product_analysis' ? crawledProducts : undefined}
              generatedQuestions={currentStep.id === 'question_generation' ? generatedQuestions : undefined}
              categoryKey={categoryKey}
              globalStartTime={globalStartTime}
              stepIndex={displayIndex}
              totalSteps={steps.length}
              webSearchProgress={currentStep.id === 'web_search' ? webSearchProgress : undefined}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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
      label: '리뷰 키워드 분석',
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
