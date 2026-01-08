/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretLeft, CaretDown, CaretUp, Lightning,
  PaperPlaneRight
} from '@phosphor-icons/react/dist/ssr';
import {
  FcSearch,
  FcIdea,
  FcSurvey,
  FcPrevious,
  FcPositiveDynamic,
  FcClock,
  FcDataConfiguration,
  FcRight
} from "react-icons/fc";
import ProductDetailModal from '@/components/ProductDetailModal';
import { KnowledgeComparisonTable } from '@/components/knowledge-agent/KnowledgeComparisonTable';
import { AgenticLoadingPhase, createDefaultSteps, type AnalysisStep } from '@/components/knowledge-agent/AgenticLoadingPhase';
import { AssistantMessage, LoadingAnimation } from '@/components/recommend-v2';
import { V2ResultProductCard } from '@/components/recommend-v2/V2ResultProductCard';
import { InlineBudgetSelector } from '@/components/knowledge-agent/ChatUIComponents';
import { BalanceGameCarousel } from '@/components/recommend-v2/BalanceGameCarousel';
import { NegativeFilterList } from '@/components/recommend-v2/NegativeFilterList';
import { AIHelperButton } from '@/components/recommend-v2/AIHelperButton';
import { AIHelperBottomSheet } from '@/components/recommend-v2/AIHelperBottomSheet';
import { NegativeFilterAIHelperBottomSheet } from '@/components/recommend-v2/NegativeFilterAIHelperBottomSheet';
import type { BalanceQuestion as V2BalanceQuestion, UserSelections, TimelineStep } from '@/types/recommend-v2';
import { HardcutVisualization } from '@/components/knowledge-agent/HardcutVisualization';
import { ResultChatContainer } from '@/components/recommend-v2/ResultChatContainer';
import { ResultChatMessage } from '@/components/recommend-v2/ResultChatMessage';
import {
  logKnowledgeAgentReRecommendModalOpened,
  logKnowledgeAgentReRecommendSameCategory,
  logKnowledgeAgentReRecommendDifferentCategory,
  logKnowledgeAgentProductModalOpen,
  logKnowledgeAgentProductReviewClick,
  logKnowledgeAgentHardcutContinue,
  logKnowledgeAgentFinalInputSubmit,
  logKnowledgeAgentHardFilterSelection,
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

type Phase = 'loading' | 'report' | 'questions' | 'hardcut_visual' | 'balance' | 'negative_filter' | 'final_input' | 'result' | 'free_chat';

// ============================================================================
// Step Indicator Component (4단계 진행 표시 - recommend-v2 스타일)
// ============================================================================

const STEPS = [
  { id: 1, label: '트렌드 분석', phases: ['loading'] },
  { id: 2, label: '맞춤 질문', phases: ['questions', 'report'] },
  { id: 3, label: '선호도 파악', phases: ['hardcut_visual', 'balance', 'negative_filter', 'final_input'] },
  { id: 4, label: '추천 완료', phases: ['result', 'free_chat'] },
];

function StepIndicator({ currentPhase }: { currentPhase: Phase }) {
  const currentStepIndex = STEPS.findIndex(step => step.phases.includes(currentPhase));
  const currentStep = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  return (
    <div className="sticky top-16 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="w-full max-w-[480px] h-[49px] flex flex-col items-center bg-white/95 backdrop-blur-sm pt-[12px] pb-[10px] pointer-events-auto px-4 shadow-sm border-b border-gray-100/50">
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
  options: Array<{ value: string; label: string; description?: string }>;
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
  role: 'user' | 'assistant';
  content: string;
  options?: string[];
  selectedOptions?: string[]; // 복수 선택 저장
  isFinalized?: boolean;      // 선택 완료 여부 (지나간 질문)
  typing?: boolean;
  dataSource?: string;
  tip?: string;  // 💡 팁 (reason) - 별도 표시
  searchContext?: { query: string; insight: string };  // 검색 컨텍스트 결과
  timestamp: number;
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
}

// ============================================================================
// Option Button Component (HardFilter Style - No Shadows)
// ============================================================================

function OptionButton({
  label,
  isSelected,
  onClick,
  description,
  disabled
}: {
  label: string;
  isSelected?: boolean;
  onClick: () => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.005 } : {}}
      whileTap={!disabled ? { scale: 0.99 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 px-5 rounded-[20px] border text-left transition-all flex items-center justify-between group ${
        isSelected
          ? 'bg-blue-50 border-blue-100'
          : 'bg-white border-gray-100 text-gray-700 hover:border-blue-200 hover:bg-blue-50/30'
      } ${disabled && !isSelected ? 'opacity-50 cursor-default' : ''}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className={`text-[16px] font-medium wrap-break-word ${isSelected ? 'text-blue-500' : 'text-gray-800'}`}>{label}</span>
        {description && (
          <span className={`text-[12px] font-medium wrap-break-word ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>{description}</span>
        )}
      </div>
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

  return { scrollToMessage };
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
  const { scrollToMessage } = useAutoScroll(mainRef);

  // State
  const [phase, setPhase] = useState<Phase>('loading');
  const [resultProducts, setResultProducts] = useState<any[]>([]);
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

  // Question flow
  const [questionTodos, setQuestionTodos] = useState<QuestionTodo[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionTodo | null>(null);
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  const [_progress, setProgress] = useState({ current: 0, total: 0 });

  // Navigation state
  const [canGoPrev, setCanGoPrev] = useState(false);

  // Balance game & Negative filter
  const [balanceQuestions, setBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [negativeOptions, setNegativeOptions] = useState<NegativeOption[]>([]);
  const [balanceAllAnswered, setBalanceAllAnswered] = useState(false); // 밸런스 게임 모든 질문 완료 여부
  const [balanceCurrentSelections, setBalanceCurrentSelections] = useState<Set<string>>(new Set()); // 현재 선택된 rule keys
  const [selectedNegativeKeys, setSelectedNegativeKeys] = useState<string[]>([]); // 단점 필터 선택된 rule keys (부모 컴포넌트에서 관리)

  // AI Helper (뭘 고를지 모르겠어요) 상태
  const [isAIHelperOpen, setIsAIHelperOpen] = useState(false);
  const [isNegativeAIHelperOpen, setIsNegativeAIHelperOpen] = useState(false);
  const [aiHelperAutoSubmitText, setAiHelperAutoSubmitText] = useState<string | undefined>(undefined);
  const [isAIHelperAutoSubmit, setIsAIHelperAutoSubmit] = useState(false);
  const [aiHelperData, setAiHelperData] = useState<{
    questionId: string;
    questionText: string;
    options: any;
    type: 'hard_filter' | 'balance_game';
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
  const [crawledProducts, setCrawledProducts] = useState<CrawledProductPreview[]>([]);

  // V2 Flow: 확장 크롤링 + 하드컷팅 + 리뷰 크롤링
  const [expandedProducts, setExpandedProducts] = useState<any[]>([]);
  const [hardCutProducts, setHardCutProducts] = useState<any[]>([]);
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
    additionalPros: Array<{ text: string; citations: number[] }>;
    cons: Array<{ text: string; citations: number[] }>;
  }>>({});
  const [isProductAnalysisLoading, setIsProductAnalysisLoading] = useState(false); // PDP 분석 로딩 상태
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
  
  // 최종 추천 단계의 타임라인 UX 헬퍼
  const runFinalTimelineUX = useCallback(async (candidateCount: number, userSelectionCount: number, negativeCount: number) => {
    setIsCalculating(true);
    setTimelineSteps([]);
    setLoadingProgress(0);

    const steps: TimelineStep[] = [];

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

    // 1단계: 선호도 분석
    const step1: TimelineStep = {
      id: 'step-1',
      title: '선호도 맞춤 분석 중',
      icon: '',
      details: [
        `${conditionText}을 기반으로 맞춤 추천을 준비하고 있어요.`,
        '제품 스펙과 실사용자 리뷰를 꼼꼼히 비교 분석합니다.'
      ],
      timestamp: Date.now(),
      status: 'completed'
    };
    steps.push(step1);
    setTimelineSteps([...steps]);
    setLoadingProgress(33);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2단계: 후보군 비교
    const candidateText = candidateCount > 0 ? `${candidateCount}개` : '전체';
    const step2: TimelineStep = {
      id: 'step-2',
      title: `${candidateText} 제품 꼼꼼히 비교 중`,
      icon: '',
      details: [
        '각 제품의 장단점을 하나하나 점수로 환산하고 있어요.',
        '가격 대비 만족도가 높은 제품을 찾고 있습니다.'
      ],
      timestamp: Date.now(),
      status: 'completed'
    };
    steps.push(step2);
    setTimelineSteps([...steps]);
    setLoadingProgress(66);
    await new Promise(resolve => setTimeout(resolve, 4000));

    // 3단계: 최종 TOP 3 선정
    const step3: TimelineStep = {
      id: 'step-3',
      title: '딱 맞는 TOP 3 선정 완료! 잠시만 더 기다려주세요 (총 소요시간 30초 내외)',
      icon: '',
      details: [
        '고객님께 가장 잘 맞을 것 같은 3가지 제품을 골랐어요.',
        '왜 이 제품을 추천하는지 상세한 이유도 함께 정리했습니다.'
      ],
      timestamp: Date.now(),
      status: 'completed'
    };
    steps.push(step3);
    setTimelineSteps([...steps]);
    setLoadingProgress(100);
    await new Promise(resolve => setTimeout(resolve, 4000));
  }, [categoryName]);

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

  // ============================================================================
  // Initialize
  // ============================================================================

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    logKAPageView(`ka-agent-${categoryName}`);
    initializeAgent();
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
      if (newMessage.role === 'user' ||
          (newMessage.role === 'assistant' && newMessage.content && !newMessage.analysisData && !newMessage.resultProducts && phase !== 'result')) {
        scrollToMessage(newMessage.id);
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToMessage, phase]);


  // 입력창 높이 자동 조절 및 하이라이트 리셋
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.max(56, Math.min(inputRef.current.scrollHeight, 160))}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (isHighlighting) {
      const timer = setTimeout(() => setIsHighlighting(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isHighlighting]);

  // 내비게이션 가능 여부 업데이트
  useEffect(() => {
    const assistantQuestions = messages.filter(m => m.role === 'assistant' && m.options);
    setCanGoPrev(assistantQuestions.length > 1);
  }, [messages]);

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
        await stepPromises['product_analysis'];
        updateStepAndMessage('product_analysis', {
            status: 'done',
            endTime: Date.now(),
            analyzedCount: localProducts.length,
            thinking: `${localProducts.length}개 상품 분석 완료`,
        });
        await new Promise(r => setTimeout(r, 1000)); // 완료 후 최소 1초 대기

        // 2. 웹검색 시작
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
        await new Promise(r => setTimeout(r, 500)); // 지연시간 단축 (1s -> 0.5s)

        // 3. 리뷰 추출 시작 (페이크 단계이므로 trendData 기반으로 즉시 처리)
        updateStepAndMessage('review_extraction', {
            status: 'active',
            startTime: Date.now(),
        });
        
        // 8-9초 걸리던 원인: questions 이벤트를 기다렸기 때문. 
        // 데이터는 이미 trendResult에 있으므로 인공적인 짧은 지연 후 완료 처리.
        await new Promise(r => setTimeout(r, 1500)); 
        
        updateStepAndMessage('review_extraction', {
            status: 'done',
            endTime: Date.now(),
            analyzedCount: localProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0),
            analyzedItems: [...(trendData?.pros || []).slice(0, 3), ...(trendData?.cons || []).slice(0, 2)],
            thinking: `리뷰 키워드 분석 완료`,
        });
        await new Promise(r => setTimeout(r, 500)); // 지연시간 단축

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
        const questionTodosFromQuestions = questionResult?.questionTodos || [];
        const firstQuestion = questionTodosFromQuestions[0];
        
        // 임시 상태 설정 (complete 이벤트 전에 미리 UI 업데이트)
        setIsLoadingComplete(true);
        const tempSummaryData = {
          productCount: localProducts.length,
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

        // ✅ avoid_negatives 질문의 옵션들을 negativeOptions로 설정
        const avoidNegativesQuestion = questionTodosFromQuestions.find(
          (q: any) => q.id === 'avoid_negatives' || q.id?.includes('negative') || q.id?.includes('avoid')
        );
        if (avoidNegativesQuestion?.options && avoidNegativesQuestion.options.length > 0) {
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

        // 첫 질문 즉시 표시 (리뷰 크롤링 기다리지 않음!)
        if (firstQuestion) {
          setPhase('questions'); // 첫 질문 렌더링 시점에 '맞춤 질문' 단계로 전환
          await new Promise(r => setTimeout(r, 300)); // 첫 질문 표시 전 짧은 대기
          const firstQuestionMsgId = `q_${firstQuestion.id}`;
          setMessages(prev => [...prev, {
            id: firstQuestionMsgId,
            role: 'assistant',
            content: firstQuestion.question,
            options: firstQuestion.options.map((o: any) => o.label),
            dataSource: firstQuestion.dataSource,
            tip: firstQuestion.reason,
            typing: true,
            timestamp: Date.now()
          }]);
          // 자동 스크롤은 useEffect에서 처리됨
        }

        // 백그라운드에서 complete 이벤트 데이터 업데이트 (리뷰 크롤링 완료 후)
        stepPromises['complete'].then((completeData: any) => {
          console.log('[SSE] Complete event received in background');
          const finalProducts = completeData?.products || localProducts;
          const updatedSummary = {
            productCount: finalProducts.length,
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
                case 'trend':
                  trendData = data.trendAnalysis;
                  stepDataResolvers['web_search']?.(data);
                  break;
                case 'first_batch_complete':
                  // 10개 상품 도착 시 '실시간 인기상품 분석' 토글 완료
                  console.log(`[SSE] First batch complete: ${data.count} products`);
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
            } catch (e) {}
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

      setHardcutResult({
        totalBefore: allProducts.length,
        totalAfter: allProducts.length,
        appliedRules,
      });
      setIsHardcutVisualDone(false);
      setPhase('hardcut_visual');
      // 자동 스크롤은 phase 변경 시 useEffect에서 처리됨

    } catch (error) {
      console.error('[V2 Flow] Error:', error);
    } finally {
      setIsTyping(false);
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
              } catch {}
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
   */
  const handleV2FinalRecommend = async (balanceSelections: any[], negativeSelections: string[]) => {
    // 새 아키텍처: hardCutProducts 대신 crawledProducts (120개 전체) 사용
    const candidates = crawledProducts.length > 0 ? crawledProducts : hardCutProducts;
    if (!v2FlowEnabled || candidates.length === 0) return null;

    console.log(`[V2 Flow] Generating final recommendations from ${candidates.length} candidates with ${Object.keys(reviewsData).length} products' reviews...`);

    try {
      const res = await fetch('/api/knowledge-agent/final-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          candidates: candidates, // 120개 전체 (hard-cut 제거)
          reviews: reviewsData,   // init API에서 미리 크롤링된 리뷰 사용
          collectedInfo,
          balanceSelections,
          negativeSelections,
        }),
      });

      const data = await res.json();
      if (data.success) {
        console.log(`[V2 Flow] Final recommendations: ${data.recommendations.length}`);

        // Top3 pcode 추출
        const allTop3Pcodes = data.recommendations
          .slice(0, 3)
          .map((r: any) => r.pcode)
          .filter(Boolean);

        // ⚡ Top3 확정 즉시 가격 프리페치 (백그라운드, 리뷰 크롤링보다 빠름)
        if (allTop3Pcodes.length > 0) {
          console.log(`[V2 Flow] 💰 가격 프리페치 시작: ${allTop3Pcodes.join(', ')}`);
          fetchPricesForTop3(allTop3Pcodes); // await 없이 백그라운드 실행
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
    const finalInputMsgId = `a_final_input_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: finalInputMsgId,
      role: 'assistant',
      content: '추천 상품들을 잘 추렸어요! 🎯\n\n마지막으로 추가하고 싶은 조건이 있으시면 자유롭게 입력해주세요. 없다면 아래 [바로 추천받기] 버튼을 눌러주세요!',
      typing: true,
      timestamp: Date.now()
    }]);
    // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
  };

  // 자연어 입력 후 최종 추천으로 진행
  const handleFinalInputSubmit = async (additionalCondition?: string) => {
    // ✅ 회피조건 추출 - savedNegativeLabels 우선 사용 (handleNegativeFilterComplete에서 저장됨)
    const avoidNegatives: string[] = savedNegativeLabels.length > 0
      ? savedNegativeLabels
      : selectedNegativeKeys
          .map(key => negativeOptions.find(opt => opt.target_rule_key === key)?.label)
          .filter((label): label is string => !!label);

    console.log('[V2 Flow] handleFinalInputSubmit - avoidNegatives:', avoidNegatives);

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
        avoidNegatives.length
      );
    } else {
      logKAQuestionSkipped(categoryKey, '마지막 자연어 입력');
      // 상세 로깅 추가
      logKnowledgeAgentFinalInputSubmit(
        categoryKey,
        categoryName,
        '',
        userSelectionCount,
        avoidNegatives.length
      );
    }
    
    console.log('[V2 Flow] Final input submitted:', additionalCondition || '(none)');
    
    // 추가 조건이 있으면 collectedInfo에 저장
    if (additionalCondition && additionalCondition.trim()) {
      const updatedInfo = { ...collectedInfo, __additional_condition__: additionalCondition.trim() };
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
      const candidateCount = crawledProducts.length || hardCutProducts.length;

      // 타임라인 UX와 실제 추천 생성을 병렬로 실행
      const uxPromise = runFinalTimelineUX(candidateCount, userSelectionCount, avoidNegatives.length);
      const apiPromise = handleV2FinalRecommend([], avoidNegatives);
      
      const [v2Recommendations] = await Promise.all([apiPromise, uxPromise]);

      if (v2Recommendations && v2Recommendations.length > 0) {
        // ✅ 디버그: API 응답에서 personalReason 확인
        console.log('[V2 Flow - FinalInput] API Response - oneLiner/personalReason:',
          v2Recommendations.map((r: any) => ({
            pcode: r.pcode,
            oneLiner: r.oneLiner?.slice(0, 30),
            personalReason: r.personalReason?.slice(0, 30)
          }))
        );

        // ✅ 먼저 결과 화면 렌더링 (init API의 기존 리뷰 사용)
        const mappedResultProducts = v2Recommendations.map((rec: any) => {
          const pcodeStr = String(rec.pcode);
          const existingReviews = reviewsData[pcodeStr] || [];
          return {
            ...rec.product,
            id: rec.pcode || rec.product?.pcode,
            pcode: rec.pcode || rec.product?.pcode,
            title: rec.product?.name || rec.product?.title,
            reasoning: rec.oneLiner || rec.reason,
            oneLiner: rec.oneLiner || '',
            personalReason: rec.personalReason || '',
            recommendationReason: rec.oneLiner || rec.reason,
            highlights: rec.highlights,
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            specs: rec.normalizedSpecs || rec.product?.specs || {},
            prosFromReviews: rec.prosFromReviews || rec.highlights || [],
            consFromReviews: rec.consFromReviews || rec.concerns || [],
            reviews: existingReviews,
          };
        });
        setResultProducts(mappedResultProducts);
        setPhase('result');
        const resultMsgId = `a_result_${Date.now()}`;
        setMessages(prev => [...prev, {
          id: resultMsgId,
          role: 'assistant',
          content: `${categoryName} 추천 결과입니다!`,
          resultProducts: mappedResultProducts,
          typing: true,
          timestamp: Date.now()
        }]);
        // ✅ 결과 메시지 상단으로 스크롤 (비교표 전체가 아닌 메시지 위치로)
        setTimeout(() => scrollToMessage(resultMsgId), 50);

        // ✅ 백그라운드에서 Top 3 리뷰 50개씩 크롤링 (PDP용) - 블로킹 없음
        const top3Pcodes = v2Recommendations.map((rec: any) => rec.pcode);
        console.log('[V2 Flow - FinalInput] 🔄 Background: Crawling 50 reviews for Top 3:', top3Pcodes);

        // 비동기로 실행 (await 없음)
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

        // Product Analysis 비동기 호출 (PDP 모달용)
        const fetchProductAnalysisForFinal = async () => {
          setIsProductAnalysisLoading(true);
          try {
            console.log('[V2 Flow - FinalInput] Fetching product analysis for PDP...');

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

            const analysisRes = await fetch('/api/knowledge-agent/product-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                categoryKey,
                categoryName,
                products: v2Recommendations.slice(0, 3).map((rec: any) => ({
                  pcode: rec.pcode,
                  name: rec.product?.name,
                  brand: rec.product?.brand,
                  price: rec.product?.price,
                  specSummary: rec.product?.specSummary,
                  recommendReason: rec.reason,
                  highlights: rec.highlights,
                  concerns: rec.concerns,
                  reviews: [],
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
                    additionalPros: a.additionalPros || [],
                    cons: a.cons || [],
                  };
                });
                setProductAnalyses(prev => ({ ...prev, ...newAnalyses }));
                console.log('[V2 Flow - FinalInput] Product analysis complete:', Object.keys(newAnalyses));
              }
            }
          } catch (e) {
            console.error('[V2 Flow - FinalInput] Product analysis failed:', e);
          } finally {
            setIsProductAnalysisLoading(false);
          }
        };
        fetchProductAnalysisForFinal();
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

    // V2 Flow: 하드컷 상품 기반으로 생성된 negativeOptions가 있으면 단점 필터로
    if (v2FlowEnabled && negativeOptions.length > 0) {
      setPhase('negative_filter');
      const negativeMsgId = `a_negative_${Date.now()}`;
      setMessages(prev => [...prev, {
        id: negativeMsgId,
        role: 'assistant',
        content: '취향을 파악했어요! 마지막으로 꼭 피하고 싶은 단점이 있으신가요? (복수 선택 가능)',
        negativeFilterOptions: negativeOptions,
        typing: true,
        timestamp: Date.now()
      }]);
      // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
      return;
    }

    // V2 플로우: negativeOptions 없으면 바로 결과로
    if (v2FlowEnabled && hardCutProducts.length > 0) {
      console.log('[V2 Flow] No negative options after balance, going to result');
      setIsTyping(true);

      try {
        // 타임라인 UX와 실제 추천 생성을 병렬로 실행
        const candidateCount = crawledProducts.length || hardCutProducts.length;
        const uxPromise = runFinalTimelineUX(candidateCount, balanceSelectionsForV2.length, 0);
        const apiPromise = handleV2FinalRecommend(balanceSelectionsForV2, []);
        
        const [v2Recommendations] = await Promise.all([apiPromise, uxPromise]);

        if (v2Recommendations && v2Recommendations.length > 0) {
          const mappedResultProducts = v2Recommendations.map((rec: any) => ({
            ...rec.product,
            id: rec.pcode || rec.product?.pcode,
            pcode: rec.pcode || rec.product?.pcode,
            title: rec.product?.name || rec.product?.title,
            reasoning: rec.reason,
            recommendationReason: rec.reason,
            highlights: rec.highlights,
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            specs: rec.normalizedSpecs || rec.product?.specs || {},
            prosFromReviews: rec.prosFromReviews || rec.highlights || [],
            consFromReviews: rec.consFromReviews || rec.concerns || [],
          }));
          setResultProducts(mappedResultProducts);
          setPhase('result');
          const resultMsgId = `a_result_${Date.now()}`;
          setMessages(prev => [...prev, {
            id: resultMsgId,
            role: 'assistant',
            content: `${categoryName} 추천 결과입니다! 선택하신 취향을 기반으로 최적의 상품을 선정했습니다.`,
            resultProducts: mappedResultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          // ✅ 결과 메시지 상단으로 스크롤 (비교표 전체가 아닌 메시지 위치로)
          setTimeout(() => scrollToMessage(resultMsgId), 50);
          return;
        }
      } finally {
        setIsTyping(false);
        setIsCalculating(false);
      }
    }

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
        const candidateCount = crawledProducts.length || hardCutProducts.length;
        const uxPromise = runFinalTimelineUX(candidateCount, savedBalanceSelections.length, selectedLabels.length);

        // ⚠️ 새 플로우: Top 3 먼저 선정 (리뷰 없이) → 그 후 리뷰 크롤링
        console.log('[V2 Flow] Step 1: Selecting Top 3 without reviews...');
        const v2Recommendations = await handleV2FinalRecommend(savedBalanceSelections, selectedLabels);

        if (v2Recommendations && v2Recommendations.length > 0) {
          // ✅ 디버그: API 응답에서 personalReason 확인
          console.log('[V2 Flow] API Response - oneLiner/personalReason:',
            v2Recommendations.map((r: any) => ({
              pcode: r.pcode,
              oneLiner: r.oneLiner?.slice(0, 30),
              personalReason: r.personalReason?.slice(0, 30)
            }))
          );

          // ✅ 먼저 결과 화면 렌더링 (init API의 기존 리뷰 사용)
          const mappedResultProducts = v2Recommendations.map((rec: any, idx: number) => {
            const pcodeStr = String(rec.pcode);
            const existingReviews = reviewsData[pcodeStr] || [];
            return {
              ...rec.product,
              id: rec.pcode || rec.product?.pcode,
              pcode: rec.pcode || rec.product?.pcode,
              title: rec.product?.name || rec.product?.title,
              rank: idx + 1,
              oneLiner: rec.oneLiner || '',
              personalReason: rec.personalReason || '',
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
            };
          });

          // 타임라인 UX 완료 대기
          await uxPromise;

          setResultProducts(mappedResultProducts);
          setPhase('result');
          const resultMsgId = `a_result_${Date.now()}`;
          setMessages(prev => [...prev, {
            id: resultMsgId,
            role: 'assistant',
            content: `${categoryName} 추천 결과입니다! 사용자님의 선택을 기반으로 최적의 상품 ${v2Recommendations.length}개를 선정했습니다.`,
            resultProducts: mappedResultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          // ✅ 결과 메시지 상단으로 스크롤 (비교표 전체가 아닌 메시지 위치로)
          setTimeout(() => scrollToMessage(resultMsgId), 50);

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
                    reviews: top3Reviews,
                    categoryName,
                    collectedInfo,
                    balanceSelections: savedBalanceSelections.map((s: any) => s.selectedLabel),
                    negativeSelections: selectedLabels,
                  }),
                });

                if (prosConsRes.ok) {
                  const prosConsData = await prosConsRes.json();
                  console.log('[V2 Flow] ✅ Background pros/cons generated');
                  // 필요시 상태 업데이트 가능
                }
              } catch (e) {
                console.error('[V2 Flow] Background pros/cons generation failed:', e);
              }

              // 3. Product Analysis (PDP용)
              setIsProductAnalysisLoading(true);
              try {
                const analysisRes = await fetch('/api/knowledge-agent/product-analysis', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    categoryKey,
                    categoryName,
                    products: v2Recommendations.slice(0, 3).map((rec: any) => ({
                      pcode: rec.pcode,
                      name: rec.product?.name,
                      brand: rec.product?.brand,
                      price: rec.product?.price,
                      specSummary: rec.product?.specSummary,
                      recommendReason: rec.reason,
                      highlights: rec.highlights,
                      concerns: rec.concerns,
                      reviews: (top3Reviews[String(rec.pcode)] || []).slice(0, 5),
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
                        additionalPros: a.additionalPros || [],
                        cons: a.cons || [],
                      };
                    });
                    setProductAnalyses(prev => ({ ...prev, ...newAnalyses }));
                    console.log('[V2 Flow] ✅ Background product analysis completed');
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
            } catch (e) {}
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
    const activeMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.options && !m.isFinalized);
    if (activeMsg) {
      // ✅ 피하고 싶은 단점 질문인지 확인하고 선택된 옵션들을 savedNegativeLabels에 저장
      // 메시지 ID가 'q_'로 시작하지 않으면 currentQuestion?.id 사용 (knowledge-agent 로직)
      const questionId = activeMsg.id?.startsWith('q_') ? activeMsg.id.slice(2) : (currentQuestion?.id || '');
      if (questionId === 'avoid_negatives' || questionId.includes('negative') || questionId.includes('avoid')) {
        const selectedOptions = activeMsg.selectedOptions || [];
        setSavedNegativeLabels(selectedOptions);
        console.log('[KA Flow] handleFreeChat - avoid_negatives detected, savedNegativeLabels set:', selectedOptions);
      }

      // 상세 로깅 추가
      if (categoryKey) {
        logKAQuestionAnswered(categoryKey, activeMsg.content, message);
        logKnowledgeAgentHardFilterSelection(
          categoryKey,
          categoryName,
          activeMsg.id,
          activeMsg.content,
          message,
          true,
          0
        );
      }
      setMessages(prev => prev.map(m => m.id === activeMsg.id ? { ...m, isFinalized: true } : m));
    }

    const newMsgId = `u_${Date.now()}`;
    setMessages(prev => [...prev, { id: newMsgId, role: 'user', content: message, timestamp: Date.now() }]);
    setInputValue('');

    // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨

    await fetchChatStream({ 
      categoryKey, 
      userMessage: message, 
      conversationHistory: messages.map(m => ({ role: m.role, content: m.content })), 
      phase: phase === 'result' ? 'free_chat' : phase, 
      questionTodos, 
      collectedInfo,
      currentQuestionId: activeMsg?.id?.startsWith('q_') ? activeMsg.id.slice(2) : currentQuestion?.id,
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
          const processingMsgId = `a_processing_${Date.now()}`;
          setMessages(prev => [...prev, {
            id: processingMsgId,
            role: 'assistant',
            content: '응답해주신 내용을 바탕으로 딱 맞는 상품을 골라내고 있어요...',
            typing: true,
            timestamp: Date.now()
          }]);
          // 자동 스크롤은 messages 변경 시 useEffect에서 처리됨
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
        // ✅ 결과 메시지 상단으로 스크롤 (비교표 전체가 아닌 메시지 위치로)
        setTimeout(() => scrollToMessage(chatResultMsgId), 50);
      } else {
        // 일반 AI 응답 로깅
        logKAChatMessage(categoryKey, userMessage, data.content);

        setMessages(prev => [...prev, {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: data.content,
          options: data.options,
          dataSource: data.dataSource,
          tip: data.tip,
          searchContext: data.searchContext || null,
          typing: true,
          timestamp: Date.now()
        }]);
      }
    }
  };

  // 현재 활성화된 질문의 선택된 옵션 개수 확인
  const activeQuestion = [...messages].reverse().find(m => m.role === 'assistant' && m.options && !m.isFinalized);
  const selectedCount = activeQuestion?.selectedOptions?.length || 0;

  return (
    <div className="h-screen bg-[#F8F9FB] flex flex-col font-sans overflow-hidden">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white shadow-2xl shadow-gray-200/50 min-h-0">
        <header className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-gray-50/50 px-4 h-16 flex items-center justify-between">
          <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={() => setShowExitConfirmModal(true)} className="p-2.5 -ml-2.5 rounded-full hover:bg-gray-50 transition-colors">
            <FcPrevious size={20} />
          </motion.button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-black text-[15px] text-gray-900 tracking-tight">{categoryName} 추천받기</span>
          </div>
          <div className="w-10" />
        </header>

        {/* 스텝 인디케이터 (4단계) - 항상 상단 플로팅 */}
        <StepIndicator currentPhase={phase} />

        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-0 bg-white relative transition-all duration-300" style={{ paddingBottom: '500px' }}>
          <div className="space-y-8 pt-2">
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onOptionToggle={handleOptionToggle}
                onProductClick={handleProductClick}
                phase={phase}
                inputRef={inputRef}
                isLatestAssistantMessage={msg.role === 'assistant' && (msg.options || msg.negativeFilterOptions) && !msg.isFinalized}
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
                  setAiHelperData({
                    questionId: msg.id,
                    questionText: msg.content,
                    options: msg.options!.map(o => ({ value: o, label: o })),
                    type: 'hard_filter'
                  });
                  setAiHelperAutoSubmitText(query);
                  setIsAIHelperOpen(true);
                }}
                onContextRecommend={(query) => {
                  setAiHelperData({
                    questionId: msg.id,
                    questionText: msg.content,
                    options: msg.options!.map(o => ({ value: o, label: o })),
                    type: 'hard_filter'
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
                />
            ))}

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

            {/* 하드컷팅 시각화 단계 */}
            {phase === 'hardcut_visual' && hardcutResult && (
              <motion.div
                data-message-id="hardcut-visual"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-4 scroll-mt-[52px]"
              >
                <HardcutVisualization
                  totalBefore={hardcutResult.totalBefore}
                  totalAfter={hardcutResult.totalAfter}
                  filteredProducts={crawledProducts.slice(0, 20).map(p => ({
                    pcode: p.pcode,
                    name: p.name,
                    brand: p.brand || '',
                    price: p.price || 0,
                    thumbnail: p.thumbnail,
                    matchScore: 0,
                    matchedConditions: [],
                  }))}
                  appliedRules={hardcutResult.appliedRules}
                  onContinue={handleHardcutContinue}
                  onComplete={() => setIsHardcutVisualDone(true)}
                />
              </motion.div>
            )}

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
        </main>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-[110] bg-gradient-to-t from-white via-white/95 to-transparent">
            {/* Navigation Buttons (Prev Only) */}
            {activeQuestion && canGoPrev && !isTyping && (
              <div className="flex mb-4">
                <button
                  onClick={handlePrevStep}
                  className="w-[80px] py-3.5 bg-white text-gray-500 border border-gray-100 rounded-2xl text-[14px] font-bold hover:bg-gray-50 transition-all flex items-center justify-center"
                >
                  이전
                </button>
              </div>
            )}

            {/* 하드컷팅 시각화 완료 시 버튼 */}
            {phase === 'hardcut_visual' && isHardcutVisualDone && !isTyping && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, translateY: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleHardcutContinue}
                className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 group transition-all"
              >
               
                <span className="text-[16px] tracking-tight">최종 구매 보고서 보기</span>
              </motion.button>
            )}

            {/* 마지막 자연어 입력 단계 */}
            {phase === 'final_input' && !isTyping && (
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { 
                      if (e.key === 'Enter' && !e.shiftKey) { 
                        e.preventDefault(); 
                        if (inputValue.trim()) {
                          handleFinalInputSubmit(inputValue);
                          setInputValue('');
                        }
                      } 
                    }}
                    placeholder="추가 조건을 자유롭게 입력하세요... (선택)"
                    className="w-full min-h-[56px] max-h-[120px] py-4 px-5 rounded-2xl bg-white border border-gray-200 text-[15px] placeholder:text-gray-400 focus:outline-none focus:border-blue-400 transition-all resize-none"
                    rows={1}
                  />
                </div>
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    handleFinalInputSubmit(inputValue.trim() || undefined);
                    setInputValue('');
                  }}
                  className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  <span className="text-[16px] tracking-tight">
                    {inputValue.trim() ? '조건 추가하고 추천받기' : '바로 추천받기'}
                  </span>
                </motion.button>
              </div>
            )}

            {/* 피하고 싶은 단점 선택 완료 버튼 */}
            {phase === 'negative_filter' && !isTyping && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, translateY: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  // selectedNegativeKeys에서 negativeOptions를 사용하여 레이블로 변환
                  const selectedLabels = selectedNegativeKeys
                    .map(key => negativeOptions.find(opt => opt.target_rule_key === key)?.label)
                    .filter((label): label is string => !!label);
                  console.log('[V2 Flow] Negative filter complete - selectedLabels:', selectedLabels);
                  handleNegativeFilterComplete(selectedLabels);
                }}
                className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 group transition-all"
              >
                <span className="text-[16px] tracking-tight">
                  {selectedNegativeKeys.length > 0 
                    ? `${selectedNegativeKeys.length}개 선택 완료` 
                    : '선택 없이 다음으로'}
                </span>
                <FcRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
            )}

            {phase === 'result' && !showReRecommendModal ? (
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
            ) : phase !== 'hardcut_visual' && phase !== 'final_input' && phase !== 'negative_filter' && phase !== 'result' && (
              <div className="relative group">
                <div className="absolute -inset-6 -z-10 blur-[40px] opacity-40 pointer-events-none group-focus-within:opacity-70 transition-opacity duration-500" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.2) 50%, transparent 100%)' }} />
                <motion.div 
                  key={barAnimationKey}
                  initial={barAnimationKey > 0 ? { scale: 1.02, borderColor: '#3b82f6', boxShadow: '0 0 20px rgba(59, 130, 246, 0.1)' } : {}}
                  animate={{ scale: 1, borderColor: 'rgba(229, 231, 235, 0.8)', boxShadow: '0 10px 40px rgba(0,0,0,0.04)' }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="relative w-full overflow-hidden rounded-[24px] border border-gray-200/80 focus-within:border-blue-400/50 flex items-end bg-white focus-within:shadow-[0_10px_50px_rgba(59,130,246,0.12)] transition-all duration-300"
                >
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFreeChat(inputValue); } }}
                    placeholder={`무엇이든 물어보세요...`}
                    className={`relative z-10 w-full min-h-[56px] max-h-[160px] py-[15px] pl-5 pr-14 rounded-[24px] bg-transparent text-[16px] placeholder:text-gray-300 placeholder:font-medium focus:outline-none transition-all resize-none overflow-y-auto whitespace-pre-line ${
                      isHighlighting 
                        ? 'text-blue-600 font-bold' 
                        : 'text-gray-800 font-medium'
                    }`}
                    disabled={isTyping}
                    rows={1}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleFreeChat(inputValue)}
                    disabled={!inputValue.trim() || isTyping}
                    className={`absolute right-2 bottom-2 w-10 h-10 z-20 flex items-center justify-center rounded-full transition-all ${inputValue.trim() ? 'bg-gray-900' : 'bg-gray-50'} disabled:opacity-50`}
                  >
                    {isTyping ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PaperPlaneRight size={20} weight="fill" className={inputValue.trim() ? 'text-white' : 'text-gray-300'} />}
                  </motion.button>
                </motion.div>
              </div>
            )}
          </div>
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
          onClose={() => setSelectedProduct(null)}
          isAnalysisLoading={isProductAnalysisLoading}
          // V2 조건 충족도 평가 ("왜 추천했나요?", "선호 속성", "피할 단점" 표시용)
          selectedConditionsEvaluation={analysis?.selectedConditionsEvaluation?.map((e: any) => ({
            condition: e.condition,
            conditionType: e.conditionType as 'hardFilter' | 'balance' | 'negative',
            status: e.status as '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨',
            evidence: e.evidence || '',
            tradeoff: e.tradeoff,
            questionId: e.questionId,
          })) || []}
          // 내 상황과의 적합성 (contextMatch 데이터)
          initialContext={collectedInfo?.initialContext || collectedInfo?.context || ''}
          contextMatchData={analysis?.contextMatch ? {
            explanation: analysis.contextMatch.explanation || '',
            matchedPoints: analysis.contextMatch.matchedPoints || [],
          } : undefined}
          preloadedReviews={(() => {
            // ✅ pcode를 문자열로 통일하여 조회
            const pcodeStr = String(selectedProduct.pcode || selectedProduct.id);
            const reviews = reviewsData[pcodeStr] || selectedProduct.reviews || [];
            console.log(`[PDP] Loading reviews for pcode ${pcodeStr}: reviewsData has ${reviewsData[pcodeStr]?.length || 0}, product.reviews has ${selectedProduct.reviews?.length || 0}, using ${reviews.length}`);
            return reviews.map((r: any) => ({
              content: r.content || r.text || '',
              rating: r.rating || 0,
              author: r.author || r.nickname || null,
              date: r.date || r.review_date || null,
              mallName: r.mallName || r.mall_name || null,
            }));
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
        onClose={() => setIsNegativeAIHelperOpen(false)}
        options={negativeOptions.map(opt => ({
          id: opt.id,
          label: opt.label,
          target_rule_key: opt.target_rule_key,
          exclude_mode: (opt.exclude_mode || 'drop_if_has') as 'drop_if_lacks' | 'drop_if_has',
        }))}
        category={categoryKey}
        categoryName={categoryName}
        userSelections={getUserSelections()}
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

            {/* 배경 오버레이 */}
            <AnimatePresence>
              {showReRecommendModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[116] pointer-events-auto"
                  onClick={() => setShowReRecommendModal(false)}
                />
              )}
            </AnimatePresence>

            {/* 모달 옵션 버튼들 */}
            <AnimatePresence>
              {showReRecommendModal && (
                <div
                  className="absolute right-4 z-[117] flex flex-col items-end gap-2 pointer-events-auto"
                  style={{ bottom: '100px' }}
                >
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.05 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      logKnowledgeAgentReRecommendDifferentCategory(categoryKey || '', categoryName || '');
                      const parentTab = getParentCategoryTab(categoryName || '');
                      router.push(`/knowledge-agent/${parentTab}`);
                    }}
                    className="px-4 py-3 bg-white/95 backdrop-blur-sm rounded-2xl text-sm font-semibold text-gray-700 flex items-center gap-2 shadow-lg border border-gray-100/50"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    다른 카테고리
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      logKnowledgeAgentReRecommendSameCategory(categoryKey || '', categoryName || '');
                      // 새로고침을 위해 window.location.href 사용
                      window.location.href = `/knowledge-agent/${encodeURIComponent(categoryName || categoryKey || '')}`;
                    }}
                    className="px-4 py-3 rounded-2xl text-sm font-semibold text-white flex items-center gap-2 shadow-lg"
                    style={{ background: 'linear-gradient(90deg, #6947FF 0%, #907FFF 50%, #77A0FF 100%)' }}
                  >
                    <motion.svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" animate={{ rotate: [0, -15, 15, -15, 0], y: [0, -2, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}>
                      <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="white" />
                    </motion.svg>
                    {categoryName} 처음부터
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.1 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowReRecommendModal(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100/80 backdrop-blur-sm"
                  >
                    취소
                  </motion.button>
                </div>
              )}
            </AnimatePresence>

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
                  className="px-4 py-3 rounded-2xl text-sm font-semibold text-white flex items-center gap-2 shadow-lg"
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
        <AnimatePresence>
          {showExitConfirmModal && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setShowExitConfirmModal(false)}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[320px] bg-white rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="px-6 pt-8 pb-6 text-center">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">메인 페이지로 돌아가겠어요?</h3>
                  <p className="text-sm text-gray-500">현재 진행 중인 추천이 초기화됩니다.</p>
                </div>
                <div className="flex flex-col gap-2 px-5 pb-5">
                  <button
                    onClick={() => {
                      import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                        logButtonClick('knowledge-agent-exit-confirm', 'confirm');
                      });
                      const parentTab = getParentCategoryTab(categoryName || '');
                      router.push(`/knowledge-agent/${parentTab}`);
                    }}
                    className="w-full py-4 rounded-2xl font-bold text-base text-white bg-[#111827] hover:bg-black transition-all active:scale-[0.98]"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => {
                      import('@/lib/logging/clientLogger').then(({ logButtonClick }) => {
                        logButtonClick('knowledge-agent-exit-confirm', 'cancel');
                      });
                      setShowExitConfirmModal(false);
                    }}
                    className="w-full py-3 rounded-2xl font-semibold text-sm text-gray-500 bg-transparent hover:bg-gray-100 transition-all active:scale-[0.98]"
                  >
                    취소
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
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
}: {
  message: ChatMessage;
  onOptionToggle: (opt: string, messageId: string) => void;
  onProductClick: (product: any, tab?: 'price' | 'danawa_reviews') => void;
  phase: Phase;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  isLatestAssistantMessage?: boolean;
  selectedNegativeKeys: string[];
  onNegativeKeyToggle: (key: string) => void;
  categoryKey?: string;
  categoryName?: string;
  userSelections?: UserSelections;
  onAIHelperOpen?: (data: { questionId: string; questionText: string; options: any; type: 'hard_filter' }) => void;
  onPopularRecommend?: (query: string) => void;
  onContextRecommend?: (query: string) => void;
  negativeOptions?: NegativeOption[];
  onNegativeAIHelperOpen?: (autoSubmitText?: string) => void;
  onFreeChat?: (message: string) => void;
}) {
  const isUser = message.role === 'user';

  const isInactive = !isUser && !isLatestAssistantMessage && message.options && message.options.length > 0;

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
          onTypingComplete={() => {}}
          onReRecommendConfirm={async () => {
            if (message.reRecommendData?.naturalLanguageCondition) {
              onFreeChat?.(message.reRecommendData.naturalLanguageCondition);
            }
          }}
          onReRecommendCancel={() => {}}
        />
      </div>
    );
  }

  return (
    <motion.div
      id={message.id}
      data-message-id={message.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`scroll-mt-[52px] flex ${isUser ? 'justify-end' : 'justify-start'} w-full ${isInactive ? 'opacity-40 pointer-events-none' : ''} transition-opacity duration-300`}
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
          />
        )}

        {isUser ? (
          <div className="bg-gray-50 text-gray-800 rounded-[20px] px-5 py-2.5 text-[16px] font-medium min-h-[46px] flex items-center w-fit ml-auto leading-relaxed">{message.content}</div>
        ) : message.content ? (
          <div className="w-full"><AssistantMessage content={message.content} typing={message.typing} speed={10} /></div>
        ) : null}

        {!isUser && message.reportData && <ReportToggle reportData={message.reportData} />}

        {!isUser && message.tip && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex items-start gap-3 bg-amber-50/50 border border-amber-100/50 rounded-[20px] px-4 py-3.5">
            <FcIdea size={20} className="shrink-0" />
            <p className="text-[14px] text-amber-900/80 leading-relaxed font-medium">{message.tip.replace(/^[💡\s]+/, '')}</p>
          </motion.div>
        )}

        {!isUser && message.dataSource && (
          <div className="flex items-center gap-2 mt-1 mb-2 px-1">
            <FcPositiveDynamic size={14} className="grayscale opacity-70" />
            <span className="text-[12px] font-bold text-gray-400 uppercase tracking-tighter">Source: {message.dataSource}</span>
          </div>
        )}

        {!isUser && message.options && message.options.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="space-y-2 pt-2">
            {isLatestAssistantMessage && (
              <div className="mb-3">
                <AIHelperButton
                  onClick={() => onAIHelperOpen?.({
                    questionId: message.id,
                    questionText: message.content,
                    options: message.options!.map(o => ({ value: o, label: o })),
                    type: 'hard_filter'
                  })}
                  label="뭘 고를지 모르겠어요"
                  questionType="hard_filter"
                  questionId={message.id}
                  questionText={message.content}
                  category={categoryKey}
                  categoryName={categoryName}
                  hasContext={!!userSelections?.initialContext}
                  onPopularRecommend={() => onPopularRecommend?.("가장 많은 사람들이 구매하는게 뭔가요?")}
                  onContextRecommend={() => onContextRecommend?.("지금까지 입력한 정보로 추천해줘")}
                />
              </div>
            )}
            {message.options.map((opt, i) => (
              <OptionButton 
                key={i} 
                label={opt} 
                isSelected={message.selectedOptions?.includes(opt)} 
                onClick={() => {
                  const isSelected = !message.selectedOptions?.includes(opt);
                  const totalSelected = isSelected 
                    ? (message.selectedOptions?.length || 0) + 1 
                    : (message.selectedOptions?.length || 0) - 1;
                  
                  // 상세 로깅 추가
                  if (categoryKey) {
                    logKAQuestionAnswered(categoryKey, message.content, opt);
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
                disabled={isInactive} 
              />
            ))}
            {!isInactive && (!message.selectedOptions || message.selectedOptions.length === 0) && (
              <motion.button 
                whileHover={{ scale: 1.01 }} 
                whileTap={{ scale: 0.98 }} 
                onClick={() => {
                  // 상세 로깅 추가
                  if (categoryKey) {
                    logKAQuestionAnswered(categoryKey, message.content, '직접 입력하기 클릭');
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
                  
                  inputRef?.current?.focus(); 
                  setTimeout(() => { inputRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); 
                }} 
                className="w-full py-4 px-5 rounded-[20px] border border-dashed border-gray-200 text-left transition-all flex items-center justify-between group hover:border-blue-300 hover:bg-blue-50/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[15px] font-medium text-gray-800 group-hover:text-blue-600">직접 입력하기</span>
                  <span className="text-[12px] text-gray-400 group-hover:text-blue-400">궁금한 점이나 다른 답변</span>
                </div>
              </motion.button>
            )}
          </motion.div>
        )}

        {!isUser && message.negativeFilterOptions && message.negativeFilterOptions.length > 0 && (
          <div className="space-y-3">
            {isLatestAssistantMessage && (
              <AIHelperButton
                onClick={() => onNegativeAIHelperOpen?.()}
                label="뭘 고를지 모르겠어요"
                questionType="negative"
                questionId="negative_filter"
                questionText="꼭 피하고 싶은 단점이 있으신가요?"
                category={categoryKey}
                categoryName={categoryName}
                hasContext={!!userSelections?.initialContext}
                onPopularRecommend={() => {
                  onNegativeAIHelperOpen?.("가장 많은 사람들이 피하는 옵션이 뭔가요?");
                }}
                onContextRecommend={() => {
                  onNegativeAIHelperOpen?.("지금까지 입력한 정보로 추천해줘");
                }}
              />
            )}
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
              showAIHelper={false} // 이미 위에서 AIHelperButton을 직접 렌더링함
              category={categoryKey}
              categoryName={categoryName}
            />
          </div>
        )}

        {!isUser && message.resultProducts && message.resultProducts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-3 pt-4">
            <div className="flex items-center gap-2 px-1"><h3 className="font-bold text-gray-900">🛍️ 맞춤 추천 Top 3</h3></div>
            <div className="space-y-2">
              {message.resultProducts.slice(0, 3).map((product: any, i: number) => (
                <V2ResultProductCard
                  key={product.pcode || product.id || i}
                  product={{
                    pcode: product.pcode || product.id,
                    title: product.name || product.title,
                    brand: product.brand || null,
                    price: product.price || null,
                    thumbnail: product.thumbnail || null,
                    rank: i + 1,
                    spec: product.spec || {},
                    reviewCount: product.reviewCount || null,
                    averageRating: product.rating || product.averageRating || null,
                    recommendationReason: product.recommendReason || product.recommendationReason,
                    oneLiner: product.oneLiner || '',
                    personalReason: product.personalReason || '',
                    reviewProof: product.reviewProof || '',
                    baseScore: 0,
                    negativeScore: 0,
                    hardFilterScore: 0,
                    budgetScore: 0,
                    directInputScore: 0,
                    totalScore: 0,
                    matchedRules: [],
                    isOverBudget: false,
                    overBudgetAmount: 0,
                    overBudgetPercent: 0
                  }}
                  rank={i + 1}
                  categoryKey={categoryKey}
                  categoryName={categoryName}
                  onClick={() => onProductClick(product, 'price')}
                  onReviewClick={() => onProductClick(product, 'danawa_reviews')}
                />
              ))}
            </div>
            {message.resultProducts.length >= 2 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <KnowledgeComparisonTable
                  products={message.resultProducts.map((p: any) => ({ pcode: p.pcode || p.id, name: p.name || p.title, brand: p.brand || null, price: p.price || null, thumbnail: p.thumbnail || null, rating: p.rating || p.averageRating || null, reviewCount: p.reviewCount || null, specs: p.specs || p.spec || {}, specSummary: p.specSummary || '', prosFromReviews: p.prosFromReviews || [], consFromReviews: p.consFromReviews || [], oneLiner: p.oneLiner || '', comparativeOneLiner: p.comparativeOneLiner || '', recommendedFor: p.recommendedFor || '', recommendReason: p.recommendReason || '' }))}
                  categoryKey={categoryKey || ''}
                  categoryName={categoryName}
                  showRank={true}
                />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
