'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import type { BalanceQuestion, NegativeFilterOption, ProductScore } from '@/types/rules';
import hardFiltersData from '@/data/rules/hard_filters.json';

// =====================================================
// Types
// =====================================================

interface HardFilterQuestion {
  id: string;
  type: 'single' | 'multi';
  question: string;
  options: Array<{
    label: string;
    value: string;
    filter?: Record<string, unknown>;
    category_code?: string;
  }>;
}

interface HardFilterConfig {
  category_name: string;
  guide: {
    title: string;
    points: string[];
    trend: string;
  };
  sub_categories?: Array<{ label: string; code: string }>;
  questions: HardFilterQuestion[];
}

interface CategoryRulesData {
  category_key: string;
  category_name: string;
  target_categories: string[];
  logic_map: Record<string, unknown>;
  balance_game: BalanceQuestion[];
  negative_filter: NegativeFilterOption[];
}

interface ProductItem {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  rank: number | null;
  thumbnail: string | null;
  spec: Record<string, unknown>;
}

type FlowStep = 0 | 1 | 2 | 3 | 4 | 5;

// =====================================================
// Component
// =====================================================

export default function RecommendV2Page() {
  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Flow state
  const [currentStep, setCurrentStep] = useState<FlowStep>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Data
  const [rulesData, setRulesData] = useState<CategoryRulesData | null>(null);
  const [hardFilterConfig, setHardFilterConfig] = useState<HardFilterConfig | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductItem[]>([]);

  // Step 0: Guide
  const [scanProgress, setScanProgress] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  // Step 1: Hard Filters
  const [hardFilterAnswers, setHardFilterAnswers] = useState<Record<string, string>>({});
  const [currentHardFilterIndex, setCurrentHardFilterIndex] = useState(0);

  // Step 3: Balance Game
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0);
  const [balanceSelections, setBalanceSelections] = useState<string[]>([]);

  // Step 4: Negative Filter
  const [negativeSelections, setNegativeSelections] = useState<string[]>([]);

  // Step 5: Budget & Result
  const [budget, setBudget] = useState<string>('');
  const [scoredProducts, setScoredProducts] = useState<ProductScore[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // UI
  const [showBackModal, setShowBackModal] = useState(false);

  // =====================================================
  // Helpers
  // =====================================================

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // =====================================================
  // Data Loading
  // =====================================================

  useEffect(() => {
    if (!categoryKey) return;

    const loadData = async () => {
      setIsLoading(true);

      try {
        // Load rules
        const rulesRes = await fetch(`/api/v2/rules/${categoryKey}`);
        const rulesJson = await rulesRes.json();

        if (!rulesJson.success) {
          router.push('/categories-v2');
          return;
        }
        setRulesData(rulesJson.data);

        // Load hard filter config
        const config = (hardFiltersData as Record<string, HardFilterConfig>)[categoryKey];
        setHardFilterConfig(config || null);

        // Load products
        const productsRes = await fetch('/api/v2/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryKey, limit: 100 }),
        });
        const productsJson = await productsRes.json();

        if (productsJson.success) {
          setProducts(productsJson.data.products);
          setFilteredProducts(productsJson.data.products);
        }

        // Start Step 0 animation
        startScanAnimation();

      } catch (error) {
        console.error('Data load error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [categoryKey, router]);

  // =====================================================
  // Step 0: Scan Animation
  // =====================================================

  const startScanAnimation = () => {
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowGuide(true), 300);
          return 100;
        }
        return prev + 2;
      });
    }, 40);
  };

  const handleGuideComplete = () => {
    setCurrentStep(1);
    scrollToBottom();
  };

  // =====================================================
  // Step 1: Hard Filter
  // =====================================================

  const handleHardFilterSelect = (questionId: string, value: string) => {
    setHardFilterAnswers(prev => ({ ...prev, [questionId]: value }));

    const questions = hardFilterConfig?.questions || [];
    const nextIndex = currentHardFilterIndex + 1;

    if (nextIndex < questions.length) {
      setCurrentHardFilterIndex(nextIndex);
    } else {
      // Move to Step 2
      setTimeout(() => {
        applyHardFilters();
        setCurrentStep(2);
        scrollToBottom();
      }, 300);
    }
  };

  const applyHardFilters = () => {
    // Simple filtering logic (can be enhanced)
    let filtered = [...products];
    
    // Apply category_code filter if sub-category selected
    const subCatAnswer = Object.entries(hardFilterAnswers).find(([key]) => 
      key.includes('type')
    );
    
    if (subCatAnswer) {
      const option = hardFilterConfig?.questions
        .find(q => q.id === subCatAnswer[0])?.options
        .find(o => o.value === subCatAnswer[1]);
      
      if (option?.category_code) {
        filtered = filtered.filter(p => 
          (p as unknown as { category_code: string }).category_code === option.category_code
        );
      }
    }

    setFilteredProducts(filtered.length > 0 ? filtered : products);
  };

  // =====================================================
  // Step 2: Checkpoint
  // =====================================================

  const handleCheckpointConfirm = () => {
    setCurrentStep(3);
    scrollToBottom();
  };

  // =====================================================
  // Step 3: Balance Game
  // =====================================================

  const handleBalanceSelect = (ruleKey: string) => {
    setBalanceSelections(prev => [...prev, ruleKey]);

    const questions = rulesData?.balance_game || [];
    const nextIndex = currentBalanceIndex + 1;

    if (nextIndex < questions.length) {
      setCurrentBalanceIndex(nextIndex);
    } else {
      setTimeout(() => {
        setCurrentStep(4);
        scrollToBottom();
      }, 300);
    }
  };

  // =====================================================
  // Step 4: Negative Filter
  // =====================================================

  const handleNegativeToggle = (ruleKey: string) => {
    setNegativeSelections(prev =>
      prev.includes(ruleKey)
        ? prev.filter(k => k !== ruleKey)
        : [...prev, ruleKey]
    );
  };

  const handleNegativeComplete = () => {
    setCurrentStep(5);
    scrollToBottom();
  };

  // =====================================================
  // Step 5: Budget & Result
  // =====================================================

  const budgetOptions = [
    { label: '5만원 이하', value: '0-50000', desc: '가성비' },
    { label: '5~10만원', value: '50000-100000', desc: '적정가', popular: true },
    { label: '10~20만원', value: '100000-200000', desc: '프리미엄' },
    { label: '20만원 이상', value: '200000-', desc: '최고급' },
  ];

  const handleBudgetSelect = (value: string) => {
    setBudget(value);
  };

  const handleGetRecommendation = async () => {
    if (!rulesData || filteredProducts.length === 0) return;

    setIsCalculating(true);

    try {
      const response = await fetch('/api/v2/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          products: filteredProducts.map(p => ({
            pcode: p.pcode,
            title: p.title,
            brand: p.brand,
            price: p.price,
            rank: p.rank,
            thumbnail: p.thumbnail,
            spec: p.spec,
          })),
          balanceSelections,
          negativeSelections,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Apply budget filter
        let top = result.data.scoredProducts;
        if (budget) {
          const [min, max] = budget.split('-').map(v => v ? parseInt(v) : null);
          top = top.filter((p: ProductScore) => {
            if (!p.price) return true;
            if (min && p.price < min) return false;
            if (max && p.price > max) return false;
            return true;
          });
        }
        setScoredProducts(top.slice(0, 3));
      }
    } catch (error) {
      console.error('Score error:', error);
    } finally {
      setIsCalculating(false);
      scrollToBottom();
    }
  };

  // =====================================================
  // Render Functions
  // =====================================================

  const renderStep0 = () => (
    <div className="space-y-6">
      {/* Scan Animation */}
      {!showGuide && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
            <div 
              className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
              style={{ animationDuration: '1s' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-500">{scanProgress}%</span>
            </div>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed">
            최근 3개월간 맘카페, 블로그 등의<br />
            <strong className="text-gray-900">{hardFilterConfig?.category_name || categoryKey}</strong> 실제 사용기를 분석 중입니다...
          </p>
        </motion.div>
      )}

      {/* Guide Cards */}
      {showGuide && hardFilterConfig && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Guide Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📋</span>
              <h3 className="font-bold text-gray-900">{hardFilterConfig.guide.title}</h3>
            </div>
            <ul className="space-y-2">
              {hardFilterConfig.guide.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-500 mt-0.5">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Trend Card */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🔥</span>
              <h3 className="font-bold text-gray-900">트렌드</h3>
            </div>
            <p className="text-sm text-gray-700">{hardFilterConfig.guide.trend}</p>
          </div>

          {/* CTA Message */}
          <div className="bg-gray-50 rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-600 leading-relaxed">
              복잡한 용어, 스펙 비교는 제가 이미 끝냈어요.<br />
              <strong className="text-gray-900">고객님의 상황만 편하게 알려주세요.</strong><br />
              딱 맞는 제품을 찾아드릴게요.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );

  const renderStep1 = () => {
    if (!hardFilterConfig) return null;

    const questions = hardFilterConfig.questions;
    if (questions.length === 0) {
      // No hard filter questions, skip to step 2
      setTimeout(() => {
        setCurrentStep(2);
        scrollToBottom();
      }, 100);
      return null;
    }

    const currentQuestion = questions[currentHardFilterIndex];
    if (!currentQuestion) return null;

    return (
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Question Header */}
        <div className="flex items-center justify-between">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
            Q. {currentQuestion.question.split('?')[0].slice(0, 10)}...
          </span>
          <span className="text-xs text-gray-500">
            {currentHardFilterIndex + 1} / {questions.length}
          </span>
        </div>

        <h3 className="text-lg font-bold text-gray-900">{currentQuestion.question}</h3>

        {/* Options */}
        <div className="space-y-2">
          {currentQuestion.options.map((option) => {
            const isSelected = hardFilterAnswers[currentQuestion.id] === option.value;
            return (
              <motion.button
                key={option.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleHardFilterSelect(currentQuestion.id, option.value)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                  <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                    {option.label}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const renderStep2 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Summary */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">✅</span>
          <h3 className="font-bold text-gray-900">조건 분석 완료</h3>
        </div>

        {/* Condition Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(hardFilterAnswers).map(([key, value]) => {
            const question = hardFilterConfig?.questions.find(q => q.id === key);
            const option = question?.options.find(o => o.value === value);
            return (
              <span key={key} className="px-3 py-1 bg-white rounded-full text-sm text-emerald-700 border border-emerald-200">
                {option?.label || value}
              </span>
            );
          })}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between p-3 bg-white rounded-xl">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-400 line-through">{products.length}</p>
            <p className="text-xs text-gray-500">전체 상품</p>
          </div>
          <div className="text-2xl">→</div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{filteredProducts.length}</p>
            <p className="text-xs text-gray-500">후보군</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 text-center">
        상황에 맞는 상위 <strong className="text-gray-900">{filteredProducts.length}개</strong> 후보군을 추렸어요.<br />
        이제 남은 후보들 중에서 최적의 제품을 골라봐요.
      </p>
    </motion.div>
  );

  const renderStep3 = () => {
    const questions = rulesData?.balance_game || [];
    if (questions.length === 0) {
      setTimeout(() => {
        setCurrentStep(4);
        scrollToBottom();
      }, 100);
      return null;
    }

    const currentQuestion = questions[currentBalanceIndex];
    if (!currentQuestion) return null;

    return (
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
            Q. 취향 선택
          </span>
          <span className="text-xs text-gray-500">
            {currentBalanceIndex + 1} / {questions.length}
          </span>
        </div>

        <h3 className="text-lg font-bold text-gray-900 text-center">{currentQuestion.title}</h3>

        <div className="space-y-3">
          {/* Option A */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleBalanceSelect(currentQuestion.option_A.target_rule_key)}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 text-left hover:border-blue-400 transition-all"
          >
            <span className="text-sm font-medium text-gray-800">{currentQuestion.option_A.text}</span>
          </motion.button>

          <p className="text-center text-gray-400 text-xs font-bold">VS</p>

          {/* Option B */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleBalanceSelect(currentQuestion.option_B.target_rule_key)}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 text-left hover:border-purple-400 transition-all"
          >
            <span className="text-sm font-medium text-gray-800">{currentQuestion.option_B.text}</span>
          </motion.button>
        </div>

        {/* Skip */}
        <div className="text-center pt-2">
          <button
            onClick={() => {
              const nextIndex = currentBalanceIndex + 1;
              if (nextIndex < questions.length) {
                setCurrentBalanceIndex(nextIndex);
              } else {
                setCurrentStep(4);
                scrollToBottom();
              }
            }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            건너뛰기
          </button>
        </div>
      </motion.div>
    );
  };

  const renderStep4 = () => {
    const options = rulesData?.negative_filter || [];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="mb-2">
          <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">
            Q. 단점 필터
          </span>
        </div>

        <h3 className="text-lg font-bold text-gray-900">
          실제 리뷰에서 발견된 주요 단점들이에요.<br />
          <span className="text-rose-500">&apos;이것만큼은 절대 참을 수 없다&apos;</span> 하는 것을 골라주세요.
        </h3>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {options.map((option) => {
            const isSelected = negativeSelections.includes(option.target_rule_key);
            return (
              <button
                key={option.id}
                onClick={() => handleNegativeToggle(option.target_rule_key)}
                className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-rose-300 bg-rose-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'border-rose-500 bg-rose-500' : 'border-gray-300'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm font-medium ${isSelected ? 'text-rose-700' : 'text-gray-700'}`}>
                    {option.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const renderStep5 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Budget Selection */}
      {scoredProducts.length === 0 && (
        <>
          <div className="mb-2">
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
              마지막 단계
            </span>
          </div>

          <h3 className="text-lg font-bold text-gray-900">생각해 둔 예산이 있나요?</h3>

          <div className="grid grid-cols-2 gap-2">
            {budgetOptions.map((option) => {
              const isSelected = budget === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleBudgetSelect(option.value)}
                  className={`p-3 rounded-xl text-left transition-all border ${
                    isSelected
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className={`font-semibold text-sm ${isSelected ? 'text-amber-700' : 'text-gray-900'}`}>
                      {option.label}
                    </span>
                    {option.popular && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-700">
                        인기
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${isSelected ? 'text-amber-600' : 'text-gray-500'}`}>
                    {option.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Results */}
      {scoredProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="text-center mb-4">
            <span className="text-3xl">🎉</span>
            <h3 className="text-lg font-bold text-gray-900 mt-2">
              {rulesData?.category_name} 추천 TOP 3
            </h3>
            <p className="text-sm text-gray-500">당신의 조건에 가장 잘 맞는 제품이에요</p>
          </div>

          {scoredProducts.map((product, index) => (
            <motion.div
              key={product.pcode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.15 }}
              className={`relative bg-white rounded-2xl border-2 overflow-hidden ${
                index === 0 ? 'border-yellow-400 shadow-lg' : 'border-gray-200'
              }`}
            >
              <div className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl font-bold text-sm ${
                index === 0 ? 'bg-yellow-400 text-yellow-900' :
                index === 1 ? 'bg-gray-300 text-gray-700' :
                'bg-amber-700 text-white'
              }`}>
                {index + 1}위
              </div>

              <div className="p-4 pt-8">
                <div className="flex gap-3">
                  {product.thumbnail && (
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                      <img src={product.thumbnail} alt={product.title} className="w-full h-full object-contain p-2" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">{product.brand}</p>
                    <h4 className="text-sm font-bold text-gray-900 line-clamp-2 mb-1">{product.title}</h4>
                    {product.price && (
                      <p className="text-base font-bold text-gray-900">
                        {product.price.toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">원</span>
                      </p>
                    )}
                  </div>
                </div>

                {product.matchedRules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                    {product.matchedRules.slice(0, 3).map((rule, i) => (
                      <span
                        key={i}
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          rule.startsWith('❌')
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {rule.replace('체감속성_', '').replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          <div className="text-center pt-4">
            <button
              onClick={() => router.push('/categories-v2')}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              다른 카테고리 추천받기 →
            </button>
          </div>
        </motion.div>
      )}

      {/* Calculating */}
      {isCalculating && (
        <div className="flex items-center justify-center py-8">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </motion.div>
  );

  // =====================================================
  // Main Render
  // =====================================================

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = ['가이드', '환경 체크', '후보 분석', '취향 선택', '단점 필터', '예산 & 추천'];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] h-dvh overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3 flex items-center justify-between">
            <button onClick={() => setShowBackModal(true)} className="text-gray-600 hover:text-gray-900">
              <CaretLeft size={24} weight="bold" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {rulesData?.category_name || ''} 추천
            </h1>
            <div className="w-6" />
          </div>
          {/* Progress */}
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{currentStep}/5</span>
              <span>{stepLabels[currentStep]}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto px-4 py-6" style={{ paddingBottom: '120px' }}>
          <AnimatePresence mode="wait">
            {currentStep === 0 && <div key="step0">{renderStep0()}</div>}
            {currentStep === 1 && <div key="step1">{renderStep1()}</div>}
            {currentStep === 2 && <div key="step2">{renderStep2()}</div>}
            {currentStep === 3 && <div key="step3">{renderStep3()}</div>}
            {currentStep === 4 && <div key="step4">{renderStep4()}</div>}
            {currentStep === 5 && <div key="step5">{renderStep5()}</div>}
          </AnimatePresence>
          <div ref={contentEndRef} />
        </main>

        {/* Bottom Button */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {currentStep === 0 && showGuide && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleGuideComplete}
              className="w-full h-14 rounded-2xl font-semibold text-base bg-blue-500 text-white hover:bg-blue-600 transition-all"
            >
              시작하기
            </motion.button>
          )}

          {currentStep === 2 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleCheckpointConfirm}
              className="w-full h-14 rounded-2xl font-semibold text-base bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
            >
              계속하기
            </motion.button>
          )}

          {currentStep === 4 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleNegativeComplete}
              className="w-full h-14 rounded-2xl font-semibold text-base bg-rose-500 text-white hover:bg-rose-600 transition-all"
            >
              {negativeSelections.length > 0 ? `${negativeSelections.length}개 제외하고 다음` : '다음'}
            </motion.button>
          )}

          {currentStep === 5 && scoredProducts.length === 0 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleGetRecommendation}
              disabled={isCalculating}
              className="w-full h-14 rounded-2xl font-semibold text-base bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:bg-gray-300"
            >
              {isCalculating ? '분석 중...' : '추천받기'}
            </motion.button>
          )}
        </div>

        {/* Back Modal */}
        <AnimatePresence>
          {showBackModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowBackModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-0 flex items-center justify-center z-50 px-4"
              >
                <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-auto">
                  <p className="text-base text-gray-800 mb-6">카테고리 선택으로 돌아가시겠어요?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowBackModal(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 font-semibold rounded-xl"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => router.push('/categories-v2')}
                      className="flex-1 px-4 py-3 bg-blue-500 text-white font-semibold rounded-xl"
                    >
                      돌아가기
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
