'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import FeedbackButton from '@/components/FeedbackButton';
import { StepIndicator } from '@/components/StepIndicator';

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
  PreprocessedRequirements,
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
  LoadingDots,
} from '@/components/recommend-v2';
import ContextInput from '@/components/recommend-v2/ContextInput';
import type { BalanceGameCarouselRef } from '@/components/recommend-v2';
import { SubCategorySelector } from '@/components/recommend-v2/SubCategorySelector';
import { FollowupCarousel } from '@/components/recommend-v2/FollowupCarousel';

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

// --- Sub-components ---

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

  // Ref to always hold the latest products (to avoid closure issues in callbacks)
  const productsRef = useRef<ProductItem[]>([]);

  // ===================================================
  // State
  // ===================================================

  // Flow state
  // 모든 카테고리에서 Step 1(체감속성)부터 바로 시작 (Step -1 컨텍스트 입력 퍼널 삭제)
  const [currentStep, setCurrentStep] = useState<FlowStep>(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Context input (Step -1)
  const [userContext, setUserContext] = useState<string | null>(null);
  // 연령대 컨텍스트 (메인 페이지에서 태그 선택 후 진입한 경우)
  const [ageContext, setAgeContext] = useState<{ ageId: string; ageLabel: string; ageDescription: string } | null>(null);
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
  // 추가 질문 + 마지막 자연어 인풋 캐러셀 상태
  interface FollowupQuestionType {
    id: string;
    title: string;
    options: Array<{
      value: string;
      label: string;
      description: string;
      scoreImpact?: number;
    }>;
    allowOther?: boolean;
    reason?: string;
  }
  const [followupQuestions, setFollowupQuestions] = useState<FollowupQuestionType[]>([]);
  const [followupAnswers, setFollowupAnswers] = useState<Array<{ questionId: string; answer: string; isOther: boolean; otherText?: string }>>([]);
  const [isLoadingFollowup, setIsLoadingFollowup] = useState(false);
  const [showFollowupCarousel, setShowFollowupCarousel] = useState(false);
  const [finalDirectInputAnalysis, setFinalDirectInputAnalysis] = useState<DirectInputAnalysis | null>(null);
  const [isCarouselLoading, setIsCarouselLoading] = useState(false);
  // 전처리된 사용자 요구사항 (LLM Top3 선정 시 최우선 반영)
  const [preprocessedRequirements, setPreprocessedRequirements] = useState<PreprocessedRequirements | null>(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const preprocessingPromiseRef = useRef<Promise<PreprocessedRequirements | null> | null>(null);

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
  const [isSummaryTypingComplete, setIsSummaryTypingComplete] = useState(false);
  // 찜하기 기능 - 나중에 사용할 수 있도록 임시 숨김
  // const [showFavoritesModal, setShowFavoritesModal] = useState(false);

  // Typing animation state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // Step Indicator Prop Mapping
  const indicatorStep = useMemo(() => {
    // 사용자 요청:
    // 1단계: 메인 카테고리 화면/첫 체감속성 질문
    // 2단계: 하드필터
    // 3단계: 밸런스게임
    // 4단계: 단점+예산
    if (currentStep === 0) return 1;
    if (currentStep === 1) return 2;
    if (currentStep === 2 || currentStep === 3) return 3;
    if (currentStep === 4 || currentStep === 5) return 4;
    return 1;
  }, [currentStep]);

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
      const container = scrollContainerRef.current;
      const el = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
      if (container && el) {
        // StepIndicator height(약 48px) + mt-2(8px) + 여백(약 14px) = 70px
        const offset = 70;
        const targetScroll = el.offsetTop - offset;
        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    }, 150);
  }, []);

  // 추가 질문 로딩/캐러셀 표시 시 해당 영역으로 자동 스크롤
  useEffect(() => {
    if (isLoadingFollowup || showFollowupCarousel) {
      // 로딩/캐러셀 영역으로 스크롤 (data-followup-area 속성 사용)
      setTimeout(() => {
        const followupArea = document.querySelector('[data-followup-area]') as HTMLElement;
        const container = scrollContainerRef.current;
        if (followupArea && container) {
          const offset = 70; // StepIndicator 높이 + 여백
          const targetScroll = followupArea.offsetTop - offset;
          container.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth'
          });
        }
      }, 150);
    }
  }, [isLoadingFollowup, showFollowupCarousel]);

  // ===================================================
  // Typing animation completion
  // ===================================================

  // 기존의 1초 강제 종료 로직은 제거하고, StreamingText의 완료 콜백을 사용합니다.
  
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

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>, withTyping = false, speed?: number) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
      typing: withTyping,
      speed: speed,
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
          router.push('/');
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

  // 연령대 컨텍스트 로딩 (메인 페이지에서 태그 선택 후 진입한 경우)
  useEffect(() => {
    if (!categoryKey || isRestoredFromStorage) return;

    try {
      const savedAgeContextStr = sessionStorage.getItem(`v2_age_context_${categoryKey}`);
      if (savedAgeContextStr) {
        const savedAgeContext = JSON.parse(savedAgeContextStr);
        setAgeContext(savedAgeContext);
        console.log('✅ [recommend-v2] Age context loaded:', savedAgeContext);

        // 사용 후 삭제 (한 번만 사용)
        sessionStorage.removeItem(`v2_age_context_${categoryKey}`);
      }
    } catch (e) {
      console.warn('[recommend-v2] Failed to load age context:', e);
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

    // 인사말 메시지 추가 후 첫 질문으로 이동
    if (hardFilterConfig) {
      setTimeout(() => {
        // 1. 인사말 추가 (메인 페이지와 동일한 문구 사용, 육아용품 대신 카테고리 네임 사용)
        const getParticle = (name: string) => {
          if (!name) return '을';
          const lastChar = name.charCodeAt(name.length - 1);
          if (lastChar < 0xAC00 || lastChar > 0xD7A3) return '을'; // 한글 아니면 기본값
          return (lastChar - 0xAC00) % 28 > 0 ? '을' : '를';
        };
        
        addMessage({
          role: 'assistant',
          content: `안녕하세요!\n고객님께 필요한 최적의 **${categoryName}**${getParticle(categoryName)} 찾아드릴게요.`,
          onTypingComplete: () => {
            // 2. 타이핑 완료 후 하드 필터 질문 시작
            if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
              const questions = hardFilterConfig.questions;
              setTimeout(() => {
                setCurrentStep(1);
                const msgId = addMessage({
                  role: 'system',
                  content: '',
                  componentType: 'hard-filter',
                  componentData: {
                    question: questions[0],
                    currentIndex: 0,
                    totalCount: questions.length,
                  },
                  stepTag: '1/5',
                });
                // 첫 질문으로 부드럽게 스크롤
                scrollToMessage(msgId);
              }, 400);
            }
          }
        }, true);
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

    // 1. 인사말 추가 (메인 페이지와 동일한 문구 사용, 육아용품 대신 카테고리 네임 사용)
    setTimeout(() => {
      const getParticle = (name: string) => {
        if (!name) return '을';
        const lastChar = name.charCodeAt(name.length - 1);
        if (lastChar < 0xAC00 || lastChar > 0xD7A3) return '을'; // 한글 아니면 기본값
        return (lastChar - 0xAC00) % 28 > 0 ? '을' : '를';
      };
      
      addMessage({
        role: 'assistant',
        content: `안녕하세요!\n고객님께 필요한 최적의 **${categoryName}**${getParticle(categoryName)} 찾아드릴게요.`,
        onTypingComplete: () => {
          // 2. 타이핑 완료 후 가이드 카드/첫 질문 표시
          if (hardFilterConfig) {
            if (hardFilterConfig?.questions && hardFilterConfig.questions.length > 0) {
              const questions = hardFilterConfig.questions;
              setTimeout(() => {
                setCurrentStep(1);
                const msgId = addMessage({
                  role: 'system',
                  content: '',
                  componentType: 'hard-filter',
                  componentData: {
                    question: questions[0],
                    currentIndex: 0,
                    totalCount: questions.length,
                  },
                  stepTag: '1/5',
                });
                // 첫 질문으로 부드럽게 스크롤
                scrollToMessage(msgId);
              }, 400);
            }
          }
        }
      }, true);
    }, 300);

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
  }, [categoryKey, categoryName, hardFilterConfig, addMessage, scrollToMessage]);

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
        content: '**더 중요한 쪽을 골라주세요!**',
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
  // Step 1 Complete → Step 2
  // ===================================================
  // ... (handleHardFiltersComplete follows)

  const handleHardFiltersComplete = useCallback(async (
    answers: Record<string, string[]>,
    productsOverride?: ProductItem[]  // 선택적: state 대신 직접 전달된 products 사용
  ) => {
    setCurrentStep(2);
    setIsSummaryTypingComplete(false);

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

    // 로딩 상태 표시 (사용자에게 필터링 중임을 알림)
    const fixedSuffix = "이제 말씀하신 상품 조건에 대해 조금만 더 자세히 여쭤볼게요. 정확한 상황을 파악하고, 알맞은 상품을 추천해야 하기 때문이에요.";
    const loadingMsgId = addMessage({
      role: 'system',
      content: '',
      componentType: 'loading-text',
      componentData: {
        text: '조건에 맞는 후보를 찾는 중...',
        subText: fixedSuffix,
        showGap: true
      },
    });
    scrollToMessage(loadingMsgId);

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

    // 로딩 메시지 제거
    setMessages(prev => prev.filter(msg => msg.id !== loadingMsgId));

    // Log checkpoint viewed
    logV2CheckpointViewed(categoryKey, categoryName, filtered.length);

    // Add AI summary message (Step 2 메시지이므로 stepTag 추가)
    const summaryMessage = (aiSummary || "선택하신 조건에 맞는 제품들을 찾았습니다.") + "\n\n" + fixedSuffix;
    
    addMessage({
      role: 'assistant',
      content: summaryMessage,
      stepTag: '2/5',
      onTypingComplete: () => {
        setIsSummaryTypingComplete(true);
      }
    }, true, 7); // 긴 문장이므로 속도를 7ms로 더 빠르게 설정
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
      content: '입력하신 내용을 확인했습니다.\n마지막으로 피하고 싶은 단점과 예산을 여쭤본 후, 최적의 결과를 제공해드릴게요.',
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

    setTimeout(() => {
      // 예산 슬라이더 추가 및 스크롤
      const budgetMsgId = addMessage({
        role: 'system',
        content: '',
        componentType: 'budget-slider',
      });
      scrollToMessage(budgetMsgId);
      setIsTransitioning(false);
    }, 300);
  }, [isTransitioning, negativeSelections, negativeLabels, categoryKey, categoryName, addMessage, negativeDirectInput, scrollToMessage]);

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

    // 연령대 컨텍스트 (메인 페이지에서 태그 선택 후 진입한 경우)
    if (ageContext) {
      result.ageContext = {
        ageId: ageContext.ageId,
        ageLabel: ageContext.ageLabel,
        ageDescription: ageContext.ageDescription,
      };
    }

    return result;
  }, [hardFilterConfig, hardFilterAnswers, balanceQuestions, balanceSelections, naturalLanguageInputs, userContext, ageContext]);

  // 추천 요청 ref (순환 의존성 방지)
  const handleGetRecommendationRef = useRef<((useBudgetHardFilter: boolean) => Promise<void>) | undefined>(undefined);

  // 사용자 요구사항 전처리 함수 (Flash Lite로 자연스러운 문장 생성)
  const preprocessUserRequirements = useCallback(async (finalInput?: string): Promise<PreprocessedRequirements | null> => {
    // 등록된 하드필터 직접 입력들 수집
    const registeredHardFilterInputs = Object.entries(hardFilterDirectInputs)
      .filter(([questionId, value]) => hardFilterDirectInputRegistered[questionId] && value.trim().length >= 2)
      .map(([, value]) => value.trim());

    // 등록된 단점필터 직접 입력
    const registeredNegativeInput = isNegativeDirectInputRegistered && negativeDirectInput.trim().length >= 2
      ? negativeDirectInput.trim()
      : undefined;

    // 입력이 하나도 없으면 null 반환
    const hasAnyInput = registeredHardFilterInputs.length > 0 ||
      registeredNegativeInput ||
      finalInput ||
      userContext;

    if (!hasAnyInput) {
      console.log('[Preprocess] No inputs to preprocess');
      return null;
    }

    setIsPreprocessing(true);
    console.log('[Preprocess] Starting preprocessing with:', {
      hardFilter: registeredHardFilterInputs,
      negative: registeredNegativeInput,
      final: finalInput,
      initial: userContext,
    });

    try {
      const response = await fetch('/api/v2/preprocess-user-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          hardFilterDirectInputs: registeredHardFilterInputs,
          negativeDirectInput: registeredNegativeInput,
          finalNaturalInput: finalInput,
          initialContext: userContext,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          console.log('[Preprocess] Result:', data.data);
          setPreprocessedRequirements(data.data);
          return data.data as PreprocessedRequirements;
        }
      }

      console.warn('[Preprocess] API failed, returning null');
      return null;
    } catch (error) {
      console.error('[Preprocess] Error:', error);
      return null;
    } finally {
      setIsPreprocessing(false);
    }
  }, [categoryKey, categoryName, hardFilterDirectInputs, hardFilterDirectInputRegistered, negativeDirectInput, isNegativeDirectInputRegistered, userContext]);

  // 추가 질문 플로우 시작 핸들러 (완료 버튼 클릭 시 호출)
  const handleStartFollowupFlow = useCallback(async () => {
    setIsLoadingFollowup(true);

    // 🚀 전처리 API를 병렬로 시작 (마지막 자연어 입력은 아직 없으므로 제외)
    // 결과는 나중에 handleFollowupCarouselComplete에서 업데이트
    preprocessingPromiseRef.current = preprocessUserRequirements();

    try {
      // generate-followup-questions API 호출
      const response = await fetch('/api/v2/generate-followup-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          categoryName,
          hardFilterAnswers,
          balanceSelections: Array.from(balanceSelections),
          negativeSelections,
          budget,
          filteredProductCount: filteredProducts.length,
          candidateProducts: filteredProducts.slice(0, 10).map(p => ({
            pcode: p.pcode,
            title: p.title,
            brand: p.brand,
            spec: p.spec,
          })),
          directInputAnalysis: hardFilterAnalysis ? {
            keywords: hardFilterAnalysis.keywords,
            originalInput: hardFilterAnalysis.originalInput,
          } : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[FollowupFlow] API Response:', data);

        if (data.success && data.data?.shouldAsk && data.data.questions.length > 0) {
          // 추가 질문이 있으면 질문 저장
          setFollowupQuestions(data.data.questions);
        } else {
          // 추가 질문이 없으면 빈 배열
          setFollowupQuestions([]);
        }
      } else {
        // API 에러 시 질문 없이 진행
        console.error('[FollowupFlow] API error:', response.status);
        setFollowupQuestions([]);
      }
    } catch (error) {
      console.error('[FollowupFlow] Error:', error);
      setFollowupQuestions([]);
    } finally {
      setIsLoadingFollowup(false);
      // 캐러셀 표시 (질문 유무와 관계없이 - 자연어 입력은 항상 있음)
      setShowFollowupCarousel(true);
    }
  }, [categoryKey, categoryName, hardFilterAnswers, balanceSelections, negativeSelections, budget, filteredProducts, hardFilterAnalysis, preprocessUserRequirements]);

  // 캐러셀 완료 핸들러 (질문 답변 + 자연어 입력 처리)
  const handleFollowupCarouselComplete = useCallback(async (
    answers: Array<{ questionId: string; answer: string; isOther: boolean; otherText?: string }>,
    naturalInput?: string
  ) => {
    setIsCarouselLoading(true);
    setFollowupAnswers(answers);
    console.log('[FollowupCarousel] Answers:', answers);
    console.log('[FollowupCarousel] Natural input:', naturalInput);

    try {
      // 마지막 자연어 입력이 있으면 전처리에 포함하여 다시 호출
      // (병렬로 시작했던 전처리에 마지막 입력 추가)
      if (naturalInput && naturalInput.length >= 2) {
        // 전처리 API를 마지막 자연어 입력 포함하여 재호출
        const preprocessResult = await preprocessUserRequirements(naturalInput);
        console.log('[FollowupCarousel] Final preprocess result:', preprocessResult);

        // 기존 direct-input 분석도 병행 (점수 계산용 - 추후 제거 예정)
        const response = await fetch('/api/ai-selection-helper/direct-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filterType: 'hard_filter',
            userInput: naturalInput,
            category: categoryKey,
            categoryName: categoryName,
            enableExpansion: false, // 전처리에서 이미 처리되므로 확장 불필요
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const analysis: DirectInputAnalysis = {
              ...data.data,
              originalInput: naturalInput,
            };
            setFinalDirectInputAnalysis(analysis);
            console.log('[FollowupCarousel] Final analysis:', analysis);
          }
        }
      } else {
        // 마지막 자연어 입력이 없으면 기존 전처리 결과 대기
        if (preprocessingPromiseRef.current) {
          const result = await preprocessingPromiseRef.current;
          console.log('[FollowupCarousel] Using pre-started preprocess result:', result);
        }
      }
    } catch (error) {
      console.error('[FollowupCarousel] Error:', error);
    } finally {
      setIsCarouselLoading(false);
      setShowFollowupCarousel(false);
      // 추천 요청 시작
      setTimeout(() => {
        handleGetRecommendationRef.current?.(false);
      }, 100);
    }
  }, [categoryKey, categoryName, preprocessUserRequirements]);

  // 캐러셀 전체 건너뛰기 핸들러
  const handleFollowupCarouselSkipAll = useCallback(() => {
    setShowFollowupCarousel(false);
    // 추천 요청 시작
    setTimeout(() => {
      handleGetRecommendationRef.current?.(false);
    }, 100);
  }, []);

  // 캐러셀에서 이전(예산) 단계로 돌아가기
  const handleFollowupCarouselBack = useCallback(() => {
    setShowFollowupCarousel(false);
    setFollowupQuestions([]);

    // 예산 슬라이더로 스크롤
    requestAnimationFrame(() => {
      const budgetMsg = messages.findLast(msg => msg.componentType === 'budget-slider');
      if (budgetMsg?.id) {
        scrollToMessage(budgetMsg.id);
      }
    });
  }, [messages, scrollToMessage]);

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

        // 🚀 직접 입력 점수 계산 제거 - LLM 정성 평가로 대체 (preprocessedRequirements)
        // 자연어 매칭 결과만 PLP 표시용으로 유지 (점수 계산은 제거)
        const hardFilterDirectResult = calculateDirectInputScore(product, hardFilterAnalysis);
        const negativeDirectResult = calculateDirectInputScore(product, negativeAnalysis);
        const finalDirectResult = calculateDirectInputScore(product, finalDirectInputAnalysis);
        // directInputScore는 0으로 고정 (LLM이 정성적으로 판단)
        const directInputScore = 0;

        // 자연어 매칭 결과 병합 (PLP 파란색 태그용 - 점수와 무관하게 유지)
        const naturalLanguageMatches = [
          ...hardFilterDirectResult.matchedKeywords,
          ...negativeDirectResult.matchedKeywords,
          ...finalDirectResult.matchedKeywords,
        ];

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
          naturalLanguageMatches: naturalLanguageMatches.length > 0 ? naturalLanguageMatches : undefined,
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


      // 🚀 API 호출을 즉시 시작 (타임라인 UX와 병렬 실행)
      let top3 = candidateProducts.slice(0, 3);
      let finalSelectionReason = '';
      let finalGeneratedBy: 'llm' | 'fallback' = 'fallback';

      const apiPromise = (async () => {
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
                ageContext: ageContext || undefined,  // 연령대 컨텍스트 (메인 페이지에서 태그 선택 후 진입)
                // 🚀 전처리된 사용자 요구사항 (LLM Top3 선정 시 최우선 반영)
                preprocessedRequirements: preprocessedRequirements || undefined,
              },
              budget,
            }),
          });

          const recommendResult = await recommendResponse.json();

          if (recommendResult.success && recommendResult.data) {
            return {
              top3: recommendResult.data.top3Products,
              selectionReason: recommendResult.data.selectionReason || '',
              generatedBy: recommendResult.data.generated_by || 'fallback',
            };
          }
        } catch (llmError) {
          console.warn('LLM recommendation failed, using score-based fallback:', llmError);
        }
        return null;
      })();

      // 🎬 타임라인 UX (API와 병렬 실행, 총 11초: 3+4+4)
      const timelinePromise = (async () => {
        // 📦 1단계: 실사용 리뷰 및 카테고리 분석
        const step1: TimelineStep = {
          id: 'step-1',
          title: `인기 ${categoryName} 제품들의 리뷰를 분석 중`,
          icon: '',
          details: [
            `후보 제품들의 실사용 리뷰와 ${categoryName} 카테고리의 주요 만족 포인트를 수집하고 분석하고 있습니다. ${candidateProducts.slice(0, 3).map(p => (p.brand || '') + ' ' + p.title).join(', ')} 등을 분석하고 있습니다.`,
          ],
          timestamp: Date.now(),
          status: 'completed',
        };
        localTimelineSteps.push(step1);
        setTimelineSteps(prev => [...prev, step1]);

        // 1단계 -> 2단계: 3초 대기
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 🤖 2단계: 맞춤 후보군 선정 및 점수 계산
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

        const step2: TimelineStep = {
          id: 'step-2',
          title: `고객님의 목표에 알맞는 제품 ${candidateProducts.length}개 골라내는 중`,
          icon: '',
          details: [
            `각 제품의 장단점 평가 및 추천 점수를 계산합니다. 입력하신 선호 조건(${userSelectedConditions.slice(0, 2).join(', ')}...)과 회피 조건(${userAvoidConditions.slice(0, 2).join(', ')}...)을 제품 특성과 대조해 최적의 후보군을 골라내고 있습니다.`,
          ],
          timestamp: Date.now(),
          status: 'completed',
        };
        localTimelineSteps.push(step2);
        setTimelineSteps(prev => [...prev, step2]);

        // 2단계 -> 3단계: 4초 대기
        await new Promise(resolve => setTimeout(resolve, 4000));

        // 🏆 3단계: TOP 3 최종 선정
        const step3: TimelineStep = {
          id: 'step-3',
          title: 'TOP 3 제품 최종 선정 중',
          icon: '',
          details: [
            `고객님의 상황에 가장 완벽하게 부합하는 3가지 제품을 선별하고 있습니다. 각 제품의 스펙, 가격 경쟁력, 그리고 실제 사용자들의 만족도가 가장 높은 지점을 심층 분석하여 맞춤형 추천 근거를 작성 중입니다.`,
          ],
          timestamp: Date.now(),
          status: 'completed',
        };
        localTimelineSteps.push(step3);
        setTimelineSteps(prev => [...prev, step3]);

        // 3단계: 4초 대기 (최소 UX 시간)
        await new Promise(resolve => setTimeout(resolve, 4000));
      })();

      // API 완료와 최소 타임라인 UX(11초) 모두 만족하면 결과 표시
      const [apiResult] = await Promise.all([apiPromise, timelinePromise]);

      if (apiResult) {
        top3 = apiResult.top3;
        finalSelectionReason = apiResult.selectionReason;
        finalGeneratedBy = apiResult.generatedBy as 'llm' | 'fallback';
        console.log(`✅ LLM recommendation: ${finalGeneratedBy}`, top3.map((p: ScoredProduct) => p.title));
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
  }, [filteredProducts, balanceSelections, negativeSelections, dynamicNegativeOptions, logicMap, budget, categoryName, categoryKey, hardFilterAnswers, hardFilterAnalysis, negativeAnalysis, finalDirectInputAnalysis, hardFilterConfig, hardFilterDefinitions, hardFilterLabels, balanceLabels, negativeLabels, conditionSummary, userContext, ageContext, hardFilterDirectInputs, hardFilterDirectInputRegistered, negativeDirectInput, addMessage, scrollToMessage, preprocessedRequirements]);

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

  // handleGetRecommendation ref 업데이트 (순환 의존성 방지용)
  useEffect(() => {
    handleGetRecommendationRef.current = handleGetRecommendation;
  }, [handleGetRecommendation]);

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
      const msgIndex = messages.findIndex(m => m.id === message.id);
      const hasSystemMessageAfter = messages.slice(msgIndex + 1).some(m => m.role === 'system');

      const isPastStep = messageStep !== null
        ? currentStep > messageStep
        : (currentStep > 0 && hasSystemMessageAfter);

      return (
        <div
          key={message.id}
          data-message-id={message.id}
          className={`scroll-mt-[70px] transition-all duration-300 ${
            isPastStep ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <AssistantMessage
            content={message.content}
            typing={message.typing}
            speed={message.speed}
            onTypingComplete={() => {
              // 타이핑이 끝나면 해당 메시지의 typing 상태를 false로 변경
              if (message.typing) {
                setMessages(prev => prev.map(m => 
                  m.id === message.id ? { ...m, typing: false } : m
                ));
              }
              // 기존 콜백 실행
              message.onTypingComplete?.();
            }}
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
              className={`scroll-mt-[70px] transition-all duration-300 ${
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
            <div key={message.id} data-message-id={message.id} className="scroll-mt-[70px]">
              <ResultCards
                products={resultData?.products || scoredProducts}
                categoryName={resultData?.categoryName || categoryName}
                categoryKey={resultData?.categoryKey || categoryKey}
                selectionReason={resultData?.selectionReason || selectionReason}
                analysisTimeline={resultData?.analysisTimeline || analysisTimeline || undefined}
                userContext={{
                  hardFilterAnswers: hardFilterAnswers,
                  hardFilterDirectInputs: hardFilterDirectInputs,
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
          const loadingData = message.componentData as { text: string; subText?: string; showGap?: boolean };
          return (
            <div key={message.id} data-message-id={message.id} className="w-full py-2">
              <div className="w-full flex flex-col justify-start">
                <p className="py-1 text-base font-medium text-gray-600 shimmer-text">
                  {loadingData?.text || '로딩 중...'}
                </p>
                {loadingData?.showGap && <div className="h-4" />}
                {loadingData?.subText && (
                  <p className="py-1 text-base font-medium text-transparent select-none">
                    {loadingData.subText}
                  </p>
                )}
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

    // 하위 카테고리 선택 중이면 선택기 닫고 이전 질문으로
    if (showSubCategorySelector) {
      setShowSubCategorySelector(false);
      setSelectedSubCategoryCodes([]);

      // Log step back from sub-category to first hard filter question
      logV2StepBack(categoryKey, categoryName, 1, 1);

      let targetMsgId: string | undefined;
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.componentType !== 'sub-category');
        const prevMsg = filtered.findLast(msg => msg.componentType === 'hard-filter');
        targetMsgId = prevMsg?.id;
        return filtered;
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (targetMsgId) {
            scrollToMessage(targetMsgId);
          }
          setIsTransitioning(false);
        });
      });
      return;
    }

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
      // 첫 번째 질문에서 이전 클릭 시 카테고리 선택으로 이동
      router.push('/');
      setIsTransitioning(false);
    }
  }, [isTransitioning, showSubCategorySelector, currentHardFilterIndex, categoryKey, categoryName, scrollToMessage, router]);

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
          whileTap={isTransitioning ? undefined : { scale: 0.98 }}
          className={`w-20 ml-auto h-14 rounded-2xl font-semibold text-base ${
            isTransitioning
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-[#111827] text-white'
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
      const isFirstQuestion = currentHardFilterIndex === 0;

      return (
        <div className="flex gap-2">
          {(!isFirstQuestion || showSubCategorySelector) && (
            <motion.button
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleGoToPreviousHardFilter}
              disabled={isTransitioning}
              whileTap={isTransitioning ? undefined : { scale: 0.98 }}
              className={`w-20 h-14 rounded-2xl font-semibold text-base ${
                isTransitioning
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              이전
            </motion.button>
          )}
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleHardFilterNext}
            disabled={!canProceed || isTransitioning}
            whileTap={(!canProceed || isTransitioning) ? undefined : { scale: 0.98 }}
            className={`w-20 ml-auto h-14 rounded-2xl font-semibold text-base ${
              canProceed && !isTransitioning
                ? 'bg-[#111827] text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLastQuestion ? '완료' : '다음'}
          </motion.button>
        </div>
      );
    }

    // Step 2: 후보 요약 (이전/다음 버튼 노출)
    if (currentStep === 2) {
      const isStep2Disabled = isTransitioning;
      const isNextDisabled = isStep2Disabled || !isSummaryTypingComplete;

      return (
        <div className="flex gap-2">
          <motion.button
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            disabled={isStep2Disabled}
            whileTap={isStep2Disabled ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (isStep2Disabled) return;
              logV2StepBack(categoryKey, categoryName, 2, 1);
              setCurrentStep(1);

              // 마지막 hard-filter 메시지 ID 찾기
              let targetMsgId: string | undefined;

              // Remove summary related messages
              setMessages(prev => {
                const filtered = prev.filter(msg =>
                  msg.componentType !== 'loading-text' &&
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
            className={`w-20 h-14 rounded-2xl font-semibold text-base ${
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
            disabled={isNextDisabled}
            whileTap={isNextDisabled ? undefined : { scale: 0.98 }}
            className={`w-20 ml-auto h-14 rounded-2xl font-semibold text-base ${
              isNextDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#111827] text-white'
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
            whileTap={isTransitioning ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (isTransitioning) return;
              // 밸런스 게임 내에서 이전 질문이 있으면 그리로 이동
              if (balanceGameState.canGoPrevious) {
                balanceGameRef.current?.goToPrevious();
              } else {
                // 첫 질문이면 Step 2로 돌아가기
                logV2StepBack(categoryKey, categoryName, 3, 2);
                setCurrentStep(2);

                // 요약 메시지 ID 찾기 (stepTag 2/5)
                let targetMsgId: string | undefined;

                setMessages(prev => {
                  const filtered = prev.filter(msg =>
                    msg.componentType !== 'balance-carousel' &&
                    !(msg.stepTag === '3/5')
                  );
                  // 2/5 요약 메시지 찾기
                  const summaryMsg = filtered.findLast(msg => msg.stepTag === '2/5');
                  targetMsgId = summaryMsg?.id;
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
            className={`w-20 h-14 rounded-2xl font-semibold text-base ${
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
            whileTap={isNextDisabled ? undefined : { scale: 0.98 }}
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
            className={`w-20 ml-auto h-14 rounded-2xl font-semibold text-base ${
              isNextDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#111827] text-white'
            }`}
          >
            {isLastBalanceQuestion
              ? (balanceGameState.selectionsCount > 0 ? `완료` : '넘어가기')
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
            whileTap={isTransitioning ? undefined : { scale: 0.98 }}
            className={`w-20 h-14 rounded-2xl font-semibold text-base ${
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
            whileTap={isTransitioning ? undefined : { scale: 0.98 }}
            className={`w-20 ml-auto h-14 rounded-2xl font-semibold text-base ${
              isTransitioning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#111827] text-white'
            }`}
          >
            {negativeSelections.length > 0 || isNegativeDirectInputRegistered
              ? '다음'
              : '건너뛰기'}
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

      // 추가 질문 캐러셀 표시 중이면 버튼 숨김
      if (showFollowupCarousel || isLoadingFollowup) {
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
              whileTap={isTransitioning ? undefined : { scale: 0.98 }}
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
              className={`w-20 h-14 rounded-2xl font-semibold text-base ${
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
              onClick={handleStartFollowupFlow}
              disabled={isTransitioning || isTooFewProducts}
              whileTap={(isTransitioning || isTooFewProducts) ? undefined : { scale: 0.98 }}
              className={`w-20 ml-auto h-14 rounded-2xl font-bold text-base flex items-center justify-center shadow-lg shadow-purple-200/50 ${
                isTransitioning || isTooFewProducts
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-[#111827] text-white'
              }`}
            >
              <span>다음</span>
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
          <div className="w-full py-8 flex flex-col items-center gap-6">
            <LoadingDots />

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
    <div className="h-dvh overflow-hidden bg-white flex justify-center">
      <div className="h-full w-full max-w-[480px] bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-50 h-14 flex items-center px-5">
          <button
            onClick={() => setShowBackModal(true)}
            className="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <CaretLeft size={20} weight="bold" />
          </button>
          
          <FeedbackButton source={`recommend-v2-${categoryKey}`} className="ml-auto" />
        </header>

        {/* Content */}
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 pb-6 pt-0 bg-white relative"
          style={{ paddingBottom: '102px' }}
        >
          {/* Step Indicator - Moved inside main for true floating effect */}
          {currentStep >= 0 && !isCalculating && scoredProducts.length === 0 && (
            <StepIndicator currentStep={indicatorStep} className="top-0" />
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
            <div className={`space-y-4 pt-10 transition-opacity duration-300 ${
              showFollowupCarousel || isLoadingFollowup ? 'opacity-30 pointer-events-none' : ''
            }`}>
              {messages.map(renderMessage)}
            </div>
          )}

          {/* 추가 질문 로딩 중 표시 */}
          {currentStep === 5 && isLoadingFollowup && !showFollowupCarousel && !isCalculating && scoredProducts.length === 0 && (
            <div data-followup-area className="mt-8 mb-4 flex flex-col items-center justify-center py-12">
              <LoadingDots />
              <p className="mt-4 text-sm text-gray-500">추가로 확인할 사항이 있는지 분석 중...</p>
            </div>
          )}

          {/* 추가 질문 + 마지막 자연어 입력 캐러셀 */}
          {currentStep === 5 && showFollowupCarousel && !isCalculating && scoredProducts.length === 0 && (
            <div data-followup-area className="mt-8 mb-4">
              <FollowupCarousel
                questions={followupQuestions}
                categoryName={categoryName}
                onComplete={handleFollowupCarouselComplete}
                onSkipAll={handleFollowupCarouselSkipAll}
                onBack={handleFollowupCarouselBack}
                isLoading={isCarouselLoading}
              />
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
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex flex-col gap-3 w-full"
                  >
                    {/* 다른 카테고리 추천받기 버튼 */}
                    <motion.button
                      whileHover={{ scale: 1.02, backgroundColor: '#F9FAFB' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        logV2ReRecommendDifferentCategory(categoryKey, categoryName);
                        router.push('/');
                      }}
                      className="w-full py-4 px-6 bg-white text-gray-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100 font-semibold flex items-center justify-center gap-3 group overflow-hidden relative"
                    >
                      <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="relative z-10 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-white transition-colors">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        </div>
                        <span className="text-gray-700">다른 카테고리 추천받기</span>
                      </motion.div>
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

                        // 상태 초기화 - Step 1 (체감속성)부터 다시 시작
                        setCurrentStep(1);
                        setUserContext(null);
                        setCurrentHardFilterIndex(0);
                        setHardFilterAnswers({});
                        setBalanceSelections(new Set());
                        setNegativeSelections([]);
                        setScoredProducts([]);
                        setConditionSummary([]);
                        setMessages([]);
                        setShowReRecommendModal(false);

                        // useEffect 중복 호출 방지
                        hasTriggeredGuideRef.current = false;  // Step 1부터 다시 시작하므로 리셋

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
                      className="w-full py-4 px-6 bg-white text-[#6366F1] rounded-2xl shadow-[0_8px_30px_rgb(99,102,241,0.12)] border border-indigo-50 font-bold flex items-center justify-center gap-3 group relative overflow-hidden"
                    >
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-indigo-50/0 via-indigo-50/50 to-indigo-50/0"
                        animate={{
                          x: ['-100%', '100%'],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                      />
                      <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="relative z-10 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-white transition-colors">
                          <svg className="w-4 h-4 text-[#6366F1]" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="currentColor" />
                          </svg>
                        </div>
                        <span>{categoryName} 다시 추천받기</span>
                      </motion.div>
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
                    className="w-full h-14 rounded-2xl font-semibold text-base text-white bg-[#111827] transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" fill="url(#ai_gradient_rerecommend)" />
                      <defs>
                        <linearGradient id="ai_gradient_rerecommend" x1="21" y1="12" x2="3" y2="12" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#77A0FF" />
                          <stop offset="0.7" stopColor="#907FFF" />
                          <stop offset="1" stopColor="#6947FF" />
                        </linearGradient>
                      </defs>
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
                      onClick={() => router.push('/')}
                      className="flex-1 px-4 py-3 bg-[#111827] text-white font-semibold rounded-xl"
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
