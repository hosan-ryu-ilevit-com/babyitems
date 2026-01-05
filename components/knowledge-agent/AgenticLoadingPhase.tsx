'use client';

/**
 * Agentic Loading Phase Component
 *
 * Claude Code 스타일의 투명한 분석 과정 UI
 * - 단계별 체인 오브 쏘트
 * - 웹검색 쿼리/결과/출처
 * - 분석 결과 상세
 * - 실시간 0.1초 타이머
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretDown,
  CaretRight,
  Clock,
  Link,
  Question,
} from '@phosphor-icons/react/dist/ssr';
import { 
  FcSearch, 
  FcMindMap, 
  FcElectricity, 
  FcBullish, 
  FcCheckmark,
  FcProcess,
  FcIdea
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

  const getIcon = () => {
    switch (step.type) {
      case 'search':
        return <FcSearch size={18} />;
      case 'analyze':
        return <FcBullish size={18} />;
      case 'think':
        return <FcMindMap size={18} />;
      case 'generate':
        return <FcElectricity size={18} />;
      default:
        return <FcProcess size={18} />;
    }
  };

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
          <span className="shrink-0 opacity-90">
            {getIcon()}
          </span>
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
              
              {/* 검색 쿼리 */}
              {step.searchQueries && step.searchQueries.length > 0 && (
                <div className="space-y-1.5">
                  {step.searchQueries.map((query, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <FcSearch size={12} className="shrink-0" />
                      <span className="text-gray-500 font-medium">"{query}" 검색 중...</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* 검색 결과 출처 */}
              {step.searchResults && step.searchResults.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    출처 ({step.searchResults.length})
                  </p>
                  {step.searchResults.slice(0, 4).map((source, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Link size={12} className="text-blue-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline line-clamp-1"
                        >
                          {source.title || source.url}
                        </a>
                        {source.snippet && (
                          <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">
                            {source.snippet}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 분석 항목 */}
              {step.analyzedItems && step.analyzedItems.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    분석 항목 ({step.analyzedCount || step.analyzedItems.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {step.analyzedItems.slice(0, 6).map((item, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded"
                      >
                        {item}
                      </span>
                    ))}
                    {step.analyzedItems.length > 6 && (
                      <span className="text-[10px] text-gray-400">
                        +{step.analyzedItems.length - 6}개 더
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 생각 과정 */}
              {step.thinking && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1">
                    분석 결과
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                    {step.thinking}
                  </p>
                </div>
              )}

              {/* 인기상품 분석 - 썸네일 표시 */}
              {step.id === 'product_analysis' && crawledProducts && crawledProducts.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    수집된 상품 ({crawledProducts.length}개)
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {crawledProducts.slice(0, 10).map((p, i) => (
                      <motion.div
                        key={p.pcode || i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="shrink-0"
                      >
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-white border border-gray-100">
                          {p.thumbnail ? (
                            <img
                              src={p.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                              <span className="text-[8px] text-gray-400">N/A</span>
                            </div>
                          )}
                        </div>
                        {p.brand && (
                          <p className="text-[9px] text-gray-500 text-center mt-0.5 truncate w-11">
                            {p.brand}
                          </p>
                        )}
                      </motion.div>
                    ))}
                    {crawledProducts.length > 10 && (
                      <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-gray-500 font-medium">
                          +{crawledProducts.length - 10}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 맞춤 질문 생성 - 질문 요약 표시 */}
              {step.id === 'question_generation' && generatedQuestions && generatedQuestions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    생성된 질문 ({generatedQuestions.length}개)
                  </p>
                  <div className="space-y-1">
                    {generatedQuestions.slice(0, 5).map((q, i) => (
                      <div
                        key={q.id || i}
                        className="flex items-start gap-1.5 text-xs"
                      >
                        <Question size={12} className="text-purple-400 mt-0.5 shrink-0" />
                        <span className="text-gray-600 line-clamp-1">{q.question}</span>
                      </div>
                    ))}
                    {generatedQuestions.length > 5 && (
                      <p className="text-[10px] text-gray-400 pl-4">
                        +{generatedQuestions.length - 5}개 더
                      </p>
                    )}
                  </div>
                </div>
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

  // 활성 단계 자동 확장
  useEffect(() => {
    const activeStepIds = steps
      .filter(s => s.status === 'active')
      .map(s => s.id);
    
    if (activeStepIds.length > 0) {
      setExpandedStepIds(prev => {
        const next = new Set(prev);
        activeStepIds.forEach(id => next.add(id));
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
          <div className="relative">
            <div className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center">
              <FcIdea size={24} />
            </div>
            {isComplete ? (
               <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"
               >
                 <FcCheckmark size={8} />
               </motion.div>
            ) : (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute -top-1 -right-1"
              >
                <FcProcess size={14} />
              </motion.div>
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
              {categoryName} 심층 분석
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                Live Analysis • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* 진행률 */}
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[12px] font-bold text-gray-900 tabular-nums">
            {progress}%
          </span>
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 15 }}
            />
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
      label: '인기상품 분석',
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
