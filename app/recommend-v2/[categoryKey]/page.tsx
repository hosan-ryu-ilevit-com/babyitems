'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  GuideCardsData,
  TimelineStep,
  AnalysisTimeline,
  NaturalLanguageInput,
  UserSelections,
  DirectInputAnalysis,
} from '@/types/recommend-v2';
import { STEP_LABELS, CATEGORY_BUDGET_RANGES } from '@/types/recommend-v2';

// Components
import {
  AssistantMessage,
  ScanAnimation,
  GuideCards,
  HardFilterQuestion as HardFilterQuestionComponent,
  CheckpointVisual,
  BalanceGameCarousel,
  NegativeFilterList,
  BudgetSlider,
  ResultCards,
  LoadingAnimation,
} from '@/components/recommend-v2';
import ContextInput from '@/components/recommend-v2/ContextInput';
import type { BalanceGameCarouselRef } from '@/components/recommend-v2';
import { SubCategorySelector } from '@/components/recommend-v2/SubCategorySelector';

// Utils
import {
  filterRelevantRuleKeys,
  generateDynamicBalanceQuestions,
  generateDynamicNegativeOptions,
  applyHardFilters,
  calculateBalanceScore,
  calculateNegativeScore,
  calculateHardFilterScore,
  calculateBudgetScore,
  calculateDirectInputScore,
  generateConditionSummary,
} from '@/lib/recommend-v2/dynamicQuestions';

// Data
import hardFiltersData from '@/data/rules/hard_filters.json';
import subCategoriesData from '@/data/rules/sub_categories.json';
import { requiresSubCategorySelection } from '@/lib/recommend-v2/categoryUtils';

// Logging
import {
  logV2PageView,
  logV2SubCategorySelected,
  logV2HardFilterAnswer,
  logV2HardFilterCompleted,
  logV2CheckpointViewed,
  logV2BalanceSelection,
  logV2BalanceCompleted,
  logV2NegativeToggle,
  logV2NegativeCompleted,
  logV2BudgetChanged,
  logV2RecommendationRequested,
  logV2RecommendationReceived,
  logV2StepBack,
  logGuideCardTabSelection,
  logGuideCardToggle,
  logV2ReRecommendModalOpened,
  logV2ReRecommendSameCategory,
  logV2ReRecommendDifferentCategory,
  logButtonClick,
  logDirectInputRegister,
} from '@/lib/logging/clientLogger';

// Favorites - 나중에 사용할 수 있도록 임시 숨김
// import { FavoritesView } from '@/components/FavoritesView';

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
  filter_by: 'category_code' | 'attribute' | 'brand';
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
  // DEBUG: Version check - if you don't see this in console, clear browser cache (Ctrl+Shift+R)
  console.log('🏠 RecommendV2Page LOADED - v2.1 (dynamic questions debug)');

  const router = useRouter();
  const params = useParams();
  const categoryKey = params.categoryKey as string;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const budgetSliderRef = useRef<HTMLDivElement>(null);
  const balanceGameRef = useRef<BalanceGameCarouselRef>(null);
  const calculatingRef = useRef<HTMLDivElement>(null);

  // Ref to always hold the latest products (to avoid closure issues in callbacks)
  const productsRef = useRef<ProductItem[]>([]);

  // ===================================================
  // State
  // ===================================================

  // Flow state
  // 모든 카테고리에서 Step -1(컨텍스트 입력)부터 시작
  const [currentStep, setCurrentStep] = useState<FlowStep>(-1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Context input (Step -1)
  const [userContext, setUserContext] = useState<string | null>(null);
  // 체감속성 태그 미리 선택 (AI 파싱 결과)
  const [preselectedExperienceTags, setPreselectedExperienceTags] = useState<string[]>([]);
  const [preselectedExplanation, setPreselectedExplanation] = useState<string>('');
  const [isLoadingPreselection, setIsLoadingPreselection] = useState(false);

  // Data
  const [categoryName, setCategoryName] = useState('');
  const [hardFilterConfig, setHardFilterConfig] = useState<HardFilterConfig | null>(null);
  const [logicMap, setLogicMap] = useState<Record<string, RuleDefinition>>({});
  const [balanceQuestions, setBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [negativeOptions, setNegativeOptions] = useState<NegativeFilterOption[]>([]);

  // Products
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductItem[]>([]);
  // 서브카테고리 선택 후에도 개수 표시용으로 초기 전체 제품 유지
  const [allCategoryProducts, setAllCategoryProducts] = useState<ProductItem[]>([]);

  // Dynamic questions
  const [dynamicBalanceQuestions, setDynamicBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [dynamicNegativeOptions, setDynamicNegativeOptions] = useState<NegativeFilterOption[]>([]);

  // User selections (다중 선택 지원)
  const [hardFilterAnswers, setHardFilterAnswers] = useState<Record<string, string[]>>({});
  const [currentHardFilterIndex, setCurrentHardFilterIndex] = useState(0);
  // 인기 하드필터 옵션 (통계 기반)
  const [popularHardFilterOptions, setPopularHardFilterOptions] = useState<Array<{ questionId: string; value: string; label: string; percentage: number; isPopular: boolean }>>([]);
  // 동적 생성 팁 (LLM 기반)
  const [dynamicTips, setDynamicTips] = useState<Record<string, string>>({});
  // 하위 카테고리 선택용 동적 팁
  const [subCategoryTip, setSubCategoryTip] = useState<string>('');
  const [balanceSelections, setBalanceSelections] = useState<Set<string>>(new Set());
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0);
  const [negativeSelections, setNegativeSelections] = useState<string[]>([]);
  // 직접 입력 (자연어) - 하드필터는 질문별로 관리
  const [hardFilterDirectInputs, setHardFilterDirectInputs] = useState<Record<string, string>>({});
  const [negativeDirectInput, setNegativeDirectInput] = useState<string>('');
  // 직접 입력 등록 상태 - 하드필터는 질문별로 관리
  const [hardFilterDirectInputRegistered, setHardFilterDirectInputRegistered] = useState<Record<string, boolean>>({});
  const [isNegativeDirectInputRegistered, setIsNegativeDirectInputRegistered] = useState(false);
  // 직접 입력 분석 결과
  const [hardFilterAnalysis, setHardFilterAnalysis] = useState<DirectInputAnalysis | null>(null);
  const [negativeAnalysis, setNegativeAnalysis] = useState<DirectInputAnalysis | null>(null);
  const [naturalLanguageInputs, setNaturalLanguageInputs] = useState<NaturalLanguageInput[]>([]);
  const [budget, setBudget] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  // Condition summary (for result page)
  const [conditionSummary, setConditionSummary] = useState<Array<{ label: string; value: string }>>([]);

  // Results
  const [scoredProducts, setScoredProducts] = useState<ScoredProduct[]>([]); // Top 3 추천 제품
  const [allScoredProducts, setAllScoredProducts] = useState<ScoredProduct[]>([]); // 전체 점수 계산된 제품 목록 (예산 필터용)
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // 버튼 중복 클릭 방지
  const [progress, setProgress] = useState(0); // 0~100 프로그레스
  const progressRef = useRef(0); // 최신 progress 값 추적용
  const [selectionReason, setSelectionReason] = useState<string>('');
  const [analysisTimeline, setAnalysisTimeline] = useState<AnalysisTimeline | null>(null);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]); // 실시간 타임라인 스텝

  // Rule key / value → Korean label mappings (for display)
  const [balanceLabels, setBalanceLabels] = useState<Record<string, string>>({});
  const [negativeLabels, setNegativeLabels] = useState<Record<string, string>>({});
  const [hardFilterLabels, setHardFilterLabels] = useState<Record<string, string>>({});
  // Hard filter value → filter conditions mapping (for product-specific matching)
  const [hardFilterDefinitions, setHardFilterDefinitions] = useState<Record<string, Record<string, unknown>>>({});

  // Balance game state (for bottom button)
  const [balanceGameState, setBalanceGameState] = useState<{
    selectionsCount: number;
    allAnswered: boolean;
    currentSelections: Set<string>;
    currentIndex: number;
    canGoPrevious: boolean;
    canGoNext: boolean;
    totalQuestions: number;
    currentQuestionAnswered: boolean;
  }>({ selectionsCount: 0, allAnswered: false, currentSelections: new Set(), currentIndex: 0, canGoPrevious: false, canGoNext: false, totalQuestions: 0, currentQuestionAnswered: false });

  // UI
  const [showBackModal, setShowBackModal] = useState(false);
  const [showScanAnimation, setShowScanAnimation] = useState(false);
  const [showReRecommendModal, setShowReRecommendModal] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  // 찜하기 기능 - 나중에 사용할 수 있도록 임시 숨김
  // const [showFavoritesModal, setShowFavoritesModal] = useState(false);

  // Typing animation state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // Sub-category state (for stroller, car_seat, diaper) - 다중 선택 지원
  const [requiresSubCategory, setRequiresSubCategory] = useState(false);
  const [subCategoryConfig, setSubCategoryConfig] = useState<SubCategoryConfig | null>(null);
  const [selectedSubCategoryCodes, setSelectedSubCategoryCodes] = useState<string[]>([]);
  const [showSubCategorySelector, setShowSubCategorySelector] = useState(false);

  // Ref to hold handleHardFiltersComplete for circular dependency resolution
  const handleHardFiltersCompleteRef = useRef<(answers: Record<string, string[]>, productsOverride?: ProductItem[]) => Promise<void>>(undefined);

  // ===================================================
  // Scroll to bottom
  // ===================================================

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // 특정 메시지로 스크롤 (상단 정렬 - AI 채팅처럼 새 컴포넌트가 헤더 아래로)
  const scrollToMessage = useCallback((messageId: string) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${messageId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  // ===================================================
  // Typing animation completion
  // ===================================================

  useEffect(() => {
    if (typingMessageId) {
      const timer = setTimeout(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === typingMessageId ? { ...msg, typing: false } : msg
          )
        );
        setTypingMessageId(null);
      }, 1000); // 1초 후 타이핑 효과 종료

      return () => clearTimeout(timer);
    }
  }, [typingMessageId]);

  // "AI 추천 진행 중..." 표시 시 스크롤
  useEffect(() => {
    if (isCalculating && calculatingRef.current) {
      setTimeout(() => {
        calculatingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [isCalculating]);

  // 프로그레스는 항상 증가만 (뒤로 가지 않음)
  const setProgressSafe = useCallback((value: number) => {
    setProgress((prev: number) => Math.max(prev, value));
    progressRef.current = Math.max(progressRef.current, value);
  }, []);

  // 프로그레스 관리: Tick 기반 (0~99% 천천히)
  useEffect(() => {
    if (isCalculating) {
      setProgress(0);
      progressRef.current = 0;
      let tickCount = 0;

      const interval = setInterval(() => {
        tickCount++;

        setProgress((prev: number) => {
          // 99%까지 Tick으로 천천히 증가
          if (prev < 40) {
            // 0-40%: 100ms(10틱)마다 1% (총 4초)
            if (tickCount % 10 === 0) {
              const newVal = prev + 1;
              progressRef.current = newVal;
              return newVal;
            }
          } else if (prev < 90) {
            // 40-90%: 120ms(12틱)마다 1% (총 6초)
            if (tickCount % 12 === 0) {
              const newVal = prev + 1;
              progressRef.current = newVal;
              return newVal;
            }
          } else if (prev < 99) {
            // 90-99%: 300ms(30틱)마다 1% (총 2.7초)
            if (tickCount % 30 === 0) {
              const newVal = prev + 1;
              progressRef.current = newVal;
              return newVal;
            }
          }
          return prev;
        });
      }, 10);
      return () => clearInterval(interval);
    }
  }, [isCalculating]);

  // ===================================================
  // Add message helper
  // ===================================================

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>, withTyping = false) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
      typing: withTyping,
    };
    setMessages(prev => [...prev, newMessage]);
    if (withTyping) {
      setTypingMessageId(newMessage.id);
    }
    return newMessage.id;
  }, []);

  // ===================================================
  // Session Storage Restoration (페이지 복귀 시 결과 복원)
  // ===================================================

  const [isRestoredFromStorage, setIsRestoredFromStorage] = useState(false);

  useEffect(() => {
    if (!categoryKey) return;

    try {
      const savedStateStr = sessionStorage.getItem(`v2_result_${categoryKey}`);
      if (savedStateStr) {
        const savedState = JSON.parse(savedStateStr);
        // 1시간(3600000ms) 이내의 결과만 복원
        const isRecent = Date.now() - savedState.timestamp < 3600000;

        if (isRecent && savedState.scoredProducts?.length > 0) {
          console.log('🔄 [sessionStorage] Restoring result for', categoryKey);

          // 상태 복원
          setScoredProducts(savedState.scoredProducts);
          setSelectionReason(savedState.selectionReason || '');
          setCategoryName(savedState.categoryName || '');
          setCurrentStep(5);
          setBudget(savedState.budget || { min: 0, max: 0 });
          setHardFilterAnswers(savedState.hardFilterAnswers || {});
          setBalanceSelections(new Set(savedState.balanceSelections || []));
          setNegativeSelections(savedState.negativeSelections || []);
          setConditionSummary(savedState.conditionSummary || []);
          setBalanceLabels(savedState.balanceLabels || {});
          setNegativeLabels(savedState.negativeLabels || {});
          setHardFilterLabels(savedState.hardFilterLabels || {});
          setHardFilterDefinitions(savedState.hardFilterDefinitions || {});

          // 결과 메시지 추가
          setMessages([{
            id: generateId(),
            role: 'system',
            content: '',
            componentType: 'result-cards',
            componentData: {
              products: savedState.scoredProducts,
              categoryName: savedState.categoryName,
              categoryKey: savedState.categoryKey,
              selectionReason: savedState.selectionReason,
            },
            timestamp: Date.now(),
          }]);

          setIsLoading(false);
          setShowScanAnimation(false);
          setIsRestoredFromStorage(true);

          console.log('✅ [sessionStorage] Result restored successfully');
          return;
        }
      }
    } catch (e) {
      console.warn('[sessionStorage] Failed to restore result:', e);
    }
  }, [categoryKey]);

  // ===================================================
  // Data Loading
  // ===================================================

  useEffect(() => {
    if (!categoryKey || isRestoredFromStorage) return;

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

        // 🚀 병렬 로드: rules API + products API 동시 호출
        console.log('📦 [Parallel Load] Starting for:', categoryKey);
        const loadStartTime = performance.now();

        const [rulesRes, productsRes] = await Promise.all([
          fetch(`/api/v2/rules/${categoryKey}`),
          fetch('/api/v2/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryKey, limit: 500 }),
          }),
        ]);

        const [rulesJson, productsJson] = await Promise.all([
          rulesRes.json(),
          productsRes.json(),
        ]);

        const loadEndTime = performance.now();
        console.log(`📦 [Parallel Load] Completed in ${(loadEndTime - loadStartTime).toFixed(0)}ms`);

        // Rules 처리
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

          // Generate value → label mapping and filter definitions for hard filters
          const hfLabelMap: Record<string, string> = {};
          const hfDefinitions: Record<string, Record<string, unknown>> = {};
          (hard_filters.questions || []).forEach((q: HardFilterQuestion) => {
            q.options?.forEach((opt) => {
              if (opt.value) {
                if (opt.displayLabel || opt.label) {
                  hfLabelMap[opt.value] = opt.displayLabel || opt.label;
                }
                // Store filter conditions for product matching
                if (opt.filter) {
                  hfDefinitions[opt.value] = opt.filter as Record<string, unknown>;
                }
              }
            });
          });
          setHardFilterLabels(hfLabelMap);
          setHardFilterDefinitions(hfDefinitions);
        } else {
          // fallback: 기존 JSON에서 로드
          const config = (hardFiltersData as Record<string, HardFilterConfig>)[categoryKey];
          setHardFilterConfig(config || null);

          // Generate label mapping and filter definitions from fallback config
          if (config?.questions) {
            const hfLabelMap: Record<string, string> = {};
            const hfDefinitions: Record<string, Record<string, unknown>> = {};
            config.questions.forEach((q) => {
              q.options?.forEach((opt) => {
                if (opt.value) {
                  if (opt.displayLabel || opt.label) {
                    hfLabelMap[opt.value] = opt.displayLabel || opt.label;
                  }
                  if (opt.filter) {
                    hfDefinitions[opt.value] = opt.filter as Record<string, unknown>;
                  }
                }
              });
            });
            setHardFilterLabels(hfLabelMap);
            setHardFilterDefinitions(hfDefinitions);
          }
        }

        // Products 처리
        if (productsJson.success && productsJson.data?.products) {
          setProducts(productsJson.data.products);
          setFilteredProducts(productsJson.data.products);
          setAllCategoryProducts(productsJson.data.products); // 서브카테고리 개수 표시용
          console.log('📦 [Products] Loaded:', productsJson.data.products.length);
        } else {
          console.error('📦 [Products] Failed:', productsJson.error);
        }

        // Set default budget range to '전체' (full range)
        const budgetRange = CATEGORY_BUDGET_RANGES[categoryKey] || { min: 10000, max: 500000 };
        setBudget({ min: budgetRange.min, max: budgetRange.max });

        // Log page view
        logV2PageView(categoryKey, category_name);

      } catch (error) {
        console.error('Data load error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [categoryKey, router, isRestoredFromStorage]);

  // 채널톡 스크립트 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as Window & { ChannelIO?: unknown }).ChannelIO) {
      const w = window as Window & { ChannelIO?: ((...args: unknown[]) => void) & { c?: (args: unknown[]) => void; q?: unknown[] }; ChannelIOInitialized?: boolean };
      const ch = function(...args: unknown[]) {
        ch.c?.(args);
      };
      ch.q = [] as unknown[];
      ch.c = function(args: unknown[]) {
        ch.q?.push(args);
      };
      w.ChannelIO = ch;

      const loadChannelIO = () => {
        if (w.ChannelIOInitialized) return;
        w.ChannelIOInitialized = true;
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
        const x = document.getElementsByTagName('script')[0];
        if (x.parentNode) {
          x.parentNode.insertBefore(s, x);
        }
      };

      if (document.readyState === 'complete') {
        loadChannelIO();
      } else {
        window.addEventListener('DOMContentLoaded', loadChannelIO);
        window.addEventListener('load', loadChannelIO);
      }

      // 채널톡 부트
      setTimeout(() => {
        if (w.ChannelIO) {
          w.ChannelIO('boot', {
            pluginKey: '81ef1201-79c7-4b62-b021-c571fe06f935',
            hideChannelButtonOnBoot: true,
          });
        }
      }, 100);
    }
  }, []);

  // 피드백 버튼 클릭 핸들러
  const handleFeedbackClick = useCallback(() => {
    const w = window as Window & { ChannelIO?: (...args: unknown[]) => void };
    if (w.ChannelIO) {
      w.ChannelIO('openChat');
    }
    logButtonClick('피드백 보내기', `recommend-v2-${categoryKey}`);
  }, [categoryKey]);

  // 초기 자연어 입력 컨텍스트 로딩 (categories-v2에서 저장된 것)
  useEffect(() => {
    if (!categoryKey || isRestoredFromStorage) return;

    try {
      const savedContextStr = sessionStorage.getItem(`v2_initial_context_${categoryKey}`);
      if (savedContextStr) {
        const savedContext = JSON.parse(savedContextStr);
        // 초기 컨텍스트를 naturalLanguageInputs에 추가
        setNaturalLanguageInputs([savedContext]);
        console.log('✅ [recommend-v2] Initial context loaded:', savedContext);

        // 사용 후 삭제 (한 번만 사용)
        sessionStorage.removeItem(`v2_initial_context_${categoryKey}`);
      }
    } catch (e) {
      console.warn('[recommend-v2] Failed to load initial context:', e);
    }
  }, [categoryKey, isRestoredFromStorage]);

  // 인기 하드필터 옵션 로딩 (통계 기반)
  useEffect(() => {
    if (!categoryKey) return;

    const loadPopularOptions = async () => {
      try {
        const res = await fetch(`/api/v2/hard-filter-stats?category=${categoryKey}`);
        if (res.ok) {
          const data = await res.json();
          setPopularHardFilterOptions(data.options || []);
        }
      } catch (error) {
        console.warn('Failed to load popular hard filter options:', error);
      }
    };

    loadPopularOptions();
  }, [categoryKey]);

  // 동적 팁 로딩 (LLM 기반) - 질문이 로드된 후 한 번만 실행
  useEffect(() => {
    if (!categoryKey || !hardFilterConfig?.questions?.length) return;
    // 이미 해당 카테고리의 팁을 로딩 중이거나 완료된 경우 스킵
    if (tipsLoadingRef.current === categoryKey) return;
    tipsLoadingRef.current = categoryKey;

    const loadDynamicTips = async () => {
      const questions = hardFilterConfig.questions!;

      // 각 질문에 대해 병렬로 tip 생성 요청
      const tipPromises = questions.map(async (q) => {
        try {
          const res = await fetch('/api/v2/generate-tip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey,
              questionId: q.id,
              questionText: q.question,
              options: q.options.map(o => ({ value: o.value, label: o.label })),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            return { questionId: q.id, tip: data.tip };
          }
        } catch (error) {
          console.warn(`Failed to load dynamic tip for ${q.id}:`, error);
        }
        return null;
      });

      const results = await Promise.all(tipPromises);
      const tips: Record<string, string> = {};
      results.forEach(r => {
        if (r?.tip) tips[r.questionId] = r.tip;
      });

      setDynamicTips(tips);
    };

    loadDynamicTips();
  }, [categoryKey, hardFilterConfig?.questions]);

  // 하위 카테고리 선택용 동적 팁 로딩
  useEffect(() => {
    if (!categoryKey || !requiresSubCategory || !subCategoryConfig) return;
    // 이미 해당 카테고리의 서브카테고리 팁을 로딩 완료한 경우 스킵
    if (subCategoryTipLoadedRef.current === categoryKey) return;
    subCategoryTipLoadedRef.current = categoryKey;

    const loadSubCategoryTip = async () => {
      try {
        const res = await fetch('/api/v2/generate-tip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            questionId: 'sub_category',
            questionText: `어떤 ${subCategoryConfig.category_name}를 찾으세요?`,
            options: subCategoryConfig.sub_categories.map(sc => ({
              value: sc.code,
              label: sc.name,
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.tip) {
            setSubCategoryTip(data.tip);
          }
        }
      } catch (error) {
        console.warn('Failed to load sub-category tip:', error);
      }
    };

    loadSubCategoryTip();
  }, [categoryKey, requiresSubCategory, subCategoryConfig]);

  // Keep productsRef in sync with products state (to avoid closure issues)
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // DEBUG: Track state changes
  useEffect(() => {
    console.log('📊 DEBUG State Changed:');
    console.log('  - isLoading:', isLoading);
    console.log('  - hardFilterConfig:', !!hardFilterConfig);
    console.log('  - balanceQuestions:', balanceQuestions.length);
    console.log('  - products:', products.length);
  }, [isLoading, hardFilterConfig, balanceQuestions, products]);

  // DEBUG: Track dynamic questions state
  useEffect(() => {
    console.log('🔄 DEBUG Dynamic Questions Updated:');
    console.log('  - dynamicBalanceQuestions:', dynamicBalanceQuestions.length, dynamicBalanceQuestions.map(q => q.id));
    console.log('  - dynamicNegativeOptions:', dynamicNegativeOptions.length, dynamicNegativeOptions.map(o => o.id));
  }, [dynamicBalanceQuestions, dynamicNegativeOptions]);

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

    // [SKIP GUIDE CARDS] 가이드 카드 단계 스킵 - 바로 첫 질문으로 이동
    if (hardFilterConfig) {
      setTimeout(() => {
        // 하드 필터 질문 바로 시작 (하위 카테고리는 첫 번째 질문 후 표시)
        if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
          setCurrentStep(1);
          const msgId = addMessage({
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
          // ContextInput에서 시작/스킵 후 Q1으로 스크롤
          scrollToMessage(msgId);
        }
      }, 250);
    }

    /* [ORIGINAL GUIDE CARDS CODE - COMMENTED OUT]
    // Add guide cards message with intro message (Step 0: 가이드 카드만 표시)
    // ScanAnimation exit 애니메이션(0.2s) 완료 후 메시지 추가하여 레이아웃 점프 방지
    if (hardFilterConfig) {
      setTimeout(() => {
        // 상위 제품 썸네일 + 리뷰 분석 개수 계산
        const currentProducts = productsRef.current;

        // 랭킹 높은 순 정렬 (rank가 낮을수록 높은 순위, null은 마지막)
        const sortedByRank = [...currentProducts].sort((a, b) => {
          if (a.rank === null && b.rank === null) return 0;
          if (a.rank === null) return 1;
          if (b.rank === null) return -1;
          return a.rank - b.rank;
        });

        // 탑 10 중 썸네일 있는 제품들
        const top10WithThumbnails = sortedByRank
          .slice(0, 10)
          .filter(p => p.thumbnail && p.thumbnail.trim() !== '')
          .map(p => p.thumbnail!);

        // 랜덤으로 5개 선택 (셔플 후 슬라이스)
        const shuffled = [...top10WithThumbnails].sort(() => Math.random() - 0.5);
        const productThumbnails = shuffled.slice(0, 5);

        // 리뷰 분석 개수: 제품 총 개수 + 랜덤(1~20)
        const randomOffset = Math.floor(Math.random() * 20) + 1;
        const analyzedReviewCount = currentProducts.length + randomOffset;

        addMessage({
          role: 'system',
          content: '',
          componentType: 'guide-cards',
          componentData: {
            ...hardFilterConfig.guide,
            introMessage: '복잡한 용어, 스펙 비교는 제가 이미 끝냈어요.\n고객님의 상황만 편하게 알려주세요. 딱 맞는 제품을 찾아드릴게요.',
            productThumbnails,
            analyzedReviewCount,
          },
          stepTag: '0/5',
        });
      }, 250);
    }
    */
  }, [hardFilterConfig, categoryName, requiresSubCategory, subCategoryConfig, addMessage, scrollToMessage]);

  // ===================================================
  // Auto-trigger guide cards when data is ready (스캔 애니메이션 스킵)
  // ===================================================
  const hasTriggeredGuideRef = useRef(false);
  // 팁 로딩 중복 방지 ref (categoryKey별로 추적)
  const tipsLoadingRef = useRef<string | null>(null);
  const subCategoryTipLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    // 이미 트리거됐거나, 로딩 중이거나, 설정이 없으면 스킵
    if (hasTriggeredGuideRef.current || isLoading || !hardFilterConfig) return;
    // sessionStorage에서 복원된 경우 스킵 (이미 결과 화면)
    if (isRestoredFromStorage) return;
    // Step -1 (ContextInput)인 경우 스킵 - ContextInput 완료 후 handleContextComplete에서 처리
    if (currentStep === -1) return;

    hasTriggeredGuideRef.current = true;
    handleScanComplete();
  }, [isLoading, hardFilterConfig, isRestoredFromStorage, handleScanComplete, currentStep]);

  // ===================================================
  // Sub-Category Selection Handler (다중 선택 지원)
  // ===================================================

  // 하위 카테고리 클릭 시 토글 (다중 선택)
  const handleSubCategoryToggle = useCallback((code: string) => {
    setSelectedSubCategoryCodes(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      } else {
        return [...prev, code];
      }
    });
  }, []);

  // 하위 카테고리 확정 후 다음 단계로 진행
  const handleSubCategoryConfirm = useCallback(async () => {
    if (selectedSubCategoryCodes.length === 0 || isTransitioning) return;
    setIsTransitioning(true);

    const codes = selectedSubCategoryCodes;
    setShowSubCategorySelector(false);

    // 하위 카테고리 선택이 첫 번째 하드 필터 질문 후에 나타난 경우
    // currentHardFilterIndex는 0에서 유지되어 있으므로 다음 질문(index 1)으로 진행
    const shouldContinueHardFilters = hardFilterConfig?.questions && currentHardFilterIndex === 0;

    console.log('🔍 [handleSubCategoryConfirm] Check:', {
      hasHardFilterConfig: !!hardFilterConfig?.questions,
      currentHardFilterIndex,
      shouldContinueHardFilters
    });

    // Find the selected sub-category names for logging
    const selectedSubs = codes.map(code =>
      subCategoryConfig?.sub_categories.find(s => s.code === code)
    ).filter(Boolean);

    // Log sub-category selection (다중 선택)
    const selectedNames = selectedSubs.map(s => s?.name).join(', ');
    logV2SubCategorySelected(categoryKey, categoryName, codes.join(','), selectedNames);

    const filterBy = subCategoryConfig?.filter_by || 'category_code';
    const filterKey = subCategoryConfig?.filter_key;

    // Store the loaded config and products for auto-proceed
    let loadedHardFilterConfig: HardFilterConfig | null = null;
    let loadedProducts: ProductItem[] = [];

    // Reload hard filters for selected sub-categories
    try {
      // 첫 번째 서브카테고리 기준으로 rules 로드 (rules는 카테고리 전체 공통)
      const rulesUrl = filterBy === 'category_code'
        ? `/api/v2/rules/${categoryKey}?subCategoryCode=${codes[0]}`
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

      // 다중 서브카테고리 필터링: 선택된 모든 서브카테고리의 제품 로드
      if (filterBy === 'category_code') {
        // category_code 기반: targetCategoryCodes에 다중 코드 전달
        const productsRes = await fetch('/api/v2/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            limit: 500,
            targetCategoryCodes: codes,
          }),
        });
        const productsJson = await productsRes.json();

        if (productsJson.success) {
          loadedProducts = productsJson.data.products;
        }
      } else if (filterBy === 'brand') {
        // brand 기반: brands 필터 사용
        // "기타 브랜드"인 경우 brands 필터 없이 전체 로드
        const isOtherBrand = codes.length === 1 && codes[0] === 'other';
        const productsRes = await fetch('/api/v2/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            limit: 500,
            ...(isOtherBrand ? {} : { brands: codes }),
          }),
        });
        const productsJson = await productsRes.json();

        if (productsJson.success) {
          loadedProducts = productsJson.data.products;
        }
      } else {
        // attribute 기반: 각 코드에 대해 개별 로드 후 병합
        const allProductsMap = new Map<string, ProductItem>();

        for (const code of codes) {
          const productsRes = await fetch('/api/v2/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryKey,
              limit: 500,
              filterAttribute: {
                key: filterKey,
                value: code,
              },
            }),
          });
          const productsJson = await productsRes.json();

          if (productsJson.success) {
            for (const product of productsJson.data.products) {
              allProductsMap.set(product.id, product);
            }
          }
        }

        loadedProducts = Array.from(allProductsMap.values());
      }

      setProducts(loadedProducts);
      setFilteredProducts(loadedProducts);
      console.log('📦 Products loaded for sub-categories:', codes, 'count:', loadedProducts.length);
    } catch (error) {
      console.error('Sub-category load error:', error);
      setIsTransitioning(false);
      return;
    }

    // Auto-proceed to hard filters after sub-category selection
    const questions = loadedHardFilterConfig?.questions || [];

    if (shouldContinueHardFilters && questions.length > 1) {
      // 첫 번째 질문(review_priorities)을 이미 완료했으므로 두 번째 질문(index 1)으로 진행
      setTimeout(() => {
        // Use flushSync to ensure state updates complete before adding the next message
        flushSync(() => {
          setCurrentHardFilterIndex(1);
          setCurrentStep(1);
        });

        const msgId = addMessage({
          role: 'system',
          content: '',
          componentType: 'hard-filter',
          componentData: {
            question: questions[1],
            currentIndex: 1,
            totalCount: questions.length,
            selectedValues: [],
          },
        });
        scrollToMessage(msgId);
        setIsTransitioning(false);
      }, 300);
    } else if (questions.length > 0 && !shouldContinueHardFilters) {
      // 가이드 카드 직후 하위 카테고리 선택한 경우 - 첫 번째 질문부터 시작
      setTimeout(() => {
        setCurrentStep(1);

        addMessage({
          role: 'assistant',
          content: '간단한 질문 몇 가지만 드릴게요.',
          stepTag: '1/5',
        });

        setTimeout(() => {
          const msgId = addMessage({
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
          scrollToMessage(msgId);
          setIsTransitioning(false);
        }, 300);
      }, 500);
    } else {
      // No hard filter questions - skip directly to step 2 with loaded products
      console.log('📦 No hard filter questions, skipping to step 2 with', loadedProducts.length, 'products');
      setTimeout(() => {
        handleHardFiltersCompleteRef.current?.({}, loadedProducts);
        setIsTransitioning(false);
      }, 300);
    }
  }, [selectedSubCategoryCodes, isTransitioning, categoryKey, categoryName, subCategoryConfig, addMessage, scrollToMessage, currentHardFilterIndex, hardFilterConfig?.questions]);

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
  // Step -1 Complete → Step 0 (Context Input)
  // ===================================================

  const handleContextComplete = useCallback((context: string | null) => {
    // 1. 상태 저장
    setUserContext(context);

    // 건너뛰기인 경우 preselected 상태 초기화
    if (!context || !context.trim()) {
      setPreselectedExperienceTags([]);
      setPreselectedExplanation('');
    }

    // 2. 즉시 Step 0으로 진행 (AI 파싱 기다리지 않음)
    setCurrentStep(0);

    // 3. Guide Cards 트리거 (hasTriggeredGuideRef 플래그 설정)
    hasTriggeredGuideRef.current = true;
    handleScanComplete();

    // 4. 스크롤을 Q1 영역으로 즉시 이동
    setTimeout(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);

    // 5. 입력이 있으면 AI 파싱 (백그라운드에서 비동기 처리)
    if (context && context.trim()) {
      setIsLoadingPreselection(true);
      fetch('/api/ai-selection-helper/parse-experience-tags-from-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryKey,
          categoryName,
          context: context.trim(),
        }),
      })
        .then(result => {
          if (result.ok) return result.json();
          throw new Error('Parse failed');
        })
        .then(data => {
          if (data?.selectedTags && data.selectedTags.length > 0) {
            setPreselectedExperienceTags(data.selectedTags);
            setPreselectedExplanation(data.explanation || '');
            console.log('🎯 Context parsed, experience tags:', data.selectedTags);
          }
        })
        .catch(error => {
          console.error('Context parsing failed:', error);
        })
        .finally(() => {
          setIsLoadingPreselection(false);
        });
    }
  }, [categoryKey, categoryName, handleScanComplete]);

  // ===================================================
  // Step 1 Complete → Step 2
  // ===================================================

  const handleHardFiltersComplete = useCallback(async (
    answers: Record<string, string[]>,
    productsOverride?: ProductItem[]  // 선택적: state 대신 직접 전달된 products 사용
  ) => {
    setCurrentStep(2);

    // Log hard filter completion
    const totalQuestions = hardFilterConfig?.questions?.length || 0;
    logV2HardFilterCompleted(categoryKey, categoryName, totalQuestions, productsOverride?.length || productsRef.current.length);

    // 직접 입력 분석 (모든 질문의 등록된 입력값을 합쳐서 분석)
    const registeredInputs = Object.entries(hardFilterDirectInputs)
      .filter(([questionId, value]) => 
        hardFilterDirectInputRegistered[questionId] && value.trim().length >= 2
      )
      .map(([, value]) => value.trim());
    
    if (registeredInputs.length > 0) {
      const combinedInput = registeredInputs.join(', ');
      fetch('/api/ai-selection-helper/direct-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterType: 'hard_filter',
          userInput: combinedInput,
          category: categoryKey,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setHardFilterAnalysis(data.data);
            console.log('✅ 하드필터 직접입력 분석 완료:', data.data);
          }
        })
        .catch(err => {
          console.error('하드필터 직접입력 분석 실패:', err);
        });
    }

    // Apply filters to products
    // 우선순위: 1) productsOverride (직접 전달) 2) productsRef.current (최신 상태)
    // Note: productsRef.current 사용으로 closure 문제 해결 (콜백에서 stale products 방지)
    const productsToUse = productsOverride || productsRef.current;
    const questions = hardFilterConfig?.questions || [];
    const filtered = applyHardFilters(productsToUse, answers, questions);
    setFilteredProducts(filtered);

    // Generate condition summary
    const conditions = generateConditionSummary(answers, questions);
    setConditionSummary(conditions);

    console.log('🔍 handleHardFiltersComplete:');
    console.log('  - productsOverride provided:', !!productsOverride);
    console.log('  - productsRef.current:', productsRef.current.length);
    console.log('  - products:', productsToUse.length);
    console.log('  - filtered:', filtered.length);

    // stepTag를 먼저 추가 (checkpoint 위에 위치) - 이 메시지로 스크롤
    const stepMsgId = addMessage({
      role: 'assistant',
      content: '조건에 맞는 후보를 찾고 있어요.',
      stepTag: '2/5',
    }, true);
    scrollToMessage(stepMsgId);

    // 필터링된 상품 썸네일 추출 (상위 5개)
    const productThumbnails = filtered
      .filter(p => p.thumbnail)
      .slice(0, 5)
      .map(p => p.thumbnail as string);

    // 로딩 상태 메시지 추가 (스크롤 없이 그 아래에 렌더링)
    const loadingMsgId = addMessage({
      role: 'system',
      content: '',
      componentType: 'checkpoint',
      componentData: {
        totalProducts: productsToUse.length,
        filteredCount: filtered.length,
        conditions,
        productThumbnails,
        isLoading: true,
      } as CheckpointData & { isLoading: boolean },
    });

    // ========================================
    // 동적 질문 생성 (category-insights 기반 LLM)
    // ========================================
    console.log('🚀 [Dynamic Questions] Starting API call...');
    console.log('  - categoryKey:', categoryKey);
    console.log('  - filteredProducts count:', filtered.length);

    try {
      // 후보군 상품 정보를 포함하여 API 호출
      const generateResponse = await fetch('/api/v2/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          hardFilterAnswers: answers,
          filteredProducts: filtered.slice(0, 50), // 상위 50개만 전달 (payload 크기 제한)
        }),
      });
      const generateJson = await generateResponse.json();

      if (generateJson.success && generateJson.data) {
        const { balance_questions, negative_filter_options, generated_by } = generateJson.data;
        console.log(`  - Dynamic questions generated (${generated_by}):`, balance_questions?.length, negative_filter_options?.length);

        setDynamicBalanceQuestions(balance_questions || []);
        setDynamicNegativeOptions(negative_filter_options || []);

        // Generate rule_key → Korean label mappings
        const balanceMap: Record<string, string> = {};
        (balance_questions || []).forEach((q: BalanceQuestion) => {
          if (q.option_A?.target_rule_key && q.option_A?.text) {
            balanceMap[q.option_A.target_rule_key] = q.option_A.text;
          }
          if (q.option_B?.target_rule_key && q.option_B?.text) {
            balanceMap[q.option_B.target_rule_key] = q.option_B.text;
          }
        });
        setBalanceLabels(balanceMap);

        const negativeMap: Record<string, string> = {};
        (negative_filter_options || []).forEach((opt: NegativeFilterOption) => {
          if (opt.target_rule_key && opt.label) {
            negativeMap[opt.target_rule_key] = opt.label;
          }
        });
        setNegativeLabels(negativeMap);
      } else {
        console.warn('  - Dynamic question generation failed, using fallback');
        // Fallback: 기존 정적 방식
        const relevantKeys = filterRelevantRuleKeys(filtered, logicMap);
        const fallbackBalanceQuestions = generateDynamicBalanceQuestions(relevantKeys, balanceQuestions, categoryKey);
        const fallbackNegativeOptions = generateDynamicNegativeOptions(relevantKeys, negativeOptions);
        setDynamicBalanceQuestions(fallbackBalanceQuestions);
        setDynamicNegativeOptions(fallbackNegativeOptions);

        // Generate label mappings from fallback data
        const balanceMap: Record<string, string> = {};
        fallbackBalanceQuestions.forEach((q: BalanceQuestion) => {
          if (q.option_A?.target_rule_key && q.option_A?.text) {
            balanceMap[q.option_A.target_rule_key] = q.option_A.text;
          }
          if (q.option_B?.target_rule_key && q.option_B?.text) {
            balanceMap[q.option_B.target_rule_key] = q.option_B.text;
          }
        });
        setBalanceLabels(balanceMap);

        const negativeMap: Record<string, string> = {};
        fallbackNegativeOptions.forEach((opt: NegativeFilterOption) => {
          if (opt.target_rule_key && opt.label) {
            negativeMap[opt.target_rule_key] = opt.label;
          }
        });
        setNegativeLabels(negativeMap);
      }
    } catch (error) {
      console.error('Dynamic question generation error:', error);
      // Fallback: 기존 정적 방식
      const relevantKeys = filterRelevantRuleKeys(filtered, logicMap);
      const fallbackBalanceQuestions = generateDynamicBalanceQuestions(relevantKeys, balanceQuestions, categoryKey);
      const fallbackNegativeOptions = generateDynamicNegativeOptions(relevantKeys, negativeOptions);
      setDynamicBalanceQuestions(fallbackBalanceQuestions);
      setDynamicNegativeOptions(fallbackNegativeOptions);

      // Generate label mappings from fallback data
      const balanceMap: Record<string, string> = {};
      fallbackBalanceQuestions.forEach((q: BalanceQuestion) => {
        if (q.option_A?.target_rule_key && q.option_A?.text) {
          balanceMap[q.option_A.target_rule_key] = q.option_A.text;
        }
        if (q.option_B?.target_rule_key && q.option_B?.text) {
          balanceMap[q.option_B.target_rule_key] = q.option_B.text;
        }
      });
      setBalanceLabels(balanceMap);

      const negativeMap: Record<string, string> = {};
      fallbackNegativeOptions.forEach((opt: NegativeFilterOption) => {
        if (opt.target_rule_key && opt.label) {
          negativeMap[opt.target_rule_key] = opt.label;
        }
      });
      setNegativeLabels(negativeMap);
    }

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
            productCount: productsToUse.length,
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

    // 로딩 메시지를 완료 상태로 업데이트
    setMessages(prev => prev.map(msg =>
      msg.id === loadingMsgId
        ? {
            ...msg,
            componentData: {
              totalProducts: productsToUse.length,
              filteredCount: filtered.length,
              conditions,
              productThumbnails,
              isLoading: false,
            } as CheckpointData & { isLoading: boolean },
          }
        : msg
    ));

    // Log checkpoint viewed
    logV2CheckpointViewed(categoryKey, categoryName, filtered.length);

    // Add AI summary message (Step 2 메시지이므로 stepTag 추가)
    const summaryMessage = aiSummary || `전체 **${productsToUse.length}개** 제품 중 **${filtered.length}개**가 조건에 맞아요.`;
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: summaryMessage,
        stepTag: '2/5',
      }, true);
      // scrollToBottom 제거 - 2/5 stepTag로 이미 스크롤됨
    }, 300);
  }, [hardFilterConfig, logicMap, balanceQuestions, negativeOptions, categoryKey, categoryName, addMessage, scrollToMessage, hardFilterDirectInputs, hardFilterDirectInputRegistered]);

  // Update ref to the latest handleHardFiltersComplete
  useEffect(() => {
    handleHardFiltersCompleteRef.current = handleHardFiltersComplete;
  }, [handleHardFiltersComplete]);

  // "다음" 버튼 클릭 시 다음 질문으로 이동
  const handleHardFilterNext = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    const questions = hardFilterConfig?.questions || [];

    // Log current question answer
    const currentQuestion = questions[currentHardFilterIndex];
    if (currentQuestion && hardFilterAnswers[currentQuestion.id]?.length > 0) {
      const selectedValues = hardFilterAnswers[currentQuestion.id];
      const selectedLabels = selectedValues.map(v => hardFilterLabels[v] || v);
      logV2HardFilterAnswer(
        categoryKey,
        categoryName,
        currentQuestion.id,
        currentQuestion.question,
        currentHardFilterIndex,
        questions.length,
        selectedValues,
        selectedLabels
      );
    }

    // 첫 번째 질문(review_priorities) 완료 후 하위 카테고리 선택 필요한지 확인
    const isFirstQuestion = currentHardFilterIndex === 0;
    const needsSubCategoryNow = isFirstQuestion && requiresSubCategory && subCategoryConfig && selectedSubCategoryCodes.length === 0;

    console.log('🔍 [handleHardFilterAnswer] Sub-category check:', {
      isFirstQuestion,
      requiresSubCategory,
      hasSubCategoryConfig: !!subCategoryConfig,
      selectedSubCategoryCodes: selectedSubCategoryCodes.length,
      needsSubCategoryNow
    });

    if (needsSubCategoryNow) {
      // 첫 번째 질문 완료 후 하위 카테고리 선택 표시 (currentHardFilterIndex는 유지)
      setShowSubCategorySelector(true);
      setTimeout(() => {
        const msgId = addMessage({
          role: 'system',
          content: '',
          componentType: 'sub-category',
          componentData: {
            categoryName: subCategoryConfig.category_name,
            subCategories: subCategoryConfig.sub_categories,
          },
        });
        scrollToMessage(msgId);
        setIsTransitioning(false);
      }, 300);
      return;
    }

    const nextIndex = currentHardFilterIndex + 1;

    if (nextIndex < questions.length) {
      // Show next question
      setCurrentHardFilterIndex(nextIndex);

      setTimeout(() => {
        const msgId = addMessage({
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
        scrollToMessage(msgId);
        setIsTransitioning(false);
      }, 300);
    } else {
      // 마지막 질문 완료 - Step 2로 이동
      handleHardFiltersComplete(hardFilterAnswers);
      setIsTransitioning(false);
    }
  }, [isTransitioning, hardFilterConfig, currentHardFilterIndex, hardFilterAnswers, hardFilterLabels, categoryKey, categoryName, addMessage, scrollToMessage, handleHardFiltersComplete, requiresSubCategory, subCategoryConfig, selectedSubCategoryCodes]);

  // ===================================================
  // Step 2 → Step 3: Start Balance Game
  // ===================================================

  const handleStartBalanceGame = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    console.log('🎮 [Step 3] handleStartBalanceGame called');
    console.log('  - dynamicBalanceQuestions:', dynamicBalanceQuestions.length, dynamicBalanceQuestions.map(q => q.id));
    console.log('  - balanceQuestions (static):', balanceQuestions.length);

    setCurrentStep(3);
    setCurrentBalanceIndex(0);

    if (dynamicBalanceQuestions.length > 0) {
      // stepTag 메시지로 스크롤 - 타이핑 완료 시 밸런스 게임 컴포넌트 추가
      const stepMsgId = addMessage({
        role: 'assistant',
        content: '후보들 중에서 최적의 제품을 고르기 위한 질문을 드릴게요. **더 중요한 쪽을 골라주세요!**',
        stepTag: '3/5',
        onTypingComplete: () => {
          // 타이핑 완료 후 밸런스 게임 컴포넌트 추가
          addMessage({
            role: 'system',
            content: '',
            componentType: 'balance-carousel',
            componentData: {
              questions: dynamicBalanceQuestions,
            },
          });
          setIsTransitioning(false);
        },
      }, true);
      scrollToMessage(stepMsgId);
    } else {
      // No balance questions, skip to step 4
      handleBalanceGameComplete(new Set());
      setIsTransitioning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning, dynamicBalanceQuestions, addMessage, scrollToMessage]);

  // ===================================================
  // Step 3: Balance Game Complete (캐러셀에서 호출됨)
  // ===================================================

  const handleBalanceGameComplete = useCallback(async (selections: Set<string>) => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    console.log('🚫 [Step 4] handleBalanceGameComplete called');
    console.log('  - selections:', Array.from(selections));
    console.log('  - dynamicNegativeOptions:', dynamicNegativeOptions.length, dynamicNegativeOptions.map(o => o.id));
    console.log('  - negativeOptions (static):', negativeOptions.length);

    // Log balance game completion
    logV2BalanceCompleted(categoryKey, categoryName, selections.size, Array.from(selections));

    // 선택된 rule keys 저장
    setBalanceSelections(selections);
    setCurrentStep(4);

    // 밸런스 선택값을 기반으로 단점 필터 재생성
    // (선택한 옵션과 충돌하는 단점 제외)
    let updatedNegativeOptions = dynamicNegativeOptions;

    // 선택값이 있으면 로딩 표시 후 API 호출
    if (selections.size > 0) {
      // shimmer 로딩 메시지 추가 + 스크롤
      const loadingMsgId = addMessage({
        role: 'system',
        content: '',
        componentType: 'loading-text',
        componentData: {
          text: `${selections.size}개 선호 항목을 반영하는 중...`,
        },
      });
      scrollToMessage(loadingMsgId);

      try {
        // 선택된 rule keys → BalanceSelection 형태로 변환
        const balanceSelectionsForAPI = dynamicBalanceQuestions
          .filter(q =>
            selections.has(q.option_A.target_rule_key) ||
            selections.has(q.option_B.target_rule_key)
          )
          .map(q => {
            const selectedA = selections.has(q.option_A.target_rule_key);
            return {
              questionId: q.id,
              questionTitle: q.title,
              selectedOption: selectedA ? 'A' as const : 'B' as const,
              selectedText: selectedA ? q.option_A.text : q.option_B.text,
              rejectedText: selectedA ? q.option_B.text : q.option_A.text,
              targetRuleKey: selectedA ? q.option_A.target_rule_key : q.option_B.target_rule_key,
            };
          });

        console.log('🔄 [Step 4] Regenerating negative filters with balance selections:', balanceSelectionsForAPI.length);

        const generateResponse = await fetch('/api/v2/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryKey,
            hardFilterAnswers,
            filteredProducts: filteredProducts.slice(0, 50),
            balanceSelections: balanceSelectionsForAPI,
          }),
        });
        const generateJson = await generateResponse.json();

        if (generateJson.success && generateJson.data?.negative_filter_options) {
          updatedNegativeOptions = generateJson.data.negative_filter_options;
          setDynamicNegativeOptions(updatedNegativeOptions);

          // Update negative labels
          const negativeMap: Record<string, string> = {};
          updatedNegativeOptions.forEach((opt: NegativeFilterOption) => {
            if (opt.target_rule_key && opt.label) {
              negativeMap[opt.target_rule_key] = opt.label;
            }
          });
          setNegativeLabels(negativeMap);

          console.log('  - Regenerated negative filters:', updatedNegativeOptions.length);
        }
      } catch (error) {
        console.warn('Failed to regenerate negative filters:', error);
        // 실패 시 기존 옵션 사용
      }

      // 로딩 메시지 제거
      setMessages(prev => prev.filter(msg => msg.id !== loadingMsgId));
    }

    // 로딩 완료 후 stepTag 메시지 추가 + 스크롤
    const stepMsgId = addMessage({
      role: 'assistant',
      content: '후보들의 실제 리뷰에서 단점을 분석했어요.',
      stepTag: '4/5',
    }, true);
    scrollToMessage(stepMsgId);

    if (updatedNegativeOptions.length > 0) {
      setTimeout(() => {
        // 컴포넌트는 스크롤 없이 그 아래에 렌더링
        addMessage({
          role: 'system',
          content: '',
          componentType: 'negative-filter',
          componentData: {
            options: updatedNegativeOptions,
            selectedKeys: negativeSelections,
          } as NegativeFilterData,
        });
        setIsTransitioning(false);
      }, 300);
    } else {
      // No negative options, skip to step 5
      handleNegativeComplete();
      setIsTransitioning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning, dynamicNegativeOptions, dynamicBalanceQuestions, negativeSelections, negativeOptions.length, categoryKey, hardFilterAnswers, filteredProducts, addMessage, scrollToMessage]);

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
    if (isTransitioning) return;
    setIsTransitioning(true);

    // Log negative selection completion
    const selectedLabels = negativeSelections.map(key => negativeLabels[key] || key);
    logV2NegativeCompleted(categoryKey, categoryName, negativeSelections, selectedLabels);

    // 직접 입력 분석 (입력값이 있으면 백그라운드에서 API 호출)
    if (negativeDirectInput.trim().length >= 2) {
      fetch('/api/ai-selection-helper/direct-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterType: 'negative_filter',
          userInput: negativeDirectInput,
          category: categoryKey,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setNegativeAnalysis(data.data);
            console.log('✅ 단점필터 직접입력 분석 완료:', data.data);
          }
        })
        .catch(err => {
          console.error('단점필터 직접입력 분석 실패:', err);
        });
    }

    setCurrentStep(5);

    // stepTag 메시지로 스크롤
    const stepMsgId = addMessage({
      role: 'assistant',
      content: '마지막이에요!',
      stepTag: '5/5',
    }, true);
    scrollToMessage(stepMsgId);

    setTimeout(() => {
      // 컴포넌트는 스크롤 없이 그 아래에 렌더링
      addMessage({
        role: 'system',
        content: '',
        componentType: 'budget-slider',
      });
      setIsTransitioning(false);
    }, 300);
  }, [isTransitioning, negativeSelections, negativeLabels, categoryKey, categoryName, addMessage, scrollToMessage, negativeDirectInput]);

  // ===================================================
  // Step 5: Budget & Results
  // ===================================================

  const handleBudgetChange = useCallback((values: { min: number; max: number }) => {
    setBudget(values);
  }, []);

  // 자연어 입력 저장 핸들러
  const handleNaturalLanguageInput = useCallback((stage: string, input: string) => {
    setNaturalLanguageInputs(prev => [
      ...prev,
      {
        stage,
        timestamp: new Date().toISOString(),
        input,
      },
    ]);
  }, []);

  // AI Helper용 실시간 사용자 선택 정보 (모든 단계에서 사용)
  const allUserSelections = useMemo((): UserSelections => {
    const result: UserSelections = {};

    // 하드필터 선택 정보
    if (hardFilterConfig?.questions && Object.keys(hardFilterAnswers).length > 0) {
      result.hardFilters = hardFilterConfig.questions
        .filter(q => hardFilterAnswers[q.id]?.length > 0)
        .map(q => ({
          questionText: q.question,
          selectedLabels: hardFilterAnswers[q.id]
            .map(v => q.options.find(o => o.value === v)?.label || v)
            .filter(Boolean),
        }));
    }

    // 밸런스게임 선택 정보
    if (balanceQuestions.length > 0 && balanceSelections.size > 0) {
      result.balanceGames = balanceQuestions
        .filter(q =>
          balanceSelections.has(q.option_A.target_rule_key) ||
          balanceSelections.has(q.option_B.target_rule_key)
        )
        .map(q => {
          const selectedA = balanceSelections.has(q.option_A.target_rule_key);
          const selectedB = balanceSelections.has(q.option_B.target_rule_key);
          return {
            title: q.title,
            selectedOption: selectedA && selectedB
              ? '둘 다 중요'
              : selectedA
                ? q.option_A.text
                : q.option_B.text,
          };
        });
    }

    // 자연어 입력 정보
    if (naturalLanguageInputs.length > 0) {
      result.naturalLanguageInputs = naturalLanguageInputs;
    }

    // 초기 컨텍스트 입력 정보 (Step -1)
    if (userContext) {
      result.initialContext = userContext;
    }

    return result;
  }, [hardFilterConfig, hardFilterAnswers, balanceQuestions, balanceSelections, naturalLanguageInputs, userContext]);

  const handleGetRecommendation = useCallback(async (useBudgetHardFilter = false) => {
    setIsCalculating(true);
    // progress는 useEffect에서 0으로 초기화됨

    // 타임라인 초기화 (local array for building, state for real-time display)
    const timelineStartTime = Date.now();
    const localTimelineSteps: TimelineStep[] = []; // 로컬 배열로 타임라인 구축
    setTimelineSteps([]); // UI 표시용 state 초기화

    // Log recommendation requested
    logV2RecommendationRequested(categoryKey, categoryName, budget.min, budget.max, filteredProducts.length);

    try {
      // 📦 1단계: 상품 데이터 준비
      const scored: ScoredProduct[] = filteredProducts.map(product => {
        // 하드필터 점수 계산 (체감속성 + 일반 하드필터)
        const { score: hardFilterScore, matchedRules: hardFilterMatches } = calculateHardFilterScore(
          product,
          hardFilterAnswers,
          hardFilterConfig
        );

        // 밸런스 게임 점수 계산
        const { score: baseScore, matchedRules } = calculateBalanceScore(
          product,
          balanceSelections,
          logicMap
        );

        // 단점 필터 점수 계산
        const negativeScore = calculateNegativeScore(
          product,
          negativeSelections,
          dynamicNegativeOptions,
          logicMap
        );

        // 예산 점수 계산 (soft constraint)
        const budgetScore = calculateBudgetScore(product, budget);

        // 직접 입력 점수 계산 (하드필터 + 단점필터)
        const hardFilterDirectScore = calculateDirectInputScore(product, hardFilterAnalysis);
        const negativeDirectScore = calculateDirectInputScore(product, negativeAnalysis);
        const directInputScore = hardFilterDirectScore + negativeDirectScore;

        // 예산 초과 정보 계산
        const effectivePrice = product.lowestPrice ?? product.price ?? 0;
        const isOverBudget = effectivePrice > 0 && effectivePrice > budget.max;
        const overBudgetAmount = isOverBudget ? Math.max(0, effectivePrice - budget.max) : 0;
        const overBudgetPercent = isOverBudget && budget.max > 0
          ? Math.round((effectivePrice - budget.max) / budget.max * 100)
          : 0;

        return {
          ...product,
          hardFilterScore,
          baseScore,
          negativeScore,
          budgetScore,
          directInputScore,
          totalScore: hardFilterScore + baseScore + negativeScore + budgetScore + directInputScore,
          matchedRules: [...hardFilterMatches, ...matchedRules],
          isOverBudget,
          overBudgetAmount,
          overBudgetPercent,
        };
      });

      // 예산 필터링 (하드 필터 모드 시 범위 내 제품만, 일반 모드 시 점수 반영만)
      let sorted: ScoredProduct[];
      if (useBudgetHardFilter) {
        console.log('[예산 하드필터 모드] 예산 범위:', budget.min.toLocaleString(), '~', budget.max.toLocaleString(), '원');

        // 예산 하드 필터링: budget.min ~ budget.max 범위 내 제품만 선택
        sorted = scored
          .filter(p => {
            const effectivePrice = p.lowestPrice ?? p.price ?? 0;
            const isInBudget = effectivePrice > 0 && effectivePrice >= budget.min && effectivePrice <= budget.max;

            // 필터링 제외 제품 로그 (디버깅용 - 상위 10개만)
            if (!isInBudget && effectivePrice > 0 && scored.indexOf(p) < 10) {
              console.log(`[예산 필터링 제외] ${p.brand || ''} ${p.title.substring(0, 30)}... - 가격: ${effectivePrice.toLocaleString()}원`);
            }

            return isInBudget;
          })
          .sort((a, b) => b.totalScore - a.totalScore);

        console.log(`[예산 하드필터] 전체 ${scored.length}개 → 예산 범위 내 ${sorted.length}개`);
      } else {
        // 일반 모드: 예산을 점수에 반영하므로 필터링 없이 정렬만
        sorted = scored.sort((a, b) => b.totalScore - a.totalScore);
      }

      const candidateProducts = sorted.slice(0, 15);

      // 예산 하드필터 모드에서 후보 제품 가격 범위 확인
      if (useBudgetHardFilter && candidateProducts.length > 0) {
        const prices = candidateProducts.map(p => p.lowestPrice ?? p.price ?? 0).filter(p => p > 0);
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          console.log(`[예산 하드필터] 후보 제품 가격 범위: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원 (예산: ${budget.min.toLocaleString()}~${budget.max.toLocaleString()}원)`);
        }
      }

      // 전체 점수 계산된 제품 목록 저장 (예산 필터 재추천용)
      setAllScoredProducts(sorted);

      // 예산 내 제품 개수 계산 (로깅용)
      const budgetFilteredCount = scored.filter(p => !p.isOverBudget).length;


      // 타임라인: 1단계 완료
      const step1: TimelineStep = {
        id: 'step-1',
        title: '📦 상품 데이터 준비',
        icon: '',
        details: [
          '조건에 맞는 제품 필터링',
          '사용자 선호도와 회피 조건을 바탕으로 AI 분석 점수 계산',
          '예산 범위 내 최적 후보 선정',
        ],
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step1);
      setTimelineSteps(prev => [...prev, step1]);

      // 스텝 사이 짧은 간격 (스트리밍은 백그라운드에서 진행)
      await new Promise(resolve => setTimeout(resolve, 300));

      // 📚 2단계: 카테고리 전문 지식 로드

      const step2: TimelineStep = {
        id: 'step-2',
        title: '📚 카테고리 전문 지식 로드',
        icon: '',
        details: [
          `${categoryName} 카테고리 인사이트 분석`,
          '실구매자들이 중요하게 생각하는 포인트 파악',
          '제품 비교 기준 설정',
        ],
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step2);
      setTimelineSteps(prev => [...prev, step2]);

      // 스텝 사이 짧은 간격
      await new Promise(resolve => setTimeout(resolve, 300));

      // 📝 3단계: 실사용 리뷰 수집

      const step3: TimelineStep = {
        id: 'step-3',
        title: '📝 실사용 리뷰 분석',
        icon: '',
        details: [
          '후보 제품들의 리뷰 분석',
          '긍정 리뷰와 부정 리뷰 분류',
          '사용자 조건과 관련된 실제 경험 추출',
        ],
        subDetails: candidateProducts.length > 0 ? [
          {
            label: '분석된 제품 예시',
            items: candidateProducts.slice(0, Math.min(6, candidateProducts.length)).map(p => `${p.brand || ''} ${p.title}`.trim()),
          },
        ] : undefined,
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step3);
      setTimelineSteps(prev => [...prev, step3]);

      // 스텝 사이 짧은 간격
      await new Promise(resolve => setTimeout(resolve, 300));

      // 사용자 선택 조건 정리 (step4에서 사용)
      const userSelectedConditions: string[] = [];
      const userAvoidConditions: string[] = [];

      // 밸런스 게임 선택
      Array.from(balanceSelections).forEach(ruleKey => {
        const label = balanceLabels[ruleKey];
        if (label) userSelectedConditions.push(label);
      });

      // 단점 필터 선택
      negativeSelections.forEach(negKey => {
        const label = negativeLabels[negKey];
        if (label) userAvoidConditions.push(label);
      });

      // 🤖 4단계: AI 종합 분석 시작 (API 호출 전)

      const step4: TimelineStep = {
        id: 'step-4',
        title: '🤖 AI 종합 분석',
        icon: '',
        details: [
          'AI가 리뷰를 종합 분석',
          '사용자 선호 조건과 제품 특성 비교',
          '각 제품의 장단점 평가 및 추천 점수 계산',
        ],
        subDetails: [
          {
            label: '사용자가 중요하게 생각하는 조건',
            items: userSelectedConditions.length > 0 ? userSelectedConditions : ['(선택된 조건 없음)'],
          },
          ...(userAvoidConditions.length > 0 ? [{
            label: '피하고 싶은 조건',
            items: userAvoidConditions,
          }] : []),
        ],
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step4);
      setTimelineSteps(prev => [...prev, step4]);

      // API 호출 전 짧은 간격
      await new Promise(resolve => setTimeout(resolve, 500));

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
              initialContext: userContext,  // 사용자가 처음 입력한 자연어 상황
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


      // 각 단계 사이 지연 (스트리밍 효과)
      await new Promise(resolve => setTimeout(resolve, 400));

      const step5: TimelineStep = {
        id: 'step-5',
        title: '🏆 Top 3 최종 선정',
        icon: '',
        details: [
          'AI 분석 결과와 사용자 선호도를 종합',
          '가장 적합한 상위 3개 제품 선정',
          '각 제품별 추천 이유 생성',
        ],
        subDetails: top3.length > 0 ? [
          {
            label: '선정된 제품',
            items: top3.map((p, idx) => `${idx + 1}. ${p.brand || ''} ${p.title}`.trim()),
          },
        ] : undefined,
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step5);
      setTimelineSteps(prev => [...prev, step5]);


      // 스텝 사이 짧은 간격
      await new Promise(resolve => setTimeout(resolve, 300));

      // 타임라인: 6단계 완료 (최종)
      const step6: TimelineStep = {
        id: 'step-6',
        title: '✨ 개인 맞춤 추천 완료',
        icon: '',
        details: [
          '사용자님의 조건에 가장 적합한 제품 3개 선정 완료',
          '각 제품의 상세 분석 및 추천 이유 제공',
          '실사용 리뷰 기반의 신뢰할 수 있는 추천',
        ],
        timestamp: Date.now(),
        status: 'completed',
      };
      localTimelineSteps.push(step6);
      setTimelineSteps(prev => [...prev, step6]);


      // 태그 정제 API 호출 (백그라운드)
      try {
        // raw 태그 수집 (matchedRules 레이블 + 하드필터 매칭 레이블)
        const productsWithRawTags = top3.map((p: ScoredProduct) => {
          const rawTags: string[] = [];

          // 1. matchedRules에서 balanceLabels 레이블 추가
          (p.matchedRules || []).forEach((ruleKey: string) => {
            const label = balanceLabels[ruleKey];
            if (label) rawTags.push(label);
          });

          // 2. 하드필터: 사용자가 선택한 값 중 상품이 실제로 매칭하는 것만 추가
          const allSelectedValues = Object.values(hardFilterAnswers).flat();
          for (const value of allSelectedValues) {
            if (value === 'any') continue;

            const filterConditions = hardFilterDefinitions[value];
            // 빈 조건이면 스킵 (사용자 선호이지 상품 속성 아님)
            if (!filterConditions || Object.keys(filterConditions).length === 0) continue;

            // 상품이 해당 조건을 만족하는지 확인
            let matches = true;
            for (const [path, condition] of Object.entries(filterConditions)) {
              let productValue: unknown;

              if (path.startsWith('filter_attrs.')) {
                const attrKey = path.replace('filter_attrs.', '');
                productValue = (p as ScoredProduct & { filter_attrs?: Record<string, unknown> }).filter_attrs?.[attrKey];
              } else if (path.startsWith('spec.')) {
                const specKey = path.replace('spec.', '');
                productValue = p.spec?.[specKey];
              } else if (path === 'brand') {
                productValue = p.brand;
              }

              // 조건 체크
              if (typeof condition === 'string') {
                if (String(productValue) !== condition) {
                  matches = false;
                  break;
                }
              } else if (typeof condition === 'object' && condition !== null) {
                const condObj = condition as { contains?: string; eq?: string | number };
                if (condObj.contains !== undefined) {
                  const strValue = String(productValue || '').toLowerCase();
                  if (!strValue.includes(String(condObj.contains).toLowerCase())) {
                    matches = false;
                    break;
                  }
                }
                if (condObj.eq !== undefined) {
                  if (String(productValue) !== String(condObj.eq)) {
                    matches = false;
                    break;
                  }
                }
              }
            }

            // 매칭되면 레이블 추가
            if (matches) {
              const label = hardFilterLabels[value];
              if (label) rawTags.push(label);
            }
          }

          return { pcode: p.pcode, rawTags };
        });

        const refineResponse = await fetch('/api/v2/refine-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: productsWithRawTags,
            categoryName,
          }),
        });

        const refineResult = await refineResponse.json();

        if (refineResult.success && refineResult.data?.refinedTags) {
          top3 = top3.map((p: ScoredProduct) => ({
            ...p,
            refinedTags: refineResult.data.refinedTags[p.pcode] || [],
          }));
          console.log(`✅ Tags refined (${refineResult.data.generated_by})`);
        }
      } catch (refineError) {
        console.warn('Tag refinement failed, using raw tags:', refineError);
      }

      setScoredProducts(top3);
      setSelectionReason(finalSelectionReason);

      // sessionStorage에 결과 저장 (페이지 이동 후 복원용)
      try {
        const savedState = {
          scoredProducts: top3,
          selectionReason: finalSelectionReason,
          categoryKey,
          categoryName,
          currentStep: 5,
          budget,
          hardFilterAnswers,
          balanceSelections: Array.from(balanceSelections),
          negativeSelections,
          conditionSummary,
          balanceLabels,
          negativeLabels,
          hardFilterLabels,
          hardFilterDefinitions,
          // 직접 입력 데이터 (AI 요약에 활용)
          hardFilterDirectInput: Object.entries(hardFilterDirectInputs)
            .filter(([qId]) => hardFilterDirectInputRegistered[qId])
            .map(([, v]) => v)
            .join(', '),
          negativeDirectInput,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(`v2_result_${categoryKey}`, JSON.stringify(savedState));
        console.log('✅ [sessionStorage] Result saved for', categoryKey);
      } catch (e) {
        console.warn('[sessionStorage] Failed to save result:', e);
      }

      // Log recommendation received (with matchedRules as tags + recommendationReason)
      logV2RecommendationReceived(
        categoryKey,
        categoryName,
        top3.map((p: ScoredProduct, index: number) => ({
          pcode: p.pcode,
          title: p.title,
          brand: p.brand || undefined,
          rank: index + 1,
          price: p.price || undefined,
          score: p.totalScore,
          tags: p.matchedRules, // 매칭된 규칙들
          reason: (p as { recommendationReason?: string }).recommendationReason, // 제품별 추천 이유
        })),
        finalSelectionReason,
        budgetFilteredCount
      );

      // 🆕 하이라이트 리뷰 생성 (비동기, 사용자 대기 없이)
      (async () => {
        try {
          const highlightedReviews = await Promise.all(
            top3.map(async (product: ScoredProduct, index: number) => {
              // citedReviews가 없으면 스킵
              if (!product.citedReviews || product.citedReviews.length === 0) {
                return null;
              }

              // selectedTagsEvaluation에서 체감속성별로 리뷰 추출 (최대 5개)
              const reviewsForHighlight = product.selectedTagsEvaluation
                ?.filter(tag => tag.citations && tag.citations.length > 0)
                .slice(0, 5) // 최대 5개 속성
                .map(tag => {
                  const citationIdx = tag.citations[0]; // 첫 번째 인용 리뷰
                  const citedReview = product.citedReviews?.[citationIdx];
                  return citedReview ? {
                    reviewText: citedReview.text,
                    criteriaName: tag.userTag,
                    criteriaId: tag.userTag, // userTag를 ID로 사용
                  } : null;
                })
                .filter(Boolean) as Array<{
                  reviewText: string;
                  criteriaName: string;
                  criteriaId: string;
                }>;

              if (reviewsForHighlight.length === 0) return null;

              // Highlight API 호출
              const response = await fetch('/api/v2/highlight-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviews: reviewsForHighlight }),
              });

              if (!response.ok) return null;

              const result = await response.json();
              if (!result.success || !result.data) return null;

              return {
                pcode: product.pcode,
                productTitle: product.title,
                rank: index + 1,
                reviews: result.data.map((item: { criteriaId: string; originalText: string; excerpt: string }) => ({
                  criteriaId: item.criteriaId,
                  criteriaName: item.criteriaId, // criteriaName과 동일
                  originalText: item.originalText,
                  excerpt: item.excerpt,
                })),
              };
            })
          );

          // null 제거
          const validHighlights = highlightedReviews.filter((h): h is NonNullable<typeof h> => h !== null);

          if (validHighlights.length > 0) {
            // 제품 정보 + highlightedReviews 함께 로깅 (어드민에서 매칭 용이하도록)
            logV2RecommendationReceived(
              categoryKey,
              categoryName,
              top3.map((p: ScoredProduct, index: number) => ({
                pcode: p.pcode,
                title: p.title,
                brand: p.brand || undefined,
                rank: index + 1,
                price: p.price || undefined,
                score: p.totalScore,
                tags: p.matchedRules,
                reason: (p as { recommendationReason?: string }).recommendationReason,
              })),
              finalSelectionReason,
              budgetFilteredCount,
              undefined,
              validHighlights
            );
            console.log('✅ [Highlight Reviews] Logged successfully:', validHighlights.length, 'products');
          }
        } catch (error) {
          console.error('[Highlight Reviews] Failed to generate:', error);
        }
      })();

      // 타임라인 state 저장
      setAnalysisTimeline({
        steps: localTimelineSteps,
        startTime: timelineStartTime,
        endTime: Date.now(),
      });

      // API 완료 → 현재 progress에서 100%까지 빠르게 (10ms당 1%)
      const currentProgress = progressRef.current;
      for (let i = currentProgress + 1; i <= 100; i++) {
        setProgress(i);
        progressRef.current = i;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await new Promise(resolve => setTimeout(resolve, 300)); // 100% 표시 후 잠시 대기

      // 최종 Top 3 제품 가격 확인 (디버깅용)
      if (useBudgetHardFilter) {
        console.log('[최종 Top 3] 예산 하드필터 모드:', top3.map((p: ScoredProduct) => ({
          title: `${p.brand || ''} ${p.title.substring(0, 30)}...`,
          lowestPrice: p.lowestPrice,
          price: p.price,
          effectivePrice: p.lowestPrice ?? p.price ?? 0,
        })));
      }

      // 결과 메시지 추가 + 스크롤 (맞춤 추천 완료 헤더 아래로)
      const resultMsgId = addMessage({
        role: 'system',
        content: '',
        componentType: 'result-cards',
        componentData: {
          products: top3,
          categoryName,
          categoryKey,
          selectionReason: finalSelectionReason,
          analysisTimeline: {
            steps: localTimelineSteps,
            startTime: timelineStartTime,
            endTime: Date.now(),
          },
        },
      });
      scrollToMessage(resultMsgId);
    } catch (error) {
      console.error('Score calculation error:', error);
      addMessage({
        role: 'assistant',
        content: '추천 계산 중 오류가 발생했어요. 다시 시도해주세요.',
        stepTag: '5/5',
      });
    } finally {
      setIsCalculating(false);
    }
  }, [filteredProducts, balanceSelections, negativeSelections, dynamicNegativeOptions, logicMap, budget, categoryName, categoryKey, hardFilterAnswers, hardFilterAnalysis, negativeAnalysis, hardFilterConfig, hardFilterDefinitions, hardFilterLabels, balanceLabels, negativeLabels, conditionSummary, userContext, hardFilterDirectInputs, hardFilterDirectInputRegistered, negativeDirectInput, addMessage, scrollToMessage]);

  // 예산 내 제품만 보기 재추천 핸들러
  const handleRestrictToBudget = useCallback(async () => {
    console.log('[handleRestrictToBudget] 시작', { budget });

    // 예산 범위 내 제품 개수 미리 확인 (디버깅 로그 포함)
    const budgetCheckProducts = filteredProducts.filter(p => {
      const effectivePrice = p.lowestPrice ?? p.price ?? 0;
      const isInBudget = effectivePrice > 0 && effectivePrice >= budget.min && effectivePrice <= budget.max;

      // 예산 범위 밖 제품 로그
      if (!isInBudget && effectivePrice > 0) {
        console.log(`[예산 필터링 제외] ${p.brand || ''} ${p.title.substring(0, 30)}... - 가격: ${effectivePrice.toLocaleString()}원 (예산: ${budget.min.toLocaleString()}~${budget.max.toLocaleString()}원)`);
      }

      return isInBudget;
    });

    console.log(`[handleRestrictToBudget] 전체: ${filteredProducts.length}개, 예산 범위 내: ${budgetCheckProducts.length}개`);

    // 가격 포맷팅 함수
    const formatPrice = (price: number) => `${Math.floor(price / 10000)}만${(price % 10000) > 0 ? ` ${Math.floor((price % 10000) / 1000)}천` : ''}원`;

    if (budgetCheckProducts.length < 3) {
      addMessage({
        role: 'assistant',
        content: `예산 ${formatPrice(budget.min)}~${formatPrice(budget.max)} 범위 내 제품이 ${budgetCheckProducts.length}개뿐이에요. 예산을 조금 조정해보시는 건 어떨까요?`,
        stepTag: '5/5',
      });
      return;
    }

    // 안내 메시지
    addMessage({
      role: 'assistant',
      content: `정확한 예산 범위 내 (${formatPrice(budget.min)}~${formatPrice(budget.max)}) 제품으로 다시 추천드릴게요.`,
      stepTag: '5/5',
    });

    // 전체 추천 로직 실행 (예산 하드필터 모드)
    await handleGetRecommendation(true);
  }, [filteredProducts, budget, addMessage, handleGetRecommendation]);

  // ===================================================
  // Render Message
  // ===================================================

  const renderMessage = (message: ChatMessage) => {
    if (message.role === 'assistant') {
      // stepTag가 있으면 해당 스텝 파싱 (예: '2/5' → 2)
      let messageStep: number | null = null;
      if (message.stepTag) {
        const match = message.stepTag.match(/^(\d+)\/\d+$/);
        if (match) {
          messageStep = parseInt(match[1], 10);
        }
      }

      // 현재 스텝보다 이전 스텝의 메시지면 비활성화
      const isPastStep = messageStep !== null && currentStep > messageStep;

      return (
        <div
          key={message.id}
          data-message-id={message.id}
          className={`scroll-mt-3 transition-all duration-300 ${
            isPastStep ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <AssistantMessage
            content={message.content}
            stepTag={message.stepTag}
            typing={message.typing}
            onTypingComplete={message.onTypingComplete}
          />
        </div>
      );
    }

    // System messages with components
    if (message.componentType) {
      switch (message.componentType) {
        case 'guide-cards':
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                currentStep > 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <GuideCards
                data={message.componentData as GuideCardsData & { introMessage?: string }}
                introMessage={(message.componentData as { introMessage?: string })?.introMessage}
                isActive={currentStep === 0 && !showSubCategorySelector && (!requiresSubCategory || selectedSubCategoryCodes.length === 0)}
                disabled={isTransitioning}
                enableTyping={true}
                categoryName={categoryName}
                onTabChange={(tab, tabLabel) => {
                  logGuideCardTabSelection(categoryKey, categoryName, tab, tabLabel);
                }}
                onToggle={(type, isOpen) => {
                  logGuideCardToggle(categoryKey, categoryName, type, isOpen);
                }}
                onNext={() => {
                  if (isTransitioning) return;
                  setIsTransitioning(true);

                  // 가이드 카드 완료 후 하드 필터 질문으로 진행 (하위 카테고리는 첫 번째 질문 후 표시)
                  if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
                    // 하드 필터 질문 시작
                    setCurrentStep(1);
                    const msgId = addMessage({
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
                    setTimeout(() => {
                      scrollToMessage(msgId);
                      setIsTransitioning(false);
                    }, 100);
                  } else {
                    setIsTransitioning(false);
                  }
                }}
              />
            </div>
          );

        case 'sub-category':
          const subCatData = message.componentData as {
            categoryName: string;
            subCategories: SubCategory[];
          };
          // Sub-category는 첫 번째 질문 후 표시되고, 완료되면 currentHardFilterIndex가 1로 증가
          // 따라서 currentHardFilterIndex > 0이면 이미 다음 질문으로 넘어간 것
          const isSubCategoryDisabled = currentStep > 1 || currentHardFilterIndex > 0;
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                isSubCategoryDisabled ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <SubCategorySelector
                categoryName={subCatData.categoryName}
                subCategories={subCatData.subCategories}
                selectedCodes={selectedSubCategoryCodes}
                onToggle={handleSubCategoryToggle}
                dynamicTip={subCategoryTip}
                showAIHelper={true}
                category={categoryKey}
                userSelections={allUserSelections}
              />
            </div>
          );

        case 'hard-filter':
          const hfData = message.componentData as { question: HardFilterQuestion; currentIndex: number; totalCount: number; selectedValues?: string[] };
          const isPastQuestion = hfData.currentIndex < currentHardFilterIndex;
          // Step 1이 지나가면 모든 하드필터 질문 비활성화
          const isHardFilterDisabled = currentStep > 1 || isPastQuestion;
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`scroll-mt-4 transition-all duration-300 ${
                isHardFilterDisabled ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <HardFilterQuestionComponent
                data={hfData}
                onSelect={handleHardFilterSelect}
                products={products}
                showProductCounts={true}
                popularOptions={popularHardFilterOptions}
                dynamicTip={dynamicTips[hfData.question.id]}
                showAIHelper={true}
                category={categoryKey}
                categoryName={categoryName}
                thumbnailProducts={products.slice(0, 5).map(p => ({
                  id: p.pcode,
                  title: p.title,
                  thumbnail: p.thumbnail || undefined
                }))}
                userSelections={allUserSelections}
                onNaturalLanguageInput={handleNaturalLanguageInput}
                preselectedTags={hfData.currentIndex === 0 ? preselectedExperienceTags : []}
                preselectedExplanation={hfData.currentIndex === 0 ? preselectedExplanation : ''}
                isLoadingPreselection={hfData.currentIndex === 0 ? isLoadingPreselection : false}
                userContext={userContext}
                directInputValue={hardFilterDirectInputs[hfData.question.id] || ''}
                onDirectInputChange={(value) => {
                  const questionId = hfData.question.id;
                  setHardFilterDirectInputs(prev => ({ ...prev, [questionId]: value }));
                  // 값이 변경되면 해당 질문의 등록 상태 해제
                  if (hardFilterDirectInputRegistered[questionId]) {
                    setHardFilterDirectInputRegistered(prev => ({ ...prev, [questionId]: false }));
                  }
                }}
                isDirectInputRegistered={hardFilterDirectInputRegistered[hfData.question.id] || false}
                onDirectInputRegister={(value) => {
                  const questionId = hfData.question.id;
                  setHardFilterDirectInputs(prev => ({ ...prev, [questionId]: value }));
                  setHardFilterDirectInputRegistered(prev => ({ ...prev, [questionId]: true }));
                  // 로깅: 하드필터 직접 입력 등록
                  logDirectInputRegister(categoryKey, categoryName, 'hard_filter', value, questionId, 1);
                }}
              />
            </div>
          );

        case 'checkpoint':
          const checkpointData = message.componentData as CheckpointData & { isLoading?: boolean };
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                currentStep > 2 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <CheckpointVisual
                data={checkpointData}
                isLoading={checkpointData.isLoading}
              />
            </div>
          );

        case 'balance-carousel':
          const carouselData = message.componentData as { questions: BalanceQuestion[] };
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                currentStep > 3 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <BalanceGameCarousel
                ref={balanceGameRef}
                questions={carouselData.questions}
                onComplete={handleBalanceGameComplete}
                onStateChange={setBalanceGameState}
                onSelectionMade={(params) => {
                  logV2BalanceSelection(
                    categoryKey,
                    categoryName,
                    params.questionId,
                    params.questionIndex,
                    params.totalQuestions,
                    params.selectedOption,
                    params.optionALabel,
                    params.optionBLabel,
                    params.ruleKey
                  );
                }}
                showAIHelper={true}
                category={categoryKey}
                categoryName={categoryName}
                userSelections={allUserSelections}
                onNaturalLanguageInput={handleNaturalLanguageInput}
              />
            </div>
          );

        case 'negative-filter':
          return (
            <div
              key={message.id}
              data-message-id={message.id}
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
                onToggleWithLabel={(ruleKey, label, isSelected, totalSelected) => {
                  logV2NegativeToggle(categoryKey, categoryName, ruleKey, label, isSelected, totalSelected);
                }}
                showAIHelper={true}
                category={categoryKey}
                categoryName={categoryName}
                userSelections={allUserSelections}
                directInputValue={negativeDirectInput}
                onDirectInputChange={(value) => {
                  setNegativeDirectInput(value);
                  // 값이 변경되면 등록 상태 해제
                  if (isNegativeDirectInputRegistered) {
                    setIsNegativeDirectInputRegistered(false);
                  }
                }}
                isDirectInputRegistered={isNegativeDirectInputRegistered}
                onDirectInputRegister={(value) => {
                  setNegativeDirectInput(value);
                  setIsNegativeDirectInputRegistered(true);
                  // 로깅: 단점 필터 직접 입력 등록
                  logDirectInputRegister(categoryKey, categoryName, 'negative_filter', value, 'negative_filter', 4);
                }}
              />
            </div>
          );

        case 'budget-slider':
          const budgetRange = CATEGORY_BUDGET_RANGES[categoryKey] || { min: 10000, max: 500000, step: 10000 };
          return (
            <div
              key={message.id}
              data-message-id={message.id}
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
                onDirectInput={(min, max, productsInRange) => {
                  logV2BudgetChanged(categoryKey, categoryName, min, max, true, productsInRange);
                }}
                showAIHelper={true}
                category={categoryKey}
                categoryName={categoryName}
                userSelections={allUserSelections}
              />
            </div>
          );

        case 'result-cards':
          const resultData = message.componentData as {
            products?: ScoredProduct[];
            categoryName?: string;
            categoryKey?: string;
            selectionReason?: string;
            analysisTimeline?: AnalysisTimeline;
          } | undefined;
          return (
            <div key={message.id} data-message-id={message.id}>
              <ResultCards
                products={resultData?.products || scoredProducts}
                categoryName={resultData?.categoryName || categoryName}
                categoryKey={resultData?.categoryKey || categoryKey}
                selectionReason={resultData?.selectionReason || selectionReason}
                analysisTimeline={resultData?.analysisTimeline || analysisTimeline || undefined}
                userContext={{
                  hardFilterAnswers: hardFilterAnswers,
                  balanceSelections: Array.from(balanceSelections),
                  negativeSelections: negativeSelections,
                  balanceLabels: balanceLabels,
                  negativeLabels: negativeLabels,
                  hardFilterLabels: hardFilterLabels,
                  hardFilterDefinitions: hardFilterDefinitions,
                  budget: budget,
                  hardFilterConfig: hardFilterConfig?.questions ? {
                    questions: hardFilterConfig.questions.map(q => ({
                      id: q.id,
                      type: q.type,
                      question: q.question,
                      options: q.options.map(opt => ({
                        ...opt,
                        id: opt.value,
                        text: opt.displayLabel || opt.label,
                      })),
                    }))
                  } : undefined, // 질문 타입 정보 포함
                  initialContext: userContext || undefined,  // 사용자가 처음 입력한 자연어 상황
                }}
                onModalOpenChange={setIsProductModalOpen}
                // 찜하기 기능 - 나중에 사용할 수 있도록 임시 숨김: onViewFavorites={() => setShowFavoritesModal(true)}
                onRestrictToBudget={handleRestrictToBudget}
              />
            </div>
          );

        case 'loading-text':
          const loadingData = message.componentData as { text: string };
          return (
            <div key={message.id} data-message-id={message.id} className="w-full py-2">
              <div className="w-full flex justify-start">
                <p className="px-1 py-1 text-base font-medium text-gray-600 shimmer-text">
                  {loadingData?.text || '로딩 중...'}
                </p>
              </div>
            </div>
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
    if (isTransitioning) return;
    setIsTransitioning(true);

    if (currentHardFilterIndex > 0) {
      const prevIndex = currentHardFilterIndex - 1;

      // Log step back within hard filters
      logV2StepBack(categoryKey, categoryName, 1, 1);

      setCurrentHardFilterIndex(prevIndex);

      // 이전 hard-filter 메시지 ID를 찾아서 저장
      let targetMsgId: string | undefined;

      // Remove the current question message from messages
      setMessages(prev => {
        const filtered = prev.filter(msg => {
          if (msg.componentType === 'hard-filter') {
            const hfData = msg.componentData as { currentIndex: number };
            return hfData.currentIndex < currentHardFilterIndex;
          }
          return true;
        });
        // 이전 hard-filter 메시지 찾기
        const prevMsg = filtered.findLast(msg => msg.componentType === 'hard-filter');
        targetMsgId = prevMsg?.id;
        return filtered;
      });

      // DOM 업데이트 후 해당 메시지로 스크롤
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (targetMsgId) {
            scrollToMessage(targetMsgId);
          }
          setIsTransitioning(false);
        });
      });
    } else {
      // Go back to step -1 (ContextInput)
      logV2StepBack(categoryKey, categoryName, 1, -1);

      setCurrentStep(-1);
      setCurrentHardFilterIndex(0);

      // Clear all messages (ContextInput만 남기고 전부 제거)
      setMessages([]);

      // hasTriggeredGuideRef 리셋 (다시 시작할 때 guide cards 트리거 가능하도록)
      hasTriggeredGuideRef.current = false;

      // DOM 업데이트 후 맨 위로 스크롤
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          setIsTransitioning(false);
        });
      });
    }
  }, [isTransitioning, currentHardFilterIndex, categoryKey, categoryName, scrollToMessage]);

  const handleGoToStep0 = useCallback(() => {
    logV2StepBack(categoryKey, categoryName, currentStep, 0);

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
  }, [requiresSubCategory, categoryKey, categoryName, currentStep]);

  // ===================================================
  // Bottom Button
  // ===================================================

  const renderBottomButton = () => {
    // Step -1: ContextInput이 자체적으로 버튼을 가지고 있으므로 하단 버튼 숨김
    if (currentStep === -1) {
      return null;
    }

    const questions = hardFilterConfig?.questions || [];
    // 다중 선택: 모든 질문에 최소 1개 이상 답변했는지 확인
    const allQuestionsAnswered = questions.length > 0 &&
      questions.every(q => hardFilterAnswers[q.id]?.length > 0);

    // Step 0: 다음 (하위 카테고리 선택 완료 후에만 표시)
    if (currentStep === 0 && !showScanAnimation) {
      // 가이드 카드가 활성화된 상태면 하단 버튼 숨김 (GuideCards의 "시작하기" 버튼 사용)
      const isGuideCardsActive = !showSubCategorySelector && (!requiresSubCategory || selectedSubCategoryCodes.length === 0);
      if (isGuideCardsActive) {
        return null;
      }

      // 하위 카테고리 필요하지만 아직 선택 안 됐으면 버튼 숨김
      if (requiresSubCategory && selectedSubCategoryCodes.length === 0) {
        return null;
      }

      // 하위 카테고리 선택 완료 후 "다음" 버튼 표시
      return (
        <motion.button
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSubCategoryConfirm}
          disabled={isTransitioning}
          className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
            isTransitioning
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {isTransitioning ? '로딩 중...' : '다음'}
        </motion.button>
      );
    }

    // Step 1: Hard Filter - prev/next navigation (질문별 진행)
    if (currentStep === 1) {
      const questions = hardFilterConfig?.questions || [];
      const currentQuestion = questions[currentHardFilterIndex];
      const currentQuestionAnswered = currentQuestion &&
        hardFilterAnswers[currentQuestion.id]?.length > 0;
      // 현재 질문에 대해 직접 입력이 등록되었으면 옵션 미선택이어도 다음 진행 가능
      const currentQuestionDirectInputRegistered = currentQuestion &&
        hardFilterDirectInputRegistered[currentQuestion.id];
      // 하위 카테고리 선택 중이면 선택해야 다음 진행 가능
      const subCategoryPending = showSubCategorySelector && selectedSubCategoryCodes.length === 0;
      const canProceed = (currentQuestionAnswered || currentQuestionDirectInputRegistered) && !subCategoryPending;
      const isLastQuestion = currentHardFilterIndex >= questions.length - 1;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleGoToPreviousHardFilter}
            disabled={isTransitioning}
            className={`flex-[2] h-14 rounded-2xl font-semibold text-base transition-all ${
              isTransitioning
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleHardFilterNext}
            disabled={!canProceed || isTransitioning}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              canProceed && !isTransitioning
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLastQuestion ? '조건 선택 완료' : '다음'}
          </motion.button>
        </div>
      );
    }

    // Step 2: 계속하기 with prev/next
    if (currentStep === 2) {
      // 체크포인트 로딩 상태 확인
      const checkpointMsg = messages.find(msg => msg.componentType === 'checkpoint');
      const isCheckpointLoading = checkpointMsg?.componentData
        ? Boolean((checkpointMsg.componentData as { isLoading?: boolean }).isLoading)
        : false;
      const isStep2Disabled = isTransitioning || isCheckpointLoading;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            disabled={isStep2Disabled}
            onClick={() => {
              if (isStep2Disabled) return;
              logV2StepBack(categoryKey, categoryName, 2, 1);
              setCurrentStep(1);

              // 마지막 hard-filter 메시지 ID 찾기
              let targetMsgId: string | undefined;

              // Remove checkpoint related messages
              setMessages(prev => {
                const filtered = prev.filter(msg =>
                  msg.componentType !== 'checkpoint' &&
                  msg.componentType !== 'natural-input' &&
                  !(msg.stepTag === '2/5')
                );
                // 마지막 hard-filter 메시지 찾기
                const lastHardFilter = filtered.findLast(msg => msg.componentType === 'hard-filter');
                targetMsgId = lastHardFilter?.id;
                return filtered;
              });

              // DOM 업데이트 후 해당 메시지로 스크롤
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (targetMsgId) {
                    scrollToMessage(targetMsgId);
                  }
                });
              });
            }}
            className={`flex-[2] h-14 rounded-2xl font-semibold text-base transition-all ${
              isStep2Disabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleStartBalanceGame}
            disabled={isStep2Disabled}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isStep2Disabled
                ? 'bg-purple-300 text-purple-100 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            다음
          </motion.button>
        </div>
      );
    }

    // Step 3: 밸런스 게임 (AB 테스트) with prev/next
    if (currentStep === 3) {
      const isLastBalanceQuestion = !balanceGameState.canGoNext;
      // 마지막 질문이 아니면 항상 비활성화 (자동 넘어감 기능 사용)
      // 마지막 질문에서는 모든 질문이 답변되었을 때만 활성화 (전환 중 깜빡임 방지)
      const isNextDisabled = !isLastBalanceQuestion || !balanceGameState.allAnswered || isTransitioning;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            disabled={isTransitioning}
            onClick={() => {
              if (isTransitioning) return;
              // 밸런스 게임 내에서 이전 질문이 있으면 그리로 이동
              if (balanceGameState.canGoPrevious) {
                balanceGameRef.current?.goToPrevious();
              } else {
                // 첫 질문이면 Step 2로 돌아가기
                logV2StepBack(categoryKey, categoryName, 3, 2);
                setCurrentStep(2);

                // checkpoint 메시지 ID 찾기
                let targetMsgId: string | undefined;

                setMessages(prev => {
                  const filtered = prev.filter(msg =>
                    msg.componentType !== 'balance-carousel' &&
                    !(msg.stepTag === '3/5')
                  );
                  // checkpoint 메시지 찾기
                  const checkpointMsg = filtered.findLast(msg => msg.componentType === 'checkpoint');
                  targetMsgId = checkpointMsg?.id;
                  return filtered;
                });
                setBalanceGameState({ selectionsCount: 0, allAnswered: false, currentSelections: new Set(), currentIndex: 0, canGoPrevious: false, canGoNext: false, totalQuestions: 0, currentQuestionAnswered: false });

                // DOM 업데이트 후 해당 메시지로 스크롤
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    if (targetMsgId) {
                      scrollToMessage(targetMsgId);
                    }
                  });
                });
              }
            }}
            className={`flex-[2] h-14 rounded-2xl font-semibold text-base transition-all ${
              isTransitioning
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              if (isTransitioning) return;
              // 마지막 질문이면 완료 처리, 아니면 다음 질문으로
              if (isLastBalanceQuestion) {
                handleBalanceGameComplete(balanceGameState.currentSelections);
              } else {
                balanceGameRef.current?.goToNext();
              }
            }}
            disabled={isNextDisabled}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isNextDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {isLastBalanceQuestion
              ? (balanceGameState.selectionsCount > 0 ? `완료 (${balanceGameState.selectionsCount}개 선택됨)` : '넘어가기')
              : '다음'}
          </motion.button>
        </div>
      );
    }

    // Step 4: 단점 필터 완료 with prev/next
    if (currentStep === 4) {
      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            disabled={isTransitioning}
            onClick={() => {
              if (isTransitioning) return;
              logV2StepBack(categoryKey, categoryName, 4, 3);
              setCurrentStep(3);

              // balance-carousel 메시지 ID 찾기
              let targetMsgId: string | undefined;

              // Remove negative filter related messages
              setMessages(prev => {
                const filtered = prev.filter(msg =>
                  msg.componentType !== 'negative-filter' &&
                  !(msg.stepTag === '4/5')
                );
                // balance-carousel 메시지 찾기
                const balanceMsg = filtered.findLast(msg => msg.componentType === 'balance-carousel');
                targetMsgId = balanceMsg?.id;
                return filtered;
              });

              // DOM 업데이트 후 해당 메시지로 스크롤
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (targetMsgId) {
                    scrollToMessage(targetMsgId);
                  }
                });
              });
            }}
            className={`flex-[2] h-14 rounded-2xl font-semibold text-base transition-all ${
              isTransitioning
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleNegativeComplete}
            disabled={isTransitioning}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isTransitioning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {negativeSelections.length > 0 || isNegativeDirectInputRegistered
              ? `${negativeSelections.length + (isNegativeDirectInputRegistered ? 1 : 0)}개 제외하고 다음`
              : '넘어가기'}
          </motion.button>
        </div>
      );
    }

    // Step 5: 추천받기 with prev/next
    if (currentStep === 5 && scoredProducts.length === 0) {
      // 로딩 중(분석 중)일 때는 버튼 영역 아예 숨김
      if (isCalculating) {
        return null;
      }

      // 예산 범위 내 상품 개수 계산
      const budgetProductsCount = filteredProducts.filter(p => {
        const effectivePrice = p.lowestPrice ?? p.price;
        if (!effectivePrice) return true;
        return effectivePrice >= budget.min && effectivePrice <= budget.max;
      }).length;
      const isTooFewProducts = budgetProductsCount < 3;

      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              disabled={isTransitioning}
              onClick={() => {
                if (isTransitioning) return;
                logV2StepBack(categoryKey, categoryName, 5, 4);
                setCurrentStep(4);

                // negative-filter 메시지 ID 찾기
                let targetMsgId: string | undefined;

                // Remove budget slider related messages
                setMessages(prev => {
                  const filtered = prev.filter(msg =>
                    msg.componentType !== 'budget-slider' &&
                    !(msg.stepTag === '5/5')
                  );
                  // negative-filter 메시지 찾기
                  const negativeMsg = filtered.findLast(msg => msg.componentType === 'negative-filter');
                  targetMsgId = negativeMsg?.id;
                  return filtered;
                });

                // DOM 업데이트 후 해당 메시지로 스크롤
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    if (targetMsgId) {
                      scrollToMessage(targetMsgId);
                    }
                  });
                });
              }}
              className={`flex-[2] h-14 rounded-2xl font-semibold text-base transition-all ${
                isTransitioning
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              이전
            </motion.button>
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleGetRecommendation(false)}
              disabled={isTransitioning || isTooFewProducts}
              className={`flex-[3] h-14 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-200/50 ${
                isTransitioning || isTooFewProducts
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-purple-300 hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
              </svg>
              <span>추천받기</span>
            </motion.button>
          </div>
          {/* 상품 부족 경고 */}
          {isTooFewProducts && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-red-500 font-medium"
            >
              조건에 맞는 상품이 {budgetProductsCount}개뿐이에요. 예산 범위를 넓혀보세요!
            </motion.p>
          )}
        </div>
      );
    }

    // Step 5: 결과 후 - 다시 추천받기 버튼은 플로팅으로 표시
    if (currentStep === 5 && scoredProducts.length > 0) {
      return null;
    }

    return null;
  };

  // ===================================================
  // Loading State
  // ===================================================

  if (isLoading) {
    return (
      <div className="h-dvh overflow-hidden bg-gray-100 flex justify-center">
        <div className="h-full w-full max-w-[480px] bg-white flex items-center justify-center">
          <div className="w-full py-8 flex flex-col items-center">
            {/* 로딩 비디오 - 정사각형, 작게 */}
            <div className="w-[100px] h-[100px] rounded-2xl overflow-hidden bg-white mb-6">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              >
                <source src="/animations/recommendloading.MP4" type="video/mp4" />
              </video>
            </div>

            {/* 로딩 메시지 */}
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-gray-500 text-center">
                데이터를 불러오는 중...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===================================================
  // Main Render
  // ===================================================

  return (
    <div className="h-dvh overflow-hidden bg-gray-100 flex justify-center">
      <div className="h-full w-full max-w-[480px] bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
          <div className="px-5 py-3 flex items-center relative">
            {/* 왼쪽: 뒤로가기 버튼 */}
            <button
              onClick={() => setShowBackModal(true)}
              className="text-gray-600 hover:text-gray-900 z-10"
            >
              <CaretLeft size={24} weight="bold" />
            </button>
            {/* 중앙: 카테고리 이름 (항상 정중앙) */}
            <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-gray-900">
              {categoryName} 추천
            </h1>
            {/* 오른쪽: 피드백 버튼 (추천 완료 후에만 표시) */}
            <div className="ml-auto z-10">
              {currentStep === 5 && scoredProducts.length > 0 ? (
                <button
                  onClick={handleFeedbackClick}
                  className="text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm"
                >
                  피드백 보내기
                </button>
              ) : (
                <div className="w-7" />
              )}
            </div>
          </div>

          {/* Progress Bar - Step 0(로딩/가이드카드)과 결과 화면에서는 숨김 */}
          {currentStep >= 1 && !(currentStep === 5 && scoredProducts.length > 0) && (
            <div className="px-5 pb-3">
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#5F0080] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(currentStep / 5) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-6 bg-white"
          style={{ paddingBottom: '102px' }}
        >
          {/* Step -1: Context Input - AnimatePresence 밖으로 (완료 후에도 유지) */}
          {/* 세션 복원 시에는 숨김 */}
          {currentStep >= -1 && !isRestoredFromStorage && (
            <div className={`mb-4 transition-all duration-300 ${currentStep > -1 ? 'opacity-50 pointer-events-none' : ''}`}>
              <ContextInput
                category={categoryKey}
                categoryName={categoryName}
                onComplete={handleContextComplete}
                isCompleted={currentStep > -1}
                submittedText={userContext}
              />
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Step 0: Scan Animation */}
            {currentStep === 0 && showScanAnimation && (
              <ScanAnimation
                categoryName={categoryName}
                onComplete={handleScanComplete}
              />
            )}
          </AnimatePresence>

          {/* Messages */}
          {currentStep > -1 && (
            <div className="space-y-4">
              {messages.map(renderMessage)}
            </div>
          )}

          {/* Calculating indicator - 로딩 애니메이션 */}
          {isCalculating && (
            <LoadingAnimation
              progress={progress}
              timelineSteps={timelineSteps}
            />
          )}

          {/* 스페이서: 새 컴포넌트가 헤더 바로 아래로 스크롤될 수 있는 여백 (추천 완료 후 숨김) */}
          {scoredProducts.length === 0 && (
            <div className="min-h-[calc(100dvh-220px)]" aria-hidden="true" />
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Bottom Button (버튼이 있을 때만 컨테이너 표시) */}
        {(() => {
          const bottomButton = renderBottomButton();
          if (!bottomButton) return null;
          return (
            <div
              className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40"
              style={{ maxWidth: '480px', margin: '0 auto' }}
            >
              {bottomButton}
            </div>
          );
        })()}

        {/* 다시 추천받기 플로팅 버튼 (Step 5에서만 표시, 로딩 중 숨김) */}
        {currentStep === 5 && scoredProducts.length > 0 && !isCalculating && (
          <>
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
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
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
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100]"
                  onClick={() => setShowReRecommendModal(false)}
                />
              )}
            </AnimatePresence>

            {/* 모달 옵션 버튼들 */}
            <AnimatePresence>
              {showReRecommendModal && (
                <div className="fixed bottom-24 left-0 right-0 flex flex-col items-center gap-3 z-[110] px-4" style={{ maxWidth: '480px', margin: '0 auto' }}>
                  <motion.div
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex flex-col gap-3 w-full"
                  >
                    {/* 다른 카테고리 추천받기 버튼 */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        logV2ReRecommendDifferentCategory(categoryKey, categoryName);
                        router.push('/categories-v2');
                      }}
                      className="w-full py-4 px-6 bg-white hover:bg-gray-50 text-gray-900 rounded-2xl shadow-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <span>다른 카테고리 추천받기</span>
                    </motion.button>

                    {/* 현재 카테고리 다시 추천받기 버튼 */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        // 로깅
                        logV2ReRecommendSameCategory(categoryKey, categoryName);

                        // sessionStorage 클리어 (복원 방지)
                        sessionStorage.removeItem(`v2_result_${categoryKey}`);
                        setIsRestoredFromStorage(false);

                        // 상태 초기화 - Step -1 (자연어 입력)부터 다시 시작
                        setCurrentStep(-1);
                        setUserContext(null);  // 자연어 입력 초기화
                        setCurrentHardFilterIndex(0);
                        setHardFilterAnswers({});
                        setBalanceSelections(new Set());
                        setNegativeSelections([]);
                        setScoredProducts([]);
                        setConditionSummary([]);
                        setMessages([]);
                        setShowReRecommendModal(false);

                        // useEffect 중복 호출 방지 (sessionStorage 복원 후 다시 추천받기 시)
                        hasTriggeredGuideRef.current = false;  // Step -1부터 시작하므로 리셋

                        if (requiresSubCategory) {
                          setSelectedSubCategoryCodes([]);
                          setShowSubCategorySelector(false);
                        }

                        // DOM 업데이트 후 스크롤 맨 위로 초기화
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          });
                        });
                      }}
                      className="w-full py-4 px-6 bg-white hover:bg-gray-50 text-gray-900 rounded-2xl shadow-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{categoryName} 다시 추천받기</span>
                    </motion.button>

                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 메인 버튼 - 다시 추천받기 / 취소 (흰색 컨테이너 + 풀 width) */}
            <div
              className={`fixed bottom-0 left-0 right-0 px-4 py-4 z-[110] transition-colors ${
                showReRecommendModal ? 'bg-transparent' : 'bg-white border-t border-gray-200'
              }`}
              style={{ maxWidth: '480px', margin: '0 auto' }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.8 }}
                className="w-full"
              >
                {showReRecommendModal ? (
                  /* 취소 버튼 */
                  <button
                    onClick={() => setShowReRecommendModal(false)}
                    className="w-full h-14 rounded-2xl font-semibold text-base bg-gray-900 text-white hover:bg-gray-800 transition-all"
                  >
                    취소
                  </button>
                ) : (
                  /* 다시 추천받기 버튼 */
                  <button
                    onClick={() => {
                      logV2ReRecommendModalOpened(categoryKey, categoryName);
                      setShowReRecommendModal(true);
                    }}
                    className="w-full h-14 rounded-2xl font-semibold text-base text-white bg-purple-600 hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                    </svg>
                    <span>다시 추천받기</span>
                  </button>
                )}
              </motion.div>
            </div>
          </>
        )}

        {/* Back Modal */}
        <AnimatePresence>
          {showBackModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[200]"
                onClick={() => setShowBackModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 0 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 0 }}
                className="fixed inset-0 flex items-center justify-center z-[210] px-4"
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
                      className="flex-1 px-4 py-3 bg-purple-600 text-white font-semibold rounded-xl"
                    >
                      돌아가기
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Favorites Modal - 나중에 사용할 수 있도록 임시 숨김 */}
        {/* <AnimatePresence>
          {showFavoritesModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="fixed inset-0 bg-black/50 z-[300]"
                onClick={() => setShowFavoritesModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="fixed inset-0 z-[310] bg-white overflow-y-auto"
                style={{ maxWidth: '480px', margin: '0 auto' }}
              >
                <FavoritesView onClose={() => setShowFavoritesModal(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence> */}
      </div>
    </div>
  );
}
