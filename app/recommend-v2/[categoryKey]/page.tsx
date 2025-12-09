'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';

// Types
import type {
  ChatMessage,
  FlowStep,
  ComponentType,
  HardFilterConfig,
  HardFilterQuestion,
  BalanceQuestion,
  NegativeFilterOption,
  RuleDefinition,
  ProductItem,
  ScoredProduct,
  CheckpointData,
  NegativeFilterData,
} from '@/types/recommend-v2';
import { STEP_LABELS, CATEGORY_BUDGET_RANGES } from '@/types/recommend-v2';

// Components
import {
  AssistantMessage,
  ScanAnimation,
  GuideCards,
  HardFilterQuestion as HardFilterQuestionComponent,
  CheckpointVisual,
  NaturalLanguageInput,
  BalanceGameCarousel,
  NegativeFilterList,
  BudgetSlider,
  ResultCards,
} from '@/components/recommend-v2';
import { SubCategorySelector } from '@/components/recommend-v2/SubCategorySelector';

// Utils
import {
  filterRelevantRuleKeys,
  generateDynamicBalanceQuestions,
  generateDynamicNegativeOptions,
  applyHardFilters,
  calculateBalanceScore,
  calculateNegativeScore,
  generateConditionSummary,
} from '@/lib/recommend-v2/dynamicQuestions';

// Data
import hardFiltersData from '@/data/rules/hard_filters.json';
import subCategoriesData from '@/data/rules/sub_categories.json';
import { requiresSubCategorySelection } from '@/lib/recommend-v2/danawaFilters';

// Sub-category types
interface SubCategory {
  code: string;
  name: string;
  description: string;
  icon: string;
}

interface SubCategoryConfig {
  category_name: string;
  require_sub_category: boolean;
  filter_by: 'category_code' | 'attribute';
  filter_key?: string;  // attribute 필터일 때 사용 (예: '타입')
  sub_categories: SubCategory[];
}

// =====================================================
// Helper Functions
// =====================================================

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =====================================================
// Main Component
// =====================================================

export default function RecommendV2Page() {
  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const budgetSliderRef = useRef<HTMLDivElement>(null);

  // ===================================================
  // State
  // ===================================================

  // Flow state
  const [currentStep, setCurrentStep] = useState<FlowStep>(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Data
  const [categoryName, setCategoryName] = useState('');
  const [hardFilterConfig, setHardFilterConfig] = useState<HardFilterConfig | null>(null);
  const [logicMap, setLogicMap] = useState<Record<string, RuleDefinition>>({});
  const [balanceQuestions, setBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [negativeOptions, setNegativeOptions] = useState<NegativeFilterOption[]>([]);

  // Products
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductItem[]>([]);

  // Dynamic questions
  const [dynamicBalanceQuestions, setDynamicBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [dynamicNegativeOptions, setDynamicNegativeOptions] = useState<NegativeFilterOption[]>([]);

  // User selections (다중 선택 지원)
  const [hardFilterAnswers, setHardFilterAnswers] = useState<Record<string, string[]>>({});
  const [currentHardFilterIndex, setCurrentHardFilterIndex] = useState(0);
  const [balanceSelections, setBalanceSelections] = useState<Set<string>>(new Set());
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0);
  const [negativeSelections, setNegativeSelections] = useState<string[]>([]);
  const [budget, setBudget] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  // Condition summary (for result page)
  const [conditionSummary, setConditionSummary] = useState<Array<{ label: string; value: string }>>([]);

  // Results
  const [scoredProducts, setScoredProducts] = useState<ScoredProduct[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectionReason, setSelectionReason] = useState<string>('');
  const [generatedBy, setGeneratedBy] = useState<'llm' | 'fallback'>('fallback');

  // UI
  const [showBackModal, setShowBackModal] = useState(false);
  const [showScanAnimation, setShowScanAnimation] = useState(true);

  // Sub-category state (for stroller, car_seat, diaper)
  const [requiresSubCategory, setRequiresSubCategory] = useState(false);
  const [subCategoryConfig, setSubCategoryConfig] = useState<SubCategoryConfig | null>(null);
  const [selectedSubCategoryCode, setSelectedSubCategoryCode] = useState<string | null>(null);
  const [showSubCategorySelector, setShowSubCategorySelector] = useState(false);

  // ===================================================
  // Scroll to bottom
  // ===================================================

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // ===================================================
  // Add message helper
  // ===================================================

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  // ===================================================
  // Data Loading
  // ===================================================

  useEffect(() => {
    if (!categoryKey) return;

    const loadData = async () => {
      setIsLoading(true);

      try {
        // Check if sub-category selection is required
        const needsSubCategory = requiresSubCategorySelection(categoryKey);
        setRequiresSubCategory(needsSubCategory);

        if (needsSubCategory) {
          const subConfig = (subCategoriesData as Record<string, SubCategoryConfig>)[categoryKey];
          setSubCategoryConfig(subConfig || null);
        }

        // Load rules from API
        const rulesRes = await fetch(`/api/v2/rules/${categoryKey}`);
        const rulesJson = await rulesRes.json();

        if (!rulesJson.success) {
          router.push('/categories-v2');
          return;
        }

        const { category_name, logic_map, balance_game, negative_filter, hard_filters } = rulesJson.data;
        setCategoryName(category_name);
        setLogicMap(logic_map);
        setBalanceQuestions(balance_game);
        setNegativeOptions(negative_filter);

        // DEBUG: Log loaded data
        console.log('🚀 DEBUG Data Loaded:');
        console.log('  - category_name:', category_name);
        console.log('  - logic_map keys:', Object.keys(logic_map));
        console.log('  - balance_game:', balance_game?.length, balance_game?.map((q: BalanceQuestion) => q.id));
        console.log('  - negative_filter:', negative_filter?.length);
        console.log('  - hard_filters:', hard_filters?.questions?.length, 'questions');

        // API에서 받은 하드필터 설정 사용 (다나와 필터 기반 동적 생성)
        if (hard_filters) {
          setHardFilterConfig({
            category_name: category_name,
            guide: hard_filters.guide,
            questions: hard_filters.questions,
          });
        } else {
          // fallback: 기존 JSON에서 로드
          const config = (hardFiltersData as Record<string, HardFilterConfig>)[categoryKey];
          setHardFilterConfig(config || null);
        }

        // Load products (limit 제거 - 실제 전체 개수 로드)
        // sub-category가 필요한 카테고리는 나중에 다시 로드하므로 여기서는 스킵
        if (!needsSubCategory) {
          const productsRes = await fetch('/api/v2/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryKey, limit: 500 }),
          });
          const productsJson = await productsRes.json();

          if (productsJson.success) {
            setProducts(productsJson.data.products);
            setFilteredProducts(productsJson.data.products);
          }
        }

        // Set default budget range
        const budgetRange = CATEGORY_BUDGET_RANGES[categoryKey] || { min: 10000, max: 500000 };
        setBudget({ min: budgetRange.min, max: budgetRange.max });

      } catch (error) {
        console.error('Data load error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [categoryKey, router]);

  // DEBUG: Track state changes
  useEffect(() => {
    console.log('📊 DEBUG State Changed:');
    console.log('  - isLoading:', isLoading);
    console.log('  - hardFilterConfig:', !!hardFilterConfig);
    console.log('  - balanceQuestions:', balanceQuestions.length);
    console.log('  - products:', products.length);
  }, [isLoading, hardFilterConfig, balanceQuestions, products]);

  // ===================================================
  // Step 0: Scan Animation Complete
  // ===================================================

  const handleScanComplete = useCallback(() => {
    console.log('✨ DEBUG handleScanComplete called');
    console.log('  - hardFilterConfig:', !!hardFilterConfig);
    console.log('  - categoryName:', categoryName);
    console.log('  - requiresSubCategory:', requiresSubCategory);
    console.log('  - subCategoryConfig:', !!subCategoryConfig);

    setShowScanAnimation(false);

    // Add guide cards message with intro message (Step 0: 가이드 카드만 표시)
    if (hardFilterConfig) {
      addMessage({
        role: 'system',
        content: '',
        componentType: 'guide-cards',
        componentData: {
          ...hardFilterConfig.guide,
          introMessage: '복잡한 용어, 스펙 비교는 제가 이미 끝냈어요.\n고객님의 상황만 편하게 알려주세요. 딱 맞는 제품을 찾아드릴게요.',
        },
        stepTag: '0/5',
      });
      // 가이드 카드의 "시작하기" 버튼 클릭 시 다음 단계로 진행 (onNext 콜백에서 처리)
      setTimeout(() => scrollToBottom(), 300);
    }
  }, [hardFilterConfig, categoryName, requiresSubCategory, subCategoryConfig, selectedSubCategoryCode, addMessage, scrollToBottom]);

  // ===================================================
  // Sub-Category Selection Handler
  // ===================================================

  const handleSubCategorySelect = useCallback(async (code: string) => {
    setSelectedSubCategoryCode(code);
    setShowSubCategorySelector(false);

    // Find the selected sub-category name
    const selectedSub = subCategoryConfig?.sub_categories.find(s => s.code === code);
    const filterBy = subCategoryConfig?.filter_by || 'category_code';
    const filterKey = subCategoryConfig?.filter_key;

    // Store the loaded config for auto-proceed
    let loadedHardFilterConfig: HardFilterConfig | null = null;

    // Reload hard filters for this specific sub-category
    try {
      // category_code 필터일 때만 subCategoryCode 전달
      const rulesUrl = filterBy === 'category_code'
        ? `/api/v2/rules/${categoryKey}?subCategoryCode=${code}`
        : `/api/v2/rules/${categoryKey}`;
      const rulesRes = await fetch(rulesUrl);
      const rulesJson = await rulesRes.json();

      if (rulesJson.success && rulesJson.data.hard_filters) {
        loadedHardFilterConfig = {
          category_name: rulesJson.data.category_name,
          guide: rulesJson.data.hard_filters.guide,
          questions: rulesJson.data.hard_filters.questions,
        };
        setHardFilterConfig(loadedHardFilterConfig);
      }

      // Reload products for this sub-category
      // filter_by에 따라 다른 필터링 방식 사용
      const productsBody = filterBy === 'category_code'
        ? {
            categoryKey,
            limit: 500,  // 충분히 큰 값으로 실제 개수 로드
            targetCategoryCodes: [code],
          }
        : {
            categoryKey,
            limit: 500,
            filterAttribute: {
              key: filterKey,
              value: code,
            },
          };

      const productsRes = await fetch('/api/v2/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productsBody),
      });
      const productsJson = await productsRes.json();

      if (productsJson.success) {
        setProducts(productsJson.data.products);
        setFilteredProducts(productsJson.data.products);
        console.log('📦 Products loaded for sub-category:', productsJson.data.products.length);
      }
    } catch (error) {
      console.error('Sub-category load error:', error);
    }

    scrollToBottom();

    // Auto-proceed to hard filters after sub-category selection
    setTimeout(() => {
      setCurrentStep(1);

      addMessage({
        role: 'assistant',
        content: '간단한 질문 몇 가지만 할게요.',
        stepTag: '1/5',
      });

      // Add first hard filter question
      const questions = loadedHardFilterConfig?.questions || [];
      if (questions.length > 0) {
        setTimeout(() => {
          addMessage({
            role: 'system',
            content: '',
            componentType: 'hard-filter',
            componentData: {
              question: questions[0],
              currentIndex: 0,
              totalCount: questions.length,
              selectedValue: undefined,
            },
          });
          scrollToBottom();
        }, 300);
      }
    }, 500);
  }, [categoryKey, subCategoryConfig, addMessage, scrollToBottom]);

  // ===================================================
  // Step 0 → Step 1: Start Hard Filters
  // ===================================================

  const handleStartHardFilters = useCallback(() => {
    console.log('🎯 DEBUG handleStartHardFilters called');
    console.log('  - hardFilterConfig:', hardFilterConfig);
    console.log('  - questions:', hardFilterConfig?.questions?.length);

    setCurrentStep(1);

    addMessage({
      role: 'assistant',
      content: '간단한 질문 몇 가지만 할게요.',
      stepTag: '1/5',
    });

    // Add first hard filter question
    const questions = hardFilterConfig?.questions || [];
    if (questions.length > 0) {
      setTimeout(() => {
        addMessage({
          role: 'system',
          content: '',
          componentType: 'hard-filter',
          componentData: {
            question: questions[0],
            currentIndex: 0,
            totalCount: questions.length,
          },
        });
        scrollToBottom();
      }, 300);
    } else {
      // No hard filter questions, skip to step 2
      handleHardFiltersComplete({});
    }
  }, [hardFilterConfig, addMessage, scrollToBottom]);

  // ===================================================
  // Step 1: Hard Filter Selection (다중 선택 지원)
  // ===================================================

  // 선택만 업데이트 (자동 진행 없음)
  const handleHardFilterSelect = useCallback((questionId: string, values: string[]) => {
    const newAnswers = { ...hardFilterAnswers, [questionId]: values };
    setHardFilterAnswers(newAnswers);

    // Update current question's selected values in messages (for visual feedback)
    setMessages(prev => prev.map(msg => {
      if (msg.componentType === 'hard-filter') {
        const hfData = msg.componentData as { question: HardFilterQuestion; currentIndex: number; totalCount: number; selectedValues?: string[] };
        if (hfData.question.id === questionId) {
          return {
            ...msg,
            componentData: {
              ...hfData,
              selectedValues: values,
            },
          };
        }
      }
      return msg;
    }));
  }, [hardFilterAnswers]);

  // ===================================================
  // Step 1 Complete → Step 2
  // ===================================================

  const handleHardFiltersComplete = useCallback(async (answers: Record<string, string[]>) => {
    setCurrentStep(2);

    // Apply filters to products
    const questions = hardFilterConfig?.questions || [];
    const filtered = applyHardFilters(products, answers, questions);
    setFilteredProducts(filtered);

    // Generate condition summary
    const conditions = generateConditionSummary(answers, questions);
    setConditionSummary(conditions);

    // Calculate relevant rule keys for dynamic questions
    const relevantKeys = filterRelevantRuleKeys(filtered, logicMap);

    // DEBUG: Log for troubleshooting
    console.log('🔍 DEBUG handleHardFiltersComplete:');
    console.log('  - products:', products.length);
    console.log('  - filtered:', filtered.length);
    console.log('  - logicMap keys:', Object.keys(logicMap));
    console.log('  - relevantKeys:', relevantKeys);
    console.log('  - balanceQuestions:', balanceQuestions.length);

    // Generate dynamic balance questions
    const dynamicBalance = generateDynamicBalanceQuestions(
      relevantKeys,
      balanceQuestions,
      categoryKey
    );
    console.log('  - dynamicBalance:', dynamicBalance.length, dynamicBalance.map(q => q.id));
    setDynamicBalanceQuestions(dynamicBalance);

    // Generate dynamic negative options
    const dynamicNegative = generateDynamicNegativeOptions(
      relevantKeys,
      negativeOptions
    );
    setDynamicNegativeOptions(dynamicNegative);

    // Generate AI summary message based on hard filter selections
    let aiSummary = '';
    if (Object.keys(answers).length > 0) {
      try {
        const summaryResponse = await fetch('/api/v2/generate-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            categoryName,
            conditions,
            productCount: products.length,
            filteredCount: filtered.length,
          }),
        });
        const summaryJson = await summaryResponse.json();
        if (summaryJson.success && summaryJson.data?.summary) {
          aiSummary = summaryJson.data.summary;
        }
      } catch (error) {
        console.error('AI summary generation error:', error);
      }
    }

    // Add checkpoint message with actual product count
    const summaryMessage = aiSummary || `전체 **${products.length}개** 제품 중 **${filtered.length}개**가 조건에 맞아요.`;
    addMessage({
      role: 'assistant',
      content: summaryMessage,
      stepTag: '2/5',
    });

    setTimeout(() => {
      addMessage({
        role: 'system',
        content: '',
        componentType: 'checkpoint',
        componentData: {
          totalProducts: products.length,
          filteredCount: filtered.length,
          conditions,
        } as CheckpointData,
      });

      // Add natural language input option
      setTimeout(() => {
        addMessage({
          role: 'system',
          content: '',
          componentType: 'natural-input',
        });
        scrollToBottom();
      }, 300);
    }, 500);
  }, [products, hardFilterConfig, logicMap, balanceQuestions, negativeOptions, categoryKey, categoryName, addMessage, scrollToBottom]);

  // "다음" 버튼 클릭 시 다음 질문으로 이동
  const handleHardFilterNext = useCallback(() => {
    const questions = hardFilterConfig?.questions || [];
    const nextIndex = currentHardFilterIndex + 1;

    if (nextIndex < questions.length) {
      // Show next question
      setCurrentHardFilterIndex(nextIndex);

      setTimeout(() => {
        addMessage({
          role: 'system',
          content: '',
          componentType: 'hard-filter',
          componentData: {
            question: questions[nextIndex],
            currentIndex: nextIndex,
            totalCount: questions.length,
            selectedValues: hardFilterAnswers[questions[nextIndex].id] || [],
          },
        });
        scrollToBottom();
      }, 300);
    } else {
      // 마지막 질문 완료 - Step 2로 이동
      handleHardFiltersComplete(hardFilterAnswers);
    }
  }, [hardFilterConfig, currentHardFilterIndex, hardFilterAnswers, addMessage, scrollToBottom, handleHardFiltersComplete]);

  // ===================================================
  // Step 2: Natural Language Input
  // ===================================================

  const handleNaturalLanguageSubmit = useCallback(async (text: string) => {
    try {
      // Call parse API
      const response = await fetch('/api/v2/parse-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          categoryKey,
          currentAnswers: hardFilterAnswers,
        }),
      });

      const result = await response.json();

      if (result.success && result.data.parsedConditions) {
        // Update answers and re-filter
        const newAnswers = { ...hardFilterAnswers, ...result.data.parsedConditions };
        setHardFilterAnswers(newAnswers);

        addMessage({
          role: 'assistant',
          content: result.data.message || '조건을 업데이트했어요.',
        });

        // Re-apply filters
        handleHardFiltersComplete(newAnswers);
      } else {
        addMessage({
          role: 'assistant',
          content: '죄송해요, 조건을 이해하지 못했어요. 다시 말씀해주시겠어요?',
        });
      }
    } catch {
      addMessage({
        role: 'assistant',
        content: '오류가 발생했어요. 다시 시도해주세요.',
      });
    }
    scrollToBottom();
  }, [categoryKey, hardFilterAnswers, addMessage, scrollToBottom, handleHardFiltersComplete]);

  // ===================================================
  // Step 2 → Step 3: Start Balance Game
  // ===================================================

  const handleStartBalanceGame = useCallback(() => {
    setCurrentStep(3);
    setCurrentBalanceIndex(0);

    addMessage({
      role: 'assistant',
      content: '이제 남은 후보들 중에서 최적의 제품을 골라볼게요.\n**어떤 게 더 끌리세요?**',
      stepTag: '3/5',
    });

    if (dynamicBalanceQuestions.length > 0) {
      setTimeout(() => {
        addMessage({
          role: 'system',
          content: '',
          componentType: 'balance-carousel',
          componentData: {
            questions: dynamicBalanceQuestions,
          },
        });
        scrollToBottom();
      }, 300);
    } else {
      // No balance questions, skip to step 4
      handleBalanceGameComplete(new Set());
    }
  }, [dynamicBalanceQuestions, addMessage, scrollToBottom]);

  // ===================================================
  // Step 3: Balance Game Complete (캐러셀에서 호출됨)
  // ===================================================

  const handleBalanceGameComplete = useCallback((selections: Set<string>) => {
    // 선택된 rule keys 저장
    setBalanceSelections(selections);
    setCurrentStep(4);

    if (selections.size > 0) {
      addMessage({
        role: 'assistant',
        content: `**${selections.size}개** 선호 항목을 반영할게요!`,
      });
    }

    addMessage({
      role: 'assistant',
      content: '후보들의 실제 리뷰에서 단점을 분석했어요.',
      stepTag: '4/5',
    });

    if (dynamicNegativeOptions.length > 0) {
      setTimeout(() => {
        addMessage({
          role: 'system',
          content: '',
          componentType: 'negative-filter',
          componentData: {
            options: dynamicNegativeOptions,
            selectedKeys: negativeSelections,
          } as NegativeFilterData,
        });
        scrollToBottom();
      }, 300);
    } else {
      // No negative options, skip to step 5
      handleNegativeComplete();
    }
  }, [dynamicNegativeOptions, negativeSelections, addMessage, scrollToBottom]);

  // ===================================================
  // Step 4: Negative Filter
  // ===================================================

  const handleNegativeToggle = useCallback((ruleKey: string) => {
    setNegativeSelections(prev =>
      prev.includes(ruleKey)
        ? prev.filter(k => k !== ruleKey)
        : [...prev, ruleKey]
    );

    // Update the component data
    setMessages(prev => prev.map(msg => {
      if (msg.componentType === 'negative-filter') {
        return {
          ...msg,
          componentData: {
            ...msg.componentData as NegativeFilterData,
            selectedKeys: negativeSelections.includes(ruleKey)
              ? negativeSelections.filter(k => k !== ruleKey)
              : [...negativeSelections, ruleKey],
          },
        };
      }
      return msg;
    }));
  }, [negativeSelections]);

  const handleNegativeComplete = useCallback(() => {
    setCurrentStep(5);

    if (negativeSelections.length > 0) {
      addMessage({
        role: 'assistant',
        content: `알겠어요, **${negativeSelections.length}개** 단점을 피해서 찾아볼게요.`,
      });
    }

    addMessage({
      role: 'assistant',
      content: '마지막이에요!',
      stepTag: '5/5',
    });

    setTimeout(() => {
      addMessage({
        role: 'system',
        content: '',
        componentType: 'budget-slider',
      });
      scrollToBottom();
    }, 300);
  }, [negativeSelections, addMessage, scrollToBottom]);

  // ===================================================
  // Step 5: Budget & Results
  // ===================================================

  const handleBudgetChange = useCallback((values: { min: number; max: number }) => {
    setBudget(values);
  }, []);

  const handleGetRecommendation = useCallback(async () => {
    setIsCalculating(true);

    try {
      // 1단계: 기존 점수 계산 (후보 선정용)
      const scored: ScoredProduct[] = filteredProducts.map(product => {
        const { score: baseScore, matchedRules } = calculateBalanceScore(
          product,
          balanceSelections,
          logicMap
        );

        const negativeScore = calculateNegativeScore(
          product,
          negativeSelections,
          dynamicNegativeOptions,
          logicMap
        );

        return {
          ...product,
          baseScore,
          negativeScore,
          totalScore: baseScore + negativeScore,
          matchedRules,
        };
      });

      // 예산 필터링
      const budgetFiltered = scored.filter(p => {
        if (!p.price) return true;
        return p.price >= budget.min && p.price <= budget.max;
      });

      // 점수 기준 정렬
      const sorted = budgetFiltered.sort((a, b) => b.totalScore - a.totalScore);

      // 2단계: LLM 기반 최종 추천 API 호출 (상위 15개 후보로)
      const candidateProducts = sorted.slice(0, 15);

      let top3 = candidateProducts.slice(0, 3);
      let finalSelectionReason = '';
      let finalGeneratedBy: 'llm' | 'fallback' = 'fallback';

      try {
        const recommendResponse = await fetch('/api/v2/recommend-final', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            candidateProducts,
            userContext: {
              hardFilterAnswers,
              balanceSelections: Array.from(balanceSelections),
              negativeSelections,
            },
            budget,
          }),
        });

        const recommendResult = await recommendResponse.json();

        if (recommendResult.success && recommendResult.data) {
          top3 = recommendResult.data.top3Products;
          finalSelectionReason = recommendResult.data.selectionReason || '';
          finalGeneratedBy = recommendResult.data.generated_by || 'fallback';
          console.log(`✅ LLM recommendation: ${finalGeneratedBy}`, top3.map((p: ScoredProduct) => p.title));
        }
      } catch (llmError) {
        console.warn('LLM recommendation failed, using score-based fallback:', llmError);
      }

      setScoredProducts(top3);
      setSelectionReason(finalSelectionReason);
      setGeneratedBy(finalGeneratedBy);

      // 결과 메시지 추가
      addMessage({
        role: 'system',
        content: '',
        componentType: 'result-cards',
        componentData: {
          products: top3,
          categoryName,
          conditions: conditionSummary,
          categoryKey,
          selectionReason: finalSelectionReason,
          generatedBy: finalGeneratedBy,
        },
      });

      // 예산 컴포넌트 바로 아래로 스크롤
      setTimeout(() => {
        budgetSliderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error) {
      console.error('Score calculation error:', error);
      addMessage({
        role: 'assistant',
        content: '추천 계산 중 오류가 발생했어요. 다시 시도해주세요.',
      });
    } finally {
      setIsCalculating(false);
    }
  }, [filteredProducts, balanceSelections, negativeSelections, dynamicNegativeOptions, logicMap, budget, categoryName, conditionSummary, categoryKey, hardFilterAnswers, addMessage]);

  // ===================================================
  // Render Message
  // ===================================================

  const renderMessage = (message: ChatMessage) => {
    if (message.role === 'assistant') {
      return (
        <AssistantMessage
          key={message.id}
          content={message.content}
          stepTag={message.stepTag}
        />
      );
    }

    // System messages with components
    if (message.componentType) {
      switch (message.componentType) {
        case 'guide-cards':
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <GuideCards
                data={message.componentData as { title: string; summary?: string; points: string[]; trend: string }}
                introMessage={(message.componentData as { introMessage?: string })?.introMessage}
                onNext={() => {
                  // 가이드 카드 완료 후 다음 단계로 진행 (스크롤 + 다음 스텝 표시)
                  if (requiresSubCategory && subCategoryConfig && !selectedSubCategoryCode) {
                    // 세부 카테고리 선택이 필요한 경우
                    setShowSubCategorySelector(true);
                    addMessage({
                      role: 'system',
                      content: '',
                      componentType: 'sub-category' as ComponentType,
                      componentData: {
                        categoryName: subCategoryConfig.category_name,
                        subCategories: subCategoryConfig.sub_categories,
                        selectedCode: selectedSubCategoryCode,
                      },
                    });
                    setTimeout(() => scrollToBottom(), 100);
                  } else if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
                    // 하드 필터 질문 시작
                    setCurrentStep(1);
                    addMessage({
                      role: 'system',
                      content: '',
                      componentType: 'hard-filter',
                      componentData: {
                        question: hardFilterConfig.questions[0],
                        currentIndex: 0,
                        totalCount: hardFilterConfig.questions.length,
                      },
                      stepTag: '1/5',
                    });
                    setTimeout(() => scrollToBottom(), 100);
                  }
                }}
              />
            </div>
          );

        case 'sub-category':
          const subCatData = message.componentData as {
            categoryName: string;
            subCategories: SubCategory[];
            selectedCode: string | null;
          };
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <SubCategorySelector
                categoryName={subCatData.categoryName}
                subCategories={subCatData.subCategories}
                selectedCode={selectedSubCategoryCode}
                onSelect={handleSubCategorySelect}
                products={products}
                showProductCounts={true}
                filterBy={subCategoryConfig?.filter_by || 'category_code'}
                filterKey={subCategoryConfig?.filter_key}
              />
            </div>
          );

        case 'hard-filter':
          const hfData = message.componentData as { question: HardFilterQuestion; currentIndex: number; totalCount: number; selectedValues?: string[] };
          const isPastQuestion = hfData.currentIndex < currentHardFilterIndex;
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                isPastQuestion ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <HardFilterQuestionComponent
                data={hfData}
                onSelect={handleHardFilterSelect}
                products={products}
                showProductCounts={true}
              />
            </div>
          );

        case 'checkpoint':
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 2 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <CheckpointVisual
                data={message.componentData as CheckpointData}
              />
            </div>
          );

        case 'natural-input':
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 2 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <NaturalLanguageInput
                onSubmit={handleNaturalLanguageSubmit}
                disabled={currentStep > 2}
              />
            </div>
          );

        case 'balance-carousel':
          const carouselData = message.componentData as { questions: BalanceQuestion[] };
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 3 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <BalanceGameCarousel
                questions={carouselData.questions}
                onComplete={handleBalanceGameComplete}
              />
            </div>
          );

        case 'negative-filter':
          return (
            <div
              key={message.id}
              className={`transition-all duration-300 ${
                currentStep > 4 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <NegativeFilterList
                data={{
                  options: dynamicNegativeOptions,
                  selectedKeys: negativeSelections,
                }}
                onToggle={handleNegativeToggle}
              />
            </div>
          );

        case 'budget-slider':
          const budgetRange = CATEGORY_BUDGET_RANGES[categoryKey] || { min: 10000, max: 500000, step: 10000 };
          return (
            <div
              key={message.id}
              ref={budgetSliderRef}
              className={`transition-all duration-300 ${
                scoredProducts.length > 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <BudgetSlider
                min={budgetRange.min}
                max={budgetRange.max}
                step={budgetRange.step}
                initialMin={budget.min}
                initialMax={budget.max}
                onChange={handleBudgetChange}
                products={filteredProducts}
              />
            </div>
          );

        case 'result-cards':
          const resultData = message.componentData as {
            products?: ScoredProduct[];
            categoryName?: string;
            conditions?: Array<{ label: string; value: string }>;
            categoryKey?: string;
            selectionReason?: string;
            generatedBy?: 'llm' | 'fallback';
          } | undefined;
          return (
            <ResultCards
              key={message.id}
              products={resultData?.products || scoredProducts}
              categoryName={resultData?.categoryName || categoryName}
              conditions={resultData?.conditions}
              categoryKey={resultData?.categoryKey || categoryKey}
              selectionReason={resultData?.selectionReason || selectionReason}
              generatedBy={resultData?.generatedBy || generatedBy}
              userContext={{
                hardFilterAnswers: hardFilterAnswers,
                balanceSelections: Array.from(balanceSelections),
                negativeSelections: negativeSelections,
              }}
            />
          );

        default:
          return null;
      }
    }

    return null;
  };

  // ===================================================
  // Navigation Handlers
  // ===================================================

  const handleGoToPreviousHardFilter = useCallback(() => {
    if (currentHardFilterIndex > 0) {
      const prevIndex = currentHardFilterIndex - 1;
      setCurrentHardFilterIndex(prevIndex);

      // Remove the current question message from messages
      setMessages(prev => {
        const filtered = prev.filter(msg => {
          if (msg.componentType === 'hard-filter') {
            const hfData = msg.componentData as { currentIndex: number };
            return hfData.currentIndex < currentHardFilterIndex;
          }
          return true;
        });
        return filtered;
      });
      scrollToBottom();
    } else {
      // Go back to step 0 (sub-category or guide)
      setCurrentStep(0);
      setCurrentHardFilterIndex(0);
      // Clear messages after guide/sub-category
      setMessages(prev => {
        // Keep only guide and sub-category related messages
        return prev.filter(msg =>
          msg.componentType === 'guide-cards' ||
          msg.componentType === 'sub-category' ||
          (msg.role === 'assistant' && !msg.stepTag)
        );
      });
      if (requiresSubCategory) {
        setShowSubCategorySelector(true);
      }
    }
  }, [currentHardFilterIndex, requiresSubCategory, scrollToBottom]);

  const handleGoToStep0 = useCallback(() => {
    setCurrentStep(0);
    setCurrentHardFilterIndex(0);
    setHardFilterAnswers({});
    // Clear messages after guide/sub-category
    setMessages(prev => {
      return prev.filter(msg =>
        msg.componentType === 'guide-cards' ||
        msg.componentType === 'sub-category' ||
        (msg.role === 'assistant' && !msg.stepTag)
      );
    });
    if (requiresSubCategory) {
      setShowSubCategorySelector(true);
    }
  }, [requiresSubCategory]);

  // ===================================================
  // Bottom Button
  // ===================================================

  const renderBottomButton = () => {
    const questions = hardFilterConfig?.questions || [];
    // 다중 선택: 모든 질문에 최소 1개 이상 답변했는지 확인
    const allQuestionsAnswered = questions.length > 0 &&
      questions.every(q => hardFilterAnswers[q.id]?.length > 0);

    // Step 0: 시작하기
    if (currentStep === 0 && !showScanAnimation) {
      // If sub-category required but not yet selected, don't show button
      if (requiresSubCategory && showSubCategorySelector && !selectedSubCategoryCode) {
        return null;
      }

      // If sub-category is selected or not required, show start button
      return (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleStartHardFilters}
          className="w-full h-14 rounded-2xl font-semibold text-base bg-blue-500 text-white hover:bg-blue-600 transition-all"
        >
          시작하기
        </motion.button>
      );
    }

    // Step 1: Hard Filter - prev/next navigation (질문별 진행)
    if (currentStep === 1) {
      const questions = hardFilterConfig?.questions || [];
      const currentQuestion = questions[currentHardFilterIndex];
      const currentQuestionAnswered = currentQuestion &&
        hardFilterAnswers[currentQuestion.id]?.length > 0;
      const isLastQuestion = currentHardFilterIndex >= questions.length - 1;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleGoToPreviousHardFilter}
            className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleHardFilterNext}
            disabled={!currentQuestionAnswered}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              currentQuestionAnswered
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLastQuestion ? '필터 완료' : '다음'}
          </motion.button>
        </div>
      );
    }

    // Step 2: 계속하기 with prev/next
    if (currentStep === 2) {
      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setCurrentStep(1);
              // Remove checkpoint related messages
              setMessages(prev => prev.filter(msg =>
                msg.componentType !== 'checkpoint' &&
                msg.componentType !== 'natural-input' &&
                !(msg.stepTag === '2/5')
              ));
            }}
            className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleStartBalanceGame}
            className="flex-[3] h-14 rounded-2xl font-semibold text-base bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
          >
            다음
          </motion.button>
        </div>
      );
    }

    // Step 4: 단점 필터 완료 with prev/next
    if (currentStep === 4) {
      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setCurrentStep(3);
              // Remove negative filter related messages
              setMessages(prev => prev.filter(msg =>
                msg.componentType !== 'negative-filter' &&
                !(msg.stepTag === '4/5')
              ));
            }}
            className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleNegativeComplete}
            className="flex-[3] h-14 rounded-2xl font-semibold text-base bg-rose-500 text-white hover:bg-rose-600 transition-all"
          >
            {negativeSelections.length > 0
              ? `${negativeSelections.length}개 제외하고 다음`
              : '다 괜찮아요'}
          </motion.button>
        </div>
      );
    }

    // Step 5: 추천받기 with prev/next
    if (currentStep === 5 && scoredProducts.length === 0) {
      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setCurrentStep(4);
              // Remove budget slider related messages
              setMessages(prev => prev.filter(msg =>
                msg.componentType !== 'budget-slider' &&
                !(msg.stepTag === '5/5')
              ));
            }}
            className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleGetRecommendation}
            disabled={isCalculating}
            className="flex-[3] h-14 rounded-2xl font-semibold text-base bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:bg-gray-300"
          >
            {isCalculating ? '분석 중...' : '추천받기'}
          </motion.button>
        </div>
      );
    }

    // Step 5: 결과 후 - 다시 추천받기 / 다른 카테고리
    if (currentStep === 5 && scoredProducts.length > 0) {
      return (
        <div className="flex flex-col gap-2">
          {/* 다시 추천받기 버튼 */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              // 상태 초기화
              setCurrentStep(0);
              setCurrentHardFilterIndex(0);
              setHardFilterAnswers({});
              setBalanceSelections(new Set());
              setNegativeSelections([]);
              setScoredProducts([]);
              setConditionSummary([]);

              // 메시지 초기화 (가이드 카드부터 다시 시작)
              setMessages([]);
              setShowScanAnimation(true);

              // 서브 카테고리 필요시 리셋
              if (requiresSubCategory) {
                setSelectedSubCategoryCode(null);
                setShowSubCategorySelector(false);
              }
            }}
            className="w-full h-14 rounded-2xl font-semibold text-base bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {categoryName} 다시 추천받기
          </motion.button>

          {/* 다른 카테고리 버튼 */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => router.push('/categories-v2')}
            className="w-full h-12 rounded-2xl font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            다른 카테고리 추천받기
          </motion.button>
        </div>
      );
    }

    return null;
  };

  // ===================================================
  // Loading State
  // ===================================================

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

  // ===================================================
  // Main Render
  // ===================================================

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] h-dvh overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3 flex items-center justify-between">
            <button
              onClick={() => setShowBackModal(true)}
              className="text-gray-600 hover:text-gray-900"
            >
              <CaretLeft size={24} weight="bold" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {categoryName} 추천
            </h1>
            {/* 처음부터 버튼 */}
            {currentStep > 0 && !showScanAnimation && (
              <button
                onClick={() => {
                  setCurrentStep(0);
                  setCurrentHardFilterIndex(0);
                  setHardFilterAnswers({});
                  setBalanceSelections(new Set());
                  setNegativeSelections([]);
                  setScoredProducts([]);
                  setConditionSummary([]);
                  setMessages([]);
                  setShowScanAnimation(true);
                  if (requiresSubCategory) {
                    setSelectedSubCategoryCode(null);
                    setShowSubCategorySelector(false);
                  }
                }}
                className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
              >
                처음부터
              </button>
            )}
            {(currentStep === 0 || showScanAnimation) && <div className="w-12" />}
          </div>

          {/* Progress Bar */}
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{currentStep}/5</span>
              <span>{STEP_LABELS[currentStep]}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / 5) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-6"
          style={{ paddingBottom: '120px' }}
        >
          <AnimatePresence mode="wait">
            {/* Step 0: Scan Animation */}
            {currentStep === 0 && showScanAnimation && (
              <ScanAnimation
                categoryName={categoryName}
                onComplete={handleScanComplete}
                duration={2000}
              />
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className="space-y-4">
            {messages.map(renderMessage)}
          </div>

          {/* Calculating indicator */}
          {isCalculating && (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Bottom Button */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40"
          style={{ maxWidth: '480px', margin: '0 auto' }}
        >
          {renderBottomButton()}
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
                  <p className="text-base text-gray-800 mb-6">
                    카테고리 선택으로 돌아가시겠어요?
                  </p>
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
