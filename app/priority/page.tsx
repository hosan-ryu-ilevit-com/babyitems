'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { CaretLeft, Question } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { PRIORITY_ATTRIBUTES, ATTRIBUTE_ICONS, AttributeInfo } from '@/data/attributes';
import { PriorityButton } from '@/components/PriorityButton';
import { AttributeBottomSheet } from '@/components/AttributeBottomSheet';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';
import { PrioritySettings, PriorityLevel, BudgetRange } from '@/types';
import {
  loadSession,
  saveSession,
  savePrioritySettings,
  setQuickRecommendation,
  isPriorityComplete
} from '@/lib/utils/session';
import { logPageView, logButtonClick } from '@/lib/logging/clientLogger';
import { ScoredProduct, sortByPrice, sortByScore } from '@/lib/filtering/quickScore';
import { products as ALL_PRODUCTS } from '@/data/products';
import ProductListItem from '@/components/ProductListItem';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import { Product } from '@/types';
import { ANCHOR_PRODUCTS, PROS_TAGS, CONS_TAGS, ADDITIONAL_TAGS, TAG_SELECTION_LIMITS, POPULAR_TAG_IDS } from '@/data/priorityTags';
import { convertTagsToPriority } from '@/lib/utils/tagToPriority';
import ProductTagCard from '@/components/ProductTagCard';

// 가장 많이 선택된 조합 (디폴트)
const DEFAULT_PRIORITY: PrioritySettings = {
  temperatureControl: 'high',
  hygiene: 'high',
  material: 'medium',
  usability: 'medium',
  portability: 'low',
  additionalFeatures: 'low',
};

const DEFAULT_BUDGET: BudgetRange = '50000-100000';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user' | 'component';
  content: string;
  componentType?: 'pros-selector' | 'cons-selector' | 'additional-selector' | 'budget-selector' | 'product-list' | 'summary' | 'summary-loading';
  typing?: boolean;
  extraMarginTop?: boolean; // Step 구분을 위한 추가 마진
};

type ChatStep = 1 | 2 | 3 | 4 | 5; // 1: 장점 선택, 2: 단점 선택, 3: 추가 고려사항, 4: 예산, 5: 제품 프리뷰

// 마크다운 볼드 및 리스트 처리 함수 (Chat 페이지에서 가져옴)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // 리스트 아이템 감지
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
      const parts = content.split(/(\*\*.*?\*\*)/g);
      const formattedContent = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index} className="font-bold">{boldText}</strong>;
        }
        return <span key={index}>{part}</span>;
      });

      return (
        <div key={lineIndex} className="flex items-start gap-2 my-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-300 mt-2 shrink-0" />
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }

    // 일반 텍스트 (볼드 처리)
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <strong key={index} className="font-bold">{boldText}</strong>;
      }
      return <span key={index}>{part}</span>;
    });

    return <div key={lineIndex}>{formattedLine}</div>;
  });
}

// 타이핑 이펙트 컴포넌트 (Chat 페이지에서 가져옴)
function TypingMessage({ content, onComplete, onUpdate }: { content: string; onComplete?: () => void; onUpdate?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
        if (onUpdate) {
          requestAnimationFrame(() => {
            onUpdate();
          });
        }
      }, 10);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete, onUpdate]);

  return <span>{formatMarkdown(displayedContent)}</span>;
}

function PriorityPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 초기화 추적용 ref
  const isInitializedRef = useRef(false);
  const initialMessageIdRef = useRef<string | null>(null);

  // 기본 상태
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<ChatStep>(1);
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>(DEFAULT_PRIORITY);
  const [budget, setBudget] = useState<BudgetRange | null>(DEFAULT_BUDGET);
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomBudgetMode, setIsCustomBudgetMode] = useState(false);
  const [input, setInput] = useState('');
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeInfo | null>(null);
  const [guideBottomSheetOpen, setGuideBottomSheetOpen] = useState(false);

  // Tag 선택 상태 (Step 1, 2, 3)
  const [selectedProsTags, setSelectedProsTags] = useState<string[]>([]);
  const [selectedConsTags, setSelectedConsTags] = useState<string[]>([]);
  const [selectedAdditionalTags, setSelectedAdditionalTags] = useState<string[]>([]);
  const [anchorProducts, setAnchorProducts] = useState<Product[]>([]);

  // Step 4 상태 (상품 리스트 및 추가 입력)
  const [filteredProducts, setFilteredProducts] = useState<ScoredProduct[]>([]);
  const [sortType, setSortType] = useState<'score' | 'price'>('score');
  const [hasUserInput, setHasUserInput] = useState(false);
  const [additionalInput, setAdditionalInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productBottomSheetOpen, setProductBottomSheetOpen] = useState(false);
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [isStep5Complete, setIsStep5Complete] = useState(false); // Step 5 완료 여부 (프로그레스바용)

  // Priority 상태 저장 함수
  const savePriorityState = useCallback(() => {
    const state = {
      messages,
      currentStep,
      prioritySettings,
      budget,
      customBudget,
      isCustomBudgetMode,
      selectedProsTags,
      selectedConsTags,
      selectedAdditionalTags,
      filteredProducts,
      sortType,
      hasUserInput,
      additionalInput,
      showFloatingButtons,
      scrollPosition: mainScrollRef.current?.scrollTop || 0, // 스크롤 위치 저장
    };
    sessionStorage.setItem('babyitem_priority_conversation', JSON.stringify(state));
    console.log('💾 Priority 상태 저장됨 (스크롤:', state.scrollPosition, ')');
  }, [messages, currentStep, prioritySettings, budget, customBudget, isCustomBudgetMode, selectedProsTags, selectedConsTags, selectedAdditionalTags, filteredProducts, sortType, hasUserInput, additionalInput, showFloatingButtons]);

  // Priority 상태 복원 함수
  const loadPriorityState = () => {
    const saved = sessionStorage.getItem('babyitem_priority_conversation');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        console.log('📂 Priority 상태 복원됨');
        return state;
      } catch (e) {
        console.error('❌ Priority 상태 복원 실패:', e);
        return null;
      }
    }
    return null;
  };

  // Priority 상태 클리어 함수
  const clearPriorityState = () => {
    sessionStorage.removeItem('babyitem_priority_conversation');
    console.log('🗑️ Priority 상태 클리어됨');
  };

  // 초기화: 저장된 상태 복원 또는 새로 시작
  useEffect(() => {
    // 이미 초기화되었으면 스킵 (Strict Mode 중복 방지)
    if (isInitializedRef.current) {
      console.log('⚠️ 초기화 이미 완료됨 - 스킵');
      return;
    }

    console.log('✅ 초기화 시작');
    isInitializedRef.current = true;

    logPageView('priority');

    // 가이드 표시 여부 체크
    const guideViewed = localStorage.getItem('babyitem_guide_viewed');
    if (!guideViewed) {
      setGuideBottomSheetOpen(true);
    }

    // Referrer 체크: 홈에서 온 경우 상태 클리어
    const referrer = document.referrer;
    const isFromHome = !referrer ||
                       referrer.endsWith('/') ||
                       (!referrer.includes('/priority') && !referrer.includes('/product-chat'));

    if (isFromHome) {
      console.log('🏠 홈에서 진입 (referrer) - 상태 클리어');
      clearPriorityState();
    }

    // Anchor products 로드
    const loadedAnchorProducts = ALL_PRODUCTS.filter(p =>
      ANCHOR_PRODUCTS.some(anchor => anchor.id === p.id)
    );
    setAnchorProducts(loadedAnchorProducts);

    // 저장된 상태 복원 시도
    const savedState = loadPriorityState();
    if (savedState) {
      // 상태 복원
      setMessages(savedState.messages || []);
      setCurrentStep(savedState.currentStep || 1);
      setPrioritySettings(savedState.prioritySettings || DEFAULT_PRIORITY);
      setBudget(savedState.budget || DEFAULT_BUDGET);
      setCustomBudget(savedState.customBudget || '');
      setIsCustomBudgetMode(savedState.isCustomBudgetMode || false);
      setSelectedProsTags(savedState.selectedProsTags || []);
      setSelectedConsTags(savedState.selectedConsTags || []);
      setSelectedAdditionalTags(savedState.selectedAdditionalTags || []);
      setFilteredProducts(savedState.filteredProducts || []);
      setSortType(savedState.sortType || 'score');
      setHasUserInput(savedState.hasUserInput || false);
      setAdditionalInput(savedState.additionalInput || '');
      setShowFloatingButtons(savedState.showFloatingButtons || false);

      console.log('✅ 저장된 대화 복원 완료');

      // 스크롤 위치 복원 (DOM 렌더링 후)
      if (savedState.scrollPosition) {
        setTimeout(() => {
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollTop = savedState.scrollPosition;
            console.log('📜 스크롤 위치 복원:', savedState.scrollPosition);
          }
        }, 100);
      }
    } else {
      // 새로 시작 - 초기 상태 설정
      setCurrentStep(1);
      setPrioritySettings(DEFAULT_PRIORITY);
      setBudget(DEFAULT_BUDGET);
      setCustomBudget('');
      setIsCustomBudgetMode(false);
      setInput('');

      // 초기 메시지만 먼저 추가 (중복 방지)
      const initialMessageId = `msg-${Date.now()}-1`;
      const initialMessages: ChatMessage[] = [
        {
          id: initialMessageId,
          role: 'assistant',
          content: '안녕하세요! 딱 맞는 분유포트를 찾아드릴게요. 😊\n\n\n가장 잘 나가는 국민템의 내돈내산 후기를 기반으로, 사용자님의 취향을 파악할게요.\n\n먼저 **포기할 수 없는 장점**을 선택해주세요! (최대 5개)',
          typing: true,
        },
      ];
      setMessages(initialMessages);
      setTypingMessageId(initialMessageId); // 타이핑 효과 활성화
      initialMessageIdRef.current = initialMessageId; // 초기 메시지 ID 저장

      console.log('✅ 새로운 대화 시작');
    }

    // Cleanup - Strict Mode 지원
    return () => {
      console.log('🧹 cleanup 실행 - ref 리셋');
      // Strict Mode에서 재마운트될 때를 위해 ref 리셋
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 초기 메시지 타이핑 완료 후 pros-selector 추가
  useEffect(() => {
    // 초기 메시지 타이핑이 완료되었을 때만
    if (
      initialMessageIdRef.current &&
      typingMessageId === null &&
      messages.length === 1 &&
      messages[0].id === initialMessageIdRef.current &&
      currentStep === 1
    ) {
      console.log('✅ 초기 타이핑 완료 - pros-selector 추가');

      // pros-selector 추가 (약간의 지연 후)
      setTimeout(() => {
        addComponentMessage('pros-selector');
        initialMessageIdRef.current = null; // 한 번만 실행되도록
        // 스크롤 안 함 - 사용자가 위 메시지를 계속 볼 수 있도록
      }, 300);
    }
  }, [typingMessageId, messages, currentStep]);

  // 상태 자동 저장 (변경 시마다)
  useEffect(() => {
    // 초기화 전에는 저장하지 않음
    if (!isInitializedRef.current || messages.length === 0) return;

    savePriorityState();
  }, [messages, currentStep, prioritySettings, budget, selectedProsTags, selectedConsTags, selectedAdditionalTags, filteredProducts, hasUserInput, additionalInput, showFloatingButtons, savePriorityState]);

  // 메시지 추가 헬퍼
  const addMessage = (role: 'assistant' | 'user', content: string, withTyping = false) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      typing: withTyping,
    };
    setMessages((prev) => [...prev, newMessage]);

    if (withTyping) {
      setTypingMessageId(newMessage.id);
    }
  };

  // 컴포넌트 메시지 추가
  const addComponentMessage = (componentType: 'pros-selector' | 'cons-selector' | 'additional-selector' | 'budget-selector' | 'product-list' | 'summary' | 'summary-loading', content?: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'component',
      content: content || '',
      componentType,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // 스크롤 to bottom (수동으로만 사용)
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Tag 선택 핸들러
  const handleProsTagToggle = (tagId: string) => {
    setSelectedProsTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      } else {
        return [...prev, tagId];
      }
    });
    // 태그 텍스트 찾아서 로깅
    const tag = PROS_TAGS.find(t => t.id === tagId);
    const tagText = tag?.text || tagId;
    logButtonClick(`장점 태그 선택: ${tagText}`, 'priority');
  };

  const handleConsTagToggle = (tagId: string) => {
    setSelectedConsTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      } else {
        return [...prev, tagId];
      }
    });
    // 태그 텍스트 찾아서 로깅
    const tag = CONS_TAGS.find(t => t.id === tagId);
    const tagText = tag?.text || tagId;
    logButtonClick(`단점 태그 선택: ${tagText}`, 'priority');
  };

  const handleAdditionalTagToggle = (tagId: string) => {
    setSelectedAdditionalTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      } else {
        // 최대 3개까지만 선택 가능
        if (prev.length >= TAG_SELECTION_LIMITS.additional.max) {
          return prev;
        }
        return [...prev, tagId];
      }
    });
    // 태그 텍스트 찾아서 로깅
    const tag = ADDITIONAL_TAGS.find(t => t.id === tagId);
    const tagText = tag?.text || tagId;
    logButtonClick(`추가 고려사항 태그 선택: ${tagText}`, 'priority');
  };

  // Step 1 (Pros) → Step 2 (Cons)
  const handleStep1Next = () => {
    if (selectedProsTags.length < TAG_SELECTION_LIMITS.pros.min) {
      alert(`최소 ${TAG_SELECTION_LIMITS.pros.min}개의 장점을 선택해주세요.`);
      return;
    }

    logButtonClick('Step 1 → Step 2 (Pros → Cons)', 'priority');

    setCurrentStep(2);

    // Step 2 메시지 + 컴포넌트 동시에 추가 (extraMarginTop 추가)
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'assistant',
      content: '좋아요! 이제 **절대 타협할 수 없는 단점**을 선택해주세요. (최대 4개, 없으면 건너뛰어도 됩니다)',
      typing: true,
      extraMarginTop: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setTypingMessageId(newMessage.id);

    setTimeout(() => {
      addComponentMessage('cons-selector');
    }, 500);

    // 새 메시지가 헤더 바로 아래에 오도록 스크롤
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${newMessage.id}"]`) as HTMLElement;
      if (messageElement && mainScrollRef.current) {
        const elementTop = messageElement.offsetTop;
        const headerOffset = 90; // 헤더 높이 + 약간의 여백
        mainScrollRef.current.scrollTo({
          top: elementTop - headerOffset,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // Step 2 (Cons) → Step 3 (Additional)
  const handleStep2Next = () => {
    // 단점은 선택적이므로 validation 불필요
    logButtonClick('Step 2 → Step 3 (Cons → Additional)', 'priority');
    setCurrentStep(3);

    // Step 3 메시지 + 컴포넌트 동시에 추가
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'assistant',
      content: '혹시 이런 부분도 고려하시나요? 없으면 건너뛰어도 괜찮아요.',
      typing: true,
      extraMarginTop: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setTypingMessageId(newMessage.id);

    setTimeout(() => {
      addComponentMessage('additional-selector');
    }, 500);

    // 새 메시지가 헤더 바로 아래에 오도록 스크롤
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${newMessage.id}"]`) as HTMLElement;
      if (messageElement && mainScrollRef.current) {
        const elementTop = messageElement.offsetTop;
        const headerOffset = 90; // 헤더 높이 + 약간의 여백
        mainScrollRef.current.scrollTo({
          top: elementTop - headerOffset,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // LLM API 호출: 사용자 조건 요약 생성
  const generatePrioritySummary = async (
    prosTags: string[],
    consTags: string[],
    additionalTags: string[],
    budgetRange: BudgetRange | string
  ): Promise<string> => {
    try {
      // 태그 ID를 텍스트로 변환
      const prosTexts = prosTags.map(id => PROS_TAGS.find(t => t.id === id)?.text).filter(Boolean);
      const consTexts = consTags.map(id => CONS_TAGS.find(t => t.id === id)?.text).filter(Boolean);
      const additionalTexts = additionalTags.map(id => ADDITIONAL_TAGS.find(t => t.id === id)?.text).filter(Boolean);

      // 예산 텍스트 변환
      let budgetText = '';
      if (budgetRange === '0-50000') budgetText = '5만원 이하';
      else if (budgetRange === '50000-100000') budgetText = '5~10만원';
      else if (budgetRange === '100000-150000') budgetText = '10~15만원';
      else if (budgetRange === '150000+') budgetText = '15만원 이상';
      else budgetText = budgetRange as string;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_priority_summary',
          prosTexts,
          consTexts,
          additionalTexts,
          budgetText
        })
      });

      if (!response.ok) {
        throw new Error('Summary 생성 실패');
      }

      const data = await response.json();
      return data.summary || '조건을 정리하고 있습니다...';
    } catch (error) {
      console.error('Summary 생성 에러:', error);
      throw error;
    }
  };

  // Step 3 (Additional) → Step 4 (Budget)
  const handleStep3Next = () => {
    // 추가 고려사항은 선택적이므로 validation 불필요
    logButtonClick('Step 3 → Step 4 (Additional → Budget)', 'priority');
    setCurrentStep(4);

    // Priority 설정 자동 변환 (Pros + Cons + Additional 모두 반영)
    const convertedPriority = convertTagsToPriority(selectedProsTags, selectedConsTags, selectedAdditionalTags);
    setPrioritySettings(convertedPriority);
    console.log('✅ Priority 자동 변환:', convertedPriority);

    // Step 4 메시지 + 컴포넌트 동시에 추가
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'assistant',
      content: '이제 사용 가능한 예산을 선택해주세요.',
      typing: true,
      extraMarginTop: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setTypingMessageId(newMessage.id);

    setTimeout(() => {
      addComponentMessage('budget-selector');
    }, 500);

    // 새 메시지가 헤더 바로 아래에 오도록 스크롤
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${newMessage.id}"]`) as HTMLElement;
      if (messageElement && mainScrollRef.current) {
        const elementTop = messageElement.offsetTop;
        const headerOffset = 90; // 헤더 높이 + 약간의 여백
        mainScrollRef.current.scrollTo({
          top: elementTop - headerOffset,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // Step 4 (Budget) → Step 5 (User Summary)
  const handleStep4Next = async () => {
    if (!budget) {
      alert('예산 범위를 선택해주세요.');
      return;
    }

    logButtonClick('Step 4 → Step 5 (Budget → Summary)', 'priority');
    setCurrentStep(5);
    setShowFloatingButtons(false); // 초기화

    // Priority 설정은 이미 Step 3에서 변환되었음
    console.log('✅ Priority settings:', prioritySettings);
    console.log('✅ Budget:', budget);

    // Step 5 메시지 추가 - 조건 이해 완료
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'assistant',
      content: '좋아요! 아래와 같이 사용자님의 조건을 이해했어요.',
      typing: true,
      extraMarginTop: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setTypingMessageId(newMessage.id);

    // 새 섹션 메시지를 헤더 아래에 위치시키기
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${newMessage.id}"]`) as HTMLElement;
      if (messageElement && mainScrollRef.current) {
        const elementTop = messageElement.offsetTop;
        const headerOffset = 90; // 헤더 높이 + 약간의 여백
        mainScrollRef.current.scrollTo({
          top: elementTop - headerOffset,
          behavior: 'smooth'
        });
      }
    }, 100);

    setTimeout(async () => {
      try {
        // 스켈레톤 로딩 추가
        const loadingMessageId = Date.now().toString() + Math.random();
        const loadingMessage: ChatMessage = {
          id: loadingMessageId,
          role: 'component',
          content: '',
          componentType: 'summary-loading',
        };
        setMessages((prev) => [...prev, loadingMessage]);

        // 스켈레톤을 헤더 아래로 스크롤 (Step 1-4와 동일)
        setTimeout(() => {
          const messageElement = document.querySelector(`[data-message-id="${loadingMessageId}"]`) as HTMLElement;
          if (messageElement && mainScrollRef.current) {
            const elementTop = messageElement.offsetTop;
            const headerOffset = 90; // 헤더 높이 + 약간의 여백
            mainScrollRef.current.scrollTo({
              top: elementTop - headerOffset,
              behavior: 'smooth'
            });
          }
        }, 100);

        // LLM API 호출해서 사용자 조건 요약 생성
        const summary = await generatePrioritySummary(
          selectedProsTags,
          selectedConsTags,
          selectedAdditionalTags,
          budget
        );

        // 로딩 메시지 제거
        setMessages((prev) => prev.filter((msg) => msg.componentType !== 'summary-loading'));

        // Summary 컴포넌트 추가 (요약 내용 포함)
        addComponentMessage('summary', summary);
        // 스크롤 유지 - 스켈레톤 위치에서 그대로

        // "마지막으로 말씀하실 조건이 있으시면 말해주세요!" 메시지 추가
        setTimeout(() => {
          addMessage('assistant', '마지막으로 말씀하실 조건이 있으시면 말해주세요!', true);
          setTimeout(() => {
            scrollToBottom();
            // 플로팅 버튼 표시
            setShowFloatingButtons(true);
          }, 500);
        }, 800);
      } catch (error) {
        console.error('❌ Summary 생성 실패:', error);
        // 로딩 메시지 제거
        setMessages((prev) => prev.filter((msg) => msg.componentType !== 'summary-loading'));
        // 에러 발생 시 기본 메시지 표시
        addMessage('assistant', '마지막으로 말씀하실 조건이 있으시면 말해주세요!', true);
        setTimeout(() => setShowFloatingButtons(true), 500);
      }
    }, 800);
  };

  // 예산 선택
  const handleBudgetSelect = (budgetRange: BudgetRange) => {
    setBudget(budgetRange);
    setIsCustomBudgetMode(false);
    setCustomBudget('');
    logButtonClick(`예산 선택: ${budgetRange}`, 'priority');
  };

  // Step 3: 상품 클릭 (제품 정보 바텀시트 열기)
  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setProductBottomSheetOpen(true);
    logButtonClick(`상품 클릭: ${product.title}`, 'priority');
  };

  // Step 3: 정렬 타입 변경
  const handleSortChange = (type: 'score' | 'price') => {
    setSortType(type);
    logButtonClick(`정렬 변경: ${type === 'score' ? '적합도순' : '낮은가격순'}`, 'priority');
  };

  // 주관식 예산 제출
  const handleCustomBudgetSubmit = () => {
    const trimmed = customBudget.trim();
    if (!trimmed) {
      alert('예산을 입력해주세요.');
      return;
    }

    setBudget(trimmed);
    setIsCustomBudgetMode(false);
    logButtonClick(`주관식 예산 입력: ${trimmed}`, 'priority');
  };

  // Step 3: 메시지 전송 (1회만 가능)
  const handleSendMessage = async () => {
    if (!input.trim() || hasUserInput) return;

    const userInput = input.trim();
    addMessage('user', userInput);
    setInput('');
    setAdditionalInput(userInput);
    setHasUserInput(true);
    setIsStep5Complete(true); // Step 5 완료 (프로그레스바 100%)

    // AI 확인 메시지
    setTimeout(() => {
      addMessage('assistant', '알겠습니다! 이제 **추천받기** 버튼을 눌러주세요. 😊', true);
    }, 500);

    logButtonClick('추가 입력 제출', 'priority');
  };

  // Step 3: 없어요 버튼 (추가 입력 스킵)
  const handleSkip = () => {
    setHasUserInput(true);
    setIsStep5Complete(true); // Step 5 완료 (프로그레스바 100%)
    addMessage('user', '없어요');
    setTimeout(() => {
      addMessage('assistant', '좋아요! 이제 **추천받기** 버튼을 눌러주세요. 😊', true);
    }, 300);
    logButtonClick('추가 입력 스킵 (없어요)', 'priority');
  };

  // 최종 제출
  const handleFinalSubmit = () => {
    if (!budget) {
      alert('예산을 선택해주세요.');
      return;
    }

    const session = loadSession();

    let updatedSession: import('@/types').SessionState = {
      ...session,
      messages: [],
      phase0Context: additionalInput || undefined,  // 추가 입력을 phase0Context로 전달
      currentAttribute: 0,
      attributeAssessments: {
        temperatureControl: null,
        hygiene: null,
        material: null,
        usability: null,
        portability: null,
        priceValue: null,
        durability: null,
        additionalFeatures: null,
      },
      additionalContext: [],
      accuracy: 0,
      chatConversations: undefined,
      budget: budget,
      // Tag 데이터 (Pros + Cons + Additional 모두 포함)
      selectedProsTags: selectedProsTags,
      selectedConsTags: selectedConsTags,
      selectedAdditionalTags: selectedAdditionalTags,
      // Step 5 데이터
      additionalInput: additionalInput || undefined,
      top10Products: filteredProducts.length > 0 ? filteredProducts : undefined,
    };

    updatedSession = savePrioritySettings(updatedSession, prioritySettings);
    updatedSession = setQuickRecommendation(updatedSession, true);
    saveSession(updatedSession);

    logButtonClick('바로 추천받기 (최종)', 'priority');
    router.push('/result');
  };

  // 처음부터 다시 시작
  const handleReset = () => {
    if (confirm('처음부터 다시 시작하시겠어요?')) {
      // 저장된 상태 클리어
      clearPriorityState();

      // 상태 초기화
      setCurrentStep(1);
      setPrioritySettings(DEFAULT_PRIORITY);
      setBudget(DEFAULT_BUDGET);
      setCustomBudget('');
      setIsCustomBudgetMode(false);
      setInput('');
      setTypingMessageId(null);

      // Tag 상태 초기화
      setSelectedProsTags([]);
      setSelectedConsTags([]);
      setSelectedAdditionalTags([]);

      // Step 5 상태 초기화
      setFilteredProducts([]);
      setSortType('score');
      setHasUserInput(false);
      setAdditionalInput('');
      setSelectedProduct(null);
      setProductBottomSheetOpen(false);
      setShowFloatingButtons(false);
      setIsStep5Complete(false); // 프로그레스바 초기화

      // 초기 메시지로 재설정
      const initialMessages: ChatMessage[] = [
        {
          id: `msg-${Date.now()}-1`,
          role: 'assistant',
          content: '안녕하세요! 딱 맞는 분유포트를 찾아드릴게요. 😊\n\n\n가장 잘 나가는 국민템의 내돈내산 후기를 기반으로, 사용자님의 취향을 파악할게요.\n\n먼저 **포기할 수 없는 장점**을 선택해주세요! (최대 5개)',
          typing: true,
        },
        {
          id: `msg-${Date.now()}-2`,
          role: 'component',
          content: '',
          componentType: 'pros-selector',
        },
      ];
      setMessages(initialMessages);
    }
  };

  // Step 완료 조건
  const isStep1Complete = selectedProsTags.length >= TAG_SELECTION_LIMITS.pros.min; // 최소값만 체크, 최대값은 태그 자체에서 제어
  const isStep2Complete = true; // 단점은 선택적이므로 항상 완료
  const isStep3Complete = true; // 추가 고려사항은 선택적이므로 항상 완료
  const isStep4Complete = !!budget;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] h-dvh overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div className="px-5 py-3 flex items-center justify-between">
            <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              <CaretLeft size={24} weight="bold" />
            </Link>
            <button
              onClick={handleReset}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors px-0 py-1 rounded-lg hover:bg-gray-100"
            >
              처음부터
            </button>
          </div>
          {/* Progress Bar */}
          <div className="w-full h-1 bg-gray-200">
            <div
              className="h-full bg-[#0074F3] transition-all duration-300"
              style={{ width: `${isStep5Complete ? 100 : (currentStep - 1) * 20}%` }}
            />
          </div>
        </header>

        {/* Messages Area - Scrollable */}
        <main ref={mainScrollRef} className="flex-1 px-3 py-6 overflow-y-auto" style={{ paddingTop: '80px', paddingBottom: currentStep === 5 ? '140px' : '60vh', minHeight: 0 }}>
          <div className="space-y-2">
            {messages.map((message) => {
              // Assistant 메시지
              if (message.role === 'assistant') {
                return (
                  <motion.div
                    key={message.id}
                    data-message-id={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`w-full flex justify-start ${message.extraMarginTop ? 'mt-6' : ''}`}
                  >
                    <div className="px-1 py-1 text-gray-900 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-base">
                      {message.typing && typingMessageId === message.id ? (
                        <TypingMessage
                          content={message.content}
                          onUpdate={message.extraMarginTop ? undefined : scrollToBottom}
                          onComplete={() => setTypingMessageId(null)}
                        />
                      ) : (
                        formatMarkdown(message.content)
                      )}
                    </div>
                  </motion.div>
                );
              }

              // User 메시지
              if (message.role === 'user') {
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex justify-end"
                  >
                    <div className="max-w-[90%] px-4 py-2.5 bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-base">
                      {message.content}
                    </div>
                  </motion.div>
                );
              }

              // Component 메시지
              if (message.role === 'component') {
                // Pros Selector (Step 1)
                if (message.componentType === 'pros-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className={`space-y-3 ${currentStep >= 2 ? 'opacity-50 pointer-events-none' : ''}`}>
                        {ANCHOR_PRODUCTS.map((anchor, index) => {
                          const product = anchorProducts.find((p) => p.id === anchor.id);
                          if (!product) return null;

                          // 해당 상품의 장점 태그들만 필터링
                          const productProsTags = PROS_TAGS
                            .filter((tag) => tag.sourceProduct === anchor.id)
                            .map((tag) => ({
                              id: tag.id,
                              text: tag.text,
                              popular: (POPULAR_TAG_IDS.pros as readonly string[]).includes(tag.id)
                            }));

                          const rankingLabel = anchor.type === 'ranking'
                            ? '국민템 1위'
                            : anchor.type === 'value'
                            ? '가성비 1위'
                            : '프리미엄 1위';

                          return (
                            <motion.div
                              key={anchor.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: index * 0.1 }}
                            >
                              <ProductTagCard
                                product={product}
                                tags={productProsTags}
                                selectedTagIds={selectedProsTags}
                                onTagToggle={handleProsTagToggle}
                                type="pros"
                                disabled={currentStep >= 2}
                                label={rankingLabel}
                              />
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                }

                // Cons Selector (Step 2)
                if (message.componentType === 'cons-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className={`space-y-3 ${currentStep >= 3 ? 'opacity-50 pointer-events-none' : ''}`}>
                        {ANCHOR_PRODUCTS.map((anchor, index) => {
                          const product = anchorProducts.find((p) => p.id === anchor.id);
                          if (!product) return null;

                          // 해당 상품의 단점 태그들만 필터링
                          const productConsTags = CONS_TAGS
                            .filter((tag) => tag.sourceProduct === anchor.id)
                            .map((tag) => ({
                              id: tag.id,
                              text: tag.text,
                              popular: (POPULAR_TAG_IDS.cons as readonly string[]).includes(tag.id)
                            }));

                          const rankingLabel = anchor.type === 'ranking'
                            ? '국민템 1위'
                            : anchor.type === 'value'
                            ? '가성비 1위'
                            : '프리미엄 1위';

                          return (
                            <motion.div
                              key={anchor.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: index * 0.1 }}
                            >
                              <ProductTagCard
                                product={product}
                                tags={productConsTags}
                                selectedTagIds={selectedConsTags}
                                onTagToggle={handleConsTagToggle}
                                type="cons"
                                disabled={currentStep >= 3}
                                label={rankingLabel}
                              />
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                }

                // Additional Selector (Step 3)
                if (message.componentType === 'additional-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className={`bg-white border border-gray-200 rounded-2xl p-4 space-y-3 ${currentStep >= 4 ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">💡</span>
                          <h3 className="text-sm font-bold text-gray-900">추가 고려사항</h3>
                        </div>

                        {/* 추가 태그들을 가로 2줄 스크롤로 표시 */}
                        <div className="w-full overflow-x-auto scrollbar-hide">
                          <div className="grid grid-rows-2 grid-flow-col gap-2">
                            {ADDITIONAL_TAGS.map((tag) => {
                              const isSelected = selectedAdditionalTags.includes(tag.id);
                              const isMaxReached = selectedAdditionalTags.length >= TAG_SELECTION_LIMITS.additional.max && !isSelected;

                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => !isMaxReached && handleAdditionalTagToggle(tag.id)}
                                  disabled={isMaxReached}
                                  className={`flex-shrink-0 w-fit px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
                                    isSelected
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                      : isMaxReached
                                      ? 'bg-gray-50 text-gray-300 border-transparent opacity-70 cursor-not-allowed'
                                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200 border-transparent'
                                  }`}
                                >
                                  {tag.text}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Budget Selector
                if (message.componentType === 'budget-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className={`bg-white border border-gray-200 rounded-2xl p-4 space-y-3 ${currentStep >= 5 ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xl">💰</span>
                          <h3 className="text-sm font-bold text-gray-900">예산</h3>
                        </div>

                        {/* 2x2 Grid for budget buttons */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <button
                            onClick={() => handleBudgetSelect('0-50000')}
                            className={`p-3 rounded-xl text-left transition-all border ${
                              budget === '0-50000'
                                ? ''
                                : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                            }`}
                            style={budget === '0-50000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                          >
                            <div className="font-semibold text-sm mb-0.5">5만원 이하</div>
                            <div className={`text-xs ${budget === '0-50000' ? 'opacity-70' : 'text-gray-500'}`}>
                              기본 기능
                            </div>
                          </button>

                          <button
                            onClick={() => handleBudgetSelect('50000-100000')}
                            className={`p-3 rounded-xl text-left transition-all border relative ${
                              budget === '50000-100000'
                                ? ''
                                : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                            }`}
                            style={budget === '50000-100000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-semibold text-sm">5~10만원</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${budget === '50000-100000' ? 'bg-white text-gray-900' : ''}`} style={budget !== '50000-100000' ? { backgroundColor: '#EAF8F8', color: '#009896' } : {}}>
                                인기
                              </span>
                            </div>
                            <div className={`text-xs ${budget === '50000-100000' ? 'opacity-70' : 'text-gray-500'}`}>
                              더 좋은 소재+편의 기능
                            </div>
                          </button>

                          <button
                            onClick={() => handleBudgetSelect('100000-150000')}
                            className={`p-3 rounded-xl text-left transition-all border ${
                              budget === '100000-150000'
                                ? ''
                                : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                            }`}
                            style={budget === '100000-150000' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                          >
                            <div className="font-semibold text-sm mb-0.5">10~15만원</div>
                            <div className={`text-xs ${budget === '100000-150000' ? 'opacity-70' : 'text-gray-500'}`}>
                              프리미엄 기능
                            </div>
                          </button>

                          <button
                            onClick={() => handleBudgetSelect('150000+')}
                            className={`p-3 rounded-xl text-left transition-all border ${
                              budget === '150000+'
                                ? ''
                                : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                            }`}
                            style={budget === '150000+' ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                          >
                            <div className="font-semibold text-sm mb-0.5">15만원 이상</div>
                            <div className={`text-xs ${budget === '150000+' ? 'opacity-70' : 'text-gray-500'}`}>
                              최고급
                            </div>
                          </button>
                        </div>

                        {/* 직접 입력 */}
                        {!isCustomBudgetMode && budget && !['0-50000', '50000-100000', '100000-150000', '150000+'].includes(budget) ? (
                          <button
                            onClick={() => setIsCustomBudgetMode(true)}
                            className="w-full p-3 rounded-xl text-left transition-all border text-white"
                            style={{ borderColor: '#B8DCFF', backgroundColor: '#0084FE' }}
                          >
                            <div className="font-semibold text-sm mb-0.5">직접 입력</div>
                            <div className="text-xs opacity-80">{budget}</div>
                          </button>
                        ) : !isCustomBudgetMode ? (
                          <button
                            onClick={() => setIsCustomBudgetMode(true)}
                            className="w-full p-3 rounded-xl text-left transition-all border border-dashed border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                          >
                            <div className="font-semibold text-sm">직접 입력</div>
                          </button>
                        ) : (
                          <div className="w-full p-3 rounded-xl border bg-white" style={{ borderColor: '#B8DCFF' }}>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customBudget}
                                onChange={(e) => setCustomBudget(e.target.value)}
                                placeholder="직접 입력 (예: 4만원~6만원)"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 text-gray-900"
                                style={{ fontSize: '16px', '--tw-ring-color': '#B8DCFF' } as React.CSSProperties}
                                autoFocus
                              />
                              <button
                                onClick={handleCustomBudgetSubmit}
                                className="px-4 py-2 text-white rounded-lg font-semibold text-sm transition-colors"
                                style={{ backgroundColor: '#0084FE' }}
                              >
                                확인
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                }

                // Summary Loading (Skeleton)
                if (message.componentType === 'summary-loading') {
                  return (
                    <motion.div
                      key={message.id}
                      data-message-id={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className="bg-blue-50 rounded-2xl p-4 space-y-3">
                        {/* 스켈레톤 라인들 */}
                        <div className="space-y-2.5">
                          <div className="h-3.5 bg-blue-200/60 rounded-lg animate-pulse" style={{ width: '85%' }} />
                          <div className="h-3.5 bg-blue-200/60 rounded-lg animate-pulse" style={{ width: '92%' }} />
                          <div className="h-3.5 bg-blue-200/60 rounded-lg animate-pulse" style={{ width: '78%' }} />
                          <div className="h-3.5 bg-blue-200/60 rounded-lg animate-pulse" style={{ width: '88%' }} />
                          <div className="h-3.5 bg-blue-200/60 rounded-lg animate-pulse" style={{ width: '65%' }} />
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Summary (Step 5)
                if (message.componentType === 'summary') {
                  return (
                    <motion.div
                      key={message.id}
                      data-message-id={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className="bg-blue-50 rounded-2xl p-4">
                        <div className="text-sm text-gray-900 whitespace-pre-wrap">
                          {formatMarkdown(message.content)}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Product List (Step 3)
                if (message.componentType === 'product-list') {
                  // 정렬된 상품 리스트 가져오기
                  const sortedProducts = sortType === 'score'
                    ? sortByScore(filteredProducts)
                    : sortByPrice(filteredProducts);

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full space-y-3"
                    >
                      {/* Sorting Tabs */}
                      <div className="flex gap-8 justify-center">
                        <button
                          onClick={() => handleSortChange('score')}
                          className={`py-2 text-center relative text-sm ${
                            sortType === 'score'
                              ? 'text-gray-900 font-semibold'
                              : 'text-gray-400 font-medium'
                          }`}
                        >
                          적합도순
                          {sortType === 'score' && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gray-900" />
                          )}
                        </button>
                        <button
                          onClick={() => handleSortChange('price')}
                          className={`py-2 text-center relative text-sm ${
                            sortType === 'price'
                              ? 'text-gray-900 font-semibold'
                              : 'text-gray-400 font-medium'
                          }`}
                        >
                          낮은가격순
                          {sortType === 'price' && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gray-900" />
                          )}
                        </button>
                      </div>

                      {/* Product List - 가로 스크롤 (3개씩 3페이지) */}
                      <div className="w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-16">
                        <div className="flex gap-4">
                          {/* Page 1: 상품 0-2 */}
                          <div className="w-[85%] flex-shrink-0 snap-center space-y-2">
                            {sortedProducts.slice(0, 3).map((product, index) => (
                              <ProductListItem
                                key={product.id}
                                product={product}
                                index={index}
                                onClick={handleProductClick}
                              />
                            ))}
                          </div>

                          {/* Page 2: 상품 3-5 */}
                          <div className="w-[85%] flex-shrink-0 snap-center space-y-2">
                            {sortedProducts.slice(3, 6).map((product, index) => (
                              <ProductListItem
                                key={product.id}
                                product={product}
                                index={index + 3}
                                onClick={handleProductClick}
                              />
                            ))}
                          </div>

                          {/* Page 3: 상품 6-8 */}
                          <div className="w-[85%] flex-shrink-0 snap-center space-y-2">
                            {sortedProducts.slice(6, 9).map((product, index) => (
                              <ProductListItem
                                key={product.id}
                                product={product}
                                index={index + 6}
                                onClick={handleProductClick}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }
              }

              return null;
            })}


            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Bottom Area - Fixed */}
        <div className="fixed bottom-0 left-0 right-0 px-3 py-4 z-10" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {/* Step 1: Pros 선택 - 다음 버튼 */}
          {currentStep === 1 && (
            <motion.button
              whileHover={isStep1Complete ? { scale: 1.02 } : {}}
              whileTap={isStep1Complete ? { scale: 0.98 } : {}}
              onClick={handleStep1Next}
              disabled={!isStep1Complete}
              className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
                isStep1Complete
                  ? 'bg-[#0084FE] text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              다음
            </motion.button>
          )}

          {/* Step 2: Cons 선택 - 다음 버튼 (항상 활성화) */}
          {currentStep === 2 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStep2Next}
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all"
            >
              다음
            </motion.button>
          )}

          {/* Step 3: Additional 선택 - 다음 버튼 (항상 활성화) */}
          {currentStep === 3 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStep3Next}
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all"
            >
              다음
            </motion.button>
          )}

          {/* Step 4: Budget 선택 - 다음 버튼 */}
          {currentStep === 4 && budget && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStep4Next}
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all"
            >
              다음
            </motion.button>
          )}

          {/* Step 5: 입력 bar + 없어요 버튼 + 추천하기 버튼 */}
          {currentStep === 5 && showFloatingButtons && (
            <div className="space-y-3">
              {/* 입력창 + 없어요 버튼 (1회만 표시) */}
              {!hasUserInput && (
                <>
                  {/* 없어요 버튼 */}
                  <div className="flex justify-start">
                    <button
                      onClick={handleSkip}
                      className="px-4 py-2 bg-[#0084FE] text-white rounded-full font-bold text-sm hover:opacity-90 transition-all"
                    >
                      없어요
                    </button>
                  </div>

                  {/* 입력창 */}
                  <div className="flex gap-2 items-end">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="추가로 고려할 상황을 입력해주세요"
                      rows={1}
                      className="flex-1 min-h-12 max-h-[120px] px-4 py-3 bg-white border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-y-auto scrollbar-hide text-gray-900 text-sm"
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!input.trim()}
                      className="w-12 h-12 bg-[#0074F3] text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </button>
                  </div>
                </>
              )}

              {/* 추천받기 버튼 (입력 후에만 표시) */}
              {hasUserInput && (
                <button
                  onClick={handleFinalSubmit}
                  className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 hover:opacity-90"
                >
                  <span>추천받기</span>
                  <span className="px-2 py-0.5 bg-white/20 rounded-md text-xs font-bold flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    <span>AI</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Attribute Bottom Sheet */}
        <AttributeBottomSheet
          isOpen={bottomSheetOpen}
          attribute={selectedAttribute}
          onClose={() => setBottomSheetOpen(false)}
        />

        {/* Guide Bottom Sheet */}
        <GuideBottomSheet
          isOpen={guideBottomSheetOpen}
          onClose={() => {
            setGuideBottomSheetOpen(false);
            localStorage.setItem('babyitem_guide_viewed', 'true');
          }}
        />

        {/* Product Bottom Sheet (Step 3) */}
        {selectedProduct && (
          <ProductBottomSheet
            isOpen={productBottomSheetOpen}
            product={selectedProduct}
            onClose={() => setProductBottomSheetOpen(false)}
            fromPage="/priority"
          />
        )}
      </div>
    </div>
  );
}

export default function PriorityPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      </div>
    }>
      <PriorityPageContent />
    </Suspense>
  );
}
