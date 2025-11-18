'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
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
  componentType?: 'priority-selector' | 'budget-selector';
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
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 초기화 추적용 ref
  const isInitializedRef = useRef(false);
  const queryProcessedRef = useRef<string | null>(null);

  // 기본 상태
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<ChatStep>(1);
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>(DEFAULT_PRIORITY);
  const [budget, setBudget] = useState<BudgetRange | null>(DEFAULT_BUDGET);
  const [customBudget, setCustomBudget] = useState<string>('');
  const [isCustomBudgetMode, setIsCustomBudgetMode] = useState(false);
  const [input, setInput] = useState('');
  const [conversationCount, setConversationCount] = useState(0);
  const [isLoadingQuery, setIsLoadingQuery] = useState(false);
  const [queryFromUrl, setQueryFromUrl] = useState<string>('');
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeInfo | null>(null);
  const [guideBottomSheetOpen, setGuideBottomSheetOpen] = useState(false);

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
    setConversationCount(0);
    setIsLoadingQuery(false);
    setQueryFromUrl('');
    setTypingMessageId(null);

    logPageView('priority');

    // 가이드 표시 여부 체크
    const guideViewed = localStorage.getItem('babyitem_guide_viewed');
    if (!guideViewed) {
      setGuideBottomSheetOpen(true);
    }

    // 쿼리가 없을 때만 초기 메시지 표시
    const query = searchParams.get('query');
    if (!query) {
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
      ];
      setMessages(initialMessages);

      // 속성 선택 컴포넌트 추가
      const timer = setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: `msg-${Date.now()}-3`,
            role: 'component',
            content: '',
            componentType: 'priority-selector',
          },
        ]);
      }, 1500);

      // Cleanup - Strict Mode 지원
      return () => {
        console.log('🧹 cleanup 실행 - ref 리셋');
        clearTimeout(timer);
        // Strict Mode에서 재마운트될 때를 위해 ref 리셋
        isInitializedRef.current = false;
      };
    }

    // Cleanup - Strict Mode 지원
    return () => {
      console.log('🧹 cleanup 실행 - ref 리셋');
      // Strict Mode에서 재마운트될 때를 위해 ref 리셋
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 쿼리 파라미터 처리
  useEffect(() => {
    const query = searchParams.get('query');

    // 이미 처리한 쿼리면 스킵 (중복 방지)
    if (query && queryProcessedRef.current === query) {
      console.log('⚠️ 쿼리 이미 처리됨 - 스킵:', query);
      return;
    }

    if (query) {
      console.log('✅ 쿼리 처리 시작:', query);
      queryProcessedRef.current = query;
      setQueryFromUrl(query);
      setInput(query);
      handleParseQuery(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 자연어 쿼리를 Priority 설정으로 변환
  const handleParseQuery = async (query: string) => {
    setIsLoadingQuery(true);

    // 1. 사용자 메시지를 가장 먼저 추가
    addMessage('user', query, false);

    // 2. 분석 중 메시지
    addMessage('assistant', '입력하신 내용을 분석하고 있어요... 잠시만 기다려주세요!', true);

    try {
      const response = await fetch('/api/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (response.ok) {
        const { prioritySettings: parsedSettings, budget: parsedBudget } = await response.json();
        setPrioritySettings(parsedSettings);

        // 예산이 감지된 경우 자동 반영
        if (parsedBudget) {
          setBudget(parsedBudget as BudgetRange);
        }

        // 3. 중요도 속성과 관련 있는지 판단
        const highPriorities = Object.entries(parsedSettings)
          .filter(([, value]) => value === 'high')
          .map(([key]) => {
            const attr = PRIORITY_ATTRIBUTES.find(a => a.key === key);
            return attr?.name;
          })
          .filter(Boolean);

        const mediumPriorities = Object.entries(parsedSettings)
          .filter(([, value]) => value === 'medium')
          .map(([key]) => {
            const attr = PRIORITY_ATTRIBUTES.find(a => a.key === key);
            return attr?.name;
          })
          .filter(Boolean);

        const hasRelevantPriorities = highPriorities.length > 0 || mediumPriorities.length > 0;

        if (hasRelevantPriorities) {
          // 중요도 속성과 관련 있는 경우
          let message = '✅ 분석 완료! ';

          if (highPriorities.length > 0) {
            message += `**${highPriorities.join(', ')}**${highPriorities.length > 1 ? '을' : '를'} 중요하게 반영했어요.`;
          }

          if (mediumPriorities.length > 0) {
            if (highPriorities.length > 0) {
              message += ` ${mediumPriorities.join(', ')}${mediumPriorities.length > 1 ? '도' : '도'} 고려했어요.`;
            } else {
              message += `**${mediumPriorities.join(', ')}**${mediumPriorities.length > 1 ? '을' : '를'} 고려했어요.`;
            }
          }

          message += ' 원하시면 수정하실 수 있어요!';
          addMessage('assistant', message, true);
        } else {
          // 중요도 속성과 관련 없는 경우
          addMessage('assistant', '✅ 메모리 업데이트 완료!', true);
        }

        // 중요도 선택 컴포넌트 추가
        setTimeout(() => {
          addComponentMessage('priority-selector');
        }, 500);

        logButtonClick('쿼리 자동 파싱 성공', 'priority', query);
      } else {
        addMessage('assistant', '⚠️ 분석에 실패했어요. 직접 중요도를 선택해주세요.', true);
        logButtonClick('쿼리 자동 파싱 실패', 'priority', query);
      }
    } catch (error) {
      console.error('Parse query error:', error);
      addMessage('assistant', '⚠️ 분석에 실패했어요. 직접 중요도를 선택해주세요.', true);
    } finally {
      setIsLoadingQuery(false);
    }
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
  const addComponentMessage = (componentType: 'priority-selector' | 'budget-selector') => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: 'component',
      content: '',
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    // 예산이 자연어로 이미 설정된 경우 안내 메시지 추가
    if (budget && queryFromUrl) {
      setTimeout(() => {
        const budgetText = budget === '0-50000' ? '5만원 이하'
          : budget === '50000-100000' ? '5~10만원'
          : budget === '100000-150000' ? '10~15만원'
          : budget === '150000+' ? '15만원 이상'
          : budget;

        addMessage('assistant', `**${budgetText}**로 자동 반영했어요. 변경하고 싶으시면 아래에서 선택해주세요!`, true);
      }, 600);
    }

    setTimeout(() => {
      addComponentMessage('budget-selector');
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

    // Step 3 메시지 추가
    addMessage('assistant', '거의 다 왔어요! 추가로 고려할 상황이 있으신가요?\n\n예를 들면 이런 내용들이에요:', true);
  };

  // 예산 선택
  const handleBudgetSelect = (budgetRange: BudgetRange) => {
    setBudget(budgetRange);
    setIsCustomBudgetMode(false);
    setCustomBudget('');
    logButtonClick(`예산 선택: ${budgetRange}`, 'priority');
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

  // Step 3: 메시지 전송
  const handleSendMessage = async () => {
    if (!input.trim() || conversationCount >= 5) return;

    const userInput = input.trim();
    addMessage('user', userInput);
    setInput('');

    const newConversationCount = conversationCount + 1;
    setConversationCount(newConversationCount);

    // 대화 이력 구성
    const history = `사용자: ${userInput}`;

    // AI 질문 생성 (마지막 턴이 아닐 때만)
    if (newConversationCount < 5) {
      try {
        const response = await fetch('/api/generate-contextual-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prioritySettings,
            budget,
            conversationHistory: history,
            currentTurn: newConversationCount + 1,
          }),
        });

        if (response.ok) {
          const { question } = await response.json();
          addMessage('assistant', question, true);
        } else {
          addMessage('assistant', '잘 이해했어요! 추가로 궁금한 점이 있으신가요?', true);
        }
      } catch (error) {
        console.error('Failed to generate question:', error);
        addMessage('assistant', '잘 이해했어요! 추가로 궁금한 점이 있으신가요?', true);
      }
    } else {
      addMessage('assistant', '충분한 정보를 얻었어요! 이제 **바로 추천받기** 버튼을 눌러주세요. 😊', true);
    }
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
      phase0Context: input || queryFromUrl || undefined,
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
      router.push('/priority');
      router.refresh();
    }
  };

  const highPriorityCount = Object.values(prioritySettings).filter(v => v === 'high').length;
  const isStep1Complete = isPriorityComplete(prioritySettings) && highPriorityCount >= 1 && highPriorityCount <= 3;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="relative w-full max-w-[480px] min-h-screen bg-white shadow-lg flex flex-col">
        {/* Header - Fixed */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
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
        <main className="flex-1 px-6 py-6 overflow-y-auto" style={{ paddingBottom: currentStep === 3 ? '140px' : '100px' }}>
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
              }

              return null;
            })}

            {/* Step 3: 예시 질문 버튼들 */}
            {currentStep === 3 && conversationCount === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="space-y-2"
              >
                {[
                  '쌍둥이라 동시에 분유를 자주 타요',
                  '외출이 많아서 휴대성이 중요해요',
                  '새벽 수유가 많아서 조용한 제품이 좋아요',
                  '좁은 공간에 두려고 해요',
                ].map((example, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInput(example);
                      setTimeout(() => handleSendMessage(), 100);
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

          {/* Step 3: 입력 bar + 추천받기 버튼 */}
          {currentStep === 3 && (
            <div className="space-y-3">
              {conversationCount < 5 ? (
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
              ) : (
                <div className="text-center text-sm text-gray-500 py-2">
                  충분한 대화가 이루어졌어요! 아래 버튼을 눌러주세요.
                </div>
              )}

              {/* 바로 추천받기 버튼 */}
              <button
                onClick={handleFinalSubmit}
                className="w-full h-14 bg-[#0084FE] text-white rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 hover:opacity-90"
              >
                <span>바로 추천받기</span>
                <span className="px-2 py-0.5 bg-white/20 rounded-md text-xs font-bold flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  <span>AI</span>
                </span>
              </button>
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
