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
  GuideCardsData,
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
} from '@/components/recommend-v2';
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
  logV2HardFilterCustomInput,
  logV2HardFilterCompleted,
  logV2CheckpointViewed,
  logV2BalanceSelection,
  logV2BalanceCompleted,
  logV2NegativeToggle,
  logV2NegativeCompleted,
  logV2BudgetPresetClicked,
  logV2BudgetChanged,
  logV2RecommendationRequested,
  logV2RecommendationReceived,
  logV2StepBack,
  logGuideCardTabSelection,
  logGuideCardToggle,
  logV2ReRecommendModalOpened,
  logV2ReRecommendSameCategory,
  logV2ReRecommendDifferentCategory,
} from '@/lib/logging/clientLogger';

// Favorites
import { FavoritesView } from '@/components/FavoritesView';

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
  // 서브카테고리 선택 후에도 개수 표시용으로 초기 전체 제품 유지
  const [allCategoryProducts, setAllCategoryProducts] = useState<ProductItem[]>([]);

  // Dynamic questions
  const [dynamicBalanceQuestions, setDynamicBalanceQuestions] = useState<BalanceQuestion[]>([]);
  const [dynamicNegativeOptions, setDynamicNegativeOptions] = useState<NegativeFilterOption[]>([]);

  // User selections (다중 선택 지원)
  const [hardFilterAnswers, setHardFilterAnswers] = useState<Record<string, string[]>>({});
  const [currentHardFilterIndex, setCurrentHardFilterIndex] = useState(0);
  // 인기 하드필터 옵션 (통계 기반)
  const [popularHardFilterOptions, setPopularHardFilterOptions] = useState<Array<{ questionId: string; value: string; percentage: number; isPopular: boolean }>>([]);
  const [balanceSelections, setBalanceSelections] = useState<Set<string>>(new Set());
  const [currentBalanceIndex, setCurrentBalanceIndex] = useState(0);
  const [negativeSelections, setNegativeSelections] = useState<string[]>([]);
  const [budget, setBudget] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  // Condition summary (for result page)
  const [conditionSummary, setConditionSummary] = useState<Array<{ label: string; value: string }>>([]);

  // Results
  const [scoredProducts, setScoredProducts] = useState<ScoredProduct[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // 버튼 중복 클릭 방지
  const [progress, setProgress] = useState(0); // 0~100 프로그레스
  const [thinkingIndex, setThinkingIndex] = useState(0); // thinking 메시지 인덱스
  const [selectionReason, setSelectionReason] = useState<string>('');

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
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);

  // Typing animation state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // Sub-category state (for stroller, car_seat, diaper)
  const [requiresSubCategory, setRequiresSubCategory] = useState(false);
  const [subCategoryConfig, setSubCategoryConfig] = useState<SubCategoryConfig | null>(null);
  const [selectedSubCategoryCode, setSelectedSubCategoryCode] = useState<string | null>(null);
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

  // 프로그레스 및 thinking 메시지 관리
  useEffect(() => {
    if (isCalculating) {
      setProgress(0);
      setThinkingIndex(0);
      let tickCount = 0;

      const interval = setInterval(() => {
        tickCount++;
        // 프로그레스: 0.1초(10틱)마다 1% 증가, 95%까지 (API 완료 시 100%로 점프)
        if (tickCount % 10 === 0) {
          setProgress((prev: number) => {
            if (prev < 95) {
              return prev + 1;
            }
            return prev;
          });
        }
        // thinking 메시지: 1.5초(150틱)마다 변경
        if (tickCount % 150 === 0) {
          setThinkingIndex((prev: number) => prev + 1);
        }
      }, 10); // 0.01초마다 (10ms)
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

        // Load products - 모든 카테고리에서 초기 로드 필요
        // (sub-category 카테고리도 하위 카테고리별 개수 표시를 위해 필요)
        console.log('📦 [Products] Loading for:', categoryKey);
        const productsRes = await fetch('/api/v2/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryKey, limit: 500 }),
        });
        const productsJson = await productsRes.json();
        console.log('📦 [Products] Response:', productsJson.success, 'count:', productsJson.data?.count);

        if (productsJson.success && productsJson.data?.products) {
          setProducts(productsJson.data.products);
          setFilteredProducts(productsJson.data.products);
          setAllCategoryProducts(productsJson.data.products); // 서브카테고리 개수 표시용
          console.log('📦 [Products] Loaded:', productsJson.data.products.length);
        } else {
          console.error('📦 [Products] Failed:', productsJson.error);
        }

        // Set default budget range
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
  }, [hardFilterConfig, categoryName, requiresSubCategory, subCategoryConfig, addMessage]);

  // ===================================================
  // Auto-trigger guide cards when data is ready (스캔 애니메이션 스킵)
  // ===================================================
  const hasTriggeredGuideRef = useRef(false);
  useEffect(() => {
    // 이미 트리거됐거나, 로딩 중이거나, 설정이 없으면 스킵
    if (hasTriggeredGuideRef.current || isLoading || !hardFilterConfig) return;
    // sessionStorage에서 복원된 경우 스킵 (이미 결과 화면)
    if (isRestoredFromStorage) return;

    hasTriggeredGuideRef.current = true;
    handleScanComplete();
  }, [isLoading, hardFilterConfig, isRestoredFromStorage, handleScanComplete]);

  // ===================================================
  // Sub-Category Selection Handler (분리: 선택만 / 확정 후 진행)
  // ===================================================

  // 하위 카테고리 클릭 시 선택만 (자동 진행 없음)
  const handleSubCategoryClick = useCallback((code: string) => {
    setSelectedSubCategoryCode(code);
    // 선택만 하고 다음 단계로 진행하지 않음
  }, []);

  // "전부 좋아요" 클릭 시 - 전체 선택 (필터링 없이 진행)
  const handleSubCategorySelectAll = useCallback(() => {
    setSelectedSubCategoryCode('__all__');
  }, []);

  // 하위 카테고리 확정 후 다음 단계로 진행
  const handleSubCategoryConfirm = useCallback(async () => {
    if (!selectedSubCategoryCode || isTransitioning) return;
    setIsTransitioning(true);

    const code = selectedSubCategoryCode;
    const isSelectAll = code === '__all__';
    setShowSubCategorySelector(false);

    // Find the selected sub-category name
    const selectedSub = subCategoryConfig?.sub_categories.find(s => s.code === code);

    // Log sub-category selection
    if (isSelectAll) {
      logV2SubCategorySelected(categoryKey, categoryName, '__all__', '전체');
    } else if (selectedSub) {
      logV2SubCategorySelected(categoryKey, categoryName, code, selectedSub.name);
    }
    const filterBy = subCategoryConfig?.filter_by || 'category_code';
    const filterKey = subCategoryConfig?.filter_key;

    // Store the loaded config and products for auto-proceed
    let loadedHardFilterConfig: HardFilterConfig | null = null;
    let loadedProducts: ProductItem[] = [];

    // Reload hard filters for this specific sub-category
    try {
      // "전부 좋아요" 선택 시 필터 없이 전체 로드
      const rulesUrl = isSelectAll
        ? `/api/v2/rules/${categoryKey}`
        : filterBy === 'category_code'
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

      // "전부 좋아요" 선택 시 이미 로드된 전체 제품 사용
      if (isSelectAll) {
        loadedProducts = allCategoryProducts;
        setProducts(loadedProducts);
        setFilteredProducts(loadedProducts);
        console.log('📦 All products loaded (no subcategory filter):', loadedProducts.length);
      } else {
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
          loadedProducts = productsJson.data.products;
          setProducts(loadedProducts);
          setFilteredProducts(loadedProducts);
          console.log('📦 Products loaded for sub-category:', loadedProducts.length);
        }
      }
    } catch (error) {
      console.error('Sub-category load error:', error);
      setIsTransitioning(false);
      return;
    }

    // Auto-proceed to hard filters after sub-category selection
    const questions = loadedHardFilterConfig?.questions || [];

    if (questions.length > 0) {
      // Hard filter questions exist - show them
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
      // 약간의 딜레이 후 handleHardFiltersComplete 호출 (UI 업데이트 보장)
      // ref를 사용하여 순환 의존성 해결
      setTimeout(() => {
        handleHardFiltersCompleteRef.current?.({}, loadedProducts);
        setIsTransitioning(false);
      }, 300);
    }
  }, [selectedSubCategoryCode, isTransitioning, categoryKey, categoryName, subCategoryConfig, addMessage, scrollToMessage, allCategoryProducts]);

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

  const handleHardFiltersComplete = useCallback(async (
    answers: Record<string, string[]>,
    productsOverride?: ProductItem[]  // 선택적: state 대신 직접 전달된 products 사용
  ) => {
    setCurrentStep(2);

    // Log hard filter completion
    const totalQuestions = hardFilterConfig?.questions?.length || 0;
    logV2HardFilterCompleted(categoryKey, categoryName, totalQuestions, productsOverride?.length || productsRef.current.length);

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

    // 로딩 상태 메시지 추가 (스크롤 없이 그 아래에 렌더링)
    const loadingMsgId = addMessage({
      role: 'system',
      content: '',
      componentType: 'checkpoint',
      componentData: {
        totalProducts: productsToUse.length,
        filteredCount: filtered.length,
        conditions,
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
              isLoading: false,
            } as CheckpointData & { isLoading: boolean },
          }
        : msg
    ));

    // Log checkpoint viewed
    logV2CheckpointViewed(categoryKey, categoryName, filtered.length);

    // Add AI summary message (stepTag 없음 - 위에서 이미 추가됨, 스크롤 없이 그 아래에 렌더링)
    const summaryMessage = aiSummary || `전체 **${productsToUse.length}개** 제품 중 **${filtered.length}개**가 조건에 맞아요.`;
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: summaryMessage,
      }, true);
      // scrollToBottom 제거 - 2/5 stepTag로 이미 스크롤됨
    }, 300);
  }, [hardFilterConfig, logicMap, balanceQuestions, negativeOptions, categoryKey, categoryName, addMessage, scrollToMessage]);

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
  }, [isTransitioning, hardFilterConfig, currentHardFilterIndex, hardFilterAnswers, hardFilterLabels, categoryKey, categoryName, addMessage, scrollToMessage, handleHardFiltersComplete]);

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

    // stepTag 메시지로 스크롤
    const stepMsgId = addMessage({
      role: 'assistant',
      content: '후보들 중에서 최적의 제품을 고르기 위한 질문을 드릴게요. **더 중요한 쪽을 골라주세요!**',
      stepTag: '3/5',
    }, true);
    scrollToMessage(stepMsgId);

    if (dynamicBalanceQuestions.length > 0) {
      setTimeout(() => {
        // 컴포넌트는 스크롤 없이 그 아래에 렌더링
        addMessage({
          role: 'system',
          content: '',
          componentType: 'balance-carousel',
          componentData: {
            questions: dynamicBalanceQuestions,
          },
        });
        setIsTransitioning(false);
      }, 300);
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
  }, [isTransitioning, negativeSelections, negativeLabels, categoryKey, categoryName, addMessage, scrollToMessage]);

  // ===================================================
  // Step 5: Budget & Results
  // ===================================================

  const handleBudgetChange = useCallback((values: { min: number; max: number }) => {
    setBudget(values);
  }, []);

  const handleGetRecommendation = useCallback(async () => {
    setIsCalculating(true);

    // Log recommendation requested
    logV2RecommendationRequested(categoryKey, categoryName, budget.min, budget.max, filteredProducts.length);

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

      // 예산 필터링 (다나와 최저가 우선 사용)
      const budgetFiltered = scored.filter(p => {
        const effectivePrice = p.lowestPrice ?? p.price;
        if (!effectivePrice) return true;
        return effectivePrice >= budget.min && effectivePrice <= budget.max;
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

      // 3단계: 태그 정제 API 호출 (flash-lite로 중복제거, 한글화)
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

      setProgress(100); // 최종 완료
      await new Promise(resolve => setTimeout(resolve, 500)); // 100% 표시를 위한 딜레이

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
          timestamp: Date.now(),
        };
        sessionStorage.setItem(`v2_result_${categoryKey}`, JSON.stringify(savedState));
        console.log('✅ [sessionStorage] Result saved for', categoryKey);
      } catch (e) {
        console.warn('[sessionStorage] Failed to save result:', e);
      }

      // Log recommendation received (with matchedRules as tags)
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
        })),
        finalSelectionReason,
        budgetFiltered.length
      );

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
        },
      });
      scrollToMessage(resultMsgId);
    } catch (error) {
      console.error('Score calculation error:', error);
      addMessage({
        role: 'assistant',
        content: '추천 계산 중 오류가 발생했어요. 다시 시도해주세요.',
      });
    } finally {
      setIsCalculating(false);
    }
  }, [filteredProducts, balanceSelections, negativeSelections, dynamicNegativeOptions, logicMap, budget, categoryName, categoryKey, hardFilterAnswers, addMessage, scrollToMessage]);

  // ===================================================
  // Render Message
  // ===================================================

  const renderMessage = (message: ChatMessage) => {
    if (message.role === 'assistant') {
      return (
        <div key={message.id} data-message-id={message.id} className="scroll-mt-3">
          <AssistantMessage
            content={message.content}
            stepTag={message.stepTag}
            typing={message.typing}
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
                isActive={currentStep === 0 && !showSubCategorySelector && (!requiresSubCategory || !selectedSubCategoryCode)}
                disabled={isTransitioning}
                enableTyping={true}
                onTabChange={(tab, tabLabel) => {
                  logGuideCardTabSelection(categoryKey, categoryName, tab, tabLabel);
                }}
                onToggle={(type, isOpen) => {
                  logGuideCardToggle(categoryKey, categoryName, type, isOpen);
                }}
                onNext={() => {
                  if (isTransitioning) return;
                  setIsTransitioning(true);

                  // 가이드 카드 완료 후 다음 단계로 진행 (스크롤 + 다음 스텝 표시)
                  if (requiresSubCategory && subCategoryConfig && !selectedSubCategoryCode) {
                    // 세부 카테고리 선택이 필요한 경우
                    setShowSubCategorySelector(true);
                    const msgId = addMessage({
                      role: 'system',
                      content: '',
                      componentType: 'sub-category' as ComponentType,
                      componentData: {
                        categoryName: subCategoryConfig.category_name,
                        subCategories: subCategoryConfig.sub_categories,
                        selectedCode: selectedSubCategoryCode,
                      },
                    });
                    setTimeout(() => {
                      scrollToMessage(msgId);
                      setIsTransitioning(false);
                    }, 100);
                  } else if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
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
            selectedCode: string | null;
          };
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                currentStep > 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <SubCategorySelector
                categoryName={subCatData.categoryName}
                subCategories={subCatData.subCategories}
                selectedCode={selectedSubCategoryCode}
                onSelect={handleSubCategoryClick}
                onSelectAll={handleSubCategorySelectAll}
              />
            </div>
          );

        case 'hard-filter':
          const hfData = message.componentData as { question: HardFilterQuestion; currentIndex: number; totalCount: number; selectedValues?: string[] };
          const isPastQuestion = hfData.currentIndex < currentHardFilterIndex;
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`transition-all duration-300 ${
                isPastQuestion ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <HardFilterQuestionComponent
                data={hfData}
                onSelect={handleHardFilterSelect}
                products={products}
                showProductCounts={true}
                onCustomInputSubmit={(questionId, customText) => {
                  logV2HardFilterCustomInput(
                    categoryKey,
                    categoryName,
                    questionId,
                    hfData.question.question,
                    hfData.currentIndex,
                    hfData.totalCount,
                    customText
                  );
                }}
                popularOptions={popularHardFilterOptions}
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
                onPresetClick={(preset, min, max, productsInRange) => {
                  logV2BudgetPresetClicked(categoryKey, categoryName, preset, min, max, productsInRange);
                }}
                onDirectInput={(min, max, productsInRange) => {
                  logV2BudgetChanged(categoryKey, categoryName, min, max, true, productsInRange);
                }}
              />
            </div>
          );

        case 'result-cards':
          const resultData = message.componentData as {
            products?: ScoredProduct[];
            categoryName?: string;
            categoryKey?: string;
            selectionReason?: string;
          } | undefined;
          return (
            <div key={message.id} data-message-id={message.id}>
              <ResultCards
                products={resultData?.products || scoredProducts}
                categoryName={resultData?.categoryName || categoryName}
                categoryKey={resultData?.categoryKey || categoryKey}
                selectionReason={resultData?.selectionReason || selectionReason}
                userContext={{
                  hardFilterAnswers: hardFilterAnswers,
                  balanceSelections: Array.from(balanceSelections),
                  negativeSelections: negativeSelections,
                  balanceLabels: balanceLabels,
                  negativeLabels: negativeLabels,
                  hardFilterLabels: hardFilterLabels,
                  hardFilterDefinitions: hardFilterDefinitions,
                }}
                onModalOpenChange={setIsProductModalOpen}
                onViewFavorites={() => setShowFavoritesModal(true)}
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
      // Go back to step 0 (sub-category or guide)
      logV2StepBack(categoryKey, categoryName, 1, 0);

      setCurrentStep(0);
      setCurrentHardFilterIndex(0);

      // guide-cards 메시지 ID 찾기
      let targetMsgId: string | undefined;

      // Clear messages after guide/sub-category
      setMessages(prev => {
        const filtered = prev.filter(msg =>
          msg.componentType === 'guide-cards' ||
          msg.componentType === 'sub-category' ||
          (msg.role === 'assistant' && !msg.stepTag)
        );
        // guide-cards 메시지 찾기
        const guideMsg = filtered.find(msg => msg.componentType === 'guide-cards');
        targetMsgId = guideMsg?.id;
        return filtered;
      });

      // DOM 업데이트 후 해당 메시지로 스크롤
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (targetMsgId) {
            scrollToMessage(targetMsgId);
          } else {
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }
          setIsTransitioning(false);
        });
      });

      if (requiresSubCategory) {
        setShowSubCategorySelector(true);
      }
    }
  }, [isTransitioning, currentHardFilterIndex, requiresSubCategory, categoryKey, categoryName, scrollToMessage]);

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
    const questions = hardFilterConfig?.questions || [];
    // 다중 선택: 모든 질문에 최소 1개 이상 답변했는지 확인
    const allQuestionsAnswered = questions.length > 0 &&
      questions.every(q => hardFilterAnswers[q.id]?.length > 0);

    // Step 0: 다음 (하위 카테고리 선택 완료 후에만 표시)
    if (currentStep === 0 && !showScanAnimation) {
      // 가이드 카드가 활성화된 상태면 하단 버튼 숨김 (GuideCards의 "시작하기" 버튼 사용)
      const isGuideCardsActive = !showSubCategorySelector && (!requiresSubCategory || !selectedSubCategoryCode);
      if (isGuideCardsActive) {
        return null;
      }

      // 하위 카테고리 필요하지만 아직 선택 안 됐으면 버튼 숨김
      if (requiresSubCategory && !selectedSubCategoryCode) {
        return null;
      }

      // 하위 카테고리 선택 완료 후 "다음" 버튼 표시
      return (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSubCategoryConfirm}
          disabled={isTransitioning}
          className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
            isTransitioning
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
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
      const isLastQuestion = currentHardFilterIndex >= questions.length - 1;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleHardFilterNext}
            disabled={!currentQuestionAnswered || isTransitioning}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              currentQuestionAnswered && !isTransitioning
                ? 'bg-blue-500 text-white hover:bg-blue-600'
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
            initial={{ opacity: 0, y: 20 }}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleStartBalanceGame}
            disabled={isStep2Disabled}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isStep2Disabled
                ? 'bg-emerald-300 text-emerald-100 cursor-not-allowed'
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
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
            initial={{ opacity: 0, y: 20 }}
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
            initial={{ opacity: 0, y: 20 }}
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
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
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
            initial={{ opacity: 0, y: 20 }}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleNegativeComplete}
            disabled={isTransitioning}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isTransitioning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-rose-500 text-white hover:bg-rose-600'
            }`}
          >
            {negativeSelections.length > 0
              ? `${negativeSelections.length}개 제외하고 다음`
              : '넘어가기'}
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
            disabled={isTransitioning || isCalculating}
            onClick={() => {
              if (isTransitioning || isCalculating) return;
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
              isTransitioning || isCalculating
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            이전
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleGetRecommendation}
            disabled={isCalculating || isTransitioning}
            className={`flex-[3] h-14 rounded-2xl font-semibold text-base transition-all ${
              isCalculating || isTransitioning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {isCalculating ? '분석 중...' : '추천받기'}
          </motion.button>
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
        <div className="h-full w-full max-w-[480px] bg-white shadow-lg flex items-center justify-center">
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
    <div className="h-dvh overflow-hidden bg-gray-100 flex justify-center">
      <div className="h-full w-full max-w-[480px] bg-white shadow-lg flex flex-col overflow-hidden">
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
            {/* 추천 완료 후에만 하트 아이콘 표시 */}
            {currentStep === 5 && scoredProducts.length > 0 ? (
              <button
                onClick={() => {
                  setShowFavoritesModal(true);
                }}
                className="p-1"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="#FF6B6B"
                  stroke="#FF6B6B"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            ) : (
              <div className="w-7" />
            )}
          </div>

          {/* Progress Bar - Step 0(로딩/가이드카드)과 결과 화면에서는 숨김 */}
          {currentStep >= 1 && !(currentStep === 5 && scoredProducts.length > 0) && (
            <div className="px-5 pb-3">
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
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
          className="flex-1 overflow-y-auto px-4 py-6 bg-white overscroll-contain"
          style={{ paddingBottom: '102px' }}
        >
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
          <div className="space-y-4">
            {messages.map(renderMessage)}
          </div>

          {/* Calculating indicator - 중앙 정렬 + 비디오 + 프로그레스 */}
          {isCalculating && (() => {
            const thinkingMessages = [
              `${categoryName} 제품 데이터 수집 중...`,
              '인기 제품 순위 분석 중...',
              '선택하신 조건과 매칭 중...',
              '가격 대비 성능 비교 중...',
              `${categoryName} 실사용 리뷰 분석 중...`,
              '최적의 제품 조합 탐색 중...',
              '추천 순위 계산 중...',
              '최종 결과 검토 중...',
            ];
            const currentMessage = thinkingMessages[thinkingIndex % thinkingMessages.length];

            return (
              <motion.div
                ref={calculatingRef}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full py-8 flex flex-col items-center justify-center"
              >
                {/* 캐릭터 비디오 */}
                <div className="mb-4 rounded-2xl overflow-hidden bg-white">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: 100, height: 100 }}
                    className="object-contain"
                  >
                    <source src="/animations/character.mp4" type="video/mp4" />
                  </video>
                </div>

                {/* 프로그레스 % */}
                <span className="text-base font-medium text-gray-600 tabular-nums">
                  {progress}%
                </span>

                {/* thinking 메시지 - 아래에서 위로 올라오는 애니메이션 */}
                <div className="mt-3 h-6 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={thinkingIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="flex items-center gap-1.5 shimmer-text"
                    >
                      {/* 돋보기 아이콘 */}
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <span className="text-sm font-normal text-gray-400">
                        {currentMessage}
                      </span>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })()}

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

        {/* 다시 추천받기 플로팅 버튼 (Step 5에서만 표시, 상품 모달 열림 시 숨김) */}
        {currentStep === 5 && scoredProducts.length > 0 && !isProductModalOpen && (
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
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
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

                        // 상태 초기화
                        setCurrentStep(0);
                        setCurrentHardFilterIndex(0);
                        setHardFilterAnswers({});
                        setBalanceSelections(new Set());
                        setNegativeSelections([]);
                        setScoredProducts([]);
                        setConditionSummary([]);
                        setMessages([]);
                        setShowReRecommendModal(false);

                        // 스캔 애니메이션 없이 바로 가이드 카드 표시
                        handleScanComplete();

                        if (requiresSubCategory) {
                          setSelectedSubCategoryCode(null);
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
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
                  <div className="gradient-border-button w-full">
                    <button
                      onClick={() => {
                        logV2ReRecommendModalOpened(categoryKey, categoryName);
                        setShowReRecommendModal(true);
                      }}
                      className="gradient-border-button-inner w-full"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                      <span>다시 추천받기</span>
                    </button>
                  </div>
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
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
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

        {/* Favorites Modal */}
        <AnimatePresence>
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
        </AnimatePresence>
      </div>
    </div>
  );
}
