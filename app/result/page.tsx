'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { loadSession, saveSession, clearSession } from '@/lib/utils/session';
import { Recommendation, UserContextSummary, ProductCategory } from '@/types';
import UserContextSummaryComponent from '@/components/UserContextSummary';
// import ComparisonTable from '@/components/ComparisonTable';
import DetailedComparisonTable from '@/components/DetailedComparisonTable';
import { logPageView, logButtonClick, logComparisonChat } from '@/lib/logging/clientLogger';
import { ChatInputBar } from '@/components/ChatInputBar';
import { ReRecommendationBottomSheet } from '@/components/ReRecommendationBottomSheet';
import ProductDetailModal from '@/components/ProductDetailModal';
import { CATEGORY_NAMES } from '@/lib/data';

// 마크다운 볼드 처리 함수 (기존 추천 상세 정보용)
function parseMarkdownBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return <strong key={index} className="font-bold">{boldText}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

// 마크다운 포맷팅 함수 (볼드 + 리스트) (채팅용)
function formatMarkdown(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    // 리스트 항목 감지: "- " or "* " or "• "
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);

    if (listMatch) {
      const content = listMatch[1];
      // **text** → <strong>text</strong>
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

// 타이핑 메시지 컴포넌트 (스트리밍 효과)
function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // 안전 체크: content가 정의되어 있는지 확인
    if (!content) {
      if (onComplete) onComplete();
      return;
    }

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 10); // 10ms per character

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, onComplete]);

  return <span className="whitespace-pre-wrap">{formatMarkdown(displayedContent)}</span>;
}

// 원형 프로그레스 바 컴포넌트
function CircularProgress({ score, total, color, size = 52 }: { score: number; total: number; color: 'green' | 'blue'; size?: number }) {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    green: { bg: 'text-green-100', fg: 'text-green-500' },
    blue: { bg: 'text-blue-100', fg: 'text-blue-500' },
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className={colorClasses[color].bg}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`${colorClasses[color].fg} transition-all duration-500`}
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[11px] font-bold leading-none ${color === 'green' ? 'text-green-700' : 'text-blue-700'}`}>
          {score % 1 === 0 ? Math.round(score) : score.toFixed(1)}/{Math.round(total)}
        </span>
      </div>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [contextSummary, setContextSummary] = useState<UserContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetProgress, setTargetProgress] = useState(0); // 서버에서 받은 목표 진행률
  const [displayedProgress, setDisplayedProgress] = useState(0); // 화면에 표시되는 진행률
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // Removed: Old API (v1) bottom sheet - Tag-based flow uses ProductDetailModal instead
  // const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  // const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  // Tag-based flow (v2) state
  const [isTagBasedFlow, setIsTagBasedFlow] = useState(false);
  const [anchorProduct, setAnchorProduct] = useState<any>(null);
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [comparativeAnalysis, setComparativeAnalysis] = useState<any>(null); // NEW: Store comparative analysis

  // 채팅 관련 state (비교 질문하기)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; id?: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null); // Main element ref for scroll control

  // 재추천 바텀시트 state
  const [pdpRecommendInput, setPdpRecommendInput] = useState<{ productId: string; userInput: string; productTitle: string } | null>(null);

  // 탭 상태 (제거됨 - 단일 페이지로 통합)
  // const [activeTab, setActiveTab] = useState<'recommendations' | 'comparison'>('recommendations');

  // 비교표 데이터 캐싱 (탭 전환 시 재생성 방지)
  const [comparisonFeatures, setComparisonFeatures] = useState<Record<string, string[]>>({});
  const [comparisonDetails, setComparisonDetails] = useState<Record<string, { pros: string[]; cons: string[]; comparison: string }>>({});

  // 제품 상세 모달 state
  const [selectedProductForModal, setSelectedProductForModal] = useState<Recommendation | null>(null);

  // 나가기 확인 모달 state
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  // 다나와 가격 정보 state
  const [danawaData, setDanawaData] = useState<Record<string, {
    lowestPrice: number;
    lowestMall: string;
    productName: string;
    prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
    loading: boolean;
  }>>({});

  const toggleSection = (key: string) => {
    const newState = !expandedSections[key];
    setExpandedSections((prev) => ({
      ...prev,
      [key]: newState,
    }));

    // 로깅
    logButtonClick(
      newState ? `섹션 열기: ${key}` : `섹션 닫기: ${key}`,
      'result'
    );
  };

  // PDP Modal에서 "이 상품 기반으로 재추천" 핸들러
  const handlePDPReRecommend = async (productId: string, userInput: string) => {
    console.log(`🤖 PDP Re-recommend: Product ${productId}, Input: "${userInput}"`);

    // Find product title from current recommendations
    const product = recommendations.find(r => r.product.id === productId);
    const productTitle = product ? product.product.title : '선택한 제품';

    // Set PDP input data
    setPdpRecommendInput({
      productId,
      userInput,
      productTitle
    });

    // Close PDP modal
    setSelectedProductForModal(null);

    // Re-recommendation bottom sheet is always open, so just set the PDP input
    // (바텀시트가 항상 열려있으므로 PDP input만 설정)

    // Log
    logButtonClick('PDP 재추천 시작', 'result');
  };

  // 채팅 메시지 전송 핸들러
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoadingMessage) return;

    const userMessage = inputValue.trim();
    const messageId = Date.now().toString();

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, id: `user-${messageId}` }]);
    setInputValue('');
    setIsLoadingMessage(true);

    try {
      // Build conversation history
      const conversationHistory = messages
        .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');

      // Call API
      // Tag-based flow: Include anchor product (4 products)
      // Normal flow: Top 3 recommendations only
      const productIds = isTagBasedFlow && anchorProduct
        ? [String(anchorProduct.productId), ...recommendations.slice(0, 3).map(r => r.product.id)]
        : recommendations.slice(0, 3).map(r => r.product.id);
      const response = await fetch('/api/compare-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          productIds,
          conversationHistory,
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessageId = `assistant-${messageId}`;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, id: assistantMessageId }
      ]);
      setTypingMessageId(assistantMessageId);

      // Log comparison chat
      logComparisonChat(
        'result',
        productIds,
        userMessage,
        data.response
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessageId = `error-${messageId}`;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다.', id: errorMessageId }
      ]);
    } finally {
      setIsLoadingMessage(false);
    }
  };

  // 퀵 질문 핸들러
  const handleQuickQuestion = async (query: string) => {
    setInputValue(query);
    const messageId = Date.now().toString();

    setMessages((prev) => [...prev, { role: 'user', content: query, id: `user-${messageId}` }]);
    setInputValue('');
    setIsLoadingMessage(true);

    try {
      // Tag-based flow: Include anchor product (4 products)
      // Normal flow: Top 3 recommendations only
      const productIds = isTagBasedFlow && anchorProduct
        ? [String(anchorProduct.productId), ...recommendations.slice(0, 3).map(r => r.product.id)]
        : recommendations.slice(0, 3).map(r => r.product.id);
      const response = await fetch('/api/compare-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          productIds,
          conversationHistory: messages.map((m) => `${m.role}: ${m.content}`).join('\n')
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessageId = `assistant-${messageId}`;
      const assistantMessage = {
        role: 'assistant' as const,
        content: data.response,
        id: assistantMessageId
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setTypingMessageId(assistantMessageId);

      // Log quick question comparison chat
      logComparisonChat(
        'result',
        productIds,
        query,
        data.response
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = {
        role: 'assistant' as const,
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.'
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoadingMessage(false);
    }
  };

  // Top 3 섹션으로 스크롤
  const scrollToTop3 = () => {
    const top3Element = document.getElementById('top3-section');
    if (top3Element) {
      top3Element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 상세 비교표 섹션으로 스크롤
  const scrollToComparison = () => {
    const comparisonElement = document.getElementById('comparison-section');
    if (comparisonElement) {
      comparisonElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      logButtonClick('상세 비교표 스크롤', 'result');
    }
  };

  // 사용자 맥락 요약 섹션으로 스크롤
  const scrollToUserContext = () => {
    const userContextElement = document.getElementById('user-context-section');
    if (userContextElement) {
      userContextElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      logButtonClick('내 구매 기준 스크롤', 'result');
    }
  };

  // 순차적으로 보여줄 상태 메시지들
  const phaseMessages = [
    '판매량 상위 상품들 확인 중...',
    '내돈내산 리뷰 분석 중...',
    '딱 맞는 상품 고르는 중...',
  ];

  useEffect(() => {
    setMounted(true);

    // 페이지 로딩 시 스크롤을 맨 위로 리셋 (브라우저의 스크롤 복원 방지)
    // 여러 방법을 동시에 시도하여 확실하게 스크롤 리셋
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // Main element의 스크롤도 리셋 (핵심!)
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
    };

    // 즉시 실행
    resetScroll();

    // 브라우저의 자동 스크롤 복원보다 늦게 실행
    setTimeout(resetScroll, 0);

    // 애니메이션 프레임 후 실행 (렌더링 완료 후)
    requestAnimationFrame(() => {
      resetScroll();
      // 한 번 더 보험
      requestAnimationFrame(resetScroll);
    });

    // 약간 더 지연 (레이아웃이 완전히 정착된 후)
    setTimeout(resetScroll, 100);
  }, []);

  // 페이지 뷰 로깅
  useEffect(() => {
    if (!mounted) return;
    logPageView('result');
  }, [mounted]);

  // 로딩 완료 후 스크롤 리셋 (로딩 → 컨텐츠 전환 시)
  useEffect(() => {
    if (!loading && mainRef.current) {
      // 로딩이 끝나고 실제 컨텐츠가 렌더링될 때 main 스크롤 리셋
      mainRef.current.scrollTop = 0;

      // 애니메이션 완료 후 한 번 더 리셋
      setTimeout(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop = 0;
        }
      }, 500); // 애니메이션 duration (0.4s) + 여유
    }
  }, [loading]);

  // Handle browser back button for modal
  useEffect(() => {
    const handlePopState = () => {
      setSelectedProductForModal(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 타이머 효과
  useEffect(() => {
    if (!loading) return;

    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 0.01);
    }, 10); // 10ms마다 업데이트 (0.01초씩 증가)

    return () => clearInterval(timer);
  }, [loading]);

  // 상태 메시지 자동 교체 (displayedProgress 기반)
  useEffect(() => {
    if (displayedProgress < 33) {
      setCurrentPhaseIndex(0); // 랭킹 상품 확인 중...
    } else if (displayedProgress < 66) {
      setCurrentPhaseIndex(1); // 고객님 선호도 분석 중...
    } else {
      setCurrentPhaseIndex(2); // 꼭 맞는 상품 분석 중...
    }
  }, [displayedProgress]);

  // 진행률 부드럽게 증가 (displayedProgress가 targetProgress를 따라감)
  useEffect(() => {
    if (!loading) return;

    // displayedProgress를 targetProgress에 수렴시킴
    if (displayedProgress < targetProgress) {
      const interval = setInterval(() => {
        setDisplayedProgress((prev) => {
          const next = prev + 1; // 1%씩 증가 (부드럽게)
          // 목표값을 넘지 않도록
          return next >= targetProgress ? targetProgress : next;
        });
      }, 50); // 50ms마다 1%씩 증가 (1초에 20% 증가)

      return () => clearInterval(interval);
    }
  }, [loading, displayedProgress, targetProgress]);


  const fetchRecommendations = async () => {
    try {
      // 상태 초기화
      setLoading(true);
      setTargetProgress(0);
      setDisplayedProgress(0);
      setError(null);
      setRecommendations([]);
      setContextSummary(null);

      const session = loadSession();

      // API 호출 (스트리밍)
      console.log('🚀 Starting recommendation API call...');
      console.log('📨 Request payload:', {
        messagesCount: session.messages.length,
        attributeAssessments: session.attributeAssessments,
        prioritySettings: session.prioritySettings,
        budget: session.budget,
        isQuickRecommendation: session.isQuickRecommendation,
        chatConversations: session.chatConversations,
        phase0Context: session.phase0Context,
      });

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          attributeAssessments: session.attributeAssessments,
          prioritySettings: session.prioritySettings,
          budget: session.budget,
          isQuickRecommendation: session.isQuickRecommendation,
          chatConversations: session.chatConversations,
          phase0Context: session.phase0Context,
          additionalInput: session.additionalInput, // 추가 입력 전달 (Step 3)
          existingContextSummary: session.contextSummary, // 기존 contextSummary 전달
          selectedProsTags: session.selectedProsTags, // 선택된 장점 태그
          selectedConsTags: session.selectedConsTags, // 선택된 단점 태그
          selectedAdditionalTags: session.selectedAdditionalTags, // 선택된 추가 고려사항 태그
        }),
      });

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Recommendation API failed: ${response.status} ${response.statusText}`);
      }

      // 스트리밍 응답 처리
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      console.log('📖 Starting to read SSE stream...');

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✓ Stream reading completed');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('📡 Received chunk:', chunk.substring(0, 200));
        buffer += chunk;

        // SSE 메시지 파싱 (data: {...}\n\n 형식)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 마지막 불완전한 줄은 버퍼에 보관

        console.log(`🔍 Processing ${lines.length} lines from buffer`);

        for (const line of lines) {
          console.log('📄 Processing line:', line.substring(0, 150));

          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6).trim();

            // 빈 문자열 체크
            if (!jsonStr) {
              console.debug('⏭️  Empty JSON string, skipping');
              continue;
            }

            console.log('📦 Extracted JSON:', jsonStr.substring(0, 100) + '...');

            let data;
            try {
              data = JSON.parse(jsonStr);
            } catch (parseError) {
              console.error('❌ JSON parse error:', parseError);
              console.error('   Failed to parse:', jsonStr.substring(0, 200));
              // 파싱 실패는 일부 메시지만 건너뛰고 계속
              continue;
            }

            // 데이터 유효성 검증
            if (!data || typeof data !== 'object') {
              console.warn('⚠️  Invalid data object, skipping');
              continue;
            }

            if (data.error) {
              console.error('❌ API error:', data.error);
              setError(data.error);
              setLoading(false);
              return;
            }

            if (data.type === 'complete') {
              // 최종 결과
              console.log('✅ Recommendation complete!');
              console.log('  Recommendations count:', data.recommendations?.length);
              console.log('  Persona summary:', data.persona?.summary?.substring(0, 50) + '...');
              console.log('  Context summary:', data.contextSummary);

              // 세션에 저장
              const updatedSession = loadSession();
              updatedSession.persona = data.persona;
              updatedSession.recommendations = data.recommendations;
              updatedSession.contextSummary = data.contextSummary;
              saveSession(updatedSession);

              // 추천 결과 로깅 (전체 리포트 포함)
              if (data.recommendations && data.recommendations.length > 0) {
                const productIds = data.recommendations.map((r: Recommendation) => r.product.id);
                const fullReport = {
                  userContext: data.contextSummary ? {
                    priorityAttributes: data.contextSummary.priorityAttributes,
                    additionalContext: data.contextSummary.additionalContext,
                    budget: data.contextSummary.budget,
                  } : undefined,
                  recommendations: data.recommendations.map((r: Recommendation) => ({
                    rank: r.rank,
                    productId: r.product.id,
                    productTitle: r.product.title,
                    price: r.product.price,
                    finalScore: r.finalScore,
                    reasoning: r.reasoning,
                    selectedTagsCount: r.selectedTagsEvaluation?.length || 0,
                    additionalProsCount: r.additionalPros?.length || 0,
                    consCount: r.cons?.length || 0,
                  })),
                };

                // 전체 리포트를 포함하여 로깅
                fetch('/api/log', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: localStorage.getItem('baby_item_session_id'),
                    eventType: 'recommendation_received',
                    recommendations: {
                      productIds,
                      persona: data.persona || null, // 전체 persona 객체 저장
                      isQuickRecommendation: updatedSession.isQuickRecommendation || false,
                      fullReport,
                    },
                  }),
                }).catch(console.error);
              }

              // 화면에 표시
              if (!data.recommendations || data.recommendations.length === 0) {
                console.error('⚠️ No recommendations in response!');
                setError('추천 결과가 없습니다');
                setLoading(false);
                return;
              }

              console.log('🎯 Setting recommendations to state:', data.recommendations.length);
              console.log('📦 First recommendation:', {
                rank: data.recommendations[0]?.rank,
                hasProduct: !!data.recommendations[0]?.product,
                hasReasoning: !!data.recommendations[0]?.reasoning,
                tagEvaluationsCount: data.recommendations[0]?.selectedTagsEvaluation?.length || 0,
                additionalProsCount: data.recommendations[0]?.additionalPros?.length || 0,
                consCount: data.recommendations[0]?.cons?.length || 0,
              });

              setRecommendations(data.recommendations);
              if (data.contextSummary) {
                setContextSummary(data.contextSummary);
              }
              setTargetProgress(100);
              setDisplayedProgress(100); // 완료 시 즉시 100%로

              // 재추천 바텀시트 채팅 내역 초기화 (새로운 추천 세션 시작)
              sessionStorage.removeItem('rerecommendation_state');

              // 100% 표시를 사용자가 볼 수 있도록 0.5초 대기 후 로딩 해제
              setTimeout(() => {
                setLoading(false);
              }, 500);
            } else if (data.type === 'context-summary') {
              // ✅ 최적화: Context Summary 별도 수신
              console.log('✅ Context Summary received!');
              console.log('  Priority attributes:', data.contextSummary?.priorityAttributes?.length);
              console.log('  Additional context:', data.contextSummary?.additionalContext?.length);

              // 세션 업데이트
              const updatedSession = loadSession();
              updatedSession.contextSummary = data.contextSummary;
              saveSession(updatedSession);

              // 화면에 표시
              setContextSummary(data.contextSummary);
            } else if (data.progress !== undefined) {
              // 진행 상황 업데이트
              console.log(`📊 Progress: [${data.progress}%] ${data.phase} - ${data.message}`);
              setTargetProgress(data.progress);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to get recommendation:', error);
      setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다');
      setLoading(false);
    }
  };

  // Tag-based recommendations (from anchor + tags flow)
  const fetchRecommendationsV2 = async (category: string, anchorId: string) => {
    let fakeProgressInterval: NodeJS.Timeout | null = null;

    try {
      // 초기화 - 0%에서 시작
      setLoading(true);
      setTargetProgress(0);
      setDisplayedProgress(0);
      setError('');

      // Get tag selections from sessionStorage
      const selectionsJson = sessionStorage.getItem('tag_selections');
      if (!selectionsJson) {
        throw new Error('선택 정보를 찾을 수 없습니다');
      }

      const selections = JSON.parse(selectionsJson);

      // 단계 1: 0% → 15% (시작)
      await new Promise(resolve => setTimeout(resolve, 200));
      setTargetProgress(15);

      // 단계 2: 15% → 65% (데이터 준비 - 길게)
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTargetProgress(65);

      // 단계 3: API 호출 중 fake progress 시작 (65% → 75%까지 천천히)
      let currentFakeProgress = 65;
      fakeProgressInterval = setInterval(() => {
        if (currentFakeProgress < 75) {
          currentFakeProgress += 1;
          setTargetProgress(currentFakeProgress);
        }
      }, 500); // 500ms마다 1%씩 증가 (10초 동안 10% 증가)

      // 단계 3: API 호출 시작
      const response = await fetch('/api/recommend-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          anchorId,
          selectedProsTags: selections.selectedPros,
          selectedConsTags: selections.selectedCons,
          budget: selections.budget,
        }),
      });

      // Fake progress 중지
      if (fakeProgressInterval) {
        clearInterval(fakeProgressInterval);
        fakeProgressInterval = null;
      }

      // 단계 4: 75% (API 응답 수신)
      setTargetProgress(75);
      await new Promise(resolve => setTimeout(resolve, 300));

      const data = await response.json();

      // 단계 5: 75% → 85% (데이터 수신 완료)
      await new Promise(resolve => setTimeout(resolve, 400));
      setTargetProgress(85);

      if (data.success) {
        // Comparative analysis is now loaded lazily in the background
        // (removed from initial response for faster load time)

        // Convert v2 recommendations - 쓸모없는 변환 제거, API 데이터 그대로 전달
        const convertedRecommendations: Recommendation[] = data.recommendations.map((rec: any, index: number) => {
          return {
            product: {
              id: String(rec.productId),
              title: rec.모델명,
              brand: rec.브랜드,
              price: rec.최저가 || 0,
              reviewUrl: rec.썸네일 || '',
              thumbnail: rec.썸네일 || '',
              reviewCount: rec.reviewCount || 0,
              averageRating: rec.averageRating || 0, // From API response (same as PDP modal logic)
              ranking: rec.순위 || (index + 1),
              category: category as ProductCategory, // Add category from URL param
              coreValues: {
                temperatureControl: 0,
                hygiene: 0,
                material: 0,
                usability: 0,
                portability: 0,
                priceValue: 0,
                durability: 0,
                additionalFeatures: 0,
              },
            },
            rank: (index + 1) as 1 | 2 | 3,
            finalScore: rec.fitScore,

            // API 데이터 그대로 전달 (변환 X)
            reasoning: rec.reasoning || '',
            selectedTagsEvaluation: rec.selectedTagsEvaluation || [],
            additionalPros: rec.additionalPros || [],
            cons: rec.cons || [],
            anchorComparison: rec.anchorComparison || '',
            purchaseTip: rec.purchaseTip,
            citedReviews: rec.citedReviews || [],
          };
        });

        // 단계 6: 85% → 92% (데이터 변환)
        await new Promise(resolve => setTimeout(resolve, 350));
        setTargetProgress(92);

        setRecommendations(convertedRecommendations);
        setAnchorProduct(data.anchorProduct);
        setCurrentCategory(category); // Save category for search

        // Set contextSummary if available
        if (data.contextSummary) {
          setContextSummary(data.contextSummary);
          console.log('✅ Context summary received:', data.contextSummary);
        }

        // Save to session for caching
        const session = loadSession();
        session.recommendations = convertedRecommendations;
        session.anchorProduct = data.anchorProduct;
        session.contextSummary = data.contextSummary;
        // Save full tag objects (not just IDs) to preserve attributes for re-filtering
        session.selectedProsTags = selections.selectedPros;
        session.selectedConsTags = selections.selectedCons;
        session.budget = selections.budget;
        saveSession(session);
        console.log('💾 Saved tag-based recommendations to session cache');

        // ✨ V2 플로우 추천 결과 로깅
        if (convertedRecommendations && convertedRecommendations.length > 0) {
          const productIds = convertedRecommendations.map(r => r.product.id);
          const fullReport = {
            userContext: data.contextSummary ? {
              priorityAttributes: data.contextSummary.priorityAttributes,
              additionalContext: data.contextSummary.additionalContext,
              budget: data.contextSummary.budget,
            } : undefined,
            recommendations: convertedRecommendations.map(r => ({
              rank: r.rank,
              productId: r.product.id,
              productTitle: r.product.title,
              price: r.product.price,
              finalScore: r.finalScore,
              strengths: r.additionalPros?.map(p => p.text) || [],
              weaknesses: r.cons?.map(c => c.text) || [],
              comparison: r.anchorComparison ? [r.anchorComparison] : [],
              additionalConsiderations: r.purchaseTip?.map(tip => tip.text).join('; ') || '',
            })),
          };

          // V2 플로우 추천 결과 로깅
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: localStorage.getItem('baby_item_session_id'),
              eventType: 'recommendation_received',
              page: 'result',
              recommendations: {
                productIds,
                fullReport,
                isV2Flow: true, // V2 플로우임을 표시
                category: category,
                anchorProductId: data.anchorProduct?.productId,
              },
            }),
          }).catch(console.error);

          console.log('📊 V2 추천 결과 로깅 완료:', productIds);
        }

        // 재추천 바텀시트 채팅 내역 초기화 (새로운 추천 세션 시작)
        sessionStorage.removeItem('rerecommendation_state');

        // 단계 7: 92% → 100% (완료)
        await new Promise(resolve => setTimeout(resolve, 400));
        setTargetProgress(100);
        setDisplayedProgress(100);

        // 100% 표시를 사용자가 볼 수 있도록 0.5초 대기 후 로딩 해제
        setTimeout(() => {
          setLoading(false);
        }, 500);

        // Load comparative analysis in the background for better UX
        console.log('⏳ Loading comparative analysis in background...');
        fetch('/api/comparative-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            top3: data.recommendations.slice(0, 3),
            anchorProduct: data.anchorProduct,
            category,
            prosTexts: selections.selectedPros.map((tag: { text: string }) => tag.text),
            consTexts: selections.selectedCons.map((tag: { text: string }) => tag.text),
          }),
        })
          .then(res => res.json())
          .then(analysisData => {
            if (analysisData.success) {
              sessionStorage.setItem('comparative_analysis', JSON.stringify(analysisData.analysis));
              setComparativeAnalysis(analysisData.analysis);
              console.log(`✅ Comparative analysis loaded in ${analysisData.processingTime}ms (background)`);
            }
          })
          .catch(err => {
            console.warn('⚠️ Failed to load comparative analysis (non-blocking):', err);
          });
      } else {
        setError(data.error || '추천 생성 실패');
        setLoading(false);
      }
    } catch (err) {
      // Cleanup fake progress interval on error
      if (fakeProgressInterval) {
        clearInterval(fakeProgressInterval);
        fakeProgressInterval = null;
      }

      const errorMessage = err instanceof Error ? err.message : '추천을 불러오는 중 오류가 발생했습니다';
      setError(errorMessage);
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;

    // Check for tag-based flow (from Categories → Anchor → Tags)
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');
    const anchorId = urlParams.get('anchorId');
    const tagSelectionsJson = sessionStorage.getItem('tag_selections');

    if (category && anchorId && tagSelectionsJson) {
      console.log('🎯 [Branch 0] Tag-based flow detected - using recommend-v2');
      setIsTagBasedFlow(true);
      setCurrentCategory(category);

      // Check for cached recommendations first
      const session = loadSession();
      if (session.recommendations && session.recommendations.length > 0 && session.anchorProduct) {
        console.log('✓ [Branch 0-Cached] Using cached tag-based recommendations (NO API call)');
        setRecommendations(session.recommendations);
        setAnchorProduct(session.anchorProduct);

        // Load cached contextSummary
        if (session.contextSummary) {
          setContextSummary(session.contextSummary);
          console.log('✓ Loaded cached context summary');
        }

        // Load cached comparative analysis
        const cachedAnalysis = sessionStorage.getItem('comparative_analysis');
        if (cachedAnalysis) {
          setComparativeAnalysis(JSON.parse(cachedAnalysis));
          console.log('✓ Loaded cached comparative analysis');
        }

        setLoading(false);
        return;
      }

      // No cache, fetch new recommendations
      console.log('🚀 [Branch 0-Fetch] Fetching new tag-based recommendations');
      fetchRecommendationsV2(category, anchorId);
      return;
    }

    const session = loadSession();

    // 디버깅: 세션 상태 로그 (상세)
    console.log('📊 Result page useEffect - Session state:', {
      isQuickRecommendation: session.isQuickRecommendation,
      forceRegenerate: session.forceRegenerate,
      hasRecommendations: !!(session.recommendations && session.recommendations.length > 0),
      recommendationsCount: session.recommendations?.length || 0,
      phase: session.phase,
      messagesCount: session.messages?.length || 0,
    });

    // Quick Recommendation 플로우는 항상 새로 생성
    if (session.isQuickRecommendation) {
      console.log('🚀 [Branch 1] Quick Recommendation flow - generating new recommendations');
      // 플래그 리셋 (한 번만 실행되도록)
      session.isQuickRecommendation = false;
      saveSession(session);
      fetchRecommendations();
      return;
    }

    // forceRegenerate 플래그가 있으면 캐시 무시하고 새로 생성 (채팅 후 추천받기)
    if (session.forceRegenerate) {
      console.log('🚀 [Branch 2] Force regenerate - generating new recommendations (from chat)');
      // 플래그 리셋
      session.forceRegenerate = false;
      saveSession(session);
      fetchRecommendations();
      return;
    }

    // 일반 플로우: 이미 추천 결과가 있으면 바로 표시
    if (session.recommendations && session.recommendations.length > 0) {
      console.log('✓ [Branch 3] Using cached recommendations from session (NO API call)');
      setRecommendations(session.recommendations);
      if (session.contextSummary) {
        setContextSummary(session.contextSummary);
      }
      setLoading(false);
      return;
    }

    // 추천 결과가 없으면 API 호출
    console.log('🚀 [Branch 4] No cached recommendations - fetching new ones');
    fetchRecommendations();
  }, [mounted]);

  // 비교표 데이터 프리페치 (recommendations 로드 시 한 번만)
  useEffect(() => {
    if (recommendations.length > 0 && Object.keys(comparisonFeatures ?? {}).length === 0 && Object.keys(comparisonDetails ?? {}).length === 0) {
      // Tag-based flow: Include anchor product (4 products total)
      // Normal flow: Top 3 recommendations only
      const productIds = isTagBasedFlow && anchorProduct
        ? [String(anchorProduct.productId), ...recommendations.slice(0, 3).map(rec => rec.product.id)]
        : recommendations.slice(0, 3).map(rec => rec.product.id);

      console.log('🔄 Prefetching comparison data...', { isTagBasedFlow, productCount: productIds.length, category: currentCategory });

      // 핵심 특징 가져오기
      fetch('/api/compare-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      })
        .then(res => res.json())
        .then(data => {
          setComparisonFeatures(data.features);
          console.log('✅ Comparison features cached');
        })
        .catch(err => console.error('Failed to prefetch features:', err));

      // 장단점 가져오기
      fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds, category: currentCategory }),
      })
        .then(res => res.json())
        .then(data => {
          setComparisonDetails(data.productDetails);
          console.log('✅ Comparison details cached');
        })
        .catch(err => console.error('Failed to prefetch details:', err));
    }
  }, [recommendations, comparisonFeatures, comparisonDetails, isTagBasedFlow, anchorProduct, currentCategory]);

  // 다나와 가격 정보 백그라운드 로딩
  useEffect(() => {
    if (!loading && recommendations.length > 0) {
      console.log('💰 Fetching Danawa price data in parallel...');

      // 병렬 처리를 위해 Promise.all 사용
      const fetchAllDanawaData = async () => {
        await Promise.all(
          recommendations.map(async (rec) => {
            const productId = rec.product.id;
            // 브랜드 + 제목 (띄어쓰기 기준 최대 5개 단어)
            // 제목에 이미 브랜드가 포함되어 있으면 중복 방지
            let titleForQuery = rec.product.title;
            if (rec.product.brand && rec.product.title.toLowerCase().startsWith(rec.product.brand.toLowerCase())) {
              titleForQuery = rec.product.title.substring(rec.product.brand.length).trim();
            }
            const titleWords = titleForQuery.split(' ').slice(0, 5).join(' ');
            const query = rec.product.brand ? `${rec.product.brand} ${titleWords}` : titleWords;
            console.log(`🔍 [Danawa Query] ${rec.product.title} → "${query}"`);

            // 로딩 상태 설정
            setDanawaData((prev) => ({
              ...prev,
              [productId]: { lowestPrice: 0, lowestMall: '', productName: '', prices: [], loading: true }
            }));

            try {
              const response = await fetch('/api/danawa/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
              });

              const data = await response.json();

              if (data.success && data.data) {
                setDanawaData((prev) => ({
                  ...prev,
                  [productId]: {
                    lowestPrice: data.data.lowestPrice || 0,
                    lowestMall: data.data.lowestMall || '',
                    productName: data.data.name || '',
                    prices: data.data.prices || [],
                    loading: false,
                  }
                }));
                console.log(`✅ Danawa data fetched for: ${rec.product.title} (${data.data.lowestPrice?.toLocaleString()}원)`);
              } else {
                // 실패 시 로딩 상태 해제
                setDanawaData((prev) => ({
                  ...prev,
                  [productId]: { lowestPrice: 0, lowestMall: '', productName: '', prices: [], loading: false }
                }));
                console.warn(`⚠️ Failed to fetch Danawa data for: ${query}`);
              }
            } catch (error) {
              console.error(`Failed to fetch Danawa data for ${query}:`, error);
              setDanawaData((prev) => ({
                ...prev,
                [productId]: { lowestPrice: 0, lowestMall: '', productName: '', prices: [], loading: false }
              }));
            }
          })
        );
        console.log('✅ All Danawa data fetched in parallel');
      };

      fetchAllDanawaData();
    }
  }, [loading, recommendations]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="relative w-full max-w-[480px] min-h-screen bg-white" />
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen items-center justify-center ${loading ? 'bg-[#FBFCFC]' : 'bg-white'}`}>
      <div className={`relative w-full max-w-[480px] min-h-screen flex flex-col ${loading ? 'bg-[#FBFCFC]' : 'bg-white'}`}>
        {/* Header - 로딩 중에도 공간 차지하지만 보이지 않음 */}
        <header
          className={`px-3 py-3 transition-colors duration-300 ${
            loading
              ? 'bg-[#FBFCFC] border-b border-transparent'
              : 'bg-white border-b border-gray-200'
          }`}
        >
          <div className={`flex items-center justify-between transition-opacity duration-300 ${
            loading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}>
            <h1 className="text-base font-bold text-gray-900">추천 결과</h1>
            <button
              onClick={() => {
                logButtonClick('다시하기', 'result');
                clearSession(); // 세션 완전 초기화
                router.push('/');
              }}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              처음으로
            </button>
          </div>
        </header>



        {/* Main Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto px-2 pb-14">
          {/* AI 말풍선 - 헤더 바로 아래 */}
          {!loading && recommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-4 mb-4"
            >
              <div className="bg-white rounded-2xl p-1" style={{ borderColor: '#E5F1FF' }}>
                <div className="flex items-start gap-2">
                
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 font-medium leading-normal">
                      입력하신 조건에 맞는 제품을 추천해드렸어요!<br />
                      상세 분석을 확인하고 구매해보세요.
                    </p>
                  </div>
                </div>
              </div>

              {/* 스크롤 버튼들 */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={scrollToComparison}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  📊 상세 비교표 보기
                </button>
                <button
                  onClick={scrollToUserContext}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  📋 내 구매 기준 보기
                </button>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {loading ? (
              // 로딩 상태 - 심플한 디자인
              <motion.div
                key="loading"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-8"
              >
              {/* 캐릭터 애니메이션 - Video */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ opacity: { duration: 0.5 } }}
                className="mb-8"
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ width: 120, height: 120 }}
                  className="object-contain"
                >
                  <source src="/animations/character.mp4" type="video/mp4" />
                </video>
              </motion.div>

              {/* 로딩 퍼센트 */}
              <div className="mb-2">
                <p className="text-xl font-medium text-gray-900">
                  {displayedProgress}%
                </p>
              </div>

              {/* 실시간 타이머 */}
              <p className="text-sm text-gray-500 mb-8 font-mono">
                {elapsedTime.toFixed(2)}s
              </p>

              {/* 순차적 상태 메시지 */}
              <motion.div
                key={currentPhaseIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <p className="text-base font-medium shimmer-text">
                  {phaseMessages[currentPhaseIndex]}
                </p>
              </motion.div>
              </motion.div>
            ) : error || (!recommendations || recommendations.length === 0) ? (
            // 결과 없음 또는 에러
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <div className="text-6xl mb-4">😔</div>
              <p className="text-gray-900 font-semibold text-lg mb-2">
                추천 결과가 없습니다
              </p>
              <p className="text-gray-600 text-center mb-4 text-sm">
                {error || '추천 결과를 생성하는 중 오류가 발생했습니다.'}
                <br />
                다시 시도해 주세요.
              </p>
              <button
                onClick={() => {
                  logButtonClick('추천 다시 시도하기', 'result');
                  fetchRecommendations();
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-semibold"
              >
                다시 시도하기
              </button>
            </div>
          ) : (
            // 추천 결과 표시
            <div className="space-y-4">
              {/* Top 3 섹션 시작 - 스크롤 타겟 */}
              <div id="top3-section" />
              

            
              {/* <div className="flex flex-col items-center mb-0">
                <div className="relative flex items-center justify-center gap-2">
                  <Image
                    src="/images/compairimg-removebg.png"
                    alt="비교 분석"
                    width={120}
                    height={120}
                    className="w-[120px] h-[120px] object-contain"
                    priority
                    quality={90}
                    sizes="120px"
                  />

                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="relative"
                  >
                    <div className="bg-white text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap border" style={{ color: '#71737C', borderColor: '#E5F1FF' }}>
                      광고 아닌 실구매자 리뷰만<br />분석했어요!
                    </div>
                    <div
                      className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white"
                      style={{ filter: 'drop-shadow(-1px 0px 1px rgba(0, 0, 0, 0.05))' }}
                    ></div>
                  </motion.div>
                </div>
              </div> */}

              {/* 채팅하고 더 정확히 추천받기 버튼 - 주석 처리 (나중에 사용 가능) */}
              {/* <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="space-y-3 mb-8"
              >
                <button
                  onClick={() => {
                    logButtonClick('채팅하고 더 정확히 추천받기', 'result');

                    // 세션 스토리지에서 현재 세션 불러오기
                    const sessionData = sessionStorage.getItem('babyitem_session');
                    if (sessionData) {
                      const session = JSON.parse(sessionData);
                      // forceRegenerate 플래그 설정 (채팅 후 새로운 추천 받기 위함)
                      session.forceRegenerate = true;
                      sessionStorage.setItem('babyitem_session', JSON.stringify(session));
                    }
                    // chat 페이지로 이동
                    router.push('/chat');
                  }}
                  className="w-full h-14 text-base font-bold rounded-2xl transition-all hover:opacity-90 flex items-center justify-center gap-2.5 border-2"
                  style={{ backgroundColor: '#F0F7FF', color: '#0074F3', borderColor: '#B8DCFF' }}
                >
                  <span>채팅하고 더 정확히 추천받기</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1" style={{ backgroundColor: '#4A9EFF', color: '#FFFFFF' }}>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    <span>AI</span>
                  </span>
                </button>
              </motion.div> */}

              {/* 통합된 컨텐츠 - 탭 제거 */}
              <div className="space-y-4 mb-8">

                    {/* 점수 설명 섹션 */}
                    {recommendations.length > 0 && recommendations[0].selectedTagsEvaluation && recommendations[0].selectedTagsEvaluation.length > 0 && (() => {
                      const hasConsTags = recommendations[0].selectedTagsEvaluation.some(tag => tag.tagType === 'cons');
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="py-3 px-2 mb-0"
                        >
                          <div className="flex items-center gap-5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-gray-500">장점 충족도</span>
                              <div className="w-4 h-4 rounded-full border-2 border-green-500"></div>
                            </div>
                            {hasConsTags && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-gray-500">개선점 반영도</span>
                                <div className="w-4 h-4 rounded-full border-2 border-blue-500"></div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })()}

                    {/* 추천 상품 3개 */}
                    {recommendations.map((rec, index) => (
                      <motion.div
                        key={rec.product.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.2 }}
                        layout
                        onClick={() => {
                          logButtonClick(`제품 카드 클릭: ${rec.product.title}`, 'result');
                          setSelectedProductForModal(rec);
                          window.history.pushState({}, '', `/product/${rec.product.id}`);
                        }}
                        className="relative bg-white py-4 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        {/* 클릭 어포던스 - 우상단 chevron */}
                        <div className="absolute top-4 right-3 text-gray-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>

                        {/* 제품 정보 */}
                        <div className="flex gap-3 mb-0">
                          {/* 제품 썸네일 */}
                          <div className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
                            {rec.product.thumbnail ? (
                              <Image
                                src={rec.product.thumbnail}
                                alt={rec.product.title}
                                width={112}
                                height={112}
                                className="w-full h-full object-cover"
                                priority={index === 0}
                                quality={90}
                                sizes="112px"
                              />
                            ) : (
                              <div className="w-full h-full bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* 랭킹 배지 - 좌측 상단 */}
                            <div className="absolute top-0 left-0 h-7 px-2 bg-gray-900 rounded-tl-xl rounded-tr-none rounded-bl-none rounded-br-md flex items-center justify-center">
                              <span className="text-white font-semibold text-xs">
                                {rec.rank}
                              </span>
                            </div>
                          </div>

                          {/* 제품 상세 정보 */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                            {/* 브랜드 */}
                            {rec.product.brand && (
                              <div className="text-sm text-gray-500 font-medium mb-0">
                                {rec.product.brand}
                              </div>
                            )}
                            <h3 className="font-semibold text-gray-900 text-base mb-1 leading-tight line-clamp-2">
                              {rec.product.title}
                            </h3>
                            <div className="flex items-start justify-between gap-2">
                              {/* 왼쪽 컬럼: 가격 + 별점 + 다나와 최저가 */}
                              <div className="space-y-0">
                                <p className="text-lg font-bold text-gray-900">
                                  {rec.product.price.toLocaleString()}<span className="text-sm">원</span>
                                </p>
                                {/* 다나와 최저가 배지 */}
                                {(() => {
                                  const danawa = danawaData[rec.product.id];
                                  if (danawa?.loading) {
                                    return (
                                      <div className="flex items-center gap-1 text-xs text-gray-400">
                                        <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                                        <span>최저가 확인 중...</span>
                                      </div>
                                    );
                                  }
                                  if (danawa && danawa.lowestPrice > 0) {
                                    return (
                                      <div className="flex items-center gap-1 text-xs">
                                        <span className="text-red-600 font-medium">최저</span>
                                        <span className="text-red-600 font-medium">{danawa.lowestPrice.toLocaleString()}원</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}

                                {/* 별점 평균 + 리뷰수 */}
                                <div className="flex items-center gap-0.5">
                                  <svg
                                    className="w-3 h-3 text-yellow-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  <span className="text-xs font-semibold text-gray-900">
                                    {(rec.product.averageRating ?? 0) > 0 ? rec.product.averageRating!.toFixed(1) : '—'}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    ({rec.product.reviewCount.toLocaleString()})
                                  </span>
                                </div>
                              </div>

                              {/* 오른쪽: 원형 프로그레스바 */}
                              {rec.selectedTagsEvaluation && rec.selectedTagsEvaluation.length > 0 && (() => {
                                const prosTags = rec.selectedTagsEvaluation.filter(tag => tag.tagType === 'pros');
                                const consTags = rec.selectedTagsEvaluation.filter(tag => tag.tagType === 'cons');

                                // 점수 계산: 충족=1.0, 부분충족=0.5, 불충족=0.0
                                const prosScore = prosTags.reduce((sum, tag) => {
                                  if (tag.status === '충족') return sum + 1.0;
                                  if (tag.status === '부분충족') return sum + 0.5;
                                  return sum;
                                }, 0);

                                // 점수 계산: 회피됨=1.0, 부분회피=0.5, 회피안됨=0.0
                                const consScore = consTags.reduce((sum, tag) => {
                                  if (tag.status === '회피됨') return sum + 1.0;
                                  if (tag.status === '부분회피') return sum + 0.5;
                                  return sum;
                                }, 0);

                                const prosTotal = prosTags.length;
                                const consTotal = consTags.length;

                                return (
                                  <div className="flex items-center gap-2">
                                    {prosTags.length > 0 && (
                                      <CircularProgress score={prosScore} total={prosTotal} color="green" />
                                    )}
                                    {consTags.length > 0 && (
                                      <CircularProgress score={consScore} total={consTotal} color="blue" />
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* AI 추천 이유 */}
                        <div className="mt-3">
                          <div className="rounded-xl p-3 bg-[#F3E6FD]">
                            <div className="flex items-start gap-2">
                              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24">
                                <defs>
                                  <linearGradient id="sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#9325FC" />
                                    <stop offset="50%" stopColor="#C750FF" />
                                    <stop offset="100%" stopColor="#C878F7" />
                                  </linearGradient>
                                </defs>
                                <path fill="url(#sparkle-gradient)" d="M12 2L15.5 12L12 22L8.5 12Z M2 12L12 8.5L22 12L12 15.5Z" />
                              </svg>
                              <p className="text-sm text-gray-700 leading-normal flex-1">
                                {parseMarkdownBold(rec.reasoning)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                {/* 상세 비교표 - 스크롤 타겟 */}
                <div id="comparison-section" className="mt-8">
                  <DetailedComparisonTable
                    recommendations={recommendations}
                    cachedFeatures={comparisonFeatures}
                    cachedDetails={comparisonDetails}
                    showScore={false}
                    anchorProduct={isTagBasedFlow ? anchorProduct : undefined}
                    isTagBasedFlow={isTagBasedFlow}
                    category={currentCategory || undefined}
                    onProductClick={(rec) => {
                      setSelectedProductForModal(rec);
                      window.history.pushState({}, '', `/product/${rec.product.id}`);
                    }}
                    onAnchorChange={(newAnchorProduct) => {
                      console.log('🔄 Anchor product changed:', newAnchorProduct);

                      // 앵커 제품 상태 업데이트
                      setAnchorProduct(newAnchorProduct);

                      // 비교표 캐시 초기화 (새로운 앵커로 재생성되도록)
                      setComparisonFeatures({});
                      setComparisonDetails({});

                      // 세션 스토리지에 저장
                      const sessionData = sessionStorage.getItem('babyitem_session');
                      if (sessionData) {
                        const session = JSON.parse(sessionData);
                        session.anchorProduct = newAnchorProduct;
                        sessionStorage.setItem('babyitem_session', JSON.stringify(session));
                      }

                      // 로깅
                      logButtonClick(`기준제품_변경완료_${newAnchorProduct.브랜드}_${newAnchorProduct.모델명}`, 'result');
                    }}
                  />
                </div>

                {/* 사용자 맥락 요약 - 상세 비교표 아래로 이동 */}
                <div id="user-context-section" className="mt-3">
                  {/* 섹션 구분 디바이더 */}
                  <div className="h-4 bg-gray-100 -mx-2 mb-4"></div>

                  {contextSummary ? (
                    <UserContextSummaryComponent summary={contextSummary} />
                  ) : (
                    /* ✅ 최적화: Context Summary 로딩 스켈레톤 */
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="bg-white rounded-2xl p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-5 w-28 bg-gray-200 rounded-md animate-pulse" />
                        <div className="h-7 w-14 bg-gray-100 rounded-full animate-pulse" />
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                        <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          )}
          </AnimatePresence>
        </main>

        {/* 플로팅 ChatInputBar 제거 - ReRecommendationBottomSheet가 항상 표시됨 */}

        {/* 비교 질문하기 채팅 바텀시트 - 주석 처리 (사용률 낮음) */}
        {/* <AnimatePresence>
          {isChatOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setIsChatOpen(false)}
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white rounded-t-3xl z-50 flex flex-col"
                style={{ height: '85vh' }}
              >
                <div className="flex justify-center pt-4 pb-2">
                  <div className="w-12 h-1 bg-gray-300 rounded-full" />
                </div>

                <div className="px-3 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-bold text-gray-900">비교 질문하기</h2>
                    <button
                      onClick={() => setIsChatOpen(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {recommendations.slice(0, 3).map((rec) => (
                      <div key={rec.product.id} className="flex flex-col flex-1 bg-gray-50 rounded-lg p-2.5">
                        <span className="font-semibold text-gray-900 line-clamp-2 text-xs leading-tight mb-1">{rec.product.title}</span>
                        <span className="text-xs font-bold text-gray-700">{rec.product.price.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`flex-1 px-3 py-4 ${messages.length === 0 ? '' : 'overflow-y-auto'}`}>
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full px-4">
                    </div>
                  )}

                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div
                        key={message.id || message.content}
                        className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] px-3 py-3 ${
                            message.role === 'user'
                              ? 'bg-gray-100 text-gray-900 rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl'
                              : 'text-gray-900'
                          }`}
                        >
                          <div className="text-base whitespace-pre-wrap">
                            {message.role === 'assistant' && message.id === typingMessageId ? (
                              <TypingMessage
                                content={message.content}
                                onComplete={() => setTypingMessageId(null)}
                              />
                            ) : (
                              message.role === 'assistant' ? formatMarkdown(message.content) : message.content
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {isLoadingMessage && (
                      <div className="w-full flex justify-start">
                        <div className="px-4 py-3">
                          <div className="shimmer-text text-base">
                            생각하는 중...
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {!isLoadingMessage && messages.length === 0 && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-3 bg-white">
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        "가장 세척하기 편한 제품은?",
                        "소음이 가장 적은 제품은?",
                        "휴대성이 가장 좋은 제품은?",
                        "가격 대비 가장 좋은 제품은?"
                      ].map((query, index) => (
                        <button
                          key={index}
                          onClick={() => handleQuickQuestion(query)}
                          disabled={isLoadingMessage}
                          className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {query}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-3 py-4 bg-white">
                  <ChatInputBar
                    value={inputValue}
                    onChange={(value) => setInputValue(value)}
                    onSend={handleSendMessage}
                    placeholder="비교하는 질문을 입력해보세요"
                    disabled={isLoadingMessage}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence> */}

        {/* 재추천 바텀시트 - 주석 처리 (사용률 낮음) */}
        {/* <ReRecommendationBottomSheet
          isOpen={!loading && recommendations.length > 0}
          onClose={() => {}}
          currentRecommendations={recommendations}
          pdpInput={pdpRecommendInput}
          onNewRecommendations={(newRecs) => {
            setRecommendations(newRecs);
            setComparisonFeatures({});
            setComparisonDetails({});
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onContextSummaryUpdate={(newContextSummary) => {
            console.log('🔄 Context Summary updated from background');
            setContextSummary(newContextSummary);
          }}
        /> */}


        {/* 다시 추천받기 버튼들 */}
        {!loading && recommendations.length > 0 && (
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
                border-radius: 9999px;
                background: #111827;
                overflow: hidden;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
              }

              .gradient-border-button::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 9999px;
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
              {showExitConfirmModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
                  onClick={() => {
                    logButtonClick('배경 클릭 - 다시 추천받기 닫기', 'result');
                    setShowExitConfirmModal(false);
                  }}
                />
              )}
            </AnimatePresence>

            <div className="fixed bottom-6 left-0 right-0 flex flex-col items-end gap-3 z-50 px-4">
              <AnimatePresence>
                {showExitConfirmModal && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex flex-col gap-3"
                  >
                    {/* 다른 카테고리 추천받기 버튼 */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        logButtonClick('다른 카테고리 추천받기', 'result');
                        // 세션 클리어
                        sessionStorage.removeItem('tag_selections');
                        sessionStorage.removeItem('tag_conversation_state');
                        sessionStorage.removeItem('comparative_analysis');
                        clearSession();
                        router.push('/categories');
                      }}
                      className="py-4 px-6 bg-white hover:bg-gray-50 text-gray-900 rounded-full shadow-lg font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
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
                        const categoryName = currentCategory && CATEGORY_NAMES[currentCategory as ProductCategory]
                          ? CATEGORY_NAMES[currentCategory as ProductCategory]
                          : '현재 카테고리';

                        logButtonClick(`${categoryName} 다시 추천받기`, 'result');

                        // 세션 클리어 (새로운 선택 시작)
                        sessionStorage.removeItem('tag_selections');
                        sessionStorage.removeItem('tag_conversation_state');
                        sessionStorage.removeItem('comparative_analysis');

                        // Tags 페이지로 이동 (skipGuide=true)
                        router.push(`/tags?category=${currentCategory}&skipGuide=true`);
                      }}
                      className="py-4 px-6 bg-white hover:bg-gray-50 text-gray-900 rounded-full shadow-lg font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>
                        {currentCategory && CATEGORY_NAMES[currentCategory as ProductCategory]
                          ? `${CATEGORY_NAMES[currentCategory as ProductCategory]} 다시 추천받기`
                          : '다시 추천받기'}
                      </span>
                    </motion.button>

                    {/* 취소 버튼 */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        logButtonClick('취소', 'result');
                        setShowExitConfirmModal(false);
                      }}
                      className="py-4 px-6 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg font-semibold transition-colors whitespace-nowrap"
                    >
                      취소
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 메인 버튼 - 다시 추천받기 (회전하는 그라데이션 테두리) */}
              {!showExitConfirmModal && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    duration: 0.1,
                    ease: 'easeInOut'
                  }}
                  className="max-w-[440px]"
                >
                  <div className="gradient-border-button">
                    <button
                      onClick={() => {
                        logButtonClick('다시 추천받기 열기', 'result');
                        setShowExitConfirmModal(true);
                      }}
                      className="gradient-border-button-inner"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22l-.394-1.433a2.25 2.25 0 00-1.423-1.423L13.25 19l1.433-.394a2.25 2.25 0 001.423-1.423L16.5 16l.394 1.433a2.25 2.25 0 001.423 1.423L19.75 19l-1.433.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                      <span>다시 추천받기</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </>
        )}

        {/* Product Detail Modal */}
        <AnimatePresence>
          {selectedProductForModal && (
            <ProductDetailModal
              productData={selectedProductForModal}
              productComparisons={
                comparativeAnalysis?.productComparisons
                  ? comparativeAnalysis.productComparisons[`rank${selectedProductForModal.rank}` as 'rank1' | 'rank2' | 'rank3']
                  : undefined
              }
              category={currentCategory || 'milk_powder_port'}
              danawaData={
                danawaData[selectedProductForModal.product.id] && !danawaData[selectedProductForModal.product.id].loading
                  ? {
                      lowestPrice: danawaData[selectedProductForModal.product.id].lowestPrice,
                      lowestMall: danawaData[selectedProductForModal.product.id].lowestMall,
                      productName: danawaData[selectedProductForModal.product.id].productName,
                      prices: danawaData[selectedProductForModal.product.id].prices || [],
                    }
                  : undefined
              }
              onClose={() => {
                setSelectedProductForModal(null);
                window.history.back();
              }}
              // onReRecommend={handlePDPReRecommend} // Temporarily disabled for testing
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
