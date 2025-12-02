'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react/dist/ssr';
import { Category, CATEGORY_NAMES, CATEGORY_BUDGET_OPTIONS, BudgetOption, ProductWithReviews } from '@/lib/data';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';
import {
  logPageView,
  logButtonClick,
  logTagSelection,
  logCustomTagCreation
} from '@/lib/logging/clientLogger';
import { GuideBottomSheet } from '@/components/GuideBottomSheet';

interface Tag {
  id: string;
  text: string;
  mentionCount?: number;
  attributes: Record<string, number>; // Attribute key → weight (0.3-1.0)
}

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user' | 'component';
  content: string;
  componentType?: 'anchor-product-card' | 'pros-selector' | 'cons-selector' | 'budget-selector' | 'loading-skeleton';
  typing?: boolean;
  extraMarginTop?: boolean;
  stepTag?: string; // Step 태그 (1/3, 2/3, 3/3)
};

type ChatStep = 0 | 1 | 2 | 3 | 4; // 0: 로딩, 1: 장점, 2: 단점, 3: 예산, 4: 완료

// 마크다운 볼드 처리 함수 (Priority 페이지에서 가져옴)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
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

function TagsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') as Category;
  const anchorIdFromUrl = searchParams.get('anchorId');
  const productTitleFromUrl = searchParams.get('productTitle') || '';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const initialMessageIdRef = useRef<string | null>(null);
  const hasGeneratedRef = useRef(false);

  // 기본 상태
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<ChatStep>(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // 제품 및 태그 상태
  const [anchorId, setAnchorId] = useState<string | null>(anchorIdFromUrl);
  const [anchorProduct, setAnchorProduct] = useState<ProductWithReviews | null>(null);
  const [productTitle, setProductTitle] = useState(productTitleFromUrl);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [prosTags, setProsTags] = useState<Tag[]>([]);
  const [consTags, setConsTags] = useState<Tag[]>([]);
  const [selectedPros, setSelectedPros] = useState<Tag[]>([]);
  const [selectedCons, setSelectedCons] = useState<Tag[]>([]);

  // 예산 상태
  const [budget, setBudget] = useState<string>('');
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isParsingBudget, setIsParsingBudget] = useState(false);
  const [parsedBudgetDisplay, setParsedBudgetDisplay] = useState<string>('');

  // 커스텀 태그 상태
  const [customProsInput, setCustomProsInput] = useState('');
  const [customConsInput, setCustomConsInput] = useState('');
  const [isAddingCustomPros, setIsAddingCustomPros] = useState(false);
  const [isAddingCustomCons, setIsAddingCustomCons] = useState(false);
  const [isAnalyzingCustomTag, setIsAnalyzingCustomTag] = useState(false);

  // UI 상태
  const [error, setError] = useState('');
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);
  const [showProductChangeModal, setShowProductChangeModal] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // 제품 리스트 모달 상태
  const [products, setProducts] = useState<ProductWithReviews[]>([]);
  const [showProductList, setShowProductList] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [displayedProductCount, setDisplayedProductCount] = useState(20);
  const [isSearching, setIsSearching] = useState(false);

  // 카테고리별 예산 옵션
  const budgetOptions: BudgetOption[] = category ? CATEGORY_BUDGET_OPTIONS[category] : [];

  // 상태 저장 함수
  const saveConversationState = useCallback(() => {
    const state = {
      messages,
      currentStep,
      anchorId,
      productTitle,
      reviewCount,
      prosTags,
      consTags,
      selectedPros,
      selectedCons,
      budget,
      customBudget,
      isCustomMode,
      scrollPosition: mainScrollRef.current?.scrollTop || 0,
    };
    sessionStorage.setItem('tag_conversation_state', JSON.stringify(state));
    console.log('💾 Tags 대화 상태 저장됨');
  }, [messages, currentStep, anchorId, productTitle, reviewCount, prosTags, consTags, selectedPros, selectedCons, budget, customBudget, isCustomMode]);

  // 상태 복원 함수
  const loadConversationState = () => {
    const saved = sessionStorage.getItem('tag_conversation_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        console.log('📂 Tags 대화 상태 복원됨');
        return state;
      } catch (e) {
        console.error('❌ Tags 대화 상태 복원 실패:', e);
        return null;
      }
    }
    return null;
  };

  // 상태 클리어 함수
  const clearConversationState = () => {
    sessionStorage.removeItem('tag_conversation_state');
    console.log('🗑️ Tags 대화 상태 클리어됨');
  };

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
  const addComponentMessage = (componentType: ChatMessage['componentType'], content?: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'component',
      content: content || '',
      componentType,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // 스크롤 to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 전체 제품 로드 (카테고리별)
  const loadAllProducts = async () => {
    try {
      setLoading(true);
      console.log('🔍 전체 제품 로딩 시작:', category);
      const response = await fetch(`/api/anchor-products?category=${category}`);
      const data = await response.json();

      if (data.success && data.products) {
        setProducts(data.products);
        console.log('✅ 전체 제품 로드 완료:', data.products.length, '개');

        // 랭킹 1위 제품 자동 선택
        if (data.products.length > 0 && !anchorIdFromUrl) {
          const topProduct = data.products[0];
          setAnchorId(topProduct.productId);
          setAnchorProduct(topProduct);
          setProductTitle(topProduct.모델명 || topProduct.제품명);
          console.log('✅ 랭킹 1위 제품 자동 선택:', topProduct.모델명);

          // 가이드 자동 표시 (500ms 후)
          setTimeout(() => setIsGuideOpen(true), 500);

          return topProduct.productId;
        }

        return data.products.length > 0 ? data.products[0].productId : null;
      }
    } catch (error) {
      console.error('❌ 전체 제품 로드 실패:', error);
    } finally {
      setLoading(false);
    }
    return null;
  };

  // 제품 데이터 로드 (anchorId로 API 호출)
  const loadProductData = async (productId: string) => {
    try {
      console.log('🔍 제품 로딩 시작:', productId);
      const response = await fetch(`/api/anchor-products?category=${category}&productId=${productId}`);
      const data = await response.json();

      if (data.success && data.product) {
        setAnchorProduct(data.product);
        setProductTitle(data.product.모델명 || data.product.제품명);
        console.log('✅ 제품 데이터 로드 완료:', data.product.모델명);
        return data.product;
      } else {
        console.error('❌ 제품을 찾을 수 없습니다:', productId);
      }
    } catch (error) {
      console.error('제품 데이터 로드 실패:', error);
    }
    return null;
  };

  // 태그 생성 API 호출
  const generateTags = async (productId: string, productTitleParam: string) => {
    try {
      setError('');

      // 제품 데이터 먼저 로드
      loadProductData(productId);

      const response = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, productId, productTitle: productTitleParam }),
      });

      const data = await response.json();

      if (data.success) {
        // Sort by mentionCount (descending)
        const sortedPros = [...data.pros].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
        const sortedCons = [...data.cons].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));

        setProsTags(sortedPros);
        setConsTags(sortedCons);

        // 리뷰 개수 저장
        if (data.reviewCount) {
          setReviewCount(data.reviewCount);
        }

        return { success: true, pros: sortedPros, cons: sortedCons };
      } else {
        setError(data.error || '태그 생성 실패');
        return { success: false };
      }
    } catch (err) {
      setError('태그 생성 중 오류가 발생했습니다');
      console.error(err);
      return { success: false };
    }
  };

  // 태그 선택 토글 함수들
  const toggleProsTag = (tag: Tag) => {
    const isSelected = selectedPros.some((t) => t.id === tag.id);
    if (isSelected) {
      setSelectedPros(selectedPros.filter((t) => t.id !== tag.id));
    } else if (selectedPros.length < 4) {
      setSelectedPros([...selectedPros, tag]);

      // 장점 태그 선택 로깅
      const relatedAttributes = Object.entries(tag.attributes || {}).map(([attr, weight]) => ({
        attribute: attr,
        weight: weight
      }));
      logTagSelection(
        tag.text,
        'pros',
        1, // Step 1: 장점 선택
        category,
        tag.id,
        tag.mentionCount,
        tag.id.startsWith('custom-'),
        relatedAttributes
      );
    }
  };

  const toggleConsTag = (tag: Tag) => {
    const isSelected = selectedCons.some((t) => t.id === tag.id);
    if (isSelected) {
      setSelectedCons(selectedCons.filter((t) => t.id !== tag.id));
    } else if (selectedCons.length < 3) {
      setSelectedCons([...selectedCons, tag]);

      // 단점 태그 선택 로깅
      const relatedAttributes = Object.entries(tag.attributes || {}).map(([attr, weight]) => ({
        attribute: attr,
        weight: weight
      }));
      logTagSelection(
        tag.text,
        'cons',
        2, // Step 2: 단점 선택
        category,
        tag.id,
        tag.mentionCount,
        tag.id.startsWith('custom-'),
        relatedAttributes
      );
    }
  };

  // 커스텀 장점 태그 추가
  const handleAddCustomPros = async () => {
    const trimmed = customProsInput.trim();
    if (!trimmed) {
      alert('태그 내용을 입력해주세요.');
      return;
    }

    if (selectedPros.length >= 4) {
      alert('장점은 최대 4개까지 선택 가능합니다.');
      return;
    }

    setIsAnalyzingCustomTag(true);

    try {
      const response = await fetch('/api/analyze-custom-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagText: trimmed,
          tagType: 'pros',
          category
        })
      });

      if (!response.ok) {
        throw new Error('태그 분석에 실패했습니다.');
      }

      const data = await response.json();

      // 커스텀 태그 생성
      const newTag: Tag = {
        id: `custom-pros-${Date.now()}`,
        text: trimmed,
        attributes: data.attributes || {}
      };

      // 자동으로 선택 상태로 추가
      setProsTags((prev) => [...prev, newTag]);
      setSelectedPros((prev) => [...prev, newTag]);
      setCustomProsInput('');
      setIsAddingCustomPros(false);

      // 커스텀 장점 태그 생성 로깅
      const relatedAttributes = Object.entries(data.attributes || {}).map(([attr, weight]) => ({
        attribute: attr,
        weight: weight as number
      }));
      logCustomTagCreation(
        trimmed,
        'pros',
        category,
        relatedAttributes
      );

      console.log('✅ 커스텀 장점 태그 추가:', newTag);
    } catch (error) {
      console.error('❌ 커스텀 태그 추가 실패:', error);
      alert('태그 추가에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsAnalyzingCustomTag(false);
    }
  };

  // 커스텀 단점 태그 추가
  const handleAddCustomCons = async () => {
    const trimmed = customConsInput.trim();
    if (!trimmed) {
      alert('태그 내용을 입력해주세요.');
      return;
    }

    if (selectedCons.length >= 3) {
      alert('단점은 최대 3개까지 선택 가능합니다.');
      return;
    }

    setIsAnalyzingCustomTag(true);

    try {
      const response = await fetch('/api/analyze-custom-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagText: trimmed,
          tagType: 'cons',
          category
        })
      });

      if (!response.ok) {
        throw new Error('태그 분석에 실패했습니다.');
      }

      const data = await response.json();

      const newTag: Tag = {
        id: `custom-cons-${Date.now()}`,
        text: trimmed,
        attributes: data.attributes || {}
      };

      setConsTags((prev) => [...prev, newTag]);
      setSelectedCons((prev) => [...prev, newTag]);
      setCustomConsInput('');
      setIsAddingCustomCons(false);

      // 커스텀 단점 태그 생성 로깅
      const relatedAttributes = Object.entries(data.attributes || {}).map(([attr, weight]) => ({
        attribute: attr,
        weight: weight as number
      }));
      logCustomTagCreation(
        trimmed,
        'cons',
        category,
        relatedAttributes
      );

      console.log('✅ 커스텀 단점 태그 추가:', newTag);
    } catch (error) {
      console.error('❌ 커스텀 태그 추가 실패:', error);
      alert('태그 추가에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsAnalyzingCustomTag(false);
    }
  };

  // 커스텀 예산 입력 처리
  const handleCustomBudgetSubmit = async () => {
    const trimmed = customBudget.trim();
    if (!trimmed) {
      alert('예산을 입력해주세요.');
      return;
    }

    setIsParsingBudget(true);

    try {
      const response = await fetch('/api/parse-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: trimmed
        })
      });

      if (!response.ok) {
        throw new Error('예산 파싱에 실패했습니다.');
      }

      const data = await response.json();

      if (data.success && data.budgetRange) {
        setBudget(data.budgetRange);
        setParsedBudgetDisplay(`예산: ${trimmed}`);
        console.log('✅ 예산 파싱 성공:', data.budgetRange);
      } else {
        alert(data.error || '예산을 인식하지 못했습니다. 다시 입력해주세요.');
      }
    } catch (error) {
      console.error('❌ 예산 파싱 실패:', error);
      alert('예산 처리에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsParsingBudget(false);
    }
  };

  // 추천받기 버튼 클릭 핸들러
  const handleRecommendation = () => {
    // 예산이 없으면 디폴트 예산(인기 옵션) 자동 설정
    let finalBudget = budget || parsedBudgetDisplay;
    if (!finalBudget) {
      const popularOption = budgetOptions.find(opt => opt.popular);
      if (popularOption) {
        finalBudget = popularOption.value;
        setBudget(finalBudget);
        // 디폴트 예산 사용 로깅
        logButtonClick(`예산_디폴트_선택_${popularOption.label}`, 'tags');
        console.log('✅ 디폴트 예산 자동 선택:', popularOption.label);
      }
    }

    // 세션에 데이터 저장
    const sessionKey = 'babyitem_session';
    const existingSession = sessionStorage.getItem(sessionKey);

    const session = existingSession ? JSON.parse(existingSession) : {};

    // Tag-based priority settings 생성
    const tagBasedPriority = {
      selectedProsTags: selectedPros,
      selectedConsTags: selectedCons,
      budget: finalBudget,
      anchorProductId: anchorId,
      category: category
    };

    session.tagBasedPriority = tagBasedPriority;
    session.budget = finalBudget;
    session.phase = 'result';

    sessionStorage.setItem(sessionKey, JSON.stringify(session));

    // IMPORTANT: Save to tag_selections for result page (v2 tag-based flow)
    const tagSelections = {
      selectedPros: selectedPros,
      selectedCons: selectedCons,
      budget: finalBudget,
    };
    sessionStorage.setItem('tag_selections', JSON.stringify(tagSelections));

    console.log('✅ 추천 데이터 저장:', tagBasedPriority);
    console.log('✅ tag_selections 저장:', tagSelections);

    // Result 페이지로 이동 (URL 파라미터 포함 - tag-based flow 감지용)
    router.push(`/result?category=${category}&anchorId=${anchorId}`);
  };

  // URL 파라미터 처리 및 페이지뷰 로깅
  useEffect(() => {
    logPageView('tags');
  }, []);

  // 초기화: 저장된 상태 복원 또는 새로 시작
  useEffect(() => {
    if (isInitializedRef.current) {
      console.log('⚠️ 초기화 이미 완료됨 - 스킵');
      return;
    }

    console.log('✅ 초기화 시작');
    isInitializedRef.current = true;

    if (!category) {
      router.push('/categories');
      return;
    }

    // Clear chat history (Result 플로우와 독립)
    if (typeof window !== 'undefined') {
      try {
        const SESSION_KEY = 'babyitem_session';
        const savedSession = sessionStorage.getItem(SESSION_KEY);

        if (savedSession) {
          const session = JSON.parse(savedSession);
          session.messages = [];
          delete session.prioritySettings;
          delete session.budget;
          delete session.phase0Context;
          delete session.forceRegenerate;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          console.log('✅ Chat history cleared');
        }
      } catch (error) {
        console.error('❌ Failed to clear chat history:', error);
      }
    }

    // Referrer 체크: Categories에서 오면 상태 클리어
    const referrer = document.referrer;
    const isFromCategories = !referrer || referrer.includes('/categories');

    if (isFromCategories) {
      console.log('🏠 Categories에서 진입 - 상태 클리어');
      clearConversationState();
    }

    // anchorId가 없으면 전체 제품 로드 후 1위 자동 선택
    const initializeProduct = async () => {
      let productIdToUse = anchorIdFromUrl;
      let productTitleToUse = productTitleFromUrl;

      if (!anchorIdFromUrl) {
        console.log('🔄 Anchor ID 없음 - 전체 제품 로드 후 1위 선택');
        const selectedProductId = await loadAllProducts();

        if (!selectedProductId) {
          console.error('❌ 제품을 찾을 수 없습니다');
          router.push('/categories');
          return;
        }

        productIdToUse = selectedProductId;
        productTitleToUse = anchorProduct?.모델명 || anchorProduct?.제품명 || '';
      } else {
        // anchorId가 있으면 전체 제품 리스트도 로드 (제품 변경 모달용)
        loadAllProducts();
      }

      // 저장된 상태 복원 시도
      const savedState = loadConversationState();
      if (savedState && savedState.anchorId === productIdToUse) {
        // 상태 복원
        setMessages(savedState.messages || []);
        setCurrentStep(savedState.currentStep || 0);
        setAnchorId(savedState.anchorId);
        setProductTitle(savedState.productTitle || '');
        setReviewCount(savedState.reviewCount || 0);
        setProsTags(savedState.prosTags || []);
        setConsTags(savedState.consTags || []);
        setSelectedPros(savedState.selectedPros || []);
        setSelectedCons(savedState.selectedCons || []);
        setBudget(savedState.budget || '');
        setCustomBudget(savedState.customBudget || '');
        setIsCustomMode(savedState.isCustomMode || false);

        // 제품 데이터 로드
        loadProductData(savedState.anchorId);

        console.log('✅ 저장된 대화 복원 완료');

        // 스크롤 위치 복원
        if (savedState.scrollPosition) {
          setTimeout(() => {
            if (mainScrollRef.current) {
              mainScrollRef.current.scrollTop = savedState.scrollPosition;
              console.log('📜 스크롤 위치 복원:', savedState.scrollPosition);
            }
          }, 100);
        }
      } else {
        // 새로 시작 - 초기 메시지 추가
        const initialMessageId = `msg-${Date.now()}-1`;
        const initialMessages: ChatMessage[] = [
          {
            id: initialMessageId,
            role: 'assistant',
            content: `${CATEGORY_NAMES[category]} 판매 1위 제품의\n리뷰를 분석하고 있어요...`,
            typing: true,
          },
        ];
        setMessages(initialMessages);
        setTypingMessageId(initialMessageId);
        initialMessageIdRef.current = initialMessageId;

        console.log('✅ 새로운 대화 시작 - 태그 생성 중');

        // 태그 생성 시작
        if (!hasGeneratedRef.current) {
          hasGeneratedRef.current = true;

          setTimeout(async () => {
            if (!productIdToUse) return;
            const result = await generateTags(productIdToUse, productTitleToUse || '');

          if (result.success) {
            // Step 1로 전환
            setCurrentStep(1);

            // 로딩 완료 메시지 제거하고 결과 메시지 추가
            setMessages((prev) => prev.filter((msg) => msg.id !== initialMessageId));

            // 기준 제품 소개 메시지
            const introMessageId = `msg-${Date.now()}-2`;
            setMessages((prev) => [
              ...prev,
              {
                id: introMessageId,
                role: 'assistant',
                content: `대표 인기템 ${CATEGORY_NAMES[category]}, 우리 집에도 맞을까요?\n광고 뺀 후기 분석으로 딱 맞는 제품을 찾아드릴게요.`,
                typing: true,
                stepTag: '1/3',
              },
            ]);
            setTypingMessageId(introMessageId);

            // 제품 카드 추가
            setTimeout(() => {
              addComponentMessage('anchor-product-card');

              // 장점 선택 메시지 추가
              setTimeout(() => {
                addMessage('assistant', '어떤 점이 가장 기대되시나요?\n마음에 드는 순서대로 최대 4가지만 골라주세요.', true);

                // 장점 선택 컴포넌트 추가
                setTimeout(() => {
                  addComponentMessage('pros-selector');
                  // 첫 번째 장점 선택은 스크롤 하지 않음 (사용자가 위 내용을 읽어야 함)
                }, 500);
              }, 800);
            }, 500);
          }
        }, 1500);
      }
      }
    };

    // 초기화 함수 실행
    initializeProduct();

    // Cleanup
    return () => {
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 타이핑 애니메이션 완료 처리
  useEffect(() => {
    if (typingMessageId) {
      const timer = setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === typingMessageId ? { ...msg, typing: false } : msg
          )
        );
        setTypingMessageId(null);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [typingMessageId]);

  // 상태 자동 저장
  useEffect(() => {
    if (!isInitializedRef.current || messages.length === 0) return;
    saveConversationState();
  }, [messages, currentStep, selectedPros, selectedCons, budget, saveConversationState]);

  // Step 1 완료 조건
  const isStep1Complete = selectedPros.length > 0 && selectedPros.length <= 4;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] h-dvh overflow-hidden bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div className="px-5 py-3 flex items-center justify-between">
            <button
              onClick={() => setShowBackConfirmModal(true)}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <CaretLeft size={24} weight="bold" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {category ? CATEGORY_NAMES[category] : ''} 추천
            </h1>
            <div className="w-6" /> {/* Spacer */}
          </div>
          {/* Progress Bar */}
          <div className="w-full h-1 bg-gray-200">
            <div
              className="h-full bg-[#0074F3] transition-all duration-300"
              style={{ width: `${currentStep === 0 ? 0 : currentStep === 1 ? 33 : currentStep === 2 ? 66 : currentStep === 3 ? 100 : 100}%` }}
            />
          </div>
        </header>

        {/* Messages Area - Scrollable */}
        <main ref={mainScrollRef} className="flex-1 px-3 py-6 overflow-y-auto" style={{ paddingTop: '80px', paddingBottom: '100px', minHeight: 0 }}>
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
                    className={`w-full ${message.extraMarginTop ? 'mt-6' : ''}`}
                  >
                    {/* Step 태그 */}
                    {message.stepTag && (
                      <div className="inline-block px-2.5 py-1 bg-gray-100 text-[#0074F3] rounded-lg text-xs font-bold mb-2">
                        {message.stepTag}
                      </div>
                    )}
                    {/* 메시지 버블 */}
                    <div className="w-full flex justify-start">
                      <div
                        className={`px-1 py-1 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-base ${
                          message.typing && message.content.includes('분석하고 있어요')
                            ? 'shimmer-text'
                            : 'text-gray-900'
                        }`}
                      >
                        {formatMarkdown(message.content)}
                      </div>
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
                // Anchor Product Card
                if (message.componentType === 'anchor-product-card') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full mb-4"
                    >
                      <div className="bg-gray-50 rounded-2xl p-4">
                        {anchorProduct ? (
                          <div className="flex items-start gap-3">
                            {/* 썸네일 */}
                            {anchorProduct.썸네일 && (
                              <div className="w-20 h-20 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-200">
                                <img
                                  src={anchorProduct.썸네일}
                                  alt={anchorProduct.모델명}
                                  className="w-full h-full object-contain p-2"
                                />
                              </div>
                            )}

                            {/* 제품 정보 */}
                            <div className="flex-1 min-w-0">
                              {/* 브랜드 */}
                              <div className="text-xs text-gray-500 font-medium mb-0.5">
                                {anchorProduct.브랜드}
                              </div>

                              {/* 제품명 */}
                              <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1">
                                {anchorProduct.모델명}
                              </h3>

                              {/* 가격 */}
                              {anchorProduct.최저가 && (
                                <p className="text-base font-bold text-gray-900 mb-1">
                                  {anchorProduct.최저가.toLocaleString()}
                                  <span className="text-xs text-gray-600 ml-0.5">원</span>
                                </p>
                              )}

                              {/* 랭킹 & 리뷰 */}
                              <div className="flex items-center gap-2 text-xs flex-wrap">
                                <div className="px-2 py-0.5 bg-blue-50 rounded">
                                  <span className="font-semibold text-blue-600">
                                    판매 랭킹 {anchorProduct.순위}위
                                  </span>
                                </div>
                                {anchorProduct.reviewCount && anchorProduct.reviewCount > 0 && (
                                  <div className="flex items-center gap-0.5 text-gray-600 font-medium">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                                    </svg>
                                    {anchorProduct.avgRating && (
                                      <span>{anchorProduct.avgRating.toFixed(1)}</span>
                                    )}
                                    <span className="text-gray-400">({anchorProduct.reviewCount.toLocaleString()})</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 text-sm py-4">
                            제품 정보를 불러오는 중...
                          </div>
                        )}

                        {/* 다른 제품 보기 버튼 */}
                        <div className="text-center mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => {
                              logButtonClick('다른 제품 보기', 'tags');
                              setShowProductChangeModal(true);
                            }}
                            className="text-sm text-gray-500 hover:text-gray-700 underline font-medium"
                          >
                            다른 제품 고르기
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Pros Selector
                if (message.componentType === 'pros-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full mb-4"
                      data-component="pros-selector"
                    >
                      <div className={`space-y-3 ${currentStep >= 2 ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* 장점 태그 리스트 */}
                        {prosTags.map((tag, index) => {
                          const isSelected = selectedPros.some(t => t.id === tag.id);
                          const selectedIndex = selectedPros.findIndex(t => t.id === tag.id);
                          const sortedByMentions = [...prosTags].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
                          const top4Tags = sortedByMentions.slice(0, 4).map(t => t.id);
                          const isFrequentlyMentioned = top4Tags.includes(tag.id) && tag.mentionCount && tag.mentionCount > 0;
                          const isCustomTag = tag.id.startsWith('custom-pros-');

                          const categoryAttrs = CATEGORY_ATTRIBUTES[category] || [];
                          const mappedAttributes = Object.keys(tag.attributes).map(attrKey => {
                            const attrInfo = categoryAttrs.find(a => a.key === attrKey);
                            return attrInfo ? attrInfo.name : null;
                          }).filter(Boolean);

                          return (
                            <motion.button
                              key={tag.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.15, delay: index * 0.02 }}
                              onClick={() => toggleProsTag(tag)}
                              className={`w-full px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                                isSelected
                                  ? 'border-emerald-300 bg-emerald-100'
                                  : 'border-transparent bg-gray-100 hover:bg-gray-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    isSelected
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-gray-300 text-gray-400'
                                  }`}
                                >
                                  {isSelected ? selectedIndex + 1 : ''}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    {isCustomTag && <span className="text-sm">🖊️</span>}
                                    <span className={`text-sm leading-snug font-medium ${
                                      isSelected ? 'text-emerald-700' : 'text-gray-700'
                                    }`}>{tag.text}</span>
                                  </div>

                                  {(isFrequentlyMentioned || mappedAttributes.length > 0) && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isFrequentlyMentioned && (
                                        <span
                                          className="text-[10px] px-1.5 py-0.5 rounded-md font-bold"
                                          style={
                                            isSelected
                                              ? { backgroundColor: 'white', color: '#059669' }
                                              : { backgroundColor: '#EAF8F8', color: '#009896' }
                                          }
                                        >
                                          많이 언급
                                        </span>
                                      )}
                                      {mappedAttributes.map((attrName, i) => (
                                        <span
                                          key={i}
                                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                            isSelected
                                              ? 'bg-white text-emerald-600'
                                              : 'bg-white/70 text-gray-500'
                                          }`}
                                        >
                                          {attrName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}

                        {/* 직접입력 UI */}
                        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4">
                          {isAddingCustomPros ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">✍️</span>
                                <h3 className="text-sm font-bold text-gray-900">원하는 특징 입력</h3>
                              </div>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={customProsInput}
                                  onChange={(e) => setCustomProsInput(e.target.value)}
                                  placeholder="예: 세척이 정말 편해요"
                                  className="flex-1 px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
                                  autoFocus
                                  disabled={isAnalyzingCustomTag}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !isAnalyzingCustomTag) {
                                      handleAddCustomPros();
                                    }
                                  }}
                                />
                                <button
                                  onClick={handleAddCustomPros}
                                  disabled={isAnalyzingCustomTag || !customProsInput.trim()}
                                  className="px-4 py-2.5 bg-emerald-500 text-white rounded-lg font-semibold text-sm hover:bg-emerald-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {isAnalyzingCustomTag ? '분석 중...' : '등록'}
                                </button>
                                <button
                                  onClick={() => {
                                    setIsAddingCustomPros(false);
                                    setCustomProsInput('');
                                  }}
                                  className="px-3 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition-colors"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setIsAddingCustomPros(true)}
                              disabled={selectedPros.length >= 4}
                              className={`w-full text-center font-medium text-sm transition-colors ${
                                selectedPros.length >= 4
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              직접 입력
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Cons Selector
                if (message.componentType === 'cons-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full mb-4"
                      data-component="cons-selector"
                    >
                      <div className={`space-y-3 ${currentStep >= 3 ? 'opacity-50 pointer-events-none' : ''}`}>
                        {consTags.length === 0 ? (
                          /* 단점 없을 때 */
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 mb-4 text-center"
                          >
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <span className="text-2xl">😊</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-700 mb-1">
                              단점 언급 리뷰 없음!
                            </p>
                            <p className="text-xs text-gray-500">
                              이 제품은 저평점 리뷰가 없어요
                            </p>
                          </motion.div>
                        ) : (
                          /* 단점 태그 리스트 */
                          <>
                            {consTags.map((tag, index) => {
                              const isSelected = selectedCons.some(t => t.id === tag.id);
                              const selectedIndex = selectedCons.findIndex(t => t.id === tag.id);
                              const sortedByMentions = [...consTags].sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
                              const top4Tags = sortedByMentions.slice(0, 4).map(t => t.id);
                              const isFrequentlyMentioned = top4Tags.includes(tag.id) && tag.mentionCount && tag.mentionCount > 0;
                              const isCustomTag = tag.id.startsWith('custom-cons-');

                              const categoryAttrs = CATEGORY_ATTRIBUTES[category] || [];
                              const mappedAttributes = Object.keys(tag.attributes).map(attrKey => {
                                const attrInfo = categoryAttrs.find(a => a.key === attrKey);
                                return attrInfo ? attrInfo.name : null;
                              }).filter(Boolean);

                              return (
                                <motion.button
                                  key={tag.id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.15, delay: index * 0.02 }}
                                  onClick={() => toggleConsTag(tag)}
                                  className={`w-full px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                                    isSelected
                                      ? 'border-rose-300 bg-rose-100'
                                      : 'border-transparent bg-gray-100 hover:bg-gray-200'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        isSelected
                                          ? 'border-rose-500 bg-rose-500 text-white'
                                          : 'border-gray-300 text-gray-400'
                                      }`}
                                    >
                                      {isSelected ? selectedIndex + 1 : ''}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        {isCustomTag && <span className="text-sm">🖊️</span>}
                                        <span className={`text-sm leading-snug font-medium ${
                                          isSelected ? 'text-rose-700' : 'text-gray-700'
                                        }`}>{tag.text}</span>
                                      </div>

                                      {(isFrequentlyMentioned || mappedAttributes.length > 0) && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {isFrequentlyMentioned && (
                                            <span
                                              className="text-[10px] px-1.5 py-0.5 rounded-md font-bold"
                                              style={
                                                isSelected
                                                  ? { backgroundColor: 'white', color: '#E11D48' }
                                                  : { backgroundColor: '#FEE', color: '#DC2626' }
                                              }
                                            >
                                              많이 언급
                                            </span>
                                          )}
                                          {mappedAttributes.map((attrName, i) => (
                                            <span
                                              key={i}
                                              className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                                isSelected
                                                  ? 'bg-white text-rose-600'
                                                  : 'bg-white/70 text-gray-500'
                                              }`}
                                            >
                                              {attrName}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </motion.button>
                              );
                            })}

                            {/* 직접입력 UI */}
                            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4">
                              {isAddingCustomCons ? (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">✍️</span>
                                    <h3 className="text-sm font-bold text-gray-900">피하고 싶은 단점 직접 입력</h3>
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={customConsInput}
                                      onChange={(e) => setCustomConsInput(e.target.value)}
                                      placeholder="예: 소음이 너무 시끄러워요"
                                      className="flex-1 px-3 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-rose-500 text-sm"
                                      autoFocus
                                      disabled={isAnalyzingCustomTag}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isAnalyzingCustomTag) {
                                          handleAddCustomCons();
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={handleAddCustomCons}
                                      disabled={isAnalyzingCustomTag || !customConsInput.trim()}
                                      className="px-4 py-2.5 bg-rose-500 text-white rounded-lg font-semibold text-sm hover:bg-rose-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                      {isAnalyzingCustomTag ? '분석 중...' : '등록'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setIsAddingCustomCons(false);
                                        setCustomConsInput('');
                                      }}
                                      className="px-3 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition-colors"
                                    >
                                      취소
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setIsAddingCustomCons(true)}
                                  disabled={selectedCons.length >= 3}
                                  className={`w-full text-center font-medium text-sm transition-colors ${
                                    selectedCons.length >= 3
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                >
                                  직접 입력
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        {/* 넘어가기 버튼 */}
                        <div className="text-center mt-4">
                          <button
                            onClick={() => {
                              logButtonClick('단점 선택 스킵', 'tags');
                              // Step 3으로 전환
                              setCurrentStep(3);
                              setSelectedCons([]);

                              setTimeout(() => {
                                addMessage('assistant', '마지막이에요.\n생각해 둔 예산이 있나요?', true);

                                setTimeout(() => {
                                  addComponentMessage('budget-selector');

                                  // 인기 예산 옵션 자동 선택
                                  const popularOption = budgetOptions.find(opt => opt.popular);
                                  if (popularOption && !budget) {
                                    setBudget(popularOption.value);
                                    console.log('✅ 인기 예산 자동 선택:', popularOption.label);
                                  }

                                  scrollToBottom();
                                }, 800);
                              }, 300);
                            }}
                            className="text-gray-500 text-sm font-semibold hover:text-gray-700 transition-colors py-2 px-4 rounded-lg hover:bg-gray-100"
                          >
                            넘어가기
                          </button>
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
                      data-component="budget-selector"
                    >
                      <div className={`bg-white border border-gray-200 rounded-2xl p-4 space-y-3 ${currentStep >= 4 ? 'opacity-50 pointer-events-none' : ''}`}>
                       

                        {/* 2x2 Grid for budget buttons */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {budgetOptions.map((option) => {
                            const isSelected = budget === option.value;
                            return (
                              <button
                                key={option.value}
                                onClick={() => {
                                  logButtonClick(`예산_${option.label}`, 'tags');
                                  setBudget(option.value);
                                  setIsCustomMode(false);
                                  setCustomBudget('');
                                  setParsedBudgetDisplay('');
                                }}
                                className={`p-3 rounded-xl text-left transition-all border ${
                                  isSelected
                                    ? ''
                                    : 'bg-white text-gray-900 border-gray-200 hover:border-gray-300'
                                }`}
                                style={isSelected ? { backgroundColor: '#E5F1FF', color: '#0074F3', borderColor: '#B8DCFF' } : {}}
                              >
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="font-semibold text-sm">{option.label}</span>
                                  {option.popular && (
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                                        isSelected ? 'bg-white text-gray-900' : ''
                                      }`}
                                      style={!isSelected ? { backgroundColor: '#EAF8F8', color: '#009896' } : {}}
                                    >
                                      인기
                                    </span>
                                  )}
                                </div>
                                <div className={`text-xs ${isSelected ? 'opacity-70' : 'text-gray-500'}`}>
                                  {option.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* 직접 입력 */}
                        {!isCustomMode && budget && !budgetOptions.map(o => o.value).includes(budget) ? (
                          <button
                            onClick={() => setIsCustomMode(true)}
                            className="w-full p-3 rounded-xl text-left transition-all border text-white"
                            style={{ borderColor: '#B8DCFF', backgroundColor: '#0084FE' }}
                          >
                            <div className="font-semibold text-sm mb-0.5">직접 입력</div>
                            <div className="text-xs opacity-80">{budget}</div>
                          </button>
                        ) : !isCustomMode ? (
                          <button
                            onClick={() => {
                              logButtonClick('예산_직접입력', 'tags');
                              setIsCustomMode(true);
                              setBudget('');
                            }}
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
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customBudget.trim() && !isParsingBudget) {
                                    handleCustomBudgetSubmit();
                                  }
                                }}
                                disabled={isParsingBudget}
                              />
                              <button
                                onClick={handleCustomBudgetSubmit}
                                disabled={!customBudget.trim() || isParsingBudget}
                                className="px-4 py-2 text-white rounded-lg font-semibold text-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                                style={{ backgroundColor: isParsingBudget || !customBudget.trim() ? '' : '#0084FE' }}
                              >
                                {isParsingBudget ? '분석 중...' : '확인'}
                              </button>
                            </div>
                          </div>
                        )}
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

        {/* Bottom Floating Buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {/* Step 1: Pros */}
          {currentStep === 1 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={isStep1Complete ? { scale: 1.02 } : {}}
              whileTap={isStep1Complete ? { scale: 0.98 } : {}}
              onClick={() => {
                if (!isStep1Complete) return;

                logButtonClick('장점 선택 완료 - 다음', 'tags');

                // Step 2로 전환
                setCurrentStep(2);

                // 단점 선택 메시지 추가
                setTimeout(() => {
                  addMessage('assistant', '이것만큼은 절대 안 된다!\n꼭 피하고 싶은 단점이 있나요? (선택)', true);

                  // 단점 선택 컴포넌트 추가
                  setTimeout(() => {
                    addComponentMessage('cons-selector');
                    scrollToBottom();
                  }, 800);
                }, 300);
              }}
              disabled={!isStep1Complete}
              className={`w-full h-14 rounded-2xl font-semibold text-base transition-all ${
                isStep1Complete
                  ? 'bg-[#0084FE] text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              다음
            </motion.button>
          )}

          {/* Step 2: Cons */}
          {currentStep === 2 && (
            <div className="flex gap-2">
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  logButtonClick('단점 선택 - 이전', 'tags');
                  // Step 1로 돌아가기
                  setCurrentStep(1);

                  // 단점 관련 메시지 제거 (마지막 2개: 단점 선택 메시지 + cons-selector 컴포넌트)
                  setMessages(prev => prev.slice(0, -2));

                  // 장점 선택 영역으로 스크롤
                  setTimeout(() => {
                    const prosSelector = document.querySelector('[data-component="pros-selector"]');
                    if (prosSelector) {
                      prosSelector.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 100);
                }}
                className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
              >
                이전
              </motion.button>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  logButtonClick('단점 선택 완료 - 다음', 'tags');

                  // Step 3으로 전환
                  setCurrentStep(3);

                  // 예산 선택 메시지 추가
                  setTimeout(() => {
                    addMessage('assistant', '마지막이에요.\n생각해 둔 예산이 있나요?', true);

                    // 예산 선택 컴포넌트 추가
                    setTimeout(() => {
                      addComponentMessage('budget-selector');

                      // 인기 예산 옵션 자동 선택
                      const popularOption = budgetOptions.find(opt => opt.popular);
                      if (popularOption && !budget) {
                        setBudget(popularOption.value);
                        console.log('✅ 인기 예산 자동 선택:', popularOption.label);
                      }

                      scrollToBottom();
                    }, 800);
                  }, 300);
                }}
                className="flex-[3] h-14 rounded-2xl font-semibold text-base bg-[#0084FE] text-white hover:opacity-90 transition-all"
              >
                다음
              </motion.button>
            </div>
          )}

          {/* Step 3: Budget */}
          {currentStep === 3 && (
            <div className="flex gap-2">
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  logButtonClick('예산 선택 - 이전', 'tags');
                  // Step 2로 돌아가기
                  setCurrentStep(2);

                  // 예산 관련 메시지 제거 (마지막 2개: 예산 선택 메시지 + budget-selector 컴포넌트)
                  setMessages(prev => prev.slice(0, -2));

                  // 단점 선택 영역으로 스크롤
                  setTimeout(() => {
                    const consSelector = document.querySelector('[data-component="cons-selector"]');
                    if (consSelector) {
                      consSelector.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 100);
                }}
                className="flex-[2] h-14 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
              >
                이전
              </motion.button>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  logButtonClick('추천받기', 'tags');
                  handleRecommendation();
                }}
                className="flex-[3] h-14 rounded-2xl font-semibold text-base transition-all bg-[#0084FE] text-white hover:opacity-90"
              >
                추천받기
              </motion.button>
            </div>
          )}
        </div>

        {/* Back Confirmation Modal */}
        <AnimatePresence>
          {showBackConfirmModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowBackConfirmModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-0 flex items-center justify-center z-50 px-4"
              >
                <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-auto">
                  <p className="text-m text-gray-800 mb-6 leading-relaxed">
                    나가시면 다시 이 페이지로 돌아올 수 없어요. 정말 나가시겠어요?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowBackConfirmModal(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-xl transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        setShowBackConfirmModal(false);
                        clearConversationState();
                        router.push('/');
                      }}
                      className="flex-1 px-4 py-3 text-white font-semibold rounded-xl transition-colors"
                      style={{ backgroundColor: '#0074F3' }}
                    >
                      홈으로
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Guide Bottom Sheet */}
        <GuideBottomSheet
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          category={category}
        />

        {/* Product List Modal */}
        <AnimatePresence>
          {showProductChangeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
              onClick={() => setShowProductChangeModal(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="bg-white rounded-t-3xl w-full max-w-[480px] max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 border-b">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">리뷰 분석 제품 고르기</h3>
                    <button
                      onClick={() => setShowProductChangeModal(false)}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="브랜드나 모델명으로 검색..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 text-base"
                  />
                </div>

                <div
                  className="overflow-y-auto max-h-[calc(85vh-140px)] p-4"
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
                    const filteredProducts = products.filter(p => {
                      if (!searchKeyword.trim()) return true;
                      const keyword = searchKeyword.toLowerCase();
                      return (
                        p.모델명?.toLowerCase().includes(keyword) ||
                        p.브랜드?.toLowerCase().includes(keyword) ||
                        p.제품명?.toLowerCase().includes(keyword)
                      );
                    });
                    if (scrolledToBottom && displayedProductCount < filteredProducts.length) {
                      setDisplayedProductCount(prev => Math.min(prev + 20, filteredProducts.length));
                    }
                  }}
                >
                  {(() => {
                    const filteredProducts = products.filter(product => {
                      if (!searchKeyword.trim()) return true;
                      const keyword = searchKeyword.toLowerCase();
                      return (
                        product.모델명?.toLowerCase().includes(keyword) ||
                        product.브랜드?.toLowerCase().includes(keyword) ||
                        product.제품명?.toLowerCase().includes(keyword)
                      );
                    });

                    if (products.length === 0 && !isSearching) {
                      return (
                        <div className="text-center py-12 text-gray-500">
                          <p className="text-sm">제품을 불러오는 중...</p>
                        </div>
                      );
                    }

                    if (filteredProducts.length === 0 && searchKeyword) {
                      return (
                        <div className="text-center py-12 text-gray-500">
                          <div className="text-4xl mb-3">🔍</div>
                          <p className="text-sm">검색 결과가 없습니다</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {filteredProducts.slice(0, displayedProductCount).map((product) => (
                          <motion.button
                      key={product.productId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={async () => {
                        // 제품 변경
                        const newProductId = String(product.productId);
                        setAnchorId(newProductId);
                        setAnchorProduct(product);
                        setProductTitle(product.모델명 || product.제품명);

                        // 제품 선택 로깅 (상세 정보 포함)
                        logButtonClick(`태그_제품변경_${product.브랜드}_${product.모델명}_랭킹${product.순위}`, 'tags');

                        setShowProductChangeModal(false);
                        setSearchKeyword('');

                        // 상태 초기화
                        setMessages([]);
                        setCurrentStep(0);
                        setProsTags([]);
                        setConsTags([]);
                        setSelectedPros([]);
                        setSelectedCons([]);
                        setBudget('');
                        clearConversationState();

                        // 새 제품으로 태그 생성
                        const initialMessageId = `msg-${Date.now()}-1`;
                        setMessages([{
                          id: initialMessageId,
                          role: 'assistant',
                          content: `${CATEGORY_NAMES[category]} ${product.순위}위 제품의\n리뷰를 분석하고 있어요...`,
                          typing: true,
                        }]);
                        setTypingMessageId(initialMessageId);

                        // 태그 생성
                        setTimeout(async () => {
                          const result = await generateTags(newProductId, product.모델명 || product.제품명);

                          if (result.success) {
                            setCurrentStep(1);
                            setMessages((prev) => prev.filter((msg) => msg.id !== initialMessageId));

                            const introMessageId = `msg-${Date.now()}-2`;
                            setMessages((prev) => [
                              ...prev,
                              {
                                id: introMessageId,
                                role: 'assistant',
                                content: `대표 인기템 ${CATEGORY_NAMES[category]}, 우리 집에도 맞을까요?\n광고 뺀 후기 분석으로 딱 맞는 제품을 찾아드릴게요.`,
                                typing: true,
                                stepTag: '1/3',
                              },
                            ]);
                            setTypingMessageId(introMessageId);

                            setTimeout(() => {
                              addComponentMessage('anchor-product-card');
                              setTimeout(() => {
                                addMessage('assistant', '어떤 점이 가장 기대되시나요?\n마음에 드는 순서대로 최대 4가지만 골라주세요.', true);
                                setTimeout(() => {
                                  addComponentMessage('pros-selector');
                                  // 첫 번째 장점 선택은 스크롤 하지 않음 (사용자가 위 내용을 읽어야 함)
                                }, 500);
                              }, 800);
                            }, 500);
                          }
                        }, 1500);
                      }}
                      className={`w-full mb-3 text-left transition-all rounded-2xl ${
                        anchorProduct?.productId === product.productId
                          ? 'border-2 border-[#0084FE] bg-blue-50'
                          : 'border-0 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {/* 썸네일 */}
                          {product.썸네일 && (
                            <div className="w-20 h-20 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-200">
                              <img
                                src={product.썸네일}
                                alt={product.모델명}
                                className="w-full h-full object-contain p-2"
                              />
                            </div>
                          )}

                          {/* 제품 정보 */}
                          <div className="flex-1 min-w-0">
                            {/* 브랜드 */}
                            <div className="text-xs text-gray-500 font-medium mb-0.5">
                              {product.브랜드}
                            </div>

                            {/* 제품명 */}
                            <h4 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1">
                              {product.모델명}
                            </h4>

                            {/* 가격 */}
                            {product.최저가 && (
                              <p className="text-base font-bold text-gray-900 mb-1">
                                {product.최저가.toLocaleString()}
                                <span className="text-xs text-gray-600 ml-0.5">원</span>
                              </p>
                            )}

                            {/* 랭킹 & 리뷰 */}
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <div className="px-2 py-0.5 bg-blue-50 rounded">
                                <span className="font-semibold text-blue-600">
                                  판매 랭킹 {product.순위}위
                                </span>
                              </div>
                              {product.reviewCount && product.reviewCount > 0 && (
                                <div className="flex items-center gap-0.5 text-gray-600 font-medium">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#FCD34D" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                                  </svg>
                                  {product.avgRating && (
                                    <span>{product.avgRating.toFixed(1)}</span>
                                  )}
                                  <span className="text-gray-400">({product.reviewCount.toLocaleString()})</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                          </motion.button>
                        ))}

                        {/* Loading indicator */}
                        {displayedProductCount < filteredProducts.length && (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            스크롤하여 더 보기 ({displayedProductCount}/{filteredProducts.length})
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function TagsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0084FE] mb-4"></div>
              <p className="text-gray-600">로딩 중...</p>
            </div>
          </div>
        </div>
      }
    >
      <TagsPageContent />
    </Suspense>
  );
}
