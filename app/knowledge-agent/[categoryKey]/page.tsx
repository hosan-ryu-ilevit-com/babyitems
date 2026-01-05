/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretLeft, CheckCircle, Circle, Spinner,
  Sparkle, Lightning, CaretRight
} from '@phosphor-icons/react/dist/ssr';
import { KnowledgePDPModal } from '@/components/knowledge-agent/KnowledgePDPModal';
import { AssistantMessage } from '@/components/recommend-v2';
import { V2ResultProductCard } from '@/components/recommend-v2/V2ResultProductCard';

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
    // 기본 ThinkingMessage 스타일
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start"
      >
        <div className="bg-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
          <Spinner size={16} className="text-gray-400 animate-spin" />
          <span className="text-sm text-gray-500">생각 중...</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {/* 검색 중 표시 */}
      <div className="bg-gray-900 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400 font-medium">관련 정보 검색 중</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentIndex}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="text-sm text-white font-mono"
          >
            🔍 {queries[currentIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* 분석 중 표시 */}
      <div className="flex items-center gap-2 pl-1">
        <Spinner size={14} className="text-purple-500 animate-spin" />
        <span className="text-xs text-gray-500">답변 분석 중...</span>
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
  optionA: { label: string; description?: string; ruleKey?: string };
  optionB: { label: string; description?: string; ruleKey?: string };
  insight: string;
}

interface NegativeOption {
  id: string;
  label: string;
  ruleKey: string;
  excludeMode: string;
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

// ============================================================================
// Loading Phase Component (검색 프로세스 시각화)
// ============================================================================

function LoadingPhase({
  steps,
  searchQueries = []
}: {
  steps: Array<{ label: string; done: boolean; active: boolean }>;
  searchQueries?: string[];
}) {
  const [currentQueryIndex, setCurrentQueryIndex] = useState(0);

  // 검색 쿼리 순환 표시
  useEffect(() => {
    if (searchQueries.length === 0) return;
    const interval = setInterval(() => {
      setCurrentQueryIndex(prev => (prev + 1) % searchQueries.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [searchQueries]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
            <Sparkle size={32} weight="fill" className="text-purple-600 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">실시간 분석 중...</h2>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('ko-KR')} 기준 데이터 수집
          </p>
        </div>

        {/* 검색 쿼리 표시 */}
        {searchQueries.length > 0 && (
          <motion.div
            className="bg-gray-900 rounded-xl p-4 mb-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400 font-medium">웹 검색 중</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={currentQueryIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-sm text-white font-mono"
              >
                🔍 {searchQueries[currentQueryIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        <div className="space-y-3">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.15 }}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                step.done ? 'bg-green-50 border-green-100' :
                step.active ? 'bg-purple-50 border-purple-100' :
                'bg-gray-50 border-gray-100'
              }`}
            >
              {step.done ? (
                <CheckCircle size={20} weight="fill" className="text-green-500" />
              ) : step.active ? (
                <Spinner size={20} className="text-purple-500 animate-spin" />
              ) : (
                <Circle size={20} className="text-gray-300" />
              )}
              <span className={`text-sm font-medium ${
                step.done ? 'text-green-700' :
                step.active ? 'text-purple-700' :
                'text-gray-400'
              }`}>
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// Report Phase Component (분석 리포트 + 다음 버튼)
// ============================================================================

interface TrendAnalysis {
  timestamp: string;
  top10Summary: string;
  trends: string[];
  pros: string[];
  cons: string[];
  priceInsight: string;
  searchQueries: string[];
}

function ReportPhase({
  marketSummary,
  trendAnalysis,
  onNext
}: {
  marketSummary: MarketSummary | null;
  trendAnalysis: TrendAnalysis | null;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-5"
      >
        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle size={28} weight="fill" className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">실시간 분석 완료!</h2>
          <p className="text-sm text-gray-500 mt-1">
            {trendAnalysis?.timestamp || new Date().toLocaleDateString('ko-KR')} 기준
          </p>
        </div>

        {/* 분석 요약 카드 */}
        <div className="bg-gradient-to-br from-purple-900 to-purple-800 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkle size={18} weight="fill" className="text-purple-300" />
            <span className="text-sm font-semibold text-purple-200">시장 분석 리포트</span>
          </div>

          {/* 수치 요약 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-2xl font-bold">{marketSummary?.productCount || 0}개</p>
              <p className="text-xs text-purple-200">분석 상품</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-2xl font-bold">{marketSummary?.reviewCount || 0}개</p>
              <p className="text-xs text-purple-200">리뷰 분석</p>
            </div>
          </div>

          {/* Top 10 요약 */}
          {trendAnalysis?.top10Summary && (
            <p className="text-sm leading-relaxed opacity-90 mb-3">
              {trendAnalysis.top10Summary}
            </p>
          )}

          {/* 가격 인사이트 */}
          {trendAnalysis?.priceInsight && (
            <p className="text-xs text-purple-200 bg-white/5 rounded-lg px-3 py-2">
              💰 {trendAnalysis.priceInsight}
            </p>
          )}
        </div>

        {/* 트렌드 */}
        {trendAnalysis?.trends && trendAnalysis.trends.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-2">📈 최근 트렌드</h3>
            <ul className="space-y-1.5">
              {trendAnalysis.trends.map((t, i) => (
                <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 장단점 */}
        <div className="grid grid-cols-2 gap-3">
          {trendAnalysis?.pros && trendAnalysis.pros.length > 0 && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <h3 className="text-sm font-bold text-green-900 mb-2">✓ 장점</h3>
              <ul className="space-y-1">
                {trendAnalysis.pros.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-xs text-green-700">{p}</li>
                ))}
              </ul>
            </div>
          )}
          {trendAnalysis?.cons && trendAnalysis.cons.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <h3 className="text-sm font-bold text-amber-900 mb-2">⚠ 주의점</h3>
              <ul className="space-y-1">
                {trendAnalysis.cons.slice(0, 3).map((c, i) => (
                  <li key={i} className="text-xs text-amber-700">{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 검색한 쿼리들 표시 */}
        {trendAnalysis?.searchQueries && trendAnalysis.searchQueries.length > 0 && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <h3 className="text-xs font-medium text-gray-500 mb-2">🔍 분석에 사용된 검색</h3>
            <div className="flex flex-wrap gap-2">
              {trendAnalysis.searchQueries.map((q, i) => (
                <span key={i} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-600">
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* 다음 버튼 (하단 고정) */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/90 backdrop-blur-xl border-t border-gray-100 p-4 pb-8">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-base hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
        >
          맞춤 상담 시작하기
          <CaretRight size={20} weight="bold" />
        </motion.button>
      </div>
    </div>
  );
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
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full py-3 px-4 rounded-xl border text-left transition-all ${
        isSelected
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200 active:bg-gray-50'
      }`}
    >
      <span className="text-[14px] font-medium">{label}</span>
      {description && (
        <span className="block text-[12px] text-gray-400 mt-0.5">{description}</span>
      )}
    </motion.button>
  );
}

// ============================================================================
// Balance Game Component
// ============================================================================

function BalanceGameUI({
  questions,
  onComplete
}: {
  questions: BalanceQuestion[];
  onComplete: (selections: Map<string, 'A' | 'B'>) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Map<string, 'A' | 'B'>>(new Map());

  const currentQ = questions[currentIndex];
  const selectedOption = selections.get(currentQ?.id);

  const handleSelect = (option: 'A' | 'B') => {
    const newSelections = new Map(selections);
    newSelections.set(currentQ.id, option);
    setSelections(newSelections);

    // 마지막 질문이면 완료
    if (currentIndex === questions.length - 1) {
      setTimeout(() => onComplete(newSelections), 300);
    } else {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 300);
    }
  };

  if (!currentQ) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Progress */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-400 font-medium">밸런스 게임</span>
        <span className="text-sm text-gray-300">{currentIndex + 1}/{questions.length}</span>
      </div>

      {/* Insight */}
      <p className="text-sm text-purple-600 bg-purple-50 rounded-xl px-4 py-2">
        💡 {currentQ.insight}
      </p>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelect('A')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            selectedOption === 'A'
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-100 bg-white hover:border-gray-200'
          }`}
        >
          <span className="block text-[15px] font-semibold text-gray-900">{currentQ.optionA.label}</span>
          {currentQ.optionA.description && (
            <span className="block text-[12px] text-gray-500 mt-1">{currentQ.optionA.description}</span>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => handleSelect('B')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            selectedOption === 'B'
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-100 bg-white hover:border-gray-200'
          }`}
        >
          <span className="block text-[15px] font-semibold text-gray-900">{currentQ.optionB.label}</span>
          {currentQ.optionB.description && (
            <span className="block text-[12px] text-gray-500 mt-1">{currentQ.optionB.description}</span>
          )}
        </motion.button>
      </div>
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
  const categoryName = categoryKey === 'airfryer' ? '에어프라이어' : categoryKey;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);

  // State
  const [phase, setPhase] = useState<Phase>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeSearchQueries, setActiveSearchQueries] = useState<string[]>([]);

  // Loading steps
  const [loadingSteps, setLoadingSteps] = useState([
    { label: '웹 검색으로 최신 트렌드 수집...', done: false, active: true },
    { label: '인기 Top 10 상품 분석...', done: false, active: false },
    { label: '실구매자 리뷰 키워드 추출...', done: false, active: false },
    { label: '맞춤 상담 질문 생성...', done: false, active: false }
  ]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);

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

  // Market summary & trend analysis (for report phase)
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null);


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
      `${categoryName} 인기 순위 2025`,
      `${categoryName} 추천 베스트`,
      `${categoryName} 구매가이드`,
      `${categoryName} 장단점 비교`
    ];
    setSearchQueries(initialQueries);

    // Step 1: 웹 검색
    await new Promise(r => setTimeout(r, 800));
    setLoadingSteps(prev => prev.map((s, i) =>
      i === 0 ? { ...s, done: true, active: false } :
      i === 1 ? { ...s, active: true } : s
    ));

    // Step 2: Top 10 분석
    await new Promise(r => setTimeout(r, 600));
    setLoadingSteps(prev => prev.map((s, i) =>
      i === 1 ? { ...s, done: true, active: false } :
      i === 2 ? { ...s, active: true } : s
    ));

    // Step 3: 리뷰 분석
    await new Promise(r => setTimeout(r, 500));
    setLoadingSteps(prev => prev.map((s, i) =>
      i === 2 ? { ...s, done: true, active: false } :
      i === 3 ? { ...s, active: true } : s
    ));

    // API 호출
    try {
      const res = await fetch('/api/knowledge-agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryKey })
      });
      const data = await res.json();

      if (data.success) {
        // 실제 검색 쿼리로 업데이트 (있으면)
        if (data.searchQueries?.length) {
          setSearchQueries(data.searchQueries);
        }

        // Step 4 완료
        setLoadingSteps(prev => prev.map(s => ({ ...s, done: true, active: false })));

        await new Promise(r => setTimeout(r, 300));

        // 데이터 설정
        setMarketSummary(data.marketSummary);
        setTrendAnalysis(data.trendAnalysis);
        setQuestionTodos(data.questionTodos || []);
        setCurrentQuestion(data.currentQuestion);
        setProgress({ current: 1, total: (data.questionTodos || []).length });

        // Phase 전환 → 리포트 화면으로
        setPhase('report');
      }
    } catch (e) {
      console.error('[Init] Failed:', e);
      setPhase('free_chat');
    }
  };

  // ============================================================================
  // Report → Questions 전환 핸들러
  // ============================================================================

  const handleStartQuestions = () => {
    // Phase 전환
    setPhase('questions');

    // 1. 가벼운 요약 메시지 (2-3문장)
    const summaryText = marketSummary
      ? `${marketSummary.productCount}개 상품과 ${marketSummary.reviewCount}개 리뷰를 분석했어요. 평균 가격은 ${Math.round((marketSummary.priceRange?.avg || 0) / 10000)}만원대입니다.`
      : `시장 분석을 완료했어요.`;

    const summaryMsg: ChatMessage = {
      id: 'summary',
      role: 'assistant',
      content: summaryText,
      typing: true,
      timestamp: Date.now()
    };
    setMessages([summaryMsg]);

    // 2. 질문 시작 멘트 (1초 후)
    setTimeout(() => {
      const introMsg: ChatMessage = {
        id: 'intro',
        role: 'assistant',
        content: '이제 몇 가지 질문으로 딱 맞는 제품을 찾아드릴게요.',
        typing: true,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, introMsg]);
    }, 1000);

    // 3. 첫 질문 메시지 (2초 후)
    if (currentQuestion) {
      setTimeout(() => {
        const questionMsg: ChatMessage = {
          id: `q_${currentQuestion.id}`,
          role: 'assistant',
          content: currentQuestion.question,
          options: currentQuestion.options.map((o: any) => o.label),
          dataSource: currentQuestion.dataSource,
          tip: currentQuestion.reason,
          typing: true,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, questionMsg]);
      }, 2000);
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
        return q ? (choice === 'A' ? q.optionA.label : q.optionB.label) : '';
      })
      .filter(Boolean)
      .join(', ');

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
          userMessage: selectionsStr,
          collectedInfo,
          phase: 'balance'
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
    <div className="min-h-screen bg-[#FBFBFD] flex flex-col">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 h-14 flex items-center justify-between">
          <button onClick={() => router.push('/categories')} className="p-2 -ml-2 text-gray-400">
            <CaretLeft size={24} weight="bold" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{categoryName} 구매 상담</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">AI</span>
          </div>
          <div className="w-10" />
        </header>

        {/* Todo Progress는 내부 관리용 - UI에서 숨김 */}

        {/* Loading Phase */}
        {phase === 'loading' && (
          <LoadingPhase steps={loadingSteps} searchQueries={searchQueries} />
        )}

        {/* Report Phase (분석 결과 + 다음 버튼) */}
        {phase === 'report' && (
          <ReportPhase
            marketSummary={marketSummary}
            trendAnalysis={trendAnalysis}
            onNext={handleStartQuestions}
          />
        )}

        {/* Chat Area */}
        {phase !== 'loading' && phase !== 'report' && (
          <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-40">
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
              <BalanceGameUI
                questions={balanceQuestions}
                onComplete={handleBalanceComplete}
              />
            )}

            {isTyping && <SearchingIndicator queries={activeSearchQueries} />}
            <div ref={messagesEndRef} />
          </main>
        )}

        {/* Input Bar */}
        {phase !== 'loading' && phase !== 'report' && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 pb-8 z-[110]">
            <div className="relative overflow-hidden rounded-[20px] border border-gray-200 flex items-end">
              <div
                className="absolute pointer-events-none"
                style={{
                  width: '358px',
                  height: '176px',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%) translateY(-20px)',
                  background: 'radial-gradient(50% 50% at 50% 50%, rgba(217, 233, 255, 0.65) 0%, rgba(217, 233, 255, 0) 100%)',
                  zIndex: 0
                }}
              />

              <textarea
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(48, Math.min(e.target.scrollHeight, 120))}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleFreeChat(inputValue);
                  }
                }}
                placeholder="추가로 궁금한 점이 있으신가요?"
                className="relative z-10 w-full min-h-[48px] max-h-[120px] py-[13px] pl-4 pr-12 rounded-[20px] bg-white/70 backdrop-blur-md text-base text-gray-800 placeholder:text-gray-400 placeholder:font-medium focus:outline-none transition-all resize-none overflow-y-auto"
                disabled={isTyping}
                rows={1}
              />
              <button
                onClick={() => handleFreeChat(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                className="absolute right-1.5 bottom-2 w-8 h-8 z-20 flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
              >
                {isTyping ? (
                  <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : (
                  <img src="/icons/sendreal.png" alt="send" className="w-8 h-8 object-contain" />
                )}
              </button>
            </div>
          </div>
        )}
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-xl p-3 mb-2"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-xs text-gray-400 font-medium">검색 완료</span>
            </div>
            <p className="text-xs text-gray-300 font-mono mb-2">🔍 {message.searchContext.query}</p>
            <p className="text-sm text-white/90 leading-relaxed">
              💡 {message.searchContext.insight}
            </p>
          </motion.div>
        )}

        {/* Data Source Badge */}
        {!isUser && message.dataSource && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
              📊 {message.dataSource}
            </span>
          </div>
        )}

        {/* Message Content */}
        {isUser ? (
          <div className="bg-gray-100 text-gray-800 rounded-[20px] px-4 py-3 text-base font-medium leading-[140%]">
            {message.content}
          </div>
        ) : (
          <div className="w-full">
            <AssistantMessage
              content={message.content}
              typing={message.typing}
              speed={12}
            />
          </div>
        )}

        {/* Tip Box (별도 디자인) */}
        {!isUser && message.tip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-start gap-2 bg-amber-50/80 border border-amber-100 rounded-xl px-3 py-2.5"
          >
            <span className="text-amber-500 text-sm mt-0.5">💡</span>
            <p className="text-[12px] text-amber-700 leading-relaxed font-medium">
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-3 pt-2"
          >
            <div className="w-full h-[1px] bg-gray-100 mb-3" />
            <div className="flex items-center justify-between mb-1">
              <span className="text-[14px] text-gray-400 font-semibold">피할 단점</span>
            </div>
            <h3 className="text-[16px] font-semibold text-gray-900 leading-snug mb-3">
              피하고 싶은 단점을 선택하세요 <span className="text-gray-500 text-[13px] font-normal">(건너뛰기 가능)</span>
            </h3>
            <div className="space-y-2">
              {message.negativeFilterOptions.map((opt) => (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleNegativeOption(opt.id)}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                    selectedNegativeIds.has(opt.id)
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                    selectedNegativeIds.has(opt.id)
                      ? 'border-red-400 bg-red-400'
                      : 'border-gray-300'
                  }`}>
                    {selectedNegativeIds.has(opt.id) && (
                      <CheckCircle size={14} weight="fill" className="text-white" />
                    )}
                  </div>
                  <span className="text-[14px] font-medium text-gray-700">{opt.label}</span>
                </motion.button>
              ))}
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleNegativeSubmit}
              className="w-full py-3 px-4 rounded-xl bg-gray-900 text-white font-semibold text-[15px] hover:bg-gray-800 transition-all mt-3"
            >
              {selectedNegativeIds.size > 0 ? `${selectedNegativeIds.size}개 선택 완료` : '없음 (다음으로)'}
            </motion.button>
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
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

