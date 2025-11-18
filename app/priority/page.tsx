'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
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
import { ScoredProduct, calculateQuickTop10, sortByPrice, sortByScore } from '@/lib/filtering/quickScore';
import { products as ALL_PRODUCTS } from '@/data/products';
import ProductListItem from '@/components/ProductListItem';
import ProductBottomSheet from '@/components/ProductBottomSheet';
import { Product } from '@/types';

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
  componentType?: 'priority-selector' | 'budget-selector' | 'product-list';
  typing?: boolean;
};

type ChatStep = 1 | 2 | 3; // 1: 중요도, 2: 예산, 3: 대화

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
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 초기화 추적용 ref
  const isInitializedRef = useRef(false);

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

  // Step 3 상태 (상품 리스트 및 추가 입력)
  const [filteredProducts, setFilteredProducts] = useState<ScoredProduct[]>([]);
  const [sortType, setSortType] = useState<'score' | 'price'>('score');
  const [hasUserInput, setHasUserInput] = useState(false);
  const [additionalInput, setAdditionalInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productBottomSheetOpen, setProductBottomSheetOpen] = useState(false);

  // 초기화: Step 1 메시지 추가
  useEffect(() => {
    // 이미 초기화되었으면 스킵 (Strict Mode 중복 방지)
    if (isInitializedRef.current) {
      console.log('⚠️ 초기화 이미 완료됨 - 스킵');
      return;
    }

    console.log('✅ 초기화 시작');
    isInitializedRef.current = true;

    // 홈에서 진입 시 항상 상태 초기화
    setCurrentStep(1);
    setPrioritySettings(DEFAULT_PRIORITY);
    setBudget(DEFAULT_BUDGET);
    setCustomBudget('');
    setIsCustomBudgetMode(false);
    setInput('');
    setTypingMessageId(null);

    logPageView('priority');

    // 가이드 표시 여부 체크
    const guideViewed = localStorage.getItem('babyitem_guide_viewed');
    if (!guideViewed) {
      setGuideBottomSheetOpen(true);
    }

    // 초기 메시지를 한 번에 설정 (중복 방지)
    const initialMessages: ChatMessage[] = [
      {
        id: `msg-${Date.now()}-1`,
        role: 'assistant',
        content: '안녕하세요! 딱 맞는 분유포트를 찾아드릴게요. 😊\n\n먼저 구매 기준들의 중요도를 골라주세요!',
        typing: true,
      },
      {
        id: `msg-${Date.now()}-2`,
        role: 'assistant',
        content: '**중요함**은 최대 3개까지 선택할 수 있어요.',
        typing: true,
      },
      {
        id: `msg-${Date.now()}-3`,
        role: 'component',
        content: '',
        componentType: 'priority-selector',
      },
    ];
    setMessages(initialMessages);

    // Cleanup - Strict Mode 지원
    return () => {
      console.log('🧹 cleanup 실행 - ref 리셋');
      // Strict Mode에서 재마운트될 때를 위해 ref 리셋
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const addComponentMessage = (componentType: 'priority-selector' | 'budget-selector') => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'component',
      content: '',
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

  // 속성 선택 핸들러
  const handlePrioritySelect = (attributeKey: string, level: PriorityLevel) => {
    const highCount = Object.values(prioritySettings).filter(v => v === 'high').length;

    if (level === 'high' && highCount >= 3 && prioritySettings[attributeKey as keyof PrioritySettings] !== 'high') {
      return;
    }

    setPrioritySettings((prev) => ({
      ...prev,
      [attributeKey]: level,
    }));

    const levelText = level === 'high' ? '중요함' : level === 'medium' ? '보통' : '중요하지 않음';
    logButtonClick(`우선순위 선택: ${levelText}`, 'priority', attributeKey);
  };

  // 교육 바텀시트 열기
  const openBottomSheet = (attribute: AttributeInfo) => {
    setSelectedAttribute(attribute);
    setBottomSheetOpen(true);
    logButtonClick(`교육 보기: ${attribute.name}`, 'priority');
  };

  // Step 1 → Step 2
  const handleStep1Next = () => {
    const allSelected = isPriorityComplete(prioritySettings);
    const highCount = Object.values(prioritySettings).filter(v => v === 'high').length;

    if (!allSelected) {
      alert('모든 속성의 중요도를 선택해주세요.');
      return;
    }

    if (highCount < 1 || highCount > 3) {
      alert("'중요함'은 1~3개만 선택할 수 있습니다.");
      return;
    }

    logButtonClick('Step 1 → Step 2', 'priority');
    setCurrentStep(2);

    // Step 2 메시지 추가
    addMessage('assistant', '좋아요! 이제 예산 범위를 선택해주세요. 💰', true);

    setTimeout(() => {
      addComponentMessage('budget-selector');
      // 예산 컴포넌트가 나타날 때 스크롤
      setTimeout(() => scrollToBottom(), 200);
    }, 1000);
  };

  // Step 2 → Step 3
  const handleStep2Next = () => {
    if (!budget) {
      alert('예산 범위를 선택해주세요.');
      return;
    }

    logButtonClick('Step 2 -> Step 3', 'priority');
    setCurrentStep(3);

    // 적합도 계산 및 Top 10 필터링
    const top10 = calculateQuickTop10(ALL_PRODUCTS, prioritySettings, budget);
    setFilteredProducts(top10);
    console.log(`✅ Filtered top 10 products for Step 3`);

    // Step 3 메시지 추가 - AI가 조건에 맞는 상품들을 찾았다고 말함
    addMessage('assistant', '조건에 맞는 상품들을 찾았어요! 🎉', true);

    setTimeout(() => {
      addMessage('assistant', '마지막으로 구체적으로 말씀해주시면 Top 3를 정확히 뽑아드릴게요.', true);

      // 상품 리스트 컴포넌트 추가
      setTimeout(() => {
        addComponentMessage('product-list');
        setTimeout(() => scrollToBottom(), 200);
      }, 800);
    }, 1200);
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

    // AI 확인 메시지
    setTimeout(() => {
      addMessage('assistant', '알겠습니다! 이제 **추천하기** 버튼을 눌러주세요. 😊', true);
    }, 500);

    logButtonClick('추가 입력 제출', 'priority');
  };

  // Step 3: 없어요 버튼 (추가 입력 스킵)
  const handleSkip = () => {
    setHasUserInput(true);
    addMessage('assistant', '좋아요! 그럼 바로 **추천하기** 버튼을 눌러주세요. 😊', true);
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
      // Step 3 데이터
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
      // 상태 초기화
      setCurrentStep(1);
      setPrioritySettings(DEFAULT_PRIORITY);
      setBudget(DEFAULT_BUDGET);
      setCustomBudget('');
      setIsCustomBudgetMode(false);
      setInput('');
      setTypingMessageId(null);

      // Step 3 상태 초기화
      setFilteredProducts([]);
      setSortType('score');
      setHasUserInput(false);
      setAdditionalInput('');
      setSelectedProduct(null);
      setProductBottomSheetOpen(false);

      // 초기 메시지로 재설정
      const initialMessages: ChatMessage[] = [
        {
          id: `msg-${Date.now()}-1`,
          role: 'assistant',
          content: '안녕하세요! 딱 맞는 분유포트를 찾아드릴게요. 😊\n\n먼저 구매 기준들의 중요도를 골라주세요!',
          typing: true,
        },
        {
          id: `msg-${Date.now()}-2`,
          role: 'assistant',
          content: '**중요함**은 최대 3개까지 선택할 수 있어요.',
          typing: true,
        },
        {
          id: `msg-${Date.now()}-3`,
          role: 'component',
          content: '',
          componentType: 'priority-selector',
        },
      ];
      setMessages(initialMessages);
    }
  };

  const highPriorityCount = Object.values(prioritySettings).filter(v => v === 'high').length;
  const isStep1Complete = isPriorityComplete(prioritySettings) && highPriorityCount >= 1 && highPriorityCount <= 3;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-50" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
            <CaretLeft size={24} weight="bold" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900"> 기본 정보 입력</h1>
          <button
            onClick={handleReset}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            처음부터
          </button>
        </header>

        {/* Messages Area - Scrollable */}
        <main className="flex-1 px-6 py-6 overflow-y-auto" style={{ paddingTop: '80px', paddingBottom: currentStep === 3 ? '140px' : '100px' }}>
          <div className="space-y-4">
            {messages.map((message) => {
              // Assistant 메시지
              if (message.role === 'assistant') {
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex justify-start"
                  >
                    <div className="px-4 py-3 text-gray-900 rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-sm">
                      {message.typing && typingMessageId === message.id ? (
                        <TypingMessage
                          content={message.content}
                          onUpdate={scrollToBottom}
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
                    <div className="max-w-[90%] px-4 py-3 bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl whitespace-pre-wrap text-sm">
                      {message.content}
                    </div>
                  </motion.div>
                );
              }

              // Component 메시지
              if (message.role === 'component') {
                // Priority Selector (기존 컴포넌트 재사용)
                if (message.componentType === 'priority-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
                        {PRIORITY_ATTRIBUTES.map((attribute, index) => (
                          <motion.div
                            key={attribute.key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="bg-gray-50 rounded-2xl p-4"
                          >
                            {/* Attribute Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-xl shrink-0">{ATTRIBUTE_ICONS[attribute.key]}</span>
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <h3 className="text-sm font-bold text-gray-900 shrink-0">{attribute.name}</h3>
                                  {/* 통계 태그 */}
                                  {attribute.key === 'temperatureControl' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0" style={{ backgroundColor: '#EAF8F8', color: '#009896' }}>
                                      87%가 중요함 선택
                                    </span>
                                  )}
                                  {attribute.key === 'hygiene' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0" style={{ backgroundColor: '#EAF8F8', color: '#009896' }}>
                                      74%가 중요함 선택
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => openBottomSheet(attribute)}
                                className="w-7 h-7 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                              >
                                <Question size={16} weight="bold" className="text-gray-400" />
                              </button>
                            </div>

                            {/* Button Group */}
                            <div className="flex bg-white rounded-xl p-1 gap-1">
                              <PriorityButton
                                level="low"
                                selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'low'}
                                onClick={() => handlePrioritySelect(attribute.key, 'low')}
                              />
                              <PriorityButton
                                level="medium"
                                selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'medium'}
                                onClick={() => handlePrioritySelect(attribute.key, 'medium')}
                              />
                              <PriorityButton
                                level="high"
                                selected={prioritySettings[attribute.key as keyof PrioritySettings] === 'high'}
                                onClick={() => handlePrioritySelect(attribute.key, 'high')}
                                disabled={highPriorityCount >= 3 && prioritySettings[attribute.key as keyof PrioritySettings] !== 'high'}
                              />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  );
                }

                // Budget Selector (기존 컴포넌트 재사용)
                if (message.componentType === 'budget-selector') {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="w-full"
                    >
                      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
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
                      <div className="flex gap-2 bg-gray-50 rounded-xl p-1">
                        <button
                          onClick={() => handleSortChange('score')}
                          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                            sortType === 'score'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          적합도순
                        </button>
                        <button
                          onClick={() => handleSortChange('price')}
                          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                            sortType === 'price'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          낮은가격순
                        </button>
                      </div>

                      {/* Product List */}
                      <div className="space-y-2">
                        {sortedProducts.map((product, index) => (
                          <ProductListItem
                            key={product.id}
                            product={product}
                            index={index}
                            onClick={handleProductClick}
                          />
                        ))}
                      </div>
                    </motion.div>
                  );
                }
              }

              return null;
            })}

            {/* Step 3: 예시 질문 버튼들 (입력 전에만 표시) */}
            {currentStep === 3 && !hasUserInput && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="space-y-2"
              >
                {[
                  '아기 잘 때 쓸 수 있게, 소리 안 나는 무음 기능 있는 제품 알려줘.',
                  '밤새 온도가 유지되는 영구 보온 기능 있는 걸로 찾아줘.',
                  '끓인 물 빨리 식혀주는 냉각팬 달린 제품으로 추천해줘.',
                  '나중에 티포트로도 쓸 수 있는 활용도 높은 제품 보여줘.',
                  '손 넣어서 씻기 편하게 입구 넓고, 뚜껑 분리되는 걸로 골라줘.',
                ].map((example, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      addMessage('user', example);
                      setAdditionalInput(example);
                      setHasUserInput(true);
                      setTimeout(() => {
                        addMessage('assistant', '알겠습니다! 이제 **추천하기** 버튼을 눌러주세요. 😊', true);
                      }, 500);
                      logButtonClick(`예시 질문 선택: ${example}`, 'priority');
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all"
                  >
                    {example}
                  </button>
                ))}
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Bottom Area - Fixed */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 z-10" style={{ maxWidth: '480px', margin: '0 auto' }}>
          {/* Step 1: 다음 버튼 */}
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

          {/* Step 2: 다음 버튼 */}
          {currentStep === 2 && budget && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStep2Next}
              className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base hover:opacity-90 transition-all"
            >
              다음
            </motion.button>
          )}

          {/* Step 3: 입력 bar + 없어요 버튼 + 추천하기 버튼 */}
          {currentStep === 3 && (
            <div className="space-y-3">
              {/* 입력창 + 없어요 버튼 (1회만 표시) */}
              {!hasUserInput && (
                <>
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
                      className="flex-1 min-h-12 max-h-[120px] px-4 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-y-auto scrollbar-hide text-gray-900 text-sm"
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

                  {/* 없어요 버튼 */}
                  <button
                    onClick={handleSkip}
                    className="w-full h-12 bg-gray-100 text-gray-700 rounded-2xl font-medium text-sm hover:bg-gray-200 transition-all"
                  >
                    없어요
                  </button>
                </>
              )}

              {/* 추천하기 버튼 (입력 후에만 표시) */}
              {hasUserInput && (
                <button
                  onClick={handleFinalSubmit}
                  className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 hover:opacity-90"
                >
                  <span>추천하기</span>
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
