'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatInputBar } from './ChatInputBar';
import { RecommendationPreview } from './RecommendationPreview';
import { Recommendation, UserContextSummary } from '@/types';
import { logButtonClick, logUserInput, logAIResponse, logReRecommendation } from '@/lib/logging/clientLogger';
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
  pdpInput?: { productId: string; userInput: string; productTitle: string } | null; // PDP에서 전달된 초기 입력
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
  onContextSummaryUpdate,
  pdpInput
}: ReRecommendationBottomSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [allUserInputs, setAllUserInputs] = useState<string[]>([]); // 모든 추가 입력 누적
  const [previousContextSummary, setPreviousContextSummary] = useState<string | null>(null); // 초기 조건 저장
  const [isCollapsed, setIsCollapsed] = useState(true); // 바텀시트 접힘 상태 (초기: 접힌 상태)
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const pdpProcessed = useRef(false); // PDP 입력 처리 여부

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

  // PDP 입력 자동 처리
  useEffect(() => {
    if (isOpen && pdpInput && !pdpProcessed.current) {
      pdpProcessed.current = true;

      // Priority 대화 내역 로드 (Summary)
      const saved = sessionStorage.getItem('babyitem_priority_conversation');
      if (saved) {
        try {
          const state = JSON.parse(saved);
          const filteredMessages = state.messages.filter((msg: ChatMessage) => {
            return msg.role === 'component' && msg.componentType === 'summary';
          });
          setMessages(filteredMessages);

          // Summary 저장
          const summaryMessage = filteredMessages.find((m: ChatMessage) => m.componentType === 'summary');
          if (summaryMessage) {
            setPreviousContextSummary(summaryMessage.content);
          }
        } catch (e) {
          console.error('Failed to load priority conversation:', e);
        }
      }

      // 제품 카드 메시지 추가
      setTimeout(() => {
        const productCardMessage: ChatMessage = {
          id: `pdp-product-${Date.now()}`,
          role: 'assistant',
          content: `**${pdpInput.productTitle}**를 기준으로 재추천해드릴게요!`,
        };
        setMessages((prev) => [...prev, productCardMessage]);
        setTypingMessageId(productCardMessage.id);

        // 사용자 입력 메시지 추가
        setTimeout(() => {
          const userMessage: ChatMessage = {
            id: `pdp-user-${Date.now()}`,
            role: 'user',
            content: pdpInput.userInput,
          };
          setMessages((prev) => [...prev, userMessage]);
          setAllUserInputs([pdpInput.userInput]);
          setHasSubmitted(true);

          // 자동으로 Agent API 호출
          setTimeout(async () => {
            setInput(pdpInput.userInput);
            setIsLoading(true);
            logUserInput(pdpInput.userInput, 'result');

            try {
              const session = loadSession();

              console.log('🤖 Agent Re-recommendation request (PDP):', {
                userInput: pdpInput.userInput,
                anchorProductId: pdpInput.productId,
                currentTags: {
                  pros: session.selectedProsTags?.length || 0,
                  cons: session.selectedConsTags?.length || 0,
                },
                budget: session.budget,
              });

              // Call Agent API
              const response = await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userInput: pdpInput.userInput,
                  sessionId: Date.now().toString(),
                  context: {
                    currentRecommendations: currentRecommendations,
                    currentSession: {
                      selectedProsTags: session.selectedProsTags || [],
                      selectedConsTags: session.selectedConsTags || [],
                      budget: session.budget,
                      anchorProduct: session.anchorProduct,
                    },
                  },
                  anchorProductId: pdpInput.productId,
                }),
              });

              if (!response.ok) {
                throw new Error(`Agent API error: ${response.status}`);
              }

              // Handle SSE streaming (same as handleSendMessage)
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
                      console.log('   Agent SSE event:', data.type);

                      if (data.type === 'message') {
                        const agentMessage: ChatMessage = {
                          id: `agent-${Date.now()}`,
                          role: 'assistant',
                          content: data.data,
                        };
                        setMessages((prev) => [...prev, agentMessage]);
                        setTypingMessageId(agentMessage.id);
                        logAIResponse(data.data, 'result');
                      }

                      if (data.type === 'clarification') {
                        const clarificationMessage: ChatMessage = {
                          id: `clarification-${Date.now()}`,
                          role: 'assistant',
                          content: data.data,
                        };
                        setMessages((prev) => [...prev, clarificationMessage]);
                        setTypingMessageId(clarificationMessage.id);
                        setIsLoading(false);
                      }

                      if (data.type === 'recommendations') {
                        const { recommendations: newRecs, updatedSession } = data.data;

                        // Update session
                        const updatedSessionData = loadSession();
                        updatedSessionData.recommendations = newRecs;
                        if (updatedSession.selectedProsTags) updatedSessionData.selectedProsTags = updatedSession.selectedProsTags;
                        if (updatedSession.selectedConsTags) updatedSessionData.selectedConsTags = updatedSession.selectedConsTags;
                        if (updatedSession.budget) updatedSessionData.budget = updatedSession.budget;
                        if (updatedSession.anchorProduct) updatedSessionData.anchorProduct = updatedSession.anchorProduct;
                        saveSession(updatedSessionData);

                        // Update Result page
                        onNewRecommendations(newRecs);

                        // Log
                        const oldIds = currentRecommendations.map(r => r.product.id);
                        const newIds = newRecs.map((r: Recommendation) => r.product.id);
                        logReRecommendation(pdpInput.userInput, newIds, oldIds);

                        // Analyze changes
                        const added = newIds.filter((id: string) => !oldIds.includes(id));
                        const removed = oldIds.filter((id: string) => !newIds.includes(id));

                        // Add summary and recommendation messages
                        setTimeout(async () => {
                          try {
                            const summaryResponse = await fetch('/api/chat', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'update_priority_summary',
                                previousSummary: previousContextSummary,
                                userInputs: [pdpInput.userInput],
                                prioritySettings: updatedSessionData.prioritySettings,
                                budget: updatedSessionData.budget,
                              }),
                            });

                            if (!summaryResponse.ok) throw new Error('Summary update failed');

                            const { summary } = await summaryResponse.json();

                            const newSummaryMessage: ChatMessage = {
                              id: `summary-${Date.now()}`,
                              role: 'component',
                              componentType: 'summary',
                              content: summary,
                            };

                            setMessages((prev) => [...prev, newSummaryMessage]);

                            setTimeout(() => {
                              const recommendationMessage: ChatMessage = {
                                id: `recommendations-${Date.now()}`,
                                role: 'component',
                                componentType: 'recommendations',
                                content: JSON.stringify({
                                  recommendations: newRecs,
                                  changes: {
                                    added,
                                    removed,
                                    unchanged: newRecs
                                      .filter((r: Recommendation) => !added.includes(r.product.id))
                                      .map((r: Recommendation) => r.product.id)
                                  }
                                }),
                              };
                              setMessages((prev) => [...prev, recommendationMessage]);

                              setTimeout(() => {
                                setIsLoading(false);
                              }, 100);
                            }, 300);

                          } catch (error) {
                            console.error('Summary update failed:', error);
                            const fallbackSummary = `${previousContextSummary}\n\n**추가 요청**\n- ${pdpInput.userInput}`;

                            const newSummaryMessage: ChatMessage = {
                              id: `summary-${Date.now()}`,
                              role: 'component',
                              componentType: 'summary',
                              content: fallbackSummary,
                            };

                            setMessages((prev) => [...prev, newSummaryMessage]);

                            setTimeout(() => {
                              const recommendationMessage: ChatMessage = {
                                id: `recommendations-${Date.now()}`,
                                role: 'component',
                                componentType: 'recommendations',
                                content: JSON.stringify({
                                  recommendations: newRecs,
                                  changes: {
                                    added,
                                    removed,
                                    unchanged: newRecs
                                      .filter((r: Recommendation) => !added.includes(r.product.id))
                                      .map((r: Recommendation) => r.product.id)
                                  }
                                }),
                              };
                              setMessages((prev) => [...prev, recommendationMessage]);

                              setTimeout(() => {
                                setIsLoading(false);
                              }, 100);
                            }, 300);
                          }
                        }, 300);

                        logButtonClick('재추천 완료', 'result');
                      }

                      if (data.type === 'error') {
                        console.error('Agent error:', data.data);
                        const errorMessage: ChatMessage = {
                          id: `error-${Date.now()}`,
                          role: 'assistant',
                          content: `죄송해요, 처리 중 오류가 발생했어요: ${data.data}`,
                        };
                        setMessages((prev) => [...prev, errorMessage]);
                        setIsLoading(false);
                      }
                    } catch (parseError) {
                      console.error('Failed to parse SSE message:', parseError);
                    }
                  }
                }
              }

              // Stream finished - ensure loading is stopped (if not already stopped by recommendation)
              console.log('   PDP SSE stream finished');
              setIsLoading(false);
            } catch (error) {
              console.error('PDP re-recommendation failed:', error);
              const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: '죄송합니다. 재추천 중 오류가 발생했습니다. 다시 시도해주세요.',
              };
              setMessages((prev) => [...prev, errorMessage]);
              setIsLoading(false);
            }
          }, 800);
        }, 500);
      }, 300);
    }
  }, [isOpen, pdpInput, currentRecommendations, onNewRecommendations, previousContextSummary]);

  // Reset pdpProcessed when bottom sheet closes
  useEffect(() => {
    if (!isOpen) {
      pdpProcessed.current = false;
    }
  }, [isOpen]);

  // 메시지 전송 (Agent API 사용)
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input.trim();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setAllUserInputs((prev) => [...prev, userInput]);

    // 첫 재추천인 경우 초기 Summary 저장
    if (!hasSubmitted) {
      const summaryMessage = messages.find(m => m.componentType === 'summary');
      if (summaryMessage) {
        setPreviousContextSummary(summaryMessage.content);
      }
      setHasSubmitted(true);
    }

    // 로깅: 사용자 입력
    logUserInput(userInput, 'result');

    try {
      // 세션에서 기존 데이터 로드
      const session = loadSession();

      console.log('🤖 Agent Re-recommendation request:', {
        userInput,
        allUserInputs: [...allUserInputs, userInput],
        currentTags: {
          pros: session.selectedProsTags?.length || 0,
          cons: session.selectedConsTags?.length || 0,
        },
        budget: session.budget,
      });

      // Agent API 호출
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput,
          sessionId: Date.now().toString(),
          context: {
            currentRecommendations: currentRecommendations,
            currentSession: {
              selectedProsTags: session.selectedProsTags || [],
              selectedConsTags: session.selectedConsTags || [],
              budget: session.budget,
              anchorProduct: session.anchorProduct,
            },
          },
          ...(pdpInput?.productId && { anchorProductId: pdpInput.productId }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent API error: ${response.status}`);
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

              console.log('   Agent SSE event:', data.type);

              if (data.type === 'thinking') {
                // Show thinking message (optional - we already have loading indicator)
                console.log('   Thinking:', data.data);
              }

              if (data.type === 'intent') {
                // Log intent classification
                console.log(`   Intent: ${data.data.tool} (${data.data.confidence}% confidence)`);
              }

              if (data.type === 'message') {
                // Agent response message
                const agentMessage: ChatMessage = {
                  id: `agent-${Date.now()}`,
                  role: 'assistant',
                  content: data.data,
                };
                setMessages((prev) => [...prev, agentMessage]);
                setTypingMessageId(agentMessage.id);

                // 로깅: AI 응답
                logAIResponse(data.data, 'result');
              }

              if (data.type === 'clarification') {
                // Budget clarification needed
                const clarificationMessage: ChatMessage = {
                  id: `clarification-${Date.now()}`,
                  role: 'assistant',
                  content: data.data,
                };
                setMessages((prev) => [...prev, clarificationMessage]);
                setTypingMessageId(clarificationMessage.id);
                setIsLoading(false);
              }

              if (data.type === 'recommendations') {
                // New recommendations received!
                const { recommendations: newRecs, updatedSession } = data.data;

                // 세션 업데이트
                const updatedSessionData = loadSession();
                updatedSessionData.recommendations = newRecs;
                if (updatedSession.selectedProsTags) updatedSessionData.selectedProsTags = updatedSession.selectedProsTags;
                if (updatedSession.selectedConsTags) updatedSessionData.selectedConsTags = updatedSession.selectedConsTags;
                if (updatedSession.budget) updatedSessionData.budget = updatedSession.budget;
                if (updatedSession.anchorProduct) updatedSessionData.anchorProduct = updatedSession.anchorProduct;
                saveSession(updatedSessionData);

                // Result 페이지 업데이트
                onNewRecommendations(newRecs);

                // 로깅: 재추천 결과
                const oldIds = currentRecommendations.map(r => r.product.id);
                const newIds = newRecs.map((r: Recommendation) => r.product.id);
                logReRecommendation(userInput, newIds, oldIds);

                // 변경사항 분석
                const added = newIds.filter((id: string) => !oldIds.includes(id));
                const removed = oldIds.filter((id: string) => !newIds.includes(id));

                const addedProducts = newRecs.filter((r: Recommendation) =>
                  added.includes(r.product.id)
                );
                const removedProducts = currentRecommendations.filter(r =>
                  removed.includes(r.product.id)
                );

                let changeType: 'all' | 'partial' | 'none';
                if (addedProducts.length === 3) {
                  changeType = 'all';
                } else if (addedProducts.length > 0 || removedProducts.length > 0) {
                  changeType = 'partial';
                } else {
                  changeType = 'none';
                }

                // Summary 컨테이너 + 추천 컨테이너 추가
                setTimeout(async () => {
                  try {
                    const allInputsList = [...allUserInputs, userInput].filter(Boolean);

                    // API 호출: update_priority_summary
                    const summaryResponse = await fetch('/api/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'update_priority_summary',
                        previousSummary: previousContextSummary,
                        userInputs: allInputsList,
                        prioritySettings: updatedSessionData.prioritySettings,
                        budget: updatedSessionData.budget,
                      }),
                    });

                    if (!summaryResponse.ok) {
                      throw new Error('Summary 업데이트 실패');
                    }

                    const { summary } = await summaryResponse.json();

                    const newSummaryMessage: ChatMessage = {
                      id: `summary-${Date.now()}`,
                      role: 'component',
                      componentType: 'summary',
                      content: summary,
                    };

                    setMessages((prev) => [...prev, newSummaryMessage]);

                    // 추천 컨테이너 추가
                    setTimeout(() => {
                      const recommendationMessage: ChatMessage = {
                        id: `recommendations-${Date.now()}`,
                        role: 'component',
                        componentType: 'recommendations',
                        content: JSON.stringify({
                          recommendations: newRecs,
                          changes: {
                            added,
                            removed,
                            unchanged: newRecs
                              .filter((r: Recommendation) => !added.includes(r.product.id))
                              .map((r: Recommendation) => r.product.id)
                          }
                        }),
                      };
                      setMessages((prev) => [...prev, recommendationMessage]);

                      setTimeout(() => {
                        setIsLoading(false);
                      }, 100);
                    }, 300);

                  } catch (error) {
                    console.error('❌ Summary 업데이트 실패:', error);
                    // Fallback: 간단한 Summary
                    const allInputsList = [...allUserInputs, userInput].filter(Boolean);
                    const fallbackSummary = `${previousContextSummary}\n\n**추가 요청**\n${allInputsList.map(input => `- ${input}`).join('\n')}`;

                    const newSummaryMessage: ChatMessage = {
                      id: `summary-${Date.now()}`,
                      role: 'component',
                      componentType: 'summary',
                      content: fallbackSummary,
                    };

                    setMessages((prev) => [...prev, newSummaryMessage]);

                    setTimeout(() => {
                      const recommendationMessage: ChatMessage = {
                        id: `recommendations-${Date.now()}`,
                        role: 'component',
                        componentType: 'recommendations',
                        content: JSON.stringify({
                          recommendations: newRecs,
                          changes: {
                            added,
                            removed,
                            unchanged: newRecs
                              .filter((r: Recommendation) => !added.includes(r.product.id))
                              .map((r: Recommendation) => r.product.id)
                          }
                        }),
                      };
                      setMessages((prev) => [...prev, recommendationMessage]);

                      setTimeout(() => {
                        setIsLoading(false);
                      }, 100);
                    }, 300);
                  }
                }, 300);

                logButtonClick('재추천 완료', 'result');
              }

              if (data.type === 'error') {
                console.error('   Agent error:', data.data);
                const errorMessage: ChatMessage = {
                  id: `error-${Date.now()}`,
                  role: 'assistant',
                  content: `죄송해요, 처리 중 오류가 발생했어요: ${data.data}`,
                };
                setMessages((prev) => [...prev, errorMessage]);
                setIsLoading(false);
              }

              if (data.type === 'done') {
                // Agent finished processing
                console.log('   ✅ Agent done');
                // Don't set loading false here - wait for stream to finish
              }
            } catch (parseError) {
              console.error('Failed to parse SSE message:', parseError);
            }
          }
        }
      }

      // Stream finished - ensure loading is stopped
      console.log('   SSE stream finished');
      setIsLoading(false);
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

  // 바텀시트 접기/펼치기 토글
  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - 펼쳐졌을 때만 표시 */}
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={handleToggleCollapse}
            />
          )}

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: isCollapsed ? 'calc(100% - 140px)' : 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-3xl z-50 flex flex-col ${
              isCollapsed ? 'shadow-[0_-4px_12px_rgba(0,0,0,0.1)]' : ''
            }`}
            style={{ height: isCollapsed ? '140px' : '85vh' }}
            onClick={isCollapsed ? handleToggleCollapse : undefined}
          >
            {/* Chevron Icon - 항상 표시 */}
            <div className="flex justify-center pt-2 pb-2">
              <button
                onClick={!isCollapsed ? handleToggleCollapse : undefined}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label={isCollapsed ? "펼치기" : "접기"}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isCollapsed ? (
                    <polyline points="18 15 12 9 6 15"></polyline>
                  ) : (
                    <polyline points="6 9 12 15 18 9"></polyline>
                  )}
                </svg>
              </button>
            </div>

            {/* Messages - Scrollable */}
            {!isCollapsed && (
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
                      <span className="text-sm text-gray-500">처리 중...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
            )}

            {/* Input Area - 항상 표시 */}
            <div
              className="px-3 pb-6 pt-2 shrink-0"
              onClick={(e) => {
                // 접혀있을 때 클릭하면 펼치기
                if (isCollapsed) {
                  e.stopPropagation();
                  handleToggleCollapse();
                }
              }}
            >
              <ChatInputBar
                value={input}
                onChange={(value) => {
                  // 접혀있을 때 입력 시도하면 펼치기
                  if (isCollapsed) {
                    handleToggleCollapse();
                  } else {
                    setInput(value);
                  }
                }}
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
