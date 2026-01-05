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
  FcAssistant,
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

// ============================================================================
// Types
// ============================================================================

type Phase = 'loading' | 'report' | 'questions' | 'balance' | 'negative_filter' | 'result' | 'free_chat';

// ============================================================================
// Searching Indicator Component (검색 프로세스 시각화)
// ============================================================================

function SearchingIndicator({ queries }: { queries: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (queries.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % queries.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [queries]);

  if (queries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start items-center gap-3 px-1"
      >
        <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <FcDataConfiguration size={16} />
          </motion.div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm">
          <span className="text-[13px] text-gray-400 font-bold tracking-tight">AI Thinking...</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="bg-gray-900 rounded-[24px] p-5 shadow-xl border border-white/10 relative overflow-hidden">
        {/* 그라데이션 오버레이 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] rounded-full" />
        
        <div className="flex items-center gap-3 mb-4 relative z-10">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-400/20">
             <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          </div>
          <span className="text-[11px] text-gray-400 font-black uppercase tracking-widest">Global Database Search</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="flex items-center gap-3 relative z-10"
          >
            <FcSearch size={22} />
            <p className="text-[15px] text-white font-bold leading-tight">
              {queries[currentIndex]}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 pl-2">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="shrink-0"
        >
          <FcDataConfiguration size={14} />
        </motion.div>
        <span className="text-[12px] font-black text-gray-400 uppercase tracking-tighter">Analyzing real-time results...</span>
      </div>
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
  description
}: {
  label: string;
  isSelected?: boolean;
  onClick: () => void;
  description?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.01, x: 4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full py-4 px-5 rounded-[20px] border-2 text-left transition-all flex items-center justify-between group ${
        isSelected
          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100'
          : 'bg-white border-gray-100 text-gray-700 hover:border-blue-200 hover:bg-blue-50/30'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className={`text-[15px] font-bold ${isSelected ? 'text-white' : 'text-gray-900'}`}>{label}</span>
        {description && (
          <span className={`text-[12px] font-medium ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>{description}</span>
        )}
      </div>
      <div className={`transition-all duration-300 ${isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`}>
        <FcRight size={20} />
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
            <h4 className="text-xs font-semibold text-gray-500">
              📦 분석 완료된 상품
            </h4>
            <span className="text-[10px] text-gray-400">
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
                    <span className="text-[8px] text-gray-400">N/A</span>
                  </div>
                )}
                <p className="text-[9px] text-gray-500 mt-1 truncate">{product.brand || ''}</p>
              </motion.div>
            ))}
          </div>
          {crawledProducts.length > 10 && (
            <p className="text-[10px] text-gray-400 text-center mt-2">
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">🏷️ 인기 브랜드</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topBrands.slice(0, 5).map((brand, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-700"
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">👍 자주 언급되는 장점</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topPros.slice(0, 4).map((item, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-green-50 border border-green-100 rounded-md text-xs text-green-700"
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">👎 자주 언급되는 단점</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {marketSummary.topCons.slice(0, 4).map((item, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-red-50 border border-red-100 rounded-md text-xs text-red-700"
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">📊 시장 현황</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">{trendAnalysis.top10Summary}</p>
                </div>
              )}

              {/* 최근 트렌드 */}
              {trendAnalysis && trendAnalysis.trends && trendAnalysis.trends.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">🔥 최근 트렌드</h4>
                  <ul className="space-y-1.5">
                    {trendAnalysis.trends.slice(0, 3).map((trend: string, i: number) => (
                      <li key={i} className="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">👍 구매자들이 좋아하는 점</h4>
                  <ul className="space-y-1">
                    {trendAnalysis.pros.slice(0, 3).map((pro: string, i: number) => (
                      <li key={i} className="text-xs text-green-700 leading-relaxed flex items-start gap-1.5">
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">⚠️ 주의해야 할 점</h4>
                  <ul className="space-y-1">
                    {trendAnalysis.cons.slice(0, 3).map((con: string, i: number) => (
                      <li key={i} className="text-xs text-red-600 leading-relaxed flex items-start gap-1.5">
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">💰 가격 정보</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">{trendAnalysis.priceInsight}</p>
                </div>
              )}

              {/* 검색 키워드 */}
              {trendAnalysis && trendAnalysis.searchQueries && trendAnalysis.searchQueries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">🔍 분석에 사용된 검색어</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {trendAnalysis.searchQueries.map((query: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-50 border border-blue-100 rounded-md text-[11px] text-blue-700"
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
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">📎 참고 출처</h4>
                  <ul className="space-y-2">
                    {trendAnalysis.sources.map((source: { title: string; url: string; snippet?: string }, i: number) => (
                      <li key={i} className="bg-white border border-gray-100 rounded-lg p-2">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:underline line-clamp-1"
                        >
                          {source.title}
                        </a>
                        {source.snippet && (
                          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{source.snippet}</p>
                        )}
                        <p className="text-[9px] text-gray-400 mt-0.5 truncate">{source.url}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 분석된 상품 미리보기 (최대 10개) */}
              {crawledProducts && crawledProducts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-gray-500">
                      📦 분석 중인 상품
                    </h4>
                    <span className="text-[10px] text-purple-600 font-medium">
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
                            <span className="text-[8px] text-gray-400">N/A</span>
                          </div>
                        )}
                        <p className="text-[9px] text-gray-500 mt-1 truncate">{product.brand || ''}</p>
                      </motion.div>
                    ))}
                  </div>
                  {crawledProducts.length > 10 && (
                    <p className="text-[10px] text-gray-400 text-center mt-2">
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
  // URL 디코딩하여 한글 키워드 지원
  const categoryName = decodeURIComponent(categoryKey);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);

  // State
  const [phase, setPhase] = useState<Phase>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeSearchQueries, setActiveSearchQueries] = useState<string[]>([]);

  // Loading steps (Agentic Style) - 메시지 내 analysisData로 관리
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(() => createDefaultSteps(categoryName));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analysisSummary, setAnalysisSummary] = useState<{
    productCount: number;
    reviewCount: number;
    topBrands: string[];
    trends: string[];
    sources: Array<{ title: string; url: string; snippet?: string }>;
  } | undefined>(undefined);

  // Question flow
  const [questionTodos, setQuestionTodos] = useState<QuestionTodo[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionTodo | null>(null);
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_progress, setProgress] = useState({ current: 0, total: 0 });

  // Balance game
  const [balanceQuestions, setBalanceQuestions] = useState<BalanceQuestion[]>([]);

  // Negative filter - options are now stored in messages

  // Results
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // 크롤링된 상품 목록 (실시간 UX용) - 메시지 내 analysisData로 관리
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [crawledProducts, setCrawledProducts] = useState<CrawledProductPreview[]>([]);


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

  const initializeAgent = async () => {
    // 검색 쿼리 초기 설정 (로딩 중 표시용)
    const initialQueries = [
      `${categoryName} 인기 순위 2026`,
      `${categoryName} 추천 베스트`,
      `${categoryName} 구매가이드`,
      `${categoryName} 장단점 비교`
    ];

    // 로컬 상태로 단계 관리 (메시지 업데이트와 함께)
    let localSteps = createDefaultSteps(categoryName);
    let localProducts: CrawledProductPreview[] = [];

    // Helper: 단계 업데이트 + 메시지 업데이트
    const updateStepAndMessage = (stepId: string, updates: Partial<AnalysisStep>) => {
      localSteps = localSteps.map(s =>
        s.id === stepId ? { ...s, ...updates } : s
      );
      setAnalysisSteps([...localSteps]);

      // 분석 메시지도 함께 업데이트
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

    // 바로 questions phase로 전환 + 분석 메시지 추가
    setPhase('questions');

    // 분석 진행 메시지를 채팅에 추가
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

    // Step 1 & 2: 인기상품 분석 + 웹검색 동시에 시작 (실제로 병렬 실행됨)
    const parallelStartTime = Date.now();
    localSteps = localSteps.map(s => {
      if (s.id === 'product_analysis' || s.id === 'web_search') {
        return {
          ...s,
          status: 'active' as const,
          startTime: parallelStartTime,
          searchQueries: s.id === 'web_search' ? initialQueries : undefined,
        };
      }
      return s;
    });
    setAnalysisSteps([...localSteps]);
    setMessages([{ ...analysisMsg, analysisData: { steps: [...localSteps], crawledProducts: [], isComplete: false } }]);

    // API 호출 (병렬로 시작)
    const fetchPromise = fetch('/api/knowledge-agent/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryKey })
    }).then(res => res.json());

    // API 결과 대기
    try {
      const data = await fetchPromise;

      if (data.success) {
        const products = data.products || [];
        const webSearchSources = data.trendAnalysis?.sources || [];
        const actualQueries = data.searchQueries || initialQueries;
        const topBrands = data.marketSummary?.topBrands || [];

        // 병렬 스트리밍: 상품 + 웹검색 소스를 동시에 표시
        const maxProductBatches = Math.ceil(Math.min(products.length, 15) / 3);
        const maxSourceBatches = Math.min(webSearchSources.length, 5);
        const totalBatches = Math.max(maxProductBatches, maxSourceBatches, 6); // 최소 6번 반복

        for (let batch = 0; batch < totalBatches; batch++) {
          // 상품 스트리밍 (3개씩)
          const productIdx = batch * 3;
          if (productIdx < products.length && productIdx < 15) {
            const newProducts = products.slice(productIdx, Math.min(productIdx + 3, 15));
            localProducts = [...localProducts, ...newProducts];
          }

          // 웹검색 소스 스트리밍 (1개씩)
          if (batch < webSearchSources.length && batch < 5) {
            localSteps = localSteps.map(s => s.id === 'web_search' ? {
              ...s,
              searchResults: webSearchSources.slice(0, batch + 1),
            } : s);
          }

          // UI 업데이트
          setCrawledProducts([...localProducts]);
          setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
            ...m,
            analysisData: { steps: [...localSteps], crawledProducts: [...localProducts], isComplete: false }
          } : m));

          await new Promise(r => setTimeout(r, 400)); // 각 배치당 400ms
        }

        // 남은 상품 추가 (15개 초과분)
        if (products.length > 15) {
          localProducts = products;
          setCrawledProducts(products);
        }

        // Step 1 완료 - 인기상품 분석 (먼저 완료)
        await new Promise(r => setTimeout(r, 300));
        updateStepAndMessage('product_analysis', {
          status: 'done',
          endTime: Date.now(),
          analyzedCount: products.length,
          analyzedItems: topBrands.slice(0, 8),
          thinking: `${products.length}개 상품 분석 완료. 인기 브랜드: ${topBrands.slice(0, 3).join(', ')}`,
        });

        // Step 2 완료 - 웹 검색 (0.5초 후 완료)
        await new Promise(r => setTimeout(r, 500));
        updateStepAndMessage('web_search', {
          status: 'done',
          endTime: Date.now(),
          searchQueries: actualQueries,
          searchResults: webSearchSources.slice(0, 5),
          thinking: data.trendAnalysis?.top10Summary || '',
        });

        await new Promise(r => setTimeout(r, 400));

        // Step 3: 리뷰 분석 시작
        updateStepAndMessage('review_extraction', {
          status: 'active',
          startTime: Date.now(),
        });

        await new Promise(r => setTimeout(r, 1000));
        const topPros = (data.marketSummary?.topPros || []).map((p: any) => p.keyword || p);
        const topCons = (data.marketSummary?.topCons || []).map((c: any) => c.keyword || c);
        updateStepAndMessage('review_extraction', {
          status: 'done',
          endTime: Date.now(),
          analyzedCount: data.marketSummary?.reviewCount || 0,
          analyzedItems: [...topPros.slice(0, 3), ...topCons.slice(0, 2)],
          thinking: `리뷰 ${(data.marketSummary?.reviewCount || 0).toLocaleString()}개 분석. 주요 키워드: ${topPros.slice(0, 3).join(', ')}`,
        });

        await new Promise(r => setTimeout(r, 400));

        // Step 4: 질문 생성 시작
        updateStepAndMessage('question_generation', {
          status: 'active',
          startTime: Date.now(),
        });

        await new Promise(r => setTimeout(r, 600));

        // 생성된 질문들을 analysisData에 추가
        const generatedQuestions = (data.questionTodos || []).map((q: any) => ({
          id: q.id,
          question: q.question,
        }));

        updateStepAndMessage('question_generation', {
          status: 'done',
          endTime: Date.now(),
          analyzedCount: (data.questionTodos || []).length,
          thinking: `맞춤 질문 ${(data.questionTodos || []).length}개 생성 완료`,
        });

        // 생성된 질문을 메시지에 추가
        setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
          ...m,
          analysisData: {
            ...m.analysisData!,
            generatedQuestions,
          }
        } : m));

        // 완료 상태 설정
        setIsLoadingComplete(true);
        const summaryData = {
          productCount: products.length,
          reviewCount: data.marketSummary?.reviewCount || 0,
          topBrands: topBrands,
          trends: data.trendAnalysis?.trends || [],
          sources: webSearchSources,
        };
        setAnalysisSummary(summaryData);

        // 분석 메시지 완료 상태로 업데이트
        setMessages(prev => prev.map(m => m.id === 'analysis-progress' ? {
          ...m,
          analysisData: {
            steps: [...localSteps],
            crawledProducts: products,
            isComplete: true,
            summary: summaryData,
          }
        } : m));

        await new Promise(r => setTimeout(r, 500));

        // 데이터 설정
        setQuestionTodos(data.questionTodos || []);
        setCurrentQuestion(data.currentQuestion);
        setProgress({ current: 1, total: (data.questionTodos || []).length });

        // 최종 상품 목록 확정
        setCrawledProducts(products);

        // 첫 질문 추가
        if (data.currentQuestion) {
          await new Promise(r => setTimeout(r, 800));
          const questionMsg: ChatMessage = {
            id: `q_${data.currentQuestion.id}`,
            role: 'assistant',
            content: data.currentQuestion.question,
            options: data.currentQuestion.options.map((o: any) => o.label),
            dataSource: data.currentQuestion.dataSource,
            tip: data.currentQuestion.reason,
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, questionMsg]);
        }
      }
    } catch (e) {
      console.error('[Init] Failed:', e);
      setPhase('free_chat');
    }
  };

  // ============================================================================
  // Message Handlers
  // ============================================================================

  const handleOptionClick = async (option: string) => {
    if (isTyping) return;

    // 사용자 메시지 추가
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: option,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // 검색 쿼리 설정 (사용자 응답 기반)
    const contextualQueries = [
      `${categoryName} ${option} 추천`,
      `${categoryName} ${option} 비교`,
      `${option} 장단점 리뷰`
    ];
    setActiveSearchQueries(contextualQueries);

    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          userMessage: option,
          questionTodos,
          collectedInfo,
          currentQuestionId: currentQuestion?.id,
          phase
        })
      });
      const data = await res.json();

      if (data.success) {
        // 상태 업데이트
        if (data.questionTodos) setQuestionTodos(data.questionTodos);
        if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
        if (data.progress) setProgress(data.progress);
        if (data.currentQuestion) setCurrentQuestion(data.currentQuestion);

        // Phase 전환
        if (data.phase === 'negative_filter') {
          setPhase('negative_filter');

          // 단점 필터 메시지에 옵션 포함
          const negativeFilterMsg: ChatMessage = {
            id: `a_negative_${Date.now()}`,
            role: 'assistant',
            content: data.content || '꼭 피하고 싶은 단점이 있으신가요?',
            negativeFilterOptions: data.negativeOptions || [],
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, negativeFilterMsg]);
        } else if (data.phase === 'balance') {
          setPhase('balance');
          setBalanceQuestions(data.balanceQuestions || []);

          // 밸런스 게임 메시지 추가
          const balanceMsg: ChatMessage = {
            id: `a_balance_${Date.now()}`,
            role: 'assistant',
            content: data.content || '취향에 맞는 제품을 찾기 위해 몇 가지 선택을 해주세요.',
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, balanceMsg]);
        } else if (data.phase === 'result') {
          setPhase('result');

          // 결과 메시지에 제품 카드 포함 (모달 대신)
          const resultMsg: ChatMessage = {
            id: `a_result_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            resultProducts: data.products || [],
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, resultMsg]);
        } else {
          // 일반 메시지 추가 (검색 컨텍스트 포함)
          const assistantMsg: ChatMessage = {
            id: `a_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            options: data.options,
            dataSource: data.dataSource,
            tip: data.tip,
            searchContext: data.searchContext || null,
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, assistantMsg]);
        }
      }
    } catch (e) {
      console.error('[Chat] Failed:', e);
    } finally {
      setIsTyping(false);
      setActiveSearchQueries([]);
    }
  };

  const handleBalanceComplete = async (selections: Map<string, 'A' | 'B'>) => {
    setIsTyping(true);

    // 검색 쿼리 설정
    setActiveSearchQueries([
      `${categoryName} 추천 순위 2025`,
      `${categoryName} 실사용 후기 비교`,
      `${categoryName} 가성비 분석`
    ]);

    const selectionsStr = Array.from(selections.entries())
      .map(([id, choice]) => {
        const q = balanceQuestions.find(bq => bq.id === id);
        return q ? (choice === 'A' ? q.option_A.text : q.option_B.text) : '';
      })
      .filter(Boolean)
      .join(', ');

    // selections 맵을 평탄한 객체로 변환 (Map은 JSON.stringify가 안되므로)
    const selectionsObj = Object.fromEntries(selections);

    // 사용자 선택 메시지
    const userMsg: ChatMessage = {
      id: `u_balance_${Date.now()}`,
      role: 'user',
      content: `선택: ${selectionsStr}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          userMessage: JSON.stringify(selectionsObj),
          collectedInfo,
          phase: 'balance',
          balanceQuestions // 컨텍스트 유지를 위해 전달
        })
      });
      const data = await res.json();

      if (data.success) {
        // API 응답의 phase에 따라 분기
        if (data.phase === 'negative_filter') {
          setPhase('negative_filter');

          // 단점 필터 메시지에 옵션 포함
          const negativeFilterMsg: ChatMessage = {
            id: `a_negative_${Date.now()}`,
            role: 'assistant',
            content: data.content || '꼭 피하고 싶은 단점이 있으신가요?',
            negativeFilterOptions: data.negativeOptions || [],
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, negativeFilterMsg]);
        } else {
          setPhase('result');

          // 결과 메시지에 제품 카드 포함 (모달 대신 채팅 내 표시)
          const resultMsg: ChatMessage = {
            id: `a_result_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            resultProducts: data.products || [],
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, resultMsg]);
        }
      }
    } catch (e) {
      console.error('[Balance] Failed:', e);
    } finally {
      setIsTyping(false);
      setActiveSearchQueries([]);
    }
  };

  const handleNegativeFilterComplete = async (selectedLabels: string[]) => {
    setIsTyping(true);

    // 검색 쿼리 설정
    setActiveSearchQueries([
      `${categoryName} 취향별 추천`,
      `${categoryName} 단점 회피 제품`,
      `${categoryName} 만족도 높은 제품`
    ]);

    const selectionsStr = selectedLabels.join(', ') || '없음';

    // 사용자 선택 메시지
    const userMsg: ChatMessage = {
      id: `u_negative_${Date.now()}`,
      role: 'user',
      content: selectedLabels.length > 0 ? `피하고 싶은 단점: ${selectionsStr}` : '특별히 없어요',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          userMessage: selectionsStr,
          collectedInfo,
          phase: 'negative_filter'
        })
      });
      const data = await res.json();

      if (data.success) {
        if (data.collectedInfo) setCollectedInfo(data.collectedInfo);

        if (data.phase === 'balance') {
          setPhase('balance');
          setBalanceQuestions(data.balanceQuestions || []);

          const balanceMsg: ChatMessage = {
            id: `a_balance_${Date.now()}`,
            role: 'assistant',
            content: data.content || '취향에 맞는 제품을 찾기 위해 몇 가지 선택을 해주세요.',
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, balanceMsg]);
        } else if (data.phase === 'result') {
          setPhase('result');

          // 결과 메시지에 제품 카드 포함 (모달 대신 채팅 내 표시)
          const resultMsg: ChatMessage = {
            id: `a_result_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            resultProducts: data.products || [],
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, resultMsg]);
        } else {
          const assistantMsg: ChatMessage = {
            id: `a_negative_resp_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            typing: true,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, assistantMsg]);
        }
      }
    } catch (e) {
      console.error('[NegativeFilter] Failed:', e);
    } finally {
      setIsTyping(false);
      setActiveSearchQueries([]);
    }
  };

  const handleFreeChat = async (message: string) => {
    if (!message.trim() || isTyping) return;

    // questions phase에서 currentQuestion이 있으면 handleOptionClick으로 처리
    if (phase === 'questions' && currentQuestion) {
      handleOptionClick(message);
      setInputValue('');
      return;
    }

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // 검색 쿼리 설정 (사용자 질문 기반)
    const keywords = message.split(' ').filter(w => w.length > 1).slice(0, 2).join(' ');
    setActiveSearchQueries([
      `${categoryName} ${keywords}`,
      `${keywords} 리뷰`,
      `${categoryName} 추천`
    ]);

    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          userMessage: message,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          phase: phase === 'result' ? 'free_chat' : phase  // result 이후는 free_chat, 그 외는 현재 phase
        })
      });
      const data = await res.json();

      if (data.success) {
        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: data.content,
          options: data.options,
          typing: true,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        // 에러 응답 처리
        console.error('[FreeChat] API error:', data.error);
      }
    } catch (e) {
      console.error('[FreeChat] Failed:', e);
    } finally {
      setIsTyping(false);
      setActiveSearchQueries([]);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col font-sans">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white shadow-2xl shadow-gray-200/50">
        {/* Header */}
        <header className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-gray-50/50 px-4 h-16 flex items-center justify-between">
          <motion.button 
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/knowledge-agent')} 
            className="p-2.5 -ml-2.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            <FcPrevious size={20} />
          </motion.button>
          
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-[15px] text-gray-900 tracking-tight">{categoryName}</span>
              <div className="w-1 h-1 bg-gray-300 rounded-full" />
              <span className="font-bold text-[13px] text-gray-400">Assistant</span>
            </div>
          </div>

          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100/50 shadow-sm">
             <FcAssistant size={24} />
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto px-5 py-8 space-y-8 pb-44">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onOptionClick={handleOptionClick}
                onNegativeFilterComplete={handleNegativeFilterComplete}
                onProductClick={setSelectedProduct}
                phase={phase}
              />
            ))}

            {/* Balance Game UI - 메시지 아래에 표시 */}
            {phase === 'balance' && balanceQuestions.length > 0 && !isTyping && (
              <InlineBalanceCarousel
                questions={balanceQuestions}
                onComplete={handleBalanceComplete}
              />
            )}

            {isTyping && <SearchingIndicator queries={activeSearchQueries} />}
            <div ref={messagesEndRef} />
        </main>

        {/* Input Bar */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-10 pt-4 z-[110] bg-gradient-to-t from-white via-white/95 to-transparent">
            <div className="relative group">
              {/* 스마트 에이전트 느낌의 글로우 효과 */}
              <div 
                className="absolute -inset-6 -z-10 blur-[40px] opacity-40 pointer-events-none group-focus-within:opacity-70 transition-opacity duration-500"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.2) 50%, transparent 100%)',
                }}
              />
              
              <div className="relative w-full overflow-hidden rounded-[24px] border border-gray-200/80 focus-within:border-blue-400/50 flex items-end bg-white shadow-[0_10px_40px_rgba(0,0,0,0.04)] focus-within:shadow-[0_10px_50px_rgba(59,130,246,0.12)] transition-all duration-300">
                <textarea
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.max(86, Math.min(e.target.scrollHeight, 160))}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleFreeChat(inputValue);
                    }
                  }}
                  placeholder={`무엇이든 물어보세요...`}
                  className="relative z-10 w-full min-h-[86px] max-h-[160px] py-[17px] pl-5 pr-14 rounded-[24px] bg-transparent text-[16px] text-gray-800 placeholder:text-gray-300 placeholder:font-bold focus:outline-none transition-all resize-none overflow-y-auto whitespace-pre-line"
                  disabled={isTyping}
                  rows={2}
                />
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleFreeChat(inputValue)}
                  disabled={!inputValue.trim() || isTyping}
                  className={`absolute right-2 bottom-2 w-10 h-10 z-20 flex items-center justify-center rounded-2xl transition-all ${
                    inputValue.trim() ? 'bg-gray-900 shadow-lg shadow-gray-200' : 'bg-gray-50'
                  } disabled:opacity-50`}
                >
                  {isTyping ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <PaperPlaneRight 
                      size={20} 
                      weight="fill" 
                      className={inputValue.trim() ? 'text-white' : 'text-gray-300'} 
                    />
                  )}
                </motion.button>
              </div>
            </div>
          </div>
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <KnowledgePDPModal
          product={selectedProduct}
          categoryKey={categoryKey}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

function MessageBubble({
  message,
  onOptionClick,
  onNegativeFilterComplete,
  onProductClick,
  phase
}: {
  message: ChatMessage;
  onOptionClick: (opt: string) => void;
  onNegativeFilterComplete: (selectedLabels: string[]) => void;
  onProductClick: (product: any) => void;
  phase: Phase;
}) {
  const isUser = message.role === 'user';
  const [selectedNegativeIds, setSelectedNegativeIds] = useState<Set<string>>(new Set());

  const toggleNegativeOption = (id: string) => {
    const newSelected = new Set(selectedNegativeIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedNegativeIds(newSelected);
  };

  const handleNegativeSubmit = () => {
    if (!message.negativeFilterOptions) return;
    const selectedLabels = message.negativeFilterOptions
      .filter(opt => selectedNegativeIds.has(opt.id))
      .map(opt => opt.label);
    onNegativeFilterComplete(selectedLabels);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}
    >
      <div className={`${isUser ? 'max-w-[85%]' : 'w-full'} space-y-3`}>
        {/* Search Context (검색 결과 표시) */}
        {!isUser && message.searchContext && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-[24px] p-5 mb-4 shadow-xl border border-white/10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 blur-[50px] rounded-full" />
            <div className="flex items-center gap-2.5 mb-3 relative z-10">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Knowledge Retrieval Complete</span>
            </div>
            <div className="flex items-start gap-3 mb-3 relative z-10">
              <FcSearch size={20} className="shrink-0 mt-0.5" />
              <p className="text-[14px] text-white/60 font-medium italic">"{message.searchContext.query}"</p>
            </div>
            <p className="text-[15px] text-white font-bold leading-relaxed relative z-10">
              {message.searchContext.insight}
            </p>
          </motion.div>
        )}

        {/* Data Source Badge */}
        {!isUser && message.dataSource && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <FcPositiveDynamic size={14} />
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-tighter">
              Source: {message.dataSource}
            </span>
          </div>
        )}

        {/* Agentic Analysis (분석 진행 상황) */}
        {!isUser && message.analysisData && (
          <AgenticLoadingPhase
            categoryName=""
            steps={message.analysisData.steps}
            crawledProducts={message.analysisData.crawledProducts}
            generatedQuestions={message.analysisData.generatedQuestions}
            isComplete={message.analysisData.isComplete}
            summary={message.analysisData.summary}
          />
        )}

        {/* Message Content */}
        {isUser ? (
          <div className="bg-blue-600 text-white rounded-[24px] rounded-tr-none px-5 py-3.5 text-[15px] font-bold shadow-lg shadow-blue-100 leading-relaxed">
            {message.content}
          </div>
        ) : message.content ? (
          <div className="w-full">
            <AssistantMessage
              content={message.content}
              typing={message.typing}
              speed={10}
            />
          </div>
        ) : null}

        {/* Report Toggle (분석 보고서 토글) */}
        {!isUser && message.reportData && (
          <ReportToggle reportData={message.reportData} />
        )}

        {/* Tip Box (별도 디자인) */}
        {!isUser && message.tip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-start gap-3 bg-amber-50/50 border border-amber-100/50 rounded-[20px] px-4 py-3.5 shadow-sm"
          >
            <FcIdea size={20} className="shrink-0" />
            <p className="text-[13px] text-amber-900/80 leading-relaxed font-bold">
              {message.tip}
            </p>
          </motion.div>
        )}

        {/* Options (HardFilter Style - No Shadows) */}
        {!isUser && message.options && message.options.length > 0 && phase === 'questions' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-2 pt-2"
          >
            {message.options.map((opt, i) => (
              <OptionButton
                key={i}
                label={opt}
                onClick={() => onOptionClick(opt)}
              />
            ))}
          </motion.div>
        )}

        {/* Negative Filter Options (채팅 내 표시) */}
        {!isUser && message.negativeFilterOptions && message.negativeFilterOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white border border-gray-100 rounded-[28px] mt-3 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
                <FcCancel size={20} />
              </div>
              <div>
                <span className="text-[15px] font-bold text-gray-900">제외하고 싶은 단점</span>
                <p className="text-[11px] text-gray-400 font-medium">이 단점이 있는 상품은 추천에서 제외합니다</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {message.negativeFilterOptions.map((opt) => (
                <motion.button
                  key={opt.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleNegativeOption(opt.id)}
                  className={`p-4 rounded-2xl text-left transition-all border-2 relative ${
                    selectedNegativeIds.has(opt.id)
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-white border-gray-100 hover:border-rose-100'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      selectedNegativeIds.has(opt.id) ? 'border-rose-500 bg-rose-500' : 'border-gray-200 bg-white'
                    }`}>
                      {selectedNegativeIds.has(opt.id) && (
                        <FcCheckmark size={12} className="text-white" />
                      )}
                    </div>
                    <div>
                      <span className={`text-[14px] font-bold block leading-tight ${
                        selectedNegativeIds.has(opt.id) ? 'text-rose-900' : 'text-gray-800'
                      }`}>
                        {opt.label}
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="flex gap-2.5 mt-6 pt-5 border-t border-gray-50">
              <button
                onClick={() => onNegativeFilterComplete([])}
                className="flex-1 py-3.5 bg-gray-50 rounded-2xl text-[14px] font-bold text-gray-500 hover:bg-gray-100 transition-all"
              >
                건너뛰기
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNegativeSubmit}
                disabled={selectedNegativeIds.size === 0}
                className="flex-[2] py-3.5 bg-rose-600 text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
              >
                {selectedNegativeIds.size > 0 ? `${selectedNegativeIds.size}개 필터링 적용` : '단점 선택'}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Result Products (채팅 내 표시) */}
        {!isUser && message.resultProducts && message.resultProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-3 pt-4"
          >
            <div className="flex items-center gap-2 px-1">
              <Lightning size={20} weight="fill" className="text-yellow-500" />
              <h3 className="font-bold text-gray-900">맞춤 추천 Top 3</h3>
            </div>
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
                    // ScoredProduct 필수 필드들
                    baseScore: 0,
                    negativeScore: 0,
                    hardFilterScore: 0,
                    budgetScore: 0,
                    directInputScore: 0,
                    totalScore: 0,
                    matchedRules: [],
                    isOverBudget: false,
                    overBudgetAmount: 0,
                    overBudgetPercent: 0,
                  }}
                  rank={i + 1}
                  onClick={() => onProductClick(product)}
                />
              ))}
            </div>

            {/* 비교표 */}
            {message.resultProducts.length >= 2 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <KnowledgeComparisonTable
                  products={message.resultProducts.map((p: any) => ({
                    pcode: p.pcode || p.id,
                    name: p.name || p.title,
                    brand: p.brand || null,
                    price: p.price || null,
                    thumbnail: p.thumbnail || null,
                    rating: p.rating || p.averageRating || null,
                    reviewCount: p.reviewCount || null,
                    specs: p.specs || p.spec || {},
                    specSummary: p.specSummary || '',
                    prosFromReviews: p.prosFromReviews || [],
                    consFromReviews: p.consFromReviews || [],
                    recommendedFor: p.recommendedFor || '',
                    recommendReason: p.recommendReason || '',
                  }))}
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

