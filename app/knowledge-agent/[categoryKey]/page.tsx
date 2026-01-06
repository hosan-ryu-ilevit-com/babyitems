/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretLeft, CaretDown, CaretUp, CheckCircle, Spinner, Lightning,
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
  FcRight,
  FcCancel,
  FcCheckmark
} from "react-icons/fc";
import { KnowledgePDPModal } from '@/components/knowledge-agent/KnowledgePDPModal';
import { KnowledgeComparisonTable } from '@/components/knowledge-agent/KnowledgeComparisonTable';
import { AgenticLoadingPhase, createDefaultSteps, type AnalysisStep } from '@/components/knowledge-agent/AgenticLoadingPhase';
import { AssistantMessage } from '@/components/recommend-v2';
import { V2ResultProductCard } from '@/components/recommend-v2/V2ResultProductCard';
import { InlineBalanceCarousel, InlineNegativeFilter, InlineBudgetSelector } from '@/components/knowledge-agent/ChatUIComponents';
import { HardcutVisualization } from '@/components/knowledge-agent/HardcutVisualization';

// ============================================================================
// Types
// ============================================================================

type Phase = 'loading' | 'report' | 'questions' | 'hardcut_visual' | 'balance' | 'negative_filter' | 'result' | 'free_chat';

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
      <div className="flex flex-col gap-0.5">
        <span className={`text-[15px] font-medium ${isSelected ? 'text-blue-500' : 'text-gray-800'}`}>{label}</span>
        {description && (
          <span className={`text-[12px] font-medium ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>{description}</span>
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
// Main Component
// ============================================================================

export default function KnowledgeAgentPage() {
  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;
  const categoryName = decodeURIComponent(categoryKey);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // State
  const [phase, setPhase] = useState<Phase>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeSearchQueries, setActiveSearchQueries] = useState<string[]>([]);
  const [activeStatusMessage, setActiveStatusMessage] = useState<string | null>(null);

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

  // Results
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [crawledProducts, setCrawledProducts] = useState<CrawledProductPreview[]>([]);

  // V2 Flow: 확장 크롤링 + 하드컷팅 + 리뷰 크롤링
  const [expandedProducts, setExpandedProducts] = useState<any[]>([]);
  const [hardCutProducts, setHardCutProducts] = useState<any[]>([]);
  const [reviewsData, setReviewsData] = useState<Record<string, any[]>>({});
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [v2FlowEnabled] = useState(true); // V2 플로우 활성화 여부
  const [v2FlowStarted, setV2FlowStarted] = useState(false); // V2 플로우 시작 여부
  const [savedBalanceSelections, setSavedBalanceSelections] = useState<any[]>([]); // 밸런스 선택 저장
  const [hardcutResult, setHardcutResult] = useState<{
    totalBefore: number;
    totalAfter: number;
    appliedRules: Array<{ rule: string; matchedCount: number }>;
  } | null>(null); // 하드컷팅 결과 (시각화용)
  
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
    initializeAgent();
  }, [categoryKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        await new Promise(r => setTimeout(r, 1000)); // 완료 후 최소 1초 대기

        // 3. 리뷰 추출 시작 & 대기
        updateStepAndMessage('review_extraction', {
            status: 'active',
            startTime: Date.now(),
        });
        await stepPromises['review_extraction'];
        updateStepAndMessage('review_extraction', {
            status: 'done',
            endTime: Date.now(),
            analyzedCount: localProducts.reduce((sum: number, p: any) => sum + (p.reviewCount || 0), 0),
            analyzedItems: [...(trendData?.pros || []).slice(0, 3), ...(trendData?.cons || []).slice(0, 2)],
            thinking: `리뷰 키워드 분석 완료`,
        });
        await new Promise(r => setTimeout(r, 1000)); // 완료 후 최소 1초 대기

        // 4. 질문 생성 시작 & 대기
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
        await new Promise(r => setTimeout(r, 1000)); // 완료 후 최소 1초 대기

        // 최종 완료 처리
        const completeData = await stepPromises['complete'] as { 
          products?: any[]; 
          marketSummary?: { reviewCount?: number; topBrands?: string[]; topPros?: string[]; topCons?: string[]; priceRange?: { min: number; max: number } }; 
          trendAnalysis?: { trends?: any[]; sources?: any[]; top10Summary?: string; pros?: string[]; cons?: string[]; priceInsight?: string }; 
          questionTodos?: any[]; 
          currentQuestion?: any 
        };
        const finalProducts = completeData?.products || localProducts;
        setIsLoadingComplete(true);
        const summaryData = {
          productCount: finalProducts.length,
          reviewCount: completeData.marketSummary?.reviewCount || 0,
          topBrands: completeData.marketSummary?.topBrands || [],
          trends: completeData.trendAnalysis?.trends || [],
          sources: completeData.trendAnalysis?.sources || [],
        };
        setAnalysisSummary(summaryData);
        
        // 웹서치 context 저장 (밸런스게임/단점 생성용)
        setWebSearchContext({
          marketSummary: completeData.marketSummary,
          trendAnalysis: completeData.trendAnalysis,
        });
        setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
          ...m,
          analysisData: { steps: [...localSteps], crawledProducts: finalProducts, generatedQuestions: completeData.questionTodos, isComplete: true, summary: summaryData }
        } : m));
        setQuestionTodos(completeData.questionTodos || []);
        setCurrentQuestion(completeData.currentQuestion);
        setProgress({ current: 1, total: (completeData.questionTodos || []).length });
        setCrawledProducts(finalProducts);

        // V2 Flow: 질문 응답 중 백그라운드에서 확장 크롤링 시작
        if (v2FlowEnabled) {
          startBackgroundExpandCrawl(finalProducts);
        }

        if (completeData.currentQuestion) {
          await new Promise(r => setTimeout(r, 300)); // 첫 질문 표시 전 짧은 대기
          setMessages(prev => [...prev, {
            id: `q_${completeData.currentQuestion.id}`,
            role: 'assistant',
            content: completeData.currentQuestion.question,
            options: completeData.currentQuestion.options.map((o: any) => o.label),
            dataSource: completeData.currentQuestion.dataSource,
            tip: completeData.currentQuestion.reason,
            typing: true,
            timestamp: Date.now()
          }]);
        }
    };

    setPhase('questions');

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
                case 'questions':
                  // 리뷰 추출 데이터와 질문 데이터를 버퍼링
                  stepDataResolvers['review_extraction']?.(data);
                  stepDataResolvers['question_generation']?.(data);
                  break;
                case 'complete':
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
      const newMessages = prev.map(m => {
        if (m.id === messageId) {
          const currentSelected = m.selectedOptions || [];
          const isSelected = currentSelected.includes(option);
          const updatedSelected = isSelected 
            ? currentSelected.filter(o => o !== option)
            : [...currentSelected, option];
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
   * 백그라운드 확장 크롤링 (init 완료 직후 시작)
   * - 질문 답변하는 동안 백그라운드에서 120개까지 크롤링
   * - 질문 완료 시점에 이미 크롤링 완료되어 있음
   */
  const startBackgroundExpandCrawl = async (initialProducts: any[]) => {
    if (!v2FlowEnabled || isExpandCrawling || isExpandComplete) return;

    console.log('[V2 Flow] Starting background expand crawl...');
    setIsExpandCrawling(true);

    try {
      const existingPcodes = initialProducts.map((p: any) => p.pcode);
      const expandRes = await fetch('/api/knowledge-agent/expand-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          existingPcodes,
          limit: 120,
        }),
      });

      // SSE 스트리밍 처리
      const reader = expandRes.body?.getReader();
      const decoder = new TextDecoder();
      let allProducts: any[] = [...initialProducts];

      if (reader) {
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
                if (currentEvent === 'complete' && data.products) {
                  allProducts = [...initialProducts, ...data.products];
                  setExpandedProducts(allProducts);
                  console.log(`[V2 Flow] Background expand complete: ${allProducts.length} products`);
                }
              } catch {}
              currentEvent = '';
            }
          }
        }
      }

      setIsExpandComplete(true);
      console.log(`[V2 Flow] Background expand crawl finished: ${allProducts.length} products`);
    } catch (error) {
      console.error('[V2 Flow] Background expand crawl error:', error);
    } finally {
      setIsExpandCrawling(false);
    }
  };

  /**
   * V2 플로우 시작 (질문 완료 후)
   * - 이미 확장 크롤링이 완료되었으면 바로 하드컷팅
   * - 아직 진행 중이면 완료 대기 후 하드컷팅
   */
  const startV2Flow = async () => {
    if (!v2FlowEnabled) return;

    console.log('[V2 Flow] Starting hard cut phase...');
    setIsTyping(true);

    try {
      // 확장 크롤링 완료 대기 (이미 백그라운드에서 진행 중)
      let allProducts = expandedProducts.length > 0 ? expandedProducts : [...crawledProducts];

      // 확장 크롤링이 아직 진행 중이면 대기 (최대 10초)
      if (isExpandCrawling && expandedProducts.length === 0) {
        console.log('[V2 Flow] Waiting for background expand to complete...');
        const startWait = Date.now();
        while (isExpandCrawling && expandedProducts.length === 0 && Date.now() - startWait < 10000) {
          await new Promise(r => setTimeout(r, 500));
        }
        allProducts = expandedProducts.length > 0 ? expandedProducts : [...crawledProducts];
      }

      console.log(`[V2 Flow] Using ${allProducts.length} products for hard cut`);

      // 2. 하드컷팅 (최소 30개 + 0~5개 랜덤)
      const targetCount = 30 + Math.floor(Math.random() * 6);
      const hardCutRes = await fetch('/api/knowledge-agent/hard-cut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          products: allProducts,
          collectedInfo,
          targetCount: targetCount,
        }),
      });

      const hardCutData = await hardCutRes.json();
      if (hardCutData.success) {
        setHardCutProducts(hardCutData.filteredProducts);
        console.log(`[V2 Flow] Hard cut to ${hardCutData.filteredProducts.length} products`);

        // 3. 하드컷팅 결과 저장 및 시각화 단계로 전환
        setHardcutResult({
          totalBefore: allProducts.length,
          totalAfter: hardCutData.filteredProducts.length,
          appliedRules: hardCutData.appliedRules || [],
        });
        setPhase('hardcut_visual');

        // 4. 밸런스/단점 질문 생성 (하드컷팅된 15개 상품 기반 + 웹서치 context)
        // ⚠️ 리뷰 크롤링은 Top 3 선정 후에 3개만 대상으로 진행 (더 효율적)
        // ⚠️ 리뷰 크롤링 완료 전이므로 스펙 + 웹서치 context 기반으로 생성
        try {
          const dynamicQRes = await fetch('/api/knowledge-agent/generate-dynamic-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryName,
              hardcutProducts: hardCutData.filteredProducts,
              collectedInfo,
              webSearchContext, // 리뷰 대신 웹서치 context 전달
            }),
          });
          const dynamicQData = await dynamicQRes.json();
          if (dynamicQData.success) {
            // 중복 방지를 위한 이전 선택 키워드 추출
            const previousKeywords = Object.values(collectedInfo)
              .flatMap((v: string) => v.split(/[,\s]+/).map(s => s.trim().toLowerCase()))
              .filter(k => k.length > 1);

            // 밸런스 질문 필터링 (이전 선택과 겹치는 것 제거)
            let filteredBalance = dynamicQData.balanceQuestions || [];
            if (filteredBalance.length > 0 && previousKeywords.length > 0) {
              filteredBalance = filteredBalance.filter((q: any) => {
                const optAText = (q.option_A?.text || '').toLowerCase();
                const optBText = (q.option_B?.text || '').toLowerCase();
                // 둘 다 이전 키워드와 겹치면 제외
                const aOverlap = previousKeywords.some(k => optAText.includes(k));
                const bOverlap = previousKeywords.some(k => optBText.includes(k));
                if (aOverlap && bOverlap) {
                  console.log(`[V2 Flow] Filtered duplicate balance: ${q.title}`);
                  return false;
                }
                return true;
              });
            }
            if (filteredBalance.length > 0) {
              setBalanceQuestions(filteredBalance);
              console.log(`[V2 Flow] Generated ${filteredBalance.length} balance questions from hardcut products`);
            }

            // 단점 옵션 필터링 (이전 선택과 겹치는 것 제거)
            let filteredNegative = dynamicQData.negativeOptions || [];
            if (filteredNegative.length > 0 && previousKeywords.length > 0) {
              filteredNegative = filteredNegative.filter((n: any) => {
                const label = (n.label || '').toLowerCase();
                const overlap = previousKeywords.some(k => label.includes(k));
                if (overlap) {
                  console.log(`[V2 Flow] Filtered duplicate negative: ${n.label}`);
                  return false;
                }
                return true;
              });
            }
            if (filteredNegative.length > 0) {
              setNegativeOptions(filteredNegative);
              console.log(`[V2 Flow] Generated ${filteredNegative.length} negative options from hardcut products`);
            }
          }
        } catch (error) {
          console.error('[V2 Flow] Generate dynamic questions error:', error);
        }
      }

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
   * V2 최종 추천 생성 (리뷰 없이 스펙+선택 기반)
   * ⚠️ 리뷰 크롤링은 Top 3 선정 후에 별도로 진행
   */
  const handleV2FinalRecommend = async (balanceSelections: any[], negativeSelections: string[]) => {
    if (!v2FlowEnabled || hardCutProducts.length === 0) return null;

    console.log('[V2 Flow] Generating final recommendations (spec-based, no reviews)...');

    try {
      const res = await fetch('/api/knowledge-agent/final-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          candidates: hardCutProducts,
          reviews: {}, // 빈 객체 - 리뷰 없이 스펙+선택 기반 선정
          collectedInfo,
          balanceSelections,
          negativeSelections,
        }),
      });

      const data = await res.json();
      if (data.success) {
        console.log(`[V2 Flow] Final recommendations: ${data.recommendations.length}`);
        return data.recommendations;
      }
    } catch (error) {
      console.error('[V2 Flow] Final recommend error:', error);
    }

    return null;
  };

  /**
   * 하드컷팅 시각화에서 '계속' 클릭 시 밸런스/단점/결과 단계로 전환
   * - 밸런스 질문이 있으면 → 밸런스 단계
   * - 밸런스 없고 단점 옵션 있으면 → 단점 필터 단계
   * - 둘 다 없으면 → 바로 결과 단계
   */
  const handleHardcutContinue = async () => {
    // 1. 밸런스 질문이 있으면 밸런스 단계로
    if (balanceQuestions.length > 0) {
      setPhase('balance');
      setMessages(prev => [...prev, {
        id: `a_balance_${Date.now()}`,
        role: 'assistant',
        content: '이제 취향에 맞는 제품을 더 정확히 골라볼게요. 몇 가지 선택지 중에서 더 끌리는 쪽을 골라주세요!',
        typing: true,
        timestamp: Date.now()
      }]);
      return;
    }

    // 2. 밸런스 없고 단점 옵션이 있으면 단점 필터로
    if (negativeOptions.length > 0) {
      setPhase('negative_filter');
      setMessages(prev => [...prev, {
        id: `a_negative_${Date.now()}`,
        role: 'assistant',
        content: '꼭 피하고 싶은 단점이 있으신가요? (복수 선택 가능, 없으면 건너뛰기)',
        negativeFilterOptions: negativeOptions,
        typing: true,
        timestamp: Date.now()
      }]);
      return;
    }

    // 3. 둘 다 없으면 바로 결과로
    console.log('[V2 Flow] No balance/negative questions, going directly to result');
    setIsTyping(true);
    setActiveStatusMessage('최종 추천 상품 선정 중...');
    
    try {
      const v2Recommendations = await handleV2FinalRecommend([], []);
      if (v2Recommendations && v2Recommendations.length > 0) {
        setPhase('result');
        const resultProducts = v2Recommendations.map((rec: any) => ({
          ...rec.product,
          id: rec.pcode || rec.product?.pcode,
          title: rec.product?.name || rec.product?.title,
          reasoning: rec.reason,
          recommendReason: rec.reason,
          highlights: rec.highlights,
          concerns: rec.concerns,
          bestFor: rec.bestFor,
          specs: rec.normalizedSpecs || rec.product?.specs || {},
          prosFromReviews: rec.prosFromReviews || rec.highlights || [],
          consFromReviews: rec.consFromReviews || rec.concerns || [],
        }));
        setMessages(prev => [...prev, {
          id: `a_result_${Date.now()}`,
          role: 'assistant',
          content: `${categoryName} 추천 결과입니다! 선택하신 조건을 기반으로 최적의 상품을 선정했습니다.`,
          resultProducts,
          typing: true,
          timestamp: Date.now()
        }]);
      }
    } finally {
      setIsTyping(false);
      setActiveStatusMessage(null);
    }
  };

  const handleBalanceComplete = async (selections: Map<string, 'A' | 'B'>) => {
    const selectionsStr = Array.from(selections.entries())
      .map(([id, choice]) => {
        const q = balanceQuestions.find(bq => bq.id === id);
        return q ? (choice === 'A' ? q.option_A.text : q.option_B.text) : '';
      })
      .filter(Boolean).join(', ');

    // V2 Flow: 밸런스 선택 저장
    const balanceSelectionsForV2 = Array.from(selections.entries()).map(([id, choice]) => {
      const q = balanceQuestions.find(bq => bq.id === id);
      return {
        questionId: id,
        selectedOption: choice,
        selectedLabel: q ? (choice === 'A' ? q.option_A.text : q.option_B.text) : '',
        targetRuleKey: q ? (choice === 'A' ? q.option_A.target_rule_key : q.option_B.target_rule_key) : '',
      };
    });
    setSavedBalanceSelections(balanceSelectionsForV2);

    setMessages(prev => [...prev, { id: `u_balance_${Date.now()}`, role: 'user', content: `선택: ${selectionsStr}`, timestamp: Date.now() }]);

    // V2 Flow: 하드컷 상품 기반으로 생성된 negativeOptions가 있으면 단점 필터로
    if (v2FlowEnabled && negativeOptions.length > 0) {
      setPhase('negative_filter');
      setMessages(prev => [...prev, {
        id: `a_negative_${Date.now()}`,
        role: 'assistant',
        content: '취향을 파악했어요! 마지막으로 꼭 피하고 싶은 단점이 있으신가요? (복수 선택 가능)',
        negativeFilterOptions: negativeOptions,
        typing: true,
        timestamp: Date.now()
      }]);
      return;
    }

    // V2 플로우: negativeOptions 없으면 바로 결과로
    if (v2FlowEnabled && hardCutProducts.length > 0) {
      console.log('[V2 Flow] No negative options after balance, going to result');
      setIsTyping(true);
      setActiveStatusMessage('최종 추천 상품 선정 중...');
      
      try {
        const v2Recommendations = await handleV2FinalRecommend(balanceSelectionsForV2, []);
        if (v2Recommendations && v2Recommendations.length > 0) {
          setPhase('result');
          const resultProducts = v2Recommendations.map((rec: any) => ({
            ...rec.product,
            id: rec.pcode || rec.product?.pcode,
            title: rec.product?.name || rec.product?.title,
            reasoning: rec.reason,
            recommendReason: rec.reason,
            highlights: rec.highlights,
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            specs: rec.normalizedSpecs || rec.product?.specs || {},
            prosFromReviews: rec.prosFromReviews || rec.highlights || [],
            consFromReviews: rec.consFromReviews || rec.concerns || [],
          }));
          setMessages(prev => [...prev, {
            id: `a_result_${Date.now()}`,
            role: 'assistant',
            content: `${categoryName} 추천 결과입니다! 선택하신 취향을 기반으로 최적의 상품을 선정했습니다.`,
            resultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          return;
        }
      } finally {
        setIsTyping(false);
        setActiveStatusMessage(null);
      }
    }

    // Fallback: V2 비활성화 시 fetchChatStream 호출
    await fetchChatStream({ 
      categoryKey, 
      userMessage: JSON.stringify(Object.fromEntries(selections)), 
      collectedInfo, 
      phase: 'balance', 
      balanceQuestions 
    });
  };

  const handleNegativeFilterComplete = async (selectedLabels: string[]) => {
    const selectionsStr = selectedLabels.join(', ') || '없음';
    setMessages(prev => [...prev, { id: `u_negative_${Date.now()}`, role: 'user', content: selectedLabels.length > 0 ? `피하고 싶은 단점: ${selectionsStr}` : '특별히 없어요', timestamp: Date.now() }]);

    // V2 Flow: 하드컷팅된 상품이 있으면 V2 최종 추천 사용
    if (v2FlowEnabled && hardCutProducts.length > 0) {
      setIsTyping(true);
      setActiveStatusMessage('최종 후보군 리뷰 분석 중...');
      // ⚠️ 새 플로우: Top 3 먼저 선정 (리뷰 없이) → 그 후 리뷰 크롤링
      console.log('[V2 Flow] Step 1: Selecting Top 3 without reviews...');
      
      // ... (existing V2 logic remains same but needs typing control)
      // I'll wrap the existing V2 logic in a try-finally to handle typing state correctly
      try {
        const v2Recommendations = await handleV2FinalRecommend(savedBalanceSelections, selectedLabels);
        if (v2Recommendations && v2Recommendations.length > 0) {
          const top3Pcodes = v2Recommendations.map((rec: any) => rec.pcode);
          setActiveStatusMessage(`최종 ${v2Recommendations.length}개 후보 상세 분석 중...`);
          
          let top3Reviews: Record<string, any[]> = {};
          const reviewRes = await fetch('/api/knowledge-agent/crawl-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pcodes: top3Pcodes, maxPerProduct: 30 }),
          });
          
          const reader = reviewRes.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'complete' && data.reviews) {
                      top3Reviews = data.reviews;
                    } else if (data.type === 'progress') {
                      setActiveStatusMessage(`${data.completed}/${data.total} 상품 리뷰 수집 중...`);
                    }
                  } catch { /* ignore */ }
                }
              }
            }
          }
          
          setPhase('result');
          const resultProducts = v2Recommendations.map((rec: any) => {
            const productReviews = top3Reviews[rec.pcode] || [];
            return {
              ...rec.product, id: rec.pcode || rec.product?.pcode, title: rec.product?.name || rec.product?.title,
              reasoning: rec.reason, recommendReason: rec.reason, highlights: rec.highlights, concerns: rec.concerns,
              bestFor: rec.bestFor, reviewQuotes: rec.reviewQuotes || [], specs: rec.normalizedSpecs || rec.product?.specs || {},
              prosFromReviews: rec.prosFromReviews || rec.highlights || [], consFromReviews: rec.consFromReviews || rec.concerns || [],
              reviews: productReviews,
            };
          });
          setReviewsData(top3Reviews);
          setMessages(prev => [...prev, {
            id: `a_result_${Date.now()}`,
            role: 'assistant',
            content: `${categoryName} 추천 결과입니다! 사용자님의 선택을 기반으로 최적의 상품 ${v2Recommendations.length}개를 선정했습니다.`,
            resultProducts,
            typing: true,
            timestamp: Date.now()
          }]);
          return;
        }
      } finally {
        setIsTyping(false);
        setActiveStatusMessage(null);
      }
    }

    // Fallback: fetchChatStream 호출
    await fetchChatStream({ 
      categoryKey, 
      userMessage: selectionsStr, 
      collectedInfo, 
      phase: 'negative_filter' 
    });
  };

  const fetchChatStream = async (payload: any) => {
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
                handleChatResponse(data);
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
      setMessages(prev => prev.map(m => m.id === activeMsg.id ? { ...m, isFinalized: true } : m));
    }

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: message, timestamp: Date.now() }]);
    setInputValue('');

    await fetchChatStream({ 
      categoryKey, 
      userMessage: message, 
      conversationHistory: messages.map(m => ({ role: m.role, content: m.content })), 
      phase: phase === 'result' ? 'free_chat' : phase, 
      questionTodos, 
      collectedInfo,
      currentQuestionId: activeMsg?.id?.startsWith('q_') ? activeMsg.id.slice(2) : currentQuestion?.id
    });
  };

  const handleChatResponse = (data: any) => {
    if (data.success) {
      // Update state if returned
      if (data.questionTodos) setQuestionTodos(data.questionTodos);
      if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
      if (data.progress) setProgress(data.progress);
      if (data.currentQuestion) setCurrentQuestion(data.currentQuestion);

      if (data.phase === 'balance') {
        setBalanceQuestions(data.balanceQuestions || []);
        if (v2FlowEnabled && !v2FlowStarted) {
          setV2FlowStarted(true);
          setMessages(prev => [...prev, {
            id: `a_processing_${Date.now()}`,
            role: 'assistant',
            content: '응답해주신 내용을 바탕으로 딱 맞는 상품을 골라내고 있어요...',
            typing: true,
            timestamp: Date.now()
          }]);
          startV2Flow();
        } else {
          setPhase('balance');
          setMessages(prev => [...prev, {
            id: `a_balance_${Date.now()}`,
            role: 'assistant',
            content: data.content || '취향에 맞는 제품을 찾기 위해 몇 가지 선택을 해주세요.',
            typing: true,
            timestamp: Date.now()
          }]);
        }
      } else if (data.phase === 'negative_filter') {
        setPhase('negative_filter');
        setMessages(prev => [...prev, {
          id: `a_negative_${Date.now()}`,
          role: 'assistant',
          content: data.content || '꼭 피하고 싶은 단점이 있으신가요?',
          negativeFilterOptions: data.negativeOptions || [],
          typing: true,
          timestamp: Date.now()
        }]);
      } else if (data.phase === 'result') {
        setPhase('result');
        setMessages(prev => [...prev, {
          id: `a_result_${Date.now()}`,
          role: 'assistant',
          content: data.content,
          resultProducts: data.products || [],
          typing: true,
          timestamp: Date.now()
        }]);
      } else {
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
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col font-sans">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white shadow-2xl shadow-gray-200/50">
        <header className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-gray-50/50 px-4 h-16 flex items-center justify-between">
          <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={() => router.push('/knowledge-agent')} className="p-2.5 -ml-2.5 rounded-full hover:bg-gray-50 transition-colors">
            <FcPrevious size={20} />
          </motion.button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-black text-[15px] text-gray-900 tracking-tight">{categoryName} 추천받기</span>
          </div>
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-8 space-y-8 pb-44">
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onOptionToggle={handleOptionToggle}
                onNegativeFilterComplete={handleNegativeFilterComplete}
                onProductClick={setSelectedProduct}
                phase={phase}
                inputRef={inputRef}
                isLatestAssistantMessage={msg.role === 'assistant' && msg.options && !msg.isFinalized}
              />
            ))}
            {/* 하드컷팅 시각화 단계 */}
            {phase === 'hardcut_visual' && hardcutResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-4"
              >
                <HardcutVisualization
                  totalBefore={hardcutResult.totalBefore}
                  totalAfter={hardcutResult.totalAfter}
                  filteredProducts={hardCutProducts}
                  appliedRules={hardcutResult.appliedRules}
                  onContinue={handleHardcutContinue}
                />
              </motion.div>
            )}

            {phase === 'balance' && balanceQuestions.length > 0 && !isTyping && (
              <InlineBalanceCarousel questions={balanceQuestions} onComplete={handleBalanceComplete} />
            )}
            <AnimatePresence>
              {isTyping && <SearchingIndicator queries={activeSearchQueries} statusMessage={activeStatusMessage} />}
            </AnimatePresence>
            <div ref={messagesEndRef} />
        </main>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-6 pt-4 z-[110] bg-gradient-to-t from-white via-white/95 to-transparent">
            {/* Navigation Buttons (Prev Only) */}
            {activeQuestion && canGoPrev && (
              <div className="flex mb-4">
                <button
                  onClick={handlePrevStep}
                  className="w-[80px] py-3.5 bg-white text-gray-500 border border-gray-100 rounded-2xl text-[14px] font-bold hover:bg-gray-50 transition-all flex items-center justify-center"
                >
                  이전
                </button>
              </div>
            )}

            {phase !== 'hardcut_visual' && (
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

      {selectedProduct && <KnowledgePDPModal product={selectedProduct} categoryKey={categoryKey} onClose={() => setSelectedProduct(null)} />}
    </div>
  );
}

function MessageBubble({
  message,
  onOptionToggle,
  onNegativeFilterComplete,
  onProductClick,
  phase,
  inputRef,
  isLatestAssistantMessage
}: {
  message: ChatMessage;
  onOptionToggle: (opt: string, messageId: string) => void;
  onNegativeFilterComplete: (selectedLabels: string[]) => void;
  onProductClick: (product: any) => void;
  phase: Phase;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  isLatestAssistantMessage?: boolean;
}) {
  const isUser = message.role === 'user';
  const [selectedNegativeIds, setSelectedNegativeIds] = useState<Set<string>>(new Set());

  const toggleNegativeOption = (id: string) => {
    const newSelected = new Set(selectedNegativeIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedNegativeIds(newSelected);
  };

  const handleNegativeSubmit = () => {
    if (!message.negativeFilterOptions) return;
    onNegativeFilterComplete(message.negativeFilterOptions.filter(opt => selectedNegativeIds.has(opt.id)).map(opt => opt.label));
  };

  const isInactive = !isUser && !isLatestAssistantMessage && message.options && message.options.length > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full ${isInactive ? 'opacity-40 pointer-events-none' : ''} transition-opacity duration-300`}>
      <div className={`${isUser ? 'max-w-[85%]' : 'w-full'} space-y-3`}>
        {!isUser && message.searchContext && (
          <SearchContextToggle searchContext={message.searchContext} />
        )}

        {!isUser && message.analysisData && (
          <AgenticLoadingPhase categoryName="" steps={message.analysisData.steps} crawledProducts={message.analysisData.crawledProducts} generatedQuestions={message.analysisData.generatedQuestions} isComplete={message.analysisData.isComplete} summary={message.analysisData.summary} />
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
            {message.options.map((opt, i) => (
              <OptionButton key={i} label={opt} isSelected={message.selectedOptions?.includes(opt)} onClick={() => onOptionToggle(opt, message.id)} disabled={isInactive} />
            ))}
            {!isInactive && (!message.selectedOptions || message.selectedOptions.length === 0) && (
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => { inputRef?.current?.focus(); setTimeout(() => { inputRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); }} className="w-full py-4 px-5 rounded-[20px] border border-dashed border-gray-200 text-left transition-all flex items-center justify-between group hover:border-blue-300 hover:bg-blue-50/30">
                <div className="flex items-center gap-3">
                  <span className="text-[15px] font-medium text-gray-800 group-hover:text-blue-600">직접 입력하기</span>
                  <span className="text-[12px] text-gray-400 group-hover:text-blue-400">궁금한 점이나 다른 답변</span>
                </div>
              </motion.button>
            )}
          </motion.div>
        )}

        {!isUser && message.negativeFilterOptions && message.negativeFilterOptions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-white border border-gray-100 rounded-[28px] mt-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center"><FcCancel size={20} /></div>
              <div>
                <span className="text-[15px] font-bold text-gray-900">제외하고 싶은 단점</span>
                <p className="text-[11px] text-gray-400 font-medium">이 단점이 있는 상품은 추천에서 제외합니다</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {message.negativeFilterOptions.map((opt) => (
                <motion.button key={opt.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => toggleNegativeOption(opt.id)} className={`p-4 rounded-2xl text-left transition-all border-2 relative ${selectedNegativeIds.has(opt.id) ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-gray-100 hover:border-rose-100'}`}>
                  <div className="flex flex-col gap-2">
                    <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selectedNegativeIds.has(opt.id) ? 'border-rose-500 bg-rose-500' : 'border-gray-200 bg-white'}`}>{selectedNegativeIds.has(opt.id) && <FcCheckmark size={12} className="text-white" />}</div>
                    <div><span className={`text-[14px] font-bold block leading-tight ${selectedNegativeIds.has(opt.id) ? 'text-rose-900' : 'text-gray-800'}`}>{opt.label}</span></div>
                  </div>
                </motion.button>
              ))}
            </div>
            <div className="flex gap-2.5 mt-6 pt-5 border-t border-gray-50">
              <button onClick={() => onNegativeFilterComplete([])} className="flex-1 py-3.5 bg-gray-50 rounded-2xl text-[14px] font-bold text-gray-500 hover:bg-gray-100 transition-all">건너뛰기</button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleNegativeSubmit} disabled={selectedNegativeIds.size === 0} className="flex-[2] py-3.5 bg-rose-600 text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed">{selectedNegativeIds.size > 0 ? `${selectedNegativeIds.size}개 필터링 적용` : '단점 선택'}</motion.button>
            </div>
          </motion.div>
        )}

        {!isUser && message.resultProducts && message.resultProducts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-3 pt-4">
            <div className="flex items-center gap-2 px-1"><Lightning size={20} weight="fill" className="text-yellow-500" /><h3 className="font-bold text-gray-900">맞춤 추천 Top 3</h3></div>
            <div className="space-y-2">
              {message.resultProducts.slice(0, 3).map((product: any, i: number) => (
                <V2ResultProductCard key={product.pcode || product.id || i} product={{ pcode: product.pcode || product.id, title: product.name || product.title, brand: product.brand || null, price: product.price || null, thumbnail: product.thumbnail || null, rank: i + 1, spec: product.spec || {}, reviewCount: product.reviewCount || null, averageRating: product.rating || product.averageRating || null, recommendationReason: product.recommendReason || product.recommendationReason, baseScore: 0, negativeScore: 0, hardFilterScore: 0, budgetScore: 0, directInputScore: 0, totalScore: 0, matchedRules: [], isOverBudget: false, overBudgetAmount: 0, overBudgetPercent: 0 }} rank={i + 1} onClick={() => onProductClick(product)} />
              ))}
            </div>
            {message.resultProducts.length >= 2 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <KnowledgeComparisonTable products={message.resultProducts.map((p: any) => ({ pcode: p.pcode || p.id, name: p.name || p.title, brand: p.brand || null, price: p.price || null, thumbnail: p.thumbnail || null, rating: p.rating || p.averageRating || null, reviewCount: p.reviewCount || null, specs: p.specs || p.spec || {}, specSummary: p.specSummary || '', prosFromReviews: p.prosFromReviews || [], consFromReviews: p.consFromReviews || [], recommendedFor: p.recommendedFor || '', recommendReason: p.recommendReason || '' }))} showRank={true} />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
