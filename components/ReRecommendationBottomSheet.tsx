'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatInputBar } from './ChatInputBar';
import { RecommendationPreview } from './RecommendationPreview';
import { Recommendation, UserContextSummary } from '@/types';
import { logButtonClick } from '@/lib/logging/clientLogger';
import { loadSession, saveSession } from '@/lib/utils/session';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'component';
  content: string;
  componentType?: 'pros-selector' | 'cons-selector' | 'additional-selector' | 'budget-selector' | 'product-list' | 'summary' | 'summary-loading' | 'guide-button' | 'recommendations';
  typing?: boolean;
  extraMarginTop?: boolean;
  stepTag?: string;
}

interface ReRecommendationBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentRecommendations: Recommendation[];
  onNewRecommendations: (recommendations: Recommendation[]) => void;
  onContextSummaryUpdate?: (contextSummary: UserContextSummary) => void; // Context Summary 업데이트 callback
}

// 마크다운 포맷팅 함수 (bold + strikethrough 지원)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  // 텍스트를 마크다운 패턴별로 파싱하는 함수
  const parseInlineMarkdown = (content: string) => {
    // **bold** 와 ~~strikethrough~~ 를 모두 캡처
    const parts = content.split(/(\*\*.*?\*\*|~~.*?~~)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return <strong key={index} className="font-bold">{boldText}</strong>;
      }
      if (part.startsWith('~~') && part.endsWith('~~')) {
        const strikethroughText = part.slice(2, -2);
        return <span key={index} className="line-through text-gray-500">{strikethroughText}</span>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return lines.map((line, lineIndex) => {
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
      const formattedContent = parseInlineMarkdown(content);

      return (
        <div key={lineIndex} className="flex items-start gap-2 my-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-300 mt-2 shrink-0" />
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }

    const formattedLine = parseInlineMarkdown(line);
    return <div key={lineIndex}>{formattedLine}</div>;
  });
}

// REMOVED: parseBudgetFromInput() 함수 (정규식 패턴 방식)
// LLM 기반 예산 파싱으로 변경 (/api/chat의 'parse_budget' 액션 사용)
// 모든 자연어 표현을 정확하게 감지하고 유지보수가 용이함

// REMOVED: generateUpdatedSummary() 함수
// Priority 페이지와 동일한 방식으로 API를 통해 Summary를 생성합니다.
// /api/chat의 'update_priority_summary' 액션 사용

// 타이핑 이펙트 컴포넌트
function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 10);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete]);

  return <span>{formatMarkdown(displayedContent)}</span>;
}

export function ReRecommendationBottomSheet({
  isOpen,
  onClose,
  currentRecommendations,
  onNewRecommendations,
  onContextSummaryUpdate
}: ReRecommendationBottomSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [targetProgress, setTargetProgress] = useState(0); // 서버에서 받은 목표 진행률
  const [displayedProgress, setDisplayedProgress] = useState(0); // 화면에 표시되는 진행률 (1%씩 증가)
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [allUserInputs, setAllUserInputs] = useState<string[]>([]); // 모든 추가 입력 누적
  const [previousContextSummary, setPreviousContextSummary] = useState<string | null>(null); // 초기 조건 저장
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // 바텀시트 상태 저장
  useEffect(() => {
    if (isOpen && hasInitialized.current) {
      const stateToSave = {
        messages,
        hasSubmitted,
        allUserInputs,
        previousContextSummary,
      };
      sessionStorage.setItem('rerecommendation_state', JSON.stringify(stateToSave));
    }
  }, [messages, hasSubmitted, allUserInputs, previousContextSummary, isOpen]);

  // Priority 페이지 대화 내역 로드 + 바텀시트 상태 복원
  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true;

      // 이전 바텀시트 상태 복원 시도
      const savedState = sessionStorage.getItem('rerecommendation_state');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          setMessages(state.messages || []);
          setHasSubmitted(state.hasSubmitted || false);
          setAllUserInputs(state.allUserInputs || []);
          setPreviousContextSummary(state.previousContextSummary || null);
          return; // 복원 성공 시 초기화 스킵
        } catch (e) {
          console.error('Failed to restore rerecommendation state:', e);
        }
      }

      // 초기 로드 (복원 실패 또는 저장된 상태 없음)
      const saved = sessionStorage.getItem('babyitem_priority_conversation');
      if (saved) {
        try {
          const state = JSON.parse(saved);
          // Summary 컴포넌트만 표시 (하늘색 조건 컨테이너)
          const filteredMessages = state.messages.filter((msg: ChatMessage) => {
            return msg.role === 'component' && msg.componentType === 'summary';
          });
          setMessages(filteredMessages);

          // AI 첫 메시지 추가 (약간의 딜레이 후)
          setTimeout(() => {
            const initialMessage: ChatMessage = {
              id: `initial-${Date.now()}`,
              role: 'assistant',
              content: '위 조건으로 추천드렸어요! 추가로 말하고 싶은 게 있으시면 자유롭게 말씀해주세요. 😊',
            };
            setMessages((prev) => [...prev, initialMessage]);
            setTypingMessageId(initialMessage.id);
          }, 300);
        } catch (e) {
          console.error('Failed to load priority conversation:', e);
        }
      }
    }
  }, [isOpen]);

  // 자동 스크롤
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 진행률 부드럽게 증가 (1%씩 자연스러운 애니메이션)
  useEffect(() => {
    if (!isLoading) return;

    // displayedProgress를 targetProgress에 수렴시킴
    if (displayedProgress < targetProgress) {
      const interval = setInterval(() => {
        setDisplayedProgress((prev) => {
          const next = prev + 1;
          // 목표값을 넘지 않도록
          return next >= targetProgress ? targetProgress : next;
        });
      }, 30); // 30ms마다 1%씩 증가 (부드럽고 빠른 애니메이션)

      return () => clearInterval(interval);
    }
  }, [isLoading, displayedProgress, targetProgress]);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return; // hasSubmitted 체크 제거 - 계속 재추천 가능해야 함

    const userInput = input.trim();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setTargetProgress(0); // 목표 진행률 초기화
    setDisplayedProgress(0); // 표시 진행률 초기화
    setAllUserInputs((prev) => [...prev, userInput]); // 모든 입력 누적

    // 첫 재추천인 경우 초기 Summary 저장
    if (!hasSubmitted) {
      const summaryMessage = messages.find(m => m.componentType === 'summary');
      if (summaryMessage) {
        setPreviousContextSummary(summaryMessage.content);
      }
      setHasSubmitted(true);
    }

    logButtonClick('재추천 요청 전송', 'result');

    try {
      // 1단계: 입력 검증 - 의미 있는 요청인지 확인 (Top 3 맥락 포함)
      const validationResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate_rerecommendation_input',
          userInput,
          currentRecommendations: currentRecommendations.map(r => ({
            title: r.product.title,
            price: r.product.price
          })),
        }),
      });

      if (!validationResponse.ok) {
        throw new Error('입력 검증 실패');
      }

      const validation = await validationResponse.json();

      // 의미 없는 요청인 경우 재추천 안 하고 메시지만 표시
      if (!validation.isValid) {
        setIsLoading(false);
        const rejectionMessage: ChatMessage = {
          id: `rejection-${Date.now()}`,
          role: 'assistant',
          content: '이해하지 못했어요. 다른 요구사항이 있으면 말씀해주세요! 😊',
        };
        setMessages((prev) => [...prev, rejectionMessage]);
        setTypingMessageId(rejectionMessage.id);
        return;
      }

      // 2단계: 세션에서 기존 데이터 로드
      const session = loadSession();

      // 사용자 입력에서 예산 파싱 (LLM 사용)
      let parsedBudget: string | null = null;
      try {
        const budgetResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'parse_budget',
            userInput,
          }),
        });

        if (budgetResponse.ok) {
          const budgetData = await budgetResponse.json();
          const rawBudget = budgetData.budget;

          // 예산 검증: BudgetRange 타입의 유효한 값만 허용
          const validBudgetRanges = ['0-50000', '50000-100000', '100000-150000', '150000+'];
          if (rawBudget && validBudgetRanges.includes(rawBudget)) {
            parsedBudget = rawBudget;
            console.log('✅ 유효한 예산 파싱 완료:', parsedBudget);
          } else if (rawBudget !== null) {
            console.warn('⚠️ LLM이 유효하지 않은 예산을 반환했습니다:', rawBudget);
            console.warn('→ 기존 예산을 유지합니다:', session.budget);
          }
        }
      } catch (error) {
        console.error('예산 파싱 실패:', error);
        // 파싱 실패 시 기존 예산 유지
      }

      const finalBudget = parsedBudget || session.budget;

      // 모든 입력을 누적하여 phase0Context로 전달 (이전 입력 + 현재 입력)
      const allInputsText = [...allUserInputs, userInput].join('\n\n');

      console.log('재추천 요청:', {
        userInput,
        allUserInputs: [...allUserInputs, userInput],
        combinedContext: allInputsText,
        parsedBudget,
        originalBudget: session.budget,
        finalBudget,
        validationReason: validation.reason
      });

      // 재추천 API 호출
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          attributeAssessments: session.attributeAssessments, // 필수 필드 추가
          prioritySettings: session.prioritySettings,
          budget: finalBudget, // 파싱된 예산으로 override
          phase0Context: allInputsText, // 모든 입력을 누적하여 전달 (이전 입력 포함)
          isQuickRecommendation: session.isQuickRecommendation,
          chatConversations: session.chatConversations,
          selectedProsTags: session.selectedProsTags,
          selectedConsTags: session.selectedConsTags,
          selectedAdditionalTags: session.selectedAdditionalTags,
          additionalInput: session.additionalInput, // 기존 추가 입력 유지
          existingContextSummary: session.contextSummary,
          forceRegenerate: true, // 재생성 플래그
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // SSE 스트리밍 처리
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.error) {
                throw new Error(data.error);
              }

              // 진행률 업데이트 (목표값으로 설정)
              if (data.progress !== undefined) {
                setTargetProgress(data.progress);
              }

              // Context Summary 백그라운드 업데이트 처리 (기존 Result 페이지와 동일한 방식)
              if (data.type === 'context-summary' && data.contextSummary) {
                console.log('📊 Received background Context Summary update');
                const updatedSession = loadSession();
                updatedSession.contextSummary = data.contextSummary;
                saveSession(updatedSession);
                console.log('✓ Context Summary updated in session');

                // Result 페이지의 state 즉시 업데이트 (기존 로직과 동일)
                if (onContextSummaryUpdate) {
                  onContextSummaryUpdate(data.contextSummary);
                }
              }

              if (data.type === 'complete' && data.recommendations) {
                // 세션 업데이트 (가장 최신 추천으로)
                const updatedSession = loadSession();
                updatedSession.recommendations = data.recommendations;
                // Context Summary는 백그라운드에서 별도 업데이트됨 (위의 context-summary 이벤트)
                if (data.contextSummary) {
                  updatedSession.contextSummary = data.contextSummary;
                }
                saveSession(updatedSession);

                // Result 페이지 업데이트
                onNewRecommendations(data.recommendations);

                // 변경사항 분석
                const oldIds = currentRecommendations.map(r => r.product.id);
                const newIds = data.recommendations.map((r: Recommendation) => r.product.id);
                const added = newIds.filter((id: string) => !oldIds.includes(id));
                const removed = oldIds.filter((id: string) => !newIds.includes(id));

                // 변경사항 분석
                const addedProducts = data.recommendations.filter((r: Recommendation) =>
                  added.includes(r.product.id)
                );
                const removedProducts = currentRecommendations.filter(r =>
                  removed.includes(r.product.id)
                );

                // 변경 유형 결정
                let changeType: 'all' | 'partial' | 'none';
                if (addedProducts.length === 3) {
                  changeType = 'all';
                } else if (addedProducts.length > 0 || removedProducts.length > 0) {
                  changeType = 'partial';
                } else {
                  changeType = 'none';
                }

                // 로딩 종료 및 순차적으로 메시지 추가: Summary → AI 설명 → 추천 컨테이너
                setTimeout(async () => {
                  try {
                    // 1단계: Summary 컨테이너 새로 추가 (사용자 입력 바로 다음)
                    const session = loadSession();
                    const allInputsList = [...allUserInputs, userInput].filter(Boolean);

                    // API 호출: update_priority_summary
                    const summaryResponse = await fetch('/api/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'update_priority_summary',
                        previousSummary: previousContextSummary,
                        userInputs: allInputsList,
                        prioritySettings: session.prioritySettings,
                        budget: finalBudget,
                      }),
                    });

                    if (!summaryResponse.ok) {
                      throw new Error('Summary 업데이트 실패');
                    }

                    const { summary } = await summaryResponse.json();

                    // 1-1단계: 업데이트된 Summary로 AI 설명 메시지 생성 (특징 중심 스마트 요약)
                    let explanationContent = '';
                    try {
                      const explanationResponse = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'generate_change_explanation',
                          userInput,
                          updatedSummary: summary, // 업데이트된 Summary 전달
                          removedProducts: removedProducts.map(r => ({
                            title: r.product.title,
                            price: r.product.price,
                            coreValues: r.product.coreValues
                          })),
                          addedProducts: addedProducts.map((a: Recommendation) => ({
                            title: a.product.title,
                            price: a.product.price,
                            coreValues: a.product.coreValues
                          })),
                          changeType
                        }),
                      });

                      if (explanationResponse.ok) {
                        const { explanation } = await explanationResponse.json();
                        explanationContent = explanation;
                      } else {
                        throw new Error('설명 생성 실패');
                      }
                    } catch (error) {
                      console.error('AI 설명 생성 실패, Fallback 사용:', error);
                      // Fallback: 간단한 템플릿
                      if (changeType === 'all') {
                        explanationContent = `요청하신 조건에 맞춰 추천 제품 3개 모두 새롭게 선정했어요! 😊`;
                      } else if (changeType === 'partial') {
                        explanationContent = `조건에 더 잘 맞는 제품들로 일부 교체했어요! 😊`;
                      } else {
                        const requestNote = userInput ? `"**${userInput}**" 요청사항을 검토했지만, ` : '';
                        explanationContent = `${requestNote}현재 추천 제품들이 이미 가장 적합하다고 판단되어 변경하지 않았어요. 다른 요구사항이 있으시면 말씀해주세요! 😊`;
                      }
                    }

                    const newSummaryMessage: ChatMessage = {
                      id: `summary-${Date.now()}`,
                      role: 'component',
                      componentType: 'summary',
                      content: summary,
                    };

                    // Summary 항상 새로 추가 (기존 것 유지, replace 안 함)
                    setMessages((prev) => [...prev, newSummaryMessage]);

                    // 2단계: AI 설명 메시지 추가
                    setTimeout(() => {
                      const explanationMessage: ChatMessage = {
                        id: `explanation-${Date.now()}`,
                        role: 'assistant',
                        content: explanationContent,
                      };
                      setMessages((prev) => [...prev, explanationMessage]);
                      setTypingMessageId(explanationMessage.id);

                      // 3단계: 추천 컨테이너 추가
                      setTimeout(() => {
                        const recommendationMessage: ChatMessage = {
                          id: `recommendations-${Date.now()}`,
                          role: 'component',
                          componentType: 'recommendations',
                          content: JSON.stringify({
                            recommendations: data.recommendations,
                            changes: {
                              added,
                              removed,
                              unchanged: data.recommendations
                                .filter((r: Recommendation) => !added.includes(r.product.id))
                                .map((r: Recommendation) => r.product.id)
                            }
                          }),
                        };
                        setMessages((prev) => [...prev, recommendationMessage]);

                        // 모든 메시지 추가 완료 후 로딩 종료
                        setTimeout(() => {
                          setIsLoading(false);
                        }, 100);
                      }, 400);
                    }, 200);

                  } catch (error) {
                    console.error('❌ Summary 업데이트 실패:', error);
                    // Fallback: 간단한 Summary
                    const allInputsList = [...allUserInputs, userInput].filter(Boolean);
                    const fallbackSummary = `${previousContextSummary}\n\n**추가 요청**\n${allInputsList.map(input => `- ${input}`).join('\n')}`;

                    // Fallback: AI 설명도 생성
                    let fallbackExplanation = '';
                    if (changeType === 'all') {
                      fallbackExplanation = `요청하신 조건에 맞춰 추천 제품 3개 모두 새롭게 선정했어요! 😊`;
                    } else if (changeType === 'partial') {
                      fallbackExplanation = `조건에 더 잘 맞는 제품들로 일부 교체했어요! 😊`;
                    } else {
                      const requestNote = userInput ? `"**${userInput}**" 요청사항을 검토했지만, ` : '';
                      fallbackExplanation = `${requestNote}현재 추천 제품들이 이미 가장 적합하다고 판단되어 변경하지 않았어요. 다른 요구사항이 있으시면 말씀해주세요! 😊`;
                    }

                    const newSummaryMessage: ChatMessage = {
                      id: `summary-${Date.now()}`,
                      role: 'component',
                      componentType: 'summary',
                      content: fallbackSummary,
                    };

                    // Fallback도 새로 추가
                    setMessages((prev) => [...prev, newSummaryMessage]);

                    // Fallback: AI 설명 + 추천 컨테이너도 추가
                    setTimeout(() => {
                      const explanationMessage: ChatMessage = {
                        id: `explanation-${Date.now()}`,
                        role: 'assistant',
                        content: fallbackExplanation,
                      };
                      setMessages((prev) => [...prev, explanationMessage]);
                      setTypingMessageId(explanationMessage.id);

                      setTimeout(() => {
                        const recommendationMessage: ChatMessage = {
                          id: `recommendations-${Date.now()}`,
                          role: 'component',
                          componentType: 'recommendations',
                          content: JSON.stringify({
                            recommendations: data.recommendations,
                            changes: {
                              added,
                              removed,
                              unchanged: data.recommendations
                                .filter((r: Recommendation) => !added.includes(r.product.id))
                                .map((r: Recommendation) => r.product.id)
                            }
                          }),
                        };
                        setMessages((prev) => [...prev, recommendationMessage]);

                        // 모든 메시지 추가 완료 후 로딩 종료
                        setTimeout(() => {
                          setIsLoading(false);
                        }, 100);
                      }, 400);
                    }, 200);
                  }
                }, 500);

                logButtonClick('재추천 완료', 'result');
              }
            } catch (parseError) {
              console.error('Failed to parse SSE message:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Re-recommendation failed:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '죄송합니다. 재추천 중 오류가 발생했습니다. 다시 시도해주세요.',
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      setHasSubmitted(false);
    }
  };

  // 바텀시트 닫을 때 상태 초기화 방지
  const handleClose = () => {
    onClose();
    // hasInitialized.current는 유지 (다시 열 때 복원)
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-3xl z-50 flex flex-col"
            style={{ height: '85vh' }}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-3 py-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">다시 추천받기</h2>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages - Scrollable */}
            <div className="flex-1 px-3 py-4 overflow-y-auto">
              <div className="space-y-4">
                {messages.map((message) => {
                  // Component messages (Summary, Recommendations, etc.)
                  if (message.role === 'component') {
                    if (message.componentType === 'summary') {
                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
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

                    if (message.componentType === 'recommendations') {
                      try {
                        const data = JSON.parse(message.content);
                        return (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full"
                          >
                            <RecommendationPreview
                              recommendations={data.recommendations}
                              changes={data.changes}
                              showChanges
                              onClick={() => {
                                // Result 페이지 업데이트
                                onNewRecommendations(data.recommendations);
                                // 바텀시트 닫기
                                onClose();
                                // 상단으로 스크롤
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            />
                          </motion.div>
                        );
                      } catch (error) {
                        console.error('Failed to parse recommendations:', error);
                        return null;
                      }
                    }

                    return null; // 다른 컴포넌트는 표시 안 함
                  }

                  // Assistant messages
                  if (message.role === 'assistant') {
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="w-full flex justify-start"
                      >
                        <div className="max-w-[90%] text-gray-900 text-base whitespace-pre-wrap">
                          {message.id === typingMessageId ? (
                            <TypingMessage
                              content={message.content}
                              onComplete={() => setTypingMessageId(null)}
                            />
                          ) : (
                            formatMarkdown(message.content)
                          )}
                        </div>
                      </motion.div>
                    );
                  }

                  // User messages
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

                  return null;
                })}

                {/* 로딩 중 */}
                {isLoading && (
                  <div className="w-full flex justify-start">
                    <div className="px-4 py-3 flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0s_infinite]"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0.15s_infinite]"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1s_ease-in-out_0.3s_infinite]"></span>
                      </div>
                      <span className="text-sm text-gray-500">{displayedProgress}%</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area - 항상 표시 */}
            <div className="px-3 py-4 bg-white border-t border-gray-200 shrink-0">
              <ChatInputBar
                value={input}
                onChange={(value) => setInput(value)}
                onSend={handleSendMessage}
                placeholder={hasSubmitted ? "계속 추가 요청하실 수 있어요" : "추가로 고려할 사항을 입력해주세요"}
                disabled={isLoading}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
