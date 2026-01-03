'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  CaretLeft, Star,
  ChatCircleDots, Sparkle, Lightning,
  Coins, Prohibit, Scales, Info, X
} from '@phosphor-icons/react/dist/ssr';
import { KnowledgePDPModal } from '@/components/knowledge-agent/KnowledgePDPModal';
import {
  InlineBudgetSelector,
  InlineNegativeFilter,
  InlineBalanceCarousel
} from '@/components/knowledge-agent/ChatUIComponents';
import { StepIndicator } from '@/components/StepIndicator';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import {
  AssistantMessage,
  ThinkingMessage,
  ResultChatMessage
} from '@/components/recommend-v2';

// ============================================================================
// Types
// ============================================================================

type FlowPhase = 'free_chat' | 'balance' | 'negative' | 'budget' | 'result';

interface BalanceQuestion {
  id: string;
  optionA: { label: string; description?: string };
  optionB: { label: string; description?: string };
  insight: string;
}

interface NegativeOption {
  id: string;
  label: string;
  description?: string;
}

interface BudgetPreset {
  type: 'entry' | 'mid' | 'premium';
  label: string;
  range: { min: number; max: number };
  description: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: string[];
  ui_type?: 'chat' | 'budget' | 'negative_filter' | 'balance_game' | 'result';
  products?: any[];
  balanceQuestions?: BalanceQuestion[];
  negativeOptions?: NegativeOption[];
  budgetPresets?: BudgetPreset[];
  timestamp: number;
  typing?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export default function KnowledgeAgentPage() {
  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitializedRef = useRef(false); // 중복 초기화 방지용

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStep, setCurrentStep] = useState('intent');
  const [productCount, setProductCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [expertSummary, setExpertSummary] = useState('');

  // Hybrid Flow State
  const [phase, setPhase] = useState<FlowPhase>('free_chat');
  const [chatCount, setChatCount] = useState(0);
  const [userPreferences, setUserPreferences] = useState<Record<string, any>>({});

  // StepIndicator 단계 계산 (recommend-v2와 동일)
  const indicatorStep = useMemo(() => {
    if (phase === 'free_chat') return 1;   // 조건 고르기
    if (phase === 'balance') return 2;     // 밸런스 게임
    if (phase === 'negative') return 3;    // 피할 단점
    if (phase === 'budget' || phase === 'result') return 4;  // 예산 설정
    return 1;
  }, [phase]);

  // ============================================================================
  // Effects
  // ============================================================================

  useEffect(() => {
    // React Strict Mode에서 중복 호출 방지
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    startConsultation();
  }, [categoryKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================================================
  // API Calls
  // ============================================================================

  const startConsultation = async () => {
    setIsTyping(true);
    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryKey, action: 'init', currentStep: 'intent' }),
      });
      const data = await res.json();
      
      if (data.success) {
        setProductCount(data.productCount);
        addAssistantMessage(data);
      }
    } catch (e) {
      console.error('Init failed:', e);
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // chatCount 증가 (free_chat 단계에서만)
    if (phase === 'free_chat') {
      setChatCount(prev => prev + 1);
    }

    try {
      const res = await fetch('/api/knowledge-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          action: 'chat',
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
          userMessage: content,
          currentStep,
          // 새로운 Hybrid Flow 상태 전달
          chatState: {
            phase,
            chatCount: phase === 'free_chat' ? chatCount + 1 : chatCount,
            collectedInfo: userPreferences
          }
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.next_step) setCurrentStep(data.next_step);

        // 새로운 phase 처리
        if (data.chatState?.phase) {
          setPhase(data.chatState.phase);
        }

        // 사용자 선호도 누적
        if (data.chatState?.collectedInfo) {
          setUserPreferences(prev => ({ ...prev, ...data.chatState.collectedInfo }));
        }

        if (data.ui_type === 'result') {
          setAllProducts(data.all_products || data.products || []);
          setExpertSummary(data.content);
          setShowResult(true);
          setPhase('result');
        }
        addAssistantMessage(data);
      }
    } catch (e) {
      console.error('Chat failed:', e);
    } finally {
      setIsTyping(false);
    }
  };

  const addAssistantMessage = (data: any) => {
    console.log('[Knowledge Agent UI] Adding message:', {
      content: data.content?.substring(0, 100),
      options: data.options,
      ui_type: data.ui_type,
      products: data.products?.length,
      phase: data.chatState?.phase,
      balanceQuestions: data.balanceQuestions?.length,
      negativeOptions: data.negativeOptions?.length,
      budgetPresets: data.budgetPresets?.length
    });

    const newMsg: ChatMessage = {
      id: `a_${Date.now()}`,
      role: 'assistant',
      content: data.content || '',
      options: data.options || [],
      ui_type: data.ui_type || 'chat',
      products: data.products || [], // API에서 이미 매핑된 상품 데이터
      balanceQuestions: data.balanceQuestions,
      negativeOptions: data.negativeOptions,
      budgetPresets: data.budgetPresets,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMsg]);
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#FBFBFD] flex flex-col">
      <div className="max-w-[480px] mx-auto w-full flex-1 flex flex-col relative border-x border-gray-100 bg-white">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 h-14 flex items-center justify-between">
          <button onClick={() => router.push('/categories-v2')} className="p-2 -ml-2 text-gray-400">
            <CaretLeft size={24} weight="bold" />
          </button>
          <div className="flex items-center gap-2">
             <span className="font-bold text-gray-900">AI 구매 상담 에이전트</span>
             <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">FLASH</span>
          </div>
          <div className="w-10" />
        </header>

        {/* StepIndicator (recommend-v2와 동일) */}
        {phase !== 'result' && !showResult && (
          <StepIndicator currentStep={indicatorStep} className="top-14" />
        )}

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto px-4 py-6 space-y-10 pb-40">
          {messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              onOptionClick={sendMessage}
              onProductClick={(p) => setSelectedProduct(p)}
            />
          ))}
          {isTyping && <ThinkingMessage />}
          <div ref={messagesEndRef} />
        </main>

        {/* Result Summary - Full Screen Analysis Report */}
        <AnimatePresence>
          {showResult && (
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="fixed inset-0 z-[60] bg-white overflow-y-auto"
            >
              <div className="max-w-[480px] mx-auto min-h-screen pb-20 border-x border-gray-100">
                <div className="sticky top-0 bg-white/90 backdrop-blur-md px-4 py-4 border-b border-gray-100 flex items-center justify-between z-10">
                    <h2 className="text-xl font-extrabold text-gray-950">분석 종결 리포트</h2>
                    <button onClick={() => setShowResult(false)} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                      <X size={24} weight="bold" />
                    </button>
                </div>

                <div className="p-5 space-y-10">
                    {/* Expert Conclusion */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="bg-purple-900 text-white p-6 rounded-[32px] shadow-2xl shadow-purple-200"
                    >
                      <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-purple-200">
                          <Sparkle weight="fill" /> 전문가 최종 제언
                      </h3>
                      <p className="text-[15px] leading-relaxed opacity-95">
                        {expertSummary}
                      </p>
                    </motion.div>

                    {/* Comparison Table */}
                    {allProducts.length > 1 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-1">
                        <Scales size={20} weight="fill" className="text-gray-400" />
                        <h3 className="font-bold text-gray-900">전수 비교표 (인기 모델 {Math.min(allProducts.length, 5)}종)</h3>
                      </div>
                      <div className="bg-gray-50 rounded-3xl p-1 overflow-hidden border border-gray-100 shadow-inner">
                        <DetailedComparisonTable
                          recommendations={allProducts.slice(0, 5).map((p, idx) => ({
                            id: p.pcode || p.id,
                            rank: (idx + 1) as 1 | 2 | 3 | 4,
                            finalScore: 0,
                            reasoning: p.reasoning || '',
                            selectedTagsEvaluation: [],
                            additionalPros: [],
                            cons: [],
                            anchorComparison: [],
                            product: {
                              id: p.pcode || p.id,
                              title: p.name || p.title,
                              brand: p.brand,
                              price: p.price,
                              thumbnail: p.thumbnail,
                              reviewUrl: p.reviewUrl || '',
                              reviewCount: p.reviewCount || 0
                            }
                          })) as any}
                          showScore={false}
                        />
                      </div>
                      <p className="text-center text-[11px] text-gray-400 italic mt-2">
                        * 시장 데이터와 실사용 리뷰를 분석한 결과입니다.
                      </p>
                    </div>
                    )}

                    {/* Final Recommended Cards */}
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 px-1">
                        <Lightning size={20} weight="fill" className="text-yellow-500" />
                        <h3 className="font-bold text-gray-900">최종 추천 선택지</h3>
                      </div>
                      <div className="grid gap-4">
                        {allProducts.slice(0, 3).map((p, i) => (
                          <ResultProductCard 
                            key={p.pcode} 
                            product={p} 
                            rank={i+1} 
                            onClick={() => setSelectedProduct(p)} 
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setShowResult(false);
                        setMessages([]);
                        setCurrentStep('intent');
                        setPhase('free_chat');
                        setChatCount(0);
                        setUserPreferences({});
                        isInitializedRef.current = false;
                        startConsultation();
                      }}
                      className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-200 transition-all"
                    >
                      상담 처음부터 다시 시작하기
                    </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Input Bar - recommend-v2 스타일 통합 */}
        {!showResult && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 pb-8 z-[110]">
            <div className="relative overflow-hidden rounded-[20px] border border-gray-200 flex items-end shadow-sm">
              {/* Radial Gradient Background (Ellipse 464) */}
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
                ref={inputRef as any}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  // Auto resize
                  e.target.style.height = 'auto';
                  const scrollHeight = e.target.scrollHeight;
                  const newHeight = Math.max(48, Math.min(scrollHeight, 120));
                  e.target.style.height = `${newHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputValue.trim()) sendMessage(inputValue.trim());
                  }
                }}
                placeholder="추천 결과에 대해 궁금한게 있으신가요?"
                className="relative z-10 w-full min-h-[48px] max-h-[120px] py-[13px] pl-4 pr-12 rounded-[20px] bg-white/70 backdrop-blur-md text-base text-gray-800 placeholder:text-gray-400 placeholder:font-medium focus:outline-none transition-all resize-none overflow-y-auto"
                disabled={isTyping}
                rows={1}
              />
              <button
                onClick={() => {
                  if (inputValue.trim()) sendMessage(inputValue.trim());
                }}
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
            <p className="text-[10px] text-gray-400 mt-2 text-center font-medium">
              Enter로 전송 · Shift+Enter로 줄바꿈
            </p>
          </div>
        )}
      </div>

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
// Internal Components
// ============================================================================

function MessageBubble({ message, onOptionClick, onProductClick }: { 
  message: ChatMessage, 
  onOptionClick: (val: string) => void,
  onProductClick: (p: any) => void
}) {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full mb-2`}
    >
      <div className={`${isUser ? 'max-w-[85%]' : 'w-full'} space-y-3`}>
        {isAssistant ? (
          <div className="w-full">
            <AssistantMessage 
              content={message.content} 
              typing={message.typing}
              speed={15}
            />
          </div>
        ) : (
          <div className="bg-gray-50 text-gray-800 rounded-[20px] px-4 py-3 text-base font-medium leading-[140%] shadow-sm border border-gray-100/50">
            {message.content}
          </div>
        )}

        {/* Assistant Options - Claude/Cursor Style matching recommend-v2 buttons */}
        {isAssistant && message.options && message.options.length > 0 && (!message.ui_type || message.ui_type === 'chat') && (
          <div className="flex flex-wrap gap-2 pt-1 px-1">
            {message.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => onOptionClick(opt)}
                className="px-4 py-3 bg-white border border-gray-200 rounded-2xl text-[14px] font-bold text-gray-700 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-95 shadow-sm"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Step-specific UI (Budget, Filter etc) - Inline inside chat */}
        {isAssistant && message.ui_type === 'budget' && message.budgetPresets && (
           <InlineBudgetSelector
             presets={message.budgetPresets}
             onSelect={(min, max) => onOptionClick(`예산 ${(min/10000).toFixed(0)}~${(max/10000).toFixed(0)}만원`)}
             onSkip={() => onOptionClick('예산 상관없어요')}
           />
        )}

        {isAssistant && message.ui_type === 'negative_filter' && message.negativeOptions && (
           <InlineNegativeFilter
             options={message.negativeOptions}
             onSelect={(filters) => onOptionClick(`${filters.join(', ')} 단점은 피하고 싶어요`)}
             onSkip={() => onOptionClick('단점 상관없어요')}
           />
        )}

        {isAssistant && message.ui_type === 'balance_game' && message.balanceQuestions && (
           <InlineBalanceCarousel
             questions={message.balanceQuestions}
             onComplete={(selections) => {
               const choices = Array.from(selections.entries())
                 .map(([id, choice]) => {
                   const q = message.balanceQuestions?.find(q => q.id === id);
                   if (!q) return '';
                   return choice === 'A' ? q.optionA.label : q.optionB.label;
                 })
                 .filter(Boolean);
               onOptionClick(`선택: ${choices.join(', ')}`);
             }}
           />
        )}

        {/* Product Recommendation Cards - ui_type이 'result'일 때 표시 */}
        {isAssistant && message.products && message.products.length > 0 && (
          <div className="mt-4 space-y-4 max-w-[420px] px-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-purple-600 rounded-full" />
              <p className="text-sm font-bold text-gray-900">맞춤 추천 결과</p>
            </div>
            {message.products.slice(0, 3).map((product: any, i: number) => (
              <button
                key={product.pcode || i}
                onClick={() => onProductClick(product)}
                className="w-full p-4 bg-white border border-gray-100 rounded-[24px] flex gap-4 text-left hover:border-purple-300 hover:shadow-xl transition-all shadow-sm group"
              >
                <div className="w-20 h-20 bg-gray-50 rounded-2xl flex-shrink-0 overflow-hidden relative border border-gray-100">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt={product.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🍳</div>
                  )}
                  <div className="absolute top-0 left-0 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-br-xl">
                    {i + 1}위
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{product.brand}</p>
                  <h4 className="text-[15px] font-bold text-gray-900 leading-tight line-clamp-2 group-hover:text-purple-700 transition-colors">{product.name}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[16px] font-black text-gray-950">{product.price?.toLocaleString()}원</span>
                    {product.rating && (
                      <div className="flex items-center gap-0.5 bg-yellow-50 px-1.5 py-0.5 rounded-lg border border-yellow-100">
                        <Star weight="fill" size={10} className="text-yellow-500" />
                        <span className="text-[11px] font-bold text-yellow-700">{product.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return <ThinkingMessage />;
}

function ResultProductCard({ product, rank, onClick }: { product: any, rank: number, onClick: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.1 }}
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-3xl p-4 flex gap-4 cursor-pointer hover:shadow-xl hover:border-purple-200 transition-all shadow-sm group"
    >
      <div className="relative w-24 h-24 rounded-2xl bg-gray-50 flex-shrink-0 overflow-hidden border border-gray-100">
        {product.thumbnail ? (
          <Image src={product.thumbnail} alt={product.name} fill className="object-contain p-2" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🍳</div>
        )}
        <div className="absolute top-0 left-0 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-br-xl">
          {rank}위
        </div>
      </div>
      <div className="flex-1 min-w-0 py-1 flex flex-col justify-between">
        <div>
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{product.brand}</p>
          <h4 className="text-[15px] font-bold text-gray-900 leading-tight line-clamp-2">{product.name}</h4>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-base font-black text-gray-950">{product.price?.toLocaleString()}원</span>
          <div className="flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-lg border border-yellow-100">
            <Star weight="fill" size={12} className="text-yellow-500" />
            <span className="text-[11px] font-bold text-yellow-700">{product.rating}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function parseMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-gray-950">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
