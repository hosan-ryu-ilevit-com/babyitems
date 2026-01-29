/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  CaretLeft, CaretDown, CaretUp, Lightning,
  PaperPlaneRight, ArrowClockwise, ArrowsLeftRight, Sparkle, CaretRight
} from '@phosphor-icons/react/dist/ssr';
import {
  FcSearch,
  FcIdea,
  FcSurvey,
  FcPositiveDynamic,
  FcClock,
  FcDataConfiguration,
  FcRight
} from "react-icons/fc";
import ProductDetailModal from '@/components/ProductDetailModal';
import { ProductComparisonGrid } from '@/components/knowledge-agent/ProductComparisonGrid';
import { AgenticLoadingPhase, createDefaultSteps, type AnalysisStep } from '@/components/knowledge-agent/AgenticLoadingPhase';
import { AssistantMessage, LoadingAnimation } from '@/components/recommend-v2';
import { InlineBudgetSelector } from '@/components/knowledge-agent/ChatUIComponents';
import { BalanceGameCarousel } from '@/components/recommend-v2/BalanceGameCarousel';
import { NegativeFilterList } from '@/components/recommend-v2/NegativeFilterList';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';
import { NegativeFilterAIHelperBottomSheet } from '@/components/recommend-v2/NegativeFilterAIHelperBottomSheet';
import type { BalanceQuestion as V2BalanceQuestion, UserSelections, TimelineStep } from '@/types/recommend-v2';
import { HardcutVisualization } from '@/components/knowledge-agent/HardcutVisualization';
import { PLPImageCarousel } from '@/components/knowledge-agent/PLPImageCarousel';
import { FilterTagBar } from '@/components/knowledge-agent/FilterTagBar';
// HighlightedText, HighlightedMarkdownText 제거됨 - tagScores 기반 뱃지 UI로 대체
import { ResultChatContainer } from '@/components/recommend-v2/ResultChatContainer';
import type { FilterTag } from '@/lib/knowledge-agent/types';
import { ResultChatMessage } from '@/components/recommend-v2/ResultChatMessage';
import SimpleConfirmModal from '@/components/SimpleConfirmModal';
import {
  logKnowledgeAgentReRecommendModalOpened,
  logKnowledgeAgentReRecommendSameCategory,
  logKnowledgeAgentReRecommendDifferentCategory,
  logKnowledgeAgentProductModalOpen,
  logKnowledgeAgentProductReviewClick,
  logKnowledgeAgentHardcutContinue,
  logKnowledgeAgentFinalInputSubmit,
  logKnowledgeAgentHardFilterSelection,
  logKnowledgeAgentRecommendationReceived,
  logKAPageView,
  logKALoadingPhaseStarted,
  logKALoadingPhaseCompleted,
  logKAQuestionAnswered,
  logKAQuestionSkipped,
  logKAChatMessage,
  logKAExternalLinkClicked,
  logKAFavoriteToggled,
  logKAComparisonViewed,
  logKAComparisonChatMessage
} from '@/lib/logging/clientLogger';
import { CATEGORIES_DATA, CATEGORY_PATH_MAP } from '@/components/knowledge-agent/KnowledgeAgentLanding';

// ============================================================================
// Helper function to determine parent category tab (baby/living)
// ============================================================================
function getParentCategoryTab(categoryName: string): 'baby' | 'living' {
  // Check if categoryName exists in 출산/육아용품
  for (const subCategory of Object.values(CATEGORIES_DATA['출산/육아용품'])) {
    if ((subCategory as any).children?.includes(categoryName)) {
      return 'baby';
    }
  }
  // Check if categoryName exists in 생활/주방가전
  for (const subCategory of Object.values(CATEGORIES_DATA['생활/주방가전'])) {
    if ((subCategory as any).children?.includes(categoryName)) {
      return 'living';
    }
  }
  // Default to baby if not found
  return 'baby';
}

// ============================================================================
// Types
// ============================================================================

type Phase = 'loading' | 'report' | 'questions' | 'hardcut_visual' | 'follow_up_questions' | 'balance' | 'final_input' | 'result' | 'free_chat';

// ============================================================================
// Step Indicator Component (4단계 진행 표시 - recommend-v2 스타일)
// ============================================================================

const STEPS = [
  { id: 1, label: '카테고리 설정', phases: ['loading'] },
  { id: 2, label: '맞춤 질문', phases: ['questions', 'report'] },
  { id: 3, label: '선호도 파악', phases: ['hardcut_visual', 'follow_up_questions', 'balance', 'final_input'] },
  { id: 4, label: '추천 완료', phases: ['result', 'free_chat'] },
];

function StepIndicator({ currentPhase }: { currentPhase: Phase }) {
  const currentStepIndex = STEPS.findIndex(step => step.phases.includes(currentPhase));
  const currentStep = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  return (
    <div className="flex justify-center bg-white shrink-0">
      <div className="w-full max-w-[480px] h-[49px] flex flex-col items-center bg-white pt-[12px] pb-[10px] px-4">
        {/* 텍스트 라벨 */}
        <div className="flex w-full justify-between items-center mb-[6px]">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            let textColorClass = 'text-gray-300 font-medium';
            if (isCompleted) textColorClass = 'text-gray-400 font-medium';
            if (isCurrent) textColorClass = 'text-gray-600 font-semibold';

            return (
              <div
                key={step.id}
                className={`text-[13px] transition-colors text-center flex-1 ${textColorClass}`}
              >
                {step.label}
              </div>
            );
          })}
        </div>
        {/* 프로그레스 바 */}
        <div className="flex w-full gap-[6px] px-1">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            let barColorClass = 'bg-gray-100';
            if (isCompleted) barColorClass = 'bg-gray-400';
            if (isCurrent) barColorClass = 'bg-gray-600';

            return (
              <div
                key={step.id}
                className={`h-[2px] flex-1 rounded-full transition-all duration-300 ${barColorClass}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Searching Indicator Component (검색 프로세스 시각화)
// ============================================================================

function SearchingIndicator({ queries, statusMessage }: { queries: string[], statusMessage?: string | null }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (queries.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % queries.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [queries]);

  const currentQuery = queries.length > 0 ? queries[currentIndex] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-3 py-3 px-1"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            className="w-1.5 h-1.5 rounded-full bg-blue-500"
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={statusMessage || currentQuery || 'thinking'}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.2 }}
          className="text-[14px] text-gray-500 font-medium"
        >
          {statusMessage ? (
            <motion.span
              animate={{ backgroundPosition: ["-100% 0", "100% 0"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="bg-gradient-to-r from-gray-600 via-gray-400 to-gray-600 bg-[length:200%_auto] bg-clip-text text-transparent font-semibold"
            >
              {statusMessage}
            </motion.span>
          ) : currentQuery ? (
            <>
              <span className="text-gray-400">&quot;</span>
              <motion.span
                animate={{ backgroundPosition: ["-100% 0", "100% 0"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="bg-gradient-to-r from-gray-600 via-gray-400 to-gray-600 bg-[length:200%_auto] bg-clip-text text-transparent font-semibold"
              >
                {currentQuery.length > 25 ? currentQuery.substring(0, 25) + '...' : currentQuery}
              </motion.span>
              <span className="text-gray-400">&quot;</span>
              <span className="text-gray-400 ml-1">검색 중...</span>
            </>
          ) : (
            <motion.span
              animate={{ backgroundPosition: ["-100% 0", "100% 0"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="bg-gradient-to-r from-gray-500 via-gray-400 to-gray-500 bg-[length:200%_auto] bg-clip-text text-transparent"
            >
              답변 분석 중...
            </motion.span>
          )}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// Search Context Toggle Component (웹서치 결과 토글)
// ============================================================================

function SearchContextToggle({ searchContext }: { searchContext: { query: string; insight: string } }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[12px] text-gray-400 hover:text-gray-600 transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-gray-50"
      >
        <FcSearch size={14} />
        <span className="font-medium text-gray-500">
          &quot;{searchContext.query.length > 25 ? searchContext.query.substring(0, 25) + '...' : searchContext.query}&quot;
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-400">웹 검색</span>
        {isExpanded ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[13px] text-gray-700 leading-relaxed font-medium">
                {searchContext.insight}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface QuestionTodo {
  id: string;
  question: string;
  reason: string;
  options: Array<{ value: string; label: string; description?: string; isPopular?: boolean }>;
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
  completed: boolean;
  answer?: string;
}

interface BalanceQuestion {
  id: string;
  type: string;
  title: string;
  option_A: { text: string; target_rule_key: string };
  option_B: { text: string; target_rule_key: string };
}

interface NegativeOption {
  id: string;
  label: string;
  target_rule_key: string;
  exclude_mode: string;
}

interface ChatMessage {
  id: string;
  questionId?: string; // 실제 질문의 ID (예: avoid_negatives)
  role: 'user' | 'assistant';
  content: string;
  options?: string[];  // 선택지 라벨 배열
  popularOptions?: string[];  // 인기 옵션 라벨들 (options 중에서 isPopular인 것들)
  selectedOptions?: string[]; // 복수 선택 저장
  isFinalized?: boolean;      // 선택 완료 여부 (지나간 질문)
  typing?: boolean;
  isLoading?: boolean;        // 로딩 중 (shimmer 효과)
  dataSource?: string;
  searchContext?: { query: string; insight: string };  // 검색 컨텍스트 결과
  timestamp: number;
  // 질문 진행도 표시용
  questionProgress?: { current: number; total: number };
  // 단점 필터 UI 표시용
  negativeFilterOptions?: NegativeOption[];
  // 결과 카드 표시용
  resultProducts?: any[];
  // 분석 보고서 토글 (요약 메시지에서 확장 가능)
  reportData?: {
    marketSummary: MarketSummary | null;
    trendAnalysis: TrendAnalysis | null;
    crawledProducts: CrawledProductPreview[];
  };
  // Agentic 분석 단계 (채팅 내 표시용)
  analysisData?: {
    steps: AnalysisStep[];
    crawledProducts: CrawledProductPreview[];
    generatedQuestions?: Array<{ id: string; question: string }>;
    isComplete: boolean;
    summary?: {
      productCount: number;
      reviewCount: number;
      topBrands: string[];
      trends: string[];
      sources: Array<{ title: string; url: string; snippet?: string }>;
    };
  };
  // 재추천 확인 데이터 (결과 페이지 채팅에서 재추천 의도 감지 시)
  reRecommendData?: {
    description: string;
    naturalLanguageCondition: string;
  };
  // 하드컷팅 시각화 데이터
  hardcutData?: {
    totalBefore: number;
    totalAfter: number;
    filteredProducts: any[];
    appliedRules: Array<{ rule: string; matchedCount: number }>;
  };
}

interface MarketSummary {
  productCount: number;
  reviewCount: number;
  priceRange: { min: number; max: number; avg: number };
  topBrands: string[];
  topPros: Array<{ keyword: string; count: number }>;
  topCons: Array<{ keyword: string; count: number }>;
  trend: string | null;
}

interface TrendAnalysis {
  timestamp: string;
  top10Summary: string;
  trends: string[];
  pros: string[];
  cons: string[];
  priceInsight: string;
  searchQueries?: string[];
  sources?: Array<{ title: string; url: string; snippet?: string }>;
}

// ============================================================================
// CrawledProductPreview 타입 (로딩 화면용)
// ============================================================================

interface CrawledProductPreview {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  danawaRank?: number | null;
  specSummary?: string;
}

// ============================================================================
// Option Button Component (HardFilter Style - No Shadows)
// ============================================================================

function OptionButton({
  label,
  isSelected,
  onClick,
  description,
  disabled,
  isPopular
}: {
  label: string;
  isSelected?: boolean;
  onClick: () => void;
  description?: string;
  disabled?: boolean;
  isPopular?: boolean;
}) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.005 } : {}}
      whileTap={!disabled ? { scale: 0.99 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 px-5 rounded-[12px] border text-left transition-all flex items-center justify-between group ${
        disabled
          ? 'bg-gray-50 border-gray-100 opacity-70 cursor-not-allowed'
          : isSelected
          ? 'bg-blue-50 border-blue-100'
          : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200 hover:bg-blue-50/30'
      }`}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className={`text-[16px] font-medium leading-[1.4] wrap-break-word ${
          disabled ? 'text-gray-400' : isSelected ? 'text-blue-500' : 'text-gray-600'
        }`}>{label}</span>
        {description && (
          <span className={`text-[12px] font-medium wrap-break-word ${
            disabled ? 'text-gray-300' : isSelected ? 'text-blue-400' : 'text-gray-400'
          }`}>{description}</span>
        )}
      </div>
      {isPopular && !disabled && (
        <span className="shrink-0 ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-[11px] font-semibold rounded-md">
          인기
        </span>
      )}
    </motion.button>
  );
}

// ============================================================================
// Report Toggle Component (분석 보고서 토글)
// ============================================================================

function ReportToggle({
  reportData
}: {
  reportData: {
    marketSummary: MarketSummary | null;
    trendAnalysis: TrendAnalysis | null;
    crawledProducts: CrawledProductPreview[];
  };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { marketSummary, trendAnalysis, crawledProducts } = reportData;

  if (!marketSummary) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="mt-3"
    >
      {/* 상품 그리드 - 항상 표시 */}
      {crawledProducts && crawledProducts.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[12px] font-semibold text-gray-500">
              📦 분석 완료된 상품
            </h4>
            <span className="text-[11px] text-gray-400">
              {crawledProducts.length}개
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {crawledProducts.slice(0, 10).map((product, i) => (
              <motion.div
                key={product.pcode || i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="text-center"
              >
                {product.thumbnail ? (
                  <img
                    src={product.thumbnail}
                    alt=""
                    className="w-full aspect-square rounded-lg object-cover bg-white border border-gray-100"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-gray-100 flex items-center justify-center">
                    <span className="text-[10px] text-gray-400">N/A</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-1 truncate">{product.brand || ''}</p>
              </motion.div>
            ))}
          </div>
          {crawledProducts.length > 10 && (
            <p className="text-[11px] text-gray-400 text-center mt-2">
              +{crawledProducts.length - 10}개 더 분석됨
            </p>
          )}
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
      >
        {isExpanded ? (
          <CaretUp size={16} weight="bold" />
        ) : (
          <CaretDown size={16} weight="bold" />
        )}
        <span className="font-medium">
          {isExpanded ? '상세 분석 접기' : '상세 분석 보기'}
        </span>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-4 bg-gray-50 rounded-xl p-4">
              {/* 인기 브랜드 */}
              {marketSummary.topBrands && marketSummary.topBrands.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">🏷️ 인기 브랜드</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topBrands.slice(0, 5).map((brand, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[12px] text-gray-700"
                      >
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 주요 장점 */}
              {marketSummary.topPros && marketSummary.topPros.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">👍 자주 언급되는 장점</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topPros.slice(0, 4).map((item, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-green-50 border border-green-200/50 rounded-[6px] text-[12px] font-semibold text-green-800"
                      >
                        {item.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 주요 단점 */}
              {marketSummary.topCons && marketSummary.topCons.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">👎 자주 언급되는 단점</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topCons.slice(0, 4).map((item, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-rose-50 border border-rose-200/50 rounded-[6px] text-[12px] font-semibold text-rose-700"
                      >
                        {item.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 트렌드 요약 */}
              {trendAnalysis && trendAnalysis.top10Summary && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">📊 시장 현황</h4>
                  <p className="text-[12px] text-gray-600 leading-relaxed">{trendAnalysis.top10Summary}</p>
                </div>
              )}

              {/* 최근 트렌드 */}
              {trendAnalysis && trendAnalysis.trends && trendAnalysis.trends.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">🔥 최근 트렌드</h4>
                  <ul className="space-y-1.5">
                    {trendAnalysis.trends.slice(0, 3).map((trend: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-600 leading-relaxed flex items-start gap-1.5">
                        <span className="text-orange-400 mt-0.5">•</span>
                        {trend}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 장점 */}
              {trendAnalysis && trendAnalysis.pros && trendAnalysis.pros.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">👍 구매자들이 좋아하는 점</h4>
                  <ul className="space-y-1">
                    {trendAnalysis.pros.slice(0, 3).map((pro: string, i: number) => (
                      <li key={i} className="text-[12px] text-green-700 leading-relaxed flex items-start gap-1.5">
                        <span className="mt-0.5">✓</span>
                        {pro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 단점/주의점 */}
              {trendAnalysis && trendAnalysis.cons && trendAnalysis.cons.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">⚠️ 주의해야 할 점</h4>
                  <ul className="space-y-1">
                    {trendAnalysis.cons.slice(0, 3).map((con: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-600 leading-relaxed flex items-start gap-1.5">
                        <span className="mt-0.5">!</span>
                        {con}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 가격 인사이트 */}
              {trendAnalysis && trendAnalysis.priceInsight && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">💰 가격 정보</h4>
                  <p className="text-[12px] text-gray-600 leading-relaxed">{trendAnalysis.priceInsight}</p>
                </div>
              )}

              {/* 검색 키워드 */}
              {trendAnalysis && trendAnalysis.searchQueries && trendAnalysis.searchQueries.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">🔍 분석에 사용된 검색어</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {trendAnalysis.searchQueries.map((query: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-50 border border-blue-100 rounded-md text-[12px] text-blue-700"
                      >
                        {query}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 참고 출처 */}
              {trendAnalysis && trendAnalysis.sources && trendAnalysis.sources.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-gray-500 mb-2">📎 참고 출처</h4>
                  <ul className="space-y-2">
                    {trendAnalysis.sources.map((source: { title: string; url: string; snippet?: string }, i: number) => (
                      <li key={i} className="bg-white border border-gray-100 rounded-lg p-2">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] font-medium text-blue-600 hover:underline line-clamp-1"
                        >
                          {source.title}
                        </a>
                        {source.snippet && (
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{source.snippet}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{source.url}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 분석된 상품 미리보기 (최대 10개) */}
              {crawledProducts && crawledProducts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[12px] font-semibold text-gray-500">
                      📦 분석 중인 상품
                    </h4>
                    <span className="text-[11px] text-purple-600 font-medium">
                      {crawledProducts.length}개
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {crawledProducts.slice(0, 10).map((product, i) => (
                      <motion.div
                        key={product.pcode || i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="text-center"
                      >
                        {product.thumbnail ? (
                          <img
                            src={product.thumbnail}
                            alt=""
                            className="w-full aspect-square rounded-lg object-cover bg-white border border-gray-100"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-[10px] text-gray-400">N/A</span>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500 mt-1 truncate">{product.brand || ''}</p>
                      </motion.div>
                    ))}
                  </div>
                  {crawledProducts.length > 10 && (
                    <p className="text-[11px] text-gray-400 text-center mt-2">
                      +{crawledProducts.length - 10}개 더 분석 중...
                    </p>
                  )}
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
// Auto Scroll Hook - 새 메시지를 화면 상단(헤더 아래)에 위치시키는 스크롤
// ============================================================================
function useAutoScroll(containerRef: React.RefObject<HTMLDivElement | null>) {
  const scrollToMessage = useCallback((messageId: string) => {
    const container = containerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
        if (!el) return;

        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = 60; // 헤더 + 스텝 인디케이터 높이 여유

        const relativeTop = elRect.top - containerRect.top;
        const targetScrollTop = container.scrollTop + relativeTop - offset;

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }, 100);
    });
  }, [containerRef]);

  const scrollToTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log('[KA Scroll] Force scrolling to top');

    // 즉시 실행
    container.scrollTop = 0;

    // 여러 프레임에 걸쳐 재시도 (모바일 최적화)
    requestAnimationFrame(() => {
      if (container) container.scrollTop = 0;

      requestAnimationFrame(() => {
        if (container) container.scrollTop = 0;

        // 최종 보험
        setTimeout(() => {
          if (container) {
            container.scrollTop = 0;
            console.log('[KA Scroll] Final scroll attempt, scrollTop:', container.scrollTop);
          }
        }, 50);
      });
    });
  }, [containerRef]);

  return { scrollToMessage, scrollToTop };
}

// ============================================================================
// Main Component
// ============================================================================

export default function KnowledgeAgentPage() {
  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;
  const categoryName = decodeURIComponent(categoryKey);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 자동 스크롤 훅
  const { scrollToMessage, scrollToTop } = useAutoScroll(mainRef);

  // State
  const [phase, setPhase] = useState<Phase>('loading');
  const [resultProducts, setResultProducts] = useState<any[]>([]);
  const [filterTags, setFilterTags] = useState<FilterTag[]>([]);
  const [selectedFilterTagIds, setSelectedFilterTagIds] = useState<Set<string>>(new Set());
  const [showReRecommendModal, setShowReRecommendModal] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeSearchQueries, setActiveSearchQueries] = useState<string[]>([]);
  const [activeStatusMessage, setActiveStatusMessage] = useState<string | null>(null);

  // 로딩 애니메이션 관련 state
  const [isCalculating, setIsCalculating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);

  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(() => createDefaultSteps(categoryName));
  const [analysisSummary, setAnalysisSummary] = useState<any>(undefined);

  // 웹검색 진행 상황 (실시간 UI 업데이트용)
  const [webSearchProgress, setWebSearchProgress] = useState<{
    currentQuery?: string;
    completedQueries: string[];
    results: { trends?: string[]; pros?: string[]; cons?: string[]; buyingFactors?: string[] };
  }>({ completedQueries: [], results: {} });

  // Question flow
  const [questionTodos, setQuestionTodos] = useState<QuestionTodo[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionTodo | null>(null);
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  // 첫 질문 대기 (분석 요약 카드로 접힌 후 표시)
  const pendingFirstQuestionRef = useRef<{ question: QuestionTodo; total: number } | null>(null);
  const [_progress, setProgress] = useState({ current: 0, total: 0 });

  // Navigation state
  const [canGoPrev, setCanGoPrev] = useState(false);

  // Balance game & Negative filter
  const [balanceQuestions, setBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [negativeOptions, setNegativeOptions] = useState<NegativeOption[]>([]);
  const [needsDynamicNegativeOptions, setNeedsDynamicNegativeOptions] = useState(false); // 동적 옵션 생성 필요 플래그
  const needsDynamicNegativeOptionsRef = useRef(false); // 클로저 문제 해결용 ref
  const prefetchedNegativeOptionsRef = useRef<string[] | null>(null); // 프리페치된 단점 옵션
  const prefetchedPopularOptionsRef = useRef<string[] | null>(null); // 프리페치된 인기 옵션
  const [isLoadingNegativeOptions, setIsLoadingNegativeOptions] = useState(false); // 동적 옵션 로딩 중
  const [trendCons, setTrendCons] = useState<string[]>([]); // Init에서 받은 트렌드 단점 키워드
  const trendConsRef = useRef<string[]>([]); // 클로저 문제 해결용 ref
  const [balanceAllAnswered, setBalanceAllAnswered] = useState(false); // 밸런스 게임 모든 질문 완료 여부
  const [balanceCurrentSelections, setBalanceCurrentSelections] = useState<Set<string>>(new Set()); // 현재 선택된 rule keys
  const [selectedNegativeKeys, setSelectedNegativeKeys] = useState<string[]>([]); // 단점 필터 선택된 rule keys (부모 컴포넌트에서 관리)

  // 꼬리질문 (Follow-up Questions) 상태
  const [followUpQuestions, setFollowUpQuestions] = useState<QuestionTodo[]>([]);
  const [currentFollowUpIndex, setCurrentFollowUpIndex] = useState(0);
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [followUpCustomInputActive, setFollowUpCustomInputActive] = useState(false);
  const [followUpCustomInputValue, setFollowUpCustomInputValue] = useState('');
  const followUpCustomInputRef = useRef<HTMLInputElement>(null);

  // AI Helper (뭘 고를지 모르겠어요) 상태
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isNegativeAIHelperOpen, setIsNegativeAIHelperOpen] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperData, setAiHelperData] = useState<{
    questionId: string;
    questionText: string;
    options: any;
    type: 'hard_filter' | 'balance_game' | 'negative';
  } | null>(null);

  // collectedInfo를 recommend-v2의 UserSelections 형식으로 변환
  const getUserSelections = (): UserSelections => {
    return {
      hardFilters: Object.entries(collectedInfo).map(([key, value]) => ({
        questionText: key,
        selectedLabels: [value]
      })),
      balanceGames: savedBalanceSelections.map(s => ({
        title: s.questionId, // ID를 타이틀로 사용 (정확한 타이틀은 찾기 어려움)
        selectedOption: s.selectedLabel
      })),
      initialContext: messages.find(m => m.role === 'user')?.content || ''
    };
  };

  // Results
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [modalInitialTab, setModalInitialTab] = useState<'price' | 'danawa_reviews'>('price');

  const handleProductClick = (product: any, tab: 'price' | 'danawa_reviews' = 'price') => {
    if (tab === 'danawa_reviews') {
      logKnowledgeAgentProductReviewClick(categoryKey, product.pcode || product.id, product.name || product.title);
    } else {
      logKnowledgeAgentProductModalOpen(categoryKey, categoryName, product.pcode || product.id, product.name || product.title, product.brand, product.rank);
    }
    setModalInitialTab(tab);
    setSelectedProduct(product);
  };

  // 분석 요약 카드로 접힐 때 호출 - 대기 중인 첫 질문 표시
  const handleAnalysisSummaryShow = () => {
    const pending = pendingFirstQuestionRef.current;
    if (!pending) return;

    const { question: firstQuestion, total } = pending;
    pendingFirstQuestionRef.current = null; // 중복 방지

    setPhase('questions');
    const firstQuestionMsgId = `q_${firstQuestion.id}`;
    // 인기 옵션 추출 (isPopular가 true인 것들의 label)
    const popularOpts = firstQuestion.options
      .filter((o: any) => o.isPopular)
      .map((o: any) => o.label);
    setMessages(prev => [...prev, {
      id: firstQuestionMsgId,
      questionId: firstQuestion.id,
      role: 'assistant',
      content: firstQuestion.question,
      options: firstQuestion.options.map((o: any) => o.label),
      popularOptions: popularOpts.length > 0 ? popularOpts : undefined,
      questionProgress: { current: 1, total },
      dataSource: firstQuestion.dataSource,
      typing: true,
      timestamp: Date.now()
    }]);
  };

  const [crawledProducts, setCrawledProducts] = useState<CrawledProductPreview[]>([]);

  // V2 Flow: 확장 크롤링 + 하드컷팅 + 리뷰 크롤링
  const [expandedProducts, setExpandedProducts] = useState<any[]>([]);
  const [hardCutProducts, setHardCutProducts] = useState<any[]>([]);
  // 🆕 DB의 product_count (knowledge_categories 테이블에서 가져온 값)
  const [dbProductCount, setDbProductCount] = useState<number | null>(null);
  const [reviewsData, setReviewsData] = useState<Record<string, any[]>>({});
  const [pricesData, setPricesData] = useState<Record<string, {
    lowestPrice: number | null;
    lowestMall: string | null;
    lowestDelivery: string | null;
    lowestLink: string | null;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
  }>>({});
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  // Product Analysis 데이터 (조건 충족도, 상황 적합성 등)
  const [productAnalyses, setProductAnalyses] = useState<Record<string, {
    selectedConditionsEvaluation: Array<{
      condition: string;
      conditionType: 'hardFilter' | 'balance' | 'negative';
      status: string;
      evidence: string;
      questionId?: string;
    }>;
    contextMatch?: {
      explanation: string;
      matchedPoints: string[];
    };
    oneLiner?: string;
    additionalPros: Array<{ text: string; citations: number[] }>;
    cons: Array<{ text: string; citations: number[] }>;
  }>>({});
  const [isProductAnalysisLoading, setIsProductAnalysisLoading] = useState(false); // PDP 분석 로딩 상태
  // ✅ 추가: 자유 입력 분석 결과 (PDP 선호/회피 조건 표시용)
  const [freeInputAnalysis, setFreeInputAnalysis] = useState<{
    preferredAttributes: string[];
    avoidAttributes: string[];
    usageContext: string | null;
    summary: string;
  } | null>(null);
  const [v2FlowEnabled] = useState(true); // V2 플로우 활성화 여부
  const [v2FlowStarted, setV2FlowStarted] = useState(false); // V2 플로우 시작 여부
  const [savedBalanceSelections, setSavedBalanceSelections] = useState<any[]>([]); // 밸런스 선택 저장
  const [savedNegativeLabels, setSavedNegativeLabels] = useState<string[]>([]); // 단점 필터 선택 저장 (labels)
  const [hardcutResult, setHardcutResult] = useState<{
    totalBefore: number;
    totalAfter: number;
    appliedRules: Array<{ rule: string; matchedCount: number }>;
  } | null>(null);
  const [isHardcutVisualDone, setIsHardcutVisualDone] = useState(false); // 하드컷팅 결과 (시각화용)
  const [showComparisonOnly, setShowComparisonOnly] = useState(false); // 비교표 토글 상태

  // 프로그레스 애니메이션 cleanup 함수 저장용
  const progressAnimationCleanupRef = useRef<(() => void) | null>(null);

  /**
   * 프로그레스 바를 부드럽게 애니메이션 (22초 완료 기준)
   * @param targetDuration 목표 완료 시간 (기본 22000ms)
   */
  const animateProgressSmoothly = useCallback((targetDuration: number = 22000) => {
    // 이전 애니메이션이 있다면 취소
    if (progressAnimationCleanupRef.current) {
      progressAnimationCleanupRef.current();
      progressAnimationCleanupRef.current = null;
    }

    const startTime = Date.now();
    const endTime = startTime + targetDuration;
    let animationFrameId: number;

    const updateProgress = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const percentage = Math.min(Math.round((elapsed / targetDuration) * 100), 99); // 99%까지만

      setLoadingProgress(percentage);

      if (now < endTime) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    // cleanup 함수 생성 및 저장
    const cleanup = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
    progressAnimationCleanupRef.current = cleanup;

    return cleanup;
  }, []);

  // 최종 추천 단계의 타임라인 UX 헬퍼
  const runFinalTimelineUX = useCallback(async (candidateCount: number, userSelectionCount: number, negativeCount: number) => {
    setIsCalculating(true);
    setTimelineSteps([]);
    setLoadingProgress(0);

    // 랜덤 시간 variation 헬퍼 (±10%)
    const getRandomDuration = (baseMs: number) => {
      const variation = baseMs * 0.1;
      return baseMs + (Math.random() * variation * 2 - variation);
    };

    // 🆕 22초 기준 부드러운 프로그레스 애니메이션 시작
    animateProgressSmoothly(22000);

    // 선택 조건 텍스트 동적 생성
    const conditionParts: string[] = [];
    if (userSelectionCount > 0) {
      conditionParts.push(`${userSelectionCount}개의 선호 조건`);
    }
    if (negativeCount > 0) {
      conditionParts.push(`${negativeCount}개의 피하고 싶은 조건`);
    }
    const conditionText = conditionParts.length > 0
      ? conditionParts.join('과 ')
      : '선택하신 조건';

    // 1단계: 선호도 분석 (6.2초 ±10%)
    const step1Duration = getRandomDuration(6200);
    const step1: TimelineStep = {
      id: 'step-1',
      title: '[1/4] 사용자 취향 심층 분석 중',
      icon: '',
      details: [
        `${conditionText}을 바탕으로 선호하시는 조건과 우선순위를 파악합니다.`
      ],
      timestamp: Date.now(),
      startTime: Date.now(),
      status: 'in_progress'
    };
    setTimelineSteps([step1]);
    await new Promise(resolve => setTimeout(resolve, step1Duration));

    // 1단계 완료 처리
    const step1Completed = { ...step1, status: 'completed' as const, endTime: Date.now() };

    // 2단계: 제품 스펙 수집 (6.2초 ±10%)
    const step2Duration = getRandomDuration(6200);
    const candidateText = candidateCount > 0 ? `${candidateCount}개` : '전체';
    const step2: TimelineStep = {
      id: 'step-2',
      title: `[2/4] ${candidateText} 후보 제품 스펙 수집 및 분석 중`,
      icon: '',
      details: [
        '제품 상세 스펙 데이터와 제조사 공식 정보를 수집하여 비교 분석합니다.'
      ],
      timestamp: Date.now(),
      startTime: Date.now(),
      status: 'in_progress'
    };
    setTimelineSteps([step1Completed, step2]);
    await new Promise(resolve => setTimeout(resolve, step2Duration));

    // 2단계 완료 처리
    const step2Completed = { ...step2, status: 'completed' as const, endTime: Date.now() };

    // 3단계: 리뷰 데이터 종합 평가 (6.2초 ±10%)
    const step3Duration = getRandomDuration(6200);
    const step3: TimelineStep = {
      id: 'step-3',
      title: '[3/4] 실제 사용자 리뷰 데이터 분석 중',
      icon: '',
      details: [
        '수만 건의 실제 구매 리뷰를 분석하여 장단점과 만족도를 파악합니다.'
      ],
      timestamp: Date.now(),
      startTime: Date.now(),
      status: 'in_progress'
    };
    setTimelineSteps([step1Completed, step2Completed, step3]);
    await new Promise(resolve => setTimeout(resolve, step3Duration));

    // 3단계 완료 처리
    const step3Completed = { ...step3, status: 'completed' as const, endTime: Date.now() };

    // 4단계: 최종 TOP 5 추천 생성 (API 완료될 때까지 계속 in_progress 유지)
    const step4: TimelineStep = {
      id: 'step-4',
      title: '[4/4] Top 5 맞춤 추천 생성 중',
      icon: '',
      details: [
        '분석 결과를 종합하여 가장 적합한 Top 5 제품을 선정하고 추천 이유를 작성합니다.'
      ],
      timestamp: Date.now(),
      startTime: Date.now(),
      status: 'in_progress'
    };
    setTimelineSteps([step1Completed, step2Completed, step3Completed, step4]);
    // 프로그레스는 animateProgressSmoothly가 자동으로 99%까지 업데이트

    // 여기서는 완료 처리하지 않음 (API 응답 시 컴포넌트가 언마운트됨)
  }, [categoryName, animateProgressSmoothly]);

  // 웹서치 Context (밸런스게임/단점 생성용 - 리뷰 크롤링 전에 사용)
  const [webSearchContext, setWebSearchContext] = useState<{
    marketSummary?: {
      topBrands?: string[];
      topPros?: string[];
      topCons?: string[];
      priceRange?: { min: number; max: number };
      reviewCount?: number;
    };
    trendAnalysis?: {
      top10Summary?: string;
      trends?: string[];
      pros?: string[];
      cons?: string[];
      priceInsight?: string;
      sources?: Array<{ title: string; url: string; snippet?: string }>;
    };
  } | null>(null);
  const [isExpandCrawling, setIsExpandCrawling] = useState(false); // 확장 크롤링 진행 중
  const [isExpandComplete, setIsExpandComplete] = useState(false); // 확장 크롤링 완료 여부

  // 애니메이션 및 입력 제어용
  const [barAnimationKey, setBarAnimationKey] = useState(0);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // ============================================================================
  // LocalStorage 저장/복원 (Top 3 결과)
  // ============================================================================

  const STORAGE_KEY = `ka-result-${categoryName}`;

  const saveResultToStorage = useCallback((
    products: any[],
    msgs: ChatMessage[],
    _reviews?: Record<string, any>,  // 더 이상 저장 안 함 (Supabase에서 가져옴)
    prices?: Record<string, any>,
    tags?: FilterTag[],
    analyses?: Record<string, any>  // 🆕 PDP 분석 데이터 (왜 추천했나요?, 주요 포인트)
  ) => {
    console.log('[KA Storage] saveResultToStorage called:', {
      productsLength: products?.length,
      msgsLength: msgs?.length,
      tagsLength: tags?.length,
      analysesCount: analyses ? Object.keys(analyses).length : 0,
      STORAGE_KEY
    });

    try {
      const resultMessage = msgs.find(m => m.resultProducts && m.resultProducts.length > 0);
      console.log('[KA Storage] resultMessage found:', !!resultMessage, resultMessage?.resultProducts?.length);

      if (!resultMessage || products.length === 0) {
        console.log('[KA Storage] ⚠️ Skip save - no resultMessage or empty products');
        return;
      }

      // 🆕 리뷰 데이터 제외 (Supabase에서 가져오므로 저장 불필요)
      // resultProducts에서 reviews 필드 제거하여 용량 절약
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const lightProducts = products.map(({ reviews, ...rest }) => rest);

      const dataToSave = {
        resultProducts: lightProducts,
        resultMessage: {
          id: resultMessage.id,
          role: resultMessage.role,
          content: resultMessage.content,
          resultProducts: lightProducts,
          timestamp: resultMessage.timestamp,
        },
        // reviewsData 제외! (Supabase에서 가져옴)
        pricesData: prices || {},
        filterTags: tags || [],
        // 🆕 PDP 분석 데이터 캐싱 (왜 추천했나요?, 주요 포인트)
        productAnalyses: analyses || {},
        savedAt: Date.now(),
      };

      const jsonStr = JSON.stringify(dataToSave);
      console.log('[KA Storage] Saving data size:', (jsonStr.length / 1024).toFixed(1), 'KB');

      localStorage.setItem(STORAGE_KEY, jsonStr);
      console.log('[KA] ✅ Result saved to localStorage (with', tags?.length || 0, 'tags)');
    } catch (e) {
      console.error('[KA] Failed to save result:', e);
      // QuotaExceeded 시 오래된 캐시 삭제 후 재시도
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.log('[KA Storage] QuotaExceeded - clearing all old caches...');
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ka-result-') && k !== STORAGE_KEY);
        allKeys.forEach(k => {
          localStorage.removeItem(k);
          console.log('[KA Storage] Removed:', k);
        });
      }
    }
  }, [STORAGE_KEY]);

  const loadResultFromStorage = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      const data = JSON.parse(saved);
      // 7일 이내의 결과만 복원
      if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }

      if (data.resultProducts?.length > 0 && data.resultMessage) {
        // 🆕 태그 충족도 기반 재정렬 (O > △ > X)
        const calcTagScore = (tagScores: Record<string, unknown>): number => {
          let score = 0;
          for (const value of Object.values(tagScores || {})) {
            const status = typeof value === 'object' && value !== null
              ? (value as { score?: string }).score
              : value;
            if (status === 'full') score += 2;
            else if (status === 'partial') score += 1;
          }
          return score;
        };

        // 태그 점수로 재정렬 후 rank 재부여
        const sortedProducts = [...data.resultProducts].sort((a, b) => {
          const aScore = calcTagScore(a.tagScores);
          const bScore = calcTagScore(b.tagScores);
          return bScore - aScore;
        }).map((p, idx) => ({ ...p, rank: idx + 1 }));

        setResultProducts(sortedProducts);
        setMessages([data.resultMessage as ChatMessage]);
        setPhase('result');
        // reviewsData 제외 - PDP에서 Supabase로 직접 fetch
        if (data.pricesData) setPricesData(data.pricesData);
        // filterTags 복원
        if (data.filterTags && Array.isArray(data.filterTags)) {
          setFilterTags(data.filterTags);
        }
        // 🆕 PDP 분석 데이터 복원 (왜 추천했나요?, 주요 포인트)
        if (data.productAnalyses && Object.keys(data.productAnalyses).length > 0) {
          setProductAnalyses(data.productAnalyses);
          console.log('[KA] ✅ Result restored from localStorage (with', data.filterTags?.length || 0, 'tags,', Object.keys(data.productAnalyses).length, 'analyses, re-sorted by tagScores)');
        } else {
          console.log('[KA] ✅ Result restored from localStorage (with', data.filterTags?.length || 0, 'tags, no analyses, re-sorted by tagScores)');
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error('[KA] Failed to load result:', e);
      return false;
    }
  }, [STORAGE_KEY]);

  // ============================================================================
  // Initialize
  // ============================================================================

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    logKAPageView(`ka-agent-${categoryName}`);

    // 저장된 결과가 있으면 복원하고 초기화 건너뛰기
    if (loadResultFromStorage()) {
      // ✅ localStorage 복원 후 스크롤 맨 위로 (모바일에서 중간 스크롤 방지)
      setTimeout(scrollToTop, 100);
      return;
    }

    initializeAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey]);

  // [자동 스크롤] 새 메시지가 추가될 때 해당 메시지를 화면 상단에 위치
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current;

    // 새 메시지가 추가된 경우에만 스크롤
    if (messages.length > prevLength) {
      const newMessage = messages[messages.length - 1];

      // 사용자 메시지 또는 AI 텍스트 응답일 때만 스크롤
      // (로딩 중 analysisData 업데이트, 옵션/팁 렌더링 시에는 스크롤 안 함)
      // ✅ 결과 메시지(resultProducts 포함)는 별도 처리 - 비교표 전체가 아닌 메시지 상단으로만 스크롤
      // ✅ result phase에서 AI 응답(결과 채팅)은 스크롤 건너뛰기 - 스크롤 점핑 방지

      // 🚫 첫 번째 맞춤질문(분석 완료 후 첫 메시지)은 자동 스크롤 방지
      // (AgenticLoadingPhase에서 이미 맨 위로 스크롤했으므로, 다시 아래로 내려가는 것 방지)
      const isFirstQuestion = messages.length === 2 && messages[0].id === 'analysis-progress';

      if (!isFirstQuestion && (newMessage.role === 'user' ||
        (newMessage.role === 'assistant' && newMessage.content && !newMessage.analysisData && !newMessage.resultProducts && phase !== 'result'))) {
        scrollToMessage(newMessage.id);
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToMessage, phase]);

  // ✅ 결과 화면(phase='result')으로 전환 시 무조건 맨 위로 스크롤 (모바일 최적화)
  useEffect(() => {
    if ((phase === 'result' || phase === 'free_chat') && resultProducts.length > 0) {
      console.log('[KA Scroll] Result phase detected - forcing scroll to top');
      scrollToTop();
    }
  }, [phase, resultProducts.length, scrollToTop]);

  // 입력창 높이 자동 조절 및 하이라이트 리셋
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.max(56, Math.min(inputRef.current.scrollHeight, 160))}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (isHighlighting) {
      const timer = setTimeout(() => setIsHighlighting(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighting]);

  // 내비게이션 가능 여부 업데이트
  useEffect(() => {
    const assistantQuestions = messages.filter(m => m.role === 'assistant' && m.options);
    setCanGoPrev(assistantQuestions.length > 1);
  }, [messages]);

  // 🆕 필터 태그 토글 핸들러
  const handleFilterTagToggle = useCallback((tagId: string) => {
    if (tagId === '__all__') {
      // "모두" 선택 시 전체 해제
      setSelectedFilterTagIds(new Set());
      return;
    }

    setSelectedFilterTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  // 🆕 태그 선택에 따른 필터링 + 정렬된 결과 제품 (tagScores 기반)
  const sortedResultProducts = useMemo(() => {
    // 태그 미선택 시 AI 순위 유지
    if (selectedFilterTagIds.size === 0) {
      return resultProducts;
    }

    // 1. 필터링: 선택된 태그를 모두 충족해야 표시 (AND 조건)
    const filteredProducts = resultProducts.filter(product => {
      const tagScores = product.tagScores as Record<string, { score: 'full' | 'partial' | null }> | undefined;
      if (!tagScores) return false;

      // AND 조건: 선택된 태그가 모두 full 또는 partial이어야 표시
      for (const tagId of selectedFilterTagIds) {
        const scoreData = tagScores[tagId];
        if (scoreData?.score !== 'full' && scoreData?.score !== 'partial') {
          return false;  // 하나라도 충족하지 못하면 제외
        }
      }
      return true;  // 모든 태그를 충족하면 표시
    });

    // 2. 각 제품의 충족도 점수 계산 (full=2, partial=1, null=0)
    const productsWithScore = filteredProducts.map(product => {
      let fulfillmentScore = 0;
      let fullCount = 0;
      let partialCount = 0;
      const tagScores = product.tagScores as Record<string, { score: 'full' | 'partial' | null }> | undefined;

      if (tagScores) {
        for (const tagId of selectedFilterTagIds) {
          const scoreData = tagScores[tagId];
          if (scoreData?.score === 'full') {
            fulfillmentScore += 2;
            fullCount++;
          } else if (scoreData?.score === 'partial') {
            fulfillmentScore += 1;
            partialCount++;
          }
        }
      }

      return { ...product, fulfillmentScore, fullCount, partialCount };
    });

    // 3. 충족도 점수 높은 순 정렬 (동점 시 full 개수 > partial 개수 > 원래 순서)
    return [...productsWithScore].sort((a, b) => {
      if (b.fulfillmentScore !== a.fulfillmentScore) {
        return b.fulfillmentScore - a.fulfillmentScore;
      }
      if (b.fullCount !== a.fullCount) {
        return b.fullCount - a.fullCount;
      }
      return b.partialCount - a.partialCount;
    });
  }, [resultProducts, selectedFilterTagIds]);

  // 결과가 생성되면 로컬스토리지에 저장
  useEffect(() => {
    if (phase === 'result' && resultProducts.length > 0) {
      const hasResultMessage = messages.some(m => m.resultProducts && m.resultProducts.length > 0);
      console.log('[KA Storage] Check:', {
        phase,
        resultProductsLength: resultProducts.length,
        hasResultMessage,
        messagesCount: messages.length,
        filterTagsCount: filterTags.length,
        analysesCount: Object.keys(productAnalyses).length  // 🆕 PDP 분석 데이터 수도 로깅
      });

      if (hasResultMessage) {
        saveResultToStorage(resultProducts, messages, reviewsData, pricesData, filterTags, productAnalyses);
      } else {
        // ⚠️ messages에 resultProducts가 아직 없으면 다음 렌더에서 다시 시도
        // 하지만 이미 resultProducts가 있으므로 직접 저장 시도
        console.log('[KA Storage] ⚠️ No resultMessage yet, will retry on next render or save directly');

        // 🆕 Fallback: messages에 resultProducts가 없어도 resultProducts가 있으면 저장
        // (state 업데이트 순서로 인한 race condition 방지)
        const fallbackMessage: ChatMessage = {
          id: `a_result_fallback_${Date.now()}`,
          role: 'assistant',
          content: '추천 결과',
          resultProducts: resultProducts,
          timestamp: Date.now()
        };
        saveResultToStorage(resultProducts, [fallbackMessage], reviewsData, pricesData, filterTags, productAnalyses);
      }
    }
  }, [phase, resultProducts, messages, reviewsData, pricesData, filterTags, productAnalyses, saveResultToStorage]);

  const initializeAgent = async () => {
    const initialQueries = [
      `${categoryName} 인기 순위 2026`,
      `${categoryName} 추천 베스트`,
      `${categoryName} 구매가이드`,
      `${categoryName} 장단점 비교`
    ];

    let localSteps = createDefaultSteps(categoryName);
    let localProducts: CrawledProductPreview[] = [];
    let trendData: any = null;

    // UI 단계 전환을 위한 리졸버 및 제어 로직 (버퍼링)
    const stepDataResolvers: Record<string, (data?: any) => void> = {};

    // 모든 Promise를 미리 생성하여 resolver를 즉시 등록 (이벤트 손실 방지)
    const stepPromises: Record<string, Promise<any>> = {};
    const stepIds = ['product_analysis', 'filters', 'web_search', 'review_extraction', 'question_generation', 'complete'];
    for (const stepId of stepIds) {
      stepPromises[stepId] = new Promise(resolve => {
        stepDataResolvers[stepId] = resolve;
      });
    }

    const updateStepAndMessage = (stepId: string, updates: Partial<AnalysisStep>) => {
      const prevStep = localSteps.find(s => s.id === stepId);
      if (updates.status === 'active' && prevStep?.status !== 'active') {
        logKALoadingPhaseStarted(categoryKey, stepId);
      } else if (updates.status === 'done' && prevStep?.status !== 'done') {
        logKALoadingPhaseCompleted(categoryKey, stepId, updates.endTime ? updates.endTime - (prevStep?.startTime || updates.endTime) : undefined);
      }

      localSteps = localSteps.map(s => s.id === stepId ? { ...s, ...updates } : s);
      setAnalysisSteps([...localSteps]);

      setMessages(prev => {
        const analysisMsg = prev.find(m => m.id === 'analysis-progress');
        if (analysisMsg) {
          return prev.map(m => m.id === 'analysis-progress' ? {
            ...m,
            analysisData: {
              steps: [...localSteps],
              crawledProducts: localProducts,
              isComplete: false,
            }
          } : m);
        }
        return prev;
      });
    };

    // UI 흐름 제어 (비동기) - 미리 생성된 Promise 사용
    const driveUIFlow = async () => {
      // 1. 인기상품 분석 대기
      const productAnalysisResult = await stepPromises['product_analysis'] as { count?: number };
      // DB의 product_count 사용 (first_batch_complete 이벤트에서 전달됨)
      const displayCount = productAnalysisResult?.count || localProducts.length;
      updateStepAndMessage('product_analysis', {
        status: 'done',
        endTime: Date.now(),
        analyzedCount: displayCount,
        thinking: `${displayCount}개 상품 분석 완료`,
      });
      await new Promise(r => setTimeout(r, 200));

      // 2. 웹검색 시작 (순서 변경: 웹검색 → 리뷰분석)
      updateStepAndMessage('web_search', {
        status: 'active',
        startTime: Date.now(),
        searchQueries: initialQueries,
      });

      const trendResult = await stepPromises['web_search'] as { searchQueries?: string[]; sources?: any[]; trendAnalysis?: { top10Summary?: string } };

      updateStepAndMessage('web_search', {
        status: 'done',
        endTime: Date.now(),
        searchQueries: trendResult?.searchQueries || initialQueries,
        searchResults: (trendResult?.sources || []).slice(0, 5),
        thinking: trendResult?.trendAnalysis?.top10Summary || '',
      });
      await new Promise(r => setTimeout(r, 600)); // 사용자가 결과 인식할 시간

      // 3. 리뷰 분석 시작
      updateStepAndMessage('review_extraction', {
        status: 'active',
        startTime: Date.now(),
      });

      // 리뷰 분석 완료 대기 (SSE review_analysis_complete 이벤트에서 resolve)
      const reviewResult = await stepPromises['review_extraction'] as {
        prosTags?: string[];
        consTags?: string[];
        analyzedCount?: number;
        positiveKeywords?: string[];
        negativeKeywords?: string[];
        commonConcerns?: string[];
      } | undefined;

      // 결과가 있으면 리뷰 분석 결과 사용, 없으면 웹트렌드 데이터 폴백
      const reviewProsTags = reviewResult?.prosTags || [];
      const reviewConsTags = reviewResult?.consTags || [];
      const reviewAnalyzedCount = reviewResult?.analyzedCount || 0;
      const reviewPositiveKeywords = reviewResult?.positiveKeywords || [];
      const reviewNegativeKeywords = reviewResult?.negativeKeywords || [];
      const reviewCommonConcerns = reviewResult?.commonConcerns || [];

      // 기존 step의 result에서 positiveSamples, negativeSamples 유지 (SSE review_analysis_start에서 설정됨)
      const existingReviewResult = localSteps.find(s => s.id === 'review_extraction')?.result;
      updateStepAndMessage('review_extraction', {
        status: 'done',
        endTime: Date.now(),
        analyzedCount: reviewAnalyzedCount || localProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0),
        analyzedItems: reviewProsTags.length > 0
          ? [...reviewProsTags.slice(0, 3), ...reviewConsTags.slice(0, 2)]
          : [...(trendData?.pros || []).slice(0, 3), ...(trendData?.cons || []).slice(0, 2)],
        result: {
          ...existingReviewResult, // 기존 positiveSamples, negativeSamples 유지
          prosTags: reviewProsTags,
          consTags: reviewConsTags,
          analyzedCount: reviewAnalyzedCount,
          // 전체 분석 결과 포함
          positiveKeywords: reviewPositiveKeywords,
          negativeKeywords: reviewNegativeKeywords,
          commonConcerns: reviewCommonConcerns,
        },
        thinking: `리뷰 키워드 분석 완료`,
      });
      await new Promise(r => setTimeout(r, 600)); // 사용자가 태그 인식할 시간

      // 4. 질문 생성 시작 & 대기 (실제 서버의 질문 생성을 기다림)
      updateStepAndMessage('question_generation', {
        status: 'active',
        startTime: Date.now(),
      });
      const questionResult = await stepPromises['question_generation'] as { questionTodos?: any[] };
      const generatedQuestions = (questionResult?.questionTodos || []).map((q: any) => ({ id: q.id, question: q.question }));
      localSteps = localSteps.map(s => s.id === 'question_generation' ? {
        ...s, status: 'done' as const, endTime: Date.now(), analyzedCount: generatedQuestions.length, thinking: `맞춤 질문 ${generatedQuestions.length}개 생성 완료`,
      } : s);
      setAnalysisSteps([...localSteps]);

      // ✅ 질문 생성 완료 즉시 첫 질문 표시! (리뷰 크롤링 기다리지 않음)
      // avoid_negatives도 맞춤 질문 마지막에 포함 (동적 옵션은 해당 질문 표시 시점에 로드)
      const questionTodosFromQuestions = questionResult?.questionTodos || [];
      const firstQuestion = questionTodosFromQuestions[0];

      // 임시 상태 설정 (complete 이벤트 전에 미리 UI 업데이트)
      setIsLoadingComplete(true);
      const tempSummaryData = {
        productCount: displayCount,  // DB의 product_count 사용
        reviewCount: localProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0),
        topBrands: [...new Set(localProducts.map((p: any) => p.brand).filter(Boolean))].slice(0, 5) as string[],
        trends: trendData?.trends || [],
        sources: trendData?.sources || [],
      };
      setAnalysisSummary(tempSummaryData);
      setWebSearchContext({
        marketSummary: { topBrands: tempSummaryData.topBrands, reviewCount: tempSummaryData.reviewCount },
        trendAnalysis: trendData,
      });
      setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
        ...m,
        analysisData: { steps: [...localSteps], crawledProducts: localProducts, generatedQuestions, isComplete: true, summary: tempSummaryData }
      } : m));
      setQuestionTodos(questionTodosFromQuestions);
      setCurrentQuestion(firstQuestion);
      setProgress({ current: 1, total: questionTodosFromQuestions.length });
      setCrawledProducts(localProducts);

      // ✅ avoid_negatives 질문 처리: 동적 옵션 vs 정적 옵션
      const avoidNegativesQuestion = questionTodosFromQuestions.find(
        (q: any) => q.id === 'avoid_negatives'
      );
      if (avoidNegativesQuestion?.dynamicOptions) {
        // 동적 옵션 필요 - 런타임에 API 호출로 생성
        setNeedsDynamicNegativeOptions(true);
        needsDynamicNegativeOptionsRef.current = true; // ref도 업데이트 (클로저 문제 해결)
        console.log('[V2 Flow] avoid_negatives requires dynamic options generation');
      } else if (avoidNegativesQuestion?.options && avoidNegativesQuestion.options.length > 0) {
        // 정적 옵션 - 바로 설정 (폴백 또는 이전 버전 호환)
        const negativeOpts: NegativeOption[] = avoidNegativesQuestion.options.map((opt: any, idx: number) => ({
          id: `neg_${idx}`,
          label: opt.label || opt.value || opt,
          target_rule_key: opt.value || opt.label || `neg_key_${idx}`,
        }));
        setNegativeOptions(negativeOpts);
        console.log('[V2 Flow] negativeOptions set from avoid_negatives question:', negativeOpts.length);
      }

      // V2 Flow: 질문 응답 중 백그라운드에서 확장 크롤링 시작
      if (v2FlowEnabled) {
        startBackgroundExpandCrawl(localProducts);
      }

      // 첫 질문은 분석 요약 카드로 접힌 후 표시 (onSummaryShow 콜백에서 처리)
      if (firstQuestion) {
        pendingFirstQuestionRef.current = {
          question: firstQuestion,
          total: questionTodosFromQuestions.length
        };
        // handleAnalysisSummaryShow 콜백이 호출되면 첫 질문이 표시됨
      }

      // 백그라운드에서 complete 이벤트 데이터 업데이트 (리뷰 크롤링 완료 후)
      stepPromises['complete'].then((completeData: any) => {
        console.log('[SSE] Complete event received in background');
        const finalProducts = completeData?.products || localProducts;
        
        // ✅ 디버그: danawaRank 값 확인
        console.log('[SSE] finalProducts danawaRank 샘플:', finalProducts.slice(0, 3).map((p: any) => ({ pcode: p.pcode, danawaRank: p.danawaRank })));
        
        const updatedSummary = {
          productCount: displayCount,  // DB의 product_count 유지
          reviewCount: completeData.marketSummary?.reviewCount || tempSummaryData.reviewCount,
          topBrands: completeData.marketSummary?.topBrands || tempSummaryData.topBrands,
          trends: completeData.trendAnalysis?.trends || tempSummaryData.trends,
          sources: completeData.trendAnalysis?.sources || tempSummaryData.sources,
        };
        setAnalysisSummary(updatedSummary);
        setWebSearchContext({
          marketSummary: completeData.marketSummary,
          trendAnalysis: completeData.trendAnalysis,
        });
        setCrawledProducts(finalProducts);
      }).catch((e: any) => console.error('[SSE] Complete event error:', e));
    };

    // phase는 'loading' 상태 유지 (첫 질문 렌더링 시점에 'questions'로 변경)

    const analysisMsg: ChatMessage = {
      id: 'analysis-progress',
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      analysisData: {
        steps: localSteps,
        crawledProducts: [],
        isComplete: false,
      }
    };
    setMessages([analysisMsg]);

    // 초기 활성화 및 UI 드라이버 시작
    localSteps = localSteps.map(s => s.id === 'product_analysis' ? { ...s, status: 'active' as const, startTime: Date.now() } : s);
    setAnalysisSteps([...localSteps]);
    driveUIFlow();

    try {
      const response = await fetch('/api/knowledge-agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryKey, streaming: true })
      });

      if (!response.ok) throw new Error('API request failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = ''; // while 바깥에서 선언 (청크 간 이벤트 유지)

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'products':
                  if (data.batch && data.batch.length > 0) {
                    localProducts = [...localProducts, ...data.batch];
                    setCrawledProducts([...localProducts]);
                    setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
                      ...m,
                      analysisData: { steps: [...localSteps], crawledProducts: [...localProducts], isComplete: false }
                    } : m));
                  }
                  if (data.isComplete) {
                    console.log('[SSE] Products complete. Total:', localProducts.length);
                    stepDataResolvers['product_analysis']?.(data);
                  }
                  break;
                case 'filters':
                  localSteps = localSteps.map(s => s.id === 'product_analysis' ? {
                    ...s,
                    result: {
                      ...s.result,
                      filters: data.filters,
                      filterCount: data.totalCount,
                    },
                  } : s);
                  setAnalysisSteps([...localSteps]);
                  setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
                    ...m,
                    analysisData: { steps: [...localSteps], crawledProducts: localProducts, isComplete: false }
                  } : m));
                  stepDataResolvers['filters']?.(data);
                  break;
                case 'web_search_progress':
                  // 웹검색 진행 상황 실시간 업데이트
                  if (data.type === 'query_start') {
                    setWebSearchProgress(prev => ({
                      ...prev,
                      currentQuery: data.queryText,
                    }));
                  } else if (data.type === 'query_done') {
                    setWebSearchProgress(prev => ({
                      ...prev,
                      completedQueries: [...prev.completedQueries, data.queryName],
                      results: { ...prev.results, ...data.result },
                    }));
                  } else if (data.type === 'all_done') {
                    setWebSearchProgress(prev => ({
                      ...prev,
                      currentQuery: undefined,
                      results: data.result || prev.results,
                    }));
                  }
                  break;
                case 'trend':
                  trendData = data.trendAnalysis;
                  // 트렌드 단점 키워드 저장 (동적 negative options 생성에 사용)
                  if (data.trendAnalysis?.cons && Array.isArray(data.trendAnalysis.cons)) {
                    setTrendCons(data.trendAnalysis.cons);
                    trendConsRef.current = data.trendAnalysis.cons; // ref도 업데이트 (클로저 문제 해결)
                  }
                  stepDataResolvers['web_search']?.(data);
                  break;
                case 'first_batch_complete':
                  // 10개 상품 도착 시 '실시간 인기상품 분석' 토글 완료
                  console.log(`[SSE] First batch complete: ${data.count} products`);
                  // 🆕 DB의 product_count 저장 (하드컷 시각화, 최종 추천 타임라인에서 사용)
                  if (data.count) {
                    setDbProductCount(data.count);
                  }
                  stepDataResolvers['product_analysis']?.(data);
                  break;
                case 'reviews_start':
                  // 리뷰 크롤링 시작
                  console.log(`[SSE] Reviews crawling started: ${data.productCount} products`);
                  break;
                case 'reviews_progress':
                  // 리뷰 크롤링 진행
                  console.log(`[SSE] Reviews progress: ${data.completed}/${data.total} (${data.reviewCount} reviews)`);
                  break;
                case 'reviews_complete':
                  // 리뷰 크롤링 완료
                  console.log(`[SSE] Reviews complete: ${data.productCount} products, ${data.totalReviews} reviews`);
                  break;
                case 'review_analysis_start':
                  // 리뷰 분석 시작 - 샘플 리뷰 로깅
                  console.log(`[SSE] Review analysis started with samples:`);
                  if (data.positiveSamples?.length) {
                    console.log(`  ✅ 긍정 샘플: ${data.positiveSamples.map((s: any) => `[${s.rating}점] ${s.preview}`).join(' | ')}`);
                  }
                  if (data.negativeSamples?.length) {
                    console.log(`  ❌ 부정 샘플: ${data.negativeSamples.map((s: any) => `[${s.rating}점] ${s.preview}`).join(' | ')}`);
                  }
                  // review_extraction 단계 업데이트 (샘플 리뷰 표시)
                  localSteps = localSteps.map(s => s.id === 'review_extraction' ? {
                    ...s,
                    status: 'active' as const,
                    result: {
                      ...s.result,
                      positiveSamples: data.positiveSamples,
                      negativeSamples: data.negativeSamples,
                    },
                  } : s);
                  setAnalysisSteps([...localSteps]);
                  break;
                case 'review_analysis_complete':
                  // 리뷰 분석 완료
                  console.log(`[SSE] Review analysis complete: ${data.analyzedCount} reviews analyzed`);
                  console.log(`  ✅ 긍정: ${data.positiveKeywords?.join(', ')}`);
                  console.log(`  ❌ 부정: ${data.negativeKeywords?.join(', ')}`);
                  console.log(`  💡 고려사항: ${data.commonConcerns?.join(', ')}`);
                  // review_extraction 단계 완료 업데이트 (status: done 추가)
                  localSteps = localSteps.map(s => s.id === 'review_extraction' ? {
                    ...s,
                    status: 'done' as const,
                    endTime: Date.now(),
                    result: {
                      ...s.result,
                      prosTags: data.prosTags,
                      consTags: data.consTags,
                      analyzedCount: data.analyzedCount,
                      // 추가: 전체 분석 결과
                      positiveKeywords: data.positiveKeywords,
                      negativeKeywords: data.negativeKeywords,
                      commonConcerns: data.commonConcerns,
                    },
                  } : s);
                  setAnalysisSteps([...localSteps]);
                  stepDataResolvers['review_extraction']?.(data);
                  break;
                case 'questions':
                  // 리뷰 추출 데이터와 질문 데이터를 버퍼링
                  stepDataResolvers['review_extraction']?.(data);
                  stepDataResolvers['question_generation']?.(data);
                  break;
                case 'complete':
                  // 리뷰 데이터를 reviewsData 상태에 저장 (init API에서 미리 크롤링)
                  if (data.reviews) {
                    const formattedReviews: Record<string, any[]> = {};
                    Object.entries(data.reviews).forEach(([pcode, reviewData]: [string, any]) => {
                      formattedReviews[pcode] = reviewData.reviews || [];
                    });
                    setReviewsData(formattedReviews);
                    console.log(`[SSE] Reviews stored: ${Object.keys(formattedReviews).length} products`);
                  }
                  stepDataResolvers['complete']?.(data);
                  break;
              }
              currentEvent = '';
            } catch (e) { }
          }
        }
      }
    } catch (e) {
      setPhase('free_chat');
    }
  };

  // ============================================================================
  // Message Handlers
  // ============================================================================

  const handleOptionToggle = (option: string, messageId: string) => {
    setMessages(prev => {
      const activeMsgForLog = prev.find(m => m.id === messageId);
      const isSelectedForLog = activeMsgForLog?.selectedOptions?.includes(option);

      const newMessages = prev.map(m => {
        if (m.id === messageId) {
          const currentSelected = m.selectedOptions || [];
          const isSelected = currentSelected.includes(option);
          const updatedSelected = isSelected
            ? currentSelected.filter(o => o !== option)
            : [...currentSelected, option];

          // 로깅 추가
          logKnowledgeAgentHardFilterSelection(
            categoryKey,
            categoryName,
            messageId,
            m.content,
            option,
            true,
            updatedSelected.length
          );

          return {
            ...m,
            selectedOptions: updatedSelected
          };
        }
        return m;
      });

      // 현재 수정된 메시지의 선택 옵션들로 입력창 업데이트
      const activeMsg = newMessages.find(m => m.id === messageId);
      if (activeMsg && activeMsg.selectedOptions) {
        const text = activeMsg.selectedOptions.join(', ');
        setInputValue(text);
        if (text) {
          setBarAnimationKey(prev => prev + 1);
          setIsHighlighting(true);
        }
      }

      return newMessages;
    });
  };

  const handlePrevStep = () => {
    import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
      logButtonClick('knowledge-agent-prev-step', '이전');
    });

    // 1. 현재 삭제될 질문의 ID와 이전 질문 정보를 먼저 추출
    const lastQuestionMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.options);
    if (!lastQuestionMsg) return;

    // 메시지 ID에서 질문 ID 추출 (q_budget → budget)
    const deletedQuestionId = lastQuestionMsg.id?.startsWith('q_') 
      ? lastQuestionMsg.id.slice(2) 
      : lastQuestionMsg.id;

    // 이전 질문 ID도 미리 추출 (메시지 배열에서)
    const allQuestionMsgs = messages.filter(m => m.role === 'assistant' && m.options);
    const lastIdx = allQuestionMsgs.findIndex(m => m.id === lastQuestionMsg.id);
    const prevQuestionMsg = lastIdx > 0 ? allQuestionMsgs[lastIdx - 1] : null;
    const prevQuestionId = prevQuestionMsg?.id?.startsWith('q_') 
      ? prevQuestionMsg.id.slice(2) 
      : prevQuestionMsg?.id;

    // 2. 메시지 배열 업데이트
    setMessages(prev => {
      const newMessages = [...prev];
      const lastQuestionIdx = [...newMessages].reverse().findIndex(m => m.role === 'assistant' && m.options);
      if (lastQuestionIdx === -1) return prev;

      const actualIdx = newMessages.length - 1 - lastQuestionIdx;

      // 현재 질문(assistant)과 그 바로 앞의 사용자 답변(user)을 모두 제거
      let cutIndex = actualIdx;
      if (actualIdx > 0 && newMessages[actualIdx - 1].role === 'user') {
        cutIndex = actualIdx - 1;
      }

      const trimmed = newMessages.slice(0, cutIndex);

      // 이전 질문을 찾아 활성화 상태로 되돌림
      const prevQuestionIdx = [...trimmed].reverse().findIndex(m => m.role === 'assistant' && m.options);
      if (prevQuestionIdx !== -1) {
        const actualPrevIdx = trimmed.length - 1 - prevQuestionIdx;
        trimmed[actualPrevIdx] = {
          ...trimmed[actualPrevIdx],
          isFinalized: false,
          selectedOptions: [] // 선택했던 옵션도 초기화
        };
      }

      return trimmed;
    });

    // 3. questionTodos 상태 롤백 - 삭제된 질문과 이전 질문 둘 다 미완료로 되돌림
    setQuestionTodos(prev => prev.map(q => {
      if (q.id === deletedQuestionId || q.id === prevQuestionId) {
        return { ...q, completed: false, answer: undefined };
      }
      return q;
    }));

    // 4. collectedInfo에서 삭제된 질문과 이전 질문의 답변 모두 제거
    setCollectedInfo(prev => {
      const updated = { ...prev };
      // 삭제된 질문의 답변 제거
      const deletedQuestion = questionTodos.find(q => q.id === deletedQuestionId);
      if (deletedQuestion) {
        delete updated[deletedQuestion.question];
      }
      // 이전 질문의 답변도 제거 (selectedOptions가 []로 초기화되므로)
      const prevQuestion = questionTodos.find(q => q.id === prevQuestionId);
      if (prevQuestion) {
        delete updated[prevQuestion.question];
      }
      return updated;
    });

    // 5. currentQuestion을 이전 질문으로 설정
    const prevQuestion = questionTodos.find(q => q.id === prevQuestionId);
    if (prevQuestion) {
      setCurrentQuestion({ ...prevQuestion, completed: false, answer: undefined });
    } else if (questionTodos.length > 0) {
      // 이전 질문이 없으면 첫 번째 질문으로 설정
      setCurrentQuestion({ ...questionTodos[0], completed: false, answer: undefined });
    }

    // 6. 단점 필터 관련 상태 초기화 (avoid_negatives 질문이 삭제되거나 활성화될 경우)
    const isNegativeQuestion = (id?: string) => 
      id === 'avoid_negatives' || id?.includes('negative');
    
    if (isNegativeQuestion(deletedQuestionId) || isNegativeQuestion(prevQuestionId)) {
      setSelectedNegativeKeys([]);
      setSavedNegativeLabels([]);
    }

    // 메시지 삭제 후 약간의 지연을 주어 스크롤이 자연스럽게 위로 올라가도록 함
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  // ============================================================================
  // V2 Flow: 확장 크롤링 + 하드컷팅 + 리뷰 병렬 크롤링
  // ============================================================================

  /**
   * 백그라운드 확장 크롤링 - 제거됨 (새 아키텍처)
   * - init API에서 120개 + 리뷰를 한 번에 크롤링하므로 더 이상 필요 없음
   */
  const startBackgroundExpandCrawl = async (_initialProducts: any[]) => {
    // 새 아키텍처: init API에서 이미 120개 + 리뷰 10개씩 크롤링 완료
    // 확장 크롤링 불필요
    console.log('[V2 Flow] Background expand crawl skipped (new architecture - init crawls 120 products)');
    setIsExpandComplete(true);
  };

  /**
   * V2 플로우 시작 (질문 완료 후)
   * - 새 아키텍처: hard-cut 제거, LLM이 전체 후보에서 직접 top 3 선택
   * - 사용자 선택 조건을 시각화하여 표시
   */
  const startV2Flow = async () => {
    if (!v2FlowEnabled) return;

    console.log('[V2 Flow] Starting (new architecture - no hard-cut)...');
    setIsTyping(true);

    try {
      const allProducts = crawledProducts;
      console.log(`[V2 Flow] Using ${allProducts.length} products with ${Object.keys(reviewsData).length} reviews`);

      // 사용자가 선택한 조건들을 규칙 형태로 변환
      const appliedRules: Array<{ rule: string; matchedCount: number }> = [];

      // 질문 텍스트와 답변을 조합하여 의미 있는 조건 문구 생성
      const formatCondition = (question: string, answer: string): string => {
        const q = question.toLowerCase();
        const a = answer;

        // 예산 관련
        if (q.includes('예산') || q.includes('가격')) {
          return `예산 ${a}`;
        }
        // 월령/나이 관련
        if (q.includes('월령') || q.includes('개월') || q.includes('나이')) {
          return `${a} 아기용`;
        }
        // 용도/목적 관련
        if (q.includes('용도') || q.includes('목적') || q.includes('사용')) {
          return `${a} 용도`;
        }
        // 타입/종류/형태 관련
        if (q.includes('타입') || q.includes('종류') || q.includes('형태') || q.includes('방식')) {
          return `${a} 타입`;
        }
        // 사이즈/크기 관련
        if (q.includes('사이즈') || q.includes('크기') || q.includes('용량')) {
          return `${a} 사이즈`;
        }
        // 브랜드 관련
        if (q.includes('브랜드')) {
          return `${a} 브랜드 선호`;
        }
        // 편의성/기능 관련 (있으면 좋음 등의 답변)
        if (a === '있으면 좋음' || a === '필수' || a === '중요') {
          // 질문에서 핵심 키워드 추출
          const keywords = question.match(/[가-힣]+\s*(편의|기능|성능|안전|세척|청소|휴대|소음|디자인)/);
          if (keywords) {
            return `${keywords[0]} ${a === '필수' ? '필수' : '중요'}`;
          }
          // 질문의 핵심 부분 추출 (첫 10자 정도)
          const core = question.replace(/[?？어떠세요어떤가요원하시나요]*/g, '').trim().slice(0, 15);
          return `${core} 중요`;
        }
        // 기본: 답변이 충분히 설명적이면 그대로, 아니면 질문 요약 + 답변
        if (a.length > 5) {
          return a;
        }
        // 질문에서 핵심 키워드 추출
        const questionCore = question.replace(/[?？은는이가을를에서로]*/g, '').trim().slice(0, 10);
        return `${questionCore}: ${a}`;
      };

      // 1. 질문에서 선택한 조건들 추가
      Object.entries(collectedInfo).forEach(([question, answer]) => {
        // 내부 키나 건너뛰기 옵션 제외
        if (question.startsWith('__') || answer === '상관없어요' || answer === 'skip') return;

        const answerStr = Array.isArray(answer) ? answer.join(', ') : String(answer);
        if (answerStr && answerStr.length < 100) {
          const formattedRule = formatCondition(question, answerStr);
          appliedRules.push({
            rule: formattedRule,
            matchedCount: Math.floor(allProducts.length * (0.3 + Math.random() * 0.4)),
          });
        }
      });

      // 2. 피하고 싶은 단점들 추가 - selectedNegativeKeys에서 negativeOptions를 사용하여 레이블로 변환
      const avoidNegativeLabels = selectedNegativeKeys
        .map(key => negativeOptions.find(opt => opt.target_rule_key === key)?.label)
        .filter((label): label is string => !!label);
      if (avoidNegativeLabels.length > 0) {
        avoidNegativeLabels.forEach((neg: string) => {
          appliedRules.push({
            rule: `❌ "${neg}" 제외`,
            matchedCount: Math.floor(allProducts.length * 0.1 + Math.random() * 10),
          });
        });
      }

      // 3. 리뷰 분석 완료 표시
      appliedRules.push({
        rule: `📊 ${Object.keys(reviewsData).length}개 상품 리뷰 분석 완료`,
        matchedCount: Object.keys(reviewsData).length,
      });

      // 🆕 DB의 product_count 사용 (없으면 실제 상품 수 fallback)
      const displayCount = dbProductCount || allProducts.length;

      // ✅ 기존 state 대신 메시지로 추가하여 순서 및 스타일 제어
      setMessages(prev => [
        ...prev,
        {
          id: 'hardcut-visual',
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          hardcutData: {
            totalBefore: displayCount,
            totalAfter: displayCount,
            appliedRules,
            filteredProducts: allProducts.slice(0, 20).map(p => ({
              pcode: p.pcode,
              name: p.name,
              brand: p.brand || '',
              price: p.price || 0,
              thumbnail: p.thumbnail,
              matchScore: 0,
              matchedConditions: [],
            }))
          }
        }
      ]);
      setHardcutResult({
        totalBefore: displayCount,
        totalAfter: displayCount,
        appliedRules,
      });
      setIsHardcutVisualDone(false);
      setPhase('hardcut_visual');
      // 자동 스크롤은 phase 변경 시 useEffect에서 처리됨

      // 🆕 꼬리질문 생성 (백그라운드)
      generateFollowUpQuestions(allProducts);

    } catch (error) {
      console.error('[V2 Flow] Error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * 꼬리질문 생성 (백그라운드)
   * - 맞춤 질문 완료 후 사용자 응답 + 상품 데이터 기반으로 추가 질문 생성
   */
  const generateFollowUpQuestions = async (products: any[]) => {
    if (products.length === 0) return;

    console.log('[V2 Flow] Generating follow-up questions...');
    setIsGeneratingFollowUp(true);
    setFollowUpQuestions([]); // 초기화

    // ⏱️ 최소 로딩 시간 보장 (2초 ±10% 랜덤)
    const startTime = Date.now();
    const minLoadingTime = 2000 + (Math.random() * 400 - 200); // 1800ms ~ 2200ms

    // 🆕 핵심 구매 고려사항만 전달 (가장 효과적)
    const buyingFactors = webSearchProgress.results?.buyingFactors || [];
    console.log('[V2 Flow] Follow-up buyingFactors:', buyingFactors.join(', ') || '(없음)');

    try {
      const res = await fetch('/api/knowledge-agent/generate-follow-up-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          collectedInfo,
          products,
          reviews: reviewsData,
          trendData: {
            items: trendCons,
            pros: [],
            cons: trendCons,
            priceInsight: '',
          },
          buyingFactors,  // 🆕 핵심 구매 고려사항
        }),
      });

      const data = await res.json();

      if (data.success && data.hasFollowUpQuestions) {
        setFollowUpQuestions(data.followUpQuestions);
        console.log(`[V2 Flow] Generated ${data.followUpQuestions.length} follow-up questions`);
      } else {
        console.log(`[V2 Flow] No follow-up questions needed: ${data.skipReason || 'unknown'}`);
      }
    } catch (error) {
      console.error('[V2 Flow] Follow-up questions error:', error);
    } finally {
      // ⏱️ 최소 로딩 시간 보장
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsed);

      if (remainingTime > 0) {
        console.log(`[V2 Flow] Waiting ${Math.round(remainingTime)}ms to ensure minimum loading time`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      setIsGeneratingFollowUp(false);

      // 🔧 임시: 로딩 메시지 제거 비활성화 (계속 표시)
      // setMessages(prev => prev.filter(m => m.questionId !== 'followup_loading'));
    }
  };

  /**
   * 꼬리질문 생성 완료 시 안내 메시지 추가 + 로딩 메시지 제거
   */
  const prevIsGeneratingFollowUp = useRef(false);

  useEffect(() => {
    // 생성 완료 시점 감지 (true → false 전환)
    if (prevIsGeneratingFollowUp.current && !isGeneratingFollowUp) {
      const guideMsgId = `a_followup_guide_${Date.now()}`;

      // 추가질문이 있는 경우: 안내 메시지 + 바로 첫 번째 질문 표시
      if (followUpQuestions.length > 0) {
        setCurrentFollowUpIndex(0);
        setPhase('questions');

        const firstQ = followUpQuestions[0];
        const questionContent = firstQ.question;

        setMessages(prev => {
          if (prev.some(m => m.id.startsWith('a_followup_guide_'))) return prev;

          return [
            ...prev.filter(m => m.questionId !== 'followup_loading'),
            {
              id: guideMsgId,
              role: 'assistant',
              questionId: 'followup_guide',
              content: `더욱 정확한 추천을 위해 추가 질문을 생성했어요.`,
              typing: true,
              timestamp: Date.now()
            },
            {
              id: `followup-q-0`,
              role: 'assistant',
              content: questionContent,
              options: firstQ.options.map(o => o.label),
              questionProgress: { current: 1, total: followUpQuestions.length },
              typing: true,
              timestamp: Date.now() + 1,
            }
          ];
        });
      } else {
        // 추가질문이 없는 경우: 안내 메시지만
        setMessages(prev => {
          if (prev.some(m => m.id.startsWith('a_followup_guide_'))) return prev;

          return [
            ...prev.filter(m => m.questionId !== 'followup_loading'),
            {
              id: guideMsgId,
              role: 'assistant',
              questionId: 'followup_guide',
              content: `충분한 정보를 수집해서 추가 질문이 필요 없어요! **최종 추천 결과 보기**를 눌러서 바로 결과를 확인해보세요.`,
              typing: true,
              timestamp: Date.now()
            }
          ];
        });
      }
    }
    prevIsGeneratingFollowUp.current = isGeneratingFollowUp;
  }, [isGeneratingFollowUp, followUpQuestions]);

  /**
   * 꼬리질문 답변 처리
   */
  const handleFollowUpAnswer = (answer: string, questionId?: string) => {
    const currentQ = followUpQuestions[currentFollowUpIndex];
    if (!currentQ) return;

    console.log(`[Follow-up] Answer: ${currentQ.question} -> ${answer}`);

    // collectedInfo에 추가 (기존 응답과 병합)
    setCollectedInfo(prev => ({
      ...prev,
      [currentQ.question]: answer,
    }));

    // 메시지 상태 업데이트: 현재 질문 메시지를 finalized로 만들고 선택된 옵션 기록
    setMessages(prev => prev.map(m => 
      m.id === `followup-q-${currentFollowUpIndex}` 
        ? { ...m, isFinalized: true, selectedOptions: [answer] } 
        : m
    ));

    // 사용자 답변 메시지 추가
    setMessages(prev => [
      ...prev,
      {
        id: `followup-a-${currentFollowUpIndex}-${Date.now()}`,
        role: 'user',
        content: answer,
        timestamp: Date.now(),
      },
    ]);

    // 다음 질문으로 이동 또는 완료
    if (currentFollowUpIndex < followUpQuestions.length - 1) {
      const nextIndex = currentFollowUpIndex + 1;
      setCurrentFollowUpIndex(nextIndex);
      
      // 다음 질문 메시지 추가
      const nextQ = followUpQuestions[nextIndex];
      const questionContent = nextQ.question;
      setMessages(prev => [
        ...prev,
        {
          id: `followup-q-${nextIndex}`,
          role: 'assistant',
          content: questionContent,
          options: nextQ.options.map(o => o.label),
          questionProgress: { current: nextIndex + 1, total: followUpQuestions.length },
          typing: true,
          timestamp: Date.now(),
        }
      ]);
    } else {
      // 모든 꼬리질문 완료 → 최종 추천으로
      console.log('[Follow-up] All questions answered, proceeding to final recommend');
      setPhase('hardcut_visual');
      // 약간의 딜레이 후 최종 추천 실행 (UI 업데이트 대기)
      setTimeout(() => {
        handleFinalInputSubmit();
      }, 100);
    }
  };

  /**
   * 리뷰 크롤링 (백그라운드)
   */
  const startReviewCrawling = async (pcodes: string[]) => {
    if (pcodes.length === 0) return;

    console.log(`[V2 Flow] Starting review crawl for ${pcodes.length} products...`);
    setIsReviewsLoading(true);

    try {
      const reviewRes = await fetch('/api/knowledge-agent/crawl-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pcodes, maxPerProduct: 5 }),
      });

      // SSE 스트리밍 처리 (이벤트 타입별로 파싱)
      const reader = reviewRes.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = ''; // while 바깥에서 선언 (청크 간 이벤트 유지)

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 마지막 불완전한 라인은 버퍼에 유지

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'progress') {
                  console.log(`[V2 Flow] Review progress: ${data.completed}/${data.total} - ${data.pcode}`);
                } else if (currentEvent === 'complete' && data.reviews) {
                  setReviewsData(data.reviews);
                  console.log(`[V2 Flow] Reviews complete: ${Object.keys(data.reviews).length} products, ${data.totalReviews} total reviews`);
                } else if (currentEvent === 'error') {
                  console.error('[V2 Flow] Review crawl server error:', data.message);
                }
              } catch { }
              currentEvent = '';
            }
          }
        }
      }
    } catch (error) {
      console.error('[V2 Flow] Review crawl error:', error);
    } finally {
      setIsReviewsLoading(false);
    }
  };

  /**
   * Top3 확정 즉시 가격 정보 병렬 프리페치
   * - 리뷰 크롤링과 별도로 빠르게 가격만 가져옴
   * - PDP 열기 전에 미리 캐싱하여 즉시 표시
   */
  const fetchPricesForTop3 = async (pcodes: string[]) => {
    if (pcodes.length === 0) return;

    console.log(`[V2 Flow] 💰 Top3 가격 프리페치 시작: ${pcodes.join(', ')}`);

    // 병렬로 모든 가격 정보 가져오기
    const pricePromises = pcodes.map(async (pcode) => {
      // 이미 캐시된 경우 스킵
      if (pricesData[pcode]?.lowestPrice) {
        console.log(`[V2 Flow] 💰 ${pcode} 이미 캐시됨`);
        return null;
      }

      try {
        const res = await fetch(`/api/knowledge-agent/prices?pcode=${pcode}`);
        const data = await res.json();

        if (data.success) {
          console.log(`[V2 Flow] 💰 ${pcode} 가격 로드 완료: ${data.lowestPrice?.toLocaleString()}원`);
          return {
            pcode,
            lowestPrice: data.lowestPrice,
            lowestMall: data.lowestMall,
            lowestDelivery: data.lowestDelivery,
            lowestLink: data.lowestLink || null,
            prices: data.mallPrices || [],
          };
        }
      } catch (error) {
        console.error(`[V2 Flow] 💰 ${pcode} 가격 로드 실패:`, error);
      }
      return null;
    });

    const results = await Promise.all(pricePromises);

    // 성공한 결과들을 pricesData에 병합
    const newPrices: Record<string, any> = {};
    results.forEach((result) => {
      if (result) {
        newPrices[result.pcode] = result;
      }
    });

    if (Object.keys(newPrices).length > 0) {
      setPricesData(prev => ({ ...prev, ...newPrices }));
      console.log(`[V2 Flow] 💰 가격 캐시 업데이트: ${Object.keys(newPrices).length}개 상품`);
    }
  };

  /**
   * V2 최종 추천 생성 (새 아키텍처: 120개 전체 + 리뷰 기반)
   * - hard-cut 제거: LLM이 120개 전체에서 직접 top 3 선택
   * - 리뷰는 init API에서 미리 크롤링된 데이터 사용
   * @param collectedInfoOverride - 비동기 setState 문제 해결용: 업데이트된 collectedInfo 직접 전달
   */
  const handleV2FinalRecommend = async (
    balanceSelections: any[],
    collectedInfoOverride?: Record<string, string>
  ) => {
    // 새 아키텍처: hardCutProducts 대신 crawledProducts (120개 전체) 사용
    const candidates = crawledProducts.length > 0 ? crawledProducts : hardCutProducts;
    if (!v2FlowEnabled || candidates.length === 0) return null;

    // collectedInfoOverride가 있으면 우선 사용 (비동기 setState 문제 해결)
    const finalCollectedInfo = collectedInfoOverride || collectedInfo;

    console.log(`[V2 Flow] Generating final recommendations from ${candidates.length} candidates with ${Object.keys(reviewsData).length} products' reviews...`);
    console.log(`[V2 Flow] collectedInfo keys:`, Object.keys(finalCollectedInfo));
    if (finalCollectedInfo['__additional_condition__']) {
      console.log(`[V2 Flow] __additional_condition__:`, finalCollectedInfo['__additional_condition__']);
    }

    try {
      const res = await fetch('/api/knowledge-agent/final-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          candidates: candidates, // 120개 전체 (hard-cut 제거)
          reviews: reviewsData,   // init API에서 미리 크롤링된 리뷰 사용
          collectedInfo: finalCollectedInfo,
          balanceSelections,
          negativeSelections: [], // 회피조건 제거
        }),
      });

      const data = await res.json();
      if (data.success) {
        console.log(`[V2 Flow] Final recommendations: ${data.recommendations.length}`);

        // 🆕 리뷰 데이터 즉시 저장 (crawl-reviews 중복 호출 방지)
        if (data.reviews) {
          setReviewsData(data.reviews);
          const totalReviews = Object.values(data.reviews).reduce((sum: number, reviews: any) => sum + (reviews?.length || 0), 0);
          console.log(`[V2 Flow] Reviews saved from final-recommend: ${Object.keys(data.reviews).length}개 제품, ${totalReviews}개 리뷰`);
        }

        // ✅ 추가: 자유 입력 분석 결과 저장 (PDP 선호/회피 조건 표시용)
        if (data.freeInputAnalysis) {
          setFreeInputAnalysis(data.freeInputAnalysis);
          console.log(`[V2 Flow] freeInputAnalysis saved:`, data.freeInputAnalysis);
        }

        // 🆕 필터 태그 저장 (상품에 매칭되는 태그만)
        if (data.filterTags && Array.isArray(data.filterTags)) {
          // 5개 상품 중 하나라도 full/partial인 태그만 남김
          const matchedTags = data.filterTags.filter((tag: FilterTag) => {
            return data.recommendations.some((rec: any) => {
              const tagScores = rec.tagScores || {};
              const scoreData = tagScores[tag.id];
              return scoreData?.score === 'full' || scoreData?.score === 'partial';
            });
          });

          setFilterTags(matchedTags);
          setSelectedFilterTagIds(new Set()); // 초기화 (모두 선택 해제 = 전체 보기)
          console.log(`[V2 Flow] filterTags saved: ${matchedTags.length}개 (원본 ${data.filterTags.length}개)`);
        }

        // Top N pcode 추출 (5개)
        const allTopNPcodes = data.recommendations
          .slice(0, 5)
          .map((r: any) => r.pcode)
          .filter(Boolean);

        // ⚡ Top N 확정 즉시 가격 프리페치 (백그라운드, 리뷰 크롤링보다 빠름)
        if (allTopNPcodes.length > 0) {
          console.log(`[V2 Flow] 💰 가격 프리페치 시작: ${allTopNPcodes.join(', ')}`);
          fetchPricesForTop3(allTopNPcodes); // await 없이 백그라운드 실행
        }

        // ✅ 리뷰 크롤링은 handleNegativeFilterComplete에서 50개로 통합 처리
        // (중복 크롤링 제거)

        return data.recommendations;
      }
    } catch (error) {
      console.error('[V2 Flow] Final recommend error:', error);
    }

    return null;
  };

  /**
   * 하드컷팅 시각화에서 '계속' 클릭 시 자연어 입력 단계로 전환
   * - 마지막으로 추가하고 싶은 조건 입력받기
   */
  const handleHardcutContinue = async () => {
    logKALoadingPhaseCompleted(categoryKey, 'hardcut_visual');

    // 상세 로깅 추가
    if (hardcutResult) {
      logKnowledgeAgentHardcutContinue(
        categoryKey,
        categoryName,
        hardcutResult.totalBefore,
        hardcutResult.totalAfter,
        hardcutResult.appliedRules.map(r => r.rule)
      );
    }

    console.log('[V2 Flow] Moving to final input phase');
    setPhase('final_input');
    // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
  };

  // 자연어 입력 후 최종 추천으로 진행
  const handleFinalInputSubmit = async (additionalCondition?: string) => {
    // 회피조건 추출 제거
    const avoidNegatives: string[] = [];

    // 사용자 선택 조건 수 계산 (__로 시작하는 내부 키 제외)
    const userSelectionCount = Object.keys(collectedInfo).filter(k => !k.startsWith('__')).length;

    if (additionalCondition && additionalCondition.trim()) {
      // 상세 로깅 추가
      if (categoryKey) {
        logKAQuestionAnswered(categoryKey, '마지막 자연어 입력', additionalCondition.trim());
      }
      logKnowledgeAgentFinalInputSubmit(
        categoryKey,
        categoryName,
        additionalCondition.trim(),
        userSelectionCount,
        0
      );
    } else {
      logKAQuestionSkipped(categoryKey, '마지막 자연어 입력');
      // 상세 로깅 추가
      logKnowledgeAgentFinalInputSubmit(
        categoryKey,
        categoryName,
        '',
        userSelectionCount,
        0
      );
    }

    console.log('[V2 Flow] Final input submitted:', additionalCondition || '(none)');

    // ✅ 수정: updatedInfo를 먼저 생성하여 API에 직접 전달 (비동기 setState 문제 해결)
    const updatedInfo = additionalCondition?.trim()
      ? { ...collectedInfo, __additional_condition__: additionalCondition.trim() }
      : { ...collectedInfo };

    // 추가 조건이 있으면 state도 업데이트 (UI용)
    if (additionalCondition && additionalCondition.trim()) {
      setCollectedInfo(updatedInfo);

      // 사용자 메시지 추가
      setMessages(prev => [...prev, {
        id: `u_final_${Date.now()}`,
        role: 'user',
        content: additionalCondition.trim(),
        timestamp: Date.now()
      }]);
    }

    setIsTyping(true);

    try {
      // 🆕 DB의 product_count 우선 사용
      const candidateCount = dbProductCount || crawledProducts.length || hardCutProducts.length;

      // 타임라인 UX와 실제 추천 생성을 병렬로 실행
      const uxPromise = runFinalTimelineUX(candidateCount, userSelectionCount, 0);
      // ✅ 수정: updatedInfo를 직접 전달하여 비동기 문제 해결
      const apiPromise = handleV2FinalRecommend([], updatedInfo);

      const [v2Recommendations] = await Promise.all([apiPromise, uxPromise]);

      // 이전 프로그레스 애니메이션 취소
      if (progressAnimationCleanupRef.current) {
        progressAnimationCleanupRef.current();
        progressAnimationCleanupRef.current = null;
      }

      // 애니메이션 프레임 한 사이클 대기 (cleanup 완료 보장)
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

      // 🆕 프로그레스 100% 설정 (부드럽게)
      await new Promise<void>((resolve) => {
        const start = Date.now();
        let startProgress = 0;
        const duration = 300; // 300ms에 걸쳐 100%까지

        // 현재 progress 값 캡처 (함수형 setState 사용)
        setLoadingProgress(current => {
          startProgress = current;
          return current;
        });

        const animate = () => {
          const elapsed = Date.now() - start;
          const targetProgress = Math.min(startProgress + ((100 - startProgress) * elapsed / duration), 100);

          setLoadingProgress(prev => {
            // 항상 증가하는 방향으로만 업데이트
            const newProgress = Math.max(prev, Math.round(targetProgress));
            return newProgress;
          });

          if (targetProgress < 100) {
            requestAnimationFrame(animate);
          } else {
            // 최종적으로 정확히 100% 보장
            setLoadingProgress(100);
            resolve();
          }
        };
        requestAnimationFrame(animate);
      });

      if (v2Recommendations && v2Recommendations.length > 0) {
        // ✅ 디버그: API 응답에서 oneLiner 확인
        console.log('[V2 Flow - FinalInput] API Response - oneLiner:',
          v2Recommendations.map((r: any) => ({
            pcode: r.pcode,
            oneLiner: r.oneLiner?.slice(0, 30),
          }))
        );

        // ✅ 먼저 결과 화면 렌더링 (init API의 기존 리뷰 사용)
        // ✅ 디버그: crawledProducts의 danawaRank 확인
        console.log('[V2 Flow - FinalInput] crawledProducts 총:', crawledProducts.length);
        console.log('[V2 Flow - FinalInput] crawledProducts danawaRank 샘플:', crawledProducts.slice(0, 5).map(p => ({ pcode: p.pcode, danawaRank: p.danawaRank })));
        
        const mappedResultProducts = v2Recommendations.map((rec: any) => {
          const pcodeStr = String(rec.pcode);
          const existingReviews = reviewsData[pcodeStr] || [];
          const originalProduct = crawledProducts.find(p => String(p.pcode) === pcodeStr);
          return {
            ...rec.product,
            id: rec.pcode || rec.product?.pcode,
            pcode: rec.pcode || rec.product?.pcode,
            title: rec.product?.name || rec.product?.title,
            reasoning: rec.oneLiner || rec.reason,
            oneLiner: rec.oneLiner || '',
            recommendationReason: rec.oneLiner || rec.reason,
            highlights: rec.highlights,
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            specs: rec.normalizedSpecs || rec.product?.specs || {},
            prosFromReviews: rec.prosFromReviews || rec.highlights || [],
            consFromReviews: rec.consFromReviews || rec.concerns || [],
            reviews: existingReviews,
            danawaRank: rec.danawaRank || rec.product?.danawaRank || originalProduct?.danawaRank || null,
            // Legacy 하이라이트 데이터
            highlightData: rec.highlightData || null,
            // 🆕 태그 충족도 (full/partial/null)
            tagScores: rec.tagScores || {},
            // 🆕 스펙 요약 (PDP 모달용)
            specSummary: rec.product?.specSummary || originalProduct?.specSummary || '',
          };
        });
        setResultProducts(mappedResultProducts);
        setPhase('result');

        // ✅ Top3 추천 결과 로깅
        logKnowledgeAgentRecommendationReceived(
          categoryKey || '',
          categoryName || '',
          mappedResultProducts.map((p: any, idx: number) => ({
            pcode: p.pcode,
            name: p.name || p.title,
            brand: p.brand,
            price: p.price,
            rank: idx + 1,
            score: p.score,
          }))
        );

        const resultMsgId = `a_result_${Date.now()}`;
        setMessages(prev => [...prev, {
          id: resultMsgId,
          role: 'assistant',
          content: '',
          resultProducts: mappedResultProducts,
          typing: true,
          timestamp: Date.now()
        }]);
        // ✅ 결과 화면 맨 위로 스크롤 (모바일에서 중간 스크롤 방지)
        setTimeout(scrollToTop, 100);

        // Product Analysis 비동기 호출 (PDP 모달용) - 정의를 먼저 해야 함
        const fetchProductAnalysisForFinal = async (latestReviews?: Record<string, any[]>) => {
          setIsProductAnalysisLoading(true);
          try {
            console.log('[V2 Flow - FinalInput] Fetching product analysis for PDP...');

            // 🔧 최신 리뷰 데이터 사용 (전달받은 것 또는 상태값)
            const reviewsToUse = latestReviews || reviewsData;

            // collectedInfo에서 선호 조건 추출 (__로 시작하는 내부 키 제외)
            const userPreferences = Object.entries(collectedInfo)
              .filter(([key]) => !key.startsWith('__'))
              .map(([questionId, value]) => {
                // questionTodos에서 해당 질문 찾기
                const question = questionTodos.find((q: QuestionTodo) => q.id === questionId);
                const selectedLabel = Array.isArray(value) ? value.join(', ') : String(value);
                return {
                  questionId,
                  selectedLabel,
                  questionText: question?.question || questionId,
                };
              });

            // 🆕 tagScores를 preEvaluations로 변환 (product-analysis에서 재사용)
            const preEvaluations: Record<string, any> = {};
            v2Recommendations.slice(0, 5).forEach((rec: any) => {
              if (rec.tagScores) {
                preEvaluations[rec.pcode] = rec.tagScores;
              }
            });

            const analysisRes = await fetch('/api/knowledge-agent/product-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                categoryKey,
                categoryName,
                products: v2Recommendations.slice(0, 5).map((rec: any) => ({
                  pcode: rec.pcode,
                  name: rec.product?.name,
                  brand: rec.product?.brand,
                  price: rec.product?.price,
                  specSummary: rec.product?.specSummary,
                  recommendReason: rec.reason,
                  highlights: rec.highlights,
                  concerns: rec.concerns,
                  oneLiner: rec.oneLiner || '',  // 🆕 final-recommend에서 생성된 oneLiner 전달
                  reviews: (reviewsToUse[rec.pcode] || []).slice(0, 30), // 🔧 최신 리뷰 데이터 사용
                })),
                userContext: {
                  collectedInfo,
                  questionTodos: questionTodos.map((q: QuestionTodo) => ({
                    id: q.id,
                    question: q.question,
                  })),
                  balanceSelections: userPreferences,
                  negativeSelections: avoidNegatives,
                  conversationSummary: messages
                    .filter((m: ChatMessage) => m.role === 'assistant' && m.content)
                    .slice(-3)
                    .map((m: ChatMessage) => m.content)
                    .join(' ')
                    .slice(0, 500),
                },
                // 🆕 final-recommend에서 생성된 tagScores 전달 (PDP에서 재사용)
                preEvaluations: Object.keys(preEvaluations).length > 0 ? preEvaluations : undefined,
                filterTags: filterTags.length > 0 ? filterTags : undefined,
              }),
            });

            if (analysisRes.ok) {
              const analysisData = await analysisRes.json();
              if (analysisData.success && analysisData.data?.analyses) {
                const newAnalyses: Record<string, any> = {};
                analysisData.data.analyses.forEach((a: any) => {
                  newAnalyses[String(a.pcode)] = {
                    selectedConditionsEvaluation: a.selectedConditionsEvaluation || [],
                    contextMatch: a.contextMatch,
                    oneLiner: a.oneLiner,
                    additionalPros: a.additionalPros || [],
                    cons: a.cons || [],
                    prosFromReviews: a.prosFromReviews || [],
                    consFromReviews: a.consFromReviews || [],
                    normalizedSpecs: a.normalizedSpecs || {},
                  };
                });
                setProductAnalyses(prev => ({ ...prev, ...newAnalyses }));

                // ✅ PLP 리스트에도 분석 결과 반영 (oneLiner/장단점)
                setResultProducts((prev: any[]) => prev.map((p: any) => {
                  const analysis = newAnalyses[String(p.pcode || p.id)];
                  if (!analysis) return p;
                  return {
                    ...p,
                    oneLiner: analysis.oneLiner || p.oneLiner,
                    prosFromReviews: (analysis.prosFromReviews?.length > 0) ? analysis.prosFromReviews : p.prosFromReviews,
                    consFromReviews: (analysis.consFromReviews?.length > 0) ? analysis.consFromReviews : p.consFromReviews,
                    specs: (analysis.normalizedSpecs && Object.keys(analysis.normalizedSpecs).length > 0) ? analysis.normalizedSpecs : p.specs,
                  };
                }));

                // ✅ 채팅 메시지의 resultProducts도 동기화 (비교표/리뷰 한줄 평 일관성)
                setMessages((prev: ChatMessage[]) => prev.map((msg: ChatMessage) => {
                  if (!msg.resultProducts) return msg;
                  return {
                    ...msg,
                    resultProducts: msg.resultProducts.map((p: any) => {
                      const analysis = newAnalyses[String(p.pcode || p.id)];
                      if (!analysis) return p;
                      return {
                        ...p,
                        oneLiner: analysis.oneLiner || p.oneLiner,
                        prosFromReviews: (analysis.prosFromReviews?.length > 0) ? analysis.prosFromReviews : p.prosFromReviews,
                        consFromReviews: (analysis.consFromReviews?.length > 0) ? analysis.consFromReviews : p.consFromReviews,
                        specs: (analysis.normalizedSpecs && Object.keys(analysis.normalizedSpecs).length > 0) ? analysis.normalizedSpecs : p.specs,
                      };
                    }),
                  };
                }));

                console.log('[V2 Flow - FinalInput] Product analysis complete:', Object.keys(newAnalyses));
              }
            }
          } catch (e) {
            console.error('[V2 Flow - FinalInput] Product analysis failed:', e);
          } finally {
            setIsProductAnalysisLoading(false);
          }
        };

        // 🚀 즉시 product-analysis 호출 (리뷰 유무 무관, PDP 로딩 최적화)
        const top3Pcodes = v2Recommendations.map((rec: any) => rec.pcode);
        console.log('[V2 Flow - FinalInput] 🚀 Triggering product-analysis immediately (background prefetch)');
        fetchProductAnalysisForFinal();

        // ✅ 백그라운드에서 Top 3 리뷰 크롤링 (PDP용) - 블로킹 없음
        const hasReviewsFromFinalRecommend = top3Pcodes.every((pcode: string) => reviewsData[pcode]?.length > 0);

        if (hasReviewsFromFinalRecommend) {
          console.log('[V2 Flow - FinalInput] ✅ Reviews already loaded from final-recommend, skipping crawl');
        } else {
          console.log('[V2 Flow - FinalInput] 🔄 Background: Crawling reviews for Top 3:', top3Pcodes);
        }

        // 리뷰가 없는 경우에만 크롤링 (fallback)
        if (!hasReviewsFromFinalRecommend) {
          (async () => {
            try {
              const reviewRes = await fetch('/api/knowledge-agent/crawl-reviews', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pcodes: top3Pcodes, maxPerProduct: 50 }),
            });

            const top3Reviews: Record<string, any[]> = {};
            const reader = reviewRes.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let currentEvent = '';

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                  } else if (line.startsWith('data: ')) {
                    // reviews_complete 이벤트: 리뷰 완료 즉시 처리 (가격 크롤링 완료 기다리지 않음)
                    if (currentEvent === 'reviews_complete') {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.reviews) {
                          Object.entries(data.reviews).forEach(([pcode, reviews]) => {
                            top3Reviews[String(pcode)] = reviews as any[];
                          });
                          const reviewCounts = Object.entries(top3Reviews).map(([pcode, reviews]) =>
                            `${pcode}: ${(reviews as any[]).length}개`
                          ).join(', ');
                          console.log('[V2 Flow - FinalInput] ✅ Reviews complete (즉시):', reviewCounts);
                          // 즉시 reviewsData 업데이트
                          setReviewsData(prev => ({ ...prev, ...top3Reviews }));

                          // 리뷰 크롤링 완료 후 재호출은 비활성화 (DB 리뷰만 사용)
                        }
                      } catch (e) {
                        console.error('[V2 Flow - FinalInput] SSE parsing error:', e);
                      }
                    }
                    // complete 이벤트: 전체 완료 (가격 포함)
                    else if (currentEvent === 'complete') {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.reviews) {
                          Object.entries(data.reviews).forEach(([pcode, reviews]) => {
                            top3Reviews[String(pcode)] = reviews as any[];
                          });
                          console.log('[V2 Flow - FinalInput] ✅ Complete event received');
                        }
                      } catch (e) {
                        console.error('[V2 Flow - FinalInput] SSE parsing error:', e);
                      }
                    }
                    currentEvent = '';
                  }
                }
              }
            }
            } catch (err) {
              console.error('[V2 Flow - FinalInput] ❌ Background review crawl failed:', err);
            }
          })();
        }

        // 🔧 fetchProductAnalysisForFinal()은 reviews_complete 이벤트에서 호출됨 (리뷰 크롤링 완료 후)
      }
    } finally {
      setIsTyping(false);
      setIsCalculating(false);
    }
  };

  // BalanceGameCarousel용 핸들러 (Set<string> rule keys 반환)
  const handleBalanceComplete = async (selectedRuleKeys: Set<string>) => {
    // rule keys로부터 각 질문별 선택 정보 역추적
    const selectionsStr: string[] = [];
    const balanceSelectionsForV2: Array<{
      questionId: string;
      selectedOption: 'A' | 'B' | 'both';
      selectedLabel: string;
      targetRuleKey: string;
    }> = [];

    balanceQuestions.forEach(q => {
      const hasA = selectedRuleKeys.has(q.option_A.target_rule_key);
      const hasB = selectedRuleKeys.has(q.option_B.target_rule_key);

      if (hasA && hasB) {
        // 둘 다 선택 (both)
        selectionsStr.push(`${q.option_A.text} & ${q.option_B.text}`);
        balanceSelectionsForV2.push({
          questionId: q.id,
          selectedOption: 'both',
          selectedLabel: `${q.option_A.text} & ${q.option_B.text}`,
          targetRuleKey: `${q.option_A.target_rule_key},${q.option_B.target_rule_key}`,
        });
      } else if (hasA) {
        selectionsStr.push(q.option_A.text);
        balanceSelectionsForV2.push({
          questionId: q.id,
          selectedOption: 'A',
          selectedLabel: q.option_A.text,
          targetRuleKey: q.option_A.target_rule_key,
        });
      } else if (hasB) {
        selectionsStr.push(q.option_B.text);
        balanceSelectionsForV2.push({
          questionId: q.id,
          selectedOption: 'B',
          selectedLabel: q.option_B.text,
          targetRuleKey: q.option_B.target_rule_key,
        });
      }
    });

    setSavedBalanceSelections(balanceSelectionsForV2);

    setMessages(prev => [...prev, { id: `u_balance_${Date.now()}`, role: 'user', content: `선택: ${selectionsStr.join(', ')}`, timestamp: Date.now() }]);

    // V2 Flow: 밸런스 게임 완료 후 바로 결과로 (단점 필터 제거)
    if (v2FlowEnabled && hardCutProducts.length > 0) {
      console.log('[V2 Flow] Balance complete, going to result');
      setIsTyping(true);

      try {
        // 타임라인 UX와 실제 추천 생성을 병렬로 실행
        // 🆕 DB의 product_count 우선 사용
        const candidateCount = dbProductCount || crawledProducts.length || hardCutProducts.length;
        const uxPromise = runFinalTimelineUX(candidateCount, balanceSelectionsForV2.length, 0);
        const apiPromise = handleV2FinalRecommend(balanceSelectionsForV2);

        const [v2Recommendations] = await Promise.all([apiPromise, uxPromise]);

        if (v2Recommendations && v2Recommendations.length > 0) {
          const mappedResultProducts = v2Recommendations.map((rec: any) => {
            const pcodeStr = String(rec.pcode);
            const originalProduct = crawledProducts.find(p => String(p.pcode) === pcodeStr);
            console.log(`[V2 Flow] Product ${pcodeStr} danawaRank from originalProduct:`, originalProduct?.danawaRank);
            return {
              ...rec.product,
              id: rec.pcode || rec.product?.pcode,
              pcode: rec.pcode || rec.product?.pcode,
              title: rec.product?.name || rec.product?.title,
              reasoning: rec.reason,
              oneLiner: rec.oneLiner || '',
              recommendationReason: rec.reason,
              highlights: rec.highlights,
              concerns: rec.concerns,
              bestFor: rec.bestFor,
              specs: rec.normalizedSpecs || rec.product?.specs || {},
              prosFromReviews: rec.prosFromReviews || rec.highlights || [],
              consFromReviews: rec.consFromReviews || rec.concerns || [],
              danawaRank: rec.danawaRank || rec.product?.danawaRank || originalProduct?.danawaRank || null,
              // Legacy 하이라이트 데이터
              highlightData: rec.highlightData || null,
              // 🆕 태그 충족도 (full/partial/null)
              tagScores: rec.tagScores || {},
            };
          });
          setResultProducts(mappedResultProducts);
          setPhase('result');

          // ✅ Top3 추천 결과 로깅
          logKnowledgeAgentRecommendationReceived(
            categoryKey || '',
            categoryName || '',
            mappedResultProducts.map((p: any, idx: number) => ({
              pcode: p.pcode,
              name: p.name || p.title,
              brand: p.brand,
              price: p.price,
              rank: idx + 1,
              score: p.score,
            }))
          );

          const resultMsgId = `a_result_${Date.now()}`;
          setMessages(prev => [...prev, {
            id: resultMsgId,
            role: 'assistant',
            content: '',
            resultProducts: mappedResultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          // ✅ 결과 화면 맨 위로 스크롤 (모바일에서 중간 스크롤 방지)
          setTimeout(scrollToTop, 100);
          return;
        }
      } finally {
        setIsTyping(false);
        setIsCalculating(false);
      }
    }

    /* ✅ 단점 필터 제거 로직 (주석 처리)
    if (v2FlowEnabled) {
      // ...
    }
    */

    // Fallback: V2 비활성화 시 fetchChatStream 호출
    await fetchChatStream({
      categoryKey,
      userMessage: JSON.stringify(Array.from(selectedRuleKeys)),
      collectedInfo,
      phase: 'balance',
      balanceQuestions,
      products: crawledProducts  // Vercel 배포 환경 호환
    });
  };

  const handleNegativeFilterComplete = async (selectedLabels: string[]) => {
    // ✅ 선택된 단점 레이블을 저장 (PDP에서 사용)
    setSavedNegativeLabels(selectedLabels);
    console.log('[V2 Flow] savedNegativeLabels set:', selectedLabels);

    const selectionsStr = selectedLabels.join(', ') || '없음';
    setMessages(prev => [...prev, { id: `u_negative_${Date.now()}`, role: 'user', content: selectedLabels.length > 0 ? `피하고 싶은 단점: ${selectionsStr}` : '특별히 없어요', timestamp: Date.now() }]);

    // V2 Flow: 하드컷팅된 상품이 있으면 V2 최종 추천 사용
    if (v2FlowEnabled && hardCutProducts.length > 0) {
      setIsTyping(true);

      try {
        // 타임라인 UX와 실제 추천 생성을 병렬로 실행
        // 🆕 DB의 product_count 우선 사용
        const candidateCount = dbProductCount || crawledProducts.length || hardCutProducts.length;
        const uxPromise = runFinalTimelineUX(candidateCount, savedBalanceSelections.length, 0);

        // ⚠️ 새 플로우: Top 3 먼저 선정 (리뷰 없이) → 그 후 리뷰 크롤링
        console.log('[V2 Flow] Step 1: Selecting Top 3 without reviews...');
        const v2Recommendations = await handleV2FinalRecommend(savedBalanceSelections);

        if (v2Recommendations && v2Recommendations.length > 0) {
          // ✅ 디버그: API 응답에서 oneLiner 확인
          console.log('[V2 Flow] API Response - oneLiner:',
            v2Recommendations.map((r: any) => ({
              pcode: r.pcode,
              oneLiner: r.oneLiner?.slice(0, 30),
            }))
          );

          // ✅ 먼저 결과 화면 렌더링 (init API의 기존 리뷰 사용)
          const mappedResultProducts = v2Recommendations.map((rec: any, idx: number) => {
            const pcodeStr = String(rec.pcode);
            const existingReviews = reviewsData[pcodeStr] || [];
            const originalProduct = crawledProducts.find(p => String(p.pcode) === pcodeStr);
            console.log(`[V2 Flow] Product ${pcodeStr} danawaRank from originalProduct:`, originalProduct?.danawaRank);
            return {
              ...rec.product,
              id: rec.pcode || rec.product?.pcode,
              pcode: rec.pcode || rec.product?.pcode,
              title: rec.product?.name || rec.product?.title,
              rank: idx + 1,
              oneLiner: rec.oneLiner || '',
              reviewProof: rec.reviewProof || '',
              reasoning: rec.oneLiner || rec.reason || '',
              recommendationReason: rec.oneLiner || rec.reason || '',
              highlights: rec.highlights,
              concerns: rec.concerns,
              bestFor: rec.bestFor,
              reviewQuotes: rec.reviewQuotes || [],
              specs: rec.normalizedSpecs || rec.product?.specs || {},
              prosFromReviews: rec.prosFromReviews || rec.highlights || [],
              consFromReviews: rec.consFromReviews || rec.concerns || [],
              comparativeOneLiner: '',
              reviews: existingReviews,
              danawaData: null,
              danawaRank: rec.danawaRank || rec.product?.danawaRank || originalProduct?.danawaRank || null,
              // Legacy 하이라이트 데이터
              highlightData: rec.highlightData || null,
              // 🆕 태그 충족도 (full/partial/null)
              tagScores: rec.tagScores || {},
            };
          });

          // 타임라인 UX 완료 대기
          await uxPromise;

          setResultProducts(mappedResultProducts);
          setPhase('result');

          // ✅ Top3 추천 결과 로깅
          logKnowledgeAgentRecommendationReceived(
            categoryKey || '',
            categoryName || '',
            mappedResultProducts.map((p: any, idx: number) => ({
              pcode: p.pcode,
              name: p.name || p.title,
              brand: p.brand,
              price: p.price,
              rank: idx + 1,
              score: p.score,
            }))
          );

          const resultMsgId = `a_result_${Date.now()}`;
          setMessages(prev => [...prev, {
            id: resultMsgId,
            role: 'assistant',
            content: '',
            resultProducts: mappedResultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          // ✅ 결과 화면 맨 위로 스크롤 (모바일에서 중간 스크롤 방지)
          setTimeout(scrollToTop, 100);

          // ✅ 백그라운드에서 50개 리뷰 크롤링 + 장단점 재생성 + 분석 (블로킹 없음)
          const top3Pcodes = v2Recommendations.map((rec: any) => rec.pcode);
          console.log('[V2 Flow] 🔄 Background: Crawling 50 reviews + generating pros/cons for Top 3:', top3Pcodes);

          // 비동기로 실행 (await 없음)
          (async () => {
            try {
              // 1. 50개 리뷰 크롤링
              const reviewRes = await fetch('/api/knowledge-agent/crawl-reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pcodes: top3Pcodes, maxPerProduct: 50 }),
              });

              const top3Reviews: Record<string, any[]> = {};
              const reader = reviewRes.body?.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let currentEvent = '';

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';
                  for (const line of lines) {
                    if (line.startsWith('event: ')) {
                      currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                      // reviews_complete 이벤트: 리뷰 완료 즉시 처리
                      if (currentEvent === 'reviews_complete') {
                        try {
                          const data = JSON.parse(line.slice(6));
                          if (data.reviews) {
                            Object.entries(data.reviews).forEach(([pcode, reviews]) => {
                              top3Reviews[String(pcode)] = reviews as any[];
                            });
                            const reviewCounts = Object.entries(top3Reviews).map(([pcode, reviews]) =>
                              `${pcode}: ${(reviews as any[]).length}개`
                            ).join(', ');
                            console.log('[V2 Flow] ✅ Reviews complete (즉시):', reviewCounts);
                            // 즉시 reviewsData 업데이트
                            setReviewsData(prev => ({ ...prev, ...top3Reviews }));
                          }
                        } catch (e) {
                          console.error('[V2 Flow] SSE parsing error:', e);
                        }
                      }
                      // complete 이벤트: 전체 완료 (가격 포함)
                      else if (currentEvent === 'complete') {
                        try {
                          const data = JSON.parse(line.slice(6));
                          if (data.reviews) {
                            Object.entries(data.reviews).forEach(([pcode, reviews]) => {
                              top3Reviews[String(pcode)] = reviews as any[];
                            });
                            console.log('[V2 Flow] ✅ Complete event received');
                          }
                          if (data.prices) {
                            const normalizedPrices: Record<string, any> = {};
                            Object.entries(data.prices).forEach(([pcode, priceData]) => {
                              normalizedPrices[String(pcode)] = priceData;
                            });
                            setPricesData(prev => ({ ...prev, ...normalizedPrices }));
                          }
                        } catch (e) {
                          console.error('[V2 Flow] SSE parsing error:', e);
                        }
                      }
                      currentEvent = '';
                    }
                  }
                }
              }

              // 2. 장단점 재생성 (선택적 - 리뷰 기반 향상)
              try {
                // ✅ 최신 리뷰 데이터 병합: 크롤링 결과(top3Reviews) + 기존 상태(reviewsData)
                const mergedReviews = { ...reviewsData, ...top3Reviews };
                console.log('[V2 Flow] Merged reviews for pros/cons:', Object.keys(mergedReviews).map(k => `${k}: ${mergedReviews[k]?.length || 0}개`).join(', '));
                
                const prosConsRes = await fetch('/api/knowledge-agent/generate-pros-cons', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    products: v2Recommendations.map((rec: any) => ({
                      pcode: rec.pcode,
                      name: rec.product?.name || rec.product?.title,
                      brand: rec.product?.brand,
                      price: rec.product?.price,
                      specSummary: rec.product?.specSummary,
                      matchedConditions: rec.product?.matchedConditions || [],
                      bestFor: rec.bestFor,
                    })),
                    reviews: mergedReviews, // ✅ 크롤링된 최신 리뷰 사용 (클로저 문제 해결)
                    categoryName,
                    collectedInfo,
                    balanceSelections: savedBalanceSelections.map((s: any) => s.selectedLabel),
                    negativeSelections: selectedLabels,
                  }),
                });

                if (prosConsRes.ok) {
                  const prosConsData = await prosConsRes.json();
                  console.log('[V2 Flow] ✅ Background pros/cons generated');
                  console.log('[V2 Flow] prosConsData.results:', prosConsData.results?.map((r: any) => ({
                    pcode: r.pcode,
                    oneLiner: r.oneLiner?.slice(0, 30),
                    comparativeOneLiner: r.comparativeOneLiner?.slice(0, 50) || '(empty)',
                  })));

                  // ✅ comparativeOneLiner 등 생성된 데이터를 상태에 반영
                  if (prosConsData.success && prosConsData.results) {
                    const resultsMap = new Map(
                      prosConsData.results.map((r: any) => [String(r.pcode), r])
                    );

                    // resultProducts 상태 업데이트
                    setResultProducts((prev: any[]) => prev.map((p: any) => {
                      const prosConsResult = resultsMap.get(String(p.pcode)) as any;
                      if (prosConsResult) {
                        const nextPros = Array.isArray(prosConsResult.prosFromReviews)
                          ? prosConsResult.prosFromReviews.filter(Boolean)
                          : null;
                        const nextCons = Array.isArray(prosConsResult.consFromReviews)
                          ? prosConsResult.consFromReviews.filter(Boolean)
                          : null;
                        return {
                          ...p,
                          prosFromReviews: (nextPros && nextPros.length > 0) ? nextPros : p.prosFromReviews,
                          consFromReviews: (nextCons && nextCons.length > 0) ? nextCons : p.consFromReviews,
                          oneLiner: prosConsResult.oneLiner || p.oneLiner,
                          reviewProof: prosConsResult.reviewProof || p.reviewProof,
                          comparativeOneLiner: prosConsResult.comparativeOneLiner || '',
                        };
                      }
                      return p;
                    }));

                    // messages의 resultProducts도 업데이트
                    setMessages((prev: ChatMessage[]) => prev.map((msg: ChatMessage) => {
                      if (msg.resultProducts) {
                        return {
                          ...msg,
                          resultProducts: msg.resultProducts.map((p: any) => {
                            const prosConsResult = resultsMap.get(String(p.pcode)) as any;
                            if (prosConsResult) {
                              const nextPros = Array.isArray(prosConsResult.prosFromReviews)
                                ? prosConsResult.prosFromReviews.filter(Boolean)
                                : null;
                              const nextCons = Array.isArray(prosConsResult.consFromReviews)
                                ? prosConsResult.consFromReviews.filter(Boolean)
                                : null;
                              return {
                                ...p,
                                prosFromReviews: (nextPros && nextPros.length > 0) ? nextPros : p.prosFromReviews,
                                consFromReviews: (nextCons && nextCons.length > 0) ? nextCons : p.consFromReviews,
                                oneLiner: prosConsResult.oneLiner || p.oneLiner,
                                reviewProof: prosConsResult.reviewProof || p.reviewProof,
                                comparativeOneLiner: prosConsResult.comparativeOneLiner || '',
                              };
                            }
                            return p;
                          }),
                        };
                      }
                      return msg;
                    }));

                    console.log('[V2 Flow] ✅ comparativeOneLiner updated for', prosConsData.results.length, 'products');
                  }
                }
              } catch (e) {
                console.error('[V2 Flow] Background pros/cons generation failed:', e);
              }

              // 3. Product Analysis (PDP용)
              setIsProductAnalysisLoading(true);
              try {
                // 🆕 tagScores를 preEvaluations로 변환 (product-analysis에서 재사용)
                const preEvaluationsForAnalysis: Record<string, any> = {};
                v2Recommendations.slice(0, 5).forEach((rec: any) => {
                  if (rec.tagScores) {
                    preEvaluationsForAnalysis[rec.pcode] = rec.tagScores;
                  }
                });

                const analysisRes = await fetch('/api/knowledge-agent/product-analysis', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    categoryKey,
                    categoryName,
                    products: v2Recommendations.slice(0, 5).map((rec: any) => ({
                      pcode: rec.pcode,
                      name: rec.product?.name,
                      brand: rec.product?.brand,
                      price: rec.product?.price,
                      specSummary: rec.product?.specSummary,
                      recommendReason: rec.reason,
                      highlights: rec.highlights,
                      concerns: rec.concerns,
                      oneLiner: rec.oneLiner || '',  // 🆕 final-recommend에서 생성된 oneLiner 전달
                      reviews: (reviewsData[rec.pcode] || []).slice(0, 15), // 🆕 final-recommend에서 받은 15개 리뷰 사용
                    })),
                    userContext: {
                      collectedInfo,
                      questionTodos: questionTodos.map((q: QuestionTodo) => ({
                        id: q.id,
                        question: q.question,
                      })),
                      balanceSelections: savedBalanceSelections.map((s: any) => ({
                        questionId: s.questionId,
                        selectedLabel: s.selectedLabel,
                        selectedKey: s.targetRuleKey,
                      })),
                      negativeSelections: selectedLabels,
                      conversationSummary: messages
                        .filter((m: ChatMessage) => m.role === 'assistant' && m.content)
                        .slice(-3)
                        .map((m: ChatMessage) => m.content)
                        .join(' ')
                        .slice(0, 500),
                    },
                    // 🆕 final-recommend에서 생성된 tagScores 전달 (PDP에서 재사용)
                    preEvaluations: Object.keys(preEvaluationsForAnalysis).length > 0 ? preEvaluationsForAnalysis : undefined,
                    filterTags: filterTags.length > 0 ? filterTags : undefined,
                  }),
                });

                if (analysisRes.ok) {
                  const analysisData = await analysisRes.json();
                  if (analysisData.success && analysisData.data?.analyses) {
                    const newAnalyses: Record<string, any> = {};
                    analysisData.data.analyses.forEach((a: any) => {
                      newAnalyses[String(a.pcode)] = {
                        selectedConditionsEvaluation: a.selectedConditionsEvaluation || [],
                        contextMatch: a.contextMatch,
                        oneLiner: a.oneLiner,
                        additionalPros: a.additionalPros || [],
                        cons: a.cons || [],
                        prosFromReviews: a.prosFromReviews || [],
                        consFromReviews: a.consFromReviews || [],
                        normalizedSpecs: a.normalizedSpecs || {},
                      };
                    });
                    setProductAnalyses(prev => ({ ...prev, ...newAnalyses }));

                    // 🆕 resultProducts에도 prosFromReviews/consFromReviews 반영 (비교표용)
                    setResultProducts((prev: any[]) => prev.map((p: any) => {
                      const analysis = newAnalyses[String(p.pcode)];
                      if (analysis) {
                        return {
                          ...p,
                          prosFromReviews: analysis.prosFromReviews?.length > 0 ? analysis.prosFromReviews : p.prosFromReviews,
                          consFromReviews: analysis.consFromReviews?.length > 0 ? analysis.consFromReviews : p.consFromReviews,
                          oneLiner: analysis.oneLiner || p.oneLiner,
                          specs: (analysis.normalizedSpecs && Object.keys(analysis.normalizedSpecs).length > 0) ? analysis.normalizedSpecs : p.specs,
                        };
                      }
                      return p;
                    }));

                    // 🆕 messages의 resultProducts도 업데이트 (비교표 일관성)
                    setMessages((prev: ChatMessage[]) => prev.map((msg: ChatMessage) => {
                      if (msg.resultProducts) {
                        return {
                          ...msg,
                          resultProducts: msg.resultProducts.map((p: any) => {
                            const analysis = newAnalyses[String(p.pcode)];
                            if (analysis) {
                              return {
                                ...p,
                                prosFromReviews: analysis.prosFromReviews?.length > 0 ? analysis.prosFromReviews : p.prosFromReviews,
                                consFromReviews: analysis.consFromReviews?.length > 0 ? analysis.consFromReviews : p.consFromReviews,
                                oneLiner: analysis.oneLiner || p.oneLiner,
                              specs: (analysis.normalizedSpecs && Object.keys(analysis.normalizedSpecs).length > 0) ? analysis.normalizedSpecs : p.specs,
                              };
                            }
                            return p;
                          }),
                        };
                      }
                      return msg;
                    }));

                    console.log('[V2 Flow] ✅ Background product analysis completed (prosFromReviews updated)');
                  }
                }
              } catch (e) {
                console.error('[V2 Flow] Background product analysis failed:', e);
              } finally {
                setIsProductAnalysisLoading(false);
              }
            } catch (err) {
              console.error('[V2 Flow] ❌ Background processing failed:', err);
            }
          })();

          return;
        }
      } finally {
        setIsTyping(false);
        setIsCalculating(false);
      }
    }

    // Fallback: fetchChatStream 호출
    await fetchChatStream({
      categoryKey,
      userMessage: selectionsStr,
      collectedInfo,
      phase: 'negative_filter',
      // 추가 정보: 하드 필터 응답, 밸런스 게임 응답
      hardFilterResponses: collectedInfo,
      balanceGameResponses: savedBalanceSelections,
    });
  };

  const fetchChatStream = async (payload: any) => {
    const { userMessage } = payload;
    setIsTyping(true);
    setActiveStatusMessage('생각 중...');

    try {
      const response = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, streaming: true })
      });

      if (!response.ok) throw new Error('Chat failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'status') {
                setActiveStatusMessage(data.message);
                if (data.query) {
                  setActiveSearchQueries(prev => [...new Set([...prev, data.query])]);
                }
              } else if (currentEvent === 'complete') {
                handleChatResponse(data, userMessage);
              } else if (currentEvent === 'error') {
                console.error('[Chat] Stream error:', data.message);
              }
            } catch (e) { }
            currentEvent = '';
          }
        }
      }
    } catch (e) {
      console.error('[Chat] Error:', e);
    } finally {
      setIsTyping(false);
      setActiveStatusMessage(null);
    }
  };

  const handleFreeChat = async (message: string) => {
    if (!message.trim() || isTyping) return;

    // 현재 활성화된 질문 찾기 및 확정 처리
    const activeMsg = [...messages].reverse().find(m => m.role === 'assistant' && (m.options || m.negativeFilterOptions) && !m.isFinalized);
    if (activeMsg) {
      // ✅ 꼬리질문인 경우 handleFollowUpAnswer로 위임
      if (activeMsg.id?.startsWith('followup-q-')) {
        handleFollowUpAnswer(message);
        return;
      }

      /* ✅ 피하고 싶은 단점 질문 제거
      const questionId = activeMsg.id?.startsWith('q_') ? activeMsg.id.slice(2) : (currentQuestion?.id || '');
      if (questionId === 'avoid_negatives' || questionId.includes('negative') || questionId.includes('avoid')) {
        const selectedOptions = activeMsg.selectedOptions || [];
        setSavedNegativeLabels(selectedOptions);
        console.log('[KA Flow] handleFreeChat - avoid_negatives detected, savedNegativeLabels set:', selectedOptions);
      }
      */

      // 질문 완료 로깅 (옵션 토글은 별도로 logKnowledgeAgentHardFilterSelection에서 처리)
      if (categoryKey) {
        logKAQuestionAnswered(categoryKey, activeMsg.content, message);
      }
      setMessages(prev => prev.map(m => m.id === activeMsg.id ? { ...m, isFinalized: true } : m));
    }

    const newMsgId = `u_${Date.now()}`;
    setMessages(prev => [...prev, { id: newMsgId, role: 'user', content: message, timestamp: Date.now() }]);
    setInputValue('');

    // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨

    // ✅ 프리페치: avoid_negatives 2개 전 질문부터 미리 옵션 로드 시작 (API ~2초 소요)
    const currentQId = activeMsg?.id?.startsWith('q_') ? activeMsg.id.slice(2) : currentQuestion?.id;
    const currentIdx = questionTodos.findIndex((q: any) => q.id === currentQId);
    const avoidNegativesIdx = questionTodos.findIndex((q: any) => q.id === 'avoid_negatives');
    const questionsUntilNegative = avoidNegativesIdx - currentIdx;

    // 2개 전 또는 1개 전에 프리페치 시작 (아직 안 했으면)
    if (questionsUntilNegative > 0 && questionsUntilNegative <= 2 && needsDynamicNegativeOptionsRef.current && !prefetchedNegativeOptionsRef.current) {
      console.log(`[KA Flow] ⚡ Prefetching negative options (${questionsUntilNegative} questions ahead)...`);
      // 병렬로 프리페치 (await 안 함)
      fetch('/api/knowledge-agent/generate-negative-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          collectedInfo: { ...collectedInfo, [currentQuestion?.question || '']: message },
          trendCons: trendConsRef.current,
        }),
      }).then(res => res.json()).then(result => {
        if (result.success && result.options?.length > 0) {
          prefetchedNegativeOptionsRef.current = result.options.map((opt: any) => opt.label);
          prefetchedPopularOptionsRef.current = result.options
            .filter((opt: any) => opt.isPopular)
            .map((opt: any) => opt.label);
          console.log('[KA Flow] ⚡ Prefetch complete:', prefetchedNegativeOptionsRef.current?.length, 'options');
        }
      }).catch(err => console.error('[KA Flow] Prefetch error:', err));
    }

    await fetchChatStream({
      categoryKey,
      userMessage: message,
      conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
      phase: phase === 'result' ? 'free_chat' : phase,
      questionTodos,
      collectedInfo,
      currentQuestionId: currentQId,
      products: crawledProducts  // Vercel 배포 환경 호환
    });
  };

  const handleChatResponse = (data: any, userMessage: string) => {
    if (data.success) {
      // Update state if returned
      if (data.questionTodos) setQuestionTodos(data.questionTodos);
      if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
      if (data.progress) setProgress(data.progress);
      if (data.currentQuestion) setCurrentQuestion(data.currentQuestion);

      // ✅ 모든 맞춤 질문 완료 → 하드컷팅 플로우 시작
      if (data.phase === 'complete') {
        if (v2FlowEnabled && !v2FlowStarted) {
          setV2FlowStarted(true);
          startV2Flow();
        }
      } else if (data.phase === 'result') {
        const resultProducts = (data.products || []).map((rec: any) => ({
          ...rec,
          pcode: rec.pcode || rec.id,
          title: rec.title || rec.name,
          recommendationReason: rec.reason || rec.recommendationReason,
        }));
        setResultProducts(resultProducts);
        setPhase('result');
        const chatResultMsgId = `a_result_${Date.now()}`;

        // 결과 채팅 응답 로깅
        logKAChatMessage(categoryKey, userMessage, data.content);

        setMessages(prev => [...prev, {
          id: chatResultMsgId,
          role: 'assistant',
          content: data.content,
          resultProducts: resultProducts,
          typing: true,
          timestamp: Date.now()
        }]);
        // ✅ 결과 화면 맨 위로 스크롤 (모바일 최적화)
        setTimeout(scrollToTop, 100);
      } else {
        // 일반 AI 응답 로깅
        logKAChatMessage(categoryKey, userMessage, data.content);

        /* ✅ avoid_negatives 질문 제거
        const isAvoidNegatives = data.currentQuestion?.id === 'avoid_negatives';
        const hasDynamicFlag = data.currentQuestion?.dynamicOptions || needsDynamicNegativeOptionsRef.current;
        const hasEmptyOptions = !data.options || data.options.length === 0;
        const needsDynamic = isAvoidNegatives && hasDynamicFlag && hasEmptyOptions;

        if (needsDynamic) {
          // ... (기존 동적 옵션 로드 로직)
        } else {
        */
          // 일반 질문 - 기존 로직
          setMessages(prev => [...prev, {
            id: `a_${Date.now()}`,
            questionId: data.currentQuestion?.id,
            role: 'assistant',
            content: data.content,
            options: data.options,
            popularOptions: data.popularOptions,
            questionProgress: data.progress,
            dataSource: data.dataSource,
            searchContext: data.searchContext || null,
            typing: true,
            timestamp: Date.now()
          }]);
        // }
      }
    }
  };

  // 현재 활성화된 질문의 선택된 옵션 개수 확인
  const activeQuestion = [...messages].reverse().find(m => m.role === 'assistant' && (m.options || m.negativeFilterOptions) && !m.isFinalized);
  const selectedCount = activeQuestion?.selectedOptions?.length || 0;

  return (
    <div className="h-screen bg-[#F8F9FB] flex flex-col font-sans overflow-hidden">
      <div
        ref={phase === 'result' || phase === 'free_chat' ? mainRef : null}
        className={`max-w-[480px] mx-auto w-full flex-1 ${phase === 'result' || phase === 'free_chat' ? 'overflow-y-auto scrollbar-hide' : 'flex flex-col min-h-0'} relative border-x border-gray-100 bg-white shadow-2xl shadow-gray-200/50`}
      >
        <header className={`bg-white border-b border-gray-50/50 px-4 h-16 flex items-center justify-between shrink-0 ${phase === 'result' || phase === 'free_chat' ? '' : 'sticky top-0 z-100 bg-white/80 backdrop-blur-2xl'}`}>
          <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={() => setShowExitConfirmModal(true)} className="p-2.5 -ml-2.5 rounded-full hover:bg-gray-50 transition-colors">
            <img src="/icons/back.png" alt="뒤로가기" className="w-5 h-5" />
          </motion.button>
          <motion.button
            whileHover={{ rotate: 180 }}
            whileTap={{ rotate: 360, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            onClick={() => window.location.reload()}
            className="p-2.5 -mr-2.5 rounded-full hover:bg-gray-50 active:bg-gray-100 transition-colors"
            title="처음부터 다시 시작"
          >
            <ArrowClockwise size={18} weight="bold" className="text-gray-400" />
          </motion.button>
        </header>

        {/* 스텝 인디케이터 (4단계) - 로딩/추천 완료 단계에서는 숨김 */}
        {phase !== 'loading' && phase !== 'result' && phase !== 'free_chat' && (
          <StepIndicator currentPhase={phase} />
        )}

        <main
          ref={phase === 'result' || phase === 'free_chat' ? null : mainRef}
          className={`px-4 pt-0 bg-white relative transition-all duration-300 ${phase === 'result' || phase === 'free_chat' ? '' : 'flex-1 min-h-0 overflow-y-auto scrollbar-hide'}`}
          style={{ paddingBottom: '500px', overflowAnchor: phase === 'result' || phase === 'free_chat' ? undefined : 'none' }}
        >
          <div className="space-y-8 pt-2">
            {(() => {
              // top3 결과가 있는지 확인하고, 있다면 그 인덱스 찾기
              const resultMessageIndex = messages.findIndex(m => m.resultProducts && m.resultProducts.length > 0);
              const hasResult = resultMessageIndex !== -1;

              return messages.map((msg, idx) => {
              // top3 결과가 있으면 그 이전의 모든 메시지들은 숨김 (결과 메시지만 표시)
              if (hasResult && idx < resultMessageIndex) {
                return null;
              }

              const isLatestAssistant = msg.role === 'assistant' && (msg.options || msg.negativeFilterOptions) && !msg.isFinalized;
              // 후속 채팅 메시지(options/questionProgress 없는 일반 응답)는 투명도 적용 안 함
              const isFollowUpChat = msg.role === 'assistant' && !msg.options && !msg.questionProgress && !msg.negativeFilterOptions;
              // result/free_chat 단계에서는 사용자 메시지에 투명도 적용 안 함
              const isInactive = msg.role === 'user'
                ? (phase !== 'result' && phase !== 'free_chat') && idx < messages.length - 1
                : !isFollowUpChat && !!(!isLatestAssistant && (
                    (msg.options && msg.options.length > 0) ||
                    (msg.negativeFilterOptions && msg.negativeFilterOptions.length > 0) ||
                    (msg.questionId && msg.isFinalized)
                  ));

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onOptionToggle={handleOptionToggle}
                  onProductClick={handleProductClick}
                  phase={phase}
                  inputRef={inputRef}
                  isLatestAssistantMessage={isLatestAssistant}
                  isInactive={isInactive}
                  selectedNegativeKeys={selectedNegativeKeys}
                onNegativeKeyToggle={(key) => setSelectedNegativeKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                categoryKey={categoryKey}
                categoryName={categoryName}
                userSelections={getUserSelections()}
                onAIHelperOpen={(data) => {
                  setAiHelperData(data);
                  setIsAIHelperOpen(true);
                }}
                onPopularRecommend={(query) => {
                  const isNegQ = msg.questionId === 'avoid_negatives' || 
                                msg.id?.includes('avoid_negatives') ||
                                msg.content?.toLowerCase().includes('단점') ||
                                msg.content?.toLowerCase().includes('피하고') ||
                                msg.content?.toLowerCase().includes('피할');
                  setAiHelperData({
                    questionId: msg.id,
                    questionText: msg.content,
                    options: msg.options!.map(o => ({ value: o, label: o })),
                    type: isNegQ ? 'negative' : 'hard_filter'
                  });
                  setAiHelperAutoSubmitText(query);
                  setIsAIHelperOpen(true);
                }}
                onContextRecommend={(query) => {
                  const isNegQ = msg.questionId === 'avoid_negatives' || 
                                msg.id?.includes('avoid_negatives') ||
                                msg.content?.toLowerCase().includes('단점') ||
                                msg.content?.toLowerCase().includes('피하고') ||
                                msg.content?.toLowerCase().includes('피할');
                  setAiHelperData({
                    questionId: msg.id,
                    questionText: msg.content,
                    options: msg.options!.map(o => ({ value: o, label: o })),
                    type: isNegQ ? 'negative' : 'hard_filter'
                  });
                  setAiHelperAutoSubmitText(query);
                  setIsAIHelperOpen(true);
                }}
                onNegativeAIHelperOpen={(autoSubmitText) => {
                  if (autoSubmitText) {
                    setAiHelperAutoSubmitText(autoSubmitText);
                  }
                  setIsNegativeAIHelperOpen(true);
                }}
                onFreeChat={handleFreeChat}
                onHardcutContinue={handleHardcutContinue}
                onHardcutComplete={() => {
                  setIsHardcutVisualDone(true);
                  // ✅ 로딩 완료 후 가이드 메시지 추가 (hardcutData 바로 다음에 추가됨)
                  const finalInputMsgId = `a_final_input_${Date.now()}`;
                  const loadingMsgId = `a_followup_loading_${Date.now()}`;
                  setMessages(prev => {
                    if (prev.some(m => m.id.startsWith('a_final_input_'))) return prev;
                    return [...prev,
                      {
                        id: finalInputMsgId,
                        role: 'assistant',
                        questionId: 'final_guide',
                        content: `추천 후보 상품들을 잘 추렸어요! 🎯`,
                        typing: true,
                        timestamp: Date.now()
                      },
                      {
                        id: loadingMsgId,
                        role: 'assistant',
                        questionId: 'followup_loading',
                        content: '추가 질문 필요 판단하는 중...',
                        isLoading: true,
                        typing: true,
                        timestamp: Date.now()
                      }
                    ];
                  });
                }}
                showComparisonOnly={showComparisonOnly}
                setShowComparisonOnly={setShowComparisonOnly}
                pricesData={pricesData}
                onAnalysisSummaryShow={handleAnalysisSummaryShow}
                reviewsData={reviewsData}
                webSearchProgress={webSearchProgress}
                // 🆕 필터 태그 관련 props
                selectedFilterTagIds={selectedFilterTagIds}
                sortedResultProducts={sortedResultProducts}
                filterTags={filterTags}
                onFilterTagToggle={handleFilterTagToggle}
              />
            );
          });
            })()}

            {/* 결과 채팅 로딩 인디케이터 */}
            <AnimatePresence>
              {isChatLoading && phase === 'result' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 py-3 px-1"
                >
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500"
                      />
                    ))}
                  </div>
                  <motion.span
                    animate={{ backgroundPosition: ["-100% 0", "100% 0"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="text-[14px] bg-gradient-to-r from-gray-600 via-gray-400 to-gray-600 bg-[length:200%_auto] bg-clip-text text-transparent font-medium"
                  >
                    답변 생성 중...
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 하드컷팅 시각화 단계 - 메시지로 이동됨 */}

            <AnimatePresence>
              {isCalculating && (
                <div className="py-12">
                  <LoadingAnimation progress={loadingProgress} timelineSteps={timelineSteps} />
                </div>
              )}
              {isTyping && !isCalculating && <SearchingIndicator queries={activeSearchQueries} statusMessage={activeStatusMessage} />}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          {/* 플로팅 AI 도움 버튼 */}
          <AnimatePresence>
            {(() => {
              // 가장 최신의 활성 질문 메시지 찾기
              const latestQuestionMessage = [...messages].reverse().find(
                msg => msg.role === 'assistant' &&
                       (msg.options || msg.negativeFilterOptions) &&
                       !msg.isFinalized
              );

              if (!latestQuestionMessage) return null;

              const isNegativeQuestion =
                !!latestQuestionMessage.negativeFilterOptions ||
                latestQuestionMessage.questionId === 'avoid_negatives' ||
                latestQuestionMessage.id?.includes('avoid_negatives') ||
                latestQuestionMessage.content?.toLowerCase().includes('단점') ||
                latestQuestionMessage.content?.toLowerCase().includes('피하고') ||
                latestQuestionMessage.content?.toLowerCase().includes('피할');

              // 단점 질문에서는 플로팅 버튼 숨김
              if (isNegativeQuestion) return null;

              // 선택지가 하나라도 선택되었으면 버튼 숨김
              const hasSelection = latestQuestionMessage.selectedOptions && latestQuestionMessage.selectedOptions.length > 0;

              if (hasSelection) return null;

              return (
                <div className="fixed inset-x-0 bottom-0 pointer-events-none z-[112]">
                  <div className="max-w-[480px] mx-auto w-full relative">
                    {/* 플로팅 AI 버튼 */}
                    <motion.button
                      key="floating-ai-helper"
                      initial={{ opacity: 0, scale: 0.9, y: 0 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 0 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        // 바로 바텀시트 열기
                        if (isNegativeQuestion) {
                          setIsNegativeAIHelperOpen(true);
                        } else {
                          setAiHelperData({
                            questionId: latestQuestionMessage.id,
                            questionText: latestQuestionMessage.content,
                            options: latestQuestionMessage.options!.map(o => ({ value: o, label: o })),
                            type: 'hard_filter'
                          });
                          setIsAIHelperOpen(true);
                        }
                      }}
                      className="absolute px-6 py-3 rounded-2xl text-s font-semibold text-white flex items-center gap-2 shadow-lg pointer-events-auto"
                      style={{
                        right: '16px',
                        bottom: 'calc(100px + env(safe-area-inset-bottom))',
                        background: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)'
                      }}
                    >
                      <motion.svg
                        className="w-4 h-4 text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        animate={{
                          rotate: [0, -15, 15, -15, 0],
                          y: [0, -2.5, 0]
                        }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          repeatDelay: 2,
                          ease: "easeInOut"
                        }}
                      >
                        <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="white" />
                      </motion.svg>
                      잘 모르겠어요
                    </motion.button>
                  </div>
                </div>
              );
            })()}
          </AnimatePresence>
        </main>

        {/* 🆕 로딩 단계(1~4번 분석)에서는 하단 채팅바 숨김 */}
        {phase !== 'loading' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-[110] bg-gradient-to-t from-white via-white/95 to-transparent">
          {/* Navigation Buttons (Prev Only)
            {activeQuestion && canGoPrev && !isTyping && (
              <div className="flex mb-4">
                <button
                  onClick={handlePrevStep}
                  className="w-[80px] py-3.5 bg-white text-gray-500 border border-gray-100 rounded-2xl text-[14px] font-bold hover:bg-gray-50 transition-all flex items-center justify-center"
                >
                  이전
                </button>
              </div>
            )} */}

          {/* 하드컷팅 시각화 완료 시 버튼 및 채팅 바 */}
          {phase === 'hardcut_visual' && isHardcutVisualDone && !isTyping && (() => {
            // 안내 메시지가 있는지 확인 (꼬리질문 생성 완료 후)
            const hasGuideMessage = messages.some(m => m.id?.startsWith('a_followup_guide_'));

            return (
            <div className="space-y-3">
               {/* 메인 버튼: 최종 추천 결과 보기 - 추가질문이 없을 때만 표시 (있으면 자동으로 questions phase로 이동) */}
              {hasGuideMessage && followUpQuestions.length === 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01, translateY: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    handleFinalInputSubmit(inputValue.trim() || undefined);
                    setInputValue('');
                  }}
                  className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 group transition-all"
                >
                  <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                    <Image src="/icons/ic-ai.svg" alt="" width={16} height={16} />
                  </div>
                  <span className="text-[16px] font-semibold tracking-tight">최종 추천 결과 보기</span>
                </motion.button>
              )}
            </div>
            );
          })()}

          {/* 꼬리질문 Phase UI - 제거됨 (MessageBubble 통합) */}


          {/* 피하고 싶은 단점 질문 UI 제거됨 */}

          {phase === 'result' && !showReRecommendModal ? (
            <>
              <ResultChatContainer
                products={resultProducts}
                categoryKey={categoryKey}
                categoryName={categoryName}
                flowType="ka"
                existingConditions={{
                  hardFilterAnswers: Object.fromEntries(
                    Object.entries(collectedInfo).map(([k, v]) => [k, String(v)])
                  ),
                  balanceSelections: savedBalanceSelections.map(s => s.selectedLabel),
                  negativeSelections: savedNegativeLabels.length > 0
                    ? savedNegativeLabels
                    : selectedNegativeKeys
                      .map(key => negativeOptions.find(opt => opt.target_rule_key === key)?.label)
                      .filter((label): label is string => !!label),
                  budget: { min: 0, max: 0 },
                }}
                onUserMessage={(content) => {
                  const msgId = `u_${Date.now()}`;
                  setMessages(prev => [...prev, { id: msgId, role: 'user', content, timestamp: Date.now() }]);
                  // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
                }}
                onAssistantMessage={(content, typing = false) => {
                  const msgId = `a_${Date.now()}`;
                  setMessages(prev => [...prev, { id: msgId, role: 'assistant', content, typing, timestamp: Date.now() }]);
                  // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
                }}
                onLoadingChange={setIsChatLoading}
                chatHistory={messages
                  .filter(m => (m.role === 'user' || m.role === 'assistant'))
                  .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                }
              />
            </>
          ) : (phase === 'questions' || phase === 'report') && activeQuestion && !isTyping ? (
            /* 질문 단계: 이전/다음 버튼 */
            <div className="bg-white border-t border-gray-100 p-4 -mx-4 -mb-6">
              <div className="flex gap-3 justify-between">
                {canGoPrev ? (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePrevStep}
                    className="w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    이전
                  </motion.button>
                ) : <div />}

                <motion.button
                  whileHover={selectedCount > 0 ? { scale: 1.01 } : {}}
                  whileTap={selectedCount > 0 ? { scale: 0.98 } : {}}
                  onClick={() => {
                    const selectedOptions = activeQuestion?.selectedOptions || [];
                    if (selectedOptions.length > 0) {
                      handleFreeChat(selectedOptions.join(', '));
                    }
                  }}
                  disabled={selectedCount === 0}
                  className={`w-[100px] shrink-0 py-4 rounded-[12px] text-[16px] font-semibold transition-all flex items-center justify-center
                    ${selectedCount > 0
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-300 opacity-50 cursor-not-allowed'}`}
                >
                  다음
                </motion.button>
              </div>
            </div>
          ) : null}
        </div>
        )}
      </div>

      {selectedProduct && (() => {
        // Product Analysis 데이터 조회
        const productId = String(selectedProduct.id || selectedProduct.pcode);
        const analysis = productAnalyses[productId];

        return (
          <ProductDetailModal
            initialTab={modalInitialTab}
            initialAverageRating={selectedProduct.rating || selectedProduct.averageRating}
            productData={{
              product: {
                id: selectedProduct.id || selectedProduct.pcode,
                title: selectedProduct.title || selectedProduct.name,
                brand: selectedProduct.brand,
                price: selectedProduct.price,
                thumbnail: selectedProduct.thumbnail || selectedProduct.image,
                reviewCount: selectedProduct.reviewCount || 0,
                specSummary: selectedProduct.specSummary,
              },
              rank: selectedProduct.rank || 1,
              finalScore: selectedProduct.matchScore || 0,
              reasoning: selectedProduct.reasoning || selectedProduct.recommendReason || '',
              // 기존 태그 기반 평가 비활성화 (V2 조건 평가만 사용)
              selectedTagsEvaluation: [],
              // 추가 장점/단점도 비활성화 (V2 스타일만 사용)
              additionalPros: [],
              cons: [],
              citedReviews: (reviewsData[String(selectedProduct.pcode || selectedProduct.id)] || selectedProduct.reviews || []).slice(0, 5).map((r: any, i: number) => ({
                index: i + 1,
                text: r.content || r.text || '',
                rating: r.rating || 0,
              })),
            }}
            category={categoryKey}
            categoryName={categoryName}
            onClose={() => setSelectedProduct(null)}
            isAnalysisLoading={isProductAnalysisLoading}
            // V2 조건 충족도 평가 ("왜 추천했나요?", "선호 속성", "피할 단점" 표시용)
            selectedConditionsEvaluation={[
              // 기존 분석 결과
              ...(analysis?.selectedConditionsEvaluation?.map((e: any) => ({
                condition: e.condition,
                conditionType: e.conditionType as 'hardFilter' | 'balance' | 'negative',
                status: e.status as '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨',
                evidence: e.evidence || '',
                shortReason: e.shortReason,  // ✅ 추가: "왜 추천했나요?" 섹션용
                tradeoff: e.tradeoff,
                questionId: e.questionId,
              })) || []),
              // ✅ 추가: 마지막 자유 입력에서 추출한 선호 속성
              ...(freeInputAnalysis?.preferredAttributes?.map((attr: string) => ({
                condition: attr,
                conditionType: 'balance' as const,
                status: '충족' as const,
                evidence: `자유 입력에서 요청: "${collectedInfo?.['__additional_condition__'] || ''}"`,
                questionId: '__free_input_preferred__',
              })) || []),
              // ✅ 추가: 마지막 자유 입력에서 추출한 피할 단점
              ...(freeInputAnalysis?.avoidAttributes?.map((attr: string) => ({
                condition: attr,
                conditionType: 'negative' as const,
                status: '회피됨' as const,
                evidence: `자유 입력에서 요청: "${collectedInfo?.['__additional_condition__'] || ''}"`,
                questionId: '__free_input_avoid__',
              })) || []),
            ]}
            // 내 상황과의 적합성 (contextMatch 데이터)
            initialContext={collectedInfo?.initialContext || collectedInfo?.context || ''}
            contextMatchData={analysis?.contextMatch ? {
              explanation: analysis.contextMatch.explanation || '',
              matchedPoints: analysis.contextMatch.matchedPoints || [],
            } : undefined}
            oneLiner={analysis?.oneLiner}
            preloadedReviews={(() => {
              // ✅ pcode를 문자열로 통일하여 조회
              const pcodeStr = String(selectedProduct.pcode || selectedProduct.id);
              const reviews = reviewsData[pcodeStr] || selectedProduct.reviews || [];
              console.log(`[PDP] Loading reviews for pcode ${pcodeStr}: reviewsData has ${reviewsData[pcodeStr]?.length || 0}, product.reviews has ${selectedProduct.reviews?.length || 0}, using ${reviews.length}`);
              return reviews.map((r: any) => {
                const imgUrls = r.imageUrls || r.image_urls || null;
                return {
                  content: r.content || r.text || '',
                  rating: r.rating || 0,
                  author: r.author || r.nickname || null,
                  date: r.date || r.review_date || null,
                  mallName: r.mallName || r.mall_name || null,
                  imageUrls: imgUrls,
                  images: imgUrls,  // ProductDetailModal에서 사용하는 필드명
                };
              });
            })()}
            danawaData={(() => {
              // pricesData 캐시 우선 사용 (프리페치된 데이터)
              const pcode = selectedProduct.pcode || selectedProduct.id;
              const cachedPrice = pricesData[pcode];
              const existingData = selectedProduct.danawaData;

              if (cachedPrice?.lowestPrice || existingData?.lowestPrice) {
                return {
                  lowestPrice: cachedPrice?.lowestPrice || existingData?.lowestPrice || selectedProduct.price || 0,
                  lowestMall: cachedPrice?.lowestMall || existingData?.lowestMall || '',
                  productName: existingData?.productName || selectedProduct.title || selectedProduct.name || '',
                  prices: cachedPrice?.prices || existingData?.prices || [],
                };
              }
              return undefined;
            })()}
          />
        );
      })()}

      {/* AI 도움 바텀시트 (하드필터/밸런스게임) */}
      {aiHelperData && (
        <AIHelperBottomSheet
          isOpen={isAIHelperOpen}
          onClose={() => {
            setIsAIHelperOpen(false);
            setAiHelperAutoSubmitText(undefined);
            setIsAIHelperAutoSubmit(false);
          }}
          questionType={aiHelperData.type}
          questionId={aiHelperData.questionId}
          questionText={aiHelperData.questionText}
          options={aiHelperData.options}
          category={categoryKey}
          categoryName={categoryName}
          userSelections={getUserSelections()}
          onSelectOptions={(selectedOptions) => {
            // AI가 추천한 옵션들로 교체
            setMessages(prev => {
              const newMessages = prev.map(m => {
                if (m.id === aiHelperData.questionId) {
                  return { ...m, selectedOptions: selectedOptions };
                }
                return m;
              });

              // 입력창 업데이트
              if (selectedOptions.length > 0) {
                setInputValue(selectedOptions.join(', '));
                setBarAnimationKey(prev => prev + 1);
                setIsHighlighting(true);
              }

              return newMessages;
            });
            setIsAIHelperOpen(false);
          }}
          autoSubmitText={aiHelperAutoSubmitText}
          autoSubmitContext={isAIHelperAutoSubmit}
        />
      )}

      {/* 단점 필터 AI 도움 바텀시트 */}
      <NegativeFilterAIHelperBottomSheet
        isOpen={isNegativeAIHelperOpen}
        onClose={() => {
          setIsNegativeAIHelperOpen(false);
          setAiHelperAutoSubmitText(undefined);
        }}
        options={(() => {
          // 현재 메시지 찾기 (가장 최신의 단점 질문)
          const latestMsg = [...messages].reverse().find(
            msg => msg.role === 'assistant' &&
                   msg.negativeFilterOptions &&
                   !msg.isFinalized
          );
          // 현재 메시지의 옵션 반환
          return (latestMsg?.negativeFilterOptions || negativeOptions || []).map(opt => ({
            id: opt.id,
            label: opt.label,
            target_rule_key: opt.target_rule_key,
            exclude_mode: (opt.exclude_mode || 'drop_if_has') as 'drop_if_lacks' | 'drop_if_has',
          }));
        })()}
        category={categoryKey}
        categoryName={categoryName}
        userSelections={getUserSelections()}
        autoSubmitText={aiHelperAutoSubmitText}
        onSelectOptions={(selectedRuleKeys) => {
          // AI가 추천한 단점들을 선택
          setSelectedNegativeKeys(selectedRuleKeys);
          setIsNegativeAIHelperOpen(false);
        }}
      />

      {/* 다시 추천받기 플로팅 버튼 (추천 완료 상태에서 표시) */}
      {(phase === 'result' || phase === 'free_chat' || messages.some(m => !!m.resultProducts)) && !selectedProduct && (
        <div className="fixed inset-x-0 bottom-0 pointer-events-none z-[115]">
          <div className="max-w-[480px] mx-auto w-full relative h-full">
            {/* 회전하는 그라데이션 테두리 스타일 */}
            <style jsx>{`
              @property --angle {
                syntax: '<angle>';
                initial-value: 0deg;
                inherits: false;
              }

              @keyframes rotate {
                to {
                  --angle: 360deg;
                }
              }

              .gradient-border-button {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem 2rem;
                border-radius: 1rem;
                background: #111827;
                overflow: hidden;
              }

              .gradient-border-button.w-full {
                width: 100%;
              }

              .gradient-border-button::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 1rem;
                padding: 3px;
                background: conic-gradient(
                  from var(--angle),
                  #5855ff,
                  #5cdcdc,
                  #71c4fd,
                  #5855ff
                );
                -webkit-mask:
                  linear-gradient(#fff 0 0) content-box,
                  linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                animation: rotate 2s linear infinite;
                pointer-events: none;
                opacity: 0.5;
              }

              .gradient-border-button-inner {
                position: relative;
                z-index: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                background: transparent;
                border: none;
                cursor: pointer;
                font-weight: 700;
                font-size: 1rem;
                color: white;
              }
            `}</style>

      {/* Re-recommend Confirmation Modal */}
      <AnimatePresence>
        {showReRecommendModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReRecommendModal(false)}
              className="fixed inset-0 bg-black/60 z-[200]"
            />
            <div className="fixed inset-x-0 bottom-0 z-[210] p-4 pointer-events-none flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-[480px] space-y-3 pointer-events-auto pb-6"
              >
                {/* Action Buttons Container */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      logKnowledgeAgentReRecommendDifferentCategory(categoryKey || '', categoryName || '');
                      const parentTab = getParentCategoryTab(categoryName || '');
                      router.push(`/knowledge-agent/${parentTab}`);
                    }}
                    className="w-full h-[72px] bg-[#191D28]/80 border border-gray-800 rounded-[12px] flex items-center px-4 group active:scale-[0.98] transition-all backdrop-blur-[6px]"
                  >
                    <div className="w-[48px] h-[48px] bg-[#1A1C22]/50 rounded-[10px] flex items-center justify-center mr-4">
                      <ArrowsLeftRight size={22} weight="bold" className="text-blue-300" />
                    </div>
                    <span className="text-[14px] font-semibold text-gray-50 flex-1 text-left">
                      다른 카테고리 추천
                    </span>
                    <CaretRight size={18} weight="bold" className="text-gray-100 group-active:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={() => {
                      logKnowledgeAgentReRecommendSameCategory(categoryKey || '', categoryName || '');
                      // 로컬스토리지에서 저장된 결과 삭제
                      localStorage.removeItem(STORAGE_KEY);
                      window.location.href = `/knowledge-agent/${encodeURIComponent(categoryName || categoryKey || '')}`;
                    }}
                    className="w-full h-[72px] bg-[#191D28]/80 border border-gray-800 rounded-[12px] flex items-center px-4 group active:scale-[0.98] transition-all backdrop-blur-[6px]"
                  >
                    <div className="w-[48px] h-[48px] bg-[#1A1C22]/50 rounded-[10px] flex items-center justify-center mr-4">
                      <img src="/icons/ic-ai.svg" alt="" className="w-6 h-6" />
                    </div>
                    <span className="text-[14px] font-semibold text-gray-50 flex-1 text-left">
                      {categoryName} 처음부터 새로 추천
                    </span>
                    <CaretRight size={18} weight="bold" className="text-gray-100 group-active:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Cancel Button */}
                <button
                  onClick={() => setShowReRecommendModal(false)}
                  className="w-full h-[56px] bg-[#E2E2E7] rounded-[12px] text-[17px] font-bold text-[#4B4B4B] active:scale-[0.98] transition-all"
                >
                  취소
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Modal */}

            {!showReRecommendModal && !isChatLoading && (
              <div className="absolute right-4 z-[116] flex flex-row items-center gap-2 pointer-events-auto" style={{ bottom: '100px' }}>
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    logKnowledgeAgentReRecommendModalOpened(categoryKey || '', categoryName || '');
                    setShowReRecommendModal(true);
                  }}
                  className="px-6 py-3 rounded-2xl text-s font-semibold text-white flex items-center gap-2 shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #6947FF 0%, #907FFF 50%, #77A0FF 100%)' }}
                >
                  <motion.svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" animate={{ rotate: [0, -15, 15, -15, 0], y: [0, -2.5, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}>
                    <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="white" />
                  </motion.svg>
                  다시 추천받기
                </motion.button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      <SimpleConfirmModal
        isOpen={showExitConfirmModal}
        onClose={() => setShowExitConfirmModal(false)}
        title="메인 페이지로 돌아가시겠어요?"
        primaryLabel="돌아가기"
        primaryColor="text-red-500"
        onPrimaryClick={() => {
          import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
            logButtonClick('knowledge-agent-exit-confirm', 'confirm');
          });
          const parentTab = getParentCategoryTab(categoryName || '');
          router.push(`/knowledge-agent/${parentTab}`);
        }}
        secondaryLabel="취소"
      />
    </div>
  );
}

function MessageBubble({
  message,
  onOptionToggle,
  onProductClick,
  phase,
  inputRef,
  isLatestAssistantMessage,
  isInactive,
  selectedNegativeKeys,
  onNegativeKeyToggle,
  categoryKey,
  categoryName,
  userSelections,
  onAIHelperOpen,
  onPopularRecommend,
  onContextRecommend,
  negativeOptions,
  onNegativeAIHelperOpen,
  onFreeChat,
  onHardcutContinue,
  onHardcutComplete,
  showComparisonOnly,
  setShowComparisonOnly,
  pricesData,
  onAnalysisSummaryShow,
  reviewsData,
  webSearchProgress,
  // 🆕 필터 태그 관련 props
  selectedFilterTagIds,
  sortedResultProducts,
  filterTags,
  onFilterTagToggle,
}: {
  message: ChatMessage;
  onOptionToggle: (opt: string, messageId: string) => void;
  onProductClick: (product: any, tab?: 'price' | 'danawa_reviews') => void;
  phase: Phase;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  isLatestAssistantMessage?: boolean;
  isInactive?: boolean;
  selectedNegativeKeys: string[];
  onNegativeKeyToggle: (key: string) => void;
  categoryKey?: string;
  categoryName?: string;
  userSelections?: UserSelections;
  onAIHelperOpen?: (data: { questionId: string; questionText: string; options: any; type: 'hard_filter' | 'balance_game' | 'negative' }) => void;
  onPopularRecommend?: (query: string) => void;
  onContextRecommend?: (query: string) => void;
  negativeOptions?: NegativeOption[];
  onNegativeAIHelperOpen?: (autoSubmitText?: string) => void;
  onFreeChat?: (message: string) => void;
  onHardcutContinue?: () => void;
  onHardcutComplete?: () => void;
  showComparisonOnly: boolean;
  setShowComparisonOnly: (show: boolean) => void;
  pricesData?: Record<string, any>;
  onAnalysisSummaryShow?: () => void;
  reviewsData?: Record<string, any[]>;
  webSearchProgress?: {
    currentQuery?: string;
    completedQueries: string[];
    results: { trends?: string[]; pros?: string[]; cons?: string[]; buyingFactors?: string[] };
  };
  // 🆕 필터 태그 관련 props
  selectedFilterTagIds: Set<string>;
  sortedResultProducts: any[];
  filterTags: FilterTag[];
  onFilterTagToggle: (tagId: string) => void;
}) {
  const isUser = message.role === 'user';

  // 꼬리질문 여부 확인
  const isFollowUp = message.id?.startsWith('followup-q-');

  // 로딩 시작 시간 기록
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!message.isLoading) return;
    
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000);
    }, 100);
    
    return () => clearInterval(interval);
  }, [message.isLoading, startTime]);

  // 직접 추가 인라인 입력 상태
  const [isCustomInputActive, setIsCustomInputActive] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');
  const [addedCustomOption, setAddedCustomOption] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const activateCustomInput = useCallback(() => {
    if (isCustomInputActive) return;
    // 직접 입력 버튼 클릭 로깅
    if (categoryKey) {
      logKnowledgeAgentHardFilterSelection(
        categoryKey,
        categoryName || '',
        message.id,
        message.content,
        '직접 입력하기',
        true,
        0
      );
    }
    // 모바일 키보드 자동 호출을 위해 사용자 제스처 내에서 렌더+포커스
    flushSync(() => setIsCustomInputActive(true));
    const inputEl = customInputRef.current;
    if (inputEl) {
      inputEl.focus();
      inputEl.click();
    }
  }, [categoryKey, categoryName, isCustomInputActive, message.content, message.id]);

  // 직접 입력 모드 활성화 시 자동 포커스
  useEffect(() => {
    if (!isCustomInputActive) return;
    const inputEl = customInputRef.current;
    if (!inputEl) return;
    const rafId = requestAnimationFrame(() => {
      inputEl.focus();
    });
    return () => cancelAnimationFrame(rafId);
  }, [isCustomInputActive]);

  // 🆕 비교표용 선택된 상품 pcodes (2~3개)
  const [selectedComparisonPcodes, setSelectedComparisonPcodes] = useState<Set<string>>(() => {
    // 기본값: 상위 3개 선택
    const defaultPcodes = (message.resultProducts || []).slice(0, 3).map((p: any) => p.pcode || p.id);
    return new Set(defaultPcodes);
  });

  const toggleComparisonProduct = (pcode: string) => {
    setSelectedComparisonPcodes(prev => {
      const next = new Set(prev);
      if (next.has(pcode)) {
        // 0개까지 허용
        next.delete(pcode);
      } else {
        // 제한 없음
        next.add(pcode);
      }
      return next;
    });
  };

  if (!isUser && message.role === 'assistant' && message.reRecommendData) {
    return (
      <div id={message.id} data-message-id={message.id} className="scroll-mt-[52px]">
        <ResultChatMessage
          message={{
            id: message.id,
            role: 'assistant',
            content: message.content || '',
            timestamp: message.timestamp ?? 0,
            reRecommendData: message.reRecommendData,
          }}
          typing={message.typing}
          speed={10}
          isReRecommending={false} // knowledge-agent handles its own loading
          onTypingComplete={() => { }}
          onReRecommendConfirm={async () => {
            if (message.reRecommendData?.naturalLanguageCondition) {
              onFreeChat?.(message.reRecommendData.naturalLanguageCondition);
            }
          }}
          onReRecommendCancel={() => { }}
        />
      </div>
    );
  }

  return (
    <motion.div
      id={message.id}
      data-message-id={message.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isInactive ? 0.5 : 1, y: 0 }}
      className={`scroll-mt-[52px] flex ${isUser ? 'justify-end' : 'justify-start'} w-full ${isInactive ? 'pointer-events-none' : ''} transition-opacity duration-300`}
    >
      <div className={`${isUser ? 'max-w-[85%]' : 'w-full'} space-y-3`}>
        {!isUser && message.searchContext && (
          <SearchContextToggle searchContext={message.searchContext} />
        )}

        {!isUser && message.analysisData && categoryKey && (
          <AgenticLoadingPhase
            categoryName={categoryName || categoryKey}
            categoryKey={categoryKey}
            steps={message.analysisData.steps}
            crawledProducts={message.analysisData.crawledProducts}
            generatedQuestions={message.analysisData.generatedQuestions}
            isComplete={message.analysisData.isComplete}
            summary={message.analysisData.summary}
            onSummaryShow={onAnalysisSummaryShow}
            webSearchProgress={webSearchProgress}
          />
        )}

        {!isUser && message.hardcutData && (
          <div className="py-2">
            <HardcutVisualization
              totalBefore={message.hardcutData.totalBefore}
              totalAfter={message.hardcutData.totalAfter}
              filteredProducts={message.hardcutData.filteredProducts}
              appliedRules={message.hardcutData.appliedRules}
              onContinue={onHardcutContinue || (() => { })}
              onComplete={onHardcutComplete}
            />
          </div>
        )}

        {isUser ? (
          <div className="bg-gray-50 text-gray-800 rounded-[20px] px-5 py-2.5 text-[16px] font-medium min-h-[46px] flex items-center w-fit ml-auto leading-[1.4]">{message.content}</div>
        ) : message.content ? (
          <div className="w-full">
            {/* 실제 질문일 때만 헤더 표시 (options나 questionProgress가 있는 경우) */}
            {message.questionId !== 'final_guide' &&
             (!message.resultProducts || message.resultProducts.length === 0) &&
             (message.options || message.questionProgress) && (
              <div className="flex items-center justify-between mb-1 px-0.5">
                <span className="text-[16px] font-semibold text-gray-400">
                  {isFollowUp ? '추가 질문' : '구매 조건'}
                </span>
                {message.questionProgress && (
                  <span className="text-[12px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-[6px]">
                    {message.questionProgress.current}/{message.questionProgress.total}
                  </span>
                )}
              </div>
            )}
            {message.isLoading ? (
              <div className="flex items-center gap-2 -mt-6">
                <div
                  className="bg-white rounded-[20px] text-[16px] font-medium text-gray-600 leading-[1.4] break-keep w-fit"
                  style={{
                    animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.9, 1) infinite',
                    opacity: 0.85
                  }}
                >
                  {message.content}
                </div>
                <span className="text-[13px] font-mono text-gray-400 tabular-nums">
                  {elapsed.toFixed(1)}s
                </span>
              </div>
            ) : (
              <AssistantMessage
                content={message.content}
                typing={message.typing}
                speed={10}
                textClassName={
                  // 일반 채팅 응답 (질문이 아닌 경우): 단순 스타일
                  (!message.options && !message.questionProgress && message.questionId !== 'final_guide' && (!message.resultProducts || message.resultProducts.length === 0))
                    ? "text-[16px] font-medium text-gray-800 leading-[1.4] break-keep"
                    // final_guide나 결과 메시지: 단순 스타일
                    : (message.questionId === 'final_guide' || (message.resultProducts && message.resultProducts.length > 0))
                      ? "text-[16px] font-medium text-gray-800 leading-[1.4] break-keep"
                      // 실제 질문: 강조 스타일
                      : "text-[18px] font-semibold text-gray-900 leading-snug break-keep"
                }
                explanationClassName={
                  (!message.options && !message.questionProgress && message.questionId !== 'final_guide' && (!message.resultProducts || message.resultProducts.length === 0))
                    ? "text-[16px] font-medium text-gray-800 leading-[1.4]"
                    : (message.questionId === 'final_guide' || (message.resultProducts && message.resultProducts.length > 0))
                      ? "text-[16px] font-medium text-gray-800 leading-[1.4]"
                      : "text-[16px] font-medium text-gray-600 leading-[1.4]"
                }
                suffix={
                  // 실제 질문일 때만 * 표시
                  (message.options || message.questionProgress) &&
                  message.questionId !== 'final_guide' &&
                  (!message.resultProducts || message.resultProducts.length === 0)
                    ? <span className="text-blue-500"> *</span>
                    : null
                }
              />
            )}
          </div>
        ) : null}

        {!isUser && message.reportData && <ReportToggle reportData={message.reportData} />}

        {!isUser && message.options && message.options.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: isInactive ? 0.5 : 1 }} transition={{ delay: 0.5 }} className="space-y-2 pt-0 -mt-3">
            {/* 복수 선택 가능 안내 텍스트 */}
            <div className="mb-4">
              <span className="text-[14px] text-gray-400 font-medium">복수 선택 가능</span>
            </div>

            {(() => {
              // '상관없어요' 선택 여부 확인
              const hasNotCareSelected = message.selectedOptions?.some(selected =>
                selected === '상관없어요' || selected === '상관 없어요'
              );

              // 꼬리질문인 경우 옵션 리스트에 '상관없어요'가 없으면 추가 (UI용)
              const displayOptions = [...message.options];
              if (isFollowUp && !displayOptions.some(opt => opt === '상관없어요' || opt === '상관 없어요')) {
                displayOptions.push('상관없어요');
              }

              return displayOptions.map((opt, i) => {
                const isNotCareOption = opt === '상관없어요' || opt === '상관 없어요';
                // 다른 옵션이 하나라도 선택되었는지 확인
                const hasOtherOptionSelected = message.selectedOptions?.some(selected =>
                  selected !== '상관없어요' && selected !== '상관 없어요'
                );

                // '상관없어요'가 선택되었으면 다른 옵션들 비활성화
                // 다른 옵션이 선택되었으면 '상관없어요' 비활성화
                const shouldDisable = isInactive ||
                  (hasNotCareSelected && !isNotCareOption) ||
                  (hasOtherOptionSelected && isNotCareOption);

                return (
                  <OptionButton
                    key={i}
                    label={opt}
                    isSelected={message.selectedOptions?.includes(opt)}
                    isPopular={message.popularOptions?.includes(opt)}
                    onClick={() => {
                      const isSelected = !message.selectedOptions?.includes(opt);
                      const totalSelected = isSelected
                        ? (message.selectedOptions?.length || 0) + 1
                        : (message.selectedOptions?.length || 0) - 1;

                      // 옵션 토글 로깅 (logKAQuestionAnswered는 최종 제출 시에만 호출)
                      if (categoryKey) {
                        logKnowledgeAgentHardFilterSelection(
                          categoryKey,
                          categoryName || '',
                          message.id,
                          message.content,
                          opt,
                          isSelected,
                          totalSelected
                        );
                      }

                      onOptionToggle(opt, message.id);
                    }}
                    disabled={shouldDisable}
                  />
                );
              });
            })()}

            {/* 추가된 커스텀 옵션 (파란색 칩) */}
            {!isInactive && addedCustomOption && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full py-4 px-5 bg-blue-50 border border-blue-100 rounded-[12px] flex items-center justify-between"
              >
                <span className="text-[16px] font-medium text-blue-500">{addedCustomOption}</span>
                <button
                  onClick={() => {
                    // 커스텀 옵션 제거
                    onOptionToggle(addedCustomOption, message.id);
                    setAddedCustomOption(null);
                  }}
                  className="ml-2 p-1 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400">
                    <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </motion.div>
            )}

            {/* 직접 입력 버튼 - 맨 아래로 이동 */}
            {!isInactive && !addedCustomOption && (
              <div
                className="w-full py-4 px-5 relative transition-all cursor-pointer hover:bg-gray-50"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23D1D5DB' stroke-width='2' stroke-dasharray='6%2c 6' stroke-dashoffset='0' stroke-linecap='round'/%3e%3c/svg%3e")`,
                  borderRadius: '12px'
                }}
                onPointerDown={() => {
                  if (!isCustomInputActive) {
                    activateCustomInput();
                  }
                }}
                onClick={() => {
                  if (!isCustomInputActive) activateCustomInput();
                }}
              >
                {/* 항상 렌더되는 입력창: iOS 포커스 제한 우회 */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInputValue}
                    onChange={(e) => setCustomInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customInputValue.trim()) {
                        e.preventDefault();
                        onOptionToggle(customInputValue.trim(), message.id);
                        setAddedCustomOption(customInputValue.trim());
                        setCustomInputValue('');
                        setIsCustomInputActive(false);
                      } else if (e.key === 'Escape') {
                        setIsCustomInputActive(false);
                        setCustomInputValue('');
                      }
                    }}
                    placeholder="조건을 자유롭게 입력하세요"
                    className={`w-full bg-transparent text-[16px] text-gray-700 focus:outline-none pr-[120px] transition-opacity duration-150
                      ${isCustomInputActive ? 'opacity-100' : 'opacity-0'}`}
                    style={{ pointerEvents: isCustomInputActive ? 'auto' : 'none' }}
                  />
                  {/* 버튼 오버레이 */}
                  {!isCustomInputActive && (
                    <div className="absolute inset-0 flex items-center gap-2">
                      {/* <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-500">
                        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg> */}
                      <span className="text-[16px] font-medium text-blue-400">기타 - 직접 입력</span>
                    </div>
                  )}

                  {/* 입력 액션 버튼 */}
                  {isCustomInputActive && (
                    <div className="absolute right-[-12px] top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setIsCustomInputActive(false);
                          setCustomInputValue('');
                        }}
                        className="px-3 py-2 rounded-[10px] text-[14px] font-medium text-gray-500 hover:bg-gray-100 transition-all"
                      >
                        취소
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (customInputValue.trim()) {
                            onOptionToggle(customInputValue.trim(), message.id);
                            setAddedCustomOption(customInputValue.trim());
                            setCustomInputValue('');
                            setIsCustomInputActive(false);
                          }
                        }}
                        disabled={!customInputValue.trim()}
                        className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold transition-all
                          ${customInputValue.trim()
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-400'}`}
                      >
                        추가
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 선택 완료 버튼 제거 (하단 '다음' 버튼으로 대체) */}

          </motion.div>
        )}

        {/* 피하고 싶은 단점 질문 UI 제거 */}
        {/* {!isUser && message.negativeFilterOptions && message.negativeFilterOptions.length > 0 && (
          <div className="space-y-3">
            <NegativeFilterList
              data={{
                options: message.negativeFilterOptions.map(opt => ({
                  id: opt.id,
                  label: opt.label,
                  target_rule_key: opt.target_rule_key,
                  exclude_mode: (opt.exclude_mode || 'drop_if_has') as 'drop_if_lacks' | 'drop_if_has',
                })),
                selectedKeys: selectedNegativeKeys,
              }}
              onToggle={onNegativeKeyToggle}
              showAIHelper={false}
              category={categoryKey}
              categoryName={categoryName}
            />
          </div>
        )} */}

        {!isUser && message.resultProducts && message.resultProducts.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ delay: 0.3, duration: 0.5 }} className="space-y-4 pt-4">
            {/* 타이틀 및 비교표 토글 */}
            <div className="px-1 overflow-visible">
              <h3 className="text-[18px] font-bold text-gray-900 mb-3">
                조건에 맞는 {categoryName} 추천
              </h3>
              
              {/* 비교표 토글 */}
              <div className="relative flex items-center w-fit">
                <button
                  onClick={() => {
                    const newValue = !showComparisonOnly;
                    setShowComparisonOnly(newValue);
                    // 로깅
                    import('@/lib/logging/clientLogger').then(({ logKAComparisonToggle }) => {
                      logKAComparisonToggle(
                        categoryKey || '',
                        categoryName || '',
                        newValue,
                        message.resultProducts?.length || 0
                      );
                    });
                  }}
                  className={`flex items-center justify-between gap-2 h-[40px] px-3 rounded-lg transition-all duration-200 mb-2 ${
                    showComparisonOnly
                      ? 'bg-blue-50 border border-blue-100'
                      : 'bg-gray-50 border border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <motion.img 
                      src="/icons/ic-ai.svg" 
                      alt="" 
                      className="w-4 h-4"
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
                    <span className={`text-[16px] font-semibold transition-colors whitespace-nowrap ${
                      showComparisonOnly ? 'text-blue-500' : 'text-gray-600'
                    }`}>
                      비교표로 보기
                    </span>
                  </div>
                  <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
                    showComparisonOnly ? 'bg-blue-500' : 'bg-gray-300'
                  }`}>
                    <div
                      className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
                      style={{ transform: showComparisonOnly ? 'translateX(16px)' : 'translateX(0)' }}
                    />
                  </div>
                </button>

                {/* 상세 스펙 비교 말풍선 */}
                {!showComparisonOnly && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ 
                      opacity: 1, 
                      x: [0, 4, 0] 
                    }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{
                      opacity: { duration: 0.2 },
                      x: { 
                        duration: 2, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                      }
                    }}
                    className="absolute left-full ml-2 flex items-center mb-2 pointer-events-none z-[100]"
                  >
                    {/* 말풍선 꼬리 */}
                    <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-blue-500 shrink-0 mr-[-1px]" />
                    {/* 말풍선 본체 */}
                    <div className="bg-blue-500 px-2.5 py-1.5 rounded-md flex items-center justify-center">
                      <span className="text-white text-[12px] font-bold whitespace-nowrap leading-none">
                        상세 스펙 비교
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* 🆕 필터 태그 바 - AI 비교표 토글 아래 */}
              {filterTags.length > 0 && !showComparisonOnly && (
                <div className="mb-0">
                  <FilterTagBar
                    key={`filter-tags-${filterTags.length}`}
                    tags={filterTags}
                    selectedTagIds={selectedFilterTagIds}
                    onTagToggle={onFilterTagToggle}
                  />
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {!showComparisonOnly ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-0"
                >
                  {/* 🆕 필터 태그 선택에 따라 정렬된 제품 목록 사용 */}
                  {selectedFilterTagIds.size > 0 && sortedResultProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4">
                      <p className="text-[14px] text-gray-400 text-center leading-relaxed">
                        위 모든 조건을 만족하는 상품이 없어요.<br />
                        태그 조건을 조금만 바꿔보세요!
                      </p>
                    </div>
                  ) : (
                    (selectedFilterTagIds.size > 0 ? sortedResultProducts : message.resultProducts).map((product, index) => {
                    const title = product.name || product.title || '';
                    // 원래 추천 순위 유지 (재정렬되어도 변하지 않음)
                    const originalRank = (message.resultProducts || []).findIndex((p: any) => (p.pcode || p.id) === (product.pcode || product.id)) + 1;
                   // pricesData 캐시 우선 사용 (PDP와 동일한 가격)
                   const cachedPrice = pricesData?.[product.pcode || product.id];
                   const danawaPrice = product.danawaPrice;
                   const price = cachedPrice?.lowestPrice || (danawaPrice?.lowest_price && danawaPrice.lowest_price > 0 ? danawaPrice.lowest_price : product.price);
                   const rating = product.rating || product.averageRating || 0;
                   const reviewCount = product.reviewCount || 0;
                   
                   
                   // ✅ danawaRank: API 응답에서 직접 가져옴 (Supabase DB rank 컬럼)
                   const rawDanawaRank = product.danawaRank;
                   const danawaRank = typeof rawDanawaRank === 'string'
                     ? parseInt(rawDanawaRank.replace(/[^\d]/g, ''), 10)
                     : rawDanawaRank;
                   const hasDanawaRank = typeof danawaRank === 'number'
                     && Number.isFinite(danawaRank)
                     && danawaRank > 0;

                    // 리뷰 이미지 추출
                    const pcodeForReviews = String(product.pcode || product.id);
                    const productReviews = (reviewsData || {})[pcodeForReviews] || [];
                    const reviewImagesForCarousel: string[] = [];
                    for (const review of productReviews) {
                      const imgs = review.imageUrls || review.image_urls || review.images || [];
                      for (const img of imgs) {
                        if (reviewImagesForCarousel.length >= 4) break; // 제품 썸네일 제외 4장
                        if (img && !reviewImagesForCarousel.includes(img)) {
                          reviewImagesForCarousel.push(img);
                        }
                      }
                      if (reviewImagesForCarousel.length >= 4) break;
                    }

                    return (
                      <div 
                        key={product.pcode || product.id || index} 
                        className={`relative bg-white border-b border-gray-100 last:border-0 space-y-5 ${
                          index === 0 ? 'pt-2 pb-6' : 'py-6'
                        }`}
                      >
                        <div
                          className="flex gap-4 cursor-pointer"
                          onClick={() => onProductClick(product, 'price')}
                        >
                          {/* 제품 썸네일 캐러셀 */}
                          <PLPImageCarousel
                            productThumbnail={product.thumbnail}
                            reviewImages={reviewImagesForCarousel}
                            productTitle={title}
                            rank={originalRank}
                            maxImages={5}
                            autoScrollInterval={2000}
                            pauseAfterSwipe={3000}
                          />

                          {/* 제품 정보 */}
                          <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                            <h4 className="text-[14px] font-medium text-gray-800 leading-[1.4] line-clamp-2 mb-1">
                              {title}
                            </h4>
                            {/* {product.brand && (
                              <div className="text-[12px] text-gray-400 font-medium mb-1.5">
                                {product.brand}
                              </div>
                            )} */}

                            {/* 별점 & 리뷰 */}
                            <div className="flex items-center gap-1 mb-0">
                              <Image src="/icons/ic-star.png" width={14} height={14} alt="" />
                              <span className="text-[14px] font-bold text-gray-800">{rating.toFixed(1)}</span>
                              <span className="text-[14px] text-gray-400">({reviewCount.toLocaleString()})</span>
                            </div>

                            {/* 다나와 판매 랭킹 */}
                            {hasDanawaRank && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[13px] text-gray-400 font-medium">
                                  {categoryName} 인기순위 <span className="font-semibold text-gray-500">{danawaRank}위</span>
                                </span>
                              </div>
                            )}
                            {/* 가격 */}
                            {price && (
                              <div className="mt-2">
                                <span className="text-[14px] font-bold text-gray-600">최저</span> <span className="text-[16px] font-bold text-gray-900">{price.toLocaleString()}원</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 버튼 */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => onProductClick(product, 'price')}
                            className="flex-1 h-[40px] rounded-[12px] border border-gray-200 bg-white text-[14px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            자세히 보기
                          </button>
                          {/* <a
                            href={(pricesData && pricesData[product.pcode]?.lowestLink) || `https://prod.danawa.com/info/?pcode=${product.pcode || product.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 h-[40px] rounded-[12px] bg-[#1e2329] text-[14px] font-semibold text-white flex items-center justify-center hover:bg-black transition-colors"
                          >
                            최저가 구매하기
                          </a> */}
                        </div>

                        {/* 한줄 평 */}
                        {product.oneLiner && (
                          <div className="bg-gray-50 rounded-2xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/icons/ic-star.png" alt="" width={16} height={16} />
                                <span className="text-[15px] font-semibold text-gray-800">
                                  한줄 평
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  onProductClick(product, 'danawa_reviews');
                                }}
                                className="text-[13px] text-gray-400 hover:text-gray-300 font-medium underline transition-colors"
                              >
                                리뷰 모두보기
                              </button>
                            </div>
                            <p className="text-[14px] text-gray-800 leading-[1.6] font-medium">
                              {(() => {
                                // 마크다운 볼드 파싱 (**text**)
                                const parts = product.oneLiner.split(/(\*\*.*?\*\*)/g);
                                return parts.map((part: string, index: number) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={index} className="font-bold text-gray-800">{part.slice(2, -2)}</strong>;
                                  }
                                  return <span key={index}>{part}</span>;
                                });
                              })()}
                            </p>
                          </div>
                        )}

                        {/* 요약 섹션 */}
                        <div className="space-y-4">
                          {/* 🆕 조건 충족 태그 뱃지 */}
                          {(() => {
                            const tagScores = product.tagScores as Record<string, { score: 'full' | 'partial' | null }> | undefined;
                            if (!tagScores || filterTags.length === 0) return null;

                            // full 또는 partial인 태그만 표시
                            const matchedTags = filterTags.filter(tag => {
                              const scoreData = tagScores[tag.id];
                              return scoreData?.score === 'full' || scoreData?.score === 'partial';
                            });

                            if (matchedTags.length === 0) return null;

                            // full(○) 태그를 우선 배열 (좌측에)
                            const sortedMatchedTags = [...matchedTags].sort((a, b) => {
                              const aScore = tagScores[a.id]?.score === 'full' ? 0 : 1;
                              const bScore = tagScores[b.id]?.score === 'full' ? 0 : 1;
                              return aScore - bScore;
                            });

                            return (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {sortedMatchedTags.map(tag => {
                                  const scoreData = tagScores[tag.id];
                                  const isFull = scoreData?.score === 'full';
                                  const isPartial = scoreData?.score === 'partial';
                                  const isSelected = selectedFilterTagIds.has(tag.id);

                                  return (
                                    <span
                                      key={tag.id}
                                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[12px] font-medium transition-all ${
                                        isSelected
                                          ? 'ai-gradient-border text-[#6366F1]'
                                          : isFull
                                            ? 'bg-green-50 text-green-700'
                                            : 'bg-yellow-50 text-yellow-700'
                                      }`}
                                    >
                                      {isFull && <span className={`text-[10px] ${isSelected ? 'text-[#6366F1]' : 'text-green-700'}`}>●</span>}
                                      {isPartial && <span className={`text-[10px] ${isSelected ? 'text-[#6366F1]' : 'text-yellow-700'}`}>▲</span>}
                                      {tag.label}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }))}
                </motion.div>
              ) : (
                <motion.div
                  key="table"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* 🆕 상품 선택 UI */}
                  <div className="space-y-3">
                    <p className="text-[16px] font-medium text-gray-800">
                      비교하고 싶은 상품 3개를 선택하세요
                    </p>
                    <div className="flex gap-1.5 w-full">
                      {message.resultProducts.map((p: any) => {
                        const pcode = p.pcode || p.id;
                        const isSelected = selectedComparisonPcodes.has(pcode);
                        const title = p.name || p.title || '';
                        const isMaxSelected = selectedComparisonPcodes.size >= 3;
                        const isDisabled = !isSelected && isMaxSelected;
                        
                        return (
                          <button
                            key={pcode}
                            onClick={() => !isDisabled && toggleComparisonProduct(pcode)}
                            disabled={isDisabled}
                            className={`flex-1 min-w-0 flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
                              isSelected
                                ? 'bg-blue-50 ring-2 ring-blue-500'
                                : isDisabled
                                  ? 'bg-gray-50 opacity-40 cursor-not-allowed'
                                  : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <div className="w-[52px] h-[52px]">
                              {p.thumbnail ? (
                                <img
                                  src={p.thumbnail}
                                  alt={title}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center">
                                  <span className="text-[10px] text-gray-400">N/A</span>
                                </div>
                              )}
                            </div>
                            <span className={`text-[10px] font-medium leading-tight text-center line-clamp-2 ${
                              isSelected ? 'text-blue-700' : 'text-gray-600'
                            }`}>
                              {title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 비교표 (선택된 상품만) */}
                  <ProductComparisonGrid
                    products={message.resultProducts
                      .filter((p: any) => selectedComparisonPcodes.has(p.pcode || p.id))
                      .map((p: any) => ({
                        pcode: p.pcode || p.id,
                        name: p.name || p.title,
                        brand: p.brand || null,
                        price: p.price || null,
                        thumbnail: p.thumbnail || null,
                        raw: p,
                        rating: p.rating || p.averageRating || null,
                        reviewCount: p.reviewCount || null,
                        specs: p.specs || p.spec || {},
                        prosFromReviews: p.prosFromReviews || [],
                        consFromReviews: p.consFromReviews || [],
                        oneLiner: p.oneLiner || '',
                        productUrl: p.productUrl || '',
                        tagScores: p.tagScores || {}
                      }))}
                    categoryKey={categoryKey || ''}
                    categoryName={categoryName}
                    filterTags={filterTags}
                    onProductClick={onProductClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
